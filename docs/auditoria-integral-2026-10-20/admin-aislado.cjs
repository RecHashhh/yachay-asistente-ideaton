const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=__dirname,base='http://127.0.0.1:5180',results=[],errors=[],calls=[];
const docs=[{id:'audit-doc',title:'Documento de ejemplo para auditoría',topicId:'tramites',kind:'csv',version:'v1',docDate:'2026-10-20',origin:'interno',uploadedAt:'2026-10-20',uploadedBy:'Prueba',status:'indexado',chunks:2,sizeKb:1},{id:'audit-error',title:'Documento con error simulado',topicId:'tramites',kind:'pdf',version:'v1',docDate:'2026-10-20',origin:'interno',uploadedAt:'2026-10-20',uploadedBy:'Prueba',status:'error',chunks:0,sizeKb:1,notes:'Fallo de procesamiento simulado'}];
function record(name,status,details){results.push({name,status,details,mode:'API simulada; no valida backend'});console.log(status+' · '+name)}
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});
 const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',locale:'es-EC',acceptDownloads:true});
 const p=await c.newPage();p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{try{await fn()}catch(e){record(name,'FALLO',e.message.split('\n')[0])}};
 await p.route('**/__yachi_api/**',async r=>{
   const req=r.request(),url=new URL(req.url()),endpoint=url.pathname.replace('/__yachi_api',''),method=req.method();
   if(method!=='GET')calls.push({endpoint,method});
   let json={};
   if(endpoint==='/admin/login')json={name:'Auditoría',email:'auditoria@example.invalid',token:'SIMULADO'};
   else if(endpoint==='/topics')json=[{id:'tramites',name:'Trámites académicos',nameEn:'Academic procedures',description:'Ejemplo',descriptionEn:'Example'}];
   else if(endpoint==='/trends')json=[{query:'Consulta de ejemplo',topicId:'tramites',count:3,delta:0}];
   else if(endpoint==='/admin/docs'&&method==='GET')json=docs;
   else if(endpoint==='/admin/unanswered')json=[];
   else if(endpoint==='/admin/filters'&&method==='GET')json=[];
   else if(endpoint==='/admin/filters/check')json={route:'saludo',kind:'saludo',question:'hola',sensitive:false};
   else if(endpoint==='/admin/filters/test')json={ok:1,total:1,falsosPositivos:0,consultasLegitimas:1,falsosNegativos:0,casosDeRiesgo:0,rows:[]};
   else if(endpoint==='/admin/validation/run')json=[{id:'C1',q:'Pregunta de ejemplo',lang:'es',expect:'audit-doc',got:'audit-doc',ok:true,hallucination:false,ms:10}];
   else if(endpoint==='/admin/docs'&&method==='POST')json=docs[0];
   await r.fulfill({json});
 });
 await p.goto(base+'/#/admin');
 await p.getByLabel('Correo institucional').fill('auditoria@example.invalid');await p.getByLabel('Contraseña',{exact:true}).fill('clave-simulada');
 await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.locator('.admin-main').waitFor();
 for(const tab of ['Documentos','Subir','Temas','Tendencias','Sin respuesta','Filtros','Validación','Costo']){
   await check('Pantalla '+tab,async()=>{
     await p.locator('.tabs').getByRole('button',{name:tab,exact:true}).click();await p.waitForTimeout(250);
     await p.screenshot({path:path.join(out,'simulado-'+tab.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-').toLowerCase()+'.png'),fullPage:true});
     assert(await p.locator('.admin-main h2').first().isVisible());
     record('Pantalla '+tab,'OK',{title:await p.locator('.admin-main h2').first().innerText()});
     if(tab==='Documentos'){
       const search=p.locator('input[placeholder*="Buscar"]').first();
       await search.fill('zz-no-existe');assert((await p.locator('tbody').innerText()).includes('No hay documentos'));
       await search.fill('');record('Búsqueda y estado vacío','OK','El filtro funciona con datos de prueba.');
       await p.getByRole('button',{name:'Reprocesar',exact:true}).click();record('Reprocesar: conexión del botón',calls.some(x=>x.endpoint.endsWith('/reprocess'))?'OK':'FALLO','Se comprueba la petición, no el procesamiento.');
     }
     if(tab==='Subir'){
       await p.getByRole('button',{name:'Subir e indexar',exact:true}).click();assert(await p.locator('.err').isVisible());
       await p.locator('.drop input[type=file]').setInputFiles({name:'audit.csv',mimeType:'text/csv',buffer:Buffer.from('campo,valor\nprueba,ejemplo')});
       await p.locator('.form-grid select').first().selectOption({index:1});
       await p.getByRole('button',{name:'Subir e indexar',exact:true}).click();
       await p.waitForTimeout(350);record('Carga de documento: formulario','OK',{postMultipart:calls.some(x=>x.endpoint==='/admin/docs'&&x.method==='POST')});
     }
     if(tab==='Filtros'){
       await p.getByLabel('Mensaje de un estudiante').fill('hola');await p.getByRole('button',{name:'Probar',exact:true}).click();
       await p.getByRole('button',{name:'Correr casos',exact:true}).click();await p.waitForTimeout(200);
       record('Filtros: botones y métricas',await p.locator('.kpi').count()?'OK':'FALLO','Resultados de API simulada.');
     }
     if(tab==='Validación'){
       const file={name:'control-auditoria.csv',mimeType:'text/csv',buffer:Buffer.from('id;pregunta;idioma;esperado\nA1;Pregunta de auditoria;es;no_se')};
       const countBefore=calls.length;await p.locator('input[type=file]').setInputFiles(file);await p.waitForTimeout(200);
       record('Importar CSV en modo backend','FALLO',{visibleMessage:await p.locator('[role=status]').allTextContents(),requestsToPersist: calls.slice(countBefore)});
       await p.getByRole('button',{name:/Evaluar \d+ preguntas/}).click();await p.locator('.kpi').first().waitFor();
       const download=p.waitForEvent('download');await p.getByRole('button',{name:'Exportar resultados',exact:true}).click();await download;
       record('Evaluar y exportar: conexión de interfaz','OK','El botón solicita el run y genera CSV con resultados simulados.');
     }
     if(tab==='Costo'){
       await p.getByLabel('Estudiantes',{exact:true}).fill('0');
       record('Calculadora: cero estudiantes',(await p.locator('.kpis').first().innerText()).match(/NaN|Infinity/)?'FALLO':'OK',await p.locator('.kpis').first().innerText());
       await p.getByLabel('Acierto de caché semántica (0 a 1)',{exact:true}).fill('-2');
       record('Calculadora: límite de caché',await p.getByLabel('Acierto de caché semántica (0 a 1)',{exact:true}).inputValue()==='-2'?'FALLO':'OK','El campo permite un valor negativo y lo usa en el cálculo a pesar de indicar 0–1.');
     }
   });
 }
 await check('Administración móvil',async()=>{
   const measured=[];
   for(const tab of ['Documentos','Subir','Temas','Tendencias','Sin respuesta','Filtros','Validación','Costo']){
     await p.locator('.tabs').getByRole('button',{name:tab,exact:true}).click();await p.setViewportSize({width:390,height:844});await p.waitForTimeout(150);
     measured.push({tab,...await p.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}))});
     await p.screenshot({path:path.join(out,'simulado-movil-'+tab.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-').toLowerCase()+'.png'),fullPage:true});
   }
   record('Administración móvil',measured.some(m=>m.width>m.viewport)?'FALLO':'OK',measured);
 });
 await p.setViewportSize({width:1440,height:1000});
 await check('Validación: fallo de red',async()=>{
   await p.route('**/__yachi_api/admin/validation/run',r=>r.fulfill({status:503,body:'Servicio no disponible (prueba)'}));
   await p.locator('.tabs').getByRole('button',{name:'Validación',exact:true}).click();
   await p.getByRole('button',{name:/Evaluar \d+ preguntas/}).click();await p.waitForTimeout(250);
   record('Validación: fallo de red',await p.getByRole('button',{name:/Evaluando/}).isDisabled()?'FALLO':'OK','Tras 503 el botón queda deshabilitado en Evaluando; revisar recuperación y aviso.');
 });
 await p.getByRole('button',{name:'Salir',exact:true}).click();await p.getByRole('button',{name:'Entrar',exact:true}).waitFor();
 record('Salir: interfaz','OK',{tokenRemoved:await p.evaluate(()=>sessionStorage.getItem('yt-admin-token')===null),logoutRequested:calls.some(x=>x.endpoint==='/admin/logout')});
 fs.writeFileSync(path.join(out,'admin-aislado.json'),JSON.stringify({results,errors,calls},null,2));
 await b.close();
})().catch(e=>{fs.writeFileSync(path.join(out,'admin-aislado.json'),JSON.stringify({results,errors,calls,fatal:e.message},null,2));console.error(e.message);process.exit(1)});
