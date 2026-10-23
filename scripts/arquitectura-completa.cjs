const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out = path.resolve('docs/entrega/arquitectura-completa-2026-10-23');
fs.mkdirSync(out, { recursive: true });
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const txt = (x,y,s,size=25,color='#253646',weight=400,max=2440-x) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" data-max="${max}">${esc(s)}</text>`;
const box = (x,y,w,h,title,lines,color='#27618e',optional=false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${optional?'#f4f4f4':'#edf3f7'}" ${optional?'stroke="#87939e" stroke-width="2" stroke-dasharray="10 7"':''}/><path d="M${x+8} ${y}H${x+w-8}" stroke="${color}" stroke-width="6" ${optional?'stroke-dasharray="10 7"':''}/>${txt(x+23,y+39,title,29,color,700,w-46)}${lines.map((s,i)=>txt(x+23,y+79+i*31,s,24,'#253646',400,w-46)).join('')}`;
const arrow = (x,y,x2,y2,dash=false) => `<path d="M${x} ${y}L${x2} ${y2}" stroke="#27618e" stroke-width="3" ${dash?'stroke-dasharray="8 6"':''} fill="none" marker-end="url(#arrow)"/>`;
const band = (y,n,title) => txt(60,y,`${n}  ${title}`,23,'#27618e',700);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440" viewBox="0 0 2560 1440"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#27618e"/></marker></defs><rect width="2560" height="1440" fill="#fff"/><g font-family="Segoe UI,Arial,sans-serif">
${txt(60,54,'YACHI · ARQUITECTURA TÉCNICA COMPLETA',23,'#27618e',700)}
${txt(60,119,'Fuentes → filtros → agentes → respuesta',57,'#1d2b36',700)}
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa'].map((c,i)=>`<rect x="${60+i*100}" y="145" width="100" height="8" fill="${c}"/>`).join('')}
${band(196,'01','FUENTES E INDEXACIÓN')}
${box(60,221,440,142,'Fuentes institucionales',['Web · PDF · Excel · CSV','.eml original + PDF adjuntos'],'#ef4035')}
${box(550,221,440,142,'Ingesta y permisos',['Portal · CLI · n8n / IMAP','Token · remitentes permitidos'],'#f68735')}
${box(1040,221,440,142,'Procesamiento',['Limpieza · clasificación · chunks','Metadatos · IDs · deduplicación'],'#f68735')}
${box(1530,221,440,142,'Embeddings principales',['FastEmbed · MiniLM multilingüe','384 dimensiones'],'#64ae42')}
${box(2020,221,480,142,'Base documental',['PostgreSQL · pgvector · HNSW','Fuente · versión · fecha · vigencia'],'#00b7aa')}
${[500,990,1480,1970].map(x=>arrow(x+5,292,x+40,292)).join('')}

${band(414,'02','ENTRADA, SEGURIDAD Y FILTROS')}
${box(60,439,440,165,'Interfaz',['React · TypeScript · widget','Español · inglés · kichwa','Texto · voz · fuentes visibles'],'#27618e')}
${box(550,439,440,165,'API y acceso',['FastAPI · contratos SSE','Límites por IP / sesión','Sesiones y acceso administrativo'],'#27618e')}
${box(1040,439,880,165,'Filtros y triaje',['Datos personales · crisis · salud · denuncias','Respeto · manipulación · fuera de dominio','Listas configurables · minimización y reglas de conservación'],'#ef4035')}
${box(1970,439,530,165,'Enrutamiento · LangGraph',['Intención · historial · aclaración','Trámite ≠ ruta · servicio ≠ edificio','Horario de buses → documentos'],'#64ae42')}
${arrow(505,521,540,521)}${arrow(995,521,1030,521)}${arrow(1925,521,1960,521)}

${band(652,'03','RUTAS DE RESPUESTA')}
<path d="M2235 610V680H255M255 680H2305" stroke="#27618e" stroke-width="3" fill="none"/>
${[255,665,1075,1485,1895,2305].map(x=>arrow(x,680,x,704)).join('')}
${box(60,714,390,137,'Conversación',['Saludos · despedidas','Respuestas breves'],'#27618e')}
${box(470,714,390,137,'Situaciones sensibles',['Crisis · salud · denuncias','Apoyo y fuentes oficiales'],'#ef4035')}
${box(880,714,390,137,'Aclarar o rechazar',['Opciones de aclaración','Fuera de dominio / «no sé»'],'#f68735')}
${box(1290,714,390,137,'Guías de trámite',['Pasos · requisitos · plazos','Evidencia verificada'],'#64ae42')}
${box(1700,714,390,137,'Agente documental',['LangChain · catálogo compacto','YachiRetriever · herramientas'],'#299dce')}
${box(2110,714,390,137,'Herramienta de mapas',['PostGIS · pgRouting · MapLibre','Aulas / lugares curados: fallback'],'#00b7aa')}

${band(905,'04','RAG DOCUMENTAL Y ENTREGA')}
${box(60,930,550,155,'Recuperación híbrida',['Texto completo + vectores · RRF','Filtros de relevancia y documentos vigentes','Catálogo compacto · fuentes revalidadas'],'#64ae42')}
${box(670,930,550,155,'Modelo de lenguaje · Claude',['Anthropic SDK · generación restringida','Fragmentos · fuentes · fecha de Ecuador','Interruptor / presupuesto → modo extractivo'],'#299dce')}
${box(1280,930,550,155,'Verificación y trazabilidad',['Citas armadas por el servidor','Cifras · correos · enlaces · sin respaldo','Alertas → revisión en el Portal'],'#ef4035')}
${box(1890,930,610,155,'Salida común',['SSE → texto · guías · mapa · fuentes','Feedback · reportes · sugerencias sin repetir','Historial · preguntas pendientes'],'#00b7aa')}
${arrow(615,1008,660,1008)}${arrow(1225,1008,1270,1008)}${arrow(1835,1008,1880,1008)}
<path d="M1895 855V883H550V920" stroke="#27618e" stroke-width="3" stroke-dasharray="8 6" fill="none" marker-end="url(#arrow)"/>

${band(1137,'05','SERVICIOS TRANSVERSALES Y RUTA ALTERNATIVA')}
${box(60,1162,580,166,'Voz e idioma',['ES / EN: Web Speech del navegador','Kichwa: Killkan ASR → agente → MMS TTS','Revisión de transcripción · memoria léxica'],'#27618e')}
${box(680,1162,580,166,'Portal y gobernanza',['Documentos · guías · filtros · validación','Consultas · bitácora · tendencias · costos','Versiones · retiro · consentimiento'],'#64ae42')}
${box(1300,1162,580,166,'Operación y evaluación',['Tokens · costo · tope · caché de prompt','Prometheus / Grafana · HTTP / SSE · p50/p95','Docker Compose · pruebas CI · set de control'],'#299dce')}
${box(1920,1162,580,166,'Ollama · alternativa del repositorio',['bge-m3 · embeddings de 1024 dimensiones','Retriever SQLAlchemy · esquema rag','Perfil ollama / seed-ollama'],'#748391',true)}

${txt(60,1376,'Principal: YachiRetriever + MiniLM (384D). Ollama no está conectado al grafo principal: no es el reemplazo automático de Claude.',23,'#526879',600)}
${txt(60,1415,'Referencia: código local y origin/main 3210977 · Correo y perfiles opcionales requieren activación · Kichwa experimental · 23-10-2026',21,'#70818e')}
</g></svg>`;

(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:2});
  await page.setContent('<style>html,body{margin:0;padding:0}svg{display:block}</style>'+svg);
  await page.evaluate(()=>{
   for(const el of document.querySelectorAll('svg text')){
    const max=Number(el.getAttribute('data-max'));
    const width=el.getBBox().width;
    if(width>max)el.setAttribute('font-size',String(Number(el.getAttribute('font-size'))*max/width));
   }
  });
  fs.writeFileSync(path.join(out,'arquitectura-completa-yachi.svg'),await page.locator('svg').evaluate(el=>el.outerHTML));
  await page.screenshot({path:path.join(out,'arquitectura-completa-yachi.png')});
  await page.pdf({path:path.join(out,'arquitectura-completa-yachi.pdf'),width:'2560px',height:'1440px',printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
 }finally{await browser.close();}
 console.log('Arquitectura completa: PNG 5120×2880, SVG y PDF.');
})().catch(e=>{console.error(e.message);process.exit(1)});
