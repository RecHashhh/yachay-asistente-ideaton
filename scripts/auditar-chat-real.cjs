// Live frontend + local API; never saves answer text or document excerpts.
const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
const fs = require('node:fs');
const questions = {
  es: ['Dónde queda la biblioteca', 'Cómo hago un cambio de carrera', '¿Y los documentos?'],
  en: ['Where is the library?', 'How do I change my major?', 'What documents do I need?'],
  qu: ['Maypi biblioteca tiyan?', 'Imashina carrera cambiota rurani?', 'Ima killkakunata apana kani?'],
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const lang of ['es', 'en', 'qu']) {
      const page = await browser.newPage({ viewport: { width: lang === 'qu' ? 390 : 1280, height: 900 } });
      const pageErrors = [], failedLocalRequests = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('response', response => { if (response.url().includes('127.0.0.1') && response.status() >= 400) failedLocalRequests.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
      // Preserve the real request/response, marking only the session as a test so
      // these questions never count as separate people in public trends.
      await page.route('**/__yachi_api/chat', route => {
        const payload = route.request().postDataJSON();
        payload.sessionId = 'verif-browser-' + payload.sessionId.slice(-40);
        return route.continue({ postData: JSON.stringify(payload) });
      });
      await page.goto(`http://127.0.0.1:5180/#/?lang=${lang}`);
      for (const [index, question] of questions[lang].entries()) {
        const started = Date.now();
        await page.locator('#ask').fill(question);
        await page.locator('#ask').press('Enter');
        await page.waitForFunction(count => document.querySelectorAll('.msg-ai').length >= count, index + 1);
        await page.locator('.composer button.send[type=submit]').waitFor({ timeout: 90000 });
        const answer = page.locator('.msg-ai').last();
        results.push({ lang, case: ['location', 'procedure', 'followup'][index],
          visibleCharacters: (await answer.innerText()).length,
          map: await answer.locator('.real-map, .geo-map').count() > 0,
          procedure: await answer.locator('.proc').count() > 0,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2) });
      }
      results.push({ lang, pageErrors, failedLocalRequests });
      await page.close();
    }
    fs.writeFileSync('docs/kichwa-alki-2026-10-22/auditoria-chat-real.json', JSON.stringify({ scope: 'Live frontend and API, no simulated chat answers. Checks rendering, not linguistic approval.', results }, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
