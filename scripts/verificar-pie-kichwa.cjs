const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1280, 390]) for (const conversation of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ conversation }) => {
        localStorage.setItem('yt-consent-2026-10c', '1');
        if (conversation) localStorage.setItem('yt-chats', JSON.stringify([{ id: 'footer-test', title: 'Contexto de prueba', at: Date.now(), msgs: [
          { id: 'u-test', role: 'user', text: 'Pregunta de prueba' },
          { id: 'a-test', serverId: 'server-test', role: 'assistant', lang: 'qu', text: 'Respuesta de prueba' }
        ] }]));
      }, { conversation });
      await page.route('**/__yachi_api/**', route => route.fulfill({ json: [] }));
      let requests = 0;
      await page.route('**/translation-reports', route => {
        requests++;
        const payload = route.request().postDataJSON();
        assert.equal(payload.fragment, 'Frase de prueba');
        assert.equal(payload.lang, 'qu');
        assert.ok(payload.answer.length > 0);
        if (conversation) { assert.equal(payload.answer, 'Respuesta de prueba'); assert.equal(payload.question, 'Pregunta de prueba'); }
        return route.fulfill({ status: requests === 1 ? 503 : 201, json: requests === 1 ? { detail: 'unavailable' } : { id: 'footer-report', status: 'pending_review' } });
      });
      await page.goto('http://127.0.0.1:5180/#/?lang=qu');
      if (conversation) {
        if (width < 820) await page.locator('button[aria-controls="chat-sidebar"]').click();
        await page.getByRole('button', { name: 'Contexto de prueba', exact: true }).click();
      }
      const footer = page.locator('.translation-report-footer');
      await footer.waitFor();
      assert.equal(await page.locator('.kichwa-note').count(), 0);
      assert.equal(await page.locator('.translation-report-trigger').count(), 1);
      const composerBounds = await page.locator('.composer').boundingBox();
      const footerBounds = await footer.boundingBox();
      assert.ok(footerBounds.y >= composerBounds.y + composerBounds.height);
      await footer.getByRole('button', { name: 'Kaypi pantayta willay', exact: true }).click();
      await footer.locator('textarea').first().fill('Frase de prueba');
      await footer.getByRole('button', { name: 'Willayta kachana', exact: true }).click();
      await footer.getByRole('alert').waitFor();
      assert.equal(await footer.locator('textarea').first().inputValue(), 'Frase de prueba');
      await footer.getByRole('button', { name: 'Willayta kachana', exact: true }).click();
      await footer.getByText('Rikunapak willay wakaychishka.', { exact: true }).waitFor();
      await footer.getByRole('button', { name: 'Wichkana', exact: true }).click();
      assert.equal(requests, 2);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      if (width === 390 && !conversation) await page.screenshot({ path: 'docs/kichwa-alki-2026-10-22/pie-kichwa-390.png' });
      await page.close();
    }
    console.log('Compact Kichwa footer: welcome/conversation, desktop/mobile, report retry and context: OK.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
