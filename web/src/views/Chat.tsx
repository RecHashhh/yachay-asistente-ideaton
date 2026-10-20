import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../config';
import { CampusMap } from '../components/CampusMap';
import { Composer } from '../components/Composer';
import { ConsentDialog, hasConsent, trapFocus } from '../components/ConsentDialog';
import { Markdown } from '../components/Markdown';
import { Mascot } from '../components/Mascot';
import { ProcedureCard, UnknownCard } from '../components/ProcedureCard';
import { IcExternal, IcSpark, IcCheck, IcClose, IcCopy, IcDown, IcExpand, IcGlobe, IcInfo, IcLock, IcShield, IcMenu, IcMoon, IcPlus, IcRetry, IcSun, IcTrend, IcUp } from '../components/icons';
import { docHref, getTopics, getTrends, sendFeedback, streamChat } from '../lib/api';
import { LANGS, detectLang, locatorLabel, topicLabel, useT, type Lang } from '../lib/i18n';
import { placeById, placeName } from '../lib/campus';
import { ChatList } from '../components/ChatList';
import { ClarifyCard, FeedbackPanel } from '../components/Feedback';
import type { FeedbackReason } from '../lib/inbox';
import type { Attachment, ChatTurn, MapAction, Procedure, Source, Topic, Trend, Unknown } from '../lib/types';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files?: Attachment[];
  status?: string;
  sources?: Source[];
  map?: MapAction;
  procedure?: Procedure;
  unknown?: Unknown;
  suggestions?: string[];
  clarify?: { question: string; options: string[] };
  link?: { label: string; href: string };
  streaming?: boolean;
  error?: string;
  vote?: 'up' | 'down';
  serverId?: string;
  latencyMs?: number;
}
interface Conversation { id: string; title: string; msgs: Msg[]; at: number; renamed?: boolean }

/** Turnos que viajan al backend. El resto lo resume el servidor (ver README, ahorro de tokens). */
const HISTORY_TURNS = 6;
const CHATS_KEY = 'yt-chats';

const loadChats = (): Conversation[] => { try { return JSON.parse(localStorage.getItem(CHATS_KEY) ?? '[]') as Conversation[]; } catch { return []; } };
// Los adjuntos no se guardan en el navegador: pesan y pueden tener datos personales.
const saveChats = (c: Conversation[]) => { try { localStorage.setItem(CHATS_KEY, JSON.stringify(c.slice(0, 20).map((x) => ({ ...x, msgs: x.msgs.map(({ files: _f, ...m }) => m) })))); } catch { /* sin almacenamiento */ } };
const uid = (): string => crypto.randomUUID();

/** Título automático según lo consultado: el trámite o lugar que respondió, si no, la pregunta limpia y corta. */
function autoTitle(msgs: Msg[], lang: Lang): string {
  const ai = msgs.find((m) => m.role === 'assistant' && (m.procedure || m.map));
  if (ai?.procedure) return ai.procedure.title;
  if (ai?.map) { const p = placeById(ai.map.destino); if (p) return placeName(p, lang); }
  const q = (msgs.find((m) => m.role === 'user')?.text ?? '').replace(/[¿?¡!]/g, '').trim();
  if (!q) return lang === 'en' ? 'Conversation' : 'Conversación';
  const short = q.length > 42 ? `${q.slice(0, 42).replace(/\s+\S*$/, '')}…` : q;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** Datos personales que no hace falta enviar (LOPDP, minimización): cédula/teléfono de 10 dígitos o correo. */
const PII_ID = /\b\d{10}\b/;
const PII_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
/** Conversación en texto para adjuntar a la consulta a una dependencia (datos personales omitidos). */
function transcriptOf(msgs: Msg[], lang: Lang): string {
  const who = (m: Msg) => (m.role === 'user' ? (lang === 'en' ? 'Student' : 'Estudiante') : 'Yachi');
  const body = (m: Msg) => m.text || m.procedure?.title || m.clarify?.question || (m.unknown ? (lang === 'en' ? '(no official information)' : '(sin información oficial)') : '');
  return msgs.map((m) => `${who(m)}: ${redact(body(m).replaceAll('**', ''))}`).filter((l) => !l.endsWith(': ')).join('\n');
}

const redact = (s: string) => s.replace(new RegExp(PII_ID.source, 'g'), '[dato omitido]').replace(new RegExp(PII_EMAIL.source, 'g'), '[dato omitido]');

const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 3));

