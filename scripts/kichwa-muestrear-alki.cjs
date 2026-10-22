// Muestra acotada mediante el formulario público; sin llamadas directas al endpoint observado.
// No crea cuentas, no vota traducciones ni elude límites. Conservar el archivo para no repetir consultas.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [path.resolve('web')] }));
const variants = process.argv.includes('--variants');
const base = path.resolve('docs/kichwa-alki-2026-10-22'), file = path.join(base, variants ? 'variantes-resultados.json' : 'muestras.json');
const samples = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { source: 'https://alki.ec/', purpose: 'Comparar contexto y comas; no sustituye las etiquetas originales', items: [] };
const all = process.argv.includes('--all');
const queue = variants ? JSON.parse(fs.readFileSync(path.join(base, 'variantes-es.json'), 'utf8')).items : [...JSON.parse(fs.readFileSync(path.join(base, 'cola-es-qu.json'), 'utf8')).items,
  ...(all ? JSON.parse(fs.readFileSync(path.join(base, 'consultas-es.json'), 'utf8')).items : [])];
const keys = all || variants ? queue.map(x => x.key) : ['send', 'cancel', 'copy', 'retry', 'steps', 'docs', 'hello'];
function translation(data) {
  if (!data || typeof data !== 'object') return null;
  for (const key of ['translation', 'translated_text', 'translatedText', 'kichwa', 'result']) if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  for (const key of ['data', 'result']) { const result = translation(data[key]); if (result) return result; }
  return null;
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://alki.ec/', { waitUntil: 'networkidle' });
    for (const key of keys) {
      const item = queue.find(x => x.key === key);
      if (!item || samples.items.some(x => x.key === key && x.es === item.es)) continue;
      if (!item.es.trim()) { console.log(JSON.stringify({ key, status: 'sin_texto_origen', queried: false })); continue; }
      if (item.es.length > 500) throw Error('Texto supera el límite público de 500 caracteres');
      await page.getByPlaceholder('Escribe aquí...').fill(item.es);
      const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).hostname === 'api.alki.ec' && new URL(r.url()).pathname === '/translate', { timeout: 30000 });
      const [response] = await Promise.all([responsePromise, page.getByRole('button', { name: 'Traducir', exact: true }).first().click()]);
      if (!response.ok()) throw Error(`El sitio respondió HTTP ${response.status()}; muestra detenida sin reintentos.`);
      const data = await response.json();
      const qu = translation(data);
      if (!qu) { console.log('Campos de respuesta (sin valores):', Object.keys(data)); throw Error('Formato no reconocido; se detiene para evitar registrar una traducción incorrecta.'); }
      const variables = text => [...text.matchAll(/\{([\w]+)\}/g)].map(x => x[1]).sort().join('|');
      const visible = await page.locator('body').innerText();
      const flags = [];
      if (qu.trim().toLowerCase() === item.es.trim().toLowerCase()) flags.push('igual_al_original');
      if (/proporciona el texto|texto que deseas traducir/i.test(qu)) flags.push('respuesta_meta_en_espanol');
      samples.items.push({ key, es: item.es, qu, observedAt: new Date().toISOString(), method: 'Interfaz pública con Playwright', providerLabel: visible.includes('GEMINI') ? 'GEMINI' : 'No identificado', placeholdersOk: variables(item.es) === variables(qu), flags, status: 'pendiente_revision_humana', reviewedBy: null, approved: false });
      fs.writeFileSync(file, JSON.stringify(samples, null, 2) + '\n');
      console.log(JSON.stringify({ key, completed: samples.items.length, target: all ? queue.filter(x => x.es.trim()).length : 8, placeholdersOk: samples.items.at(-1).placeholdersOk, flags }));
      // Solo omitir la valoración; no calificar como correcta sin revisión lingüística.
      const skip = page.getByRole('button', { name: /OMITIR CALIFICAR/i });
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await page.waitForTimeout(2000);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
