import { useEffect, useState } from 'react';
import { getAdminSummary, listAdminGuides, type AdminGuide, type AdminSummary } from '../lib/api';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const usd = (n: number | null | undefined, d = 4) => (n == null ? '—' : `$${n.toFixed(d)}`);
const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Go = (tab: 'inbox' | 'inquiries' | 'validation' | 'cost' | 'docs' | 'guides') => void;

/** Inicio: cómo le va al asistente esta semana y qué necesita atención, sin recorrer pestaña por pestaña. */
export function Home({ onGo }: { onGo: Go }) {
  const [s, setS] = useState<AdminSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void getAdminSummary().then(setS).catch(() => setError(true)); }, []);

  if (error) return <p className="small" role="status">No se pudo cargar el resumen. Recarga la página para intentarlo de nuevo.</p>;
  if (!s) return <p className="small muted" role="status">Cargando resumen…</p>;

  const w = s.week;
  const votes = s.feedback.up + s.feedback.down;
  const v = s.lastValidation;
  const u = s.usage;
  const langs = Object.entries(s.langs).sort((a, b) => b[1] - a[1]);
  const langText = langs.map(([k, n]) => `${k.toUpperCase()} ${n}`).join(' · ') || '—';
  const top = langs[0];

  return (
    <>
      <header><div><h2>Inicio</h2><p>Uso real de los últimos 7 días (sin las sesiones de prueba), lo que necesita atención y el estado del modelo.</p></div></header>

      <div className="kpis">
        <div className="kpi"><b>{w.total.toLocaleString('es-EC')}</b><span>consultas en 7 días · {w.today} hoy · {w.sessions} sesiones</span></div>
        <div className="kpi"><b>{pct(w.answered, w.total)} %</b><span>respondidas con fuente o lugar</span></div>
        <div className="kpi"><b>{pct(w.unanswered, w.total)} %</b><span>sin información oficial (derivadas)</span></div>
        <div className="kpi"><b>{secs(w.p50)}</b><span>tiempo de respuesta típico · p95 {secs(w.p95)}</span></div>
        <div className="kpi"><b>{votes ? `${pct(s.feedback.up, votes)} %` : '—'}</b><span>votos positivos ({s.feedback.up} a favor · {s.feedback.down} en contra)</span></div>
        <div className="kpi"><b>{top ? `${pct(top[1], w.total)} % ${top[0].toUpperCase()}` : '—'}</b><span>por idioma: {langText}</span></div>
      </div>

      <div className="card">
        <b>Necesita atención</b>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => onGo('inbox')}>{s.pending.inbox} preguntas sin respuesta por revisar</button>
          <button className="btn sm" onClick={() => onGo('inquiries')}>{s.pending.inquiries} consultas nuevas de estudiantes</button>
          <button className="btn sm" onClick={() => onGo('docs')}>{s.pending.docs} documentos vigentes{s.pending.doc_errors ? ` · ${s.pending.doc_errors} con error` : ''}</button>
          <button className="btn sm" onClick={() => onGo('guides')}>{s.guides} guías de trámite publicadas</button>
        </div>
        <p className="small muted">Además: {w.care} mensajes derivados a apoyo (crisis, denuncias o salud), {w.ood} fuera del ámbito y {w.conversation} saludos o aclaraciones.</p>
      </div>

      <div className="card">
        <b>Última validación del set de control</b>
        {v ? (
          <>
            <div className="kpis" style={{ marginTop: 8 }}>
              <div className="kpi"><b>{v.accuracy} %</b><span>exactitud ({v.ok}/{v.total})</span></div>
              <div className="kpi"><b>{v.es} / {v.en} %</b><span>español / inglés</span></div>
              <div className="kpi"><b>{v.hallucinations}</b><span>respuestas sin fuente</span></div>
              <div className="kpi"><b>{secs(v.p50)}</b><span>latencia p50 · p95 {secs(v.p95)}</span></div>
            </div>
            <p className="small muted">{fmt(v.at)} · {v.model} · <button className="linkish" onClick={() => onGo('validation')}>ver historial</button></p>
          </>
        ) : <p className="small muted">Aún no se ha corrido. <button className="linkish" onClick={() => onGo('validation')}>Ir a Validación</button></p>}
      </div>

      <div className="card">
        <b>Modelo y gasto real</b>
        {u ? (
          <>
            <div className="kpis" style={{ marginTop: 8 }}>
              <div className="kpi"><b>{usd(u.spentUsd, 2)}</b><span>gastado{u.budgetUsd > 0 ? ` de $${u.budgetUsd.toFixed(2)} (tope)` : ' (sin tope)'}</span></div>
              <div className="kpi"><b>{usd(u.real?.perQueryUsd)}</b><span>costo real por consulta ({u.real?.queries ?? 0} medidas)</span></div>
              <div className="kpi"><b>{u.active ? 'Activo' : 'Sin modelo'}</b><span>{u.model}</span></div>
            </div>
            <p className="small muted"><button className="linkish" onClick={() => onGo('cost')}>Ver el detalle y la proyección mensual</button></p>
          </>
        ) : <p className="small muted">Sin registro de uso del modelo.</p>}
      </div>
    </>
  );
}

