// Live local API: ask a vague question, select a suggestion, then ask a follow-up.
const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const lang of ['es', 'en']) {
      const page = await browser.newPage({ viewport: { width: lang === 'es' ? 390 : 1280, height: 900 } });
      const errors = [], firstEvents = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
      await page.route('**/__yachi_api/chat', route => {
        const payload = route.request().postDataJSON();
        payload.sessionId = 'verif-clarify-' + payload.sessionId.slice(-35);
        return route.continue({ postData: JSON.stringify(payload) });
      });
      await page.goto(`http://127.0.0.1:5180/#/?lang=${lang}`);
      for (let attempt = 0; attempt < 30; attempt++) {
        const health = await page.request.get('http://127.0.0.1:8000/health').catch(() => null);
        if (health?.ok()) break;
        if (attempt === 29) throw new Error('Local API did not become healthy');
        await page.waitForTimeout(1000);
      }
      const response = page.waitForResponse(r => r.url().endsWith('/chat') && r.request().method() === 'POST');
      await page.locator('#ask').fill(lang === 'en' ? 'I need help with an application' : 'Necesito ayuda con una solicitud');
      await page.locator('#ask').press('Enter');
      const received = await response;
      assert.equal(received.status(), 200, 'Chat must return a successful HTTP response');
      const data = await received.text();
      for (const line of data.split('\n')) if (line.startsWith('data:')) firstEvents.push(JSON.parse(line.slice(5)).type);
      assert.deepEqual(firstEvents, ['clarify', 'done']);
      await page.locator('.clarify button').first().click();
      await page.locator('.msg-ai .proc').waitFor();
      await page.locator('.composer button.send[type=submit]').waitFor();
      await page.locator('#ask').fill(lang === 'en' ? 'What documents do I need?' : '¿Y los documentos?');
      await page.locator('#ask').press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length === 3);
      await page.locator('.composer button.send[type=submit]').waitFor();
      assert.equal(await page.locator('.msg-ai').last().locator('.clarify').count(), 0);
      assert((await page.locator('.msg-ai').last().innerText()).length > 30);
      assert.deepEqual(errors, []);
      results.push({ lang, directClarification: true, noSearch: true, optionOpensProcedure: true,
        followupNotReplacedByMenu: true, pageErrors: errors });
      await page.close();
    }
    fs.writeFileSync('docs/kichwa-alki-2026-10-22/prueba-aclaraciones.json', JSON.stringify({ scope: 'Live local frontend and API; no generated answer text stored.', results }, null, 2) + '\n');
    console.log(results);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
