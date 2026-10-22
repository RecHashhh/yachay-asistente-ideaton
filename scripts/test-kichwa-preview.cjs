const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => require(path.join(root, name));
const preview = read('web/src/lib/kichwa.preview.json');
const policy = read('docs/kichwa-alki-2026-10-22/politica-vista-previa.json');
test('Known discrepancies cannot reappear in the generated preview', () => {
  for (const key of policy.blockedKeys) {
    if (key in policy.documentedOverrides) assert.equal(preview[key], policy.documentedOverrides[key]);
    else assert.equal(preview[key], undefined, key);
  }
  assert.ok(preview.newChat); // Una vuelta ambigua no prueba que sea incorrecta.
});
test('Every preview key exists and preserves all placeholders', () => {
  const es = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'kichwa-preparar.cjs'), '--current'], { encoding: 'utf8' }));
  const vars = text => [...text.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort();
  for (const [key, value] of Object.entries(preview)) {
    assert.ok(key in es, key);
    assert.deepEqual(vars(value), vars(es[key]), key);
  }
});
