import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { BRAND } from '../config';
import { useT } from '../lib/i18n';
import { IcShield } from './icons';

const KEY = `yt-consent-${BRAND.consentVersion}`;

/** Mantiene el foco dentro del diálogo al tabular (el fondo además queda `inert`). */
export function trapFocus(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const f = e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0]!, last = f[f.length - 1]!;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
export const hasConsent = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem(KEY, '1'); } catch { /* modo privado: se pedirá otra vez */ } };

const TEXT = {
  es: {
    title: 'Antes de empezar',
    intro: `${BRAND.mascotName} responde con la información que ${BRAND.university} ha cargado en su base de conocimiento. Al usarlo, aceptas lo siguiente:`,
    items: [
      <>Tus preguntas se guardan de forma <b>anónima</b> para mejorar el servicio y saber qué temas se consultan más.</>,
      <><b>No escribas ni adjuntes datos personales</b> (cédula, notas, contraseñas, información médica). El asistente no los necesita.</>,
      <>Las respuestas pueden contener errores. Cada respuesta indica el documento, la versión y la fecha de donde sale: verifica ahí antes de tomar una decisión.</>,
      <>Toda la información del asistente es pública para quien lo use.</>,
    ],
    contact: 'Dudas sobre tus datos:', close: 'Cerrar', accept: 'Entiendo y acepto',
  },
  en: {
    title: 'Before you start',
    intro: `${BRAND.mascotName} answers with the information ${BRAND.university} has loaded into its knowledge base. By using it you accept the following:`,
    items: [
      <>Your questions are stored <b>anonymously</b> to improve the service and see which topics are asked most.</>,
      <><b>Do not type or attach personal data</b> (ID numbers, grades, passwords, medical information). The assistant does not need them.</>,
      <>Answers may contain mistakes. Each answer shows the source document, version and date: check it before making a decision.</>,
      <>All the assistant's information is public to anyone who uses it.</>,
    ],
    contact: 'Questions about your data:', close: 'Close', accept: 'I understand and accept',
  },
};

/**
 * Aviso de uso de datos. TEXTO BORRADOR: debe revisarlo el área legal / protección de datos de la universidad
 * (Ley Orgánica de Protección de Datos Personales del Ecuador).
 */
export function ConsentDialog({ open, onAccept, onClose }: { open: boolean; onAccept: () => void; onClose?: () => void }) {
  const { lang } = useT();
  const x = TEXT[lang === 'en' ? 'en' : 'es'];
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) btn.current?.focus(); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
          <motion.div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title" onKeyDown={trapFocus}
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
            <div className="row" style={{ gap: 10 }}><IcShield width={22} height={22} style={{ color: 'var(--accent)' }} /><h2 id="consent-title">{x.title}</h2></div>
            <p className="muted">{x.intro}</p>
            <ul>{x.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            <p className="small muted">{x.contact} {BRAND.contact}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {onClose && <button className="btn ghost" onClick={onClose}>{x.close}</button>}
              <button ref={btn} className="btn primary" onClick={() => { saveConsent(); onAccept(); }}>{x.accept}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
