import type { Geometry, LineString } from 'geojson';
import dictionary from '../data/map-test-dictionary.json';
import type { ApiTrace, GeoApi, PlaceSummary, RouteReason, RouteResponse, TravelMode } from './mapGeoApi';

export type MapState =
  | 'idle'
  | 'showing_place'
  | 'awaiting_route_confirmation'
  | 'awaiting_origin'
  | 'showing_route'
  | 'route_unavailable'
  | 'disambiguating_place';

export type PlaceRole = 'origin' | 'destination' | 'candidate';

export interface MapPlace extends PlaceSummary {
  geometry?: Geometry;
  google_maps_url?: string;
}

export interface MapView {
  places: { place: MapPlace; role: PlaceRole }[];
  route?: { geometry: LineString; distance_m: number; duration_s: number; mode: TravelMode };
}

export interface QuickReply {
  label: string;
  text: string;
}

export interface BotMessage {
  text: string;
  map?: MapView;
  quickReplies?: QuickReply[];
  actions?: { label: string; url: string }[];
}

export interface MapConversation {
  state: MapState;
  destination?: MapPlace;
  origin?: MapPlace;
  mode: TravelMode;
  candidates?: MapPlace[];
  candidateRole?: 'origin' | 'destination';
  pending?: { kind: 'route'; originQuery: string };
}

export interface MapDebug {
  question: string;
  normalized: string;
  intent: string;
  patternId: string;
  entities: Record<string, string>;
  previousState: MapState;
  nextState: MapState;
  calls: ApiTrace[];
  resolvedDestination?: string;
  resolvedOrigin?: string;
  routeStatus?: string;
  navigationUrl?: string;
  error?: string;
}

export interface EngineResult {
  conversation: MapConversation;
  messages: BotMessage[];
  debug: MapDebug;
}

interface DictionaryEntry {
  id: string;
  patterns: string[];
  intent: string;
  entities?: Record<string, string>;
}

interface Dictionary {
  examples: string[];
  intents: DictionaryEntry[];
}

export interface MapIntent {
  id: string;
  intent: string;
  entities: Record<string, string>;
  normalized: string;
}

type ParsedIntent = MapIntent;

const DICT = dictionary as Dictionary;

