import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { placeById, placeName } from '../lib/campus';
import { docHref, sendInquiry } from '../lib/api';
import { locatorLabel, useT } from '../lib/i18n';
import type { Procedure, Unknown } from '../lib/types';
import { downloadIcs } from '../lib/ics';
import { IcCalendar, IcCheck, IcMap, IcSend } from './icons';

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
      {p.deadlines && p.deadlines.length > 0 && (
        <div className="proc-block">
          <h3>{t('deadlines')}</h3>
          <ul className="deadlines">
            {p.deadlines.map((d) => (
              <li key={d.title}>
                <span><b>{d.title}</b><span className="small muted"> · {fmtRange(d.start, d.end, lang)}</span></span>
                <button className="btn sm" onClick={() => downloadIcs(d, `${p.title}. ${t('office')}: ${p.office}. ${p.source.title} (${t('version')} ${p.source.version}, ${p.source.locator}).`)}>
                  <IcCalendar width={14} height={14} />{t('addCal')}<span className="sr">: {d.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <footer className="small muted row">
        <span>{p.source.title} · {t('version')} {p.source.version} · {locatorLabel(p.source.locator, lang)}</span>
        <span className="sp" />
        {p.source.url && <a href={docHref(p.source.url, p.source.page)} target="_blank" rel="noreferrer">{t('openDoc')}<span className="sr"> (nueva pestaña)</span></a>}
      </footer>
    </motion.section>
  );
}

/** Respuesta "sin información oficial": nunca se inventa una respuesta sin fuente. */
export function UnknownCard({ u, question, transcript, onShowMap }: { u: Unknown; question?: string; transcript?: string; onShowMap: (placeId: string) => void }) {
  const { t } = useT();
  const [form, setForm] = useState(false);
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
            {!form && <button className="btn sm primary" onClick={() => setForm(true)}><IcSend width={14} height={14} />{t('sendToOffice')}</button>}
          </div>
          {form && <InquiryForm office={u.contact.office} question={question ?? ''} transcript={transcript} onCancel={() => setForm(false)} />}
        </>
      ) : <p className="muted">{t('outOfDomainBody')}</p>}
    </motion.div>
  );
}

/**
 * Envía la consulta a la dependencia. Pide solo lo necesario (correo y pregunta) y una autorización explícita (LOPDP).
 * Devuelve un código de seguimiento; en producción crea la consulta en el backend y avisa a la dependencia.
 */
export function InquiryForm({ office, question, transcript, onCancel }: { office: string; question: string; transcript?: string; onCancel: () => void }) {
  const { t, lang } = useT();
  const [attach, setAttach] = useState(true);
  const turns = transcript ? transcript.split('\n').filter(Boolean).length : 0;
  const [email, setEmail] = useState('');
  const [q, setQ] = useState(question);
  const [ok, setOk] = useState(false);
  const [state, setState] = useState<'edit' | 'sending' | 'done' | 'error'>('edit');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr(t('inqInvalid')); return; }
    setErr(null); setState('sending');
    try { const r = await sendInquiry({ office, email: email.trim(), question: q.trim(), lang, transcript: attach && transcript ? transcript : undefined }); setCode(r.code); setState('done'); }
    catch { setState('error'); }
  };
  if (state === 'done') return <p className="inq-done" role="status"><IcCheck width={16} height={16} />{t('inqDone', { office, code })}</p>;
  return (
    <form className="inq" onSubmit={submit} noValidate>
      <label className="field"><span>{t('inqEmail')}</span>
        <input className="inp" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@yachaytech.edu.ec" aria-invalid={!!err} aria-describedby={err ? 'inq-err' : undefined} />
      </label>
      <label className="field"><span>{t('inqQuestion')}</span>
        <textarea className="inp" rows={2} required maxLength={1000} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {turns > 1 && <label className="check"><input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />{t('attachChat', { n: String(turns) })}</label>}
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} required />{t('inqConsent', { office })}</label>
      {err && <p id="inq-err" className="err">{err}</p>}
      {state === 'error' && <p className="err" role="alert">{t('inqError')}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={onCancel}>{t('cancel')}</button>
        <button className="btn sm primary" disabled={!ok || !q.trim() || !email || state === 'sending'}>{state === 'sending' ? t('inqSending') : t('inqSend')}</button>
      </div>
    </form>
  );
}

function fmtRange(start: string, end: string | undefined, lang: string) {
  const f = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
  return end && end !== start ? `${f(start)} – ${f(end)}` : f(start);
}
