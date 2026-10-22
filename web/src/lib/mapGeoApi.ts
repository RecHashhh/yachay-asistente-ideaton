import type { FeatureCollection, Geometry, LineString, Point } from 'geojson';

export type TravelMode = 'walking' | 'driving';

export interface PlaceSummary {
  id: string;
  name: string | null;
  display_name: string;
  category: string;
  subcategory: string | null;
  location: Point;
  osm_type: string;
  osm_id: number;
  score: number;
  match: string;
}

export interface PlaceDetail extends PlaceSummary {
  geometry: Geometry;
  geometry_valid: boolean;
  tags: Record<string, string>;
  aliases: string[];
  entrances: { id: string; location: Point }[];
  google_maps_url: string;
}

export interface RouteOk {
  status: 'ok';
  reason: null;
  geometry: LineString;
  distance_m: number;
  duration_s: number;
  steps: number;
  mode: TravelMode;
}

export type RouteReason =
  | 'no_verified_entrance'
  | 'no_nearby_routing_node'
  | 'isolated_routing_node'
  | 'disconnected_components'
  | 'route_crosses_building'
  | 'no_path'
  | 'same_location';

export interface RouteUnavailable {
  status: 'route_unavailable';
  reason: RouteReason;
  geometry: null;
  distance_m: null;
  duration_s: null;
  steps: null;
  mode: TravelMode;
}

export type RouteResponse = RouteOk | RouteUnavailable;

export interface MapLayer {
  id: string;
  label: string;
  category: string;
  count: number;
}

export interface MapConfig {
  bounds: [number, number, number, number];
  center: [number, number];
  zoom: number;
  srid: number;
  coordinate_order: string;
  layers: MapLayer[];
  data_version: Record<string, unknown>;
}

export interface MapFeatureProperties {
  id: string;
  name: string | null;
  display_name: string | null;
  category: string;
  subcategory: string | null;
  highway_type: string | null;
  pedestrian_allowed: boolean | null;
  vehicle_allowed: boolean | null;
  osm_type: string;
  osm_id: number;
  name_source: string;
}

export interface MapFeatures extends FeatureCollection<Geometry, MapFeatureProperties> {
  bbox: [number, number, number, number];
  numberMatched: number;
  numberReturned: number;
  offset: number;
  limit: number;
  truncated: boolean;
  zoom: number | null;
  data_version: Record<string, unknown>;
}

export interface MapFeaturesParams {
  bbox?: string;
  category?: string;
  limit?: number;
  offset?: number;
  zoom?: number;
}

export interface NavigationResponse {
  url: string;
  provider?: string;
  mode?: TravelMode;
}

export interface ApiTrace {
  method: string;
  endpoint: string;
  status: number | null;
  durationMs: number;
  error?: string;
}

export interface GeoApi {
  readonly trace: ApiTrace[];
  config(): Promise<MapConfig>;
  features(params?: MapFeaturesParams): Promise<MapFeatures>;
  search(query: string, limit?: number): Promise<PlaceSummary[]>;
  detail(id: string): Promise<PlaceDetail>;
  route(originId: string, destinationId: string, mode: TravelMode): Promise<RouteResponse>;
  googleMaps(destinationId: string, originId?: string, mode?: TravelMode): Promise<NavigationResponse>;
}

const configuredApiUrl = (import.meta.env.VITE_MAP_API_URL as string | undefined)?.trim();
const unifiedApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const MAP_API_URL = (configuredApiUrl || unifiedApiUrl || '/__maps_api').replace(/\/$/, '');

export class MapApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number | null) {
    super(message);
    this.name = 'MapApiError';
  }
}

export function createGeoApi(base = MAP_API_URL): GeoApi {
  const trace: ApiTrace[] = [];

  async function request<T>(path: string): Promise<T> {
    const started = performance.now();
    let status: number | null = null;
    try {
      const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' } });
      status = response.status;
      const raw = await response.text();
      let body: unknown = null;
      if (raw) {
        try { body = JSON.parse(raw); } catch { body = raw; }
      }
      if (!response.ok) {
        const detail = (body as { detail?: unknown } | null)?.detail;
        const code = typeof detail === 'string' ? detail : `http_${response.status}`;
        throw new MapApiError(code, code, response.status);
      }
      return body as T;
    } catch (error) {
      if (error instanceof MapApiError) throw error;
      throw new MapApiError((error as Error).message, 'network_error', status);
    } finally {
      trace.push({
        method: 'GET',
        endpoint: path,
        status,
        durationMs: Math.round(performance.now() - started),
        ...(status === null ? { error: 'network_error' } : {}),
      });
    }
  }

  return {
    trace,
    config() {
      return request<MapConfig>('/api/map/config');
    },
    features(params = {}) {
      const query = new URLSearchParams();
      if (params.bbox) query.set('bbox', params.bbox);
      if (params.category) query.set('category', params.category);
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      if (params.offset !== undefined) query.set('offset', String(params.offset));
      if (params.zoom !== undefined) query.set('zoom', String(params.zoom));
      const suffix = query.toString();
      return request<MapFeatures>(`/api/map/features${suffix ? `?${suffix}` : ''}`);
    },
    async search(query, limit = 8) {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      const response = await request<{ results: PlaceSummary[] }>(`/api/places/search?${params}`);
      return response.results;
    },
    detail(id) {
      return request<PlaceDetail>(`/api/places/${encodeURIComponent(id)}`);
    },
    route(originId, destinationId, mode) {
      const params = new URLSearchParams({ origin_id: originId, destination_id: destinationId, mode });
      return request<RouteResponse>(`/api/routes?${params}`);
    },
    googleMaps(destinationId, originId, mode = 'walking') {
      const params = new URLSearchParams({ destination_id: destinationId, mode });
      if (originId) params.set('origin_id', originId);
      return request<NavigationResponse>(`/api/navigation/google-maps?${params}`);
    },
  };
}
