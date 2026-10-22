import { describe, expect, it } from 'vitest';
import type { MapView } from './mapConversation';
import { googleMapsNavigation } from './googleMapsNavigation';

const place = (id: string, coordinates: [number, number]) => ({
  place: {
    id,
    name: id,
    display_name: id,
    category: 'other',
    subcategory: null,
    location: { type: 'Point' as const, coordinates },
    osm_type: 'node',
    osm_id: 1,
    score: 1,
    match: 'exact',
  },
  role: 'destination' as const,
});

describe('Google Maps navigation links', () => {
  it('creates a search link for one place using longitude/latitude coordinates', () => {
    const view: MapView = { places: [place('Patomar', [-78.17, 0.41])] };

    expect(googleMapsNavigation(view, 'es')).toEqual({
      href: 'https://www.google.com/maps/search/?api=1&query=0.41,-78.17',
      label: 'Abrir en Google Maps',
    });
  });

  it('creates a directions link from origin to destination without route geometry', () => {
    const origin = { ...place('Las Manuelas', [-78.18, 0.42]), role: 'origin' as const };
    const destination = place('Patomar', [-78.17, 0.41]);
    const view: MapView = { places: [origin, destination] };

    expect(googleMapsNavigation(view, 'es')).toEqual({
      href: 'https://www.google.com/maps/dir/?api=1&origin=0.42,-78.18&destination=0.41,-78.17&travelmode=walking',
      label: 'Ver indicaciones en Google Maps',
    });
  });

  it('does not create an arbitrary link for multiple candidates', () => {
    const view: MapView = {
      places: [
        { ...place('Lugar A', [-78.17, 0.41]), role: 'candidate' },
        { ...place('Lugar B', [-78.18, 0.42]), role: 'candidate' },
      ],
    };

    expect(googleMapsNavigation(view, 'es')).toBeNull();
  });
});
