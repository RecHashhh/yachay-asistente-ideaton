import { describe, expect, it } from 'vitest';
import {
  createMapConversation,
  handleMapMessage,
  normalizeMapText,
  recognizeMapIntent,
  type MapConversation,
} from './mapConversation';
import type { GeoApi, NavigationResponse, PlaceDetail, PlaceSummary, RouteResponse } from './mapGeoApi';

const point = (lon = -78.17, lat = 0.41) => ({ type: 'Point' as const, coordinates: [lon, lat] as [number, number] });
const geometry = {
  type: 'Polygon' as const,
  coordinates: [[[-78.171, 0.409], [-78.169, 0.409], [-78.169, 0.411], [-78.171, 0.411], [-78.171, 0.409]]],
};

const place = (id: string, name: string, score = 0.9, match = 'contains_name'): PlaceSummary => ({
  id,
  name,
  display_name: name,
  category: 'building',
  subcategory: 'yes',
  location: point(),
  osm_type: 'way',
  osm_id: -1,
  score,
  match,
});

const detail = (p: PlaceSummary): PlaceDetail => ({
  ...p,
  geometry,
  geometry_valid: true,
  tags: {},
  aliases: p.name ? [p.name] : [],
  entrances: [],
  google_maps_url: `https://www.google.com/maps/search/?api=1&query=${p.location.coordinates[1]},${p.location.coordinates[0]}`,
});

const SENESCYT = [
  place('biblioteca-senecyt', 'Biblioteca Senecyt', 0.92),
  place('edificio-senecyt', 'Edificio Senecyt', 0.92),
  place('parada-senecyt', 'Parada Senecyt', 0.92),
];
const BLOQUE_A = place('bloque-a', 'Bloque A', 1, 'exact_name');
const BIBLIOTECA = place('biblioteca-ingenio', 'Biblioteca Ingenio', 0.97, 'prefix_name');
const BLOQUES = [
  place('bloque-b', 'Bloque B', 0.3643, 'fuzzy'),
  place('bloque-a', 'Bloque A', 0.34, 'fuzzy'),
  place('bloque-c', 'Bloque C', 0.34, 'fuzzy'),
];

interface FakeOptions {
  search?: (query: string) => PlaceSummary[];
  route?: RouteResponse;
  fail?: string;
}

function fakeApi(options: FakeOptions = {}): GeoApi {
  const trace: GeoApi['trace'] = [];
  const route = options.route ?? {
    status: 'ok',
    distance_m: 1035.3,
    duration_s: 739.5,
    geometry: {
      type: 'LineString',
      coordinates: [[-78.171, 0.409], [-78.17, 0.41], [-78.169, 0.411]],
    },
    steps: 3,
    reason: null,
    mode: 'walking',
  };
  return {
    trace,
    async config() { throw new Error('config no usado en estas pruebas'); },
    async features() { throw new Error('features no usado en estas pruebas'); },
    async search(query) {
      trace.push({ method: 'GET', endpoint: `/api/places/search?q=${encodeURIComponent(query)}`, status: 200, durationMs: 1 });
      if (options.fail === 'search') throw new Error('network down');
      const q = normalizeMapText(query);
      if (q.includes('senecyt')) return SENESCYT;
      if (q === 'bloque a') return [BLOQUE_A];
      if (q === 'los bloques' || q === 'bloques') return BLOQUES;
      if (q === 'biblioteca') return [BIBLIOTECA];
      return [];
    },
    async detail(id) {
      trace.push({ method: 'GET', endpoint: `/api/places/${id}`, status: 200, durationMs: 2 });
      const p = [...SENESCYT, BLOQUE_A, BIBLIOTECA, ...BLOQUES].find((x) => x.id === id);
      if (!p) throw new Error('place_not_found');
      return detail(p);
    },
    async route(originId, destinationId) {
      trace.push({ method: 'GET', endpoint: `/api/routes?origin_id=${originId}&destination_id=${destinationId}`, status: 200, durationMs: 3 });
      if (options.fail === 'route') throw new Error('network down');
      return route;
    },
    async googleMaps(destinationId, originId) {
      trace.push({ method: 'GET', endpoint: `/api/navigation/google-maps?destination_id=${destinationId}`, status: 200, durationMs: 1 });
      return { url: `https://www.google.com/maps/dir/?api=1&destination=${destinationId}${originId ? `&origin=${originId}` : ''}` } satisfies NavigationResponse;
    },
  };
}

