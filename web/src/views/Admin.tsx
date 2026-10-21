import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../config';
import { Mascot } from '../components/Mascot';
import { IcArrowLeft, IcMoon, IcSun, IcTrash, IcUpload } from '../components/icons';
import { Cost, Validation } from './AdminExtras';
import { SAMPLE_DATA, adminLogin, adminLogout, createTopic, deleteDoc, getTopics, getTrends, listDocs, uploadDoc, type Admin as AdminUser } from '../lib/api';
import type { DocMeta, Topic, Trend } from '../lib/types';

type Tab = 'docs' | 'upload' | 'topics' | 'trends' | 'validation' | 'cost';
const ACCEPT = '.pdf,.xlsx,.csv';
const today = () => new Date().toISOString().slice(0, 10);

export function Admin({ theme, toggleTheme }: { theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<Tab>('docs');
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [replacing, setReplacing] = useState<DocMeta | null>(null);

  const refresh = useCallback(async () => {
    const [d, t, tr] = await Promise.all([listDocs(), getTopics(), getTrends()]);
    setDocs(d); setTopics(t); setTrends(tr);
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

  return (
    <div className="admin">
      <header className="admin-top">
        <a className="icon-btn" href="#/" aria-label="Volver al chat"><IcArrowLeft /></a>
        <Mascot size={28} />
        <b>Base de conocimiento</b>
        {SAMPLE_DATA && <span className="badge-demo">Datos de ejemplo</span>}
        <span className="sp" />
        <nav className="tabs" aria-label="Secciones">
          {([['docs', 'Documentos'], ['upload', 'Subir'], ['topics', 'Temas'], ['trends', 'Tendencias'], ['validation', 'Validación'], ['cost', 'Costo']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); if (k !== 'upload') setReplacing(null); }}>{l}</button>
          ))}
        </nav>
        <button className="icon-btn" aria-label="Cambiar tema" onClick={toggleTheme}>{theme === 'dark' ? <IcSun /> : <IcMoon />}</button>
        <span className="small muted">{user.email}</span>
        <button className="btn ghost sm" onClick={() => { adminLogout(); setUser(null); }}>Salir</button>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={tab} className="admin-main" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'docs' && <Docs docs={docs} topicName={topicName} onNew={() => { setReplacing(null); setTab('upload'); }} onReplace={(d) => { setReplacing(d); setTab('upload'); }} onDelete={async (d) => { if (confirm(`¿Quitar "${d.title}" de la base de conocimiento? El asistente dejará de usarlo.`)) { await deleteDoc(d.id); await refresh(); } }} />}
          {tab === 'upload' && <Upload topics={topics} docs={docs} replacing={replacing} onDone={async () => { setReplacing(null); await refresh(); setTab('docs'); }} />}
          {tab === 'topics' && <Topics topics={topics} docs={docs} onCreate={async (t) => { await createTopic(t); await refresh(); }} />}
          {tab === 'trends' && <Trends trends={trends} topicName={topicName} />}
          {tab === 'validation' && <Validation />}
          {tab === 'cost' && <Cost />}
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
    <div className="login">
      <motion.form className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { onLogin(await adminLogin(email.trim(), pw)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
        <div className="row" style={{ gap: 12 }}><Mascot size={44} /><div><h2 style={{ fontSize: 20 }}>Portal de administración</h2><p className="small muted">{BRAND.university} · base de conocimiento de {BRAND.mascotName}</p></div></div>
        <label className="field"><span>Correo institucional</span><input className="inp" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@yachaytech.edu.ec" required /></label>
        <label className="field"><span>Contraseña</span><input className="inp" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <a className="small muted" href="#/">Volver al chat</a>
      </motion.form>
    </div>
  );
}

function Docs({ docs, topicName, onNew, onReplace, onDelete }: { docs: DocMeta[]; topicName: (id: string) => string; onNew: () => void; onReplace: (d: DocMeta) => void; onDelete: (d: DocMeta) => void }) {
  const [q, setQ] = useState('');
  const shown = docs.filter((d) => `${d.title} ${topicName(d.topicId)}`.toLowerCase().includes(q.toLowerCase()));
  const chunks = docs.reduce((n, d) => n + d.chunks, 0);
  const stale = docs.filter((d) => Date.now() - new Date(d.docDate).getTime() > 365 * 864e5).length;
  return (
    <>
      <header><div><h2>Documentos</h2><p>Lo que {BRAND.mascotName} usa para responder. Solo se usa la versión vigente de cada documento.</p></div><span className="sp" /><button className="btn primary" onClick={onNew}><IcUpload width={16} height={16} />Subir documento</button></header>
      <div className="kpis">
        <div className="kpi"><b>{docs.filter((d) => d.status === 'indexado').length}</b><span>documentos activos</span></div>
        <div className="kpi"><b>{chunks}</b><span>fragmentos indexados</span></div>
        <div className="kpi"><b>{docs.filter((d) => d.status === 'procesando').length}</b><span>en proceso</span></div>
        <div className="kpi"><b>{stale}</b><span>con más de un año (revisar)</span></div>
      </div>
      <input className="inp" style={{ maxWidth: 320 }} placeholder="Buscar por título o tema" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documentos" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Documento</th><th>Tema</th><th>Versión</th><th>Fecha del documento</th><th>Origen</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><span className="tag mono">{d.kind}</span><span className="t">{d.title}</span></div>{d.history?.length ? <span className="small muted">Reemplaza {d.history.map((h) => h.version).join(', ')}</span> : null}</td>
                <td>{topicName(d.topicId)}</td>
                <td className="mono">{d.version}</td>
                <td className="mono">{d.docDate}</td>
                <td>{d.origin === 'web' ? (d.url ? <a href={d.url} target="_blank" rel="noreferrer">Página web</a> : 'Página web') : 'Interno'}</td>
                <td><span className={`st ${d.status}`}>{d.status === 'indexado' ? `Indexado · ${d.chunks}` : d.status === 'procesando' ? 'Procesando' : 'Error'}</span></td>
                <td><div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => onReplace(d)}>Nueva versión</button><button className="icon-btn danger" aria-label={`Quitar ${d.title}`} onClick={() => onDelete(d)}><IcTrash /></button></div></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 32 }}>No hay documentos que coincidan.</td></tr>}
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
      <header><div><h2>{replacing ? `Nueva versión de "${replacing.title}"` : 'Subir documento'}</h2><p>El archivo se divide en fragmentos y se indexa. Los metadatos viajan con cada fragmento para filtrar y citar.</p></div></header>
      <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
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
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={progress !== null} onClick={submit}>{progress !== null ? `Subiendo ${progress} %` : 'Subir e indexar'}</button></div>
      </div>
    </>
  );
}

