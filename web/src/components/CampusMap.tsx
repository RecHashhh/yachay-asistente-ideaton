import { motion, useReducedMotion } from 'motion/react';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { PLACES, VIEWBOX, placeById, placeName } from '../lib/campus';
import { useT } from '../lib/i18n';
import type { MapAction } from '../lib/types';
import { IcMap } from './icons';

/**
 * Mapa del campus que dibuja lo que pide la herramienta `mostrar_en_mapa`:
 * flecha animada de `origen` a `destino`, círculo pulsante en el destino y círculos en `resaltar`.
 */
export function CampusMap({ action, scrollIntoView }: { action: MapAction; scrollIntoView?: boolean }) {
  const reduce = useReducedMotion();
  const { lang } = useT();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (scrollIntoView) ref.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }, [scrollIntoView, reduce, action.destino]);
  const dest = placeById(action.destino);
  const from = action.origen ? placeById(action.origen) : undefined;
  if (!dest && action.lat !== undefined && action.lon !== undefined) return <RealPlace action={action} />;
  const extra = (action.resaltar ?? []).map(placeById).filter((p) => p && p.id !== dest?.id);
  if (!dest) return null;

  // Curva suave entre origen y destino; el punto de control se separa perpendicularmente.
  let path = '';
  let head = '';
  if (from) {
    const mx = (from.x + dest.x) / 2, my = (from.y + dest.y) / 2;
    const dx = dest.x - from.x, dy = dest.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * len * 0.22, cy = my + (dx / len) * len * 0.22;
    // La flecha termina antes del círculo del destino.
    const tx = dest.x - cx, ty = dest.y - cy, tl = Math.hypot(tx, ty) || 1;
    const ex = dest.x - (tx / tl) * 30, ey = dest.y - (ty / tl) * 30;
    path = `M${from.x},${from.y} Q${cx},${cy} ${ex},${ey}`;
    const a = Math.atan2(ey - cy, ex - cx);
    const s = 14;
    head = `M${ex - s * Math.cos(a - 0.45)},${ey - s * Math.sin(a - 0.45)} L${ex},${ey} L${ex - s * Math.cos(a + 0.45)},${ey - s * Math.sin(a + 0.45)}`;
  }

  return (
    <motion.figure ref={ref} className="map-card" style={{ margin: 0 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} role="img" aria-label={lang === 'en' ? `Campus map: ${from ? `from ${from.nameEn} to ` : ''}${dest.nameEn}` : `Mapa del campus: ${from ? `de ${from.name} a ` : ''}${dest.name}`}>
        <CampusBase activeId={dest.id} lang={lang} />
        {extra.map((p, i) => p && (
          <motion.circle key={p.id} cx={p.x} cy={p.y} r={22} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="6 5"
            initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.1 }} style={{ originX: `${p.x}px`, originY: `${p.y}px` }} />
        ))}
        {path && (
          <g stroke="var(--brand-2)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d={path} strokeDasharray="0 1" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }} />
            <motion.path d={head} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.2 }} />
          </g>
        )}
        {from && <circle cx={from.x} cy={from.y} r={9} fill="var(--surface)" stroke="var(--brand-2)" strokeWidth={4} />}
        {!reduce && (
          <motion.circle cx={dest.x} cy={dest.y} r={22} fill="var(--brand-2)"
            initial={{ opacity: 0.35, scale: 0.6 }} animate={{ opacity: 0, scale: 2.2 }} transition={{ duration: 1.8, repeat: Infinity, delay: 1.2, ease: 'easeOut' }}
            style={{ originX: `${dest.x}px`, originY: `${dest.y}px` }} />
        )}
        <motion.circle cx={dest.x} cy={dest.y} r={22} fill="none" stroke="var(--brand-2)" strokeWidth={5}
          initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: reduce ? 0 : 1.1 }}
          style={{ originX: `${dest.x}px`, originY: `${dest.y}px` }} />
      </svg>
      <figcaption><span className="dot" /> <b>{placeName(dest, lang)}</b>{from && <span className="muted">{lang === 'en' ? 'from' : 'desde'} {placeName(from, lang)}</span>}<span className="sp" /><IcMap width={16} height={16} className="muted" /></figcaption>
    </motion.figure>
  );
}

/** Plano esquemático PROVISIONAL. Reemplázalo por el SVG oficial del campus (ver lib/campus.ts). */
function CampusBase({ activeId, lang }: { activeId: string; lang: string }) {
  return (
    <g>
      <rect width={VIEWBOX.w} height={VIEWBOX.h} fill="var(--map-ground)" />
      <path d="M0 80 C200 40 380 120 560 70 S880 30 1000 90 V0 H0Z" fill="var(--map-green)" />
      <ellipse cx="160" cy="200" rx="120" ry="70" fill="var(--map-green)" />
      <g stroke="var(--map-path)" strokeWidth={18} fill="none" strokeLinecap="round">
        <path d="M60 590 L250 470 L520 470 L860 500" />
        <path d="M250 470 L300 330 L500 250 L800 230" />
        <path d="M500 250 L650 360 L700 560" />
        <path d="M520 470 L650 360" />
        <path d="M250 470 L380 560 L700 560" />
        <path d="M500 250 L650 140" />
        <path d="M250 470 L140 380 L300 330" />
      </g>
      {PLACES.map((p) => (
        <g key={p.id}>
          <rect x={p.x - 42} y={p.y - 26} width={84} height={52} rx={8} fill="var(--map-bldg)" stroke={p.id === activeId ? 'var(--brand-2)' : 'var(--map-bldg-line)'} strokeWidth={p.id === activeId ? 2.5 : 1.5} />
          <text x={p.x} y={p.y + 46} textAnchor="middle" className={p.id === activeId ? 'map-label' : 'map-label dim'}>{placeName(p, lang)}</text>
        </g>
      ))}
    </g>
  );
}

const RealMap = lazy(() => import('./RealMap'));

/** Lugar real (coordenadas de los Excel de la universidad): mapa interactivo; mientras carga, la tarjeta con nombre y horario. */
function RealPlace({ action }: { action: MapAction }) {
  const { t } = useT();
  const href = action.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${action.lat},${action.lon}`;
  const card = (
    <motion.figure className="map-card real-place" style={{ margin: 0 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <figcaption>
        <span className="dot" />
        <span><b>{action.nombre ?? action.destino}</b>{action.horario && <span className="muted"> · {t('hours')}: {action.horario}</span>}</span>
        <span className="sp" />
        <a className="btn sm" href={href} target="_blank" rel="noreferrer"><IcMap width={14} height={14} />{t('openMaps')}<span className="sr"> (nueva pestaña)</span></a>
      </figcaption>
    </motion.figure>
  );
  return <Suspense fallback={card}><RealMap action={action} /></Suspense>;
}
