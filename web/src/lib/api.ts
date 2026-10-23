import * as inbox from './inbox';
import * as mock from './mock';
import type { ChatRequest, DocMeta, PublicDoc, StreamEvent, Topic, Trend, UploadInput } from './types';

const configuredApi = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
// En desarrollo Vite reenvía las llamadas: evita bloqueos CORS entre puertos locales.
const API = import.meta.env.DEV && /^https?:\/\//.test(configuredApi) ? '/__yachi_api' : configuredApi;
/** Sin VITE_API_URL el frontend funciona con el simulador (mock.ts). */
export const MOCK = !API;
/** Nombres que usa la vista del chat y del Portal: con backend todo es real; sin él, todo es de ejemplo. */
export const CHAT_MOCK = MOCK;
export const SAMPLE_DATA = MOCK;
export interface TranslationReportInput {
  messageId: string; lang: 'qu'; question: string; answer: string; fragment: string; correction: string;
}
export interface TranslationReportSaved { id: string; status: 'pending_review'; storage: 'server' | 'local' }
export async function sendTranslationReport(report: TranslationReportInput): Promise<TranslationReportSaved> {
  if (CHAT_MOCK) {
    const key = 'yt-translation-reports';
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(stored)) throw new Error('Invalid report storage');
    if (stored.length >= 100) throw new Error('Local report storage full');
    const saved = { ...report, id: crypto.randomUUID(), status: 'pending_review' as const, at: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify([...stored, saved]));
    return { id: saved.id, status: 'pending_review', storage: 'local' };
  }
  const saved = await json<{ id: string; status: 'pending_review' }>('/translation-reports', { method: 'POST', body: JSON.stringify(report) });
  if (!saved.id || saved.status !== 'pending_review') throw new Error('Unexpected report response');
  return { ...saved, storage: 'server' };
}

const ADMIN_TOKEN_KEY = 'yt-admin-token';
const adminToken = () => { try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ''; } catch { return ''; } };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}`, ...init?.headers } });
  if (!r.ok) {
    // FastAPI responde {"detail": "..."}: se muestra el mensaje, no el JSON.
    const raw = await r.text();
    let msg = raw || r.statusText;
    try { const d = (JSON.parse(raw) as { detail?: unknown }).detail; if (typeof d === 'string') msg = d; } catch { /* texto plano */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const connectionError = (lang: ChatRequest['lang']) => lang === 'en'
  ? 'Could not connect to the assistant. Check that the backend is running and try again.'
  : 'No se pudo conectar con el asistente. Comprueba que el backend esté activo e inténtalo de nuevo.';

/** Mensaje legible para un error del backend (FastAPI responde {"detail": ...}); traduce los códigos conocidos. */
async function responseError(response: Response, lang: ChatRequest['lang']): Promise<Error> {
  const body = await response.text().catch(() => '');
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === 'string') detail = parsed.detail;
  } catch { /* puede ser texto plano */ }
  const known: Record<string, [string, string]> = {
    database_unavailable: ['La base de datos no está disponible. Inténtalo de nuevo en unos minutos.', 'The database is unavailable. Please try again shortly.'],
    rag_index_empty: ['La base de documentos todavía no está indexada.', 'The document index is not ready yet.'],
  };
  const translated = known[detail];
  if (translated) return new Error(lang === 'en' ? translated[1] : translated[0]);
  if (response.status === 429 && !detail) detail = lang === 'en' ? 'You are sending too many messages. Please wait a minute.' : 'Estás enviando muchos mensajes seguidos. Espera un minuto y vuelve a intentarlo.';
  return new Error(detail || connectionError(lang));
}

/** Chat por SSE: POST /chat con ChatRequest y respuesta text/event-stream, un StreamEvent por bloque `data:`. */
export async function* streamChat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  if (MOCK) { yield* mock.mockChat(req, signal); return; }
  let r: Response;
  try {
    r = await fetch(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(req), signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error(connectionError(req.lang));
  }
  if (!r.ok) throw await responseError(r, req.lang);
  if (!r.body || !r.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error(req.lang === 'en' ? 'The backend returned an unexpected response.' : 'El backend devolvió una respuesta inesperada.');
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (data) yield JSON.parse(data) as StreamEvent;
    }
  }
}

/** Tendencias en el idioma pedido. El backend las agrupa por similitud semántica y las traduce una vez al día. */
export const getTrends = (lang: 'es' | 'en' | 'qu' = 'es'): Promise<Trend[]> =>
  MOCK ? Promise.resolve(mock.trends.map((t) => ({ ...t, query: lang === 'en' ? mock.trendsEn[t.query] ?? t.query : t.query }))) : json(`/trends?lang=${lang}`);

/** Voto de utilidad de una respuesta; alimenta la revisión semanal de respuestas marcadas como no útiles. */
export function sendFeedback(messageId: string, vote: 'up' | 'down', ctx?: { question: string; lang: 'es' | 'en' | 'qu'; reason?: inbox.FeedbackReason }): Promise<void> {
  if (MOCK) {
    // Un voto negativo también llega a la bandeja "Sin respuesta" para revisarlo.
    if (vote === 'down' && ctx) inbox.recordUnanswered(ctx.question, ctx.lang, 'voto_negativo', ctx.reason);
    return Promise.resolve();
  }
  return json('/feedback', { method: 'POST', body: JSON.stringify({ messageId, vote, reason: ctx?.reason }) }).then(() => undefined);
}

export type { FeedbackReason, InboxItem, InboxStatus, Inquiry } from './inbox';

/** Envía la pregunta sin respuesta a la dependencia responsable. Devuelve el código de seguimiento. */
export function sendInquiry(i: Omit<inbox.Inquiry, 'code' | 'at'>): Promise<inbox.Inquiry> {
  if (MOCK) return new Promise((r) => setTimeout(() => r(inbox.createInquiry(i)), 600));
  return json('/inquiries', { method: 'POST', body: JSON.stringify(i) });
}

// ---------- Bandeja "Sin respuesta" (administración) ----------
export const listInbox = (): Promise<inbox.InboxItem[]> => (MOCK ? Promise.resolve(inbox.listInbox()) : json('/admin/unanswered'));
export interface RegisteredInquiry {
  code: string; office: string; email: string; question: string; lang: string;
  transcript: string | null; status: 'nueva' | 'en_atencion' | 'resuelta'; created_at: string;
}
export const listInquiries = (): Promise<RegisteredInquiry[]> => MOCK ? Promise.resolve([]) : json('/admin/inquiries');

/** Uso real del modelo frente al tope de gasto (ANTHROPIC_BUDGET_USD) y estado del interruptor YACHI_LLM. */
export interface LlmUsage {
  llmOn: boolean; hasKey: boolean; active: boolean; model: string; budgetUsd: number; spentUsd: number; calls: number; answeredWithModel: number;
  bySource: { source: string; calls: number; inputTokens: number; outputTokens: number; usd: number }[];
}
export const getUsage = (): Promise<LlmUsage | null> => (MOCK ? Promise.resolve(null) : json('/admin/usage'));

/** Bitácora del Portal: quién cambió la base de conocimiento y cuándo (últimas 200 acciones). */
export interface AuditEntry { at: string; email: string; action: string; target: string | null }
export const listAudit = (): Promise<AuditEntry[]> => (MOCK ? Promise.resolve([]) : json('/admin/audit'));
export const updateInquiry = (code: string, status: RegisteredInquiry['status']): Promise<void> =>
  json(`/admin/inquiries/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
