import { PLACES, placeById, placeName } from './campus';
import type { Lang } from './i18n';
import type { MapAction, Procedure, Source, Unknown } from './types';

/**
 * Motor de voz del modo conversación: reconocimiento (Web Speech API), síntesis con la mejor voz disponible,
 * sonidos de estado y la conversión de una respuesta (texto, trámite, mapa, fuentes) a algo que se entiende sin ver la pantalla.
 * Todo corre en el navegador: costo cero. El reconocimiento lo hace el servicio del navegador (Google en Chrome, Microsoft en Edge).
 */

const SPEECH_LANG: Record<Lang, string> = { es: 'es-EC', en: 'en-US', qu: 'es-EC' };
const PREF_KEY = 'yt-voice';

export interface VoicePrefs { rate: number; voiceURI?: string; autoListen: boolean }
export const loadPrefs = (): VoicePrefs => {
  try { return { rate: 1, autoListen: true, ...(JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<VoicePrefs>) }; } catch { return { rate: 1, autoListen: true }; }
};
export const savePrefs = (p: VoicePrefs) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ } };

// ---------------- Síntesis ----------------

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Voces del idioma, las de mejor calidad primero (Natural/Neural de Edge, Google, luego locales del país). */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const base = lang === 'en' ? 'en' : 'es';
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 40 : 0) + (/google/i.test(v.name) ? 20 : 0) +
    (v.lang.toLowerCase() === SPEECH_LANG[lang].toLowerCase() ? 10 : 0) +
    (base === 'es' && /es-(EC|CO|MX|US|419)/i.test(v.lang) ? 5 : 0) + (v.localService ? 0 : 2);
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a));
}

/** Las voces se cargan de forma asíncrona en Chrome/Edge. */
export function whenVoicesReady(): Promise<void> {
  if (!ttsSupported() || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((r) => { speechSynthesis.addEventListener('voiceschanged', () => r(), { once: true }); setTimeout(r, 1500); });
}

/** Habla el texto por oraciones (evita el corte de Chrome en textos largos) y resuelve al terminar o al cancelarse. */
export function speak(text: string, lang: Lang, prefs: VoicePrefs, onBoundary?: (i: number) => void): Promise<void> {
  if (!ttsSupported() || !text.trim()) return Promise.resolve();
  speechSynthesis.cancel();
  const voice = voicesFor(lang).find((v) => v.voiceURI === prefs.voiceURI) ?? voicesFor(lang)[0];
  const parts = text.match(/[^.!?¿¡:\n]+[.!?:]?|\n/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= parts.length) return resolve();
      const u = new SpeechSynthesisUtterance(parts[i]!);
      u.lang = voice?.lang ?? SPEECH_LANG[lang];
      if (voice) u.voice = voice;
      u.rate = prefs.rate;
      // Si el sistema no tiene voces, algunos navegadores nunca emiten "end": se avanza por tiempo estimado.
      let advanced = false;
      const go = () => { if (advanced) return; advanced = true; clearTimeout(guard); i++; next(); };
      const guard = setTimeout(go, 2000 + (parts[i]!.length * 90) / prefs.rate);
      u.onend = go;
      u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') { advanced = true; clearTimeout(guard); resolve(); } else go(); };
      onBoundary?.(i);
      speechSynthesis.speak(u);
    };
    next();
  });
}
export const stopSpeaking = () => { if (ttsSupported()) speechSynthesis.cancel(); };

// ---------------- Reconocimiento ----------------

