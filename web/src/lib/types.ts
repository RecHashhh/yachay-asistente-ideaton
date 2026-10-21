/**
 * Contrato entre este frontend y el backend (LangChain + LangGraph).
 * Si cambias algo aquí, cambia también el backend: es la única fuente de verdad de la forma de los datos.
 */

export type FileKind = 'pdf' | 'xlsx' | 'csv';
export type DocStatus = 'procesando' | 'indexado' | 'error';

/** Metadatos que el administrador asigna a cada documento. Se guardan junto a cada fragmento (chunk) en el índice vectorial. */
export interface DocMeta {
  id: string;
  title: string;
  topicId: string;
  kind: FileKind;
  /** Versión del documento, p. ej. "v3" o "2026-1". Al subir una versión nueva, la anterior deja de usarse en las respuestas. */
  version: string;
  /** Fecha del documento (no la de subida). ISO yyyy-mm-dd. */
  docDate: string;
  /** Dónde vive el original: publicado en la web de la universidad o solo interno. */
  origin: 'web' | 'interno';
  url?: string;
  uploadedAt: string;
  uploadedBy: string;
  status: DocStatus;
  chunks: number;
  sizeKb: number;
  /** Resultado del procesamiento de una subida (fragmentos generados o motivo del error). */
  notes?: string | null;
  /** Versiones anteriores reemplazadas por esta. */
  history?: { version: string; docDate: string; replacedAt: string }[];
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  /** Traducción al inglés (la escribe el administrador al crear el tema). */
  nameEn?: string;
  descriptionEn?: string;
}

export interface Trend {
  query: string;
  topicId: string;
  count: number;
  /** Variación frente a la semana anterior, en %. */
  delta: number;
}

/** Cita que respalda una respuesta. */
export interface Source {
  docId: string;
  title: string;
  version: string;
  docDate: string;
  /** Página (PDF), hoja y fila (xlsx/csv). */
  locator?: string;
  snippet: string;
  /** Enlace al original publicado. Si es PDF y hay `page`, se abre en esa página (#page=N). */
  url?: string;
  page?: number;
  origin?: 'web' | 'interno';
  /** 'consulta': la fecha es de cuándo se descargó la fuente, no de emisión del documento. */
  dateKind?: 'consulta' | 'documento';
  /** 'institucional': el enlace abre solo con la cuenta de la universidad (SharePoint). */
  acceso?: 'publico' | 'institucional' | 'interno';
  periodo?: string | null;
}

/** Documento tal como lo ve cualquier usuario en "Documentos disponibles" (sin datos de quién lo subió). */
export interface PublicDoc {
  id: string;
  title: string;
  topicId: string;
  kind: FileKind;
  version: string;
  docDate: string;
  origin: 'web' | 'interno';
  url?: string;
}

/** Lugares del mapa del campus. Los ids deben coincidir con los `id` del SVG real (ver campus.ts). */
export type PlaceId = string;

/** Entrada de la herramienta `mostrar_en_mapa` que el modelo llama. */
export interface MapAction {
  destino: PlaceId;
  origen?: PlaceId;
  /** Otros lugares que se marcan con un círculo. */
  resaltar?: PlaceId[];
  nota?: string;
  /** Coordenadas reales (backend): lugar de los Excel de la universidad. */
  lat?: number;
  lon?: number;
  nombre?: string;
  horario?: string | null;
  mapsUrl?: string | null;
  /** Punto de partida real ("¿cómo llego… desde el rectorado?"): se dibuja una flecha hasta el destino. */
  desde?: { lat: number; lon: number; nombre: string } | null;
}

/** Lugar con coordenadas reales (GET /places). */
export interface RealPlaceInfo { id: string; name: string; nameEn: string | null; uso: string | null; horario: string | null; lat: number; lon: number; mapsUrl: string | null }

/** Guía paso a paso de un trámite: qué es, qué se necesita, en qué orden y dónde. Sale de un documento fuente, nunca del modelo solo. */
export interface Procedure {
  id?: string;
  revision?: string;
  period?: string | null;
  title: string;
  summary: string;
  office: string;
  placeId?: PlaceId;
  duration?: string;
  documents: string[];
  steps: { title: string; detail?: string }[];
  source: Source;
  sources?: Source[];
  contacts?: { label: string; email: string }[];
  links?: { label: string; url: string }[];
  requirements?: string[];
  /** Plazos del trámite (del calendario académico) para "Añadir al calendario". */
  deadlines?: { title: string; start: string; end?: string }[];
  /** Los plazos son de un período ya terminado: se muestran como referencia, sin "Añadir al calendario". */
  deadlinesPast?: boolean;
}

/** Respuesta explícita "sin información oficial": no hay fragmento con relevancia suficiente o la pregunta está fuera del dominio. */
export interface Unknown {
  reason: 'sin_fuente' | 'fuera_de_dominio';
  contact?: { office: string; email?: string; phone?: string; placeId?: PlaceId };
}

/** Eventos que el backend envía por SSE (text/event-stream), uno por línea `data: {...}`. */
export type StreamEvent =
  | { type: 'status'; label: string }
  | { type: 'answer_mode'; mode: 'extractive' }
  | { type: 'token'; text: string }
  | { type: 'tool'; name: 'mostrar_en_mapa'; input: MapAction }
  | { type: 'procedure'; item: Procedure }
  | { type: 'unknown'; item: Unknown }
  /** Consulta ambigua: el asistente pide precisar con opciones antes de responder (no adivina la intención). */
  | { type: 'clarify'; question: string; options: string[] }
  | { type: 'sources'; items: Source[] }
  | { type: 'suggestions'; items: string[] }
  /** Aviso sobre la respuesta, p. ej. cifras o enlaces que no aparecen textualmente en los documentos citados. */
  | { type: 'notice'; level: 'warn'; text: string }
  /** Botón de acción dentro de la respuesta, p. ej. abrir "Documentos disponibles". Solo rutas internas (#/...). */
  | { type: 'link'; label: string; href: string }
  | { type: 'done'; messageId: string; cached?: boolean; latencyMs?: number }
  | { type: 'error'; message: string };

/** Archivo que el usuario adjunta al mensaje (captura, foto de un aviso, PDF). */
export interface Attachment {
  name: string;
  type: string;
  /** data: URL. En producción se sube aparte y aquí va solo el id. */
  url: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  /** Idioma elegido en la interfaz; el modelo responde en ese idioma aunque la fuente esté en español. */
  lang: 'es' | 'en' | 'qu';
  attachments?: Attachment[];
  /** Solo los últimos turnos; el backend guarda un resumen del resto (ver README, ahorro de tokens). */
  history: ChatTurn[];
}

export interface UploadInput {
  file: File;
  title: string;
  topicId: string;
  version: string;
  docDate: string;
  origin: 'web' | 'interno';
  url?: string;
  /** Si se indica, el archivo reemplaza a este documento como versión nueva. */
  replaces?: string;
}