export function normalizeMapText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripLead = (text: string) => text.replace(/^(?:(?:hola|buenas|oye|mejor|ahora|entonces|por favor)\s+)+/, '');
const PLACE_ALIASES: Record<string, string> = { senescyt: 'senecyt' };
const cleanPlace = (value: string) => {
  const cleaned = value.replace(/^(?:el|la)\s+/, '').replace(/\s+por favor$/, '').trim();
  return PLACE_ALIASES[cleaned] ?? cleaned;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const templates = DICT.intents.flatMap((entry) => entry.patterns
  .filter((pattern) => /\{\w+\}/.test(pattern))
  .map((pattern) => {
    const marked = pattern.replace(/\{(\w+)\}/g, ' qqqplaceholder$1qqq ');
    const normalized = normalizeMapText(marked);
    const source = escapeRegex(normalized).replace(/qqqplaceholder(place|origin|destination)qqq/g, '(?<$1>.+)');
    return { entry, regex: new RegExp(`^${source}$`) };
  }));

const exact = DICT.intents.flatMap((entry) => entry.patterns
  .filter((pattern) => !/\{\w+\}/.test(pattern))
  .map((pattern) => ({ entry, pattern: normalizeMapText(pattern) })));

export function recognizeMapIntent(value: string): ParsedIntent {
  const normalized = normalizeMapText(value);
  const candidate = stripLead(normalized);
  for (const item of exact) {
    if (candidate === item.pattern) {
      return { id: item.entry.id, intent: item.entry.intent, entities: { ...item.entry.entities }, normalized };
    }
  }
  for (const item of templates) {
    const match = candidate.match(item.regex);
    if (!match) continue;
    const entities: Record<string, string> = {};
    for (const [key, raw] of Object.entries(match.groups ?? {})) entities[key] = cleanPlace(raw);
    return { id: item.entry.id, intent: item.entry.intent, entities, normalized };
  }
  return { id: 'unknown', intent: 'unknown', entities: {}, normalized };
}

export const mapTestExamples = (): string[] => [...DICT.examples];

export function createMapConversation(): MapConversation {
  return { state: 'idle', mode: 'walking' };
}

type ResolveResult =
  | { status: 'ok'; place: PlaceSummary }
  | { status: 'ambiguous'; candidates: PlaceSummary[] }
  | { status: 'not_found' };

async function resolvePlace(query: string, api: GeoApi): Promise<ResolveResult> {
  const normalizedQuery = normalizeMapText(query);
  const results = (await api.search(query, 8)).filter((item) => item.match !== 'category');
  if (!results.length) return { status: 'not_found' };

  const nameOf = (item: PlaceSummary) => normalizeMapText(item.name ?? item.display_name);
  const exactMatch = results.find((item) => nameOf(item) === normalizedQuery);
  if (exactMatch) return { status: 'ok', place: exactMatch };

  const preferred = results.find((item) => nameOf(item) === `edificio ${normalizedQuery}`);
  if (preferred) return { status: 'ok', place: preferred };

  const top = results[0]!;
  const second = results[1];
  const gap = second ? top.score - second.score : 1;
  const confident = results.length === 1
    || top.match.startsWith('exact')
    || top.match.startsWith('prefix')
    || (top.score >= 0.85 && gap >= 0.12)
    || (top.score >= 0.55 && gap >= 0.2);
  if (confident) return { status: 'ok', place: top };
  return { status: 'ambiguous', candidates: results.slice(0, 6) };
}

async function loadDetail(place: PlaceSummary, api: GeoApi): Promise<MapPlace> {
  try {
    return await api.detail(place.id);
  } catch {
    return place;
  }
}

const placeName = (place: MapPlace) => place.display_name || place.name || 'el lugar';

const quickRoute = (): QuickReply[] => [
  { label: 'Sí, trazar ruta', text: 'Sí' },
  { label: 'No, solo ver ubicación', text: 'No, gracias' },
];

const quickCandidates = (candidates: MapPlace[]): QuickReply[] => candidates.map((place) => ({ label: placeName(place), text: placeName(place) }));

function locationMap(place: MapPlace): MapView {
  return { places: [{ place, role: 'destination' }] };
}

function candidatesMap(candidates: MapPlace[]): MapView {
  return { places: candidates.map((place) => ({ place, role: 'candidate' })) };
}

function routeMap(origin: MapPlace, destination: MapPlace, route?: RouteResponse): MapView {
  const places: MapView['places'] = [
    { place: origin, role: 'origin' },
    { place: destination, role: 'destination' },
  ];
  if (route?.status === 'ok') {
    return {
      places,
      route: { geometry: route.geometry, distance_m: route.distance_m, duration_s: route.duration_s, mode: route.mode },
    };
  }
  return { places };
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${Math.round(seconds)} s`;
}

const reasonText: Record<RouteReason, string> = {
  no_verified_entrance: 'El mapa de OpenStreetMap todavía no tiene una entrada verificada para uno de los edificios.',
  no_nearby_routing_node: 'Uno de los lugares no está lo bastante cerca de un camino peatonal registrado.',
  isolated_routing_node: 'Uno de los accesos no está conectado a la red peatonal del campus.',
  disconnected_components: 'Los dos lugares están en zonas distintas de la red peatonal.',
  route_crosses_building: 'El recorrido disponible cruza el interior de un edificio y no se usa como ruta peatonal.',
  no_path: 'El motor de rutas no encontró un camino peatonal entre ambos puntos.',
  same_location: 'El origen y el destino corresponden al mismo punto de la red.',
};

async function mapsAction(destination: MapPlace, origin: MapPlace | undefined, mode: TravelMode, api: GeoApi) {
  try {
    const navigation = await api.googleMaps(destination.id, origin?.id, mode);
    return { label: origin ? 'Ver indicaciones en Google Maps' : 'Abrir en Google Maps', url: navigation.url };
  } catch {
    const lon = destination.location.coordinates[0];
    const lat = destination.location.coordinates[1];
    return { label: origin ? 'Ver indicaciones en Google Maps' : 'Abrir en Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` };
  }
}