function Topics({ topics, docs, onCreate }: { topics: Topic[]; docs: DocMeta[]; onCreate: (t: Omit<Topic, 'id'>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <>
      <header><div><h2>Temas</h2><p>Los temas que se pueden consultar. Cada documento pertenece a uno; el asistente filtra por tema antes de buscar.</p></div></header>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tema</th><th>Descripción</th><th>Documentos</th></tr></thead>
          <tbody>{topics.map((t) => <tr key={t.id}><td className="t">{t.name}</td><td className="muted">{t.description}</td><td className="mono">{docs.filter((d) => d.topicId === t.id).length}</td></tr>)}</tbody>
        </table>
      </div>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await onCreate({ name: name.trim(), description: description.trim() }); setName(''); setDescription(''); }}>
        <b>Agregar tema</b>
        <div className="form-grid">
          <label className="field"><span>Nombre</span><input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Investigación" /></label>
          <label className="field"><span>Descripción</span><input className="inp" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué preguntas cubre" /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!name.trim()}>Agregar</button></div>
      </form>
    </>
  );
}

function Trends({ trends, topicName }: { trends: Trend[]; topicName: (id: string) => string }) {
  const max = useMemo(() => Math.max(1, ...trends.map((t) => t.count)), [trends]);
  return (
    <>
      <header><div><h2>Tendencias</h2><p>Lo más consultado en los últimos 7 días. Las primeras cuatro se sugieren en la pantalla de inicio del chat.</p></div></header>
      <div className="card">
        <div className="bars">
          {trends.map((t, i) => (
            <div key={t.query} className="bar">
              <span>{t.query} <span className="small muted">· {topicName(t.topicId)}</span></span>
              <span className="mono" style={{ textAlign: 'right' }}>{t.count}</span>
              <span className={`mono small ${t.delta >= 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>{t.delta >= 0 ? '+' : ''}{t.delta} %</span>
              <div className="track"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: t.count / max }} transition={{ delay: i * 0.05, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} style={{ transformOrigin: 'left' }} /></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function nextVersion(v: string) {
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`;
}
