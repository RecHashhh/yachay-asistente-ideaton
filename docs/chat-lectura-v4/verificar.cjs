const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const b=await chromium.launch({channel:'chrome',headless:true});
  const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  p.setDefaultTimeout(8000);
  const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
  await p.route('**/__yachi_api/trends?*',r=>r.fulfill({json:[]}));
  await p.route('**/__yachi_api/topics',r=>r.fulfill({json:[]}));
  await p.goto('http://127.0.0.1:5180');
  await p.evaluate(()=>localStorage.setItem('yt-consent-2026-10c','1'));
  await p.reload();
  // Renderizador real: párrafos dentro de listas, numeración separada y tablas.
  await p.route('**/markdown-check',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<meta charset="utf-8"><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};
    window.$RefreshSig$=()=>type=>type;
    window.__vite_plugin_react_preamble_installed__=true;
    </script><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const {createRoot}=ReactDOM;
    import {Markdown} from '/src/components/Markdown.tsx';
    createRoot(document.getElementById('root')).render(React.createElement(Markdown,{text:'### Requisitos\\n\\n1. Primer requisito\\ncontinuación del requisito\\n\\n2. Segundo requisito\\n\\n3. Tercer requisito\\n\\n### Otra sección\\n\\n7. Paso siete\\n\\n8. Paso ocho\\n\\n| Campo | Valor |\\n| --- | --- |\\n| Tema | Ejemplo |',animate:false}));
    </script>`}));
  await p.goto('http://127.0.0.1:5180/markdown-check');
  await p.locator('.md ol').first().waitFor();
  assert.equal(await p.locator('.md ol').count(),2);
  assert.equal(await p.locator('.md ol').first().locator('li').count(),3);
  assert.equal(await p.locator('.md li').first().innerText(),'Primer requisito continuación del requisito');
  assert.equal(await p.locator('.md ol').nth(1).getAttribute('start'),'7');
  assert.equal(await p.locator('.md ol').nth(1).locator('li').last().getAttribute('value'),'8');
  assert.equal(await p.locator('table tbody tr').count(),1);
  // Respuesta SSE rápida: los estados no dependen de esperas artificiales.
  const text='### Cambio de carrera\\n\\nConsulta el procedimiento y confirma el periodo aplicable.\\n\\n### Pasos\\n\\n1. Revisa los requisitos del documento.\\n\\n2. Presenta la solicitud a la dependencia indicada.\\n\\n3. Consulta la resolución.';
  const source={docId:'test-doc',title:'Guía de procedimientos · ejemplo',version:'v1',docDate:'2026-10-20',snippet:'Documento de ejemplo para una prueba de interfaz',origin:'interno'};
  await p.route('**/__yachi_api/chat',r=>r.fulfill({contentType:'text/event-stream',body:[
    {type:'status',label:'Buscando en los documentos oficiales'},
    {type:'status',label:'Consultando Guía de procedimientos'},
    {type:'status',label:'Redactando respuesta'},
    {type:'token',text:text.replaceAll('\\n','\n')},
    {type:'sources',items:[source]},
    {type:'done',messageId:'test',latencyMs:85}
  ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}));
  await p.goto('http://127.0.0.1:5180');
  await p.locator('#ask').fill('Consulta de interfaz');
  await p.locator('.send').click();
  await p.locator('.answer-activity').waitFor();
  assert.equal(await p.locator('.md ol li').count(),3);
  assert.equal(await p.locator('.latency').count(),0);
  assert.equal(await p.locator('.thread').evaluate(e=>e.getBoundingClientRect().width),820);
  await p.locator('.answer-activity summary').click();
  assert.equal(await p.locator('.answer-activity li').count(),3);
  await p.locator('.answer-activity summary').click();
  await p.waitForTimeout(300);
  await p.screenshot({path:'docs/chat-lectura-v4/respuesta-escritorio.png'});
  // Modo extractivo: etiqueta explícita, mismos datos y fuente.
  await p.unroute('**/__yachi_api/chat');
  await p.route('**/__yachi_api/chat',r=>r.fulfill({contentType:'text/event-stream',body:[
    {type:'status',label:'Mostrando fragmento del documento'},
    {type:'answer_mode',mode:'extractive'},
    {type:'token',text:'1. Texto literal del primer punto.\n\n2. Texto literal del segundo punto.'},
    {type:'sources',items:[source]},
    {type:'done',messageId:'test-extract',latencyMs:35}
  ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}));
  await p.locator('#ask').fill('Otro ejemplo');await p.locator('.send').click();
  await p.locator('.extractive-label').waitFor();
  assert.equal(await p.locator('.extractive-note').isVisible(),true);
  await p.setViewportSize({width:390,height:844});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
  await p.screenshot({path:'docs/chat-lectura-v4/respuesta-movil.png'});
  assert.deepEqual(errors,[]);
  console.log('OK: títulos, listas continuadas y numeradas, tablas, actividad con respuesta rápida, fuentes, extractivo y móvil; sin errores JS.');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