async function calculateRoute(conversation: MapConversation, destination: MapPlace, origin: MapPlace, api: GeoApi): Promise<{ conversation: MapConversation; message: BotMessage }> {
  const route = await api.route(origin.id, destination.id, conversation.mode);
  const action = await mapsAction(destination, origin, conversation.mode, api);
  if (route.status === 'ok') {
    return {
      conversation: { ...conversation, state: 'showing_route', destination, origin },
      message: {
        text: `Encontré una ruta peatonal desde **${placeName(origin)}** hasta **${placeName(destination)}**.\n\nDistancia aproximada: **${formatDistance(route.distance_m)}** · Tiempo estimado: **${formatDuration(route.duration_s)}**.\n\nLa línea del mapa es el recorrido calculado con pgRouting.`,
        map: routeMap(origin, destination, route),
        actions: [action],
      },
    };
  }
  return {
    conversation: { ...conversation, state: 'route_unavailable', destination, origin },
    message: {
      text: `Encontré ambos lugares, pero todavía no tengo un recorrido peatonal verificado entre ellos.\n\n${reasonText[route.reason]}\n\nPuedo mantener sus ubicaciones en el mapa o abrir Google Maps para consultar indicaciones.`,
      map: routeMap(origin, destination, route),
      actions: [action],
    },
  };
}

function routeDestination(destination: MapPlace): BotMessage {
  return {
    text: `Encontré **${placeName(destination)}** en el mapa de Yachay.\n\n¿Desde dónde te encuentras? Puedes indicarme un bloque, edificio o lugar del campus.`,
    map: locationMap(destination),
  };
}

async function resolveAndRoute(
  conversation: MapConversation,
  destination: MapPlace,
  originQuery: string,
  api: GeoApi,
  messagePrefix = '',
): Promise<{ conversation: MapConversation; messages: BotMessage[] }> {
  const resolved = await resolvePlace(originQuery, api);
  if (resolved.status === 'ambiguous') {
    const candidates = resolved.candidates;
    return {
      conversation: {
        ...conversation,
        state: 'disambiguating_place',
        destination,
        origin: undefined,
        candidates,
        candidateRole: 'origin',
      },
      messages: [{
        text: `${messagePrefix}Encontré varios lugares que coinciden con «${originQuery}». ¿Desde cuál de ellos quieres salir?`,
        map: candidatesMap(candidates),
        quickReplies: quickCandidates(candidates),
      }],
    };
  }
  if (resolved.status === 'not_found') {
    return {
      conversation: { ...conversation, state: 'awaiting_origin', destination, origin: undefined },
      messages: [{
        text: `No encontré «${originQuery}» en el mapa del campus. No voy a inventar una ubicación. ¿Puedes indicarme otro bloque, edificio o lugar?`,
        map: locationMap(destination),
      }],
    };
  }
  const origin = await loadDetail(resolved.place, api);
  const result = await calculateRoute(conversation, destination, origin, api);
  return { conversation: result.conversation, messages: [result.message] };
}

async function selectCandidate(
  conversation: MapConversation,
  candidate: MapPlace,
  api: GeoApi,
): Promise<{ conversation: MapConversation; messages: BotMessage[] }> {
  const role = conversation.candidateRole ?? 'destination';
  const pending = conversation.pending;
  const place = await loadDetail(candidate, api);
  const base = { ...conversation, candidates: undefined, candidateRole: undefined, pending: undefined };

  if (role === 'origin' && conversation.destination) {
    const result = await calculateRoute(base, conversation.destination, place, api);
    return { conversation: result.conversation, messages: [result.message] };
  }

  if (pending?.kind === 'route') {
    if (!pending.originQuery.trim()) {
      return {
        conversation: { ...base, state: 'awaiting_origin', destination: place, origin: undefined },
        messages: [routeDestination(place)],
      };
    }
    return resolveAndRoute(base, place, pending.originQuery, api);
  }

  const action = await mapsAction(place, undefined, base.mode, api);
  return {
    conversation: { ...base, state: 'awaiting_route_confirmation', destination: place, origin: undefined },
    messages: [{
      text: `Encontré **${placeName(place)}** en el mapa de Yachay.\n\n¿Quieres que te trace la ruta para llegar?`,
      map: locationMap(place),
      quickReplies: quickRoute(),
      actions: [action],
    }],
  };
}

