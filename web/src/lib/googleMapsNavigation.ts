import type { MapView } from './mapConversation';
import type { Lang } from './i18n';

export interface GoogleMapsNavigation {
  href: string;
  label: string;
}

function coordinateQuery(view: MapView['places'][number]['place']): string | null {
  const [longitude, latitude] = view.location.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude},${longitude}`;
}

export function googleMapsNavigation(view: MapView, language: Lang): GoogleMapsNavigation | null {
  const origin = view.places.find((entry) => entry.role === 'origin')?.place;
  const destination = view.places.find((entry) => entry.role === 'destination')?.place;

  if (origin && destination) {
    const originQuery = coordinateQuery(origin);
    const destinationQuery = coordinateQuery(destination);
    if (!originQuery || !destinationQuery) return null;
    const mode = view.route?.mode ?? 'walking';
    return {
      href: `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${destinationQuery}&travelmode=${mode}`,
      label: language === 'en' ? 'Get directions in Google Maps' : 'Ver indicaciones en Google Maps',
    };
  }

  if (view.places.length !== 1) return null;
  const query = coordinateQuery(view.places[0]!.place);
  if (!query) return null;
  return {
    href: `https://www.google.com/maps/search/?api=1&query=${query}`,
    label: language === 'en' ? 'Open in Google Maps' : 'Abrir en Google Maps',
  };
}
