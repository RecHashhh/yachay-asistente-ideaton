import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { BRAND } from '../config';
import { Mascot } from '../components/Mascot';
import { ProcedureCard } from '../components/ProcedureCard';
import { CampusMap } from '../components/CampusMap';
import { IcArrowLeft, IcBook } from '../components/icons';
import { listProcedures, MOCK } from '../lib/api';
import { useT, type Lang } from '../lib/i18n';
import { PROGRESS_EVENT, readPreparation } from '../lib/procedureProgress';
import type { Procedure } from '../lib/types';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function Guides({ setLang }: { setLang: (lang: Lang) => void }) {
  const { lang } = useT(), en = lang === 'en';
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [retry, setRetry] = useState(0), [query, setQuery] = useState('');
  const [pending, setPending] = useState(false), [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
  const [mapId, setMapId] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  useEffect(() => {
    let alive = true; setLoading(true); setError(false);
    listProcedures(lang).then(data => { if (alive) setItems(data); })
      .catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lang, retry]);
  useEffect(() => {
    const update = () => setProgressVersion(n => n + 1);
    window.addEventListener(PROGRESS_EVENT, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(PROGRESS_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  const withProgress = useMemo(() => items.map(p => {
    const saved = readPreparation(p), count = saved.documents.length + saved.steps.length;
    return { p, count, total: p.documents.length + p.steps.length, started: !!saved.updatedAt };
  }), [items, progressVersion]);
  const filtered = withProgress.filter(({ p, count, total, started }) => (!pending || (started && count < total)) && normalize(`${p.title} ${p.summary} ${p.office}`).includes(normalize(query.trim())));
  const current = items.find(p => (p.id ?? p.title) === selected);
  useEffect(() => {
    if (!current || loading) return;
    const section = document.getElementById('selected-guide');
    const heading = section?.querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    section?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [selected, loading]);
  const select = (id: string) => {
    const next = selected === id ? null : id; setSelected(next); setMapId(null);
    history.replaceState(null, '', `${location.pathname}${location.search}#/guias${next ? '?id=' + encodeURIComponent(next) : ''}`);
  };
  const showCatalog = () => {
    setSelected(null); setMapId(null); setQuery(''); setPending(false);
    history.replaceState(null, '', `${location.pathname}${location.search}#/guias`);
    document.querySelector('.guide-page')?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };
  return <div className="guide-page">
    <header className="topbar"><a href="#/" className="icon-btn" aria-label={en ? 'Back to chat' : 'Volver al chat'}><IcArrowLeft /></a><Mascot size={28} /><b>{BRAND.mascotName}</b><span className="sp" /><select className="inp guide-language" aria-label="Idioma / Language" value={lang} onChange={e => setLang(e.target.value as Lang)}><option value="es">ES</option><option value="en">EN</option><option value="qu">QU · beta</option></select>{selected ? <button className="btn sm" onClick={showCatalog}>{en ? 'View catalog' : 'Ver catálogo'}</button> : <a className="btn sm" href="#/">{en ? 'Ask Yachi' : 'Preguntar a Yachi'}</a>}</header>
    <main className="guides-main">
      <header><h1>{en ? 'Guides and preparation' : 'Guías y preparación'}</h1><p className="muted">{en ? 'Official instructions, your checklist and a clear next step. Personal checks stay on this browser.' : 'Instrucciones oficiales, tu lista y un siguiente paso claro. Las marcas personales se guardan en este navegador.'}</p></header>
      <div className="guide-filters"><label className="field"><span className="sr">{en ? 'Search guides' : 'Buscar guías'}</span><input className="inp" type="search" placeholder={en ? 'Search a procedure or office' : 'Buscar un trámite o dependencia'} value={query} onChange={e => setQuery(e.target.value)} /></label><button className={`btn${pending ? ' primary' : ''}`} aria-pressed={pending} onClick={() => setPending(!pending)}>{en ? 'My pending tasks' : 'Mis pendientes'}</button></div>
      {loading && <p role="status">{en ? 'Loading guides…' : 'Cargando guías…'}</p>}
      {error && <div className="card" role="alert"><p>{en ? 'Could not load official guides.' : 'No se pudieron cargar las guías oficiales.'}</p><button className="btn" onClick={() => setRetry(n => n + 1)}>{en ? 'Retry' : 'Reintentar'}</button></div>}
      {!loading && !error && <>
        {MOCK && <p className="small muted">{en ? 'Connect the backend to browse verified guides.' : 'Conecta el backend para explorar las guías verificadas.'}</p>}
        <div className="guide-results" aria-label={en ? 'Available guides' : 'Guías disponibles'}>
          {filtered.map(({ p, count, total, started }) => <button key={p.id ?? p.title} className="guide-result" aria-expanded={selected === (p.id ?? p.title)} onClick={() => select(p.id ?? p.title)}><IcBook width={20} height={20} /><span><b>{p.title}</b><small>{p.office}{p.period ? ` · ${p.period}` : ''}</small></span>{started && <span className="mono small">{count}/{total}</span>}</button>)}
          {!filtered.length && <p className="muted">{pending ? (en ? 'No pending checklists match. Open a guide and check an item to start.' : 'No hay listas pendientes que coincidan. Abre una guía y marca una tarea para empezar.') : (en ? 'No guide matches. You can ask Yachi without an exact match.' : 'No hay una guía que coincida. Puedes preguntar a Yachi aunque no aparezca aquí.')}</p>}
        </div>
        {current && <section id="selected-guide" className="guide-selected" tabIndex={-1} aria-label={current.title} key={current.id ?? current.title}>
          <ProcedureCard p={current} onShowMap={setMapId} />
          {mapId && <CampusMap action={{ destino: mapId }} />}
          <a className="btn" href={`#/?ask=${encodeURIComponent(en ? `I have a question about ${current.title}` : `Tengo una duda sobre ${current.title}`)}`}>{en ? 'Ask about this guide' : 'Preguntar sobre esta guía'}</a>
        </section>}
        <p className="small muted">{en ? 'The catalog only includes guides whose supporting excerpts are still available. A checklist does not confirm eligibility, submission or institutional approval.' : 'El catálogo solo incluye guías con fragmentos de respaldo disponibles. La lista no confirma elegibilidad, envío ni aprobación institucional.'}</p>
      </>}
    </main>
  </div>;
}
