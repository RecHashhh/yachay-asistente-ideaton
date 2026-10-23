const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve('web')] }));
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1.5,reducedMotion:'reduce'});
  await page.addInitScript(()=>{localStorage.setItem('yt-consent-2026-10c','1');localStorage.setItem('yt-lang','qu');});
  await page.route('**/__yachi_api/chat',route=>{const p=route.request().postDataJSON();p.sessionId='verif-slide-'+p.sessionId.slice(-35);return route.continue({postData:JSON.stringify(p)});});
  await page.goto('http://127.0.0.1:5180/#/?lang=qu');
  await page.locator('#ask').fill('Yachay Techpi estudiantikunapa derechokuna imatak kan?');
  await page.locator('#ask').press('Enter');
  await page.locator('.msg-ai').waitFor();
  await page.locator('.composer button.send[type=submit]').waitFor({timeout:180000});
  const answer=page.locator('.msg-ai').last();
  const out=path.resolve('docs/entrega/capturas-2026-10-23');
  await answer.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'11-agente-kichwa-derechos.png')});
  await answer.screenshot({path:path.join(out,'12-kichwa-derechos-detalle.png')});
  console.log(JSON.stringify({characters:(await answer.innerText()).length,sources:await answer.locator('.src').count()}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
