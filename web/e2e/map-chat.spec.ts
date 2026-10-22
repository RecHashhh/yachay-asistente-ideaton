import { expect, test } from '@playwright/test';

const TILE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL9sAAAAASUVORK5CYII=', 'base64');

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