export async function handleMapMessage(current: MapConversation, raw: string, api: GeoApi, override?: MapIntent): Promise<EngineResult> {
  const previousState = current.state;
  const traceStart = api.trace.length;
  const parsed = override ?? recognizeMapIntent(raw);
  let conversation = current;
  let messages: BotMessage[] = [];
  let error: string | undefined;

  try {
    if (parsed.intent === 'unknown') {
      if (current.state === 'awaiting_origin' && raw.trim()) {
        const result = await resolveAndRoute(current, current.destination!, raw.trim(), api);
        conversation = result.conversation;
        messages = result.messages;
      } else if (current.state === 'disambiguating_place') {
        const answer = normalizeMapText(cleanPlace(parsed.normalized));
        const picked = current.candidates?.find((candidate) => normalizeMapText(placeName(candidate)) === answer);
        if (picked) {
          const result = await selectCandidate(current, picked, api);
          conversation = result.conversation;
          messages = result.messages;
        } else {
          messages = [{
            text: 'No reconocí ese lugar entre las opciones. Elige uno de los candidatos o escribe su nombre completo.',
            map: current.candidates ? candidatesMap(current.candidates) : undefined,
            quickReplies: current.candidates ? quickCandidates(current.candidates) : undefined,
          }];
        }
      } else {
        messages = [{
          text: 'No entendí esa pregunta en el modo de pruebas. Puedo buscar un lugar del campus, trazar una ruta o responder «sí»/«no» cuando te lo pregunte.',
        }];
      }
    } else if (parsed.intent === 'affirmative') {
      if (current.state === 'awaiting_route_confirmation' && current.destination) {
        conversation = { ...current, state: 'awaiting_origin', origin: undefined };
        messages = [{
          text: `¡Perfecto! ¿Desde dónde te encuentras? Puedes indicarme un bloque, edificio o lugar del campus.`,
          map: locationMap(current.destination),
        }];
      } else if (current.state === 'awaiting_origin') {
        messages = [{ text: 'Necesito un lugar de origen para calcular la ruta. Puedes decirme, por ejemplo, «estoy en el Bloque A».' }];
      } else {
        messages = [{ text: 'Ahora mismo no hay una pregunta pendiente. Primero dime qué lugar del campus quieres buscar.' }];
      }
    } else if (parsed.intent === 'negative') {
      if (current.destination) {
        conversation = { ...current, state: 'showing_place', origin: undefined, candidates: undefined, candidateRole: undefined, pending: undefined };
        messages = [{
          text: `De acuerdo, cancelo la navegación. Sigo mostrando **${placeName(current.destination)}** en el mapa.`,
          map: locationMap(current.destination),
        }];
      } else {
        conversation = { ...current, state: 'idle', origin: undefined, candidates: undefined, candidateRole: undefined, pending: undefined };
        messages = [{ text: 'De acuerdo. Cuando quieras, dime qué lugar del campus quieres ver.' }];
      }
    } else if (parsed.intent === 'find_place') {
      const query = parsed.entities.place ?? '';
      const resolved = await resolvePlace(query, api);
      if (resolved.status === 'ambiguous') {
        const candidates = resolved.candidates;
        conversation = {
          ...current,
          state: 'disambiguating_place',
          destination: undefined,
          origin: undefined,
          candidates,
          candidateRole: 'destination',
          pending: undefined,
        };
        messages = [{
          text: `Encontré varios lugares que coinciden con «${query}». ¿A cuál te refieres?`,
          map: candidatesMap(candidates),
          quickReplies: quickCandidates(candidates),
        }];
      } else if (resolved.status === 'not_found') {
        conversation = { ...current, state: current.destination ? 'showing_place' : 'idle' };
        messages = [{
          text: `No encontré «${query}» en el mapa del campus. No voy a inventar una ubicación. Prueba con otro nombre o revisa la lista de lugares.`,
          map: current.destination ? locationMap(current.destination) : undefined,
        }];
      } else {
        const place = await loadDetail(resolved.place, api);
        const action = await mapsAction(place, undefined, current.mode, api);
        conversation = { ...current, state: 'awaiting_route_confirmation', destination: place, origin: undefined, candidates: undefined, candidateRole: undefined, pending: undefined };
        messages = [{
          text: `Encontré **${placeName(place)}** en el mapa de Yachay.\n\n¿Quieres que te trace la ruta para llegar?`,
          map: locationMap(place),
          quickReplies: quickRoute(),
          actions: [action],
        }];
      }
    } else if (parsed.intent === 'provide_origin') {
      if (!current.destination) {
        conversation = { ...current, state: 'idle' };
        messages = [{ text: 'Primero dime a qué lugar quieres ir. Después me indicas desde dónde sales.' }];
      } else {
        const result = await resolveAndRoute(current, current.destination, parsed.entities.place ?? raw, api);
        conversation = result.conversation;
        messages = result.messages;
      }
    } else if (parsed.intent === 'route_destination') {
      const query = parsed.entities.destination ?? '';
      const resolved = await resolvePlace(query, api);
      if (resolved.status === 'ambiguous') {
        const candidates = resolved.candidates;
        conversation = {
          ...current,
          state: 'disambiguating_place',
          destination: undefined,
          origin: undefined,
          candidates,
          candidateRole: 'destination',
          pending: { kind: 'route', originQuery: '' },
        };
        messages = [{
          text: `Encontré varios lugares que coinciden con «${query}». ¿A cuál quieres llegar?`,
          map: candidatesMap(candidates),
          quickReplies: quickCandidates(candidates),
        }];
      } else if (resolved.status === 'not_found') {
        conversation = { ...current, state: 'idle' };
        messages = [{ text: `No encontré «${query}» en el mapa del campus. ¿Puedes indicarme otro nombre?` }];
      } else {
        const place = await loadDetail(resolved.place, api);
        conversation = { ...current, state: 'awaiting_origin', destination: place, origin: undefined, candidates: undefined, candidateRole: undefined, pending: undefined };
        messages = [routeDestination(place)];
      }
    } else if (parsed.intent === 'route') {
      const destinationQuery = parsed.entities.destination ?? '';
      const originQuery = parsed.entities.origin ?? '';
      const resolved = await resolvePlace(destinationQuery, api);
      if (resolved.status === 'ambiguous') {
        const candidates = resolved.candidates;
        conversation = {
          ...current,
          state: 'disambiguating_place',
          destination: undefined,
          origin: undefined,
          candidates,
          candidateRole: 'destination',
          pending: { kind: 'route', originQuery },
        };
        messages = [{
          text: `Encontré varios lugares que coinciden con «${destinationQuery}». ¿A cuál quieres llegar?`,
          map: candidatesMap(candidates),
          quickReplies: quickCandidates(candidates),
        }];
      } else if (resolved.status === 'not_found') {
        conversation = { ...current, state: 'idle' };
        messages = [{ text: `No encontré «${destinationQuery}» en el mapa del campus. ¿Puedes indicarme otro destino?` }];
      } else {
        const destination = await loadDetail(resolved.place, api);
        const result = await resolveAndRoute(current, destination, originQuery, api);
        conversation = result.conversation;
        messages = result.messages;
      }
    } else if (parsed.intent === 'disambiguating_place') {
      messages = [{
        text: 'Elige uno de los lugares que aparecen en el mapa para continuar.',
        map: current.candidates ? candidatesMap(current.candidates) : undefined,
        quickReplies: current.candidates ? quickCandidates(current.candidates) : undefined,
      }];
    }
  } catch (caught) {
    error = (caught as Error).message;
    conversation = current;
    messages = [{ text: 'No pude conectar con Yachay Maps Geo API. Comprueba que el servicio esté activo e inténtalo de nuevo.' }];
  }

  const debug: MapDebug = {
    question: raw,
    normalized: parsed.normalized,
    intent: parsed.id,
    patternId: parsed.id,
    entities: parsed.entities,
    previousState,
    nextState: conversation.state,
    calls: api.trace.slice(traceStart),
    ...(conversation.destination ? { resolvedDestination: placeName(conversation.destination) } : {}),
    ...(conversation.origin ? { resolvedOrigin: placeName(conversation.origin) } : {}),
    ...(conversation.state === 'showing_route' || conversation.state === 'route_unavailable' ? { routeStatus: conversation.state } : {}),
    ...(messages.at(-1)?.actions?.[0]?.url ? { navigationUrl: messages.at(-1)!.actions![0]!.url } : {}),
    ...(error ? { error } : {}),
  };

  return { conversation, messages, debug };
}
