import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { getPlaces } from '../lib/api';
import { useT } from '../lib/i18n';
import type { MapAction } from '../lib/types';
import { IcMap } from './icons';

/**
 * Mapa real del campus (OpenStreetMap + Leaflet) con las coordenadas de los Excel de la universidad:
 * círculo en el destino, flecha desde el origen si la pregunta lo indica ("desde el rectorado") y el resto de lugares de referencia.
 * Se carga bajo demanda (React.lazy) para no sumar Leaflet a la carga inicial del chat.
 */
export default function RealMap({ action }: { action: MapAction }) {
  const { t, lang } = useT();
  const reduce = useReducedMotion();
  const el = useRef<HTMLDivElement>(null);
  const lat = action.lat!, lon = action.lon!;
  const from = action.desde ?? null;
  const name = action.nombre ?? action.destino;

  useEffect(() => {
    if (!el.current) return;
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue('--brand-2').trim() || '#1f6f9f';
    const muted = css.getPropertyValue('--muted').trim() || '#667085';
    const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);

    // Lugares de referencia (tenues), sin repetir el destino ni el origen.
    let alive = true;
    void getPlaces().then((ps) => {
      if (!alive) return;
      for (const p of ps) {
        if ((p.lat === lat && p.lon === lon) || (from && p.lat === from.lat && p.lon === from.lon)) continue;
        L.circleMarker([p.lat, p.lon], { radius: 4, color: muted, weight: 1, fillOpacity: 0.5 })
          .bindTooltip(lang === 'en' ? p.nameEn ?? p.name : p.name).addTo(map);
      }
    }).catch(() => undefined);

    L.circle([lat, lon], { radius: 35, color: brand, weight: 3, fillOpacity: 0.12, className: reduce ? undefined : 'map-pulse' }).addTo(map);
    L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 2, fillColor: brand, fillOpacity: 1 })
      .bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -8], className: 'map-tip' }).addTo(map);

    if (from) {
      L.circleMarker([from.lat, from.lon], { radius: 6, color: brand, weight: 3, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(from.nombre, { direction: 'bottom' }).addTo(map);
      // Flecha: la línea termina antes del círculo del destino y lleva una punta triangular.
      const dy = lat - from.lat, dx = lon - from.lon, len = Math.hypot(dx, dy) || 1e-9;
      const stop = Math.min(0.00035 / len, 0.3);
      const end: [number, number] = [lat - dy * stop, lon - dx * stop];
      L.polyline([[from.lat, from.lon], end], { color: brand, weight: 4, dashArray: reduce ? undefined : '8 8', className: reduce ? undefined : 'map-route' }).addTo(map);
      const a = Math.atan2(dy, dx), s = Math.min(len * 0.12, 0.00025);
      const wing = (k: number): [number, number] => [end[0] - s * Math.sin(a + k), end[1] - s * Math.cos(a + k)];
      L.polygon([end, wing(0.5), wing(-0.5)], { color: brand, weight: 1, fillColor: brand, fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.latLngBounds([[from.lat, from.lon], [lat, lon]]), { padding: [36, 36], maxZoom: 18 });
    } else {
      map.setView([lat, lon], 17);
    }
    return () => { alive = false; map.remove(); };
  }, [lat, lon, from?.lat, from?.lon, from?.nombre, name, lang, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const href = from
    ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${lat},${lon}&travelmode=walking`
    : action.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  const label = lang === 'en' ? `Interactive campus map: ${from ? `from ${from.nombre} to ` : ''}${name}` : `Mapa interactivo del campus: ${from ? `desde ${from.nombre} hasta ` : ''}${name}`;
  return (
    <figure className="map-card real-map" style={{ margin: 0 }}>
      <div ref={el} className="real-map-canvas" role="region" aria-label={label} />
      <figcaption>
        <span className="dot" />
        <span>
          <b>{name}</b>
          {from && <span className="muted"> · {lang === 'en' ? 'from' : 'desde'} {from.nombre}</span>}
          {action.horario && <span className="muted"> · {t('hours')}: {action.horario}</span>}
        </span>
        <span className="sp" />
        <a className="btn sm" href={href} target="_blank" rel="noreferrer"><IcMap width={14} height={14} />{from ? (lang === 'en' ? 'Walking directions' : 'Cómo llegar a pie') : t('openMaps')}<span className="sr"> (nueva pestaña)</span></a>
      </figcaption>
    </figure>
  );
}