interface Props { theme: 'light' | 'dark'; toggleTheme: () => void; setLang: (l: Lang) => void; embed?: boolean }

export function Chat({ theme, toggleTheme, setLang, embed }: Props) {
  const { t, lang } = useT();
  const [consent, setConsent] = useState(hasConsent);
  const [dialog, setDialog] = useState<'notice' | 'about' | null>(null);
  const [chats, setChats] = useState<Conversation[]>(loadChats);
  const [chatId, setChatId] = useState(uid);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [railOpen, setRailOpen] = useState(true);
  const [mobileRail, setMobileRail] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [suggestLang, setSuggestLang] = useState<Lang | null>(null);
  const [pii, setPii] = useState<{ text: string; base: Msg[]; att: Attachment[] } | null>(null);
  const [undo, setUndo] = useState<{ chat: Conversation; index: number } | null>(null);
  useEffect(() => { if (!undo) return; const x = setTimeout(() => setUndo(null), 6000); return () => clearTimeout(x); }, [undo]);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = msgs.some((m) => m.streaming);
  const modalOpen = !consent || dialog !== null;
  // Lo que oye un lector de pantalla: el estado al empezar y la respuesta completa al terminar, no cada palabra del stream.
  const lastAi = [...msgs].reverse().find((m) => m.role === 'assistant');
  const announce = !lastAi ? '' : lastAi.streaming ? t('thinking') + '…' : lastAi.unknown ? t(lastAi.unknown.reason === 'fuera_de_dominio' ? 'outOfDomain' : 'unknownTitle') : [lastAi.text.replaceAll('**', ''),lastAi.procedure?.title].filter(Boolean).join('. ');

  useEffect(() => { void getTrends(lang).then(setTrends); }, [lang]);
  useEffect(() => { void getTopics().then(setTopics); }, []);
  // Baja al final solo cuando llega un mensaje o avanza el stream; abrir un mapa o una fuente no mueve la vista.
  const last = msgs[msgs.length - 1];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, last?.text, last?.procedure, last?.unknown, last?.streaming]);
  useEffect(() => { if (!toastMsg) return; const x = setTimeout(() => setToastMsg(null), 3200); return () => clearTimeout(x); }, [toastMsg]);

  // Sugiere cambiar de idioma si escribe en otro (detección local; el backend también detecta).
  useEffect(() => {
    const d = detectLang(input);
    setSuggestLang(d && d !== lang && lang !== 'qu' ? d : null);
  }, [input, lang]);

  useEffect(() => {
    if (!msgs.length || busy || embed) return;
    setChats((prev) => {
      const old = prev.find((c) => c.id === chatId);
      const title = old?.renamed ? old.title : autoTitle(msgs, lang);
      // Sin mensajes nuevos (solo se abrió, se marcó un paso o se votó): se actualiza en su lugar, sin reordenar.
      if (old && old.msgs.length === msgs.length) {
        const same = prev.map((c) => (c.id === chatId ? { ...c, title, msgs } : c));
        saveChats(same);
        return same;
      }
      const next = [{ id: chatId, title, msgs, at: Date.now(), renamed: old?.renamed }, ...prev.filter((c) => c.id !== chatId)];
      saveChats(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, msgs, chatId, embed]);

  const patch = (id: string, fn: (m: Msg) => Partial<Msg>) => setMsgs((all) => all.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)));

  // Preguntas parecidas mientras escribe: coincidencia de palabras con las tendencias (sin llamar al modelo).
  const hints = useMemo(() => {
    if (input.trim().length < 4) return [];
    const w = words(input);
    return trends.map((x) => ({ q: x.query, n: [...words(x.query)].filter((y) => [...w].some((z) => y.startsWith(z.slice(0, 5)))).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.q);
  }, [input, trends]);

  async function send(raw: string, base: Msg[] = msgs, att: Attachment[] = files, piiMode?: 'skip') {
    let text = raw.trim();
    if ((!text && !att.length) || busy || !consent) return;
    if (piiMode !== 'skip' && (PII_ID.test(text) || PII_EMAIL.test(text))) {
      setPii({ text, base, att }); setInput(text); return;
    }
    if (piiMode === 'skip') text = redact(text);
    setPii(null);
    setInput(''); setFiles([]);
    const user: Msg = { id: uid(), role: 'user', text, files: att.length ? att : undefined };
    const ai: Msg = { id: uid(), role: 'assistant', text: '', streaming: true, status: t('thinking') };
    const history: ChatTurn[] = base.filter((m) => !m.error && m.text).slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.text }));
    setMsgs([...base, user, ai]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      for await (const ev of streamChat({ sessionId: chatId, message: text, lang, history, attachments: att.length ? att : undefined }, ctrl.signal)) {
        if (ev.type === 'status') patch(ai.id, () => ({ status: ev.label }));
        else if (ev.type === 'token') patch(ai.id, (m) => ({ text: m.text + ev.text, status: undefined }));
        else if (ev.type === 'tool') patch(ai.id, () => ({ map: ev.input }));
        else if (ev.type === 'procedure') patch(ai.id, () => ({ procedure: ev.item }));
        else if (ev.type === 'unknown') patch(ai.id, () => ({ unknown: ev.item, status: undefined }));
        else if (ev.type === 'clarify') patch(ai.id, () => ({ clarify: { question: ev.question, options: ev.options }, status: undefined }));
        else if (ev.type === 'sources') patch(ai.id, () => ({ sources: ev.items }));
        else if (ev.type === 'suggestions') patch(ai.id, () => ({ suggestions: ev.items }));
        else if (ev.type === 'link' && ev.href.startsWith('#/')) patch(ai.id, () => ({ link: { label: ev.label, href: ev.href } }));
        else if (ev.type === 'done') patch(ai.id, () => ({ serverId: ev.messageId, latencyMs: ev.latencyMs }));
        else if (ev.type === 'error') patch(ai.id, () => ({ error: ev.message }));
      }
      patch(ai.id, () => ({ streaming: false, status: undefined }));
    } catch (e) {
      const stopped = (e as Error).name === 'AbortError';
      patch(ai.id, (m) => ({ streaming: false, status: undefined, error: stopped ? (m.text ? undefined : t('stopped')) : (e as Error).message }));
    }
  }

  const stop = () => abort.current?.abort();
  const newChat = () => { stop(); setChatId(uid()); setMsgs([]); setMobileRail(false); setPii(null); };
  const openChat = (c: Conversation) => { stop(); setChatId(c.id); setMsgs(c.msgs); setMobileRail(false); setPii(null); };
  const persist = (fn: (c: Conversation[]) => Conversation[]) => setChats((prev) => { const next = fn(prev); saveChats(next); return next; });
  const renameChat = (id: string, title: string) => persist((cs) => cs.map((c) => (c.id === id ? { ...c, title, renamed: true } : c)));
  const deleteChat = (id: string) => {
    const i = chats.findIndex((c) => c.id === id);
    const removed = chats[i];
    if (!removed) return;
    persist((cs) => cs.filter((c) => c.id !== id));
    if (id === chatId) newChat();
    setUndo({ chat: removed, index: i });
  };
  const undoDelete = () => {
    if (!undo) return;
    persist((cs) => { const n = [...cs]; n.splice(undo.index, 0, undo.chat); return n; });
    setUndo(null);
  };
  const retry = (aiId: string) => {
    const i = msgs.findIndex((m) => m.id === aiId);
    const q = msgs[i - 1];
    if (q?.role === 'user') void send(q.text, msgs.slice(0, i - 1), q.files ?? []);
  };

  const topicName = useMemo(() => Object.fromEntries(topics.map((x) => [x.id, topicLabel(x, lang)])), [topics, lang]);

  // "Preguntar sobre este documento" llega como #/?ask=...: se precarga la pregunta y el usuario decide si la envía.
  useEffect(() => {
    const ask = new URLSearchParams(location.hash.split('?')[1] ?? '').get('ask');
    if (ask) { setInput(ask); history.replaceState(null, '', `${location.pathname}${location.search}#/`); }
  }, []);
  const empty = msgs.length === 0;

  const piiBanner = pii && (
    <div className="pii-banner" role="alert">
      <b>{t('piiTitle')}</b>
      <span>{t('piiBody', { what: PII_ID.test(pii.text) ? t('piiId') : t('piiEmail') })}</span>
      <span className="row">
        <button className="btn sm primary" onClick={() => void send(pii.text, pii.base, pii.att, 'skip')}>{t('piiRemove')}</button>
        <button className="btn sm ghost" onClick={() => { setPii(null); document.getElementById('ask')?.focus(); }}>{t('piiEdit')}</button>
      </span>
    </div>
  );

  // Sugerencias personalizadas: lo que el asistente propuso seguir en tus últimas conversaciones y aún no preguntaste.
  const forYou = useMemo(() => {
    const asked = new Set(chats.flatMap((c) => c.msgs.filter((m) => m.role === 'user').map((m) => m.text)));
    const out: string[] = [];
    for (const c of chats.slice(0, 5)) {
      const last = [...c.msgs].reverse().find((m) => m.role === 'assistant' && m.suggestions?.length);
      for (const q of last?.suggestions ?? []) if (!asked.has(q) && !out.includes(q)) out.push(q);
    }
    return out.slice(0, 3);
  }, [chats]);

  const composer = (
    <Composer value={input} onChange={setInput} files={files} onFiles={setFiles} onSend={() => void send(input)} onStop={stop} busy={busy}
      disabled={!consent} autoFocus={empty && !embed} hints={empty ? [] : hints} onHint={(q) => void send(q)} toast={setToastMsg} />
  );

  const langBanner = (
    <AnimatePresence>
      {suggestLang && (
        <motion.div className="lang-banner" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <IcGlobe width={15} height={15} />{t('langAuto', { lang: LANGS.find((l) => l.id === suggestLang)!.label })}
          <button className="btn sm" onClick={() => { setLang(suggestLang); setSuggestLang(null); }}>{t('change')}</button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const langSelect = (
    <label className="lang-select" title="Idioma / Language">
      <IcGlobe width={16} height={16} />
      <span className="sr">Idioma / Language</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{embed ? l.short : l.label}</option>)}
      </select>
    </label>
  );

  return (
    <>
    <div className={`app${embed ? ' embed' : ''}${railOpen ? '' : ' rail-closed'}${mobileRail ? ' rail-open-mobile' : ''}`} inert={modalOpen || undefined}>
      <div className="sr" role="status" aria-live="polite">{announce}</div>
      {!embed && (
        <aside className="rail" aria-label={t('recent')}>
          <div className="brand"><Mascot size={30} /><div><b>{BRAND.mascotName}</b><small>{BRAND.university}</small></div></div>
          <button className="item" onClick={newChat}><IcPlus />{t('newChat')}</button>
          <nav className="chat-list" aria-label={t('recent')}>
            <ChatList chats={chats} currentId={chatId} onOpen={(id) => { const c = chats.find((x) => x.id === id); if (c) openChat(c); }} onRename={renameChat} onDelete={deleteChat} />
          </nav>
          <div className="foot">
            <button className="item" onClick={() => setDialog('about')}><IcInfo />{t('about')}</button>
            <button className="item" onClick={() => setDialog('notice')}><IcShield />{t('notice')}</button>
            <a className="item" href="#/admin" style={{ textDecoration: 'none' }}><IcLock />{t('admin')}</a>
          </div>
        </aside>
      )}
      {mobileRail && <div className="scrim" style={{ zIndex: 35, backdropFilter: 'none' }} onClick={() => setMobileRail(false)} />}

      <main className="chat">
        <header className="topbar">
          {embed ? <Mascot size={28} mood={busy ? 'thinking' : 'idle'} /> : (
            <button className="icon-btn" aria-label={t('recent')} onClick={() => (window.matchMedia('(max-width: 820px)').matches ? setMobileRail(true) : setRailOpen((o) => !o))}><IcMenu /></button>
          )}
          <h1 className="title">{BRAND.mascotName}</h1>
          <span className="sp" />
          {langSelect}
          {!embed && <button className="icon-btn" aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')} title={theme === 'dark' ? t('themeLight') : t('themeDark')} onClick={toggleTheme}>{theme === 'dark' ? <IcSun /> : <IcMoon />}</button>}
          {!empty && <button className="icon-btn" aria-label={t('newChat')} onClick={newChat}><IcPlus /></button>}
          {embed && <a className="icon-btn" href={`${location.origin}${location.pathname}#/`} target="_blank" rel="noreferrer" aria-label="Abrir en pantalla completa"><IcExpand /></a>}
          {embed && <button className="icon-btn" aria-label={t('close')} onClick={() => window.parent.postMessage({ type: 'yachi:close' }, '*')}><IcClose /></button>}
        </header>

        {empty ? (
          <motion.section className="hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="greet">
              <Mascot size={embed ? 48 : 64} mood={input ? 'thinking' : 'idle'} />
              <h1><span lang={lang === 'qu' ? 'qu-EC' : undefined} className="hello-main">{t('hello', { name: BRAND.mascotName })}</span><span>{t('helloSub', { uni: BRAND.university })}</span></h1>
            </div>
            {lang === 'qu' && <p className="kichwa-note" role="note">{t('kichwaNote')}</p>}
            {piiBanner}
            {composer}
            {langBanner}
            {forYou.length > 0 && !embed && (
              <div className="suggest">
                <h2><IcSpark width={15} height={15} />{t('forYou')}</h2>
                <div className="follow">{forYou.map((q) => <button key={q} className="chip" onClick={() => void send(q)}>{q}</button>)}</div>
              </div>
            )}
            {trends.length > 0 && (
              <div className="suggest">
                <h2><IcTrend width={15} height={15} />{t('trending')}</h2>
                <div className="suggest-grid">
                  {trends.slice(0, embed ? 3 : 4).map((x, i) => (
                    <motion.button key={x.query} className="suggest-card" onClick={() => void send(x.query)}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}>
                      {x.query}
                      <small>{topicName[x.topicId] ?? x.topicId}</small>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        ) : (
          <>
            <div className="scroll">
              <div className="thread">
                <AnimatePresence initial={false}>
                  {msgs.map((m, i) => m.role === 'user'
                    ? (
                      <motion.div key={m.id} className="msg-user" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
                        {m.files && <div className="msg-files">{m.files.map((f, i) => f.type.startsWith('image/') ? <img key={i} src={f.url} alt={f.name} /> : <span key={i} className="tag mono">PDF · {f.name}</span>)}</div>}
                        {m.text}
                      </motion.div>
                    )
                    : <AssistantMsg key={m.id} m={m}
                        onVote={(v) => { patch(m.id, () => ({ vote: v })); if (v === 'up' && m.serverId) void sendFeedback(m.serverId, v); }}
                        onReason={(r) => { if (m.serverId) void sendFeedback(m.serverId, 'down', { question: msgs[i - 1]?.text ?? '', lang, reason: r ?? undefined }); }}
                        question={msgs[i - 1]?.text}
                        transcript={transcriptOf(msgs.slice(0, i + 1), lang)}
                        onRetry={() => retry(m.id)} onAsk={(q) => void send(q)}
                        onShowMap={(placeId) => patch(m.id, () => ({ map: { destino: placeId, origen: 'entrada' } }))} />)}
                </AnimatePresence>
                <div ref={endRef} />
              </div>
            </div>
            <div className="composer-wrap">
              {langBanner}
              {piiBanner}
              {composer}
              <p className="disclaimer">{t('disclaimer', { name: BRAND.mascotName })} · <button onClick={() => setDialog('notice')}>{t('notice')}</button></p>
            </div>
          </>
        )}
      </main>

      <AnimatePresence>{toastMsg && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toastMsg}</motion.div>}</AnimatePresence>
      <AnimatePresence>{undo && <motion.div className="toast row" role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{t('deleted')}<button className="btn sm" onClick={undoDelete}>{t('undo')}</button></motion.div>}</AnimatePresence>
    </div>
      <ConsentDialog intro={!consent} open={!consent || dialog === 'notice'} onAccept={() => { setConsent(true); setDialog(null); setTimeout(() => document.getElementById('ask')?.focus(), 50); }} onClose={consent ? () => setDialog(null) : undefined} />
      <AboutDialog open={dialog === 'about'} onClose={() => setDialog(null)} />
    </>
  );
}

function AssistantMsg({ m, question, transcript, onVote, onReason, onRetry, onAsk, onShowMap }: { m: Msg; question?: string; transcript: string; onVote: (v: 'up' | 'down') => void; onReason: (r: FeedbackReason | null) => void; onRetry: () => void; onAsk: (q: string) => void; onShowMap: (placeId: string) => void }) {
  const { t, lang } = useT();
  const [copied, setCopied] = useState(false);
  const [openSrc, setOpenSrc] = useState<string | null>(null);
  const mood = m.streaming ? (m.text ? 'talking' : 'thinking') : 'idle';
  const srcKey = (s: Source) => `${s.docId}|${s.locator ?? ''}`;
  const src = m.sources?.find((s) => srcKey(s) === openSrc);
  // Si el mapa se pidió desde la tarjeta del trámite o de "sin información", se dibuja debajo de ella, donde el usuario está mirando.
  const mapAfter = !!(m.procedure || m.unknown);
  return (
    <motion.div className="msg-ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <Mascot size={36} mood={mood} decorative />
      <div className="body">
        <AnimatePresence mode="wait">
          {m.status && (
            <motion.span key={m.status} className="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              <span className="working">{m.status}…</span>
            </motion.span>
          )}
        </AnimatePresence>
        {m.map && !mapAfter && <CampusMap action={m.map} />}
        {m.text && <Markdown text={m.text} animate={!!m.streaming} />}
        {m.procedure && <ProcedureCard p={m.procedure} onShowMap={onShowMap} />}
        {m.clarify && <ClarifyCard question={m.clarify.question} options={m.clarify.options} onPick={onAsk} />}
        {m.unknown && <UnknownCard u={m.unknown} question={question} transcript={transcript} onShowMap={onShowMap} />}
        {m.map && mapAfter && <CampusMap action={m.map} scrollIntoView />}
        {m.error && <p className="err" role="alert">{m.error}</p>}

        {!m.streaming && m.sources && m.sources.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sources" aria-label={t('sources')}>
              {m.sources.map((s) => (
                <button key={srcKey(s)} className="src" aria-expanded={openSrc === srcKey(s)} onClick={() => setOpenSrc(openSrc === srcKey(s) ? null : srcKey(s))} title={`${s.title} · ${s.version} · ${s.docDate}`}>
                  <span className="kind">{s.version}</span><span className="t">{s.title}</span>
                </button>
              ))}
            </div>
            <AnimatePresence>
              {src && (
                <motion.div className="src-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                  <b>{src.title}</b>
                  <span className="mono small">{t('version')} {src.version} · {t('docOf')} {src.docDate}{src.locator ? ` · ${locatorLabel(src.locator, lang)}` : ''}</span>
                  <span lang="es">“{src.snippet}”{t('originalQuote') && <span className="small" lang={lang}> ({t('originalQuote')})</span>}</span>
                  <span className="row" style={{ marginTop: 4 }}>
                    {src.url && (
                      <a className="btn sm" href={docHref(src.url, src.page)} target="_blank" rel="noreferrer">
                        {src.page ? t('openDocAt', { loc: `${t('page')} ${src.page}` }) : t('openDoc')}<IcExternal width={14} height={14} /><span className="sr"> (nueva pestaña)</span>
                      </a>
                    )}
                  </span>
                  {!src.url && <span className="small">{t('internalNote')}</span>}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {!m.streaming && (m.text || m.error || m.unknown || m.clarify) && (
          <div className="actions">
            {m.text && <button className="icon-btn" aria-label={t('copy')} title={t('copy')} onClick={() => { void navigator.clipboard.writeText(m.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <IcCheck /> : <IcCopy />}</button>}
            <button className="icon-btn" aria-label={t('good')} title={t('good')} aria-pressed={m.vote === 'up'} onClick={() => onVote('up')}><IcUp /></button>
            <button className="icon-btn" aria-label={t('bad')} title={t('bad')} aria-pressed={m.vote === 'down'} onClick={() => onVote('down')}><IcDown /></button>
            <button className="icon-btn" aria-label={t('retry')} title={t('retry')} onClick={onRetry}><IcRetry /></button>
            {m.latencyMs !== undefined && <span className="latency mono">{(m.latencyMs / 1000).toFixed(1)} s</span>}
          </div>
        )}

        {m.vote === 'down' && !m.streaming && (
          <FeedbackPanel office={m.procedure?.office ?? (lang === 'en' ? "Registrar's Office" : 'Secretaría General')} question={question ?? ''} transcript={transcript} onReason={onReason} />
        )}

        {!m.streaming && m.suggestions && m.suggestions.length > 0 && (
          <div className="follow">
            {m.suggestions.map((q, i) => (
              <motion.button key={q} className="chip" onClick={() => onAsk(q)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>{q}</motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Explica en lenguaje simple por qué el asistente no inventa (criterio de mitigación de alucinaciones). */
function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useT();
  const en = lang === 'en';
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          <motion.div className="dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()} onKeyDown={trapFocus} ref={(el) => el?.querySelector<HTMLElement>('.btn.primary')?.focus()}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <div className="row" style={{ gap: 10 }}><Mascot size={32} /><h2 id="about-title">{en ? `How ${BRAND.mascotName} works` : `Cómo funciona ${BRAND.mascotName}`}</h2></div>
            <ul>
              {en ? <>
                <li><b>Only official documents.</b> It answers from regulations, calendars and procedures uploaded by the university. Every answer shows the document, version and date.</li>
                <li><b>No official information, no answer.</b> If no document supports the answer, it says so and gives you the office to contact.</li>
                <li><b>Step-by-step procedures:</b> what it is, what you need, in which order and where.</li>
                <li><b>Spanish and English</b>, with automatic detection. Kichwa greeting in beta.</li>
                <li><b>Checked regularly</b> against a set of control questions with known answers.</li>
              </> : <>
                <li><b>Solo documentos oficiales.</b> Responde con reglamentos, calendarios y procedimientos cargados por la universidad. Cada respuesta muestra el documento, la versión y la fecha.</li>
                <li><b>Sin información oficial, no responde.</b> Si ningún documento respalda la respuesta, lo indica y te da la dependencia a la que puedes acudir.</li>
                <li><b>Trámites paso a paso:</b> qué es, qué necesitas, en qué orden y dónde.</li>
                <li><b>Español e inglés</b>, con detección automática. Saludo en kichwa en prueba.</li>
                <li><b>Se verifica</b> con un set de preguntas de control con respuesta conocida.</li>
              </>}
            </ul>
            <p className="small muted">{en ? 'Built with AI assistance; see the AI-use statement in the repository.' : 'Construido con apoyo de IA; ver la declaración de uso de IA en el repositorio.'}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={onClose}>OK</button></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
