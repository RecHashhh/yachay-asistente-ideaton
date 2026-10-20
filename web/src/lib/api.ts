import * as inbox from './inbox';
import * as mock from './mock';
import type { ChatRequest, DocMeta, PublicDoc, StreamEvent, Topic, Trend, UploadInput } from './types';

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
/** Sin VITE_API_URL el frontend funciona con el simulador (mock.ts). */
export const MOCK = !API;

const ADMIN_TOKEN_KEY = 'yt-admin-token';
const adminToken = () => { try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ''; } catch { return ''; } };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}`, ...init?.headers } });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json() as Promise<T>;
}

/** Chat por SSE: POST /chat con ChatRequest y respuesta text/event-stream, un StreamEvent por bloque `data:`. */
export async function* streamChat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  if (MOCK) { yield* mock.mockChat(req, signal); return; }
  const r = await fetch(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(req), signal });
  if (!r.ok || !r.body) throw new Error(`El asistente no respondió (${r.status})`);
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
  return fetch(`${API}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, vote, reason: ctx?.reason }) }).then(() => undefined);
}

export type { FeedbackReason, InboxItem, InboxStatus, Inquiry } from './inbox';

/** Envía la pregunta sin respuesta a la dependencia responsable. Devuelve el código de seguimiento. */
export function sendInquiry(i: Omit<inbox.Inquiry, 'code' | 'at'>): Promise<inbox.Inquiry> {
  if (MOCK) return new Promise((r) => setTimeout(() => r(inbox.createInquiry(i)), 600));
  return json('/inquiries', { method: 'POST', body: JSON.stringify(i) });
}

// ---------- Bandeja "Sin respuesta" (administración) ----------
export const listInbox = (): Promise<inbox.InboxItem[]> => (MOCK ? Promise.resolve(inbox.listInbox()) : json('/admin/unanswered'));
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
/** Reemplaza el set de control (importado desde CSV en el portal). */
export const replaceControlSet = (cases: import('./mock').ControlCase[]) => { mock.controlSet.splice(0, mock.controlSet.length, ...cases); };
export const getTopics = (): Promise<Topic[]> => (MOCK ? Promise.resolve([...mock.topics]) : json('/topics'));

/** Documentos vigentes visibles para cualquier usuario (vista "Documentos disponibles"). */
export const listPublicDocs = (): Promise<PublicDoc[]> => (MOCK ? Promise.resolve(mock.publicDocs()) : json('/docs'));

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
export const adminLogout = () => { try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* sin almacenamiento */ } };

export const listDocs = (): Promise<DocMeta[]> => (MOCK ? Promise.resolve(mock.docs.map((d) => ({ ...d }))) : json('/admin/docs'));

export function deleteDoc(id: string): Promise<void> {
  if (MOCK) { const i = mock.docs.findIndex((d) => d.id === id); if (i >= 0) mock.docs.splice(i, 1); return Promise.resolve(); }
  return json(`/admin/docs/${id}`, { method: 'DELETE' });
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
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText) as DocMeta) : reject(new Error(x.responseText || `Error ${x.status}`)));
    x.onerror = () => reject(new Error('No se pudo subir el archivo'));
    x.send(fd);
  });
}
