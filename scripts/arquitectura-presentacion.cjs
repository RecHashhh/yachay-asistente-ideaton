const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out = path.resolve('docs/entrega/capturas-2026-10-23');
fs.mkdirSync(out, { recursive: true });
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const text = (x,y,s,size=24,fill='#263744',weight=400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(s)}</text>`;
const box = (x,y,w,h,title,lines,color='#27618e') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#edf3f7"/><path d="M${x} ${y}h${w}" stroke="${color}" stroke-width="7"/>${text(x+24,y+45,title,28,color,700)}${lines.map((s,i)=>text(x+24,y+88+i*32,s,23)).join('')}`;
const arrow = (x,y,x2,y2) => `<path d="M${x} ${y}L${x2} ${y2}" stroke="#27618e" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#27618e"/></marker></defs><rect width="1920" height="1080" fill="#ffffff"/><g font-family="Segoe UI,Arial,sans-serif">
${text(80,68,'LA MAGIA DETRÁS DE YACHI · ARQUITECTURA IMPLEMENTADA',22,'#27618e',700)}
${text(80,140,'De la fuente oficial a una respuesta verificable',49,'#1d2b36',700)}
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa'].map((c,i)=>`<rect x="${80+i*90}" y="168" width="90" height="8" fill="${c}"/>`).join('')}
${text(80,229,'1 · PREPARAR Y ACTUALIZAR LA INFORMACIÓN',21,'#27618e',700)}
${box(80,258,355,158,'Portal administrativo',['PDF, Excel y CSV oficiales','Versiones · vigencia · bitácora'],'#ef4035')}
${box(485,258,355,158,'Preparación del corpus',['Extraer texto y tablas','Fragmentos de hasta 800 tokens'],'#f68735')}
${box(890,258,420,158,'Índice híbrido · PostgreSQL',['MiniLM multilingüe + pgvector','HNSW + texto completo + RRF'],'#64ae42')}
${box(1360,258,480,158,'Base local disponible',['75 documentos · 1.446 fragmentos','La evidencia conserva su documento'],'#00b7aa')}
${arrow(440,335,475,335)}${arrow(845,335,880,335)}${arrow(1315,335,1350,335)}
${text(80,474,'2 · RESPONDER CADA CONSULTA',21,'#27618e',700)}
${box(80,505,395,195,'Entrada y enrutamiento',['Web: React + TypeScript','API: FastAPI + LangGraph','Idioma · dominio · datos sensibles'],'#ef4035')}
${box(530,505,400,195,'Agente y recuperación',['Catálogo → búsqueda de evidencia','Trámites: guías verificadas','Ubicaciones: herramienta de mapas'],'#64ae42')}
${box(985,505,400,195,'Respuesta con evidencia',['Claude: redacta con fragmentos','Guías / mapas: ruta estructurada','Sin modelo: extracto de la fuente'],'#299dce')}
${box(1440,505,400,195,'Verificación y entrega',['Citas + cifras + enlaces','Sin respaldo: «sin información»','Streaming y fuente consultable'],'#00b7aa')}
${arrow(480,605,520,605)}${arrow(935,605,975,605)}${arrow(1390,605,1430,605)}
<path d="M1100 421V451H730V495" stroke="#27618e" stroke-width="3" stroke-dasharray="7 7" fill="none" marker-end="url(#arrow)"/>
<rect x="80" y="749" width="1760" height="99" rx="18" fill="#27618e"/>
${text(108,790,'VOZ EXPERIMENTAL EN KICHWA',23,'white',700)}
${text(108,824,'Audio → Killkan ASR → transcripción editable → mismo agente → Meta MMS TTS (Kichwa de Tena)',25,'white')}
<rect x="80" y="875" width="1760" height="111" rx="18" fill="#f2f6f9"/>
${text(108,915,'EVALUACIÓN Y OPERACIÓN',22,'#27618e',700)}
${text(108,953,'Set de control · trazabilidad · latencias p50/p95 · tokens y costo · presupuesto · reportes de traducción',25)}
${text(80,1035,'Decisiones: búsqueda híbrida para recuperar evidencia · rutas estructuradas para no inventar pasos · rechazo cuando falta respaldo',21,'#607482')}
${text(80,1067,'Cifras del índice local consultadas el 23-10-2026. Kichwa experimental: requiere revisión lingüística.',19,'#607482')}
</g></svg>`;
fs.writeFileSync(path.join(out,'10-arquitectura-yachi.svg'),svg);
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try { const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});await page.setContent(svg);await page.screenshot({path:path.join(out,'10-arquitectura-yachi.png')}); }
 finally {await browser.close();}
 console.log('Arquitectura exportada a SVG editable y PNG 3840×2160.');
})().catch(e=>{console.error(e.message);process.exit(1)});