function lastMessage(result: Awaited<ReturnType<typeof handleMapMessage>>) {
  return result.messages.at(-1)!;
}

describe('normalización y diccionario', () => {
  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizeMapText('¿Dónde queda el BLOQUE Á?')).toBe('donde queda el bloque a');
  });

  it('reconoce una pregunta de lugar con plantilla extensible', () => {
    const parsed = recognizeMapIntent('¿Dónde queda la biblioteca?');
    expect(parsed.intent).toBe('find_place');
    expect(parsed.entities.place).toBe('biblioteca');
  });

  it('reconoce un origen y una ruta entre dos lugares', () => {
    expect(recognizeMapIntent('Estoy en el Bloque A').entities.place).toBe('bloque a');
    const route = recognizeMapIntent('Quiero ir del Bloque A a SENESCYT');
    expect(route.intent).toBe('route');
    expect(route.entities).toEqual({ origin: 'bloque a', destination: 'senecyt' });
  });
});

describe('máquina de estados', () => {
  it('no interpreta un sí sin pregunta pendiente como navegación', async () => {
    const result = await handleMapMessage(createMapConversation(), 'Sí', fakeApi());
    expect(result.conversation.state).toBe('idle');
    expect(result.messages[0]!.text).toMatch(/no hay una pregunta pendiente/i);
  });

  it('acepta confirmaciones compuestas con el destino conservado', async () => {
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', fakeApi());
    const second = await handleMapMessage(first.conversation, 'Sí, trazar ruta', fakeApi());
    expect(second.conversation.state).toBe('awaiting_origin');
    expect(second.conversation.destination?.name).toBe('Edificio Senecyt');
  });

  it('encuentra SENESCYT, conserva el destino y resuelve la ruta', async () => {
    const api = fakeApi();
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    expect(first.conversation.state).toBe('awaiting_route_confirmation');
    expect(first.conversation.destination?.id).toBe('edificio-senecyt');
    expect(lastMessage(first).map?.places.some((x) => x.role === 'destination')).toBe(true);
    expect(lastMessage(first).quickReplies?.map((x) => x.text)).toContain('Sí');

    const second = await handleMapMessage(first.conversation, 'Sí', api);
    expect(second.conversation.state).toBe('awaiting_origin');
    expect(second.conversation.destination?.id).toBe('edificio-senecyt');
    expect(second.messages[0]!.text).toMatch(/desde dónde/i);

    const third = await handleMapMessage(second.conversation, 'Estoy en el Bloque A', api);
    expect(third.conversation.state).toBe('showing_route');
    expect(third.conversation.origin?.id).toBe('bloque-a');
    expect(lastMessage(third).map?.route?.distance_m).toBe(1035.3);
    expect(lastMessage(third).text).toMatch(/1[.,]0 km|1035/);
    expect(api.trace.some((x) => x.endpoint.startsWith('/api/routes'))).toBe(true);
  });

  it('rechaza la ruta sin calcularla y mantiene el lugar visible', async () => {
    const api = fakeApi();
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    const rejected = await handleMapMessage(first.conversation, 'No, gracias', api);
    expect(rejected.conversation.state).toBe('showing_place');
    expect(rejected.conversation.destination?.id).toBe('edificio-senecyt');
    expect(lastMessage(rejected).map?.places.some((x) => x.role === 'destination')).toBe(true);
    expect(api.trace.some((x) => x.endpoint.startsWith('/api/routes'))).toBe(false);
  });

  it('cambia de destino durante la confirmación pendiente', async () => {
    const api = fakeApi();
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    const changed = await handleMapMessage(first.conversation, 'Mejor quiero ir a la biblioteca', api);
    expect(changed.conversation.state).toBe('awaiting_route_confirmation');
    expect(changed.conversation.destination?.id).toBe('biblioteca-ingenio');
    expect(changed.conversation.destination?.id).not.toBe('edificio-senecyt');
    expect(lastMessage(changed).text).toMatch(/Biblioteca Ingenio/);
  });

  it('pide otro origen cuando no lo encuentra y no inventa coordenadas', async () => {
    const api = fakeApi();
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    const second = await handleMapMessage(first.conversation, 'Sí', api);
    const unknown = await handleMapMessage(second.conversation, 'Estoy en un edificio que no aparece', api);
    expect(unknown.conversation.state).toBe('awaiting_origin');
    expect(unknown.conversation.destination?.id).toBe('edificio-senecyt');
    expect(unknown.conversation.origin).toBeUndefined();
    expect(lastMessage(unknown).text).toMatch(/no encontré/i);
    expect(api.trace.some((x) => x.endpoint.startsWith('/api/routes'))).toBe(false);
  });

  it('desambigua un origen y permite elegir un candidato real', async () => {
    const api = fakeApi();
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    const second = await handleMapMessage(first.conversation, 'Sí', api);
    const ambiguous = await handleMapMessage(second.conversation, 'Estoy en los bloques', api);
    expect(ambiguous.conversation.state).toBe('disambiguating_place');
    expect(ambiguous.conversation.candidateRole).toBe('origin');
    expect(ambiguous.conversation.candidates?.map((x) => x.name)).toContain('Bloque A');
    expect(lastMessage(ambiguous).quickReplies?.map((x) => x.text)).toContain('Bloque A');

    const picked = await handleMapMessage(ambiguous.conversation, 'Bloque A', api);
    expect(picked.conversation.state).toBe('showing_route');
    expect(picked.conversation.origin?.id).toBe('bloque-a');
    expect(picked.conversation.destination?.id).toBe('edificio-senecyt');
  });

  it('explica una ruta sin entrada verificada y ofrece Google Maps', async () => {
    const api = fakeApi({
      route: {
        status: 'route_unavailable',
        reason: 'no_verified_entrance',
        geometry: null,
        distance_m: null,
        duration_s: null,
        steps: null,
        mode: 'walking',
      },
    });
    const result = await handleMapMessage(createMapConversation(), 'Quiero ir del Bloque A a SENESCYT', api);
    expect(result.conversation.state).toBe('route_unavailable');
    expect(lastMessage(result).map?.route).toBeUndefined();
    expect(lastMessage(result).text).toMatch(/entrada.*verificada|recorrido peatonal verificado/i);
    expect(lastMessage(result).actions?.[0]?.url).toContain('google.com/maps');
  });

  it('responde con un error comprensible si la API falla', async () => {
    const result = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', fakeApi({ fail: 'search' }));
    expect(result.conversation.state).toBe('idle');
    expect(result.messages[0]!.text).toMatch(/no pude conectar|error/i);
    expect(result.debug.error).toBeTruthy();
  });

  it('registra las transiciones y llamadas para el panel de diagnóstico', async () => {
    const result = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', fakeApi());
    expect(result.debug.previousState).toBe('idle');
    expect(result.debug.nextState).toBe('awaiting_route_confirmation');
    expect(result.debug.intent).toBe('find_senecyt');
    expect(result.debug.calls.length).toBeGreaterThan(0);
    expect(result.debug.calls[0]!.endpoint).toContain('/api/places/search');
  });
  it('reutiliza los mismos servicios con una intención externa del LLM', async () => {
    const api = fakeApi();
    const result = await handleMapMessage(createMapConversation(), 'consulta libre', api, {
      id: 'llm_find_place',
      intent: 'find_place',
      entities: { place: 'biblioteca' },
      normalized: 'consulta libre',
    });
    expect(result.conversation.state).toBe('awaiting_route_confirmation');
    expect(result.conversation.destination?.name).toBe('Biblioteca Ingenio');
    expect(api.trace.map((call) => call.endpoint)).toContain('/api/places/search?q=biblioteca');
  });
});

describe('tipos de conversación', () => {
  it('expone un estado inicial explícito', () => {
    const initial: MapConversation = createMapConversation();
    expect(initial).toEqual({ state: 'idle', mode: 'walking' });
  });
});
