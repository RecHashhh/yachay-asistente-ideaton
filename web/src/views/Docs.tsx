import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../config';
import { Mascot } from '../components/Mascot';
import { IcArrowLeft, IcChat, IcExternal, IcGlobe } from '../components/icons';
import { MOCK, getTopics, listPublicDocs } from '../lib/api';
import { LANGS, topicLabel, useT, type Lang } from '../lib/i18n';
import type { PublicDoc, Topic } from '../lib/types';

/**
 * "Documentos disponibles": cualquier usuario ve qué documentos oficiales usa el asistente,
 * con versión, fecha y origen. Es la otra mitad de la trazabilidad: cada cita del chat lleva aquí.
 */
export function Docs({ setLang }: { setLang: (l: Lang) => void }) {
  const { t, lang } = useT();
  const [docs, setDocs] = useState<PublicDoc[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const highlight = new URLSearchParams(location.hash.split('?')[1] ?? '').get('doc');
  const hlRef = useRef<HTMLLIElement>(null);

  useEffect(() => { void listPublicDocs().then(setDocs); void getTopics().then(setTopics); }, []);
  useEffect(() => { hlRef.current?.scrollIntoView({ block: 'center' }); }, [docs.length]);

  const shown = useMemo(() => docs.filter((d) => (!topic || d.topicId === topic) && d.title.toLowerCase().includes(q.toLowerCase())), [docs, q, topic]);
  const groups = topics.map((tp) => ({ tp, items: shown.filter((d) => d.topicId === tp.id) })).filter((g) => g.items.length);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-EC', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="docs-page">
      <header className="admin-top">
        <a className="icon-btn" href="#/" aria-label={t('backChat')}><IcArrowLeft /></a>
        <Mascot size={28} />
        <h1 className="docs-h">{t('docsTitle')}</h1>
        {MOCK && <span className="badge-demo">{t('demo')}</span>}
        <span className="sp" />
        <label className="lang-select"><IcGlobe width={16} height={16} /><span className="sr">Idioma / Language</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>{LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        </label>
      </header>
      <main className="admin-main">
        <header><div><p>{t('docsSub', { name: BRAND.mascotName })}</p></div></header>
        <div className="row" role="group" aria-label={t('docsTitle')}>
          <input className="inp" style={{ maxWidth: 280 }} placeholder={t('docsSearch')} aria-label={t('docsSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="chip" aria-pressed={!topic} onClick={() => setTopic('')}>{t('allTopics')}</button>
          {topics.map((tp) => <button key={tp.id} className="chip" aria-pressed={topic === tp.id} onClick={() => setTopic(topic === tp.id ? '' : tp.id)}>{topicLabel(tp, lang)}</button>)}
          <span className="sp" />
          <span className="small muted">{t('docsCount', { n: String(shown.length) })}</span>
        </div>

        {groups.map(({ tp, items }) => (
          <section key={tp.id} className="doc-group" aria-labelledby={`g-${tp.id}`}>
            <h2 id={`g-${tp.id}`}>{topicLabel(tp, lang)} <span className="muted small">· {lang === 'en' ? tp.descriptionEn ?? tp.description : tp.description}</span></h2>
            <ul className="doc-list">
              {items.map((d, i) => (
                <motion.li key={d.id} ref={d.id === highlight ? hlRef : undefined} className={`doc-row${d.id === highlight ? ' hl' : ''}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <span className="tag mono">{d.kind}</span>
                  <div className="doc-main">
                    <b>{d.title}</b>
                    <span className="small muted">{t('version')} <span className="mono">{d.version}</span> · {fmt(d.docDate)} · {d.origin === 'web' ? t('originWeb') : t('originInternal')}</span>
                    {d.origin === 'interno' && <span className="small muted">{t('internalNote')}</span>}
                  </div>
                  <div className="doc-actions">
                    {d.url && <a className="btn sm" href={d.url} target="_blank" rel="noreferrer">{t('openDoc')}<IcExternal width={14} height={14} /><span className="sr"> (nueva pestaña)</span></a>}
                    <a className="btn sm ghost" href={`#/?ask=${encodeURIComponent(t('askAboutQ', { title: d.title }))}`}><IcChat width={14} height={14} />{t('askAbout')}</a>
                  </div>
                </motion.li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="muted" style={{ textAlign: 'center', padding: 32 }}>{t('noDocs')}</p>}
      </main>
    </div>
  );
}
