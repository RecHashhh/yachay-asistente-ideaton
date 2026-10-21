// Regresión de fallos de la auditoría. API aislada; no usa credenciales ni documentos reales.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 400 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let cases = [{ id: 'T1', q: 'Ejemplo', lang: 'es', expect: 'no_se' }], failRun = true, failFeedback = true, imports = 0, inquiryStatus = 'nueva';
    await page.route('**/__yachi_api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/__yachi_api', '');
      let json = [];
      if (path === '/topics') json = [{ id: 't1', name: 'Tema de ejemplo con un título extenso '.repeat(8), description: '' }];
      if (path === '/admin/inquiries') json = [{ code: 'YT-TEST', question: 'Consulta sintética', office: 'Ejemplo', email: 'prueba@example.invalid', lang: 'es', transcript: null, status: inquiryStatus, created_at: new Date().toISOString() }];
      if (path === '/admin/inquiries/YT-TEST') { inquiryStatus = req.postDataJSON().status; json = { ok: true }; }
      if (path === '/chat') return route.fulfill({ contentType: 'text/event-stream', body: [
        { type: 'status', label: 'Buscando documentos' }, { type: 'token', text: 'Respuesta de prueba.' }, { type: 'done', messageId: 'T1', latencyMs: 1 },
      ].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
      if (path === '/feedback') return failFeedback ? route.fulfill({ status: 503, json: { detail: 'Error simulado' } }) : route.fulfill({ json: { ok: true } });
      if (path === '/admin/login') json = { token: 'SIMULADO', name: 'Prueba', email: 'prueba@example.invalid' };
      if (path === '/admin/validation/cases') {
        if (req.method() === 'PUT') { cases = req.postDataJSON().cases; imports++; json = { total: cases.length }; }
        else json = cases;
      }
      if (path === '/admin/validation/run') {
        if (failRun) return route.fulfill({ status: 503, json: { detail: 'Error simulado' } });
        json = cases.map(c => ({ ...c, got: c.expect, ok: true, hallucination: false, ms: 1 }));
      }
      await route.fulfill({ json });
    });
    await page.addInitScript(() => localStorage.setItem('yt-consent-2026-10c', '1'));
    await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:5180');
    const greeting = await page.locator('.greet').boundingBox();
    const home = await page.locator('.hello').boundingBox();
    assert(greeting.y >= home.y, 'El saludo queda accesible en poca altura');
    assert.equal(await page.locator('.composer-bar button').first().isDisabled(), true, 'Adjuntos sin soporte deshabilitados');
    await page.locator('.topbar button').first().click();
    assert(await page.locator('main').evaluate(e => e.inert));
    assert(await page.locator('#chat-sidebar').evaluate(e => e.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.rail-open-mobile').count(), 0);
    await page.locator('#ask').fill('Consulta de ejemplo'); await page.locator('.send').click();
    await page.locator('.msg-ai .md').getByText('Respuesta de prueba.', { exact: true }).waitFor();
    await page.locator('.msg-ai .status').waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Ver actividad', { exact: true }).count(), 0);
    await page.locator('.actions button').nth(2).click(); await page.locator('.fb-panel .chip').first().click();
    await page.locator('.fb-panel [role=alert]').waitFor(); assert.equal(await page.locator('.fb-thanks').count(), 0);
    failFeedback = false; await page.locator('.fb-panel .chip').first().click(); await page.locator('.fb-thanks').waitFor();
    await page.goto((process.env.AUDIT_URL || 'http://127.0.0.1:5180') + '/#/admin');
    await page.getByLabel('Correo institucional').fill('prueba@example.invalid'); await page.getByLabel('Contraseña', { exact: true }).fill('clave-simulada');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Validación', exact: true }).click();
    const evaluate = page.getByRole('button', { name: 'Evaluar 1 preguntas', exact: true });
    await evaluate.click(); await page.getByText('No se pudo completar la evaluación. Vuelve a intentarlo.', { exact: true }).waitFor();
    assert(await evaluate.isEnabled(), 'El fallo permite reintentar');
    await page.locator('input[type=file]').setInputFiles({ name: 'control.csv', mimeType: 'text/csv', buffer: Buffer.from('id;pregunta;idioma;esperado\nE1;"Pregunta; con separador";es;no_se\nE2;Example;en;no_se') });
    await page.getByText('Se guardaron 2 preguntas de control.', { exact: true }).waitFor();
    assert.equal(imports, 1); assert.equal(cases[0].q, 'Pregunta; con separador');
    failRun = false; await page.getByRole('button', { name: 'Evaluar 2 preguntas', exact: true }).click(); await page.locator('.kpi').first().waitFor();
    await page.locator('.tabs').getByRole('button', { name: 'Costo', exact: true }).click();
    const cache = page.getByLabel('Acierto de caché semántica (0 a 1)'); await cache.fill('-2'); await cache.blur(); assert.equal(await cache.inputValue(), '0');
    await page.locator('.tabs').getByRole('button', { name: 'Subir', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'Subir no desborda en móvil');
    await page.locator('.tabs').getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.getByLabel('Estado de YT-TEST').selectOption('en_atencion');
    await page.waitForFunction(() => document.querySelector('.admin-main select')?.disabled === false);
    assert.equal(inquiryStatus, 'en_atencion');
    assert.deepEqual(errors, []);
    console.log('OK: altura móvil, adjuntos, menú/foco/Escape, respuesta limpia, feedback 503/reintento, CSV persistido, evaluación 503/reintento, costo, subir móvil y gestión de consultas. API simulada.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
