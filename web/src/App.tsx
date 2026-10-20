import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { LangContext, makeT, type Lang } from './lib/i18n';
import { Admin } from './views/Admin';
import { Chat } from './views/Chat';

type Theme = 'light' | 'dark';
const THEME_KEY = 'yt-theme';
const LANG_KEY = 'yt-lang';

const initialTheme = (): Theme => {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t; } catch { /* sin almacenamiento */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Idioma: el guardado, luego `?lang=` (lo pasa el widget), luego el del navegador. */
const initialLang = (): Lang => {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lang');
  if (q === 'es' || q === 'en' || q === 'qu') return q;
  try { const l = localStorage.getItem(LANG_KEY); if (l === 'es' || l === 'en' || l === 'qu') return l; } catch { /* sin almacenamiento */ }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
};

/** Rutas por hash: `#/` chat, `#/embed` chat compacto para el widget, `#/admin` portal (la lista de documentos solo la ven los administradores). */
const route = () => {
  const h = location.hash;
  if (h.startsWith('#/admin')) return 'admin';
  if (h.startsWith('#/embed')) return 'embed';
  return 'chat';
};

export function App() {
  const [page, setPage] = useState(route);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    const on = () => setPage(route());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* sin almacenamiento */ }
  }, [theme]);
  // En kichwa casi todo sigue en español; el saludo lleva lang="qu-EC".
  useEffect(() => { document.documentElement.lang = lang === 'qu' ? 'es' : lang; }, [lang]);

  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* sin almacenamiento */ } };
  const ctx = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <LangContext.Provider value={ctx}>
      <MotionConfig reducedMotion="user">
      {page === 'admin'
        ? <Admin theme={theme} toggleTheme={toggleTheme} />
        : <Chat theme={theme} toggleTheme={toggleTheme} setLang={setLang} embed={page === 'embed'} />}
      </MotionConfig>
    </LangContext.Provider>
  );
}
