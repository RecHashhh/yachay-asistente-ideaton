import { placeById, placeName } from './campus';
import type { Lang } from './i18n';
import { kichwaRecordingSupported, listenKichwa } from './kichwaSpeech';
import { serverSpeechSupported, speakKichwa, stopKichwaSpeech } from './kichwaTts';
import type { MapAction, Procedure, Source, Unknown } from './types';
import type { MapView } from './mapConversation';
import { publicVoiceUrl, voiceActionText, voiceMapLink } from './voiceActions';

/**
 * Motor de voz del modo conversación: reconocimiento (Web Speech API), síntesis con la mejor voz disponible,
 * sonidos de estado y la conversión de una respuesta (texto, trámite, mapa, fuentes) a algo que se entiende sin ver la pantalla.
 * ES/EN usan el servicio del navegador. Kichwa usa Killkan en el servidor Yachi, sin guardar audio.
 */

const SPEECH_LANG: Record<Lang, string> = { es: 'es-EC', en: 'en-US', qu: 'qu-EC' };
const PREF_KEY = 'yt-voice';

export interface VoicePrefs { rate: number; voiceURI?: string; autoListen: boolean; reviewKichwa?: boolean }
export const loadPrefs = (): VoicePrefs => {
  try { return { rate: 1, autoListen: true, reviewKichwa: true, ...(JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<VoicePrefs>) }; } catch { return { rate: 1, autoListen: true, reviewKichwa: true }; }
};
export const savePrefs = (p: VoicePrefs) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ } };

// ---------------- Síntesis ----------------

export const ttsSupported = (lang: Lang = 'es') => typeof window !== 'undefined' && ('speechSynthesis' in window || (lang === 'qu' && serverSpeechSupported()));

/** Voces del idioma, las de mejor calidad primero (Natural/Neural de Edge, Google, luego locales del país). */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const base = lang === 'en' ? 'en' : lang === 'qu' ? 'qu' : 'es';
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 40 : 0) + (/google/i.test(v.name) ? 20 : 0) +
    (v.lang.toLowerCase() === SPEECH_LANG[lang].toLowerCase() ? 10 : 0) +
    (base === 'es' && /es-(EC|CO|MX|US|419)/i.test(v.lang) ? 5 : 0) + (v.localService ? 0 : 2);
  return speechSynthesis.getVoices().filter((v) => lang === 'qu' ? /^(qu-ec|qug|qvi)(-|$)/i.test(v.lang) : v.lang.toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a));
}

