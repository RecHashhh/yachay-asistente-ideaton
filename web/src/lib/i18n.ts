import { createContext, useContext } from 'react';

export type Lang = 'es' | 'en' | 'qu';

/** Kichwa: solo el saludo y la etiqueta; el resto de la interfaz cae a español. POR VALIDAR con un hablante nativo. */
export const LANGS: { id: Lang; label: string; short: string; speech: string }[] = [
  { id: 'es', label: 'Español', short: 'ES', speech: 'es-EC' },
  { id: 'en', label: 'English', short: 'EN', speech: 'en-US' },
  { id: 'qu', label: 'Kichwa (Ecuador) · beta', short: 'KI', speech: 'es-EC' },
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
  version: 'Versión', docOf: 'documento del', consultedOn: 'consultado el', institutional: 'Requiere iniciar sesión con tu cuenta de la universidad.', openMaps: 'Abrir en Google Maps', hours: 'Horario',
  steps: 'Pasos', docs: 'Qué necesitas', where: 'Dónde', time: 'Tiempo estimado', office: 'Responsable',
  showMap: 'Ver en el mapa', done: 'Hecho',
  unknownTitle: 'Sin información oficial sobre este tema',
  unknownBody: 'No encontramos este tema en los documentos oficiales disponibles. Para no darte un dato inexacto, te sugerimos consultar con:',
  outOfDomain: 'Consulta fuera del ámbito institucional',
  outOfDomainBody: 'Este asistente responde solo sobre trámites, normativa, servicios y ubicaciones de la universidad.',
  fbTitle: '¿Qué falló en esta respuesta?', fbIncorrect: 'Es incorrecta', fbOutdated: 'Está desactualizada', fbNotAnswered: 'No responde mi pregunta', fbConfusing: 'Es difícil de entender', fbSkip: 'Omitir',
  fbThanks: 'Gracias. El equipo de la universidad revisará esta respuesta.',
  talkHuman: 'Hablar con una persona',
  voiceMode: 'Modo voz: conversar con Yachi hablando', readAloud: 'Escuchar respuesta', stopReading: 'Detener lectura',
  attachChat: 'Adjuntar esta conversación ({n} mensajes) para que no tengas que repetirla',
  deadlines: 'Fechas clave', addCal: 'Añadir al calendario',
  sendToOffice: 'Enviar consulta a la dependencia',
  inqEmail: 'Tu correo institucional', inqQuestion: 'Tu consulta',
  inqConsent: 'Autorizo enviar mi correo y esta consulta a {office} únicamente para responderla.',
  inqSend: 'Enviar', inqSending: 'Enviando…', cancel: 'Cancelar',
  inqDone: 'Consulta registrada para {office}. Código: {code}. No se ha enviado un correo ni se garantiza una respuesta; si es urgente, contacta directamente a la dependencia.',
  inqError: 'No se pudo enviar. Intenta de nuevo o escribe directamente al correo de la dependencia.',
  inqInvalid: 'Escribe un correo válido.',
  options: 'Opciones', rename: 'Renombrar', delete: 'Eliminar', deleted: 'Conversación eliminada', undo: 'Deshacer',
  today: 'Hoy', yesterday: 'Ayer', older: 'Anteriores',
  forYou: 'Para continuar con tus consultas',
  piiTitle: 'Tu mensaje parece incluir datos personales',
  piiBody: 'Detectamos {what}. No son necesarios para responderte y es mejor no compartirlos.',
  piiRemove: 'Quitar y enviar', piiEdit: 'Editar mensaje',
  piiId: 'un número de cédula o teléfono', piiEmail: 'un correo electrónico',
  typingHints: 'Preguntas parecidas',
  langAuto: 'Detecté que escribes en {lang}. ¿Cambiar el idioma?',
  change: 'Cambiar',
  open: 'Abrir asistente', close: 'Cerrar',
  kichwaNote: 'Kichwa en preparación: por ahora solo el saludo está en kichwa y está pendiente de revisión por un hablante nativo. El resto se muestra en español.',
  docsNav: 'Documentos disponibles',
  docsTitle: 'Documentos disponibles',
  docsSub: 'Todo lo que {name} usa para responder. Solo se usa la versión vigente de cada documento.',
  docsSearch: 'Buscar por título',
  allTopics: 'Todos',
  originWeb: 'Página web', originInternal: 'Interno',
  openDoc: 'Abrir documento', openDocAt: 'Abrir en {loc}',
  viewRecord: 'Ver en Documentos disponibles',
  internalNote: 'Documento interno: no está publicado, pero puedes pedirlo en la dependencia responsable.',
  askAbout: 'Preguntar sobre este documento',
  askAboutQ: '¿Qué dice el documento «{title}»?',
  backChat: 'Volver al chat',
  docsCount: '{n} documentos',
  noDocs: 'No hay documentos que coincidan.',
  page: 'pág.',
  originalQuote: '',
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
  version: 'Version', docOf: 'document dated', consultedOn: 'retrieved on', institutional: 'Requires signing in with your university account.', openMaps: 'Open in Google Maps', hours: 'Hours',
  steps: 'Steps', docs: 'What you need', where: 'Where', time: 'Estimated time', office: 'Office in charge',
  showMap: 'Show on map', done: 'Done',
  unknownTitle: 'No official information on this topic',
  unknownBody: 'We could not find this topic in the available official documents. To avoid giving you inaccurate information, please contact:',
  outOfDomain: 'Outside the institutional scope',
  outOfDomainBody: 'This assistant only answers about university procedures, regulations, services and locations.',
  fbTitle: 'What went wrong with this answer?', fbIncorrect: 'It is incorrect', fbOutdated: 'It is outdated', fbNotAnswered: 'It does not answer my question', fbConfusing: 'It is hard to understand', fbSkip: 'Skip',
  fbThanks: 'Thank you. The university team will review this answer.',
  talkHuman: 'Talk to a person',
  voiceMode: 'Voice mode: talk with Yachi', readAloud: 'Listen to answer', stopReading: 'Stop reading',
  attachChat: 'Attach this conversation ({n} messages) so you do not have to repeat it',
  deadlines: 'Key dates', addCal: 'Add to calendar',
  sendToOffice: 'Send question to the office',
  inqEmail: 'Your university email', inqQuestion: 'Your question',
  inqConsent: 'I authorize sending my email and this question to {office} only to answer it.',
  inqSend: 'Send', inqSending: 'Sending…', cancel: 'Cancel',
  inqDone: 'Question registered for {office}. Code: {code}. No email has been sent and a reply is not guaranteed; for urgent matters, contact the office directly.',
  inqError: 'It could not be sent. Try again or email the office directly.',
  inqInvalid: 'Enter a valid email.',
  options: 'Options', rename: 'Rename', delete: 'Delete', deleted: 'Conversation deleted', undo: 'Undo',
  today: 'Today', yesterday: 'Yesterday', older: 'Earlier',
  forYou: 'Continue where you left off',
  piiTitle: 'Your message seems to include personal data',
  piiBody: 'We detected {what}. It is not needed to answer you and it is better not to share it.',
  piiRemove: 'Remove and send', piiEdit: 'Edit message',
  piiId: 'an ID or phone number', piiEmail: 'an email address',
  typingHints: 'Similar questions',
  langAuto: 'Looks like you are writing in {lang}. Switch language?',
  change: 'Switch',
  open: 'Open assistant', close: 'Close',
  kichwaNote: 'Kichwa in progress: only the greeting is in Kichwa for now, pending review by a native speaker. Everything else is shown in Spanish.',
  docsNav: 'Available documents',
  docsTitle: 'Available documents',
  docsSub: 'Everything {name} uses to answer. Only the current version of each document is used.',
  docsSearch: 'Search by title',
  allTopics: 'All',
  originWeb: 'Website', originInternal: 'Internal',
  openDoc: 'Open document', openDocAt: 'Open at {loc}',
  viewRecord: 'See in Available documents',
  internalNote: 'Internal document: not published online, but you can request it from the office in charge.',
  askAbout: 'Ask about this document',
  askAboutQ: 'What does the document "{title}" say?',
  backChat: 'Back to chat',
  docsCount: '{n} documents',
  noDocs: 'No matching documents.',
  page: 'page',
  originalQuote: 'original quote in Spanish',
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

/** Ubicación dentro del documento ("pág. 5, art. 8", "hoja X, fila 4") en el idioma de la interfaz. */
const LOCATOR_EN: [RegExp, string][] = [[/pág\./g, 'p.'], [/\bhoja\b/g, 'sheet'], [/\bfilas\b/g, 'rows'], [/\bfila\b/g, 'row'], [/\bsección\b/g, 'section'], [/ a /g, ' to ']];
export const locatorLabel = (loc: string | undefined, lang: Lang) =>
  !loc || lang !== 'en' ? loc ?? '' : LOCATOR_EN.reduce((s, [re, to]) => s.replace(re, to), loc);

/** Nombre de un tema en el idioma de la interfaz (cae a español si falta la traducción). */
export const topicLabel = (t: { name: string; nameEn?: string } | undefined, lang: Lang) => (t ? (lang === 'en' ? t.nameEn ?? t.name : t.name) : '');

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
