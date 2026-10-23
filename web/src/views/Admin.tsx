import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../config';
import { Mascot } from '../components/Mascot';
import { IcArrowLeft, IcMoon, IcSun, IcTrash, IcUpload } from '../components/icons';
import { Cost, Inbox, Validation } from './AdminExtras';
import { Guides, Home } from './AdminHome';
import { Filters } from './AdminFilters';
import { AdminInquiries } from './AdminInquiries';
import {
  SAMPLE_DATA, adminLogin, adminLogout, createTopic, deleteDoc, getTopics, getTrends, listAudit, listDocs, listInbox, listInquiries, reprocessDoc,
  uploadDoc, type Admin as AdminUser, type AuditEntry,
} from '../lib/api';
import type { DocMeta, Topic, Trend } from '../lib/types';

type Tab = 'home' | 'docs' | 'upload' | 'topics' | 'guides' | 'inbox' | 'validation' | 'filters' | 'trends' | 'inquiries' | 'cost' | 'audit';
const ACCEPT = '.pdf,.xlsx,.csv';
const today = () => new Date().toISOString().slice(0, 10);

/** Índice del portal: agrupado por la tarea que resuelve cada sección. */
const NAV: { group: string; items: { id: Tab; label: string }[] }[] = [
  { group: 'Resumen', items: [{ id: 'home', label: 'Inicio' }] },
  { group: 'Contenido', items: [{ id: 'docs', label: 'Documentos' }, { id: 'upload', label: 'Subir documento' }, { id: 'topics', label: 'Temas' }, { id: 'guides', label: 'Guías de trámite' }] },
  { group: 'Calidad de respuestas', items: [{ id: 'inbox', label: 'Sin respuesta' }, { id: 'validation', label: 'Validación' }, { id: 'filters', label: 'Filtros' }] },
  { group: 'Seguimiento', items: [{ id: 'trends', label: 'Tendencias' }, { id: 'inquiries', label: 'Consultas' }, { id: 'cost', label: 'Costo' }, { id: 'audit', label: 'Bitácora' }] },
];
const groupOf = (t: Tab) => NAV.find((g) => g.items.some((i) => i.id === t))?.group ?? '';