/** Las voces se cargan de forma asíncrona en Chrome/Edge. */
export function whenVoicesReady(): Promise<void> {
  if (!ttsSupported() || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((r) => { speechSynthesis.addEventListener('voiceschanged', () => r(), { once: true }); setTimeout(r, 1500); });
}

let cancelNative = () => undefined as void;

/** Habla el texto por oraciones (evita el corte de Chrome en textos largos) y resuelve al terminar o al cancelarse. */
export function speak(text: string, lang: Lang, prefs: VoicePrefs, onBoundary?: (i: number) => void): Promise<void> {
  if (!text.trim()) return Promise.resolve();
  stopSpeaking();
  const voice = lang === 'qu' && prefs.voiceURI === 'mms-quw' ? undefined : voicesFor(lang).find((v) => v.voiceURI === prefs.voiceURI) ?? voicesFor(lang)[0];
  if (lang === 'qu' && !voice) return speakKichwa(text, prefs.rate, onBoundary);
  if (!ttsSupported()) return Promise.resolve();
  const parts = text.match(/[^.!?¿¡:\n]+[.!?:]?|\n/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  return new Promise((resolve, reject) => {
    let i = 0;
    let finished = false;
    let guard: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => { if (finished) return; finished = true; clearTimeout(guard); if (cancelNative === finish) cancelNative = () => undefined; if (error) reject(error); else resolve(); };
    cancelNative = finish;
    const next = () => {
      if (finished) return;
      if (i >= parts.length) return finish();
      const u = new SpeechSynthesisUtterance(parts[i]!);
      u.lang = voice?.lang ?? SPEECH_LANG[lang];
      if (voice) u.voice = voice;
      u.rate = prefs.rate;
      // Si el navegador no emite "end", informa del fallo sin iniciar otra oración.
      let advanced = false;
      const go = () => { if (advanced || finished) return; advanced = true; clearTimeout(guard); i++; next(); };
      guard = setTimeout(() => finish(new Error('speech-timeout')), 2000 + (parts[i]!.length * 90) / prefs.rate);
      u.onend = go;
      u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') finish(); else finish(new Error(e.error)); };
      onBoundary?.(i);
      speechSynthesis.speak(u);
    };
    next();
  });
}
export const stopSpeaking = () => { cancelNative(); stopKichwaSpeech(); if (ttsSupported()) speechSynthesis.cancel(); };

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
export const sttSupported = (lang: Lang = 'es') => typeof window !== 'undefined' && (lang === 'qu' ? kichwaRecordingSupported() : !!SRClass());

/** Escucha una frase. `onInterim` recibe el texto parcial; resuelve con el texto final ('' si no se entendió). */
export function listenOnce(lang: Lang, onInterim: (t: string) => void): { done: Promise<string>; stop: () => void; abort: () => void } {
  if (lang === 'qu') return listenKichwa(onInterim);
  const C = SRClass();
  if (!C) return { done: Promise.reject(new Error('no-stt')), stop: () => undefined, abort: () => undefined };
  const r = new C();
  r.lang = SPEECH_LANG[lang]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  let final = '';
  let aborted = false;
  let settle: (text: string) => void = () => undefined;
  const done = new Promise<string>((resolve, reject) => {
    settle = resolve;
    r.onresult = (ev) => {
      if (aborted) return;
      let interim = '';
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const res = ev.results[k]!;
        if (res.isFinal) final += res[0]!.transcript; else interim += res[0]!.transcript;
      }
      onInterim((final + interim).trim());
    };
    r.onerror = (ev) => (ev.error === 'no-speech' || ev.error === 'aborted' ? resolve('') : reject(new Error(ev.error)));
    r.onend = () => resolve(aborted ? '' : final.trim());
  });
  r.start();
  return { done, stop: () => { try { r.stop(); } catch { settle(final.trim()); } }, abort: () => { aborted = true; settle(''); try { r.abort(); } catch { /* already ended */ } } };
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

const plain = (md: string) => md.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1').replace(/\[(?:F|S)\d+\]/g, '').replace(/https?:\/\/\S+/g, '').replaceAll('**', '').replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '').replace(/\n{2,}/g, '. ').replace(/\n/g, '. ').replace(/\.\s*\./g, '.');

/** Lee el nombre y la nota disponibles, sin inferir recorridos de un plano esquemático. */
export function describeRoute(a: MapAction, lang: Lang): string {
  const to = placeById(a.destino);
  const name = a.nombre ?? (to ? placeName(to, lang) : '');
  // SVG coordinates are schematic: never turn them into walking directions.
  return [name, a.nota, a.lat === undefined ? voiceActionText(lang).unverifiedRoute : ''].filter(Boolean).join('. ');
}

export interface Spoken { intro: string; steps: string[]; outro: string }

/** Convierte una respuesta del asistente en partes habladas. Los pasos de un trámite se leen de uno en uno. */
export function toSpeech(m: { text?: string; procedure?: Procedure; unknown?: Unknown; clarify?: { question: string; options: string[] }; map?: MapAction; geoMap?: MapView; sources?: Source[] }, lang: Lang, unknownTitle: string, unknownBody: string): Spoken {
  const en = lang === 'en';
  const qu = lang === 'qu';
  const a = voiceActionText(lang);
  const parts: string[] = [];
  if (m.clarify) {
    parts.push(m.clarify.question);
    m.clarify.options.forEach((o, i) => parts.push(`${a.option} ${i + 1}: ${o.replace(/[¿?]/g, '')}.`));
    parts.push(a.optionHint);
    return { intro: parts.join(' '), steps: [], outro: '' };
  }
  if (m.unknown) {
    parts.push(`${unknownTitle}.`);
    if (m.unknown.contact) parts.push(`${unknownBody} ${m.unknown.contact.office}${m.unknown.contact.email ? `, ${en ? 'email' : 'correo'} ${m.unknown.contact.email.replace('@', en ? ' at ' : ' arroba ').replaceAll('.', en ? ' dot ' : ' punto ')}` : ''}.`);
    return { intro: parts.join(' '), steps: [], outro: '' };
  }
  if (m.procedure) parts.push(plain(`${m.procedure.title}. ${m.procedure.summary}`));
  else if (m.text) parts.push(plain(m.text));
  if (m.map) parts.push(describeRoute(m.map, lang));
  if (m.geoMap?.route) {
    const route = m.geoMap.route;
    parts.push(`${Math.round(route.distance_m)} ${en ? 'meters' : qu ? 'metrokuna' : 'metros'}, ${Math.max(1, Math.ceil(route.duration_s / 60))} ${en ? 'minutes' : qu ? 'minutokuna' : 'minutos'}. ${a.unverifiedRoute}`);
  }
  if (voiceMapLink(m)) parts.push(a.mapHint);
  else if (m.map || m.geoMap) parts.push(a.internalMapHint);
  let steps: string[] = [];
  if (m.procedure) {
    const p = m.procedure;
    parts.push(`${a.office}: ${p.office}.`);
    if (p.documents.length) parts.push(`${a.documents}: ${p.documents.join('; ')}.`);
    if (p.steps.length) parts.push(a.stepsHint);
    steps = p.steps.map((s, i) => `${a.step} ${i + 1}/${p.steps.length}: ${s.title}. ${s.detail ?? ''}`.trim());
  }
  const src = m.sources?.[0] ?? m.procedure?.source;
  if (publicVoiceUrl(src?.url)) parts.push(a.sourceHint);
  const outro = src ? `${a.sourceLabel}: ${src.title}, ${a.version} ${src.version}.` : '';
  return { intro: parts.join(' '), steps, outro };
}

// ---------------- Comandos de voz ----------------

export type VoiceCommand = 'next' | 'prev' | 'repeat' | 'all' | 'help' | 'exit' | 'slower' | 'faster' | 'stop' | 'map' | 'source' | { option: number };

const NUM: Record<string, number> = { uno: 1, una: 1, one: 1, primera: 1, primero: 1, first: 1, dos: 2, two: 2, segunda: 2, segundo: 2, second: 2, tres: 3, three: 3, tercera: 3, third: 3, cuatro: 4, four: 4, cuarta: 4, fourth: 4 };

/** Frases cortas que controlan el modo voz en vez de enviarse como pregunta. */
export function parseCommand(t: string, optionCount: number): VoiceCommand | null {
  const s = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,!?¿¡]/g, '').trim();
  if (/^(mapa|map|abrir mapa|open map)$/.test(s)) return 'map';
  if (/^(fuente|source|documento|killka)$/.test(s)) return 'source';
  const kichwa: Record<string, VoiceCommand> = { katina: 'next', 'nawpa ruray': 'prev', 'kutin uyana': 'repeat', kutin: 'repeat', tukuy: 'all', yanapay: 'help', llukshina: 'exit', harkana: 'stop' };
  if (kichwa[s]) return kichwa[s]!;
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
