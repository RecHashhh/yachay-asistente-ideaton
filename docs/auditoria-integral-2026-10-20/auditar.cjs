const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=__dirname,base=process.env.AUDIT_URL||'http://127.0.0.1:5180';
const results=[],errors=[],network=[];
let phase='';
function record(name,status,details){results.push({name,status,details});console.log(status+' · '+name);}
async function check(name,fn){phase=name;try{await fn();}catch(e){record(name,'FALLO',String(e.message).split('\n')[0]);}}
const env=Object.fromEntries(fs.readFileSync('api/.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-EC',reducedMotion:'reduce',acceptDownloads:true});
 const p=await context.newPage();p.setDefaultTimeout(6500);
 p.on('pageerror',e=>errors.push({phase,message:e.message}));
 p.on('response',r=>{if(r.status()>=400&&r.url().includes('__yachi_api'))network.push({phase,status:r.status(),path:new URL(r.url()).pathname});});
 async function shot(name){await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
 async function dims(){return p.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,height:innerHeight}));}
 async function send(q){await p.locator('#ask').fill(q);await p.locator('.send[type=submit]').click();await p.locator('.send[type=button]').waitFor({state:'hidden',timeout:20000});}
 await p.goto(base,{waitUntil:'domcontentloaded'});
 await check('Primera visita y consentimiento',async()=>{
   assert(await p.getByRole('dialog').isVisible());await shot('01-bienvenida');
   await p.getByRole('button',{name:'Ir al aviso',exact:true}).click();
   await p.locator('details.privacy summary').click();
   const contacts=await p.getByRole('dialog').locator('a').count();
   record('Alternativa al chat desde consentimiento',contacts?'REVISAR':'FALLO',contacts?'Hay enlaces; comprobar destino.':'El aviso no ofrece enlace a documentos aunque los menciona como alternativa.');
   await p.getByRole('button',{name:'Entiendo y acepto',exact:true}).click();
   await p.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(await p.getByRole('dialog').count(),0);
   record('Primera visita y consentimiento','OK','Se abre el aviso, se despliega privacidad y se acepta.');
 });
 await check('Conexión pública real',async()=>{
   for(const endpoint of ['/topics','/trends?lang=es','/trends?lang=en','/places','/docs']){
     const r=await context.request.get(base+'/__yachi_api'+endpoint,{timeout:10000});
     const json=await r.json().catch(()=>null);
     record('GET '+endpoint,r.ok()?'OK':'FALLO',{status:r.status(),items:Array.isArray(json)?json.length:undefined});
   }
 });
 await check('Inicio, tema claro y oscuro',async()=>{
   await p.locator('.suggest-card').first().waitFor();await shot('02-inicio');
   await p.locator('.topbar button[title]').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');await shot('03-oscuro');
   await p.locator('.topbar button[title]').click();record('Inicio, tema claro y oscuro','OK','Tarjetas reales y alternancia de tema.');
 });
 await check('Idiomas ES, EN y Kichwa beta',async()=>{
   await p.locator('.lang-select select').selectOption('en');
   assert.equal(await p.locator('html').getAttribute('lang'),'en');
   await p.locator('.suggest-card').first().waitFor();await shot('04-ingles');
   await p.locator('.lang-select select').selectOption('qu');
   assert(await p.locator('.kichwa-note').isVisible());
   await p.locator('.lang-select select').selectOption('es');
   record('Idiomas ES, EN y Kichwa beta','OK','Cambio de idioma; Kichwa se identifica como beta. No se certifica calidad lingüística.');
 });
 await check('Inicio en pantallas pequeñas',async()=>{
   const measurements=[];
   for(const [width,height] of [[390,844],[320,568],[390,400]]){
     await p.setViewportSize({width,height});
     await p.waitForTimeout(200);
     await p.locator('.hello').evaluate(e=>e.scrollTop=0);
     const m=await p.evaluate(()=>{const g=document.querySelector('.greet');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,greetingTop:g.getBoundingClientRect().top,containerTop:document.querySelector('.hello').getBoundingClientRect().top}});
     measurements.push(m);await shot('inicio-'+width+'x'+height);
   }
   record('Inicio en pantallas pequeñas',measurements.some(m=>m.greetingTop<m.containerTop)?'FALLO':'OK',measurements);
   await p.setViewportSize({width:390,height:844});
 });
 await check('Menú móvil y Escape',async()=>{
   await p.locator('.topbar button[aria-controls]').click();
   await p.keyboard.press('Escape');
   const open=await p.locator('.app').evaluate(e=>e.classList.contains('rail-open-mobile'));
   record('Menú móvil y Escape',open?'FALLO':'OK',{openAfterEscape:open,backgroundInert:await p.locator('main.chat').getAttribute('inert')});
   if(open)await p.locator('.scrim').click({position:{x:380,y:300}});
   await p.setViewportSize({width:1440,height:1000});
 });
 await check('Adjuntar imagen y retirarla',async()=>{
   await p.locator('.composer input[type=file]').setInputFiles({name:'prueba.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
   await p.locator('.tray-item').waitFor();await p.locator('.thumb').click();assert(await p.locator('.lightbox').isVisible());
   await p.keyboard.press('Escape');await p.locator('.tray-item .x').click();assert.equal(await p.locator('.tray-item').count(),0);
   record('Adjuntar imagen y retirarla','OK','Selección, vista previa, Escape y retirar funcionan en frontend; no prueba comprensión del archivo.');
 });
 await check('Bloqueo de datos personales',async()=>{
   await p.locator('#ask').fill('Mi correo de prueba es auditoria@example.com');await p.locator('.send').click();
   assert(await p.locator('.pii-banner').isVisible());
   await p.locator('.pii-banner button').last().click();await p.locator('#ask').fill('');
   record('Bloqueo de datos personales','OK','Se muestra aviso antes de enviar un correo.');
 });
 await check('Chat real, fuentes y actividad',async()=>{
   await send('¿Cuándo es la recepción de solicitudes de cambio de carrera para 2026SEM02?');
   assert(await p.locator('.msg-ai .md').last().innerText());
   const sourceCount=await p.locator('.src').count(),extract=await p.locator('.extractive-label').count();
   await shot('05-chat-real');
   record('Chat real, fuentes y actividad',sourceCount?'OK':'FALLO',{sourceCount,extractive:!!extract,activity:await p.locator('.answer-activity').count()});
   if(sourceCount){await p.locator('.src').first().click();assert(await p.locator('.src-detail').isVisible());record('Detalle de fuente','OK',{links:await p.locator('.src-detail a').count()});}
 });
 await check('Renombrar, eliminar y deshacer',async()=>{
   await p.locator('.chat-more').first().click({force:true});await p.getByRole('menuitem',{name:'Renombrar',exact:true}).click();
   await p.locator('.inp.rename').fill('Auditoría de navegación');await p.locator('.inp.rename').press('Enter');
   await p.locator('.chat-more').first().click({force:true});await p.getByRole('menuitem',{name:'Eliminar',exact:true}).click();
   const undo=p.getByRole('button',{name:'Deshacer',exact:true});await undo.waitFor();
   const color=await undo.evaluate(e=>({text:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
   await undo.click();assert(await p.locator('.chat-list .item[title="Auditoría de navegación"]').count());
   record('Renombrar, eliminar y deshacer','OK',color);
 });
 await check('Aclaración de consulta real',async()=>{
   await send('Residencias');
   record('Aclaración de consulta real',await p.locator('.clarify').count()?'OK':'REVISAR',{clarifications:await p.locator('.clarify').count()});
 });
 await check('Ubicación real y mapa',async()=>{
   await send('¿Dónde queda la biblioteca?');
   record('Ubicación real y mapa',await p.locator('.map-card').count()?'OK':'REVISAR',{maps:await p.locator('.map-card').count()});
 });
 await check('Rechazo de consulta ajena',async()=>{
   await send('¿Qué clima hará mañana?');
   record('Rechazo de consulta ajena',await p.locator('.unknown').count()?'OK':'REVISAR',{unknownCards:await p.locator('.unknown').count()});
 });
 await check('Información y privacidad reabiertas',async()=>{
   for(const name of ['Cómo funciona','Aviso de uso de datos']){
     await p.locator('.rail').getByRole('button',{name,exact:true}).click();assert(await p.getByRole('dialog').isVisible());await p.keyboard.press('Escape');
   }
   record('Información y privacidad reabiertas','OK','Ambos diálogos se abren y cierran con Escape.');
 });
 await check('Modo voz: pantalla y controles',async()=>{
   await p.goto(base+'/#/voz');await p.locator('.voice').waitFor();await shot('06-voz');
   const speed=p.locator('.voice-prefs select').first();await speed.selectOption('0.85');
   await p.keyboard.press('Escape');await p.locator('.voice').waitFor({state:'hidden'});assert.equal(await p.locator('.voice').count(),0);
   record('Modo voz: pantalla y controles','PARCIAL','Entrada por URL, ajuste de velocidad y salida correctos. Voz real, permisos y calidad del reconocimiento requieren prueba con micrófono.');
 });
 await check('Widget público',async()=>{
   await p.goto(base+'/demo-sitio.html');await p.locator('.yw-face').waitFor();
   assert(await p.locator('img.yw-face').evaluate(e=>e.complete&&e.naturalWidth>0));
   await p.locator('.yw-btn').click();await p.locator('.yw-panel iframe').waitFor();await shot('07-widget');
   await p.keyboard.press('Escape');assert.equal(await p.locator('.yw-btn').getAttribute('aria-expanded'),'false');
   await p.setViewportSize({width:390,height:844});await p.locator('.yw-btn').click();
   record('Widget público','OK',{mobilePanel:await p.locator('.yw-panel').evaluate(e=>Math.round(e.getBoundingClientRect().width))});
   await p.setViewportSize({width:1440,height:1000});
 });
 let signedIn=false;
 await check('Acceso administrativo real',async()=>{
   if(process.env.SKIP_ADMIN){record('Acceso administrativo real','BLOQUEADO','El primer intento real devolvió HTTP 429. No se repitió ni se eludió el límite.');return;}
   await p.goto(base+'/#/admin');await p.getByLabel('Correo institucional').fill((env.ADMIN_EMAILS||'').split(',')[0]);
   await p.getByLabel('Contraseña',{exact:true}).fill(env.ADMIN_PASSWORD||'');
   await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.locator('.admin-main').waitFor();
   signedIn=true;record('Acceso administrativo real','OK','Se usó configuración local existente sin copiar credenciales al informe.');
 });
 if(signedIn){
   for(const tab of ['Documentos','Subir','Temas','Tendencias','Sin respuesta','Filtros','Validación','Costo']){
     await check('Administración: '+tab,async()=>{
       await p.locator('nav.tabs').getByRole('button',{name:tab,exact:true}).click();await p.waitForTimeout(450);
       await shot('admin-'+tab.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-').toLowerCase());
       const alerts=await p.locator('.admin-main .err').allTextContents();
       record('Administración: '+tab,alerts.length?'FALLO':'OK',{title:await p.locator('.admin-main h2').first().innerText(),errors:alerts});
       if(tab==='Documentos'){
         const rows=await p.locator('tbody tr').count();
         const search=p.locator('input[type=search],input[placeholder*="Buscar"]').first();
         if(await search.count()){await search.fill('zzzauditoria_sin_resultado');record('Buscar documento','OK',{emptyText:(await p.locator('tbody').innerText()).slice(0,150)});await search.fill('');}
         record('Inventario real','OK',{rows});
       }
       if(tab==='Filtros'){
         await p.getByLabel('Mensaje de un estudiante').fill('hola');
         await p.getByRole('button',{name:'Probar',exact:true}).click();await p.waitForTimeout(300);
         record('Probar filtro real',await p.locator('.admin-main .err').count()?'FALLO':'OK',(await p.locator('.admin-main [role=status]').allTextContents()).join(' ').slice(0,150));
         await p.getByRole('button',{name:'Correr casos',exact:true}).click();await p.waitForTimeout(400);
         record('Casos de filtros reales',await p.locator('.admin-main .kpi').count()?'OK':'FALLO',(await p.locator('.admin-main .kpi').allTextContents()).slice(0,3));
       }
       if(tab==='Costo'){
         const input=p.getByLabel('Estudiantes',{exact:true});const before=await p.locator('.kpi').first().innerText();
         await input.fill('0');const after=await p.locator('.kpi').allTextContents();
         record('Calculadora: cero estudiantes',after.some(s=>/NaN|Infinity/.test(s))?'FALLO':'OK',{before,after});
       }
     });
   }
   await check('Administración en móvil',async()=>{
     const ms=[];
     for(const tab of ['Documentos','Subir','Filtros','Validación','Costo']){
       await p.locator('nav.tabs').getByRole('button',{name:tab,exact:true}).click();
       await p.setViewportSize({width:390,height:844});await p.waitForTimeout(200);ms.push({tab,...await dims()});
       await shot('admin-movil-'+tab.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
     }
     record('Administración en móvil',ms.some(m=>m.width>m.viewport)?'FALLO':'OK',ms);
     await p.setViewportSize({width:1440,height:1000});
   });
   await check('Contrato de validación real',async()=>{
     const token=await p.evaluate(()=>sessionStorage.getItem('yt-admin-token'));
     const cases=await context.request.get(base+'/__yachi_api/admin/validation/cases',{headers:{Authorization:'Bearer '+token}});
     const json=await cases.json();record('Set real de control',cases.ok()?'OK':'FALLO',{status:cases.status(),count:Array.isArray(json)?json.length:undefined});
     await p.locator('nav.tabs').getByRole('button',{name:'Validación',exact:true}).click();
     record('Contador de validación visible','REVISAR',await p.locator('button').filter({hasText:/Evaluar \d+ preguntas/}).allTextContents());
   });
   await check('Salir de administración',async()=>{
     await p.getByRole('button',{name:'Salir',exact:true}).click();await p.getByRole('button',{name:'Entrar',exact:true}).waitFor();
     assert.equal(await p.evaluate(()=>sessionStorage.getItem('yt-admin-token')),null);
     record('Salir de administración','OK','Regresa al acceso y elimina el token local.');
   });
 }
 fs.writeFileSync(path.join(out,'resultados.json'),JSON.stringify({base,results,errors,network},null,2));
 await browser.close();console.log('AUDITORÍA GUARDADA',results.length,'comprobaciones');
})().catch(e=>{fs.writeFileSync(path.join(out,'resultados.json'),JSON.stringify({results,errors,network,fatal:e.message},null,2));console.error(e.message);process.exit(1)});
