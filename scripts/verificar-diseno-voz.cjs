const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const lang of ['es', 'en', 'qu']) for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
      await page.route('**/speech/capabilities', (route) => route.fulfill({ json: { kichwaAsr: true, kichwaTts: true } }));
      await page.goto(`http://127.0.0.1:5180/#/voz?lang=${lang}`);
      const settings = page.getByRole('button', { name: lang === 'qu' ? 'Rimayta allichina' : lang === 'en' ? 'Voice settings' : 'Configuración de voz', exact: true });
      await settings.waitFor();
      assert.equal(await page.locator('.voice-prefs').count(), 0);
      assert.doesNotMatch(await page.locator('.voice-stage').innerText(), /15 segundos|15 seconds|Meta MMS/);
      await settings.click();
      const panel = page.locator('#voice-options');
      await panel.waitFor();
      await panel.locator('select').first().selectOption('0.85');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('yt-voice')).rate), 0.85);
      assert.equal(await panel.locator('select').count(), 2);
      const bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await page.keyboard.press('Escape');
      assert.equal(await panel.count(), 0);
      assert.equal(await page.locator('.voice').count(), 1);
      await page.getByRole('button', { name: lang === 'qu' ? 'Rimaymanta willay' : lang === 'en' ? 'Voice information' : 'Información del modo voz', exact: true }).click();
      if (lang === 'qu') {
        assert.match(await panel.innerText(), /15 segundokama/);
        assert.doesNotMatch(await panel.innerText(), /La grabación|Límite de seguridad|pronunciación está|Con teclado/);
      }
      await panel.getByRole('button', { name: lang === 'qu' ? 'Wichkana' : lang === 'en' ? 'Close panel' : 'Cerrar panel', exact: true }).click();
      assert.equal(await panel.count(), 0);
      assert.deepEqual(errors, []);
      if (lang === 'qu') await page.screenshot({ path: `docs/kichwa-alki-2026-10-22/voz-limpia-${width}.png` });
      await page.close();
    }
    console.log('Voice layout: ES/EN/QU desktop/mobile, settings persistence, dismissible info and no panel overflow: OK.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
