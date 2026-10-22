// Muestra acotada por el formulario público de Tikrachina. Sin API privada ni archivos subidos.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const base = path.resolve(__dirname, '../docs/kichwa-alki-2026-10-22');
const verify = process.argv.includes('--verify');
const output = path.join(base, verify ? 'comparacion-ups-verificacion.json' : 'comparacion-ups.json');
const alki = JSON.parse(fs.readFileSync(path.join(base, 'muestras.json'), 'utf8')).items;
const user = JSON.parse(fs.readFileSync(path.join(base, 'aportes-conversacion.json'), 'utf8')).items;
const queue = [
  ['cancel', 'Cancelar'], ['steps', 'Pasos'], ['copy', 'Copiar respuesta'], ['newChat', 'Nueva conversación'],
  ['helloSub', '¿Qué trámite o lugar de Yachay Tech necesitas?'], ['themeLight', 'Tema claro'],
  ['themeDark', 'Tema oscuro'], ['placeholder', 'Pregúntale a Yachi…']
];
const result = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {
  source: 'https://tikrachina.ups.edu.ec/traductor/', direction: 'es-qu',
  limitation: 'Comparación exploratoria; ninguno de los proveedores certifica estas frases. No activa cambios de interfaz.', items: []
};
const save = () => fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(result.source, { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (const [key, es] of queue) {
      if (verify && !['cancel', 'helloSub'].includes(key)) continue;
      if (result.items.some(x => x.key === key && x.es === es)) continue;
      await page.locator('#txtEspanol').fill(es);
      const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/traducir/', { timeout: 45000 });
      const [response] = await Promise.all([pending, page.getByRole('button', { name: 'Traducir', exact: true }).click()]);
      const item = { key, es, observedAt: new Date().toISOString(), httpStatus: response.status(), approved: false };
      if (!response.ok()) {
        result.items.push({ ...item, status: 'servicio_no_disponible', upsQu: null }); save();
        console.log(JSON.stringify(result.items.at(-1))); break;
      }
      await page.locator('#txtKichwa').waitFor({ timeout: 15000 });
      await page.waitForLoadState('domcontentloaded');
      const echoedSpanish = await page.locator('#txtEspanol').inputValue();
      if (echoedSpanish.trim() !== es.trim()) throw Error('El formulario no conserva el texto enviado; resultado no registrado.');
      const qu = (await page.locator('#txtKichwa').inputValue()).trim();
      const baseline = alki.find(x => x.es === es) ?? user.find(x => x.es === es);
      result.items.push({ ...item, echoedSpanish, upsQu: qu, alkiQu: baseline?.qu ?? null,
        alkiExactInput: !!baseline, flags: !qu ? ['respuesta_vacia'] : qu.toLowerCase() === es.toLowerCase() ? ['igual_al_original'] : [],
        status: 'pendiente_revision_linguistica' });
      save(); console.log(JSON.stringify(result.items.at(-1)));
      await page.waitForTimeout(2000);
    }
    const cell = x => '"' + String(x ?? '').replaceAll('"', '""') + '"';
    const rows = [['clave', 'es', 'alki', 'ups', 'estado', 'alertas'], ...result.items.map(x => [x.key, x.es, x.alkiQu, x.upsQu, x.status, x.flags?.join(',')])];
    fs.writeFileSync(output.replace(/\.json$/, '.csv'), '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n');
  } finally { await browser.close(); }
})().catch(e => { save(); console.error(e.message); process.exit(1); });
