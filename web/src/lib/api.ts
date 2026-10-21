import * as mock from './mock';
import type { ChatRequest, DocMeta, StreamEvent, Topic, Trend, UploadInput } from './types';

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

export type { ControlResult } from './mock';
/** Corre el set de preguntas de control contra el asistente y devuelve cada resultado. */
export const runControl = (onProgress?: (n: number) => void) =>
  mock.runControl(onProgress);
export const controlSize = () => mock.controlSet.length;
export const getTopics = (): Promise<Topic[]> => Promise.resolve([...mock.topics]);

// ---------- Administración (requiere token) ----------

export interface Admin { name: string; email: string }

export async function adminLogin(email: string, password: string): Promise<Admin> {
  if (!email.endsWith('@yachaytech.edu.ec') || password.length < 4) throw new Error('Usa tu correo institucional (@yachaytech.edu.ec) y tu contraseña');
  sessionStorage.setItem(ADMIN_TOKEN_KEY, 'mock');
  return { name: email.split('@')[0]!, email };
}
export const adminLogout = () => { try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* sin almacenamiento */ } };

export const listDocs = (): Promise<DocMeta[]> => Promise.resolve(mock.docs.map((d) => ({ ...d })));

export function deleteDoc(id: string): Promise<void> {
  const i = mock.docs.findIndex((d) => d.id === id);
  if (i >= 0) mock.docs.splice(i, 1);
  return Promise.resolve();
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
