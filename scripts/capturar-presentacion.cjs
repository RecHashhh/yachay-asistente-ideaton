const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const out = path.resolve('docs/entrega/capturas-2026-10-23');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
  const meta = process.env.SOLO_ADMIN && fs.existsSync(path.join(out, 'capturas.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'capturas.json'), 'utf8')) : { capturedAt: new Date().toISOString(), scope: 'Real local application and API responses; no synthetic answers or microphone activity.', captures: [] };
  try {
    await context.addInitScript(() => {
      localStorage.setItem('yt-consent-2026-10c', '1');
      localStorage.setItem('yt-theme', 'light');
      localStorage.setItem('yt-lang', 'qu');
    });
    if (!process.env.SOLO_ADMIN) {
    const page = await context.newPage();
    await page.route('**/__yachi_api/chat', route => {
      const payload = route.request().postDataJSON();
      payload.sessionId = 'verif-slide-' + payload.sessionId.slice(-35);
      return route.continue({ postData: JSON.stringify(payload) });
    });
    await page.goto('http://127.0.0.1:5180/#/?lang=qu');
    await page.locator('#ask').fill('Yachay Techpi ima becakuna tiyan?');
    await page.locator('#ask').press('Enter');
    await page.locator('.msg-ai').last().waitFor();
    await page.locator('.composer button.send[type=submit]').waitFor({ timeout: 180000 });
    const answer = page.locator('.msg-ai').last();
    await answer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, '01-agente-respuesta-kichwa.png') });
    await answer.screenshot({ path: path.join(out, '02-respuesta-kichwa-detalle.png') });
    meta.captures.push({ file: '01-agente-respuesta-kichwa.png', question: 'Yachay Techpi ima becakuna tiyan?', characters: (await answer.innerText()).length, sources: await answer.locator('.src').count() });
    await page.getByRole('button', { name: /Voz|Rimay/i }).first().click().catch(async () => {
      await page.goto('http://127.0.0.1:5180/#/voz?lang=qu');
    });
    await page.locator('.voice').waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, '03-chat-voz-kichwa.png') });
    const buttons = await page.locator('.voice-top button').all();
    await buttons[1].click();
    await page.locator('#voice-options').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '04-voz-kichwa-configuracion.png') });
    meta.captures.push({ file: '03-chat-voz-kichwa.png', state: 'Voice interface opened; no microphone activity simulated.' });
    }

    const env = parseEnv(fs.readFileSync('api/.env', 'utf8'));
    const email = (env.ADMIN_EMAILS || env.ADMIN_EMAILS_RAW || '').split(',')[0].trim();
    if (!email || !env.ADMIN_PASSWORD) throw new Error('Missing local admin configuration');
    const admin = await context.newPage();
    await admin.route('**/__yachi_api/admin/**', async route => {
      const target = route.request().url().replace('http://127.0.0.1:5180/__yachi_api', 'http://127.0.0.1:8001');
      const response = await route.fetch({ url: target });
      await route.fulfill({ response });
    });
    await admin.goto('http://127.0.0.1:5180/#/admin');
    await admin.locator('input[type=email]').fill(email);
    await admin.locator('input[type=password]').fill(env.ADMIN_PASSWORD);
    await admin.locator('.adm-login-btn').click();
    await admin.locator('.adm').waitFor({ timeout: 30000 });
    await admin.getByRole('heading', { name: 'Inicio', exact: true }).waitFor();
    await admin.getByText('Cargando resumen…', { exact: true }).waitFor({ state: 'hidden' });
    await admin.waitForTimeout(800);
    const summary = await admin.evaluate(async () => {
      const r = await fetch('/__yachi_api/admin/summary', { headers: { Authorization: `Bearer ${sessionStorage.getItem('yt-admin-token')}` } });
      if (!r.ok) throw new Error(`Summary status ${r.status}`);
      return r.json();
    });
    fs.writeFileSync(path.join(out, 'metricas-locales.json'), JSON.stringify(summary, null, 2));
    await admin.screenshot({ path: path.join(out, '05-panel-administrativo-inicio.png') });
    for (const [label, file] of [['Documentos', '06-panel-documentos.png'], ['Guías de trámite', '07-panel-guias.png'], ['Validación', '08-panel-validacion.png'], ['Costo', '09-panel-costo.png']]) {
      await admin.locator('nav').getByRole('button', { name: new RegExp(label) }).click();
      await admin.waitForTimeout(1100);
      await admin.screenshot({ path: path.join(out, file) });
    }
    meta.captures.push({ file: '05-panel-administrativo-inicio.png', backend: 'Real admin API on port 8001; authenticated with local configuration.' });
  } finally {
    fs.writeFileSync(path.join(out, 'capturas.json'), JSON.stringify(meta, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(meta));
})().catch(error => { console.error(error.message); process.exit(1); });
