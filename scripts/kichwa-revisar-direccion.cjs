// Inspección de controles públicos; no envía traducciones ni calificaciones.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://alki.ec/', { waitUntil: 'networkidle' });
    await page.locator('button.p-2.text-accent').click();
    console.log((await page.locator('body').innerText()).slice(0, 6000));
    console.log(await page.locator('button').evaluateAll(items => items.map(x => x.outerHTML)));
    console.log(await page.locator('textarea').evaluateAll(items => items.map(x => x.outerHTML)));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
