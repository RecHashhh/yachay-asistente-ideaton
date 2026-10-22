// Prueba de ida y vuelta con el formulario público; no acredita corrección lingüística.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const root = path.resolve(__dirname, '..');
const context = process.argv.includes('--context');
const base = path.join(root, 'docs/kichwa-alki-2026-10-22');
const current = context ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(base, 'contexto-pruebas.json'), 'utf8')).items.map(x => [x.key, x.targetEs])) : JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'kichwa-preparar.cjs'), '--current'], { encoding: 'utf8' }));
const preview = context ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(base, 'contexto-resultados.json'), 'utf8')).items.map(x => [x.key, x.qu])) : JSON.parse(fs.readFileSync(path.join(root, 'web/src/lib/kichwa.preview.json'), 'utf8'));
const file = path.join(base, context ? 'contexto-retrotraduccion.json' : 'retrotraduccion.json');
const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
  source: 'https://alki.ec/', method: 'Formulario público con dirección Kichwa a Español',
  limitation: 'El mismo traductor puede reproducir sus errores. No es validación humana ni puntuación de calidad.', items: []
};
const keys = context ? Object.keys(preview) : ['cancel', 'retry', 'steps', 'docs', 'newChat', 'helloSub', 'placeholder', 'notice', 'themeLight', 'themeDark', 'attach', 'disclaimer'];
function translation(data) {
  if (!data || typeof data !== 'object') return null;
  for (const key of ['translation', 'translated_text', 'translatedText', 'kichwa', 'result']) if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  for (const key of ['data', 'result']) { const found = translation(data[key]); if (found) return found; }
  return null;
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://alki.ec/', { waitUntil: 'networkidle' });
    await page.locator('button.p-2.text-accent').click();
    const body = await page.locator('body').innerText();
    const labels = body.match(/(?:ESPAÑOL|KICHWA)/g);
    if (labels?.[0] !== 'KICHWA' || labels?.[1] !== 'ESPAÑOL') throw Error('La dirección inversa no quedó confirmada');
    for (const key of keys) {
      const qu = preview[key];
      if (!qu || report.items.some(x => x.key === key && x.qu === qu && x.es === current[key])) continue;
      await page.getByPlaceholder('Runa shimipi killkay...').fill(qu);
      const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).hostname === 'api.alki.ec' && new URL(r.url()).pathname === '/translate', { timeout: 30000 });
      const [response] = await Promise.all([pending, page.getByRole('button', { name: 'Traducir', exact: true }).first().click()]);
      if (!response.ok()) throw Error(`HTTP ${response.status()}; sin reintentos`);
      const back = translation(await response.json());
      if (!back) throw Error('Formato de traducción no reconocido');
      report.items.push({ key, es: current[key], qu, backEs: back, direction: 'qu-es', observedAt: new Date().toISOString(), status: 'pendiente_comparacion', approved: false });
      fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report.items.at(-1)));
      const skip = page.getByRole('button', { name: /OMITIR CALIFICAR/i });
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await page.waitForTimeout(2000);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
