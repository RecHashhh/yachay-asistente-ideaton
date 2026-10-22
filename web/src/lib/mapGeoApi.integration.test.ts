import { describe, expect, it } from 'vitest';
import { createGeoApi } from './mapGeoApi';
import { createMapConversation, handleMapMessage } from './mapConversation';

const testBase = 'http://127.0.0.1:8100';
const available = await fetch(`${testBase}/health`)
  .then((response) => response.ok)
  .catch(() => false);

describe.skipIf(!available)('integración con Yachay Maps Geo API real', () => {
  it('carga la configuración y las capas reales del campus', async () => {
    const api = createGeoApi(testBase);
    const config = await api.config();
    const features = await api.features({ limit: 5 });
    expect(config.center).toHaveLength(2);
    expect(config.bounds).toHaveLength(4);
    expect(config.layers.length).toBeGreaterThan(0);
    expect(features.type).toBe('FeatureCollection');
    expect(features.features.length).toBeGreaterThan(0);
    expect(api.trace.map((call) => call.endpoint)).toEqual(expect.arrayContaining([
      '/api/map/config',
      '/api/map/features?limit=5',
    ]));
  });

  it('resuelve SENESCYT y conserva el destino al pedir el origen', async () => {
    const api = createGeoApi(testBase);
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    expect(first.conversation.state).toBe('awaiting_route_confirmation');
    expect(first.conversation.destination?.display_name).toMatch(/senecyt/i);
    expect(first.messages.at(-1)?.map?.places.length).toBeGreaterThan(0);

    const second = await handleMapMessage(first.conversation, 'Sí', api);
    expect(second.conversation.state).toBe('awaiting_origin');
    expect(second.conversation.destination?.id).toBe(first.conversation.destination?.id);
  });

  it('calcula la ruta real entre el Bloque A y SENESCYT', async () => {
    const api = createGeoApi(testBase);
    const result = await handleMapMessage(createMapConversation(), 'Quiero ir del Bloque A a SENESCYT', api);
    expect(result.conversation.state).toBe('showing_route');
    expect(result.messages.at(-1)?.map?.route?.geometry.type).toBe('LineString');
    expect(result.messages.at(-1)?.map?.route?.distance_m).toBeGreaterThan(30);
    expect(result.messages.at(-1)?.map?.route?.distance_m).toBeLessThan(50);
    expect(result.messages.at(-1)?.text).toMatch(/ruta peatonal/i);
    expect(result.messages.at(-1)?.text).toMatch(/39 m/);
    expect(result.messages.at(-1)?.actions?.[0]?.url).toContain('google.com/maps');
  });

  it('calcula la ruta indirecta de Krispan a Plaza Las Manuelas', async () => {
    const api = createGeoApi(testBase);
    const result = await handleMapMessage(createMapConversation(), 'Quiero ir de Krispan a Plaza Las Manuelas', api);
    expect(result.conversation.state).toBe('showing_route');
    expect(result.messages.at(-1)?.map?.route?.geometry.type).toBe('LineString');
    expect(result.messages.at(-1)?.map?.route?.distance_m).toBeGreaterThan(500);
    expect(result.messages.at(-1)?.text).toMatch(/ruta peatonal/i);
  });

  it('desambigua «los bloques» con candidatos reales', async () => {
    const api = createGeoApi(testBase);
    const first = await handleMapMessage(createMapConversation(), '¿Dónde queda SENESCYT?', api);
    const second = await handleMapMessage(first.conversation, 'Sí', api);
    const result = await handleMapMessage(second.conversation, 'Estoy en los bloques', api);
    expect(result.conversation.state).toBe('disambiguating_place');
    expect(result.conversation.candidates?.length).toBeGreaterThan(1);
    expect(result.conversation.destination?.display_name).toMatch(/senecyt/i);
  });
});
