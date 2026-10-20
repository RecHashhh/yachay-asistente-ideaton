const { chromium } = require('C:/Users/Administrador/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5181/',{waitUntil:'networkidle'});
  const results=[];
  await page.pdf({path:path.join(__dirname,'auditoria.pdf'),format:'A4',printBackground:true,margin:{top:'15mm',bottom:'15mm',left:'14mm',right:'14mm'}});
  for(const view of ['home','answer','mobile','unknown','voice','admin','upload','notice']){
    await page.locator(`[data-view="${view}"]`).click();
    await page.screenshot({path:path.join(__dirname,`propuesta-${view}.png`),fullPage:true});
    results.push({view,width:1440,documentWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
  }
  await page.locator('[data-view="answer"]').click();
  await page.locator('[data-step]').first().check();
  if(await page.locator('#step-count').innerText()!=='1 de 3 marcados')throw Error('Checklist');
  await page.locator('[data-view="voice"]').click();
  await page.locator('[data-action="listen"]').click();
  if(await page.locator('#voice-badge').innerText()!=='Escuchando · simulación')throw Error('Voice state');
  await page.locator('[data-view="admin"]').click();
  await page.locator('#doc-search').fill('calendario');
  if(!await page.locator('#filter-status').innerText().then(s=>s.includes('1 documento')))throw Error('Search');
  await page.locator('#doc-search').fill('inexistente');
  if(!await page.locator('#filter-status').innerText().then(s=>s.includes('No hay documentos')))throw Error('Empty search');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    for(const view of ['home','answer','unknown','voice','admin','upload','notice']){
      await page.locator(`[data-view="${view}"]`).click();
      const actual=await page.evaluate(()=>document.documentElement.scrollWidth);
      if(actual>width)throw Error(`Overflow ${view}: ${actual}>${width}`);
      results.push({view,width,documentWidth:actual});
      if(width===390)await page.screenshot({path:path.join(__dirname,`propuesta-${view}-movil.png`),fullPage:true});
    }
  }
  await page.locator('[data-view="home"]').click();
  await page.locator('[data-action="menu"]').click();
  await page.keyboard.press('Escape');
  if(await page.locator('[data-menu]').isVisible())throw Error('Escape');
  if(!await page.locator('[data-action="menu"]').evaluate(e=>e===document.activeElement))throw Error('Focus return');
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('#theme-button').click();
  await page.screenshot({path:path.join(__dirname,'propuesta-home-oscuro.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(__dirname,'verificacion.json'),JSON.stringify({checks:['8 pantallas capturadas en escritorio','7 pantallas sin desbordamiento a 320 y 390 px','checklist','estado de voz simulado','búsqueda y estado vacío','Escape y retorno de foco del menú propuesto','sin errores JavaScript'],results,errors},null,2));
  console.log('OK: capturas, PDF y verificaciones guardados.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
