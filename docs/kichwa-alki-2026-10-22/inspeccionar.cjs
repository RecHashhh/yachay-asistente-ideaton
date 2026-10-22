// Inspección del sitio público mediante el navegador. No envía datos del corpus ni credenciales.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('response', async response => {
      const request = response.request();
      if (['xhr', 'fetch'].includes(request.resourceType())) requests.push({ method: request.method(), url: response.url().split('?')[0], status: response.status() });
    });
    await page.goto('https://alki.ec/', { waitUntil: 'networkidle', timeout: 45000 });
    console.log(JSON.stringify(await page.evaluate(() => ({
      title: document.title,
      inputs: [...document.querySelectorAll('textarea,input,select')].map(e => ({ tag: e.tagName, placeholder: e.getAttribute('placeholder'), name: e.getAttribute('name'), aria: e.getAttribute('aria-label') })),
      links: [...document.querySelectorAll('a[href]')].map(e => ({ text: e.textContent, href: e.getAttribute('href') })),
      buttons: [...document.querySelectorAll('button')].map(e => ({ text: e.textContent, aria: e.getAttribute('aria-label') })),
    })), null, 2));
    console.log('RED_INICIAL', JSON.stringify(requests));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
