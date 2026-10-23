const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[path.resolve('web')]}));
const out=path.resolve('docs/entrega/arquitectura-pitch-definitiva');fs.mkdirSync(out,{recursive:true});
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const t=(x,y,s,size=24,color='#526172',weight=400,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
const card=(x,y,w,h,n,title,lines,color)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#edf3f7"/><path d="M${x+9} ${y}H${x+w-9}" stroke="${color}" stroke-width="6"/>${t(x+27,y+40,n,22,color,700)}${title.map((s,i)=>t(x+27,y+87+i*37,s,32,'#20303d',700)).join('')}${lines.map((s,i)=>t(x+27,y+(title.length>1?174:137)+i*35,s,26)).join('')}`;
const arrow=(x,y,x2,y2)=>`<path d="M${x} ${y}L${x2} ${y2}" stroke="#27618e" stroke-width="3" fill="none" marker-end="url(#a)"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#27618e"/></marker></defs><rect width="1920" height="1080" fill="#fcfcfa"/><g font-family="Arial,Helvetica,sans-serif">
${t(90,73,'07 · LA MAGIA DETRÁS DE YACHI · 1/3',23,'#27618e',700,'letter-spacing="2"')}
${t(90,174,'Cómo',75,'#1d2b36',700)}<rect x="318" y="98" width="388" height="94" fill="#27618e"/><text x="335" y="174" font-family="Georgia,serif" font-size="75" font-weight="700" fill="white">funciona</text>
${['#ef4035','#f68735','#f9c82b','#64ae42','#299dce','#00b7aa','#35c3d4'].map((c,i)=>`<rect x="${90+i*76}" y="215" width="76" height="9" fill="${c}"/>`).join('')}

${card(90,288,470,210,'01',['Fuentes'],['Documentos oficiales','y comunicados · Portal + n8n'],'#ef4035')}
${card(655,288,500,210,'02',['Indexado'],['Fragmentos + embeddings MiniLM','PostgreSQL / pgvector'],'#f68735')}
${arrow(575,393,635,393)}
<path d="M1170 393H1300" stroke="#27618e" stroke-width="3" marker-end="url(#a)"/>
${t(1340,382,'BASE DE CONOCIMIENTO',22,'#27618e',700,'letter-spacing="1"')}
${t(1340,422,'Fuentes organizadas y consultables',25)}

${t(90,530,'AL RECIBIR UNA CONSULTA',17,'#27618e',700,'letter-spacing="1"')}
<rect x="90" y="545" width="1740" height="73" rx="15" fill="#e8eff4"/>
${t(115,589,'FILTROS DE ENTRADA',21,'#27618e',700)}${t(365,589,'Datos personales · seguridad · dominio',24)}
<path d="M845 562V601" stroke="#c5d4df" stroke-width="2"/>
${t(875,589,'ENRUTAMIENTO',21,'#27618e',700)}${t(1070,589,'Trámites · documentos · ubicaciones',24)}
<path d="M1580 454H1855V640H590V650" stroke="#27618e" stroke-width="2.5" stroke-dasharray="7 6" fill="none" marker-end="url(#a)"/>
${arrow(350,625,350,650)}

${card(90,660,520,224,'03',['Agente y búsqueda'],['LangGraph · búsqueda híbrida','Guías y mapas'],'#64ae42')}
${card(700,660,500,224,'04',['Generación'],['Claude · respuesta basada','en evidencia'],'#299dce')}
${card(1290,660,540,224,'05',['Verificación y respuesta'],['Cifras, enlaces y citas','Sin respaldo: «no sé»'],'#00b7aa')}
${arrow(625,772,680,772)}${arrow(1215,772,1270,772)}

<path d="M90 931H1774Q1830 931 1830 986V1010H145Q90 1010 90 955Z" fill="#27618e"/>
${t(120,981,'INTERACCIÓN',23,'#d2e4f0',700,'letter-spacing="1"')}
${t(375,981,'React + TypeScript',27,'white',600)}
<path d="M665 953V991" stroke="#7aa1bd" stroke-width="2"/>
${t(705,981,'Texto y voz · ES / EN / kichwa experimental',27,'white',600)}
${t(90,1056,'Yachi · Ideatón Yachay Open Science Week 2026',21,'#7a8998')}${t(1798,1056,'12',21,'#7a8998')}
</g></svg>`;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
 await page.setContent('<style>body{margin:0}svg{display:block}</style>'+svg);
 fs.writeFileSync(path.join(out,'arquitectura-pitch-yachi.svg'),svg);
 await page.screenshot({path:path.join(out,'arquitectura-pitch-yachi.png')});
}finally{await browser.close();}console.log('Imagen PNG 4K y SVG exportados.');})().catch(e=>{console.error(e.message);process.exit(1)});
