// Activa propuestas existentes para prueba visual; no modifica aprobaciones ni CSV de revisión.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'docs/kichwa-alki-2026-10-22');
const current = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'kichwa-preparar.cjs'), '--current'], { encoding: 'utf8' }));
const samples = JSON.parse(fs.readFileSync(path.join(base, 'muestras.json'), 'utf8')).items;
const policy = JSON.parse(fs.readFileSync(path.join(base, 'politica-vista-previa.json'), 'utf8'));
const blocked = new Set(policy.blockedKeys);
const allowed = new Set(policy.allowedProposals ?? []);
const catalogue = JSON.parse(fs.readFileSync(path.join(base, 'catalogo-documentado.json'), 'utf8'));
const complementary = JSON.parse(fs.readFileSync(path.join(base, 'borradores-complementarios.json'), 'utf8'));
const preview = {}, omitted = [];
const markers = text => JSON.stringify([...text.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort());
for (const item of samples) {
  if (!(item.key in current)) continue; // Las preguntas de ejemplo no son etiquetas de interfaz.
  const reason = blocked.has(item.key) ? 'discrepancia_en_revision' : (!allowed.has(item.key) && !policy.allowUnreviewedDrafts) ? 'sin_respaldo_suficiente_en_contexto' : item.es !== current[item.key] ? 'origen_modificado' :
    !item.qu?.trim() ? 'traduccion_vacia' :
      /proporciona (?:el|un)|lo siento, no puedo|texto que deseas traducir/i.test(item.qu) ? 'respuesta_meta_no_traduccion' :
      item.flags?.length ? item.flags.join(',') :
        markers(item.es) !== markers(item.qu) ? 'variables_alteradas' : null;
  if (reason) omitted.push({ key: item.key, reason });
  else preview[item.key] = item.qu;
}
const welcome = JSON.parse(fs.readFileSync(path.join(base, 'aportes-conversacion.json'), 'utf8')).items.find(x => x.id === 'aporte-welcome-001');
if (!welcome || !welcome.es.includes('Yachay Tech') || !welcome.qu.includes('Yachay Tech')) throw Error('Falta el aporte de bienvenida esperado');
if (allowed.has('helloSub') && !blocked.has('helloSub')) {
  preview.helloSub = welcome.qu.replace('Yachay Tech', '{uni}');
  if (markers(current.helloSub) !== markers(preview.helloSub)) throw Error('Variables de bienvenida incompatibles');
}
for (const [key, text] of Object.entries(policy.documentedOverrides)) {
  if (!(key in current) || markers(current[key]) !== markers(text)) throw Error('Propuesta documentada incompatible: ' + key);
  preview[key] = text;
}
for (const item of catalogue.entries) {
  if (item.es !== current[item.key] || !item.refs?.length || markers(item.es) !== markers(item.qu)) throw Error('Entrada documentada incompatible: ' + item.key);
  preview[item.key] = item.qu;
}
if (policy.allowUnreviewedDrafts) for (const item of complementary.entries) {
  if (item.es !== current[item.key] || !item.qu.trim() || markers(item.es) !== markers(item.qu)) throw Error('Borrador complementario incompatible: ' + item.key);
  preview[item.key] = item.qu;
}
fs.writeFileSync(path.join(root, 'web/src/lib/kichwa.preview.json'), JSON.stringify(preview, null, 2) + '\n');
const report = { sources: ['PDF aportados por el usuario', 'https://alki.ec/'], mode: 'catalogo_documentado_y_propuestas_limitadas', approvedLinguistically: false, documentedInterfaceKeys: catalogue.entries.length, experimentalPhraseKeys: [...allowed], activeInterfaceKeys: Object.keys(preview).length, omittedScope: 'Propuestas originales de Alki omitidas; algunas claves cuentan con un reemplazo de diccionario activo.', omitted, exampleQuestionsStored: samples.filter(x => !(x.key in current)).length, institutionalAnswersTranslated: false };
report.mode = policy.allowUnreviewedDrafts ? 'borrador_amplio_solicitado_por_usuario' : report.mode;
report.totalNonemptyInterfaceKeys = Object.values(current).filter(text => text.trim()).length;
report.pendingInterfaceKeys = Object.keys(current).filter(key => current[key].trim() && !(key in preview));
report.coverageIsNotLinguisticAccuracy = true;
report.complementaryDraftCount = policy.allowUnreviewedDrafts ? complementary.entries.length : 0;
report.complementaryDraftSource = complementary.source;
fs.writeFileSync(path.join(base, 'vista-previa.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
