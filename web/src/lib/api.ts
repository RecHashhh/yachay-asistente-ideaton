import * as inbox from './inbox';
import * as mock from './mock';
import type { ChatRequest, DocMeta, PublicDoc, StreamEvent, Topic, Trend, UploadInput } from './types';

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
/** El agente usa el backend si se configura VITE_API_URL; las demás funciones todavía son de ejemplo. */
export const CHAT_MOCK = !API;
export const SAMPLE_DATA = true;

const ADMIN_TOKEN_KEY = 'yt-admin-token';

const connectionError = (lang: ChatRequest['lang']) => lang === 'en'
  ? 'Could not connect to the assistant. Check that the backend is running and try again.'
  : 'No se pudo conectar con el asistente. Comprueba que el backend esté activo e inténtalo de nuevo.';

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
  return new Error(detail || connectionError(lang));
}

/** Chat por SSE: POST /chat con ChatRequest y respuesta text/event-stream, un StreamEvent por bloque `data:`. */
export async function* streamChat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  if (CHAT_MOCK) { yield* mock.mockChat(req, signal); return; }
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

/** Tendencias de ejemplo en el idioma pedido; el backend aún no ofrece este endpoint. */
export const getTrends = (lang: 'es' | 'en' | 'qu' = 'es'): Promise<Trend[]> =>
  Promise.resolve(mock.trends.map((t) => ({ ...t, query: lang === 'en' ? mock.trendsEn[t.query] ?? t.query : t.query })));

/** El backend aún no guarda feedback; se conserva la interacción local de la interfaz. */
export function sendFeedback(messageId: string, vote: 'up' | 'down'): Promise<void> {
  void messageId;
  void vote;
  return Promise.resolve();
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
  mock.runControl(onProgress);
export const controlSize = () => mock.controlSet.length;
export const getTopics = (): Promise<Topic[]> => Promise.resolve([...mock.topics]);

/** Documentos vigentes visibles para cualquier usuario (vista "Documentos disponibles"). */
export const listPublicDocs = (): Promise<PublicDoc[]> => (MOCK ? Promise.resolve(mock.publicDocs()) : json('/docs'));
export const listProcedures = (lang: 'es' | 'en' | 'qu'): Promise<import('./types').Procedure[]> =>
  MOCK ? Promise.resolve([]) : json(`/procedures?lang=${lang}`);

/** Enlace al original: en un PDF, directo a la página citada. */
export const docHref = (url: string, page?: number) => (page ? `${url}#page=${page}` : url);

// ---------- Administración (requiere token) ----------

export interface Admin { name: string; email: string }

export async function adminLogin(email: string, password: string): Promise<Admin> {
  if (!email.endsWith('@yachaytech.edu.ec') || password.length < 4) throw new Error('Usa tu correo institucional (@yachaytech.edu.ec) y tu contraseña');
  sessionStorage.setItem(ADMIN_TOKEN_KEY, 'mock');
  return { name: email.split('@')[0]!, email };
}
export const adminLogout = () => {
  // La sesión se invalida también en el servidor (no basta con olvidar el token en el navegador).
  if (!MOCK) void fetch(`${API}/admin/logout`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken()}` } }).catch(() => undefined);
  try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* sin almacenamiento */ }
};

// ---------- Filtros del chat (crisis, denuncias, groserías, manipulación, fuera del ámbito, nunca filtrar) ----------

export type FilterCategory = 'crisis' | 'denuncia' | 'manipulacion' | 'profanidad' | 'fuera_de_dominio' | 'permitido';
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

export const listDocs = (): Promise<DocMeta[]> => Promise.resolve(mock.docs.map((d) => ({ ...d })));

export function deleteDoc(id: string): Promise<void> {
  const i = mock.docs.findIndex((d) => d.id === id);
  if (i >= 0) mock.docs.splice(i, 1);
  return Promise.resolve();
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
  const n = { ...t, id: t.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-') };
  mock.topics.push(n);
  return Promise.resolve(n);
}

/** La administración sigue en modo de ejemplo hasta que existan sus endpoints en el backend. */
export function uploadDoc(input: UploadInput, onProgress: (p: number) => void): Promise<DocMeta> {
  return mock.mockUpload(input, onProgress);
}
