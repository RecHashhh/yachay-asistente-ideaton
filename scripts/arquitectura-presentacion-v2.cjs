const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [path.resolve('web')] }));
const out = path.resolve('docs/entrega/arquitectura-v2-2026-10-23');
fs.mkdirSync(out, { recursive: true });
const m = JSON.parse(fs.readFileSync(path.join(out, 'metricas-verificadas.json'), 'utf8'));
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const t = (x, y, s, size = 24, color = '#263744', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
const line = (x,y,x2,y2) => `<path d="M${x} ${y}L${x2} ${y2}" stroke="#27618e" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
const box = (x,y,w,h,title,lines,color='#27618e',size=23) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#edf3f7"/><path d="M${x} ${y}h${w}" stroke="${color}" stroke-width="6"/>${t(x+22,y+38,title,27,color,700).replace('<text ',`<text data-max-width="${w-44}" `)}${lines.map((s,i)=>t(x+22,y+77+i*31,s,size).replace('<text ',`<text data-max-width="${w-44}" `)).join('')}`;
const base = (title,subtitle,body,footer) => `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#27618e"/></marker></defs><rect width="1920" height="1080" fill="white"/><g font-family="Segoe UI,Arial,sans-serif">${t(70,60,'YACHI · ARQUITECTURA Y EVIDENCIA · REVISIÓN 23-10-2026',22,'#27618e',700)}${t(70,125,title,47,'#1d2b36',700)}${t(70,170,subtitle,23,'#607482')}${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa'].map((c,i)=>`<rect x="${70+i*90}" y="190" width="90" height="7" fill="${c}"/>`).join('')}${body}${t(70,1036,footer,20,'#607482')}</g></svg>`;

const architecture = base('Fuentes, vigencia y respuestas verificables',
  'Incluye los aportes de KevJoss en origin/main (789f2be). La activación del correo debe verificarse en el servicio.',
  `${box(70,238,390,100,'Portal administrativo',['PDF, Excel y CSV · versiones y vigencia'],'#ef4035',21)}
   ${box(70,365,390,100,'Comunicados por correo',['.eml original → buzón robot → n8n'],'#f68735',21)}
   ${box(535,238,385,227,'Ingesta y control',['Endpoint /ingest/email con token','Remitente / reenviador permitidos','Texto + PDF; limpieza y metadatos','Clasificación y registro del costo'],'#f68735',21)}
   ${box(995,238,425,227,'Índice compartido',['PostgreSQL + pgvector / HNSW','MiniLM multilingüe · 384 dimensiones','Correo: embedding corto + vecinos','PDF / Portal: fragmentos estructurados'],'#64ae42',21)}
   ${box(1495,238,355,227,'Trazabilidad documental',['Asunto · fecha · Message-ID','Origen · adjuntos · tipo · tema','ID estable: reingesta sin duplicar','Retiro administrativo preservado'],'#00b7aa',20)}
   <path d="M465 288H490V415H465" stroke="#27618e" stroke-width="3" fill="none"/>${line(490,350,525,350)}
   ${line(925,350,985,350)}${line(1425,350,1485,350)}
   ${t(70,522,'ENRUTAMIENTO · HORARIOS DE SERVICIOS → DOCUMENTOS / UBICACIONES → MAPAS',21,'#27618e',700)}
   ${box(70,554,390,214,'Interfaz y entrada',['React + TypeScript · ES / EN / QU','FastAPI + LangGraph','Idioma, dominio y datos sensibles','Aclaración cuando falta contexto'],'#ef4035',21)}
   ${box(535,554,385,214,'Enrutador de consultas',['Trámites → guías con evidencia','Servicio / buses → documentos','Ubicación / apertura → lugares','Rutas → herramienta geográfica'],'#64ae42',21)}
   ${box(995,554,425,214,'Recuperación y herramientas',['Agente guiado por catálogo','Texto + vectores fusionados (RRF)','Mapas: PostGIS + pgRouting','Guías: pasos y requisitos curados'],'#299dce',21)}
   ${box(1495,554,355,214,'Respuesta y verificación',['Claude: evidencia recuperada','Fecha de Ecuador para avisos','Cifras, enlaces y citas verificables','Sin respaldo: rechazar o derivar'],'#00b7aa',20)}
   ${line(465,660,525,660)}${line(925,660,985,660)}${line(1425,660,1485,660)}
   <path d="M1205 470V495H1205V544" stroke="#27618e" stroke-width="3" stroke-dasharray="7 7" marker-end="url(#arrow)"/>
   <rect x="70" y="808" width="1780" height="84" rx="17" fill="#27618e"/>
   ${t(95,841,'VOZ KICHWA EXPERIMENTAL',22,'white',700)}${t(95,874,'Killkan ASR → transcripción revisable → mismo agente → Meta MMS TTS (variante de Tena)',24,'white')}
   <rect x="70" y="918" width="1780" height="76" rx="17" fill="#edf3f7"/>
   ${t(95,949,'OPERACIÓN Y EVALUACIÓN',21,'#27618e',700)}${t(95,979,'Portal · set de control · tokens / gasto / tope · Prometheus / Grafana · errores HTTP y SSE · latencias',23)}
  `,'Fecha actual: instrucción al modelo para advertir sobre avisos pasados; no es una caducidad automática ni una garantía de veracidad.');

const s = m.summary.lastValidation;
const mib = bytes => (bytes / 1048576).toFixed(2).replace('.', ',');
const accuracy = (100*s.ok/s.total).toFixed(1).replace('.', ',');
const metrics = base('Métricas: resultado histórico y estado reciente',
  'Cada cifra conserva su fecha, muestra y alcance. Los PDF piden evidencia; no fijan un porcentaje o tiempo mínimo.',
  `${box(70,244,850,205,'Corpus y almacenamiento medidos',[
    `${m.runtime.health.documents} documentos · ${m.storage.chunks} fragmentos · ${m.summary.guides} guías`,
    `${m.storage.embeddingDimensions} dimensiones · ${m.storage.embeddedChunks} fragmentos con embedding`,
    `Tabla chunks + índices: ${mib(m.storage.tablesIncludingIndexesBytes.chunks)} MiB`,
    `Base local completa: ${mib(m.storage.databaseBytes)} MiB (incluye otras tablas)`],'#64ae42',24)}
   ${box(990,244,860,205,'Control ES / EN · histórico del 22-10',[
    '115 / 119 correctas = 96,6 % (97 % redondeado)',
    'ES: 96 % · EN: 100 % · 0 alertas sin fuente',
    'Latencia total: p50 6,4 s · p95 10,3 s',
    'Coincidencia de fuente / rechazo; no juicio factual completo'],'#299dce',24)}
   ${box(70,486,850,205,'Última corrida · 23-10, 09:26 (Ecuador)',[
    `${s.ok} / ${s.total} correctas = ${accuracy} % · ES ${s.es} % · EN ${s.en} %`,
    `Latencia total: p50 ${(s.p50/1000).toFixed(2)} s · p95 ${(s.p95/1000).toFixed(2)} s`,
    `${s.hallucinations} alertas: mensajes de servicio de mapas no disponible`,
    'Pendiente repetir tras integrar; no presentar 97 % como actual'],'#ef4035',24)}
   ${box(990,486,860,205,'Costo por consulta y recursos',[
    'Línea base: USD 0,0047 / consulta (109 consultas)',
    '540 consultas/día × 30 días → USD 76,14 de modelo',
    '+ USD 48 de servidor supuesto → USD 124,14 / mes',
    '4 vCPU / 8 GB son un escenario; CPU/RAM real pendiente'],'#f68735',24)}
   ${box(70,730,850,230,'Carga geográfica · medición local previa',[
    '20 sesiones concurrentes · 60 / 60 rutas correctas',
    'p95 2,027 s · 14,48 solicitudes/s · 0 errores SSE',
    'Sin llamadas al modelo: no mide concurrencia de RAG',
    'Una máquina / un worker; no acredita capacidad máxima',
    'Fuente: docs/reports/pilot-load-2026-10-23.md'],'#27618e',23)}
   ${box(990,730,860,230,'Pruebas nuevas y evidencia que falta',[
    '43 pruebas focalizadas pasan: correo, horarios y enrutador',
    'Falta: correo real extremo a extremo, vigencia y reingesta',
    'Falta: CPU/RAM bajo carga y costo nuevo de ingesta / voz',
    'Falta: revisión factual, usuarios y calidad de kichwa / voz',
    'No atribuir ahorro al catálogo sin comparación equivalente'],'#00b7aa',23)}
  `,'Snapshot local del 23-10-2026. Las 13 alertas son mensajes de indisponibilidad, no 13 hechos inventados comprobados.');

const coverage = base('Cobertura de la rúbrica: qué demostrar',
 'Una arquitectura cubre el diseño; el nivel excelente también exige paper, evaluación, adopción, costo y declaración de IA.',
 `${box(70,240,850,188,'1 · Rigor científico y metodología',[
   'Paper IEEE: problema, estado del arte y método reproducible',
   'Justificar cada decisión con resultados y límites',
   'Pendiente: cerrar borrador, resultados recientes y referencias'],'#27618e',24)}
  ${box(990,240,860,188,'2 · Calidad técnica y adopción',[
   'Procedimientos + representatividad + ubicaciones del campus',
   'Guías: qué, cómo, orden y documentos; portal actualizable',
   'Evidencia: demo, repositorio público y responsables del piloto'],'#64ae42',24)}
  ${box(70,464,850,188,'3 · Mitigación y validación de veracidad',[
   'Fuentes + citas + dominio + aclaración + «sin información»',
   'Set amplio: aciertos, rechazo, trazabilidad y revisión humana',
   'Cerrar regresiones recientes y probar comunicados pasados'],'#ef4035',24)}
  ${box(990,464,860,188,'4 · Experiencia, idiomas y accesibilidad',[
   'ES / EN fluidos, primer uso intuitivo y respuesta percibida ágil',
   'Medir primer evento útil y p50/p95; probar con estudiantes',
   'Kichwa es valor agregado; voz y traducción requieren revisión'],'#299dce',24)}
  ${box(70,688,850,188,'5 · Costo computacional completo',[
   'CPU, RAM, almacenamiento, inferencia y supuestos explícitos',
   'Separar consulta, ingesta de correo y voz; normal vs. pico',
   'Medir tokens, gasto y carga; no usar placeholders OPT_*'],'#f68735',24)}
  ${box(990,688,860,188,'6 · IA documentada · 7 · Pitch',[
   'Herramientas, propósito y aporte humano frente al de IA',
   'Problema → solución → validación → costo → impacto',
   'Ensayar el tiempo y explicar decisiones ante el jurado'],'#00b7aa',24)}
  <rect x="70" y="916" width="1780" height="78" rx="16" fill="#27618e"/>
  ${t(95,948,'CIERRE NECESARIO',22,'white',700)}${t(95,979,'Integrar y activar → validar correo y horarios → repetir control ES/EN y costos → actualizar paper y slides',24,'white')}
 `,'Fuente: Rúbrica, p. 1; Reto, pp. 2–6 (objetivos, alcance, requisitos 8.1/8.2, metodología, entregables y uso de IA).');

const slides = [['01-arquitectura-actualizada',architecture],['02-metricas-y-pendientes',metrics],['03-cobertura-rubrica',coverage]];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
  for (const [name,svg] of slides){
   await page.setContent(svg);
   await page.evaluate(() => {
    for (const el of document.querySelectorAll('svg text')) {
     const max = Math.min(Number(el.getAttribute('data-max-width') || Infinity), 1850 - Number(el.getAttribute('x')));
     const width = el.getBBox().width;
     if (width > max) el.setAttribute('font-size', String(Number(el.getAttribute('font-size')) * max / width));
    }
   });
   fs.writeFileSync(path.join(out,name+'.svg'),await page.locator('svg').evaluate(el=>el.outerHTML));
   await page.screenshot({path:path.join(out,name+'.png')});
  }
 } finally {await browser.close();}
 console.log('Exportadas 3 láminas en PNG 4K y SVG editable.');
})().catch(e=>{console.error(e.message);process.exit(1)});
