const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const out = path.resolve('docs/entrega/arquitectura-v2-2026-10-23');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const env = parseEnv(fs.readFileSync('api/.env', 'utf8'));
  const api = 'http://127.0.0.1:8001';
  const login = await fetch(api + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: (env.ADMIN_EMAILS || '').split(',')[0].trim(), password: env.ADMIN_PASSWORD }) });
  if (!login.ok) throw new Error('Admin authentication status ' + login.status);
  const { token } = await login.json();
  const summaryResponse = await fetch(api + '/admin/summary', { headers: { Authorization: 'Bearer ' + token } });
  if (!summaryResponse.ok) throw new Error('Admin summary status ' + summaryResponse.status);
  const summary = await summaryResponse.json();
  const health = await (await fetch(api + '/health')).json();
  const openapi = await (await fetch(api + '/openapi.json')).json();
  const python = `import json,psycopg
from app.config import settings
with psycopg.connect(settings.database_url, autocommit=True) as c:
 c.execute('SET default_transaction_read_only=on')
 tables={name:c.execute('SELECT pg_total_relation_size(%s::regclass)',(name,)).fetchone()[0] for name in ['documents','chunks']}
 db=c.execute('SELECT pg_database_size(current_database())').fetchone()[0]
 dims=c.execute('SELECT vector_dims(embedding) FROM chunks WHERE embedding IS NOT NULL LIMIT 1').fetchone()[0]
 counts=c.execute('SELECT count(*),count(*) FILTER (WHERE embedding IS NOT NULL) FROM chunks').fetchone()
 print(json.dumps({'databaseBytes':db,'tablesIncludingIndexesBytes':tables,'embeddingDimensions':dims,'chunks':counts[0],'embeddedChunks':counts[1],'embeddingModel':settings.embedding_model}))`;
  const storage = JSON.parse(execFileSync(path.resolve('api/.venv/Scripts/python.exe'), ['-c', python], { cwd: path.resolve('api'), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
  const result = { capturedAt: new Date().toISOString(), architectureReference: 'origin/main 789f2be plus explicitly labelled integration work', runtime: { api, health, emailEndpointRegistered: !!openapi.paths['/ingest/email'] }, storage, summary, caveat: 'Saved validation predates email changes; local mixed traffic cost is not an optimized benchmark. Endpoint presence does not establish a configured mailbox or a successful n8n run.' };
  fs.writeFileSync(path.join(out, 'metricas-verificadas.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ capturedAt: result.capturedAt, runtime: result.runtime, storage, lastValidation: summary.lastValidation, realCost: summary.usage?.real }));
})().catch(e => { console.error(e.message); process.exit(1); });
