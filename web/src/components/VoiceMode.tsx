import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BRAND } from '../config';
import { useT, type Lang } from '../lib/i18n';
import { earcon, listenOnce, loadPrefs, parseCommand, savePrefs, speak, stopSpeaking, sttSupported, toSpeech, ttsSupported, voicesFor, whenVoicesReady, type Spoken, type VoicePrefs } from '../lib/speech';
import type { MapAction, Procedure, Source, Unknown } from '../lib/types';
import { trapFocus } from './ConsentDialog';
import { IcClose, IcMic, IcStop } from './icons';
import { Mascot } from './Mascot';

export interface VoiceAnswer { id: string; text: string; streaming?: boolean; procedure?: Procedure; unknown?: Unknown; clarify?: { question: string; options: string[] }; map?: MapAction; sources?: Source[]; error?: string }

type State = 'start' | 'idle' | 'listening' | 'thinking' | 'speaking';

const TEXT = {
  es: {
    title: `Modo voz de ${BRAND.mascotName}`,
    start: 'Empezar a hablar',
    startHint: 'Presiona Enter o toca el botón. Después, la barra espaciadora para hablar o interrumpir.',
    welcome: `Hola, soy ${BRAND.mascotName}. Estás en el modo voz. Haz tu pregunta después del sonido. Puedes decir "ayuda" en cualquier momento.`,
    help: 'Puedes preguntar por trámites, normativa, servicios y lugares del campus. En un trámite, di "siguiente", "anterior", "repetir" o "todos los pasos". Para responder una aclaración, di el número de la opción. También puedes decir "más despacio", "más rápido" o "salir". Con teclado: barra espaciadora para hablar, R para repetir, N para el siguiente paso y Escape para salir.',
    listening: 'Te escucho…', thinking: 'Buscando en los documentos oficiales…', speaking: 'Hablando… (espacio para interrumpir)', idle: 'Listo. Presiona espacio o el botón para hablar.',
    talk: 'Hablar', stop: 'Detener', exit: 'Salir del modo voz',
    notHeard: 'No te escuché. Intenta de nuevo.', noStt: 'Este navegador no reconoce voz (usa Chrome o Edge). Puedes escribir aquí y te leeré la respuesta.',
    micDenied: 'No tengo permiso para usar el micrófono. Revisa los permisos del navegador.',
    typed: 'O escribe tu pregunta', send: 'Enviar',
    pii: 'Omití un dato personal de tu pregunta.', noSteps: 'Esta respuesta no tiene pasos.', lastStep: 'Ese era el último paso.', firstStep: 'Estás en el primer paso.',
    speed: 'Velocidad', voice: 'Voz', auto: 'Escuchar de nuevo al terminar', bye: 'Saliendo del modo voz.',
    slower: 'Hablaré más despacio.', faster: 'Hablaré más rápido.', you: 'Tú', yachi: BRAND.mascotName,
  },
  en: {
    title: `${BRAND.mascotName} voice mode`,
    start: 'Start talking',
    startHint: 'Press Enter or tap the button. Then use the space bar to talk or interrupt.',
    welcome: `Hi, I'm ${BRAND.mascotName}. You are in voice mode. Ask your question after the tone. You can say "help" at any time.`,
    help: 'You can ask about procedures, regulations, services and campus places. In a procedure, say "next", "previous", "repeat" or "all steps". To answer a clarification, say the option number. You can also say "slower", "faster" or "exit". Keyboard: space bar to talk, R to repeat, N for next step and Escape to exit.',
    listening: 'Listening…', thinking: 'Searching official documents…', speaking: 'Speaking… (space to interrupt)', idle: 'Ready. Press space or the button to talk.',
    talk: 'Talk', stop: 'Stop', exit: 'Exit voice mode',
    notHeard: 'I did not hear you. Please try again.', noStt: 'This browser cannot recognize speech (use Chrome or Edge). You can type here and I will read the answer aloud.',
    micDenied: 'I do not have permission to use the microphone. Check your browser permissions.',
    typed: 'Or type your question', send: 'Send',
    pii: 'I removed a piece of personal data from your question.', noSteps: 'This answer has no steps.', lastStep: 'That was the last step.', firstStep: 'You are on the first step.',
    speed: 'Speed', voice: 'Voice', auto: 'Listen again when finished', bye: 'Leaving voice mode.',
    slower: 'I will speak more slowly.', faster: 'I will speak faster.', you: 'You', yachi: BRAND.mascotName,
  },
};

const HAS_PII = /\b\d{10}\b|[\w.+-]+@[\w-]+\.[\w.]+/;