export function updateInbox(id: string, patch: Partial<Pick<inbox.InboxItem, 'status' | 'controlId'>>): Promise<void> {
  if (MOCK) { inbox.updateInbox(id, patch); return Promise.resolve(); }
  return json(`/admin/unanswered/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
/** Agrega una pregunta al set de control (Validación). */
export const addControlCase = (c: Omit<import('./mock').ControlCase, 'id'>): Promise<import('./mock').ControlCase> =>
  MOCK ? Promise.resolve(mock.addControlCase(c)) : json('/admin/validation/cases', { method: 'POST', body: JSON.stringify(c) });

export type { ControlResult } from './mock';
/** Corre el set de preguntas de control contra el asistente y devuelve cada resultado. */
export const runControl = (onProgress?: (n: number) => void) =>
  MOCK ? mock.runControl(onProgress) : json<import('./mock').ControlResult[]>('/admin/validation/run', { method: 'POST' });
export const controlSize = () => mock.controlSet.length;
export const listControlCases = (): Promise<import('./mock').ControlCase[]> =>
  MOCK ? Promise.resolve([...mock.controlSet]) : json('/admin/validation/cases');
/** Reemplaza el set de control (importado desde CSV en el portal). */
export const replaceControlSet = async (cases: import('./mock').ControlCase[]): Promise<void> => {
  if (MOCK) { mock.controlSet.splice(0, mock.controlSet.length, ...cases); return; }
  await json('/admin/validation/cases', { method: 'PUT', body: JSON.stringify({ cases }) });
};
export const getTopics = (): Promise<Topic[]> => (MOCK ? Promise.resolve([...mock.topics]) : json('/topics'));

/** Documentos vigentes visibles para cualquier usuario (vista "Documentos disponibles"). */
export const listPublicDocs = (): Promise<PublicDoc[]> => (MOCK ? Promise.resolve(mock.publicDocs()) : json('/docs'));
export const listProcedures = (lang: 'es' | 'en' | 'qu'): Promise<import('./types').Procedure[]> =>
  MOCK ? Promise.resolve([]) : json(`/procedures?lang=${lang}`);

/** Enlace al original: en un PDF, directo a la página citada. */
export const docHref = (url: string, page?: number) => (page ? `${url}#page=${page}` : url);

// ---------- Administración (requiere token) ----------

export interface Admin { name: string; email: string }

export async function adminLogin(email: string, password: string): Promise<Admin> {
  if (MOCK) {
    if (!email.endsWith('@yachaytech.edu.ec') || password.length < 4) throw new Error('Usa tu correo institucional (@yachaytech.edu.ec) y tu contraseña');
    sessionStorage.setItem(ADMIN_TOKEN_KEY, 'mock');
    return { name: email.split('@')[0]!, email };
  }
  const r = await json<Admin & { token: string }>('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  sessionStorage.setItem(ADMIN_TOKEN_KEY, r.token);
  return { name: r.name, email: r.email };
}
export const adminLogout = () => {
  // La sesión se invalida también en el servidor (no basta con olvidar el token en el navegador).
  if (!MOCK) void fetch(`${API}/admin/logout`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken()}` } }).catch(() => undefined);
  try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* sin almacenamiento */ }
};

// ---------- Filtros del chat (crisis, denuncias, groserías, manipulación, fuera del ámbito, nunca filtrar) ----------

export type FilterCategory = 'crisis' | 'denuncia' | 'manipulacion' | 'salud' | 'profanidad' | 'fuera_de_dominio' | 'permitido';
export interface FilterTerm { category: FilterCategory; term: string; active: boolean; note: string | null; updatedBy: string; updatedAt: string }
export interface FilterCheck { route: string; kind: string | null; matched: string | null; question: string; sensitive: boolean }
export interface FilterTestRow { text: string; expect: string; got: string; ok: boolean; type: 'ruta' | 'datos' }
export interface FilterTest { total: number; ok: number; falsosPositivos: number; consultasLegitimas: number; falsosNegativos: number; casosDeRiesgo: number; rows: FilterTestRow[] }

const needsBackend = <T,>(): Promise<T> => Promise.reject(new Error('Los filtros se administran con el backend en funcionamiento.'));
export const listFilters = (): Promise<FilterTerm[]> => (MOCK ? needsBackend() : json('/admin/filters'));
export const saveFilter = (f: { category: FilterCategory; term: string; active: boolean; note?: string }): Promise<{ term: string }> =>
  MOCK ? needsBackend() : json('/admin/filters', { method: 'POST', body: JSON.stringify(f) });
export const checkFilter = (text: string): Promise<FilterCheck> => (MOCK ? needsBackend() : json('/admin/filters/check', { method: 'POST', body: JSON.stringify({ text }) }));
export const testFilters = (): Promise<FilterTest> => (MOCK ? needsBackend() : json('/admin/filters/test', { method: 'POST' }));

export const listDocs = (): Promise<DocMeta[]> => (MOCK ? Promise.resolve(mock.docs.map((d) => ({ ...d }))) : json('/admin/docs'));

export function deleteDoc(id: string): Promise<void> {
  if (MOCK) { const i = mock.docs.findIndex((d) => d.id === id); if (i >= 0) mock.docs.splice(i, 1); return Promise.resolve(); }
  return json(`/admin/docs/${id}`, { method: 'DELETE' });
}

/** Lugares con coordenadas reales (se cachea: no cambian durante la sesión). */
let placesCache: Promise<import('./types').RealPlaceInfo[]> | null = null;
export const getPlaces = (): Promise<import('./types').RealPlaceInfo[]> => {
  if (MOCK) return Promise.resolve([]);
  placesCache ??= json<import('./types').RealPlaceInfo[]>('/places').catch((e: unknown) => { placesCache = null; throw e; });
  return placesCache;
};

/** Vuelve a procesar un documento subido que quedó con error. */
export function reprocessDoc(id: string): Promise<void> {
  if (MOCK) return Promise.resolve();
  return json(`/admin/docs/${id}/reprocess`, { method: 'POST' });
}

export function createTopic(t: Omit<Topic, 'id'>): Promise<Topic> {
  if (MOCK) {
    const n = { ...t, id: t.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-') };
    mock.topics.push(n);
    return Promise.resolve(n);
  }
  return json('/admin/topics', { method: 'POST', body: JSON.stringify(t) });
}

/** Sube el archivo con sus metadatos (multipart). El backend lo parte en fragmentos, genera embeddings y responde con status 'procesando'. */
export function uploadDoc(input: UploadInput, onProgress: (p: number) => void): Promise<DocMeta> {
  if (MOCK) return mock.mockUpload(input, onProgress);
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(input)) if (v !== undefined) fd.append(k, v as string | Blob);
    const x = new XMLHttpRequest();
    x.open('POST', `${API}/admin/docs`);
    x.setRequestHeader('Authorization', `Bearer ${adminToken()}`);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => {
      if (x.status < 300) { resolve(JSON.parse(x.responseText) as DocMeta); return; }
      let msg = x.responseText || `Error ${x.status}`;
      try { const d = (JSON.parse(x.responseText) as { detail?: unknown }).detail; if (typeof d === 'string') msg = d; } catch { /* texto plano */ }
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error('No se pudo subir el archivo'));
    x.send(fd);
  });
}
