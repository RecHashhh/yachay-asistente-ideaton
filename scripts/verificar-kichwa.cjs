// Navegación local sin enviar consultas al modelo ni al traductor.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [path.resolve('web')] }));
(async () => {
  const base = process.env.KICHWA_TEST_URL || 'http://127.0.0.1:5199/';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const width of [1280, 390]) for (const lang of ['es', 'en', 'qu']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '#/?lang=' + lang, { waitUntil: 'networkidle' });
      const welcome = lang === 'en' ? /Which Yachay Tech procedure or place do you need\?/ : /¿Qué trámite o lugar de Yachay Tech necesitas\?/;
      await page.getByText(welcome).waitFor({ state: 'visible', timeout: 10000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, 'Desbordamiento horizontal');
      assert.deepEqual(errors, []);
      results.push({ width, lang, welcomeVisible: true, horizontalOverflow: overflow, pageErrors: errors });
      await page.close();
    }
    const file = path.resolve('docs/kichwa-alki-2026-10-22/prueba-navegacion.json');
    fs.writeFileSync(file, JSON.stringify({ tests: results, limitation: 'Solo navegación e interfaz; no mide calidad lingüística ni realiza llamadas reales al modelo.' }, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
