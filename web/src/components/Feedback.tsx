import { motion } from 'motion/react';
import { useState } from 'react';
import type { FeedbackReason } from '../lib/inbox';
import { useT } from '../lib/i18n';
import { InquiryForm } from './ProcedureCard';
import { IcCheck, IcUser } from './icons';

/**
 * Pregunta de aclaración: ante una consulta ambigua, el asistente pide precisar antes de responder.
 * Reduce respuestas equivocadas por adivinar la intención (lección de GOV.UK Chat).
 */
export function ClarifyCard({ question, options, onPick }: { question: string; options: string[]; onPick: (q: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <motion.div className="clarify" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="group" aria-label={question}>
      <p>{question}</p>
      <div className="follow">
        {options.map((o) => (
          <button key={o} className="chip" aria-pressed={picked === o} disabled={!!picked} onClick={() => { setPicked(o); onPick(o); }}>{o}</button>
        ))}
      </div>
    </motion.div>
  );
}

const REASONS: FeedbackReason[] = ['incorrecta', 'desactualizada', 'no_responde', 'confusa'];

/**
 * Panel tras el 👎: por qué no sirvió (llega a la bandeja "Sin respuesta" del portal) y la opción de hablar con una persona
 * adjuntando la conversación.
 */
export function FeedbackPanel({ office, question, transcript, onReason }: { office: string; question: string; transcript: string; onReason: (r: FeedbackReason | null) => void }) {
  const { t } = useT();
  const [sent, setSent] = useState<FeedbackReason | 'skip' | null>(null);
  const [human, setHuman] = useState(false);
  const label: Record<FeedbackReason, string> = { incorrecta: t('fbIncorrect'), desactualizada: t('fbOutdated'), no_responde: t('fbNotAnswered'), confusa: t('fbConfusing') };
  return (
    <motion.div className="fb-panel" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      {sent ? (
        <p className="fb-thanks" role="status"><IcCheck width={15} height={15} />{t('fbThanks')}</p>
      ) : (
        <>
          <b>{t('fbTitle')}</b>
          <div className="follow">
            {REASONS.map((r) => <button key={r} className="chip" onClick={() => { setSent(r); onReason(r); }}>{label[r]}</button>)}
            <button className="chip ghost" onClick={() => { setSent('skip'); onReason(null); }}>{t('fbSkip')}</button>
          </div>
        </>
      )}
      {!human && <button className="btn sm" onClick={() => setHuman(true)}><IcUser width={14} height={14} />{t('talkHuman')}</button>}
      {human && <InquiryForm office={office} question={question} transcript={transcript} onCancel={() => setHuman(false)} />}
    </motion.div>
  );
}
