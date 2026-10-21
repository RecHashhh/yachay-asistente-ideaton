import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Mascot } from './Mascot';
import { BRAND, PRIVACY } from '../config';
import { useT } from '../lib/i18n';
import { IcShield } from './icons';

const KEY = `yt-consent-${BRAND.consentVersion}`;

/** Mantiene el foco dentro del diálogo al tabular (el fondo además queda `inert`). */
export function trapFocus(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const f = e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,summary,[tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0]!, last = f[f.length - 1]!;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
export const hasConsent = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem(KEY, '1'); } catch { /* modo privado: se pedirá otra vez */ } };

/** Revocar el consentimiento (LOPDP art. 12, num. 13) y borrar lo que este navegador guardó: conversaciones e idioma. */
export function revokeConsent() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('yt-consent-') || k === 'yt-chats' || k === 'yt-lang') localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* sin almacenamiento */ }
  location.reload();
}

type Row = [string, ReactNode];

/** Bienvenida de la primera visita: qué hace, cómo verificar y (paso 3) el aviso de datos. Patrón validado por GOV.UK Chat. */
const ONBOARD = {
  es: {
    step: 'Paso {n} de 3', next: 'Siguiente', back: 'Atrás', skip: 'Ir al aviso',
    srcExample: 'Reglamento de régimen académico · pág. 18',
    title: [`Hola, soy ${BRAND.mascotName}`, 'Cada respuesta trae su fuente'],
    body: [
      `Te ayudo con trámites, normativa, servicios y ubicaciones de ${BRAND.university}, en español e inglés. Pregunta como le preguntarías a un compañero; si tu consulta es ambigua, te pediré precisarla.`,
      'Verás el documento, la versión y la fecha de donde sale cada dato. Si no hay información oficial, te lo diré y te conectaré con la dependencia. Soy una inteligencia artificial y puedo equivocarme: revisa la fuente antes de decidir.',
    ],
  },
  en: {
    step: 'Step {n} of 3', next: 'Next', back: 'Back', skip: 'Go to notice',
    srcExample: 'Academic regulations · p. 18',
    title: [`Hi, I'm ${BRAND.mascotName}`, 'Every answer shows its source'],
    body: [
      `I help with ${BRAND.university} procedures, regulations, services and locations, in Spanish and English. Ask as you would ask a classmate; if your question is ambiguous, I will ask you to clarify.`,
      'You will see the document, version and date behind each fact. If there is no official information, I will say so and connect you with the office. I am an artificial intelligence and can make mistakes: check the source before deciding.',
    ],
  },
};

const TEXT: Record<'es' | 'en', { title: string; intro: string; items: ReactNode[]; more: string; rows: Row[]; contact: string; close: string; accept: string; revoke: string }> = {
  es: {
    title: 'Antes de empezar',
    intro: `${BRAND.mascotName} es un asistente de inteligencia artificial de ${BRAND.university}, no una persona. Responde solo con los documentos oficiales que la universidad ha cargado. Al usarlo, aceptas lo siguiente:`,
    items: [
      <>Tus preguntas se guardan de forma <b>anónima</b> para mejorar el servicio y saber qué temas se consultan más.</>,
      <><b>No escribas ni adjuntes datos personales</b> (cédula, notas, contraseñas, información médica). El asistente no los necesita.</>,
      <>Las respuestas pueden contener errores. Cada una indica el documento, la versión y la fecha de donde sale: verifica ahí antes de tomar una decisión. El asistente <b>no toma decisiones</b> sobre tu situación académica.</>,
      <>Puedes retirar este consentimiento cuando quieras desde «Aviso de uso de datos».</>,
    ],
    more: 'Aviso de privacidad completo (LOPDP, art. 12)',
    rows: [
      ['Responsable', <>{PRIVACY.controller}. {PRIVACY.address}. {PRIVACY.phone} · {PRIVACY.email}</>],
      ['Delegado de protección de datos', PRIVACY.dpoEmail],
      ['Finalidad', 'Responder consultas sobre trámites, normativa, servicios y ubicaciones; medir qué temas se consultan para mejorar la información.'],
      ['Base legal', 'Tu consentimiento, que puedes revocar en cualquier momento.'],
      ['Datos que se tratan', 'El texto de tus preguntas y, si los adjuntas, imágenes o PDF, solo durante la consulta. No se piden nombre, cédula ni correo. Tus conversaciones quedan guardadas únicamente en este navegador.'],
      ['Conservación', PRIVACY.retention],
      ['Mensajes sensibles', 'Si escribes sobre una crisis, acoso o violencia, Yachi te muestra contactos de apoyo de la universidad y no guarda el texto de ese mensaje. Tampoco guarda el texto de los mensajes ofensivos. Los números de cédula, teléfono, tarjeta y correos se ocultan antes de procesar la pregunta.'],
      ['Transferencia internacional', PRIVACY.transfer],
      ['Modo voz', 'Si usas el micrófono, el audio lo transcribe el servicio de reconocimiento de voz de tu navegador (Google en Chrome, Microsoft en Edge). Yachi recibe solo el texto y no guarda audio.'],
      ['Decisiones automatizadas', 'Ninguna. El asistente informa; los trámites los resuelve la dependencia responsable.'],
      ['Tus derechos', 'Acceso, rectificación y actualización, eliminación, oposición, portabilidad, limitación del tratamiento y a no ser objeto de decisiones automatizadas. Escribe al delegado de protección de datos.'],
      ['Si no aceptas', 'No podrás usar el chat, pero toda la información sigue disponible en la página web de la universidad y en las dependencias.'],
      ['Reclamos', 'Ante el responsable y, en segunda instancia, ante la Superintendencia de Protección de Datos Personales.'],
    ],
    contact: 'Dudas sobre tus datos:', close: 'Cerrar', accept: 'Entiendo y acepto',
    revoke: 'Retirar consentimiento y borrar mis datos de este navegador',
  },
  en: {
    title: 'Before you start',
    intro: `${BRAND.mascotName} is an artificial intelligence assistant of ${BRAND.university}, not a person. It only answers from the official documents the university has uploaded. By using it you accept the following:`,
    items: [
      <>Your questions are stored <b>anonymously</b> to improve the service and see which topics are asked most.</>,
      <><b>Do not type or attach personal data</b> (ID numbers, grades, passwords, medical information). The assistant does not need them.</>,
      <>Answers may contain mistakes. Each one shows the source document, version and date: check it before making a decision. The assistant <b>does not make decisions</b> about your academic situation.</>,
      <>You can withdraw this consent at any time from "Data use notice".</>,
    ],
    more: 'Full privacy notice (Ecuadorian Data Protection Law, art. 12)',
    rows: [
      ['Controller', <>{PRIVACY.controller}. {PRIVACY.address}. {PRIVACY.phone} · {PRIVACY.email}</>],
      ['Data protection officer', PRIVACY.dpoEmail],
      ['Purpose', 'Answer questions about procedures, regulations, services and locations; measure which topics are asked to improve the information.'],
      ['Legal basis', 'Your consent, which you can withdraw at any time.'],
      ['Data processed', 'The text of your questions and, if you attach them, images or PDFs, only during the query. No name, ID or email is requested. Your conversations are stored only in this browser.'],
      ['Retention', PRIVACY.retentionEn],
      ['Sensitive messages', 'If you write about a crisis, harassment or violence, Yachi shows you the university support contacts and does not store the text of that message. It does not store offensive messages either. ID, phone and card numbers and emails are hidden before your question is processed.'],
      ['International transfer', PRIVACY.transferEn],
      ['Voice mode', 'If you use the microphone, the audio is transcribed by your browser speech service (Google in Chrome, Microsoft in Edge). Yachi only receives the text and stores no audio.'],
      ['Automated decisions', 'None. The assistant informs; procedures are decided by the office in charge.'],
      ['Your rights', 'Access, rectification, erasure, objection, portability, restriction and not being subject to automated decisions. Contact the data protection officer.'],
      ['If you do not accept', 'You cannot use the chat, but all information remains available on the university website and at the offices.'],
      ['Complaints', 'To the controller and then to the Superintendencia de Protección de Datos Personales.'],
    ],
    contact: 'Questions about your data:', close: 'Close', accept: 'I understand and accept',
    revoke: 'Withdraw consent and delete my data from this browser',
  },
};

