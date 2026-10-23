const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out = path.resolve('docs/entrega/arquitectura-estilo-original');
fs.mkdirSync(out, { recursive: true });
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const text = (x,y,s,size=14,fill='#526172',weight=400,extra='') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
const card = (x,y,n,title,lines,color,numberColor=color) => `<rect x="${x}" y="${y}" width="157" height="145" rx="16" fill="#edf3f7"/><rect x="${x}" y="${y}" width="157" height="4" fill="${color}"/>${text(x+14,y+31,n,13,numberColor,700)}${text(x+14,y+60,title,19,'#202e3b',700)}${lines.map((s,i)=>text(x+14,y+86+i*21,s,14)).join('')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="562.5" viewBox="0 0 1000 562.5"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#27618e"/></marker></defs><rect width="1000" height="562.5" fill="#fcfcfa"/><g font-family="Arial,Helvetica,sans-serif">
${text(55,65,'07 · LA MAGIA DETRÁS DE YACHI · 1/3',13,'#27618e',700,'letter-spacing="1.5"')}
${text(55,128,'Cómo',45,'#1e2b35',700)}
<rect x="191" y="84" width="219" height="54" fill="#27618e"/>
<text x="201" y="128" font-family="Georgia,serif" font-size="45" font-weight="700" fill="#fff">funciona</text>
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa','#35c3d4'].map((c,i)=>`<rect x="${55+i*43}" y="148" width="43" height="6" fill="${c}"/>`).join('')}

${card(55,231,'01','Fuentes',['Web, documentos','y comunicados','Portal + correo'],'#ef4035')}
${card(238,219,'02','Indexado',['MiniLM · embeddings','PostgreSQL','+ pgvector'],'#f68735','#df551a')}
${card(421,219,'03','Agente + RAG',['Filtros y rutas','Búsqueda híbrida','Guías y mapas'],'#64ae42','#488b30')}
${card(604,237,'04','Generación',['Claude','Solo con evidencia','recuperada'],'#299dce','#27618e')}
${card(787,237,'05','Respuesta',['Verificación y citas','Sin respaldo:','«No sé»'],'#00b7aa','#008a82')}

${[212,395,578,761].map(x=>`<path d="M${x+10} 299h15" stroke="#27618e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`).join('')}

<path d="M55 414H913C930 414 947 430 947 447V474H88C69 474 55 460 55 442Z" fill="#27618e"/>
${text(76,449,'INTERACCIÓN',13,'#cde0ee',700,'letter-spacing="1"')}
<rect x="198" y="429" width="218" height="29" rx="15" fill="#fff" fill-opacity=".14"/>
${text(212,448,'Interfaz web · React + TypeScript',12.5,'#fff',600)}
<rect x="428" y="429" width="133" height="29" rx="15" fill="#fff" fill-opacity=".14"/>
${text(443,448,'Voz ↔ texto',12.5,'#fff',600)}
<rect x="573" y="429" width="352" height="29" rx="15" fill="#fff" fill-opacity=".14"/>
${text(588,448,'ES · EN · kichwa experimental',12.5,'#fff',600)}

${text(55,527,'Yachi · Ideatón Yachay Open Science Week 2026',12.5,'#7a8998')}
${text(929,527,'12',12.5,'#7a8998')}
</g></svg>`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:2000,height:1125},deviceScaleFactor:2});
  await page.setContent('<style>html,body{margin:0;background:#fcfcfa}svg{display:block;width:2000px;height:1125px}</style>'+svg);
  await page.screenshot({path:path.join(out,'como-funciona-yachi.png')});
  fs.writeFileSync(path.join(out,'como-funciona-yachi.svg'),svg);
 }finally{await browser.close();}
 console.log('Diapositiva exportada: PNG 4000×2250 y SVG editable.');
})().catch(e=>{console.error(e.message);process.exit(1)});