export function Admin({ theme, toggleTheme }: { theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const reduce = useReducedMotion();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [pendingInbox, setPendingInbox] = useState(0);
  const [newInquiries, setNewInquiries] = useState(0);
  const [replacing, setReplacing] = useState<DocMeta | null>(null);

  const refresh = useCallback(async () => {
    const [d, t, tr] = await Promise.all([listDocs(), getTopics(), getTrends()]);
    setDocs(d); setTopics(t); setTrends(tr);
    // Contadores del índice: lo que necesita atención (no bloquean si fallan).
    void listInbox().then((xs) => setPendingInbox(xs.filter((x) => x.status === 'nuevo').length)).catch(() => undefined);
    void listInquiries().then((xs) => setNewInquiries(xs.filter((x) => x.status === 'nueva').length)).catch(() => undefined);
  }, []);
  useEffect(() => { if (user) void refresh(); }, [user, refresh]);

  // Mientras haya documentos indexándose, consulta su estado cada 2 s.
  const pending = docs.some((d) => d.status === 'procesando');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void listDocs().then(setDocs), 2000);
    return () => clearInterval(t);
  }, [pending]);

  if (!user) return <Login onLogin={setUser} />;

  const topicName = (id: string) => topics.find((t) => t.id === id)?.name ?? id;
  const go = (t: Tab) => { setTab(t); if (t !== 'upload') setReplacing(null); };
  const errors = docs.filter((d) => d.status === 'error').length;
  const processing = docs.filter((d) => d.status === 'procesando').length;
  const active = docs.filter((d) => d.status === 'indexado').length;

  // Contador de cada sección: [valor, tono, texto para lector de pantalla]
  const counts: Partial<Record<Tab, [number, 'n' | 'warn' | 'crit', string]>> = {
    docs: errors ? [errors, 'crit', errors === 1 ? 'documento con error' : 'documentos con error'] : [active, 'n', 'documentos vigentes'],
    topics: [topics.length, 'n', 'temas'],
    ...(pendingInbox ? { inbox: [pendingInbox, 'warn', 'pendientes'] as [number, 'warn', string] } : {}),
    ...(newInquiries ? { inquiries: [newInquiries, 'warn', 'nuevas'] as [number, 'warn', string] } : {}),
  };
  const seal = errors
    ? { tone: 'crit', text: `${errors} ${errors === 1 ? 'documento con error' : 'documentos con error'}` }
    : processing
      ? { tone: 'warn', text: `Indexando ${processing} ${processing === 1 ? 'documento' : 'documentos'}` }
      : { tone: 'ok', text: `Índice al día · ${active} documentos vigentes` };

  return (
    <div className="adm">
      <header className="adm-band">
        <a className="adm-icon" href="#/" aria-label="Volver al chat"><IcArrowLeft /></a>
        <div className="adm-brand">
          <Mascot size={30} decorative />
          <div><span className="adm-inst">{BRAND.university}</span><b>Portal de la base de conocimiento</b></div>
        </div>
        {SAMPLE_DATA && <span className="badge-demo">Datos de ejemplo</span>}
        <span className="sp" />
        <span className={`adm-seal ${seal.tone}`} role="status"><i aria-hidden="true" />{seal.text}</span>
        <button className="adm-icon" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} onClick={toggleTheme}>{theme === 'dark' ? <IcSun /> : <IcMoon />}</button>
        <span className="adm-user" title={user.email}>{user.email}</span>
        <button className="adm-out" onClick={() => { adminLogout(); setUser(null); }}>Salir</button>
      </header>

      <nav className="adm-index" aria-label="Secciones del portal">
        {NAV.map((g) => (
          <div className="adm-group" key={g.group}>
            <span className="adm-group-h">{g.group}</span>
            <ul>
              {g.items.map((it) => {
                const c = counts[it.id];
                return (
                  <li key={it.id}>
                    <button aria-current={tab === it.id ? 'page' : undefined} onClick={() => go(it.id)}>
                      {tab === it.id && <motion.span layoutId="adm-cur" className="adm-cur" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }} />}
                      <span className="adm-label">{it.label}</span>
                      {c && <span className={`adm-count ${c[1]}`}>{c[0]}<span className="sr"> {c[2]}</span></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.main key={tab} className="adm-main" initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.16 }}>
          <p className="adm-eyebrow">{groupOf(tab)}</p>
          {tab === 'home' && <Home onGo={go} />}
          {tab === 'guides' && <Guides />}
          {tab === 'docs' && <Docs docs={docs} topics={topics} topicName={topicName} onNew={() => go('upload')} onReplace={(d) => { setReplacing(d); setTab('upload'); }} onChanged={() => void refresh()} onDelete={async (d) => { if (confirm(`¿Retirar "${d.title}" de la base de conocimiento? El asistente dejará de usarlo.`)) { await deleteDoc(d.id); await refresh(); } }} />}
          {tab === 'upload' && <Upload topics={topics} docs={docs} replacing={replacing} onDone={async () => { setReplacing(null); await refresh(); setTab('docs'); }} />}
          {tab === 'topics' && <Topics topics={topics} docs={docs} onCreate={async (t) => { await createTopic(t); await refresh(); }} />}
          {tab === 'trends' && <Trends trends={trends} topicName={topicName} />}
          {tab === 'validation' && <Validation />}
          {tab === 'filters' && <Filters />}
          {tab === 'cost' && <Cost />}
          {tab === 'inquiries' && <AdminInquiries />}
          {tab === 'audit' && <Audit />}
          {tab === 'inbox' && <Inbox docs={docs} onUpload={() => go('upload')} onValidate={() => go('validation')} />}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: AdminUser) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="adm-login">
      <motion.div className="adm-login-shell" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Panel de marca (mismo patrón que el Hub): foto institucional bajo un degradado y el propósito del portal. */}
        <aside className="adm-login-brand" aria-labelledby="adm-login-title">
          <div className="adm-login-photo" aria-hidden="true" />
          <div className="adm-login-body">
            <span className="adm-login-eyebrow">{BRAND.university} · Portal de administración</span>
            <h2 id="adm-login-title">La información oficial que {BRAND.mascotName} entrega a los estudiantes.</h2>
            <ul className="adm-login-points">
              <li>Documentos vigentes, con versión y fecha</li>
              <li>Preguntas sin respuesta y validación de veracidad</li>
              <li>Cada cambio queda en la bitácora</li>
            </ul>
          </div>
          <small className="adm-login-credit">Foto: Biblioteca de la Universidad Yachay Tech · yachaytech.edu.ec</small>
        </aside>

        <form className="adm-login-card"
          onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { onLogin(await adminLogin(email.trim(), pw)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
          <Mascot size={64} decorative />
          <h1>Bienvenido</h1>
          <p className="adm-login-sub">Inicia sesión con tu correo institucional para administrar la base de conocimiento de {BRAND.mascotName}.</p>
          <label className="field"><span>Correo institucional</span><input className="inp" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@yachaytech.edu.ec" required /></label>
          <label className="field"><span>Contraseña</span><input className="inp" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn primary adm-login-btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <p className="adm-login-note">Acceso solo para personal autorizado de la universidad.<a href="#/">Volver al chat</a></p>
        </form>
      </motion.div>
    </main>
  );
}

type DocFilter = 'todos' | 'vigentes' | 'proceso' | 'error' | 'antiguos';
const isOld = (d: DocMeta) => !!d.docDate && Date.now() - new Date(d.docDate).getTime() > 365 * 864e5;

function Docs({ docs, topics, topicName, onNew, onReplace, onDelete, onChanged }: { docs: DocMeta[]; topics: Topic[]; topicName: (id: string) => string; onNew: () => void; onReplace: (d: DocMeta) => void; onDelete: (d: DocMeta) => void; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<DocFilter>('todos');
  const [topic, setTopic] = useState('');
  const chunks = docs.reduce((n, d) => n + d.chunks, 0);
  const groups: [DocFilter, string, number][] = [
    ['todos', 'en total', docs.length],
    ['vigentes', 'vigentes', docs.filter((d) => d.status === 'indexado').length],
    ['proceso', 'en proceso', docs.filter((d) => d.status === 'procesando').length],
    ['error', 'con error', docs.filter((d) => d.status === 'error').length],
    ['antiguos', 'de más de un año', docs.filter(isOld).length],
  ];
  const shown = docs.filter((d) =>
    (f === 'todos' || (f === 'vigentes' && d.status === 'indexado') || (f === 'proceso' && d.status === 'procesando') || (f === 'error' && d.status === 'error') || (f === 'antiguos' && isOld(d)))
    && (!topic || d.topicId === topic)
    && `${d.title} ${topicName(d.topicId)} ${d.version}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <header>
        <div><h2>Documentos</h2><p>Lo que {BRAND.mascotName} usa para responder. Solo se usa la versión vigente de cada documento; {chunks.toLocaleString('es-EC')} fragmentos indexados.</p></div>
        <span className="sp" />
        <button className="btn primary" onClick={onNew}><IcUpload width={16} height={16} />Subir documento</button>
      </header>
      <div className="adm-summary" role="group" aria-label="Filtrar por estado">
        {groups.map(([id, label, n]) => (
          <button key={id} aria-pressed={f === id} className={id === 'error' && n ? 'crit' : id === 'antiguos' && n ? 'warn' : undefined} onClick={() => setF(id)}>
            <b>{n}</b><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="adm-tools">
        <input className="inp" placeholder="Buscar por título, tema o versión" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documentos" />
        <select className="inp" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filtrar por tema">
          <option value="">Todos los temas</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="small muted" role="status">{shown.length} de {docs.length}</span>
      </div>
      <div className="table-wrap" role="region" aria-label="Documentos" tabIndex={0}>
        <table className="adm-table">
          <thead><tr><th scope="col">Documento</th><th scope="col">Tema</th><th scope="col">Versión</th><th scope="col">Fecha</th><th scope="col" className="adm-col-origin">Origen</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td><div className="adm-doc"><span className="adm-kind">{d.kind}</span><span><span className="t">{d.title}</span><span className="adm-sub">{d.status === 'indexado' ? `${d.chunks} ${d.chunks === 1 ? 'fragmento' : 'fragmentos'}` : d.status === 'procesando' ? 'Procesando…' : 'Sin indexar'}{d.history?.length ? ` · reemplaza ${d.history.map((h) => h.version).join(', ')}` : ''}</span></span></div></td>
                <td>{topicName(d.topicId)}</td>
                <td className="mono">{d.version}</td>
                <td className={`mono${isOld(d) ? ' adm-old' : ''}`}>{d.docDate}</td>
                <td className="adm-col-origin">{d.origin === 'web' ? (d.url ? <a href={d.url} target="_blank" rel="noreferrer">Web<span className="sr"> (nueva pestaña)</span></a> : 'Web') : 'Interno'}</td>
                <td className="adm-st"><span className={`adm-tag ${d.status}`}>{d.status === 'indexado' ? 'Vigente' : d.status === 'procesando' ? 'Procesando' : 'Error'}</span>
                  {d.notes && d.status !== 'indexado' && <div className={`adm-note small ${d.status === 'error' ? 'err' : 'muted'}`}>{d.notes}</div>}</td>
                <td><div className="adm-actions">
                  {d.status === 'error' && <button className="btn sm" onClick={() => void reprocessDoc(d.id).then(onChanged)}>Reprocesar</button>}
                  <button className="btn sm" onClick={() => onReplace(d)}>Nueva versión</button>
                  <button className="icon-btn danger" aria-label={`Retirar ${d.title}`} title="Retirar" onClick={() => onDelete(d)}><IcTrash /></button>
                </div></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="adm-empty">Ningún documento coincide con el filtro. <button className="btn sm" onClick={() => { setF('todos'); setTopic(''); setQ(''); }}>Ver todos</button></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Upload({ topics, docs, replacing, onDone }: { topics: Topic[]; docs: DocMeta[]; replacing: DocMeta | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState(replacing?.title ?? '');
  const [topicId, setTopicId] = useState(replacing?.topicId ?? '');
  const [version, setVersion] = useState(replacing ? nextVersion(replacing.version) : 'v1');
  const [docDate, setDocDate] = useState(today());
  const [origin, setOrigin] = useState<'web' | 'interno'>(replacing?.origin ?? 'web');
  const [url, setUrl] = useState(replacing?.url ?? '');
  const [replaces, setReplaces] = useState(replacing?.id ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'xlsx', 'csv'].includes(ext)) return setErr('Solo se aceptan archivos PDF, XLSX o CSV.');
    if (f.size > 25 * 1024 * 1024) return setErr('El archivo supera 25 MB.');
    setErr(null); setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const submit = async () => {
    if (!file || !title.trim() || !topicId || !version.trim() || !docDate) return setErr('Completa archivo, título, tema, versión y fecha.');
    setErr(null); setProgress(0);
    try {
      await uploadDoc({ file, title: title.trim(), topicId, version: version.trim(), docDate, origin, url: url.trim() || undefined, replaces: replaces || undefined }, setProgress);
      onDone();
    } catch (e) { setErr((e as Error).message); setProgress(null); }
  };

  return (
    <>
      <header><div><h2>{replacing ? `Nueva versión de «${replacing.title}»` : 'Subir documento'}</h2><p>El archivo se procesa solo: se divide en fragmentos, se indexa y en segundos queda disponible para el asistente. Si reemplaza a otro, el anterior sigue respondiendo hasta que el nuevo esté listo.</p></div></header>
      <div className="adm-upload">
        <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} aria-label="Elegir archivo para subir" onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <IcUpload />
          {file ? <><b>{file.name}</b><span className="small muted">{Math.max(1, Math.round(file.size / 1024))} KB · clic para cambiar</span></> : <><b>Arrastra un archivo o haz clic</b><span className="small muted">PDF, XLSX o CSV · hasta 25 MB</span></>}
          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        <div className="card">
          <div className="form-grid">
            <label className="field wide"><span>Título *</span><input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Calendario académico 2027" /></label>
            <label className="field"><span>Tema *</span><select className="inp" value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Elegir tema…</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="field"><span>Versión *</span><input className="inp mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1, 2026-2…" /></label>
            <label className="field"><span>Fecha del documento *</span><input className="inp" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></label>
            <label className="field"><span>Origen</span><select className="inp" value={origin} onChange={(e) => setOrigin(e.target.value as 'web' | 'interno')}><option value="web">Publicado en la página web</option><option value="interno">Documento interno</option></select></label>
            {origin === 'web' && <label className="field wide"><span>Enlace en la página web</span><input className="inp" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yachaytech.edu.ec/normativa/…" /></label>}
            <label className="field wide"><span>Reemplaza a (opcional)</span><select className="inp" value={replaces} onChange={(e) => setReplaces(e.target.value)}><option value="">Es un documento nuevo</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.version})</option>)}</select></label>
          </div>
          {progress !== null && <div className="progress" aria-label="Progreso de subida"><i style={{ transform: `scaleX(${progress / 100})` }} /></div>}
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={progress !== null} onClick={submit}>{progress !== null ? `Subiendo ${progress} %` : 'Subir e indexar'}</button></div>
        </div>
      </div>
    </>
  );
}

function Topics({ topics, docs, onCreate }: { topics: Topic[]; docs: DocMeta[]; onCreate: (t: Omit<Topic, 'id'>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  return (
    <>
      <header><div><h2>Temas</h2><p>Los temas que se pueden consultar. Cada documento pertenece a uno; sirven para ordenar el catálogo y para elegir la oficina de contacto.</p></div></header>
      <div className="adm-split">
        <div className="table-wrap" role="region" aria-label="Temas" tabIndex={0}>
          <table className="adm-table">
            <thead><tr><th scope="col">Tema</th><th scope="col">Descripción</th><th scope="col" className="num">Documentos</th></tr></thead>
            <tbody>{topics.map((t) => <tr key={t.id}><td className="t">{t.name}</td><td className="muted">{t.description}</td><td className="mono num">{docs.filter((d) => d.topicId === t.id).length}</td></tr>)}</tbody>
          </table>
        </div>
        <form className="card" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await onCreate({ name: name.trim(), description: description.trim(), nameEn: nameEn.trim() || undefined, descriptionEn: descriptionEn.trim() || undefined }); setName(''); setDescription(''); setNameEn(''); setDescriptionEn(''); }}>
          <h3>Agregar tema</h3>
          <label className="field"><span>Nombre</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Investigación" /></label>
          <label className="field"><span>Descripción</span><input className="inp" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué preguntas cubre" /></label>
          <label className="field"><span>Nombre en inglés</span><input className="inp" lang="en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="E.g. Research" /></label>
          <label className="field"><span>Descripción en inglés</span><input className="inp" lang="en" value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} placeholder="Which questions it covers" /></label>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!name.trim()}>Agregar tema</button></div>
        </form>
      </div>
    </>
  );
}

function Trends({ trends, topicName }: { trends: Trend[]; topicName: (id: string) => string }) {
  const max = useMemo(() => Math.max(1, ...trends.map((t) => t.count)), [trends]);
  const real = trends.some((t) => t.count > 0);
  return (
    <>
      <header><div><h2>Tendencias</h2><p>Lo más consultado en los últimos 7 días por al menos 3 personas distintas. Las primeras cuatro se sugieren en el inicio del chat; mientras no haya uso suficiente se muestran preguntas frecuentes curadas.</p></div></header>
      <div className="card">
        {!real && <p className="small muted">Aún no hay suficientes consultas: estas son las preguntas curadas que ve el estudiante.</p>}
        <div className="bars">
          {trends.map((t, i) => (
            <div key={t.query} className="bar">
              <span>{t.query} <span className="small muted">· {topicName(t.topicId)}</span></span>
              <span className="mono" style={{ textAlign: 'right' }}>{t.count || '—'}</span>
              <span />
              <div className="track"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: real ? t.count / max : 0.04 }} transition={{ delay: i * 0.05, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} style={{ transformOrigin: 'left' }} /></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  login: 'Inició sesión', login_fallido: 'Intento de acceso fallido', logout: 'Cerró sesión', subir: 'Subió un documento', reprocesar: 'Reprocesó un documento',
  retirar: 'Retiró un documento', filtro: 'Cambió un filtro', tema: 'Creó un tema', bandeja: 'Actualizó la bandeja', caso_control: 'Agregó una pregunta de control',
  validacion: 'Corrió la validación', importar_casos: 'Importó preguntas de control', consulta: 'Actualizó una consulta',
};

function Audit() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); void listAudit().then(setItems).catch(() => setErr('No se pudo cargar la bitácora. Intenta de nuevo.')); };
  useEffect(load, []);
  const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <header><div><h2>Bitácora</h2><p>Quién cambió la base de conocimiento y cuándo: accesos, documentos, filtros, temas y preguntas de control. Se conserva dos años.</p></div><span className="sp" /><button className="btn" onClick={load}>Actualizar</button></header>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="table-wrap" role="region" aria-label="Bitácora" tabIndex={0}>
        <table className="adm-table">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Persona</th><th scope="col">Acción</th><th scope="col">Detalle</th></tr></thead>
          <tbody>
            {(items ?? []).map((a, i) => (
              <tr key={`${a.at}-${i}`}>
                <td className="mono nowrap">{fmt(a.at)}</td>
                <td>{a.email}</td>
                <td>{a.action === 'login_fallido' ? <span className="adm-tag error">{AUDIT_LABEL[a.action]}</span> : AUDIT_LABEL[a.action] ?? a.action}</td>
                <td className="mono small muted">{a.target ?? '—'}</td>
              </tr>
            ))}
            {items && !items.length && <tr><td colSpan={4} className="adm-empty">Todavía no hay acciones registradas.</td></tr>}
            {!items && !err && <tr><td colSpan={4} className="adm-empty" role="status">Cargando bitácora…</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function nextVersion(v: string) {
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`;
}