/**
 * Aviso de uso de datos con la información que exige el art. 12 de la LOPDP (Ecuador) y la divulgación de que es una IA.
 * BORRADOR: los datos de PRIVACY (config.ts) y el texto deben confirmarlos el área legal y el delegado de protección de datos.
 */
export function ConsentDialog({ open, intro, onAccept, onClose }: { open: boolean; intro?: boolean; onAccept: () => void; onClose?: () => void }) {
  const { lang } = useT();
  const x = TEXT[lang === 'en' ? 'en' : 'es'];
  const o = ONBOARD[lang === 'en' ? 'en' : 'es'];
  const btn = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState(intro ? 0 : 2);
  useEffect(() => { if (open) setStep(intro ? 0 : 2); }, [open, intro]);
  useEffect(() => { if (open) btn.current?.focus(); }, [open, step]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
          <motion.div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title" onKeyDown={trapFocus}
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
            {intro && (
              <div className="ob-head">
                <span className="small muted" aria-live="polite">{o.step.replace('{n}', String(step + 1))}</span>
                <span className="ob-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i === step ? 'on' : undefined} />)}</span>
              </div>
            )}
            {step < 2 ? (
              <>
                <div className="ob-art" aria-hidden="true">{step === 0 ? <Mascot size={72} /> : <span className="ob-src"><span className="kind">v2</span>{o.srcExample}</span>}</div>
                <h2 id="consent-title">{o.title[step]}</h2>
                <p className="muted">{o.body[step]}</p>
                <a href="https://www.yachaytech.edu.ec/" target="_blank" rel="noreferrer">{lang === 'en' ? 'Visit the university website without using the chat' : 'Ir a la web de la universidad sin usar el chat'}</a>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn ghost" onClick={() => setStep(2)}>{o.skip}</button>
                  <span className="sp" />
                  {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>{o.back}</button>}
                  <button ref={btn} className="btn primary" onClick={() => setStep(step + 1)}>{o.next}</button>
                </div>
              </>
            ) : (<>
            <div className="row" style={{ gap: 10 }}><IcShield width={22} height={22} style={{ color: 'var(--accent)' }} /><h2 id="consent-title">{x.title}</h2></div>
            <p className="muted">{x.intro}</p>
            <ul>{x.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            <details className="privacy">
              <summary>{x.more}</summary>
              <dl>{x.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </details>
            <p className="small muted">{x.contact} {PRIVACY.dpoEmail}</p>
            <a href="https://www.yachaytech.edu.ec/" target="_blank" rel="noreferrer">{lang === 'en' ? 'Visit the university website without using the chat' : 'Ir a la web de la universidad sin usar el chat'}</a>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {onClose && <button className="btn ghost danger" onClick={revokeConsent}>{x.revoke}</button>}
              <span className="sp" />
              {onClose && <button className="btn ghost" onClick={onClose}>{x.close}</button>}
              {intro && <button className="btn" onClick={() => setStep(1)}>{o.back}</button>}
              <button ref={btn} className="btn primary" onClick={() => { saveConsent(); onAccept(); }}>{x.accept}</button>
            </div>
            </>)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
