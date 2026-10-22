// Pruebas con conversaciones sintéticas. El servidor se intercepta; no llama al modelo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const width of [1280, 390]) for (const mode of ['local', 'server']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, acceptDownloads: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ width }) => {
        localStorage.setItem('yt-consent-2026-10c', '1');
        localStorage.setItem('yt-theme', width === 390 ? 'dark' : 'light');
        localStorage.setItem('yt-chats', JSON.stringify([{ id: 'prueba-qu', title: 'Prueba kichwa', at: Date.now(), msgs: [
          { id: 'u1', role: 'user', text: 'Consulta sintética' },
          { id: 'a1', role: 'assistant', lang: 'qu', text: 'Texto de prueba para revisar.', serverId: 'server-test' }
        ] }]));
      }, { width });
      let requests = 0;
      if (mode === 'server') await page.route('**/__yachi_api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      if (mode === 'server') await page.route('**/translation-reports', route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
        requests++;
        const payload = route.request().postDataJSON();
        assert.equal(payload.lang, 'qu');
        assert.equal(payload.fragment, 'Texto de prueba');
        assert.equal(payload.correction, 'Propuesta de prueba');
        return route.fulfill({ status: requests === 1 ? 503 : 201,
          headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
          body: JSON.stringify(requests === 1 ? { detail: 'translation_report_unavailable' } : { id: 'saved-test', status: 'pending_review' }) });
      });
      await page.goto(`http://127.0.0.1:${mode === 'local' ? 5200 : 5201}/#/?lang=qu`, { waitUntil: 'networkidle' });
      if (width < 820) await page.locator('button[aria-controls="chat-sidebar"]').click();
      await page.getByRole('button', { name: 'Prueba kichwa', exact: true }).click();
      await page.getByRole('button', { name: 'Reportar traducción', exact: true }).click();
      await page.getByLabel('Frase que debemos revisar').fill('Texto de prueba');
      await page.getByLabel('Corrección sugerida (opcional)').fill('Propuesta de prueba');
      await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click();
      if (mode === 'server') {
        await page.getByRole('alert').filter({ hasText: 'No se pudo guardar' }).waitFor();
        assert.equal(await page.getByLabel('Frase que debemos revisar').inputValue(), 'Texto de prueba');
        await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click();
        await page.getByText('Reporte guardado para revisión.', { exact: true }).waitFor();
        assert.equal(requests, 2);
        assert.equal(await page.evaluate(() => localStorage.getItem('yt-translation-reports')), null);
      } else {
        await page.getByText('Guardado solo en este navegador.', { exact: false }).waitFor();
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('yt-translation-reports')));
        assert.equal(stored.length, 1);
        assert.equal(stored[0].status, 'pending_review');
      }
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar reporte', exact: true }).click();
      assert.match((await download).suggestedFilename(), /^kichwa-reporte-/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      assert.deepEqual(errors, []);
      results.push({ width, mode, savedPending: true, download: true, retryPreservesText: mode === 'server', pageErrors: errors });
      await page.close();
    }
    fs.writeFileSync('docs/kichwa-alki-2026-10-22/prueba-reportes.json', JSON.stringify({ cases: results, realModelCalled: false }, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
