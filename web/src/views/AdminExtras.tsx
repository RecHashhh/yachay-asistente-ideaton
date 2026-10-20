import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { controlSize, runControl, type ControlResult } from '../lib/api';

// ---------------------------------------------------------------------------
// Validación: set de preguntas de control con respuesta conocida
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

export function Validation() {
  const [res, setRes] = useState<ControlResult[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const total = controlSize();

  const m = useMemo(() => {
    if (!res) return null;
    const answerable = res.filter((r) => r.expect !== 'no_se');
    const refusals = res.filter((r) => r.expect === 'no_se');
    const ms = res.map((r) => r.ms);
    return {
      accuracy: pct(res.filter((r) => r.ok).length, res.length),
      grounded: pct(answerable.filter((r) => r.ok).length, answerable.length),
      refusal: pct(refusals.filter((r) => r.ok).length, refusals.length),
      halluc: res.filter((r) => r.hallucination).length,
      es: pct(res.filter((r) => r.lang === 'es' && r.ok).length, res.filter((r) => r.lang === 'es').length),
      en: pct(res.filter((r) => r.lang === 'en' && r.ok).length, res.filter((r) => r.lang === 'en').length),
      p50: pctl(ms, 50), p95: pctl(ms, 95),
    };
  }, [res]);

  const run = async () => { setRes(null); setProgress(0); setRes(await runControl(setProgress)); setProgress(null); };

  return (
    <>
      <header>
        <div><h2>Validación de veracidad</h2><p>Preguntas con respuesta conocida: cada una debe citar el documento correcto, o decir "no sé" si no está en las fuentes.</p></div>
        <span className="sp" />
        <button className="btn primary" onClick={run} disabled={progress !== null}>{progress !== null ? `Evaluando ${progress}/${total}` : res ? 'Volver a evaluar' : `Evaluar ${total} preguntas`}</button>
      </header>
      {progress !== null && <div className="progress"><i style={{ transform: `scaleX(${progress / total})` }} /></div>}
      {m && (
        <motion.div className="kpis" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="kpi"><b>{m.accuracy} %</b><span>exactitud total</span></div>
          <div className="kpi"><b>{m.grounded} %</b><span>citan la fuente correcta</span></div>
          <div className="kpi"><b>{m.refusal} %</b><span>"no sé" cuando corresponde</span></div>
          <div className="kpi"><b>{m.halluc}</b><span>respuestas sin fuente (alucinaciones)</span></div>
          <div className="kpi"><b>{m.es} / {m.en} %</b><span>exactitud español / inglés</span></div>
          <div className="kpi"><b>{(m.p50 / 1000).toFixed(1)} s</b><span>latencia p50 · p95 {(m.p95 / 1000).toFixed(1)} s</span></div>
        </motion.div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Pregunta</th><th>Idioma</th><th>Esperado</th><th>Obtenido</th><th>Resultado</th></tr></thead>
          <tbody>
            {(res ?? []).map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.id}</td>
                <td>{r.q}</td>
                <td className="mono">{r.lang.toUpperCase()}</td>
                <td className="mono">{r.expect === 'no_se' ? 'no sé' : r.expect}</td>
                <td className="mono">{r.got === 'no_se' ? 'no sé' : r.got || '(sin fuente)'}</td>
                <td><span className={`st ${r.ok ? 'indexado' : 'error'}`}>{r.ok ? 'Correcta' : r.hallucination ? 'Alucinación' : 'Incorrecta'}</span></td>
              </tr>
            ))}
            {!res && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>Pulsa “Evaluar” para correr el set de control.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">Con datos de ejemplo, el resultado mide el simulador, no un modelo real. El set definitivo se arma con los documentos del Día 1: al menos 100 preguntas por mitades en español e inglés, y un 20 % que deben responderse con "no sé".</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Costo computacional: calculadora con supuestos explícitos
// ---------------------------------------------------------------------------

/** Precios por millón de tokens (USD), API de Anthropic, consultados el 2026-10-20. Verificar antes de publicar. */
const MODELS = {
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', in: 0.1, out: 0.5, cacheRead: 0.01 /* estimado 0,1× entrada */ },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', in: 2, out: 10, cacheRead: 0.2 },
} as const;
type ModelId = keyof typeof MODELS;

interface Assumptions {
  students: number;
  queriesPerStudentDay: number;
  peakFactor: number;
  cacheHit: number;
  answerModel: ModelId;
  sysTokens: number;
  chunks: number;
  chunkTokens: number;
  historyTokens: number;
  questionTokens: number;
  outTokens: number;
  routerIn: number;
  routerOut: number;
  infraMonthly: number;
  docs: number;
  chunksPerDoc: number;
  embedDim: number;
}

const DEFAULTS: Assumptions = {
  students: 1800, queriesPerStudentDay: 0.3, peakFactor: 4, cacheHit: 0.3, answerModel: 'claude-haiku-5-5',
  sysTokens: 1500, chunks: 4, chunkTokens: 500, historyTokens: 400, questionTokens: 40, outTokens: 300,
  routerIn: 250, routerOut: 15, infraMonthly: 40, docs: 300, chunksPerDoc: 40, embedDim: 1024,
};

const M = 1_000_000;

function compute(a: Assumptions) {
  const m = MODELS[a.answerModel];
  const h = MODELS['claude-haiku-5-5'];
  const qDay = a.students * a.queriesPerStudentDay;
  const variableIn = a.chunks * a.chunkTokens + a.historyTokens + a.questionTokens;
  // El prefijo fijo (sistema + herramienta + lugares) se lee de caché; se reescribe ~1 vez cada 5 min con tráfico (1,25×).
  const answerCost = (a.sysTokens * m.cacheRead + variableIn * m.in + a.outTokens * m.out) / M;
  const routerCost = (a.routerIn * h.in + a.routerOut * h.out) / M;
  const perMiss = answerCost + routerCost;
  // Un acierto de caché semántica no llama a ningún modelo (solo embedding local + búsqueda).
  const perQuery = (1 - a.cacheHit) * perMiss;
  const cacheWritesDay = 12 * 14; // ~14 h de uso, 12 escrituras por hora
  const cacheWriteMonthly = (cacheWritesDay * a.sysTokens * m.in * 1.25 * 30) / M;
  const llmMonthly = perQuery * qDay * 30 + cacheWriteMonthly;
  const vectors = a.docs * a.chunksPerDoc;
  const storageMb = (vectors * (a.embedDim * 4 + 2048)) / 1024 / 1024; // vector float32 + texto y metadatos (~2 KB)
  const ramMb = storageMb * 1.5 + 1500; // índice HNSW en memoria + modelo de embeddings (~1,5 GB)
  return { qDay, variableIn, answerCost, routerCost, perMiss, perQuery, cacheWriteMonthly, llmMonthly, total: llmMonthly + a.infraMonthly, vectors, storageMb, ramMb, per1000: perQuery * 1000 };
}

const usd = (n: number, d = 2) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export function Cost() {
  const [a, setA] = useState<Assumptions>(DEFAULTS);
  const r = compute(a);
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setA((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Assumptions, label: string, step = 1) => (
    <label className="field"><span>{label}</span><input className="inp mono" type="number" step={step} min={0} value={a[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} /></label>
  );
  const scenarios = [
    { name: 'Normal', f: 1 },
    { name: 'Matrículas (pico)', f: a.peakFactor },
    { name: 'Sin caché semántica', f: 1, noCache: true },
  ].map((s) => {
    const x = compute({ ...a, queriesPerStudentDay: a.queriesPerStudentDay * s.f, cacheHit: s.noCache ? 0 : a.cacheHit });
    return { ...s, ...x };
  });

  return (
    <>
      <header><div><h2>Costo computacional</h2><p>Estimación por consulta y por mes. Cambia cualquier supuesto y el cálculo se actualiza.</p></div></header>
      <div className="kpis">
        <div className="kpi"><b>{usd(r.perQuery, 5)}</b><span>costo de modelo por consulta</span></div>
        <div className="kpi"><b>{usd(r.per1000)}</b><span>por cada 1.000 consultas</span></div>
        <div className="kpi"><b>{Math.round(r.qDay).toLocaleString('es-EC')}</b><span>consultas por día</span></div>
        <div className="kpi"><b>{usd(r.total)}</b><span>total al mes (modelo + infraestructura)</span></div>
      </div>

      <div className="card">
        <b>Supuestos</b>
        <div className="form-grid">
          {num('students', 'Estudiantes')}
          {num('queriesPerStudentDay', 'Consultas por estudiante al día', 0.05)}
          {num('peakFactor', 'Multiplicador en matrículas', 0.5)}
          <label className="field"><span>Acierto de caché semántica (0 a 1)</span><input className="inp mono" type="number" step={0.05} min={0} max={1} value={a.cacheHit} onChange={(e) => set('cacheHit', Math.min(1, Number(e.target.value)))} /></label>
          <label className="field"><span>Modelo que responde</span><select className="inp" value={a.answerModel} onChange={(e) => set('answerModel', e.target.value as ModelId)}>{Object.entries(MODELS).map(([id, x]) => <option key={id} value={id}>{x.name} · ${x.in} / ${x.out} por MTok</option>)}</select></label>
          {num('sysTokens', 'Tokens fijos en caché (sistema + herramientas)', 50)}
          {num('chunks', 'Fragmentos recuperados por consulta')}
          {num('chunkTokens', 'Tokens por fragmento', 50)}
          {num('historyTokens', 'Tokens de historial (resumen + 6 turnos)', 50)}
          {num('outTokens', 'Tokens de respuesta (promedio)', 50)}
          {num('infraMonthly', 'Servidor al mes (USD): API + Postgres/pgvector + embeddings', 5)}
          {num('docs', 'Documentos en la base')}
          {num('chunksPerDoc', 'Fragmentos por documento')}
        </div>
      </div>

      <div className="card cost-formula">
        <b>Cómo se calcula</b>
        <ol className="small">
          <li>Entrada variable = {a.chunks} × {a.chunkTokens} + {a.historyTokens} + {a.questionTokens} = <b className="mono">{r.variableIn.toLocaleString('es-EC')}</b> tokens.</li>
          <li>Respuesta = ({a.sysTokens} × ${MODELS[a.answerModel].cacheRead} + {r.variableIn} × ${MODELS[a.answerModel].in} + {a.outTokens} × ${MODELS[a.answerModel].out}) / 10⁶ = <b className="mono">{usd(r.answerCost, 6)}</b>.</li>
          <li>Router de tema con Haiku 5.5 = ({a.routerIn} × $0.1 + {a.routerOut} × $0.5) / 10⁶ = <b className="mono">{usd(r.routerCost, 6)}</b>.</li>
          <li>Por consulta = (1 − {a.cacheHit}) × {usd(r.perMiss, 6)} = <b className="mono">{usd(r.perQuery, 6)}</b> (un acierto de caché semántica no llama al modelo).</li>
          <li>Mes = {usd(r.perQuery, 6)} × {Math.round(r.qDay)} × 30 + escrituras de caché {usd(r.cacheWriteMonthly)} + servidor {usd(a.infraMonthly)} = <b className="mono">{usd(r.total)}</b>.</li>
          <li>Almacenamiento: {r.vectors.toLocaleString('es-EC')} vectores × ({a.embedDim} × 4 B + 2 KB) ≈ <b className="mono">{r.storageMb.toFixed(0)} MB</b>; memoria del servidor ≈ <b className="mono">{(r.ramMb / 1024).toFixed(1)} GB</b> (índice + modelo de embeddings local en CPU, sin costo por consulta).</li>
        </ol>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Escenario</th><th>Consultas/día</th><th>Por consulta</th><th>Modelo al mes</th><th>Total al mes</th></tr></thead>
          <tbody>{scenarios.map((s) => (
            <tr key={s.name}><td className="t">{s.name}</td><td className="mono">{Math.round(s.qDay).toLocaleString('es-EC')}</td><td className="mono">{usd(s.perQuery, 5)}</td><td className="mono">{usd(s.llmMonthly)}</td><td className="mono">{usd(s.total)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted">Precios de la API de Anthropic por millón de tokens, consultados el 20-10-2026: Haiku 5.5 $0.10 entrada / $0.50 salida (prompts de hasta 100K tokens; la lectura de caché de $0.01 es un estimado de 0,1× la entrada, por confirmar); Sonnet 5.5 $2 / $10 / $0.20. La escritura de caché cuesta 1,25× la entrada y el prefijo mínimo cacheable es de 512 tokens. El costo del servidor es un supuesto: reemplázalo por la cotización real.</p>
    </>
  );
}
