const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const b=await chromium.launch({channel:'chrome',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  p.setDefaultTimeout(10000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/__yachi_api/trends?*',r=>r.fulfill({json:[{query:'Pregunta de ejemplo',topicId:'tramites',count:5,delta:0}]}));
  await p.route('**/__yachi_api/topics',r=>r.fulfill({json:[]}));
  const answer='### Ejemplo para revisar la interfaz\n\n'+Array.from({length:45},(_,i)=>'Párrafo '+(i+1)+': Esta respuesta ilustrativa permite comprobar que el texto aparece progresivamente y que puedes subir a leer sin perder tu posición.').join('\n\n');
  await p.route('**/__yachi_api/chat',async r=>{
    await new Promise(resolve=>setTimeout(resolve,180)); // Solo el servidor simulado de esta prueba.
    await r.fulfill({contentType:'text/event-stream',body:[
      {type:'status',label:'Redactando respuesta'},
      {type:'token',text:answer},
      {type:'done',messageId:'ui-test',latencyMs:180}
    ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
  });
  await p.goto('http://127.0.0.1:5180');
  await p.evaluate(()=>localStorage.setItem('yt-consent-2026-10c','1'));
  await p.reload();
  await p.locator('.suggest-card').waitFor();
  await p.waitForTimeout(500);
  const startY=await p.locator('.composer').evaluate(e=>e.getBoundingClientRect().y);
  await p.locator('.suggest-card').click();
  await p.locator('.msg-user').waitFor();
  assert.equal(await p.locator('.status').isVisible(),true);
  const positions=[];
  for(let i=0;i<5;i++){
    positions.push(await p.locator('.composer').evaluate(e=>e.getBoundingClientRect().y));
    await p.waitForTimeout(50);
  }
  await p.waitForFunction(()=>document.querySelector('.md')?.textContent.length>100);
  const partial=await p.locator('.md').innerText();
  assert(partial.length<answer.length,'El texto no debe aparecer completo en un solo repintado');
  await p.screenshot({path:'docs/chat-fluido-v5/respondiendo.png'});
  await p.waitForFunction(()=>{const el=document.querySelector('.scroll');return el.scrollHeight>el.clientHeight+300});
  await p.locator('.scroll').hover();
  await p.mouse.wheel(0,-500);
  await p.waitForTimeout(150);
  const before=await p.locator('.scroll').evaluate(e=>e.scrollTop);
  await p.waitForTimeout(200);
  const after=await p.locator('.scroll').evaluate(e=>e.scrollTop);
  assert(Math.abs(after-before)<10,'El streaming no debe arrastrar a quien está leyendo arriba');
  await p.locator('.jump-to-latest').waitFor();
  await p.locator('.send[aria-label="Detener respuesta"]').waitFor({state:'hidden'});
  await p.locator('.jump-to-latest').click();
  await p.waitForTimeout(700);
  const endY=await p.locator('.composer').evaluate(e=>e.getBoundingClientRect().y);
  assert(positions.some(y=>Math.abs(y-startY)>4&&Math.abs(y-endY)>4),'El composer debe recorrer posiciones intermedias');
  assert.equal((await p.locator('.md').innerText()).replace(/\s+/g,' ').trim(),answer.replace(/^### /,'').replace(/\s+/g,' ').trim());
  // Interrumpir corta también la presentación progresiva de una respuesta ya recibida.
  await p.locator('#ask').fill('Segunda prueba');await p.locator('.send').click();
  await p.waitForTimeout(400);
  const stop=p.locator('.send[type="button"]');await stop.click();
  const stopped=await p.locator('.msg-ai').last().locator('.md').innerText();
  await p.waitForTimeout(200);
  assert.equal(await p.locator('.msg-ai').last().locator('.md').innerText(),stopped);
  assert(stopped.length<answer.length);
  // El mismo contenido se entrega íntegro sin animación al reducir movimiento.
  const exact=await p.evaluate(async()=>{
    const {displayStream}=await import('/src/lib/displayStream.ts');
    const text='Uno\n\n2. Dos — español 🛰️\n| A | B |';
    async function* source(){yield {type:'token',text};yield {type:'done',messageId:'x'};}
    let result='';let count=0;
    for await(const e of displayStream(source(),new AbortController().signal,true)){if(e.type==='token'){result+=e.text;count++;}}
    return {result,text,count};
  });
  assert.equal(exact.result,exact.text);assert.equal(exact.count,1);
  await p.setViewportSize({width:390,height:844});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('docs/chat-fluido-v5/mediciones.json',JSON.stringify({startY,positions,endY,partialLength:partial.length,answerLength:answer.length,before,after},null,2));
  console.log('OK: composer con transición, pregunta rápida y escrita, texto progresivo íntegro, scroll respetuoso, detener, movimiento reducido y móvil.');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
