const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const calls = [];
    page.on('response', response => {
      const request = response.request();
      if (request.method() === 'POST' && !response.url().includes('/cdn-cgi/')) calls.push({ url: response.url().split('?')[0], status: response.status() });
    });
    await page.goto('https://alki.ec/', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Escribe aquí...').fill('Nueva conversación');
    await page.getByRole('button', { name: 'Traducir', exact: true }).first().click();
    await page.waitForTimeout(8000);
    console.log('RESULTADO_VISIBLE', (await page.locator('body').innerText()).slice(0, 7000));
    console.log('LLAMADAS', JSON.stringify(calls));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
