import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { useT } from '../lib/i18n';
import type { ProcessStep } from '../lib/types';
import { IcCheck, IcChevron } from './icons';

/**
 * Panel de actividad, al estilo de la investigación de Claude pero con la identidad de Yachay:
 * mientras Yachi trabaja se ve cada paso real (buscar, encontrar, redactar, verificar) y los documentos que aparecen;
 * al terminar se pliega en una línea ("Consultó 3 documentos · 0,9 s") que se puede volver a abrir.
 * Los pasos vienen del backend tal como ocurren: no hay esperas ni pasos inventados para "parecer" que piensa.
 */
export function ActivityPanel({ steps, streaming, latencyMs }: { steps: ProcessStep[]; streaming: boolean; latencyMs?: number }) {
  const { lang } = useT();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const id = useId();
  const docs = [...new Map(steps.flatMap((s) => s.docs ?? []).map((d) => [d.docId, d])).values()];
  const warned = steps.some((s) => s.state === 'warn');
  // Menos de un segundo en ms (las guías y lugares responden en ~30 ms); si no, segundos con un decimal.
  const secs = latencyMs === undefined ? null : latencyMs < 1000 ? `${latencyMs} ms`
    : `${(latencyMs / 1000).toLocaleString(lang === 'en' ? 'en-US' : 'es-EC', { maximumFractionDigits: 1 })} s`;
  const summary = docs.length
    ? (lang === 'en' ? `Consulted ${docs.length} ${docs.length === 1 ? 'document' : 'documents'}` : `Consultó ${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}`)
    : (lang === 'en' ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : `${steps.length} ${steps.length === 1 ? 'paso' : 'pasos'}`);
  const expanded = streaming || open;

  return (
    <div className={`activity${streaming ? ' live' : ''}`}>
      {!streaming && (
        <button type="button" className="activity-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className={warned ? 'activity-dot warn' : 'activity-dot'} aria-hidden="true" />
          <span>{summary}{secs && <span className="muted"> · {secs}</span>}</span>
          <IcChevron width={14} height={14} className={open ? 'activity-chev open' : 'activity-chev'} aria-hidden="true" />
        </button>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ol id={id} className="activity-steps" aria-label={lang === 'en' ? 'What Yachi did' : 'Lo que hizo Yachi'}
            initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
            {steps.map((s) => (
              <motion.li key={s.id} className={`activity-step ${s.state}`} layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <span className="activity-icon" aria-hidden="true">
                  {s.state === 'running' ? <span className="activity-spin" /> : s.state === 'warn' ? '!' : <IcCheck width={12} height={12} />}
                </span>
                <div className="activity-text">
                  <span className={s.state === 'running' ? 'activity-label working' : 'activity-label'}>
                    {s.label}{s.state === 'running' ? '…' : ''}
                    {s.ms !== undefined && <span className="muted mono"> · {s.ms} ms</span>}
                  </span>
                  {s.detail && <span className="activity-detail">{s.detail}</span>}
                  {s.docs && s.docs.length > 0 && (
                    <ul className="activity-docs">
                      {s.docs.map((d, i) => (
                        <motion.li key={d.docId} initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: reduce ? 0 : 0.05 * i, duration: 0.18 }}>
                          <span className="activity-doc-ic" aria-hidden="true" />{d.title}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}
