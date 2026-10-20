import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../config';
import { LANGS, useT } from '../lib/i18n';
import type { Attachment } from '../lib/types';
import { IcCapture, IcClip, IcMic, IcSend, IcStop, IcWave } from './icons';

const MAX_FILES = 4;
const MAX_MB = 8;

interface Props {
  value: string;
  onChange: (v: string) => void;
  files: Attachment[];
  onFiles: (f: Attachment[]) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Preguntas parecidas mientras escribe (de las tendencias). */
  hints?: string[];
  onHint?: (q: string) => void;
  toast: (msg: string) => void;
  onVoice?: () => void;
}

/**
 * Caja de texto con lo que ya usa el Help Desk de RIPCON: dictado por voz, adjuntar imagen o PDF,
 * capturar pantalla y pegar capturas con Ctrl+V.
 */
export function Composer({ value, onChange, files, onFiles, onSend, onStop, busy, disabled, autoFocus, hints = [], onHint, toast, onVoice }: Props) {
  const { t, lang } = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState<{ stop: () => void } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const add = (list: File[]) => {
    const ok = list.filter((f) => (f.type.startsWith('image/') || f.type === 'application/pdf') && f.size <= MAX_MB * 1024 * 1024);
    if (ok.length < list.length) toast(`Solo imágenes o PDF de hasta ${MAX_MB} MB`);
    const room = MAX_FILES - files.length;
    Promise.all(ok.slice(0, room).map((f) => new Promise<Attachment>((res) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name || 'captura.png', type: f.type, url: r.result as string });
      r.readAsDataURL(f);
    }))).then((a) => a.length && onFiles([...files, ...a]));
  };

  // Pegar capturas con Ctrl+V en cualquier parte de la página.
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])];
      if (f.length) { e.preventDefault(); add(f); }
    };
    document.addEventListener('paste', on);
    return () => document.removeEventListener('paste', on);
  });

  async function capture() {
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const v = document.createElement('video');
      v.srcObject = st; v.muted = true;
      await v.play();
      await new Promise((r) => setTimeout(r, 250));
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      st.getTracks().forEach((x) => x.stop());
      onFiles([...files, { name: `captura-${Date.now()}.png`, type: 'image/png', url: c.toDataURL('image/png') }].slice(0, MAX_FILES));
    } catch {
      toast(t('captureNo'));
      ref.current?.focus();
    }
  }

  function mic() {
    if (rec) { rec.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { toast(t('micNo')); return; }
    const r = new SR();
    r.lang = LANGS.find((l) => l.id === lang)!.speech;
    r.interimResults = true;
    r.continuous = false;
    const base = value ? `${value.trim()} ` : '';
    r.onresult = (ev) => onChange(base + Array.from(ev.results).map((x) => x[0]!.transcript).join(' '));
    r.onerror = () => { setRec(null); toast(t('micNo')); };
    r.onend = () => { setRec(null); ref.current?.focus(); };
    r.start();
    setRec({ stop: () => r.stop() });
  }

  const canSend = (value.trim() || files.length) && !disabled;
  return (
    <div className="composer-box">
      <AnimatePresence>
        {hints.length > 0 && !busy && (
          <motion.div className="hints" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
            <span className="muted small">{t('typingHints')}</span>
            {hints.map((h) => <button key={h} type="button" className="chip" onClick={() => onHint?.(h)}>{h}</button>)}
          </motion.div>
        )}
      </AnimatePresence>
      <form className={`composer${rec ? ' listening' : ''}`} onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }}>
        {files.length > 0 && (
          <div className="tray">
            {files.map((f, i) => (
              <span key={i} className="tray-item">
                {f.type.startsWith('image/') ? <button type="button" className="thumb" onClick={() => setZoom(f.url)} aria-label={f.name}><img src={f.url} alt="" /></button> : <span className="pdf mono">PDF</span>}
                <button type="button" className="x" onClick={() => onFiles(files.filter((_, k) => k !== i))} aria-label={t('removeFile')}>×</button>
              </span>
            ))}
          </div>
        )}
        <label htmlFor="ask" className="sr">{t('placeholder', { name: BRAND.mascotName })}</label>
        <textarea id="ask" ref={ref} rows={1} value={value} autoFocus={autoFocus} disabled={disabled} placeholder={rec ? t('micOn') : t('placeholder', { name: BRAND.mascotName })} maxLength={1000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) onSend(); } }} />
        <div className="composer-bar">
          <button type="button" className="icon-btn" title={t('attach')} aria-label={t('attach')} onClick={() => fileRef.current?.click()} disabled={disabled || files.length >= MAX_FILES}><IcClip /></button>
          <button type="button" className="icon-btn" title={t('capture')} aria-label={t('capture')} onClick={capture} disabled={disabled || files.length >= MAX_FILES}><IcCapture /></button>
          <button type="button" className={`icon-btn mic${rec ? ' on' : ''}`} title={t('mic')} aria-label={t('mic')} aria-pressed={!!rec} onClick={mic} disabled={disabled}><IcMic /></button>
          <span className="sp" />
          {onVoice && <button type="button" className="voice-btn" onClick={onVoice} disabled={disabled} title={t('voiceMode')}><IcWave /><span>{lang === 'en' ? 'Voice' : 'Voz'}</span><span className="sr"> — {t('voiceMode')}</span></button>}
          {busy
            ? <button type="button" className="send" onClick={onStop} aria-label={t('stop')}><IcStop /></button>
            : <button type="submit" className="send" disabled={!canSend} aria-label={t('send')}><IcSend /></button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </form>
      <AnimatePresence>
        {zoom && (
          <motion.div className="scrim" role="dialog" aria-modal="true" aria-label="Vista previa" tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={(e) => e.key === 'Escape' && setZoom(null)} onClick={() => setZoom(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.img className="lightbox" src={zoom} alt="Vista previa del adjunto" initial={{ scale: 0.95 }} animate={{ scale: 1 }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tipos mínimos de Web Speech API (no vienen en lib.dom). */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
