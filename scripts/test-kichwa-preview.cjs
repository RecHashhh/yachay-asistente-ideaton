const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => require(path.join(root, name));
const preview = read('web/src/lib/kichwa.preview.json');
const policy = read('docs/kichwa-alki-2026-10-22/politica-vista-previa.json');
test('Known discrepancies cannot reappear in the generated preview', () => {
  const rejected = read('docs/kichwa-alki-2026-10-22/muestras.json').items;
  for (const key of policy.blockedKeys) {
    if (key in policy.documentedOverrides) assert.equal(preview[key], policy.documentedOverrides[key]);
    else assert.notEqual(preview[key], rejected.find(item => item.key === key)?.qu, key);
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
  if (policy.allowUnreviewedDrafts) for (const [key, value] of Object.entries(es)) {
    if (value.trim()) assert.ok(preview[key]?.trim(), `Falta borrador: ${key}`);
  }
});
test('Visible drafts have recorded provenance and exclude translator meta-responses', () => {
  const catalogue = read('docs/kichwa-alki-2026-10-22/catalogo-documentado.json');
  const documented = new Map(catalogue.entries.map(x => [x.key, x]));
  const samples = read('docs/kichwa-alki-2026-10-22/muestras.json').items;
  const complementary = read('docs/kichwa-alki-2026-10-22/borradores-complementarios.json');
  assert.equal(complementary.approved, false);
  assert.equal(complementary.humanReviewed, false);
  for (const [key, value] of Object.entries(preview)) {
    const recordedDraft = policy.allowUnreviewedDrafts && samples.some(item => item.key === key && item.qu === value);
    const newDraft = policy.allowUnreviewedDrafts && complementary.entries.some(item => item.key === key && item.qu === value);
    assert.ok(documented.has(key) || policy.allowedProposals.includes(key) || recordedDraft || newDraft, key);
    if (documented.has(key)) {
      const item = documented.get(key);
      assert.equal(value, item.qu);
      assert.ok(item.refs.every(ref => ref.page > 0 && ref.document in catalogue.documents));
    }
    assert.doesNotMatch(value, /proporciona el|lo siento|no puedo ayudar/i, key);
  }
});