interface SR {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: (ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onerror: (ev: { error: string }) => void; onend: () => void; start: () => void; stop: () => void; abort: () => void;
}
const SRClass = () => {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export const sttSupported = () => typeof window !== 'undefined' && !!SRClass();

/** Escucha una frase. `onInterim` recibe el texto parcial; resuelve con el texto final ('' si no se entendió). */
export function listenOnce(lang: Lang, onInterim: (t: string) => void): { done: Promise<string>; stop: () => void; abort: () => void } {
  const C = SRClass();
  if (!C) return { done: Promise.reject(new Error('no-stt')), stop: () => undefined, abort: () => undefined };
  const r = new C();
  r.lang = SPEECH_LANG[lang]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  let final = '';
  const done = new Promise<string>((resolve, reject) => {
    r.onresult = (ev) => {
      let interim = '';
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const res = ev.results[k]!;
        if (res.isFinal) final += res[0]!.transcript; else interim += res[0]!.transcript;
      }
      onInterim((final + interim).trim());
    };
    r.onerror = (ev) => (ev.error === 'no-speech' || ev.error === 'aborted' ? resolve('') : reject(new Error(ev.error)));
    r.onend = () => resolve(final.trim());
  });
  r.start();
  return { done, stop: () => r.stop(), abort: () => r.abort() };
}

// ---------------- Sonidos de estado ----------------

let ctx: AudioContext | null = null;
/** Tono corto: subiendo = "te escucho", bajando = "listo". Sin archivos de audio. */
export function earcon(kind: 'listen' | 'done' | 'error') {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    const [a, b] = kind === 'listen' ? [660, 880] : kind === 'done' ? [880, 590] : [300, 220];
    o.frequency.setValueAtTime(a, t); o.frequency.linearRampToValueAtTime(b, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
  } catch { /* sin audio */ }
}

// ---------------- Respuesta → voz ----------------

const plain = (md: string) => md.replaceAll('**', '').replace(/^\s*[-*]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '').replace(/\n{2,}/g, '. ').replace(/\n/g, '. ').replace(/\.\s*\./g, '.');

const COMPASS = { es: ['el este', 'el noreste', 'el norte', 'el noroeste', 'el oeste', 'el suroeste', 'el sur', 'el sureste'], en: ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'] };

/** Indicaciones en palabras para quien no ve el mapa: dirección desde el origen y una referencia cercana. Aproximado (plano esquemático). */
export function describeRoute(a: MapAction, lang: Lang): string {
  const to = placeById(a.destino); if (!to) return '';
  const from = a.origen ? placeById(a.origen) : undefined;
  const en = lang === 'en';
  const near = PLACES.filter((p) => p.id !== to.id && p.id !== from?.id).map((p) => ({ p, d: Math.hypot(p.x - to.x, p.y - to.y) })).sort((x, y) => x.d - y.d)[0]?.p;
  let dir = '';
  if (from) {
    const ang = (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI;
    dir = COMPASS[en ? 'en' : 'es'][Math.round(((ang + 360) % 360) / 45) % 8]!;
  }
  const n = (p: typeof to) => placeName(p, lang);
  if (en) return `${from ? `From the ${n(from)}, head ${dir}. ` : ''}${n(to)} is next to ${near ? n(near) : 'the main path'}.`;
  return `${from ? `Desde la ${n(from).toLowerCase()}, camina hacia ${dir}. ` : ''}${n(to)} queda junto a ${near ? n(near) : 'el camino principal'}.`;
}

export interface Spoken { intro: string; steps: string[]; outro: string }

/** Convierte una respuesta del asistente en partes habladas. Los pasos de un trámite se leen de uno en uno. */
export function toSpeech(m: { text?: string; procedure?: Procedure; unknown?: Unknown; clarify?: { question: string; options: string[] }; map?: MapAction; sources?: Source[] }, lang: Lang, unknownTitle: string, unknownBody: string): Spoken {
  const en = lang === 'en';
  const parts: string[] = [];
  if (m.clarify) {
    parts.push(m.clarify.question);
    m.clarify.options.forEach((o, i) => parts.push(`${en ? 'Option' : 'Opción'} ${i + 1}: ${o.replace(/[¿?]/g, '')}.`));
    parts.push(en ? 'Say the number of the option.' : 'Di el número de la opción.');
    return { intro: parts.join(' '), steps: [], outro: '' };
  }
  if (m.unknown) {
    parts.push(`${unknownTitle}.`);
    if (m.unknown.contact) parts.push(`${unknownBody} ${m.unknown.contact.office}${m.unknown.contact.email ? `, ${en ? 'email' : 'correo'} ${m.unknown.contact.email.replace('@', en ? ' at ' : ' arroba ').replaceAll('.', en ? ' dot ' : ' punto ')}` : ''}.`);
    return { intro: parts.join(' '), steps: [], outro: '' };
  }
  if (m.text) parts.push(plain(m.text));
  if (m.map) parts.push(describeRoute(m.map, lang));
  let steps: string[] = [];
  if (m.procedure) {
    const p = m.procedure;
    parts.push(en ? `Office in charge: ${p.office}.` : `Lo atiende ${p.office}.`);
    if (p.documents.length) parts.push(`${en ? 'You need' : 'Necesitas'}: ${p.documents.join('; ')}.`);
    parts.push(en ? `It has ${p.steps.length} steps. Say "next" to hear each one, or "all steps".` : `Son ${p.steps.length} pasos. Di "siguiente" para escucharlos uno por uno, o "todos los pasos".`);
    steps = p.steps.map((s, i) => `${en ? 'Step' : 'Paso'} ${i + 1} ${en ? 'of' : 'de'} ${p.steps.length}: ${s.title}. ${s.detail ?? ''}`.trim());
  }
  const src = m.sources?.[0];
  const outro = src ? (en ? `Source: ${src.title}, version ${src.version}.` : `Fuente: ${src.title}, versión ${src.version}.`) : '';
  return { intro: parts.join(' '), steps, outro };
}

// ---------------- Comandos de voz ----------------

export type VoiceCommand = 'next' | 'prev' | 'repeat' | 'all' | 'help' | 'exit' | 'slower' | 'faster' | 'stop' | { option: number };

const NUM: Record<string, number> = { uno: 1, una: 1, one: 1, primera: 1, primero: 1, first: 1, dos: 2, two: 2, segunda: 2, segundo: 2, second: 2, tres: 3, three: 3, tercera: 3, third: 3, cuatro: 4, four: 4, cuarta: 4, fourth: 4 };

/** Frases cortas que controlan el modo voz en vez de enviarse como pregunta. */
export function parseCommand(t: string, optionCount: number): VoiceCommand | null {
  const s = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,!?¿¡]/g, '').trim();
  if (optionCount) {
    const m = s.match(/^(?:la |el |option |opcion )?(\d|uno|una|dos|tres|cuatro|one|two|three|four|primera|primero|segunda|segundo|tercera|cuarta|first|second|third|fourth)$/);
    if (m) { const n = Number(m[1]) || NUM[m[1]!]!; if (n >= 1 && n <= optionCount) return { option: n }; }
  }
  if (/^(siguiente|siguiente paso|next|next step|continua|continuar)$/.test(s)) return 'next';
  if (/^(anterior|paso anterior|previous|back|atras)$/.test(s)) return 'prev';
  if (/^(repetir|repite|repeat|otra vez|again)$/.test(s)) return 'repeat';
  if (/^(todos los pasos|todos|all steps|all)$/.test(s)) return 'all';
  if (/^(ayuda|help|que puedo decir|what can i say)$/.test(s)) return 'help';
  if (/^(salir|cerrar|terminar|exit|close|quit)$/.test(s)) return 'exit';
  if (/^(mas despacio|despacio|slower|more slowly)$/.test(s)) return 'slower';
  if (/^(mas rapido|rapido|faster)$/.test(s)) return 'faster';
  if (/^(para|detente|silencio|stop|pause)$/.test(s)) return 'stop';
  return null;
}
