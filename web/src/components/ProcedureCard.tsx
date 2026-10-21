import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { placeById, placeName } from '../lib/campus';
import { docHref, sendInquiry } from '../lib/api';
import { locatorLabel, useT } from '../lib/i18n';
import type { Procedure, Unknown } from '../lib/types';
import { downloadIcs } from '../lib/ics';
import { IcCalendar, IcCheck, IcCopy, IcMap, IcSend } from './icons';
import { preparationText, usePreparation } from '../lib/procedureProgress';

/** Guía paso a paso: qué es, qué documentos, en qué orden y dónde. El estudiante puede ir marcando los pasos. */
export function ProcedureCard({ p, onShowMap }: { p: Procedure; onShowMap: (placeId: string) => void }) {
  const { t, lang } = useT();
  const { value, toggle, reset, saveError } = usePreparation(p);
  const done = value.steps;
  const [copyStatus, setCopyStatus] = useState('');
  const en = lang === 'en';
  const total = p.documents.length + p.steps.length, completed = done.length + value.documents.length;
  const nextDocument = p.documents.find((_, i) => !value.documents.includes(i));
  const nextStep = p.steps.find((_, i) => !done.includes(i));
  const copy = async () => {
    try { await navigator.clipboard.writeText(preparationText(p, value, lang)); setCopyStatus(en ? 'Guide copied' : 'Guía copiada'); }
    catch { setCopyStatus(en ? 'Could not copy. Download the guide instead.' : 'No se pudo copiar. Puedes descargar la guía.'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([preparationText(p, value, lang)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `yachi-${(p.id ?? 'guia').replace(/[^a-z0-9_-]/gi, '-')}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const place = p.placeId ? placeById(p.placeId) : undefined;
  return (
    <motion.section className="proc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-label={p.title}>
      <header>
        <h2>{p.title}</h2>
        <p className="muted">{p.summary}</p>
        <dl className="proc-meta">
          <div><dt>{t('office')}</dt><dd>{p.office}</dd></div>
          <div><dt>{t('time')}</dt><dd>{p.duration || (en ? 'Not specified in the available source' : 'No especificado en la fuente disponible')}</dd></div>
          {place && <div><dt>{t('where')}</dt><dd><button className="linkish" onClick={() => onShowMap(place.id)}><IcMap width={14} height={14} />{placeName(place, lang)}</button></dd></div>}
        </dl>
      </header>

      <div className="preparation-status">
        <span>{en ? 'Your preparation' : 'Tu preparación'} <b className="mono">{completed}/{total}</b></span>
        {completed > 0 && <button className="linkish small" onClick={reset}>{en ? 'Clear checks' : 'Limpiar marcas'}</button>}
        <progress value={completed} max={Math.max(total, 1)} aria-label={en ? 'Personal preparation progress' : 'Progreso de preparación personal'} />
        <span className="small">{nextDocument ? `${en ? 'Prepare next' : 'Por preparar'}: ${nextDocument}` : nextStep ? `${en ? 'Next step' : 'Siguiente paso'}: ${nextStep.title}` : (en ? 'You have checked every preparation item.' : 'Has marcado todos los elementos de preparación.')}</span>
        <span className="small muted">{en ? 'Saved on this browser. Checking an item does not submit a request.' : 'Se guarda en este navegador. Marcar una tarea no envía una solicitud.'}</span>
        {saveError && <span className="err small" role="alert">{en ? 'Could not save on this browser.' : 'No se pudo guardar en este navegador.'}</span>}
      </div>

      {!!p.requirements?.length && <div className="proc-block"><h3>{en ? 'Before you start' : 'Antes de empezar'}</h3><ul className="proc-docs">{p.requirements.map(r => <li key={r}>{r}</li>)}</ul></div>}

      <div className="proc-block">
        <h3>{t('docs')}</h3>
        {p.documents.length ? <ul className="proc-docs checklist-docs">{p.documents.map((d, i) => <li key={d}><label><input type="checkbox" checked={value.documents.includes(i)} onChange={() => toggle('documents', i)} /><span>{d}</span></label></li>)}</ul> : <p className="muted small">{en ? 'The available source does not list specific documents. Check the current call or contact the office.' : 'La fuente disponible no enumera documentos específicos. Revisa la convocatoria vigente o consulta a la dependencia.'}</p>}
      </div>

      <div className="proc-block">
        <h3>{t('steps')} <span className="muted small mono">{done.length}/{p.steps.length}</span></h3>
        <ol className="proc-steps">
          {p.steps.map((s, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <button className="step-check" aria-pressed={done.includes(i)} aria-label={`${t('done')}: ${s.title}`} onClick={() => toggle('steps', i)}>
                {done.includes(i) ? <IcCheck /> : <span className="mono">{i + 1}</span>}
              </button>
              <div><b>{s.title}</b>{s.detail && <p className="muted small">{s.detail}</p>}</div>
            </motion.li>
          ))}
        </ol>
      </div>
      {p.deadlines && p.deadlines.length > 0 && (
        <div className="proc-block">
          <h3>{t('deadlines')}{p.deadlinesPast && <span className="tag" style={{ marginLeft: 8 }}>{lang === 'en' ? 'Period ended' : 'Período terminado'}</span>}</h3>
          <ul className="deadlines">
            {p.deadlines.map((d) => (
              <li key={d.title}>
                <span><b>{d.title}</b><span className="small muted"> · {fmtRange(d.start, d.end, lang)}</span></span>
                {!p.deadlinesPast && !deadlineEnded(d.end ?? d.start) && <button className="btn sm" onClick={() => downloadIcs(d, `${p.title}. ${t('office')}: ${p.office}. ${p.source.title} (${t('version')} ${p.source.version}, ${p.source.locator}).`)}>
                  <IcCalendar width={14} height={14} />{t('addCal')}<span className="sr">: {d.title}</span>
                </button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(!p.deadlines?.length) && <p className="small muted">{en ? 'No calendar dates are specified in this guide. Check the current call; relative deadlines in the steps still apply.' : 'Esta guía no fija fechas de calendario. Consulta la convocatoria vigente; revisa también los plazos relativos de los pasos.'}</p>}
      {(!!p.contacts?.length || !!p.links?.length) && <details className="proc-block proc-contacts"><summary>{en ? 'Official contacts and links' : 'Contactos y enlaces oficiales'}</summary>
        <div className="follow">{p.links?.filter(l => /^https:\/\//i.test(l.url)).map(l => <a className="btn sm" key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}<span className="sr">{en ? ' (new tab)' : ' (nueva pestaña)'}</span></a>)}</div>
        {p.contacts?.filter(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)).map(c => <p className="small" key={c.label + c.email}>{c.label}: <a href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(p.title)}`}>{c.email}</a></p>)}
      </details>}
      <div className="row"><button className="btn sm" onClick={() => void copy()}><IcCopy width={14} height={14} />{en ? 'Copy guide' : 'Copiar guía'}</button><button className="btn sm" onClick={download}>{en ? 'Download guide' : 'Descargar guía'}</button><span role="status" className="small">{copyStatus}</span></div>
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
            {u.contact.phone && <span className="small muted">{u.contact.phone}</span>}
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

function deadlineEnded(date: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return date < `${get('year')}-${get('month')}-${get('day')}`;
}
