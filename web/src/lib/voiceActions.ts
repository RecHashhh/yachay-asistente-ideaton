import type { Lang } from './i18n';
import type { MapView } from './mapConversation';
import type { MapAction } from './types';

export const voiceActions = {
  es: {
    stopListening: 'Terminar pregunta', interrupt: 'Interrumpir y hablar', cancel: 'Cancelar respuesta',
    map: 'Abrir ubicación en Google Maps', showAnswer: 'Ver respuesta en el chat',
    mapHint: 'Debajo de la respuesta tienes el enlace «Abrir ubicación en Google Maps». Al activarlo se abre otra pestaña. También puedes decir «mapa» para enfocar el enlace y pulsar Enter.',
    internalMapHint: 'Puedes usar «Ver respuesta en el chat» para consultar el mapa disponible.',
    source: 'Abrir documento fuente', sourceHint: 'También tienes el enlace «Abrir documento fuente» para consultar la información original.',
    previous: 'Paso anterior', next: 'Siguiente paso', repeat: 'Repetir', all: 'Escuchar todos los pasos',
    stepsHint: 'Voy a leer el primer paso. Después puedes decir «siguiente», «repetir» o «todos los pasos», o usar los botones.',
    option: 'Opción', optionHint: 'Di el número de la opción o selecciónala con su botón.',
    step: 'Paso', office: 'Lo atiende', documents: 'Necesitas', sourceLabel: 'Fuente', version: 'versión',
    unverifiedRoute: 'Este plano es orientativo y no confirma un recorrido accesible.',
    text: 'Escribir una pregunta', hideText: 'Ocultar escritura', preparing: 'Preparando micrófono…',
    reviewTranscript: 'Revisar transcripción antes de enviar',
  },
  en: {
    stopListening: 'Finish question', interrupt: 'Interrupt and speak', cancel: 'Cancel answer',
    map: 'Open location in Google Maps', showAnswer: 'View answer in chat',
    mapHint: 'Below the answer is an “Open location in Google Maps” link. It opens a new tab. Say “map” to focus the link, then press Enter.',
    internalMapHint: 'Use “View answer in chat” to explore the available map.',
    source: 'Open source document', sourceHint: 'An “Open source document” link is also available to check the original information.',
    previous: 'Previous step', next: 'Next step', repeat: 'Repeat', all: 'Hear all steps',
    stepsHint: 'I will read the first step. Then say “next”, “repeat” or “all steps”, or use the buttons.',
    option: 'Option', optionHint: 'Say the option number or select its button.',
    step: 'Step', office: 'Office in charge', documents: 'You need', sourceLabel: 'Source', version: 'version',
    unverifiedRoute: 'This map is indicative and does not confirm an accessible route.',
    text: 'Type a question', hideText: 'Hide text input', preparing: 'Preparing microphone…',
    reviewTranscript: 'Review transcript before sending',
  },
  // Experimental drafts, subject to the same review policy as voiceKichwa.ts.
  qu: {
    stopListening: 'Tapuyta tukuchina', interrupt: 'Harkashpa rimana', cancel: 'Kutichita harkana',
    map: 'Google Mapspi kuskata rikuna', showAnswer: 'Rimanakuypi kutichita rikuna',
    mapHint: 'Urapi «Google Mapspi kuskata rikuna» watana tiyan. Ñitishpaka mushuk pankapi kicharin. «Mapa» nishpa watanata akllay, chaymanta Enter ñitiy.',
    internalMapHint: 'Mapata rikunkapak «Rimanakuypi kutichita rikuna» ñitiy.',
    source: 'Killkashka pankata kichana', sourceHint: 'Kallari killkata rikunkapak «Killkashka pankata kichana» watana tiyan.',
    previous: 'Ñawpa ruray', next: 'Katina', repeat: 'Kutin uyana', all: 'Tukuy ruraykunata uyana',
    stepsHint: 'Kallari rurayta rimasha. Chaymanta «katina», «kutin uyana» mana kashpaka «tukuy» niy, mana kashpaka ñitinata llamkachiy.',
    option: 'Akllana', optionHint: 'Akllashkapa yupayta rimay, mana kashpaka ñitinata ñitiy.',
    step: 'Ruray', office: 'Yanapakkuna', documents: 'Charina', sourceLabel: 'Killka', version: 'mushukyachishka',
    unverifiedRoute: 'Kay mapa rikuchinallami kan; alli rina ñanta manarak taripashkanchu.',
    text: 'Tapuyta killkana', hideText: 'Killkanata pakana', preparing: 'Microfonota allichikuni…',
    reviewTranscript: 'Manarak kachashpa killkata rikuna',
  },
};

export function publicVoiceUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function voiceMapLink(answer: { map?: MapAction; geoMap?: MapView }): string | undefined {
  const destination = answer.geoMap?.places.find((item) => item.role === 'destination')?.place;
  const explicit = publicVoiceUrl(destination?.google_maps_url ?? answer.map?.mapsUrl);
  if (explicit && ['www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(new URL(explicit).hostname)) return explicit;
  const coordinates = destination?.location?.coordinates;
  const lat = coordinates?.[1] ?? answer.map?.lat;
  const lon = coordinates?.[0] ?? answer.map?.lon;
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

export const voiceActionText = (lang: Lang) => voiceActions[lang];
