/**
 * Simulador de la bandeja "Sin respuesta" y de las consultas enviadas a las dependencias.
 * En producción esto vive en la base de datos del backend (ver README, contrato); aquí se guarda en el navegador
 * solo para que la demo funcione entre el chat y el portal sin servidor.
 */

export type InboxReason = 'sin_fuente' | 'fuera_de_dominio' | 'voto_negativo';
export type InboxStatus = 'nuevo' | 'convertida' | 'descartada';

export interface InboxItem {
  id: string;
  q: string;
  lang: 'es' | 'en' | 'qu';
  reason: InboxReason;
  /** Cuántas veces se hizo esta misma pregunta (normalizada). */
  count: number;
  firstAt: string;
  lastAt: string;
  status: InboxStatus;
  /** Pregunta de control creada a partir de esta entrada. */
  controlId?: string;
}

export interface Inquiry {
  code: string;
  office: string;
  email: string;
  question: string;
  lang: 'es' | 'en' | 'qu';
  at: string;
}

const INBOX_KEY = 'yt-mock-inbox';
const INQ_KEY = 'yt-mock-inquiries';

const read = <T>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') as T[]; } catch { return []; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

/** Misma pregunta = mismo texto sin tildes, signos ni mayúsculas. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function recordUnanswered(q: string, lang: InboxItem['lang'], reason: InboxReason) {
  if (!q.trim()) return;
  const items = read<InboxItem>(INBOX_KEY);
  const now = new Date().toISOString();
  const hit = items.find((x) => norm(x.q) === norm(q) && x.reason === reason);
  if (hit) {
    hit.count += 1;
    hit.lastAt = now;
    if (hit.status === 'descartada') hit.status = 'nuevo';
  } else {
    items.unshift({ id: crypto.randomUUID().slice(0, 8), q: q.trim(), lang, reason, count: 1, firstAt: now, lastAt: now, status: 'nuevo' });
  }
  write(INBOX_KEY, items.slice(0, 500));
}

export const listInbox = (): InboxItem[] => read<InboxItem>(INBOX_KEY);

export function updateInbox(id: string, patch: Partial<Pick<InboxItem, 'status' | 'controlId'>>) {
  write(INBOX_KEY, read<InboxItem>(INBOX_KEY).map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function createInquiry(i: Omit<Inquiry, 'code' | 'at'>): Inquiry {
  const all = read<Inquiry>(INQ_KEY);
  const code = `YT-${new Date().getFullYear()}-${String(all.length + 1).padStart(4, '0')}`;
  const inq = { ...i, code, at: new Date().toISOString() };
  write(INQ_KEY, [inq, ...all]);
  return inq;
}