/** Guías de trámite: qué, cómo, en qué orden y con qué documentos; cada dato con su cita verificada. */
export function Guides() {
  const [items, setItems] = useState<AdminGuide[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void listAdminGuides().then(setItems).catch(() => setError(true)); }, []);

  return (
    <>
      <header>
        <div><h2>Guías de trámite</h2><p>Guías paso a paso que el asistente muestra como tarjeta. Solo se publican si cada dato tiene una cita textual que sigue presente en el documento vigente; al reemplazar o retirar el documento, la guía se revalida.</p></div>
        <span className="sp" />
        <a className="btn" href="#/guias" target="_blank" rel="noreferrer">Ver como estudiante</a>
      </header>
      {error && <p className="small" role="status">No se pudieron cargar las guías.</p>}
      {items && (
        <div className="kpis">
          <div className="kpi"><b>{items.length}</b><span>guías publicadas</span></div>
          <div className="kpi"><b>{items.reduce((n, g) => n + g.steps.length, 0)}</b><span>pasos en total</span></div>
          <div className="kpi"><b>{items.reduce((n, g) => n + g.evidence, 0)}</b><span>citas verificadas</span></div>
          <div className="kpi"><b>{items.filter((g) => g.hasEnglish).length}/{items.length}</b><span>disponibles en inglés</span></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Trámite</th><th>Oficina</th><th>Pasos</th><th>Documentos</th><th>Plazos</th><th>Citas</th><th>Fuente</th></tr></thead>
          <tbody>
            {(items ?? []).map((g) => (
              <tr key={g.id}>
                <td>
                  <button className="linkish t" style={{ textAlign: 'left' }} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>{g.title}</button>
                  {open === g.id && (
                    <div className="small" style={{ marginTop: 8 }}>
                      {g.summary && <p>{g.summary}</p>}
                      <ol>{g.steps.map((st, i) => <li key={i}><b>{st.title}</b>{st.detail ? ` — ${st.detail}` : ''}</li>)}</ol>
                      {g.documents.length > 0 && <p><b>Qué necesitas:</b> {g.documents.join(' · ')}</p>}
                      {g.deadlines.length > 0 && <p><b>Plazos:</b> {g.deadlines.map((d) => `${d.title}: ${d.start}${d.end ? ` a ${d.end}` : ''}`).join(' · ')}</p>}
                    </div>
                  )}
                </td>
                <td className="small">{g.office ?? '—'}</td>
                <td className="mono">{g.steps.length}</td>
                <td className="mono">{g.documents.length || <span className="muted" title="La fuente no lista documentos para este trámite">—</span>}</td>
                <td className="mono">{g.deadlines.length || '—'}</td>
                <td className="mono">{g.evidence}</td>
                <td className="small mono" style={{ wordBreak: 'break-all', maxWidth: 260 }}>{g.docId}{g.period ? ` · ${g.period}` : ''}</td>
              </tr>
            ))}
            {items && !items.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 32 }}>No hay guías publicadas.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">Las guías se curan a partir de los documentos oficiales y se cargan en la tabla <span className="mono">procedures</span>; la edición desde el Portal queda como siguiente paso (ver plan de adopción).</p>
    </>
  );
}
