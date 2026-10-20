import { motion } from 'motion/react';
import { useState } from 'react';
import { placeById, placeName } from '../lib/campus';
import { docHref } from '../lib/api';
import { locatorLabel, useT } from '../lib/i18n';
import type { Procedure, Unknown } from '../lib/types';
import { IcCheck, IcMap } from './icons';

/** Guía paso a paso: qué es, qué documentos, en qué orden y dónde. El estudiante puede ir marcando los pasos. */
export function ProcedureCard({ p, onShowMap }: { p: Procedure; onShowMap: (placeId: string) => void }) {
  const { t, lang } = useT();
  const [done, setDone] = useState<number[]>([]);
  const toggle = (i: number) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  const place = p.placeId ? placeById(p.placeId) : undefined;
  return (
    <motion.section className="proc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-label={p.title}>
      <header>
        <h2>{p.title}</h2>
        <p className="muted">{p.summary}</p>
        <dl className="proc-meta">
          <div><dt>{t('office')}</dt><dd>{p.office}</dd></div>
          {p.duration && <div><dt>{t('time')}</dt><dd>{p.duration}</dd></div>}
          {place && <div><dt>{t('where')}</dt><dd><button className="linkish" onClick={() => onShowMap(place.id)}><IcMap width={14} height={14} />{placeName(place, lang)}</button></dd></div>}
        </dl>
      </header>

      <div className="proc-block">
        <h3>{t('docs')}</h3>
        <ul className="proc-docs">{p.documents.map((d) => <li key={d}>{d}</li>)}</ul>
      </div>

      <div className="proc-block">
        <h3>{t('steps')} <span className="muted small mono">{done.length}/{p.steps.length}</span></h3>
        <ol className="proc-steps">
          {p.steps.map((s, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <button className="step-check" aria-pressed={done.includes(i)} aria-label={`${t('done')}: ${s.title}`} onClick={() => toggle(i)}>
                {done.includes(i) ? <IcCheck /> : <span className="mono">{i + 1}</span>}
              </button>
              <div><b>{s.title}</b>{s.detail && <p className="muted small">{s.detail}</p>}</div>
            </motion.li>
          ))}
        </ol>
      </div>
      <footer className="small muted row">
        <span>{p.source.title} · {t('version')} {p.source.version} · {locatorLabel(p.source.locator, lang)}</span>
        <span className="sp" />
        {p.source.url && <a href={docHref(p.source.url, p.source.page)} target="_blank" rel="noreferrer">{t('openDoc')}<span className="sr"> (nueva pestaña)</span></a>}
      </footer>
    </motion.section>
  );
}

/** Respuesta "sin información oficial": nunca se inventa una respuesta sin fuente. */
export function UnknownCard({ u, onShowMap }: { u: Unknown; onShowMap: (placeId: string) => void }) {
  const { t } = useT();
  const place = u.contact?.placeId ? placeById(u.contact.placeId) : undefined;
  return (
    <motion.div className="unknown" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <b>{u.reason === 'fuera_de_dominio' ? t('outOfDomain') : t('unknownTitle')}</b>
      {u.contact ? (
        <>
          <p className="muted">{t('unknownBody')}</p>
          <div className="row">
            <span className="tag">{u.contact.office}</span>
            {u.contact.email && <a className="btn sm" href={`mailto:${u.contact.email}`}>{u.contact.email}</a>}
            {place && <button className="btn sm" onClick={() => onShowMap(place.id)}><IcMap width={14} height={14} />{t('showMap')}</button>}
          </div>
        </>
      ) : <p className="muted">{t('outOfDomainBody')}</p>}
    </motion.div>
  );
}
