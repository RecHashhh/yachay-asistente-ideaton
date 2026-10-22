// Prueba de etiquetas visibles y eliminación reversible con datos sintéticos en un navegador nuevo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const preview = JSON.parse(fs.readFileSync('web/src/lib/kichwa.preview.json', 'utf8'));
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('yt-consent-2026-10c', '1');
      localStorage.setItem('yt-theme', 'light');
      localStorage.setItem('yt-chats', JSON.stringify([
        { id: 'test-today', title: 'Control de hoy', at: Date.now(), renamed: true, msgs: [{ id: 'u1', role: 'user', text: 'Consulta sintética' }] },
        { id: 'test-yesterday', title: 'Control de ayer', at: Date.now() - 86400000, renamed: true, msgs: [{ id: 'u2', role: 'user', text: 'Otra consulta sintética' }] }
      ]));
    });
    await page.goto((process.env.KICHWA_TEST_URL || 'http://127.0.0.1:5180/') + '#/?lang=qu', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Kachana', exact: true }).waitFor();
    const headings = await page.locator('.chat-group h4').allTextContents();
    assert.ok(headings.includes('Kunan'));
    assert.ok(headings.includes('Kayna'));
    await page.getByRole('button', { name: `${preview.options ?? 'Opciones'}: Control de hoy`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Pichana', exact: true }).click();
    await page.getByText(preview.deleted ?? 'Conversación eliminada', { exact: false }).waitFor();
    await page.getByRole('button', { name: preview.undo ?? 'Deshacer', exact: true }).click();
    await page.getByRole('button', { name: 'Control de hoy', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Amsa', exact: true }).click();
    await page.getByRole('button', { name: 'Achik', exact: true }).waitFor();
    const body = await page.locator('body').innerText();
    assert.doesNotMatch(body, /Lo siento, no puedo ayudar|proporciona el mensaje/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    fs.writeFileSync('docs/kichwa-alki-2026-10-22/prueba-textos-documentados.json', JSON.stringify({
      syntheticData: true, realModelCalled: false, send: 'Kachana', dateGroups: headings,
      delete: 'Pichana', undoRestoredChat: true, deletionNotice: preview.deleted ?? 'Conversación eliminada',
      themes: ['Amsa', 'Achik'], pageErrors: errors
    }, null, 2) + '\n');
    console.log('Etiquetas, agrupación por fecha, eliminación, deshacer y cambio de tema: correctos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
