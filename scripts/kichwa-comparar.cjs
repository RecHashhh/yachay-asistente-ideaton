// Comparación editorial de evidencias observadas; no certifica conocimiento del kichwa.
const fs = require('node:fs'), path = require('node:path');
const base = path.resolve(__dirname, '../docs/kichwa-alki-2026-10-22');
const initial = JSON.parse(fs.readFileSync(path.join(base, 'retrotraduccion.json'), 'utf8')).items;
const alternatives = JSON.parse(fs.readFileSync(path.join(base, 'contexto-retrotraduccion.json'), 'utf8')).items;
const notes = {
  cancel: 'La vuelta devuelve Vida, no la acción de cancelar.',
  retry: 'La vuelta devuelve Yo veo, no generar de nuevo.',
  steps: 'La vuelta devuelve Juego, no instrucciones de un trámite.',
  docs: 'La vuelta pregunta qué ves, no qué necesitas.',
  newChat: 'Nuevo lenguaje es ambiguo respecto de iniciar una conversación; no concluye corrección o error del kichwa.',
  helloSub: 'La vuelta pierde la solicitud de ayuda y pregunta qué ves de una ciudad. Repetir con nombres reales antes de evaluar los marcadores.',
  placeholder: 'La vuelta afirma conocer a alguien, no invita a preguntar.',
  notice: 'La vuelta habla de ver datos, no del aviso sobre su uso.',
  themeLight: 'La vuelta pide recordar todo, no selecciona apariencia clara.',
  themeDark: 'La vuelta describe belleza y singularidad, no apariencia oscura.',
  attach: 'La vuelta habla de ver y recordar a una persona, no adjuntar archivos.',
  disclaimer: 'La vuelta omite documentos oficiales y revisión de fuentes; no conservar como aviso institucional definitivo.'
};
const rows = [['clave', 'es_original', 'kichwa_propuesto', 'vuelta_es_alki', 'evaluacion_de_la_vuelta', 'observacion', 'alternativa_contextual', 'vuelta_alternativa', 'aprobada']];
for (const item of initial) {
  const alternative = alternatives.find(x => x.key === item.key);
  rows.push([item.key, item.es, item.qu, item.backEs, item.key === 'newChat' ? 'ambigua_requiere_revision' : 'discrepancia_de_intencion', notes[item.key], alternative?.qu ?? '', alternative?.backEs ?? '', 'no']);
}
for (const item of alternatives.filter(x => !initial.some(y => y.key === x.key))) {
  rows.push([item.key, item.es, '', '', 'alternativa_sin_mejora_demostrada', 'La alternativa vuelve como Despertar la palabra, no copiar una respuesta.', item.qu, item.backEs, 'no']);
}
const cell = x => '"' + String(x).replaceAll('"', '""') + '"';
fs.writeFileSync(path.join(base, 'coherencia-revision.csv'), '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n');
fs.writeFileSync(path.join(base, 'coherencia-resumen.json'), JSON.stringify({
  date: '2026-10-22', source: 'https://alki.ec/', initialReverseTests: initial.length,
  contextualAlternatives: alternatives.length, contextualAlternativesAccepted: 0,
  initialReverseDiscrepancies: initial.filter(x => x.key !== 'newChat').length,
  ambiguousInitialResults: initial.filter(x => x.key === 'newChat').length,
  linguisticApprovals: 0, scope: 'Muestra dirigida de botones y bienvenida; no se evaluaron las 101 etiquetas publicadas.',
  limitation: 'Comparar español con la salida inversa detecta discrepancias del sistema; no demuestra por sí solo el significado real de cada frase kichwa ni identifica qué dirección falla.',
  nextStep: 'Contrastar con diccionario y revisión de hablantes, registrando variedad y contexto. No sustituir automáticamente las propuestas ni aceptar por coincidencia superficial.',
  productionChangedByThisAudit: false
}, null, 2) + '\n');
console.log(`Comparación guardada: ${initial.length} vueltas y ${alternatives.length} alternativas; ninguna aprobación lingüística.`);
