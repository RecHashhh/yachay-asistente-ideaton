const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out = path.resolve('docs/entrega/arquitectura-resumida-2026-10-23');
fs.mkdirSync(out, { recursive: true });
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const t = (x,y,s,size=27,color='#263744',weight=400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
const box = (x,y,w,h,n,title,lines,color) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="#edf3f7"/><path d="M${x+8} ${y}H${x+w-8}" stroke="${color}" stroke-width="7"/>${t(x+25,y+43,n,22,color,700)}${t(x+25,y+89,title,33,'#1d2b36',700)}${lines.map((s,i)=>t(x+25,y+136+i*36,s,26)).join('')}`;
const arrow = (x,y,x2,y2) => `<path d="M${x} ${y}L${x2} ${y2}" stroke="#27618e" stroke-width="3" fill="none" marker-end="url(#a)"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#27618e"/></marker></defs><rect width="1920" height="1080" fill="white"/><g font-family="Segoe UI,Arial,sans-serif">
${t(80,75,'YACHI · ARQUITECTURA',23,'#27618e',700)}
${t(80,155,'Cómo funciona Yachi',61,'#1d2b36',700)}
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa'].map((c,i)=>`<rect x="${80+i*80}" y="186" width="80" height="8" fill="${c}"/>`).join('')}

${box(80,265,520,200,'01','Fuentes oficiales',['Documentos y comunicados','Portal + correo / n8n'],'#ef4035')}
${box(700,265,520,200,'02','Indexación',['Embeddings MiniLM','PostgreSQL + pgvector'],'#64ae42')}
${box(1320,265,520,200,'03','Base de conocimiento',['Fuentes, versiones y fechas','Índice para búsqueda híbrida'],'#00b7aa')}
${arrow(610,365,687,365)}${arrow(1230,365,1307,365)}

${t(80,547,'CONSULTA DEL ESTUDIANTE',22,'#27618e',700)}
${box(80,585,365,210,'04','Interfaz',['Web + voz','ES / EN / kichwa'],'#27618e')}
${box(545,585,365,210,'05','Filtros y rutas',['Datos, seguridad y dominio','Trámites / mapas / RAG'],'#ef4035')}
${box(1010,585,365,210,'06','Agente + RAG',['Recuperación de evidencia','Claude · guías · mapas'],'#299dce')}
${box(1475,585,365,210,'07','Respuesta',['Verificación + citas','Sin respaldo: «no sé»'],'#00b7aa')}
${arrow(455,690,532,690)}${arrow(920,690,997,690)}${arrow(1385,690,1462,690)}
<path d="M1580 475V520H1192V575" stroke="#27618e" stroke-width="3" stroke-dasharray="8 6" fill="none" marker-end="url(#a)"/>

<rect x="80" y="852" width="1760" height="83" rx="20" fill="#27618e"/>
${t(110,903,'GESTIÓN Y CONTROL',24,'white',700)}${t(435,903,'Panel administrativo · validación · costos · monitoreo',28,'white')}
<rect x="80" y="960" width="1760" height="62" rx="16" fill="#f2f4f6"/>
${t(110,1000,'Ollama / bge-m3: alternativa de embeddings del repositorio; fuera del flujo principal.',24,'#657887')}
</g></svg>`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
  await page.setContent('<style>body{margin:0}svg{display:block}</style>'+svg);
  fs.writeFileSync(path.join(out,'arquitectura-resumida-yachi.svg'),svg);
  await page.screenshot({path:path.join(out,'arquitectura-resumida-yachi.png')});
 }finally{await browser.close();}
 console.log('Arquitectura resumida: PNG 4K y SVG.');
})().catch(e=>{console.error(e.message);process.exit(1)});