/**
 * Conversación por voz, manos libres: pensada para personas ciegas o con baja visión (también funciona junto a un lector de
 * pantalla) y para cualquiera que prefiera hablar. Se abre con el enlace #/voz o con el botón "Modo voz".
 */
export function VoiceMode({ answer, busy, onSend, onStopAnswer, onClose }: {
  answer: VoiceAnswer | undefined;
  busy: boolean;
  onSend: (text: string) => void;
  onStopAnswer: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const x = TEXT[lang === 'en' ? 'en' : 'es'];
  const [state, setState] = useState<State>('start');
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  const [prefs, setPrefsState] = useState<VoicePrefs>(loadPrefs);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [typed, setTyped] = useState('');
  const spoken = useRef<Spoken>({ intro: '', steps: [], outro: '' });
  const step = useRef(-1);
  const last = useRef('');
  const pending = useRef(false);
  const spokenId = useRef<string | null>(answer?.id ?? null);
  const listener = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const stt = sttSupported();
  const startBtn = useRef<HTMLButtonElement>(null);
  const lang2: Lang = lang;
  // El ciclo de escucha es asíncrono: siempre lee la respuesta y las acciones actuales, nunca una copia vieja.
  const live = useRef({ answer, onSend, onClose, onStopAnswer });
  live.current = { answer, onSend, onClose, onStopAnswer };
  const listenRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => { void whenVoicesReady().then(() => setVoices(voicesFor(lang2))); }, [lang2]);
  useEffect(() => { startBtn.current?.focus(); }, []);
  useEffect(() => () => { listener.current?.abort(); stopSpeaking(); }, []);

  const setPrefs = (p: Partial<VoicePrefs>) => { const n = { ...prefsRef.current, ...p }; setPrefsState(n); savePrefs(n); };

  const say = useCallback(async (text: string, thenListen = true) => {
    if (!text) return;
    last.current = text;
    setSaid(text);
    setState('speaking');
    await speak(text, lang2, prefsRef.current);
    setState((s) => (s === 'speaking' ? 'idle' : s));
    if (thenListen && prefsRef.current.autoListen && stt) void listenRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang2, stt]);

  const handle = (text: string) => {
    const answer = live.current.answer;
    const cmd = parseCommand(text, answer?.clarify?.options.length ?? 0);
    const steps = spoken.current.steps;
    if (cmd === 'help') return void say(x.help);
    if (cmd === 'exit') { stopSpeaking(); void speak(x.bye, lang2, prefsRef.current); return live.current.onClose(); }
    if (cmd === 'repeat') return void say(last.current || x.help);
    if (cmd === 'stop') { stopSpeaking(); return setState('idle'); }
    if (cmd === 'slower') { setPrefs({ rate: Math.max(0.6, +(prefsRef.current.rate - 0.15).toFixed(2)) }); return void say(x.slower); }
    if (cmd === 'faster') { setPrefs({ rate: Math.min(1.8, +(prefsRef.current.rate + 0.15).toFixed(2)) }); return void say(x.faster); }
    if (cmd === 'next' || cmd === 'prev' || cmd === 'all') {
      if (!steps.length) return void say(x.noSteps);
      if (cmd === 'all') { step.current = steps.length - 1; return void say([...steps, spoken.current.outro].join(' ')); }
      if (cmd === 'next' && step.current >= steps.length - 1) return void say(`${x.lastStep} ${spoken.current.outro}`);
      if (cmd === 'prev' && step.current <= 0) return void say(x.firstStep);
      step.current += cmd === 'next' ? 1 : -1;
      return void say(steps[step.current]! + (step.current === steps.length - 1 ? ` ${spoken.current.outro}` : ''));
    }
    if (cmd && typeof cmd === 'object' && answer?.clarify) return ask(answer.clarify.options[cmd.option - 1]!);
    ask(text);
  };

  const ask = (text: string) => {
    pending.current = true;
    setHeard(text.replace(new RegExp(HAS_PII.source, 'g'), lang2 === 'en' ? '[removed]' : '[dato omitido]'));
    setState('thinking');
    earcon('done');
    live.current.onSend(text);
    if (HAS_PII.test(text)) void speak(x.pii, lang2, prefsRef.current);
  };

  async function listen() {
    stopSpeaking();
    listener.current?.abort();
    setInterim('');
    setState('listening');
    earcon('listen');
    const l = listenOnce(lang2, setInterim);
    listener.current = l;
    try {
      const text = await l.done;
      listener.current = null;
      if (!text) { setState('idle'); earcon('error'); return; }
      handle(text);
    } catch (e) {
      listener.current = null;
      setState('idle');
      earcon('error');
      void say((e as Error).message === 'not-allowed' ? x.micDenied : x.notHeard, false);
    }
  }

  listenRef.current = listen;

  // Cuando llega la respuesta a una pregunta hecha en este modo, se lee.
  useEffect(() => {
    if (!answer || answer.streaming || !pending.current || answer.id === spokenId.current) return;
    pending.current = false;
    spokenId.current = answer.id;
    const s = toSpeech(answer, lang2, t('unknownTitle'), t('unknownBody'));
    spoken.current = s;
    step.current = -1;
    void say(answer.error ? answer.error : [s.intro, s.steps.length ? '' : s.outro].filter(Boolean).join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.id, answer?.streaming]);

  const begin = async () => { earcon('done'); await say(x.welcome, true); if (!stt) setState('idle'); };

  const main = () => {
    if (state === 'start') return void begin();
    if (state === 'speaking') { stopSpeaking(); return void listen(); }
    if (state === 'listening') { listener.current?.stop(); return; }
    if (state === 'thinking') { live.current.onStopAnswer(); pending.current = false; return setState('idle'); }
    if (stt) void listen();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    trapFocus(e);
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Escape') { e.preventDefault(); stopSpeaking(); onClose(); return; }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' && state !== 'start') { e.preventDefault(); main(); }
    else if (e.key.toLowerCase() === 'r') handle('repetir');
    else if (e.key.toLowerCase() === 'n') handle('siguiente');
  };

  const status = state === 'start' ? x.startHint : state === 'listening' ? x.listening : state === 'thinking' || busy ? x.thinking : state === 'speaking' ? x.speaking : x.idle;
  const mood = state === 'listening' ? 'happy' : state === 'thinking' ? 'thinking' : state === 'speaking' ? 'talking' : 'idle';

  return (
    <motion.div className="voice" role="dialog" aria-modal="true" aria-labelledby="voice-title" onKeyDown={onKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="voice-top">
        <h1 id="voice-title" className="title">{x.title}</h1>
        <span className="sp" />
        <button className="icon-btn" aria-label={x.exit} title={x.exit} onClick={() => { stopSpeaking(); onClose(); }}><IcClose /></button>
      </header>

      <div className="voice-stage">
        <div className={`voice-orb ${state}`} aria-hidden="true">
          <span className="ring" /><span className="ring r2" />
          <Mascot size={132} mood={mood} decorative />
        </div>
        <p className="voice-status" role="status" aria-live="polite">{status}</p>
        {state === 'listening' && interim && <p className="voice-interim" aria-hidden="true">“{interim}”</p>}
        {heard && state !== 'listening' && <p className="voice-heard"><b>{x.you}:</b> {heard}</p>}
        {said && <p className="voice-said"><b>{x.yachi}:</b> {said}</p>}

        {state === 'start' ? (
          <button ref={startBtn} className="voice-main" onClick={main}><IcMic />{x.start}</button>
        ) : (
          <button className={`voice-main ${state}`} onClick={main} aria-pressed={state === 'listening'} disabled={!stt && state === 'idle'}>
            {state === 'listening' || state === 'thinking' || state === 'speaking' ? <IcStop /> : <IcMic />}
            {state === 'listening' ? x.stop : state === 'speaking' ? x.talk : state === 'thinking' ? x.stop : x.talk}
          </button>
        )}

        {!stt && state !== 'start' && (
          <form className="voice-typed" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { handle(typed.trim()); setTyped(''); } }}>
            <p className="small">{x.noStt}</p>
            <label className="sr" htmlFor="voice-q">{x.typed}</label>
            <input id="voice-q" className="inp" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={x.typed} />
            <button className="btn primary">{x.send}</button>
          </form>
        )}
      </div>

      <footer className="voice-prefs">
        <label className="field"><span>{x.speed}</span>
          <select className="inp" value={prefs.rate} onChange={(e) => setPrefs({ rate: Number(e.target.value) })}>
            {[0.7, 0.85, 1, 1.15, 1.3, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {voices.length > 1 && (
          <label className="field"><span>{x.voice}</span>
            <select className="inp" value={prefs.voiceURI ?? voices[0]!.voiceURI} onChange={(e) => setPrefs({ voiceURI: e.target.value })}>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name.replace(/^Microsoft |^Google /, '')} ({v.lang})</option>)}
            </select>
          </label>
        )}
        <label className="check"><input type="checkbox" checked={prefs.autoListen} onChange={(e) => setPrefs({ autoListen: e.target.checked })} />{x.auto}</label>
        {!ttsSupported() && <p className="err">{lang === 'en' ? 'Speech output is not available in this browser.' : 'Este navegador no puede leer en voz alta.'}</p>}
      </footer>
    </motion.div>
  );
}
