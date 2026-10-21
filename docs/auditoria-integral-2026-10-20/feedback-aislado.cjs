const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});
 const p=await b.newPage({reducedMotion:'reduce'});p.setDefaultTimeout(6000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/__yachi_api/topics',r=>r.fulfill({json:[]}));
 await p.route('**/__yachi_api/trends?*',r=>r.fulfill({json:[]}));
 await p.route('**/__yachi_api/feedback',r=>r.fulfill({status:503,body:'Error de prueba al guardar feedback'}));
 await p.addInitScript(()=>{
   localStorage.setItem('yt-consent-2026-10c','1');localStorage.setItem('yt-lang','es');
   localStorage.setItem('yt-chats',JSON.stringify([{id:'fb-test',title:'Prueba de feedback',at:Date.now(),msgs:[{id:'u',role:'user',text:'Consulta de ejemplo'},{id:'a',role:'assistant',text:'Respuesta de ejemplo',serverId:'fb-server'}]}]));
 });
 await p.goto('http://127.0.0.1:5180');await p.locator('.chat-list .item').click();
 await p.locator('.actions button').nth(2).click();await p.locator('.fb-panel .chip').first().click();
 await p.waitForTimeout(200);
 const result={thanksVisible:await p.locator('.fb-thanks').isVisible(),feedbackText:await p.locator('.fb-thanks').innerText(),errors,mode:'HTTP 503 simulado; no se modifica feedback real'};
 fs.writeFileSync('docs/auditoria-integral-2026-10-20/feedback-aislado.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
