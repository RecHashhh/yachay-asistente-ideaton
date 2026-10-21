// Recorridos con datos sintéticos: nunca usa ni guarda documentos institucionales.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let revision = 'r1';
    const guide = lang => ({ id: 'guia-sintetica', revision, title: lang === 'en' ? 'Example guide' : 'Guía de ejemplo', summary: 'Contenido sintético para probar la utilidad.', office: 'Oficina de ejemplo', documents: ['Documento de ejemplo'], steps: [{ title: 'Primer paso' }, { title: 'Segundo paso' }], source: { docId: 'test', title: 'Fuente sintética', version: 'v1', docDate: '2026-10-20', locator: 'Prueba', snippet: 'Ejemplo' }, deadlines: [{ title: 'Plazo pasado', start: '2020-01-01', end: '2020-01-02' }, { title: 'Plazo futuro', start: '2099-01-01', end: '2099-01-02' }], contacts: [{ label: 'Contacto de prueba', email: 'prueba@example.invalid' }], links: [{ label: 'Enlace sintético', url: 'https://example.invalid/form' }] });
    await page.route('**/__yachi_api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/procedures')) return route.fulfill({ json: [guide(url.searchParams.get('lang'))] });
      if (url.pathname.endsWith('/chat')) return route.fulfill({ contentType: 'text/event-stream', body: [{ type: 'tool', name: 'mostrar_en_mapa', input: { destino: 'biblioteca', lat: 0.4, lon: -78.1, nombre: 'Ubicación sintética' } }, { type: 'done', messageId: 'map-test' }].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
      return route.fulfill({ json: [] });
    });
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
    const base = process.env.AUDIT_URL || 'http://127.0.0.1:5180';
    await page.goto(base + '/#/guias');
    await page.getByRole('searchbox').fill('ejemplo'); await page.locator('.guide-result').click();
    await page.locator('.checklist-docs input').check(); await page.locator('.step-check').first().click();
    assert.equal(await page.locator('.preparation-status progress').getAttribute('value'), '2');
    await page.reload(); await page.locator('.proc').waitFor();
    assert(await page.locator('.checklist-docs input').isChecked());
    assert.equal(await page.locator('.step-check').first().getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: /Añadir al calendario/ }).count(), 1, 'Solo el plazo futuro se ofrece al calendario');
    await page.getByLabel('Idioma / Language').selectOption('en'); await page.getByRole('heading', { name: 'Example guide', exact: true }).waitFor();
    assert(await page.locator('.checklist-docs input').isChecked(), 'Las marcas sobreviven al cambio de idioma');
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download guide', exact: true }).click();
    const download = await downloadPromise; const stream = await download.createReadStream(); let text = ''; for await (const chunk of stream) text += chunk.toString();
    assert(text.includes('[x] Documento de ejemplo')); assert(text.includes('Fuente sintética'));
    await page.getByRole('button', { name: 'My pending tasks', exact: true }).click(); assert.equal(await page.locator('.guide-result').count(), 1);
    await page.locator('.step-check').nth(1).click(); assert.equal(await page.locator('.guide-result').count(), 0, 'Una lista completa sale de pendientes');
    revision = 'r2'; await page.reload(); await page.locator('.proc').waitFor();
    assert.equal(await page.locator('.preparation-status progress').getAttribute('value'), '0', 'Una revisión distinta no hereda marcas antiguas');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), 844, 'El contenido se desplaza dentro de la vista sin crear una página vacía adicional');
    await page.getByRole('button', { name: 'View catalog', exact: true }).click();
    assert.equal(await page.locator('.proc').count(), 0);
    assert.equal(await page.locator('.guide-result').count(), 1);
    const calendar = await page.evaluate(async () => {
      const { deadlineIcs } = await import('/src/lib/ics.ts');
      const ics = deadlineIcs({ title: 'Plazo áéí '.repeat(25), start: '2099-01-01', end: '2099-01-02' }, 'Texto\r\nBEGIN:OTRO');
      const bytes = ics.split('\r\n').map(x => new TextEncoder().encode(x).length);
      return { max: Math.max(...bytes), exclusive: ics.includes('DTEND;VALUE=DATE:20990103'), injected: ics.includes('\r\nBEGIN:OTRO') };
    });
    assert(calendar.max <= 75); assert(calendar.exclusive); assert.equal(calendar.injected, false);
    await page.goto(base); await page.locator('#ask').fill('Ubicación de prueba'); await page.locator('.send').click();
    await page.locator('.real-map-canvas').waitFor(); assert.equal(await page.locator('.map-card:not(.real-map)').count(), 0, 'Coordenadas reales tienen prioridad sobre IDs del plano de ejemplo');
    assert.deepEqual(errors, []);
    console.log('OK: catálogo/búsqueda, progreso persistido, cambio de idioma, exportación, pendientes, invalidación por revisión, fechas, ICS UTF-8 y mapa real. Datos sintéticos.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
