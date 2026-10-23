const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out=path.resolve('docs/entrega/slide-arquitectura-final');
fs.mkdirSync(out,{recursive:true});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const t=(x,y,s,size=24,color='#263744',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
const card=(x,n,title,lines,color)=>`<rect x="${x}" y="430" width="310" height="245" rx="23" fill="#edf3f7"/><path d="M${x} 430h310" stroke="${color}" stroke-width="7"/>${t(x+25,475,n,23,color,700)}${title.map((s,i)=>t(x+25,522+i*37,s,30,'#1d2b36',700)).join('')}${lines.map((s,i)=>t(x+25, title.length>1?607+i*31:574+i*31,s,23,'#506172')).join('')}`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#27618e"/></marker></defs><rect width="1920" height="1080" fill="#fcfcfa"/><g font-family="Segoe UI,Arial,sans-serif">
${t(100,112,'07 · LA MAGIA DETRÁS DE YACHI · 1/3',24,'#27618e',700)}
${t(100,225,'Cómo',78,'#1d2b36',700)}<rect x="335" y="148" width="405" height="98" fill="#27618e"/><text x="354" y="225" font-family="Georgia,serif" font-size="78" font-weight="700" fill="white">funciona</text>
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa'].map((c,i)=>`<rect x="${100+i*90}" y="270" width="90" height="10" fill="${c}"/>`).join('')}

<rect x="100" y="330" width="1720" height="64" rx="14" fill="#e9f0f5"/>
${t(125,370,'FILTROS',21,'#27618e',700)}${t(230,370,'Datos personales · seguridad · dominio',24)}
<path d="M720 345v34" stroke="#c5d4df" stroke-width="2"/>
${t(750,370,'ENRUTAMIENTO',21,'#27618e',700)}${t(940,370,'Trámites · documentos · ubicaciones',24)}

${card(100,'01',['Fuentes'],['Documentos oficiales','y comunicados','Portal + correo / n8n'],'#ef4035')}
${card(452,'02',['Indexado'],['Fragmentos + MiniLM','PostgreSQL','+ pgvector'],'#f68735')}
${card(804,'03',['Agente y búsqueda'],['LangGraph · RAG híbrido','Guías de trámite','y mapas'],'#64ae42')}
${card(1156,'04',['Generación'],['Claude','Respuesta basada','en evidencia'],'#299dce')}
${card(1508,'05',['Verificación','y respuesta'],['Cifras, enlaces y citas','Sin respaldo: «no sé»'],'#00b7aa')}
${[410,762,1114,1466].map(x=>`<path d="M${x+9} 550h23" stroke="#27618e" stroke-width="3" marker-end="url(#a)"/>`).join('')}

<path d="M100 748H1762Q1820 748 1820 806V860H158Q100 860 100 802Z" fill="#27618e"/>
${t(135,816,'INTERACCIÓN',25,'#d6e7f3',700)}
<rect x="370" y="775" width="430" height="57" rx="28" fill="#ffffff" fill-opacity=".14"/>
${t(400,812,'Interfaz web · React + TypeScript',25,'white',600)}
<rect x="824" y="775" width="260" height="57" rx="28" fill="#ffffff" fill-opacity=".14"/>
${t(858,812,'Texto y voz',25,'white',600)}
<rect x="1108" y="775" width="666" height="57" rx="28" fill="#ffffff" fill-opacity=".14"/>
${t(1140,812,'Español · inglés · kichwa experimental',25,'white',600)}

${t(100,1010,'Yachi · Ideatón Yachay Open Science Week 2026',23,'#7a8997')}${t(1780,1010,'12',23,'#7a8997')}
</g></svg>`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
  await page.setContent('<style>body{margin:0}svg{display:block}</style>'+svg);
  fs.writeFileSync(path.join(out,'como-funciona-yachi.svg'),svg);
  await page.screenshot({path:path.join(out,'como-funciona-yachi.png')});
 }finally{await browser.close();}
 console.log('Diapositiva exportada en PNG 4K y SVG editable.');
})().catch(e=>{console.error(e.message);process.exit(1)});
