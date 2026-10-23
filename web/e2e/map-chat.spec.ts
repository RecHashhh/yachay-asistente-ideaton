import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeData = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeData, data])));
  return Buffer.concat([length, typeData, data, checksum]);
}

const VALID_TILE_PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  pngChunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
  pngChunk('IEND', Buffer.alloc(0)),
]);
const TILE_PNG = VALID_TILE_PNG;

test('renders compact map geometry streamed by the unified API', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yt-consent-2026-10c', '1');
    localStorage.setItem('yt-lang', 'es');
  });

  await page.route('**/api/map/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      bounds: [-78.2, 0.39, -78.1, 0.43],
      center: [-78.17, 0.41],
      zoom: 14,
      srid: 4326,
      coordinate_order: 'longitude, latitude',
      layers: [],
      data_version: {},
    }),
  }));
  const tile = (route: import('@playwright/test').Route) => route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG });
  await page.route('https://server.arcgisonline.com/**', tile);
  await page.route('https://tile.openstreetmap.org/**', tile);
  await page.route('**/__yachi_api/chat', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    body: [
      {
        type: 'map',
        payload: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            id: 'patomar',
            geometry: { type: 'Point', coordinates: [-78.17, 0.41] },
            properties: {
              id: 'patomar', name: 'Patomar', display_name: 'Patomar',
              category: 'entertainment', subcategory: 'karaoke', role: 'destination',
              location: { type: 'Point', coordinates: [-78.17, 0.41] },
            },
          }],
        },
      },
      { type: 'token', text: 'Patomar queda en el mapa de Yachay.' },
      { type: 'done', messageId: 'map-e2e-1' },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  }));

  await page.goto('/');
  await expect(page.locator('#ask')).toBeVisible();
  await page.locator('#ask').fill('¿Dónde queda Patomar?');
  await page.locator('#ask').press('Enter');

  const answer = page.locator('.msg-ai').last();
  await expect(answer.getByText('Patomar queda en el mapa de Yachay.')).toBeVisible();
  await expect(answer.locator('.geo-map')).toBeVisible();
  await expect(answer.locator('.geo-map-marker.destination')).toHaveText('Patomar');
  await expect(answer.locator('.geo-map-google-link')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=0.41,-78.17',
  );
});

test('renders a real route after choosing an ambiguous destination', async ({ page }) => {
  test.skip(process.env.YACHAY_LIVE_E2E !== '1', 'requires the local API, PostGIS and pgRouting pilot stack');
  const browserErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('yt-consent-2026-10c', '1');
    localStorage.setItem('yt-lang', 'es');
    sessionStorage.setItem('yachay-map-basemap', 'streets');
  });

  const tile = (route: import('@playwright/test').Route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: VALID_TILE_PNG,
  });
  const esriResponses: number[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith('https://server.arcgisonline.com/')) esriResponses.push(response.status());
  });
  await page.route('https://tile.openstreetmap.org/**', tile);
  if (process.env.YACHAY_LIVE_ESRI_TILES !== '1') {
    await page.route('https://server.arcgisonline.com/**', tile);
  }

  await page.goto('/?mapDebug');
  await page.locator('#ask').fill('Plaza Las Manuelas hasta SENESCYT');
  await page.locator('#ask').press('Enter');

  const buildingOption = page.getByRole('button', { name: 'Edificio SENESCYT', exact: true });
  await expect(buildingOption).toBeVisible();
  await buildingOption.click();

  const answer = page.locator('.msg-ai').last();
  const map = answer.locator('.geo-map');
  await expect(map).toBeVisible();
  await expect(map.locator('.geo-map-marker.origin')).toHaveText('Plaza Las Manuelas');
  await expect(map.locator('.geo-map-marker.destination')).toContainText('Edificio SENESCYT');
  await expect(map.locator('.geo-map-canvas canvas.maplibregl-canvas')).toBeVisible();
  await expect(map.locator('figcaption')).toContainText('Plaza Las Manuelas → Edificio SENESCYT');
  await page.waitForFunction(() => {
    const map = (window as Window & { __yachayMapDebug?: any }).__yachayMapDebug;
    return map?.isStyleLoaded() && map.queryRenderedFeatures(undefined, { layers: ['geo-route-line'] }).length > 0;
  });
  const mapDebug = await page.evaluate(() => {
    const map = (window as Window & { __yachayMapDebug?: any }).__yachayMapDebug;
    return map ? {
      styleLoaded: map.isStyleLoaded(),
      layers: map.getStyle().layers.map((layer: { id: string }) => layer.id),
      sourceFeatureCount: map.querySourceFeatures('geo-route').length,
      renderedFeatureCount: map.queryRenderedFeatures(undefined, { layers: ['geo-route-line'] }).length,
      bounds: map.getBounds().toArray(),
    } : null;
  });
  expect(mapDebug?.styleLoaded).toBe(true);
  expect(mapDebug?.layers).toContain('geo-route-line');
  expect(mapDebug?.sourceFeatureCount ?? 0).toBeGreaterThan(0);
  expect(mapDebug?.renderedFeatureCount ?? 0).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);

  await map.getByRole('button', { name: 'Satélite' }).click();
  await expect(map.getByRole('button', { name: 'Satélite' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map.locator('figcaption')).toContainText('Esri World Imagery');
  if (process.env.YACHAY_LIVE_ESRI_TILES === '1') {
    await expect.poll(() => esriResponses.some((status) => status === 200), { timeout: 15_000 }).toBe(true);
    await page.waitForFunction(() => {
      const map = (window as Window & { __yachayMapDebug?: any }).__yachayMapDebug;
      return map?.isStyleLoaded() && map.isSourceLoaded('basemap');
    });
    if (process.env.YACHAY_LIVE_E2E_SCREENSHOT) {
      await page.screenshot({ path: `${process.env.YACHAY_LIVE_E2E_SCREENSHOT}.satellite.png`, fullPage: true });
    }
  }
  await map.getByRole('button', { name: 'Calles' }).click();
  await expect(map.getByRole('button', { name: 'Calles' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map.locator('figcaption')).toContainText('OpenStreetMap');

  const latest = page.getByRole('button', { name: 'Ver lo más reciente' });
  if (await latest.isVisible()) await latest.click();
  if (process.env.YACHAY_LIVE_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.YACHAY_LIVE_E2E_SCREENSHOT, fullPage: true });
  }
});
