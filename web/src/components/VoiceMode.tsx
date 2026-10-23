import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BRAND } from '../config';
import { useT, type Lang } from '../lib/i18n';
import { earcon, listenOnce, loadPrefs, parseCommand, savePrefs, speak, stopSpeaking, sttSupported, toSpeech, ttsSupported, voicesFor, whenVoicesReady, type Spoken, type VoicePrefs } from '../lib/speech';
import type { MapAction, Procedure, Source, Unknown } from '../lib/types';
import { kichwaVoiceAvailable } from '../lib/kichwaTts';
import { kichwaVoice, voiceLabels } from '../lib/voiceKichwa';
import { publicVoiceUrl, voiceActionText, voiceMapLink } from '../lib/voiceActions';
import type { MapView } from '../lib/mapConversation';
import { trapFocus } from './ConsentDialog';
import { IcClose, IcInfo, IcMic, IcStop } from './icons';
import { Mascot } from './Mascot';

export interface VoiceAnswer { id: string; text: string; streaming?: boolean; procedure?: Procedure; unknown?: Unknown; clarify?: { question: string; options: string[] }; map?: MapAction; geoMap?: MapView; sources?: Source[]; error?: string }

type State = 'start' | 'idle' | 'preparing' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

const TEXT = {
  es: {
    title: `Modo voz de ${BRAND.mascotName}`,
    start: 'Empezar a hablar',
    startHint: 'Habla con Yachi cuando quieras.',
    welcome: `Hola, soy ${BRAND.mascotName}. Estás en el modo voz. Haz tu pregunta después del sonido. Puedes decir "ayuda" en cualquier momento.`,
    help: 'Puedes preguntar por trámites, normativa, servicios y lugares del campus. En un trámite, di "siguiente", "anterior", "repetir" o "todos los pasos". Para responder una aclaración, di el número de la opción. También puedes decir "más despacio", "más rápido" o "salir". Con teclado: barra espaciadora para hablar, R para repetir, N para el siguiente paso y Escape para salir.',
    listening: 'Te escucho…', thinking: 'Buscando en los documentos oficiales…', speaking: 'Yachi está hablando…', idle: 'Listo para escucharte.',
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
    startHint: 'Talk to Yachi whenever you’re ready.',
    welcome: `Hi, I'm ${BRAND.mascotName}. You are in voice mode. Ask your question after the tone. You can say "help" at any time.`,
    help: 'You can ask about procedures, regulations, services and campus places. In a procedure, say "next", "previous", "repeat" or "all steps". To answer a clarification, say the option number. You can also say "slower", "faster" or "exit". Keyboard: space bar to talk, R to repeat, N for next step and Escape to exit.',
    listening: 'Listening…', thinking: 'Searching official documents…', speaking: 'Yachi is speaking…', idle: 'Ready to listen.',
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
export function VoiceMode({ answer, busy, onSend, onStopAnswer, onClose, onShowAnswer }: {
  answer: VoiceAnswer | undefined;
  busy: boolean;
  onSend: (text: string) => void;
  onStopAnswer: () => void;
  onClose: () => void;
  onShowAnswer?: () => void;
}) {
  const { t, lang } = useT();
  const x = lang === 'qu' ? kichwaVoice : TEXT[lang];
  const ui = voiceLabels[lang];
  const a = voiceActionText(lang);
  const [state, setState] = useState<State>('start');
  const stateRef = useRef<State>('start');
  const setVoiceState = (next: State) => { stateRef.current = next; setState(next); };
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [visibleStep, setVisibleStep] = useState(-1);
  const [showTyped, setShowTyped] = useState(false);
  const mapAnchor = useRef<HTMLAnchorElement>(null);
  const sourceAnchor = useRef<HTMLAnchorElement>(null);
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  const [prefs, setPrefsState] = useState<VoicePrefs>(loadPrefs);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [typed, setTyped] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [serverVoice, setServerVoice] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<'info' | 'settings' | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const panelTitle = panel === 'info' ? ui.info : ui.settings;
  useEffect(() => { if (panel) panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [panel]);
  const closePanel = () => { setPanel(null); panelTrigger.current?.focus(); };
  const spoken = useRef<Spoken>({ intro: '', steps: [], outro: '' });
  const step = useRef(-1);
  const last = useRef('');
  const pending = useRef(false);
  const spokenId = useRef<string | null>(answer?.id ?? null);
  const listener = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const stt = sttSupported(lang);
  const startBtn = useRef<HTMLButtonElement>(null);
  const lang2: Lang = lang;
  // El ciclo de escucha es asíncrono: siempre lee la respuesta y las acciones actuales, nunca una copia vieja.
  const live = useRef({ answer, onSend, onClose, onStopAnswer, busy });
  live.current = { answer, onSend, onClose, onStopAnswer, busy };
  const listenRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let active = true;
    const update = () => { if (active) setVoices(voicesFor(lang2)); };
    void whenVoicesReady().then(update);
    if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', update);
    return () => { active = false; if ('speechSynthesis' in window) speechSynthesis.removeEventListener('voiceschanged', update); };
  }, [lang2]);
  useEffect(() => {
    let active = true;
    setServerVoice(null);
    if (lang === 'qu') void kichwaVoiceAvailable().then((ready) => { if (active) setServerVoice(ready); });
    return () => { active = false; };
  }, [lang]);
  useEffect(() => { startBtn.current?.focus(); }, []);
  const invalidate = () => {
    epoch.current++;
    const oldListener = listener.current;
    listener.current = null;
    oldListener?.abort();
    stopSpeaking();
  };
  const closeVoice = () => { invalidate(); pending.current = false; live.current.onClose(); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate(); }; }, []);
  useEffect(() => {
    invalidate(); pending.current = false;
    setVoiceState('start'); setSaid(''); setHeard(''); setTyped(''); setVisibleStep(-1);
    spoken.current = { intro: '', steps: [], outro: '' }; step.current = -1;
  }, [lang]);

  const setPrefs = (p: Partial<VoicePrefs>) => { const n = { ...prefsRef.current, ...p }; setPrefsState(n); savePrefs(n); };

  const say = useCallback(async (text: string, thenListen = true) => {
    if (!text) return;
    invalidate();
    const turn = epoch.current;
    last.current = text;
    setSaid(text);
    setSpeechError('');
    setVoiceState('speaking');
    let failed = false;
    try { await speak(text, lang2, prefsRef.current); }
    catch { failed = true; if (mounted.current && turn === epoch.current) setSpeechError(voiceLabels[lang2].voiceError); }
    if (!mounted.current || turn !== epoch.current) return;
    setVoiceState('idle');
    if (!failed && thenListen && prefsRef.current.autoListen && stt && (lang2 !== 'qu' || prefsRef.current.reviewKichwa === false) && !panelRef.current) void listenRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang2, stt]);

  const handle = (text: string) => {
    const answer = live.current.answer;
    const cmd = parseCommand(text, answer?.clarify?.options.length ?? 0);
    if ((live.current.busy || pending.current) && cmd !== 'exit') {
      if (cmd === 'stop') { invalidate(); pending.current = false; live.current.onStopAnswer(); setVoiceState('idle'); }
      return;
    }
    const steps = spoken.current.steps;
    if (cmd === 'help') return void say(x.help);
    if (cmd === 'exit') return closeVoice();
    if (cmd === 'repeat') return void say(last.current || x.help);
    if (cmd === 'stop') { invalidate(); return setVoiceState('idle'); }
    if (cmd === 'map' || cmd === 'source') {
      const anchor = cmd === 'map' ? mapAnchor.current : sourceAnchor.current;
      anchor?.focus();
      return void say(cmd === 'map' ? (anchor ? a.mapHint : a.internalMapHint) : anchor ? a.sourceHint : a.showAnswer, false);
    }
    if (cmd === 'slower') { setPrefs({ rate: Math.max(0.6, +(prefsRef.current.rate - 0.15).toFixed(2)) }); return void say(x.slower); }
    if (cmd === 'faster') { setPrefs({ rate: Math.min(1.8, +(prefsRef.current.rate + 0.15).toFixed(2)) }); return void say(x.faster); }
    if (cmd === 'next' || cmd === 'prev' || cmd === 'all') {
      if (!steps.length) return void say(x.noSteps);
      if (cmd === 'all') { step.current = steps.length - 1; setVisibleStep(step.current); return void say([...steps, spoken.current.outro].join(' ')); }
      if (cmd === 'next' && step.current >= steps.length - 1) return void say(`${x.lastStep} ${spoken.current.outro}`);
      if (cmd === 'prev' && step.current <= 0) return void say(x.firstStep);
      step.current += cmd === 'next' ? 1 : -1;
      setVisibleStep(step.current);
      return void say(steps[step.current]! + (step.current === steps.length - 1 ? ` ${spoken.current.outro}` : ''));
    }
    if (cmd && typeof cmd === 'object' && answer?.clarify) return ask(answer.clarify.options[cmd.option - 1]!);
    ask(text);
  };

  const ask = (text: string) => {
    if (!text.trim() || live.current.busy || pending.current) return;
    invalidate();
    pending.current = true;
    setHeard(text.replace(new RegExp(HAS_PII.source, 'g'), ui.omittedData));
    setVoiceState('thinking');
    setTyped(''); setShowTyped(false);
    earcon('done');
    live.current.onSend(text);
  };

  async function listen() {
    if (live.current.busy || pending.current) return;
    invalidate();
    const turn = epoch.current;
    setInterim('');
    setSpeechError('');
    setVoiceState(lang2 === 'qu' ? 'preparing' : 'listening');
    earcon('listen');
    try {
      const l = listenOnce(lang2, (text) => {
        if (!mounted.current || turn !== epoch.current) return;
        if (lang2 === 'qu') setVoiceState(text === voiceLabels.qu.transcribing ? 'transcribing' : 'listening');
        else setInterim(text);
      });
      listener.current = l;
      const text = await l.done;
      if (!mounted.current || turn !== epoch.current) return;
      listener.current = null;
      if (!text) { setVoiceState('idle'); return; }
      if (lang2 === 'qu' && prefsRef.current.reviewKichwa !== false) { setTyped(text); setShowTyped(true); setVoiceState('idle'); }
      else handle(text);
    } catch (e) {
      if (!mounted.current || turn !== epoch.current) return;
      listener.current = null;
      setVoiceState('idle');
      earcon('error');
      if (lang2 === 'qu') { if ((e as Error).name !== 'AbortError') setSpeechError((e as Error).name === 'NotAllowedError' ? x.micDenied : x.notHeard); }
      else setSpeechError((e as Error).message === 'not-allowed' ? x.micDenied : x.notHeard);
    }
  }

  listenRef.current = listen;

  // Cuando llega la respuesta a una pregunta hecha en este modo, se lee.
  useEffect(() => {
    if (!answer || answer.streaming) return;
    const s = toSpeech(answer, lang2, t('unknownTitle'), t('unknownBody'));
    spoken.current = s;
    step.current = s.steps.length ? 0 : -1;
    setVisibleStep(step.current);
    last.current = [s.intro, s.steps[0] ?? s.outro].filter(Boolean).join(' ');
    if (!pending.current || answer.id === spokenId.current) return;
    pending.current = false;
    spokenId.current = answer.id;
    void say(answer.error ? answer.error : [s.intro, s.steps[0] ?? s.outro].filter(Boolean).join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer?.id, answer?.streaming, lang2]);

  const begin = () => { if (stt) void listen(); else { setShowTyped(true); setVoiceState('idle'); } };

  const main = () => {
    const current = stateRef.current;
    if (current === 'start') return begin();
    if (current === 'preparing' || current === 'transcribing') { invalidate(); return setVoiceState('idle'); }
    if (current === 'speaking') { invalidate(); setVoiceState('idle'); return void listen(); }
    if (current === 'listening') { setVoiceState('transcribing'); listener.current?.stop(); return; }
    if (current === 'thinking' || live.current.busy) { invalidate(); live.current.onStopAnswer(); pending.current = false; return setVoiceState('idle'); }
    if (stt) void listen();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    trapFocus(e);
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Escape') { e.preventDefault(); if (panel) { closePanel(); return; } closeVoice(); return; }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || panel || (tag === 'BUTTON' && e.key === ' ')) return;
    if (e.key === ' ' && state !== 'start') { e.preventDefault(); main(); }
    else if (e.key.toLowerCase() === 'r') handle('repetir');
    else if (e.key.toLowerCase() === 'n') handle('siguiente');
  };

  const status = state === 'start' ? x.startHint : state === 'preparing' ? a.preparing : state === 'listening' ? x.listening : state === 'transcribing' ? ui.transcribing : state === 'thinking' || busy ? x.thinking : state === 'speaking' ? x.speaking : x.idle;
  const mapUrl = answer ? voiceMapLink(answer) : undefined;
  const sourceUrl = publicVoiceUrl(answer?.sources?.[0]?.url ?? answer?.procedure?.source.url);
  const mood = state === 'listening' ? 'happy' : state === 'thinking' ? 'thinking' : state === 'speaking' ? 'talking' : 'idle';

  return (
    <motion.div lang={lang === 'qu' ? 'qu-EC' : lang} translate={lang === 'qu' ? 'no' : undefined} className="voice" role="dialog" aria-modal="true" aria-labelledby="voice-title" onKeyDown={onKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="voice-top">
        <h1 id="voice-title" className="title">{x.title}</h1>
        <span className="sp" />
        <button className="icon-btn" aria-label={ui.info} title={ui.info} aria-expanded={panel === 'info'} aria-controls="voice-options" onClick={(event) => { panelTrigger.current = event.currentTarget; setPanel(panel === 'info' ? null : 'info'); }}><IcInfo /></button>
        <button className="icon-btn" aria-label={ui.settings} title={ui.settings} aria-expanded={panel === 'settings'} aria-controls="voice-options" onClick={(event) => { panelTrigger.current = event.currentTarget; setPanel(panel === 'settings' ? null : 'settings'); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 1-3-2-2 1-3-3-2-3 1-2-2Z"/></svg></button>
        <button className="icon-btn" aria-label={x.exit} title={x.exit} onClick={closeVoice}><IcClose /></button>
      </header>

      <div className="voice-stage">
        {speechError && <p className="err" role="alert">{speechError}</p>}
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
            {state === 'listening' || state === 'preparing' || state === 'transcribing' || state === 'thinking' ? <IcStop /> : <IcMic />}
            {state === 'listening' ? a.stopListening : state === 'speaking' ? a.interrupt : state === 'preparing' || state === 'transcribing' ? x.stop : state === 'thinking' ? a.cancel : x.talk}
          </button>
        )}
        {answer && !answer.streaming && !busy && <div className="voice-answer-actions" aria-label={a.showAnswer}>
          {mapUrl && <a ref={mapAnchor} className="chip" href={mapUrl} target="_blank" rel="noreferrer" onClick={() => { invalidate(); setVoiceState('idle'); }}>{a.map}<span className="sr">{lang === 'en' ? ' (new tab)' : lang === 'qu' ? ' (mushuk panka)' : ' (nueva pestaña)'}</span></a>}
          {sourceUrl && <a ref={sourceAnchor} className="chip" href={sourceUrl} target="_blank" rel="noreferrer" onClick={() => { invalidate(); setVoiceState('idle'); }}>{a.source}</a>}
          <button type="button" className="chip" onClick={() => { invalidate(); pending.current = false; (onShowAnswer ?? onClose)(); }}>{a.showAnswer}</button>
          {answer.clarify?.options.map((option, index) => <button type="button" className="chip" key={option} onClick={() => ask(option)}>{index + 1}. {option}</button>)}
          {!!answer.procedure?.steps.length && <div className="voice-step-controls">
            <p>{a.step} {Math.max(0, visibleStep) + 1}/{answer.procedure.steps.length}: {answer.procedure.steps[Math.max(0, visibleStep)]?.title}</p>
            <button type="button" className="chip" disabled={visibleStep <= 0} onClick={() => handle('previous')}>{a.previous}</button>
            <button type="button" className="chip" disabled={visibleStep >= answer.procedure.steps.length - 1} onClick={() => handle('next')}>{a.next}</button>
            <button type="button" className="chip" onClick={() => handle('repeat')}>{a.repeat}</button>
            <button type="button" className="chip" onClick={() => handle('all steps')}>{a.all}</button>
          </div>}
        </div>}
        {stt && state !== 'start' && <button type="button" className="voice-type-toggle" onClick={() => { invalidate(); setVoiceState('idle'); setShowTyped(!showTyped); }}>{showTyped ? a.hideText : a.text}</button>}

        {(!stt || showTyped) && state !== 'start' && (
          <form className="voice-typed" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { handle(typed.trim()); setTyped(''); } }}>
            <p className="small">{lang === 'qu' ? ui.editTranscript : x.noStt}</p>
            <label className="sr" htmlFor="voice-q">{x.typed}</label>
            <input id="voice-q" className="inp" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={x.typed} disabled={busy || state === 'thinking'} />
            <button className="btn primary" disabled={!typed.trim() || busy || state === 'thinking'}>{x.send}</button>
          </form>
        )}
      </div>

      {panel && <aside id="voice-options" ref={panelRef} className="voice-options" aria-label={panelTitle}>
        <div className="voice-options-head"><h2>{panelTitle}</h2><button className="icon-btn" aria-label={ui.closePanel} onClick={closePanel}><IcClose /></button></div>
        {panel === 'info' ? <div className="voice-info">
          <p>{ui.naturalSpeech}</p>
          {lang === 'qu' ? <><p>{ui.recordingNote}</p><p>{ui.voiceNote}</p><a href="https://huggingface.co/facebook/mms-tts-quw" target="_blank" rel="noreferrer">Meta MMS · CC BY-NC 4.0</a></> : <p>{ui.browserNote}</p>}
          <p className="small">{x.help}</p>
        </div> : <div className="voice-prefs">
        <label className="field"><span>{x.speed}</span>
          <select className="inp" value={prefs.rate} onChange={(e) => setPrefs({ rate: Number(e.target.value) })}>
            {[0.7, 0.85, 1, 1.15, 1.3, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {(
          <label className="field"><span>{x.voice}</span>
            <select className="inp" value={voices.some((v) => v.voiceURI === prefs.voiceURI) ? prefs.voiceURI : lang === 'qu' ? 'mms-quw' : voices[0]?.voiceURI ?? ''} onChange={(e) => setPrefs({ voiceURI: e.target.value || undefined })}>
              {lang === 'qu' ? <option value="mms-quw">{ui.tenaVoice} · {serverVoice ? 'Meta MMS' : ui.unavailable}</option> : voices.length === 0 ? <option value="">{ui.defaultVoice}</option> : null}
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name.replace(/^Microsoft |^Google /, '')} ({v.lang})</option>)}
            </select>
          </label>
        )}
        {lang === 'qu' && serverVoice && <button type="button" className="chip" disabled={state === 'speaking' || state === 'listening' || state === 'preparing' || state === 'transcribing' || busy} onClick={() => void say('Imanalla. Ñuka shutika Yachi.', false)}>{ui.tryVoice}</button>}
        {lang === 'qu' && <label className="check"><input type="checkbox" checked={prefs.reviewKichwa !== false} onChange={(e) => setPrefs({ reviewKichwa: e.target.checked })} />{a.reviewTranscript}</label>}
        <label className="check"><input type="checkbox" checked={prefs.autoListen} disabled={lang === 'qu' && prefs.reviewKichwa !== false} onChange={(e) => setPrefs({ autoListen: e.target.checked })} />{x.auto}</label>
        {!ttsSupported(lang) && <p className="err">{ui.ttsUnavailable}</p>}
      </div>}
      </aside>}
    </motion.div>
  );
}
