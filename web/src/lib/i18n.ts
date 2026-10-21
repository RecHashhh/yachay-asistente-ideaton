import { createContext, useContext } from 'react';

export type Lang = 'es' | 'en' | 'qu';

/** Kichwa: solo el saludo y la etiqueta; el resto de la interfaz cae a español. POR VALIDAR con un hablante nativo. */
export const LANGS: { id: Lang; label: string; short: string; speech: string }[] = [
  { id: 'es', label: 'Español', short: 'ES', speech: 'es-EC' },
  { id: 'en', label: 'English', short: 'EN', speech: 'en-US' },
  { id: 'qu', label: 'Kichwa (beta)', short: 'KI', speech: 'es-EC' },
];

const es = {
  hello: 'Hola, soy {name}.',
  helloSub: '¿Qué trámite o lugar de {uni} necesitas?',
  placeholder: 'Pregúntale a {name}…',
  trending: 'Preguntas de ejemplo',
  newChat: 'Nueva conversación',
  recent: 'Recientes',
  notice: 'Aviso de uso de datos',
  themeLight: 'Tema claro',
  themeDark: 'Tema oscuro',
  admin: 'Portal de administración',
  about: 'Cómo funciona',
  disclaimer: '{name} responde solo con documentos oficiales. Revisa la fuente de cada respuesta.',
  thinking: 'Pensando',
  demo: 'Datos de ejemplo',
  demoTitle: 'Sin backend: respuestas del asistente simuladas con datos de ejemplo',
  chatTextOnly: 'El agente conectado solo admite preguntas de texto. Quita los adjuntos e inténtalo de nuevo.',
  send: 'Enviar', stop: 'Detener respuesta',
  mic: 'Dictar por voz', micOn: 'Te escucho… toca para terminar', micNo: 'Este navegador no permite dictado. Prueba en Chrome o Edge.',
  attach: 'Adjuntar imagen o PDF', capture: 'Capturar pantalla', captureNo: 'Aquí no se puede capturar directo. Usa Win+Shift+S y pega con Ctrl+V.',
  pasteHint: 'También puedes pegar una captura con Ctrl+V',
  removeFile: 'Quitar archivo',
  copy: 'Copiar respuesta', good: 'Respuesta útil', bad: 'Respuesta no útil', retry: 'Volver a generar',
  stopped: 'Respuesta detenida.',
  sources: 'Fuentes',
  version: 'Versión', docOf: 'documento del',
  steps: 'Pasos', docs: 'Qué necesitas', where: 'Dónde', time: 'Tiempo estimado', office: 'Responsable',
  showMap: 'Ver en el mapa', done: 'Hecho',
  unknownTitle: 'No tengo esa información en los documentos oficiales',
  unknownBody: 'Prefiero no adivinar. Te dejo el contacto de quien sí puede responderte:',
  outOfDomain: 'Esa pregunta está fuera de lo que puedo responder',
  typingHints: 'Preguntas parecidas',
  langAuto: 'Detecté que escribes en {lang}. ¿Cambiar el idioma?',
  change: 'Cambiar',
  open: 'Abrir asistente', close: 'Cerrar',
};
export type Dict = typeof es;

const en: Dict = {
  hello: "Hi, I'm {name}.",
  helloSub: 'Which {uni} procedure or place do you need?',
  placeholder: 'Ask {name}…',
  trending: 'Example questions',
  newChat: 'New chat',
  recent: 'Recent',
  notice: 'Data use notice',
  themeLight: 'Light theme',
  themeDark: 'Dark theme',
  admin: 'Admin portal',
  about: 'How it works',
  disclaimer: '{name} only answers from official documents. Check the source of every answer.',
  thinking: 'Thinking',
  demo: 'Sample data',
  demoTitle: 'Backend disconnected: assistant responses are simulated with sample data',
  chatTextOnly: 'The connected agent only accepts text questions. Remove the attachments and try again.',
  send: 'Send', stop: 'Stop answer',
  mic: 'Voice input', micOn: 'Listening… tap to finish', micNo: 'This browser does not support dictation. Try Chrome or Edge.',
  attach: 'Attach image or PDF', capture: 'Capture screen', captureNo: 'Screen capture is not available here. Use Win+Shift+S and paste with Ctrl+V.',
  pasteHint: 'You can also paste a screenshot with Ctrl+V',
  removeFile: 'Remove file',
  copy: 'Copy answer', good: 'Helpful', bad: 'Not helpful', retry: 'Regenerate',
  stopped: 'Answer stopped.',
  sources: 'Sources',
  version: 'Version', docOf: 'document dated',
  steps: 'Steps', docs: 'What you need', where: 'Where', time: 'Estimated time', office: 'Office in charge',
  showMap: 'Show on map', done: 'Done',
  unknownTitle: "I don't have that in the official documents",
  unknownBody: "I'd rather not guess. Here is who can answer you:",
  outOfDomain: "That question is outside what I can answer",
  typingHints: 'Similar questions',
  langAuto: 'Looks like you are writing in {lang}. Switch language?',
  change: 'Switch',
  open: 'Open assistant', close: 'Close',
};

const qu: Dict = { ...es, hello: '¡Imanalla! Ñuka shutika {name}.' };

export const DICTS: Record<Lang, Dict> = { es, en, qu };

export const LangContext = createContext<{ lang: Lang; t: (k: keyof Dict, vars?: Record<string, string>) => string }>({
  lang: 'es',
  t: (k) => es[k],
});
export const useT = () => useContext(LangContext);

export function makeT(lang: Lang) {
  return (k: keyof Dict, vars?: Record<string, string>) => {
    let s = DICTS[lang][k];
    for (const [a, b] of Object.entries(vars ?? {})) s = s.replaceAll(`{${a}}`, b);
    return s;
  };
}

/** Detección simple por palabras frecuentes. El backend vuelve a detectar con el modelo; esto solo sugiere el cambio en la interfaz. */
export function detectLang(text: string): Lang | null {
  const w = text.toLowerCase().match(/[a-záéíóúñ']+/g) ?? [];
  if (w.length < 3) return null;
  const EN = new Set(['the', 'how', 'what', 'where', 'when', 'is', 'can', 'do', 'i', 'my', 'to', 'for', 'a', 'of', 'which', 'need', 'does', 'are']);
  const ES = new Set(['el', 'la', 'cómo', 'como', 'qué', 'que', 'dónde', 'donde', 'cuándo', 'es', 'puedo', 'mi', 'para', 'de', 'un', 'una', 'necesito', 'los', 'las', 'hay']);
  let en = 0, es = 0;
  for (const x of w) { if (EN.has(x)) en++; if (ES.has(x)) es++; }
  if (en >= 2 && en > es * 1.5) return 'en';
  if (es >= 2 && es > en * 1.5) return 'es';
  return null;
}
