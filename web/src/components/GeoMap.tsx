import type { FeatureCollection, Geometry, LineString } from 'geojson';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import type { RasterLayerSpecification, RasterSourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { googleMapsNavigation } from '../lib/googleMapsNavigation';
import type { MapConfig, MapFeatures } from '../lib/mapGeoApi';
import type { MapView, PlaceRole } from '../lib/mapConversation';

interface Props {
  view: MapView;
  theme: 'light' | 'dark';
  basemap?: MapFeatures | null;
  config?: MapConfig | null;
}

setWorkerUrl(workerUrl);

const OSM_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const SATELLITE_TILE_OVERRIDE = String(import.meta.env.VITE_SATELLITE_TILE_URL ?? '').trim();
const SATELLITE_TILES = SATELLITE_TILE_OVERRIDE
  ? [SATELLITE_TILE_OVERRIDE]
  : ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
const SATELLITE_ATTRIBUTION = String(import.meta.env.VITE_SATELLITE_ATTRIBUTION ?? '').trim()
  || 'Source: <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';
const BASEMAP_STORAGE_KEY = 'yachay-map-basemap';

type BasemapMode = 'streets' | 'satellite';

let satelliteConfirmed = false;

function readBasemapMode(): BasemapMode {
  try {
    return sessionStorage.getItem(BASEMAP_STORAGE_KEY) === 'streets' ? 'streets' : 'satellite';
  } catch {
    return 'satellite';
  }
}

function storeBasemapMode(mode: BasemapMode) {
  try { sessionStorage.setItem(BASEMAP_STORAGE_KEY, mode); } catch { return; }
}

function satelliteTileUrl(map: MapLibreMap): string {
  const center = map.getCenter();
  const z = Math.max(0, Math.min(19, Math.floor(map.getZoom())));
  const n = 2 ** z;
  const lat = (center.lat * Math.PI) / 180;
  const x = Math.floor(((center.lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return SATELLITE_TILES[0]!.replaceAll('{z}', String(z)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y));
}

async function probeSatellite(map: MapLibreMap): Promise<boolean> {
  if (satelliteConfirmed) return true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(satelliteTileUrl(map), { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return false;
    satelliteConfirmed = true;
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function basemapSource(mode: BasemapMode): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: mode === 'satellite' ? SATELLITE_TILES : OSM_TILES,
    tileSize: 256,
    maxzoom: 19,
    attribution: mode === 'satellite' ? SATELLITE_ATTRIBUTION : OSM_ATTRIBUTION,
  };
}

function basemapPaint(mode: BasemapMode, dark: boolean): RasterLayerSpecification['paint'] {
  if (mode === 'satellite' || !dark) return {};
  return { 'raster-brightness-min': 0.1, 'raster-brightness-max': 0.55, 'raster-saturation': -0.25 };
}

function applyBasemap(map: MapLibreMap, mode: BasemapMode, dark: boolean) {
  const beforeId = map.getStyle().layers?.find((layer) => layer.id !== 'basemap')?.id;
  if (map.getLayer('basemap')) map.removeLayer('basemap');
  if (map.getSource('basemap')) map.removeSource('basemap');
  map.addSource('basemap', basemapSource(mode));
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap', paint: basemapPaint(mode, dark) }, beforeId);
}

interface PlaceProperties {
  role: PlaceRole;
  name: string;
}

function collectCoordinates(value: unknown, out: [number, number][] = []): [number, number][] {
  if (!Array.isArray(value)) return out;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    out.push([value[0], value[1]]);
    return out;
  }
  for (const item of value) collectCoordinates(item, out);
  return out;
}

function placesGeoJson(view: MapView): FeatureCollection<Geometry, PlaceProperties> {
  return {
    type: 'FeatureCollection',
    features: view.places.map((entry) => ({
      type: 'Feature',
      geometry: entry.place.geometry ?? entry.place.location,
      properties: { role: entry.role, name: entry.place.display_name || entry.place.name || '' },
    })),
  };
}

function routeGeoJson(view: MapView): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: view.route
      ? [{ type: 'Feature', geometry: view.route.geometry, properties: {} }]
      : [],
  };
}

export function GeoMap({ view, theme, basemap, config }: Props) {
  const { t, lang } = useT();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<BasemapMode>(readBasemapMode);
  const modeRef = useRef<BasemapMode>(mode);
  const [satelliteFailed, setSatelliteFailed] = useState(false);

  const validateSatellite = async (map: MapLibreMap) => {
    const ok = await probeSatellite(map);
    if (!ok && mapRef.current === map && modeRef.current === 'satellite') {
      modeRef.current = 'streets';
      storeBasemapMode('streets');
      setMode('streets');
      setSatelliteFailed(true);
    }
  };

  const selectMode = (next: BasemapMode) => {
    if (next === modeRef.current) return;
    modeRef.current = next;
    storeBasemapMode(next);
    setSatelliteFailed(false);
    setMode(next);
  };

  useEffect(() => {
    if (!container.current) return;
    setFailed(false);
    const root = getComputedStyle(document.documentElement);
    const brand = root.getPropertyValue('--brand-2').trim() || '#0587bc';
    const accent = root.getPropertyValue('--accent').trim() || '#27618e';
    const warm = root.getPropertyValue('--warm').trim() || '#d98a00';
    const dark = theme === 'dark';

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: { version: 8, sources: {}, layers: [] },
        center: view.places[0]
          ? ([view.places[0].place.location.coordinates[0], view.places[0].place.location.coordinates[1]] as [number, number])
          : (config?.center ?? [-78.1727, 0.4103]),
        zoom: view.places[0] ? 16 : (config?.zoom ?? 11),
        attributionControl: {},
        scrollZoom: false,
      });
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mapDebug')) {
      (window as Window & { __yachayMapDebug?: MapLibreMap }).__yachayMapDebug = map;
    }
    loadedRef.current = false;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const markers: Marker[] = [];
    const coordinates: [number, number][] = [];

    map.on('load', () => {
      loadedRef.current = true;
      applyBasemap(map, modeRef.current, dark);
      if (basemap?.features.length) {
        map.addSource('geo-base', { type: 'geojson', data: basemap });
        map.addLayer({
          id: 'geo-base-fill',
          type: 'fill',
          source: 'geo-base',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#78909c', 'fill-opacity': 0.07 },
        });
        map.addLayer({
          id: 'geo-base-line',
          type: 'line',
          source: 'geo-base',
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
          paint: {
            'line-color': ['match', ['get', 'category'], 'highway', warm, '#78909c'],
            'line-width': ['match', ['get', 'category'], 'highway', 1.1, 0.5],
            'line-opacity': 0.5,
          },
        });
        map.addLayer({
          id: 'geo-base-points',
          type: 'circle',
          source: 'geo-base',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 3, 'circle-color': '#78909c', 'circle-opacity': 0.55, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
        });
      }
      map.addSource('geo-places', { type: 'geojson', data: placesGeoJson(view) });
      map.addLayer({
        id: 'geo-places-fill',
        type: 'fill',
        source: 'geo-places',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': ['match', ['get', 'role'], 'destination', brand, 'origin', accent, warm],
          'fill-opacity': ['match', ['get', 'role'], 'candidate', 0.08, 0.2],
        },
      });
      map.addLayer({
        id: 'geo-places-outline',
        type: 'line',
        source: 'geo-places',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': ['match', ['get', 'role'], 'destination', brand, 'origin', accent, warm],
          'line-width': 2.5,
        },
      });
      map.addLayer({
        id: 'geo-places-points',
        type: 'circle',
        source: 'geo-places',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['match', ['get', 'role'], 'candidate', 6, 8],
          'circle-color': ['match', ['get', 'role'], 'destination', brand, 'origin', accent, warm],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      if (view.route) {
        map.addSource('geo-route', { type: 'geojson', data: routeGeoJson(view) });
        map.addLayer({
          id: 'geo-route-line',
          type: 'line',
          source: 'geo-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': brand, 'line-width': 5, 'line-opacity': 0.95 },
        });
      }

      for (const entry of view.places) {
        const element = document.createElement('div');
        element.className = `geo-map-marker ${entry.role}`;
        element.textContent = entry.place.display_name || entry.place.name || '';
        markers.push(new Marker({ element, anchor: 'bottom' }).setLngLat([entry.place.location.coordinates[0]!, entry.place.location.coordinates[1]!]).addTo(map));
        collectCoordinates(entry.place.geometry ?? entry.place.location, coordinates);
      }
      if (view.route) collectCoordinates(view.route.geometry.coordinates, coordinates);

      if (coordinates.length === 1) {
        map.jumpTo({ center: coordinates[0]!, zoom: 17 });
      } else if (coordinates.length > 1) {
        const bounds = new LngLatBounds(coordinates[0]!, coordinates[0]!);
        for (const coordinate of coordinates) bounds.extend(coordinate);
        map.fitBounds(bounds, { padding: 46, maxZoom: 17.5, duration: 0 });
      }

      if (modeRef.current === 'satellite') void validateSatellite(map);
    });

    return () => {
      loadedRef.current = false;
      mapRef.current = null;
      for (const marker of markers) marker.remove();
      map.remove();
    };
  }, [view, theme, basemap, config]);

  useEffect(() => {
    modeRef.current = mode;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyBasemap(map, mode, theme === 'dark');
    if (mode === 'satellite') void validateSatellite(map);
  }, [mode, theme]);

  const destination = view.places.find((entry) => entry.role === 'destination')?.place;
  const origin = view.places.find((entry) => entry.role === 'origin')?.place;
  const candidates = view.places.filter((entry) => entry.role === 'candidate');
  const googleMaps = googleMapsNavigation(view, lang);
  let caption: string;
  if (view.route) {
    const distance = view.route.distance_m >= 1000 ? `${(view.route.distance_m / 1000).toFixed(1)} km` : `${Math.round(view.route.distance_m)} m`;
    const duration = Math.max(1, Math.round(view.route.duration_s / 60));
    caption = `${origin?.display_name ?? ''} → ${destination?.display_name ?? ''} · ${distance} · ${duration} min`;
  } else if (destination) {
    caption = `${destination.display_name}${origin ? ` · ${lang === 'en' ? 'from' : 'desde'} ${origin.display_name}` : ''}`;
  } else {
    caption = lang === 'en' ? `${candidates.length} matching places` : `${candidates.length} lugares coincidentes`;
  }

  return (
    <figure className="map-card geo-map" style={{ margin: 0 }}>
      <div className="geo-map-stage">
        <div ref={container} className="geo-map-canvas" role="region" aria-label={`${lang === 'en' ? 'Yachay campus map' : 'Mapa del campus Yachay'}: ${caption}`} />
        {!failed && (
          <div className="geo-map-modes" role="group" aria-label={t('mapLayers')}>
            <button type="button" aria-pressed={mode === 'satellite'} onClick={() => selectMode('satellite')}>{t('satellite')}</button>
            <button type="button" aria-pressed={mode === 'streets'} onClick={() => selectMode('streets')}>{t('streets')}</button>
          </div>
        )}
        {satelliteFailed && <p className="geo-map-satellite-error" role="status">{t('satelliteUnavailable')}</p>}
      </div>
      {failed && <p className="geo-map-fallback">No se pudo iniciar el mapa interactivo. Las ubicaciones siguen disponibles en la lista y en Google Maps.</p>}
      <figcaption>
        <span className="dot" />
        <span>{caption}</span>
        <span className="sp" />
        <span className="tag">{mode === 'satellite' ? 'Esri World Imagery' : 'OpenStreetMap'}</span>
        {googleMaps && (
          <a className="btn sm geo-map-google-link" href={googleMaps.href} target="_blank" rel="noopener noreferrer">
            {googleMaps.label}
          </a>
        )}
      </figcaption>
    </figure>
  );
}
