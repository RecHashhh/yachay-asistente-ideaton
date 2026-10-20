import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { IcChat, IcDots, IcPencil, IcTrash } from './icons';

export interface ChatSummary { id: string; title: string; at: number }

const DAY = 864e5;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * Conversaciones recientes agrupadas por fecha (como Gemini o ChatGPT). Abrir una no cambia el orden: solo se resalta.
 * Renombrar y eliminar viven en un menú «⋯» que aparece al pasar el cursor o al enfocar la fila.
 */
export function ChatList({ chats, currentId, onOpen, onRename, onDelete }: {
  chats: ChatSummary[];
  currentId: string;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const today = startOfDay(Date.now());
  const groups: [string, ChatSummary[]][] = [
    [t('today'), chats.filter((c) => c.at >= today)],
    [t('yesterday'), chats.filter((c) => c.at < today && c.at >= today - DAY)],
    [t('older'), chats.filter((c) => c.at < today - DAY)],
  ];
  const menuChat = menu ? chats.find((c) => c.id === menu.id) : undefined;
  return (
    <>
      {groups.filter(([, items]) => items.length).map(([label, items]) => (
        <div key={label} className="chat-group" role="group" aria-label={label}>
          <h4>{label}</h4>
          {items.map((c) => editing === c.id
            ? <RenameField key={c.id} initial={c.title} onDone={(v) => { if (v && v !== c.title) onRename(c.id, v); setEditing(null); }} />
            : (
              <div key={c.id} className={`chat-row${menu?.id === c.id ? ' menu-open' : ''}`} aria-current={c.id === currentId}>
                <button className="item" onClick={() => onOpen(c.id)} title={c.title} aria-label={c.title} aria-current={c.id === currentId}>
                  <IcChat /><span className="ellipsis">{c.title}</span>
                </button>
                <button className="icon-btn chat-more" aria-label={`${t('options')}: ${c.title}`} aria-haspopup="menu" aria-expanded={menu?.id === c.id}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.id === c.id ? null : { id: c.id, x: r.right, y: r.bottom }); }}>
                  <IcDots />
                </button>
              </div>
            ))}
        </div>
      ))}
      {menu && menuChat && (
        <RowMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[
          { label: t('rename'), icon: <IcPencil />, run: () => setEditing(menuChat.id) },
          { label: t('delete'), icon: <IcTrash />, run: () => onDelete(menuChat.id), danger: true },
        ]} />
      )}
    </>
  );
}

/** Menú flotante con posición fija (la barra lateral tiene overflow oculto). Escape o clic fuera lo cierran. */
function RowMenu({ x, y, items, onClose }: { x: number; y: number; onClose: () => void; items: { label: string; icon: ReactNode; run: () => void; danger?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key); };
  }, [onClose]);
  const move = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const bs = [...(ref.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const i = bs.indexOf(document.activeElement as HTMLElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
  };
  return (
    <div ref={ref} className="row-menu" role="menu" style={{ left: Math.min(x - 160, window.innerWidth - 176), top: Math.min(y + 4, window.innerHeight - 100) }} onKeyDown={move}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" className={it.danger ? 'danger' : undefined} onClick={() => { onClose(); it.run(); }}>{it.icon}{it.label}</button>
      ))}
    </div>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (v: string) => void }) {
  const { t } = useT();
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="inp rename" value={v} maxLength={60} aria-label={t('rename')}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onDone(v.trim()); if (e.key === 'Escape') onDone(initial); }}
      onBlur={() => onDone(v.trim())} />
  );
}
