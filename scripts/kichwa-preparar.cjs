// Exporta textos de interfaz, no conversaciones ni corpus institucional.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'web')] }));
const source = fs.readFileSync(path.join(root, 'web/src/lib/i18n.ts'), 'utf8');
const ast = ts.createSourceFile('i18n.ts', source, ts.ScriptTarget.Latest, true);
function dictionary(name) {
  let result;
  for (const statement of ast.statements) if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) {
    if (d.name.getText(ast) !== name) continue;
    let init = d.initializer;
    while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
    if (!ts.isObjectLiteralExpression(init)) throw Error('Diccionario no literal: ' + name);
    result = Object.fromEntries(init.properties.map(p => {
      if (!ts.isPropertyAssignment(p) || (!ts.isStringLiteral(p.initializer) && !ts.isNoSubstitutionTemplateLiteral(p.initializer))) throw Error('Texto no literal en ' + name);
      return [p.name.text ?? p.name.getText(ast), p.initializer.text];
    }));
  }
  if (!result) throw Error('No se encontró ' + name);
  return result;
}
const es = dictionary('es'), en = dictionary('en');
if (process.argv.includes('--current')) { process.stdout.write(JSON.stringify(es)); process.exit(0); }
const out = path.join(root, 'docs/kichwa-alki-2026-10-22'); fs.mkdirSync(out, { recursive: true });
const samplePath = path.join(out, 'muestras.json');
const samples = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, 'utf8')).items : [];
const items = Object.entries(es).map(([key, text]) => {
  const sample = samples.find(s => s.key === key && s.es === text);
  return { key, es: text, en: en[key] ?? '', variables: [...text.matchAll(/\{([\w]+)\}/g)].map(m => m[1]),
    sourceHash: crypto.createHash('sha256').update(text).digest('hex'),
    draft: sample?.qu ?? '', flags: sample?.flags ?? [], status: !text.trim() ? 'sin_texto_origen' : sample ? sample.placeholdersOk ? 'pendiente_revision_humana' : 'variables_no_conservadas' : 'pendiente_traducir',
    reviewedBy: '', reviewedAt: '', approved: false };
});
fs.writeFileSync(path.join(out, 'cola-es-qu.json'), JSON.stringify({ locale: 'qu-EC', scope: 'Interfaz; no traduce respuestas institucionales', items }, null, 2) + '\n');
const cell = x => '"' + String(x).replaceAll('"', '""') + '"';
const rows = [['clave', 'es', 'en', 'propuesta_alki', 'kichwa_revisado', 'estado', 'alertas', 'variables', 'revisado_por', 'fecha', 'aprobada'], ...items.map(s => [s.key, s.es, s.en, s.draft, '', s.status, s.flags.join(','), s.variables.join(','), '', '', 'no'])];
const reviewName = fs.existsSync(path.join(out, 'revision.csv')) && !process.argv.includes('--replace-review') ? 'revision-propuestas.csv' : 'revision.csv';
fs.writeFileSync(path.join(out, reviewName), '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n');
console.log(`Cola preparada: ${items.length} textos, ${items.filter(x => x.draft).length} propuestas. Ninguna activada en la interfaz.`);
