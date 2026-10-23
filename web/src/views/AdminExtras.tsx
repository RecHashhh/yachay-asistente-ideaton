import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { MOCK, getUsage, type LlmUsage, addControlCase, listControlCases, listInbox, listValidationRuns, replaceControlSet, runControl, updateInbox, type ControlResult, type InboxItem, type ValidationRun } from '../lib/api';
import type { DocMeta } from '../lib/types';

// ---------------------------------------------------------------------------
// Validación: set de preguntas de control con respuesta conocida
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

export function Validation() {
  const [res, setRes] = useState<ControlResult[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [runs, setRuns] = useState<ValidationRun[]>([]);
  const loadRuns = () => void listValidationRuns().then(setRuns).catch(() => setRuns([]));
  useEffect(loadRuns, []);
  useEffect(() => {
    let active = true;
    listControlCases().then((cases) => { if (active) setTotal(cases.length); })
      .catch(() => { if (active) setMsg('No se pudo cargar el set de control. Recarga la página para intentarlo de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);


  const exportCsv = () => {
    if (!res) return;
    const head = 'id;pregunta;idioma;esperado;obtenido;resultado;latencia_ms;respuesta';
    const rows = res.map((r) => [r.id, r.q, r.lang, r.expect, r.got, r.ok ? 'coincide' : r.hallucination ? 'sin_fuente' : 'no_coincide', r.ms, r.answer ?? ''].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';'));
    const blob = new Blob(['\ufeff' + [head, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `validacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** CSV con columnas id;pregunta;idioma;esperado (esperado = id del documento o "no_se"). Separador ; o ,. */
  const importCsv = async (f: File) => {
    setImporting(true); setMsg(null);
    try {
      const text = (await f.text()).replace(/^\ufeff/, '');
      const sep = text.split(/\r?\n/, 1)[0]!.includes(';') ? ';' : ',';
      const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
        else if (c === sep && !quoted) { row.push(cell.trim()); cell = ''; }
        else if ((c === '\n' || c === '\r') && !quoted) {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
        } else cell += c;
      }
      if (quoted) throw new Error('El CSV tiene comillas sin cerrar.');
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      const body = /pregunta|question/i.test(rows[0]?.[1] ?? '') ? rows.slice(1) : rows;
      if (!body.length || body.length > 1000) throw new Error('El CSV debe contener entre 1 y 1000 preguntas.');
      const cases = body.map(([id, q, lang, expect], index) => {
        if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || !q || q.length > 1000 || !expect || expect.length > 500 || !['es', 'en'].includes(lang ?? ''))
          throw new Error(`Fila ${index + 1}: revisa id, pregunta, idioma (es/en) y esperado.`);
        return { id, q, lang: lang as 'es' | 'en', expect };
      });
      if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error('Los identificadores deben ser únicos.');
      await replaceControlSet(cases);
      const saved = await listControlCases();
      setTotal(saved.length); setRes(null);
      setMsg(`Se guardaron ${saved.length} preguntas de control.`);
    } catch (e) { setMsg((e as Error).message || 'No se pudo importar el CSV.'); }
    finally { setImporting(false); }
  };

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

  const run = async () => {
    setRes(null); setMsg(null); setProgress(0);
    try { setRes(await runControl(setProgress)); }
    catch { setMsg('No se pudo completar la evaluación. Vuelve a intentarlo.'); }
    finally { setProgress(null); loadRuns(); }
  };

  return (
    <>
      <header>
        <div><h2>Validación de veracidad</h2><p>Preguntas con respuesta conocida: cada una debe citar el documento correcto, o responder "sin información oficial" si no está en las fuentes.</p></div>
        <span className="sp" />
        <label className="btn">Importar CSV<input type="file" accept=".csv,text/csv" hidden disabled={loading || importing || progress !== null} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} /></label>
        <button className="btn" onClick={exportCsv} disabled={!res}>Exportar resultados</button>
        <button className="btn primary" onClick={run} disabled={loading || importing || total === 0 || progress !== null}>{progress !== null ? `Evaluando ${progress}/${total}` : res ? 'Volver a evaluar' : `Evaluar ${total} preguntas`}</button>
      </header>
      {msg && <p className="small" role="status">{msg}</p>}
      {progress !== null && <div className="progress"><i style={{ transform: `scaleX(${total ? progress / total : 0})` }} /></div>}
      {m && (
        <motion.div className="kpis" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="kpi"><b>{m.accuracy} %</b><span>exactitud total</span></div>
          <div className="kpi"><b>{m.grounded} %</b><span>coinciden con el documento esperado</span></div>
          <div className="kpi"><b>{m.refusal} %</b><span>"sin información" cuando corresponde</span></div>
          <div className="kpi"><b>{m.halluc}</b><span>alertas de respuesta sin fuente</span></div>
          <div className="kpi"><b>{m.es} / {m.en} %</b><span>exactitud español / inglés</span></div>
          <div className="kpi"><b>{(m.p50 / 1000).toFixed(1)} s</b><span>latencia p50 · p95 {(m.p95 / 1000).toFixed(1)} s</span></div>
        </motion.div>
      )}
      {runs.length > 0 && (
        <section className="card" aria-labelledby="historial-validacion">
          <h3 id="historial-validacion">Historial de corridas</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Modelo</th><th>Exactitud</th><th>ES / EN</th><th>"Sin información"</th><th>Aclaración</th><th>Sin fuente</th><th>Latencia p50 / p95</th></tr></thead>
              <tbody>{runs.map((x) => (
                <tr key={x.id}>
                  <td className="small">{new Date(x.at).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="mono small">{x.model}</td>
                  <td className="mono"><b>{x.accuracy ?? '—'} %</b> ({x.ok}/{x.total})</td>
                  <td className="mono">{x.es ?? '—'} / {x.en ?? '—'} %</td>
                  <td className="mono">{x.refusal ?? '—'} %</td>
                  <td className="mono">{x.clarify ?? '—'} %</td>
                  <td className="mono">{x.hallucinations}</td>
                  <td className="mono">{x.p50 != null ? (x.p50 / 1000).toFixed(1) : '—'} / {x.p95 != null ? (x.p95 / 1000).toFixed(1) : '—'} s</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted">Cada corrida queda guardada: sirve para mostrar el efecto de cada cambio (documentos, filtros o prompt) con la misma batería de preguntas.</p>
        </section>
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
                <td className="mono">{r.expect === 'no_se' ? 'sin información' : r.expect === 'aclaracion' ? 'pedir aclaración' : r.expect}</td>
                <td className="mono">{r.got === 'no_se' ? 'sin información' : r.got === 'aclaracion' ? 'pidió aclaración' : r.got || '(sin fuente)'}</td>
                <td><span className={`st ${r.ok ? 'indexado' : 'error'}`}>{r.ok ? 'Correcta' : r.hallucination ? 'Alucinación' : 'Incorrecta'}</span></td>
              </tr>
            ))}
            {!res && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>Pulsa “Evaluar” para correr el set de control.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">{MOCK
        ? 'Con datos de ejemplo, el resultado mide el simulador, no un modelo real.'
        : 'Se evalúa contra el backend real. Sin clave de Anthropic se mide la búsqueda (se muestra el fragmento literal); con clave, cada pregunta que llega al modelo consume tokens (aprox. US$ 0,001 a 0,008).'}{' '}
        Usa «Importar CSV» para cargar o reemplazar el set y «Exportar resultados» para adjuntar la evidencia al paper.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Costo computacional: calculadora con supuestos explícitos
// ---------------------------------------------------------------------------

/** Precios por millón de tokens (USD), API de Anthropic, consultados el 2026-10-20. Verificar antes de publicar. */
const MODELS = {
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', in: 0.1, out: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', in: 2, out: 10, cacheRead: 0.1 },
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
  routerIn: 250, routerOut: 15, infraMonthly: 48, docs: 300, chunksPerDoc: 40, embedDim: 384,
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
  const cacheWritesDay = Math.min(qDay, 12 * 14); // supuesto: una por consulta como máximo, hasta una cada 5 min de tráfico
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
  const [use, setUse] = useState<LlmUsage | null>(null);
  useEffect(() => { void getUsage().then(setUse).catch(() => setUse(null)); }, []);
  const r = compute(a);
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setA((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Assumptions, label: string, step = 1) => (
    <label className="field"><span>{label}</span><input className="inp mono" type="number" step={step} min={0} value={a[k] as number} onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0) as never)} /></label>
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
      {use && <UsageCard u={use} qDay={r.qDay} infra={a.infraMonthly} estimate={r.perQuery} />}
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
          <label className="field"><span>Acierto de caché semántica (0 a 1)</span><input className="inp mono" type="number" step={0.05} min={0} max={1} value={a.cacheHit} onChange={(e) => set('cacheHit', Math.max(0, Math.min(1, Number(e.target.value) || 0)))} /></label>
          <label className="field"><span>Modelo que responde</span><select className="inp" value={a.answerModel} onChange={(e) => set('answerModel', e.target.value as ModelId)}>{Object.entries(MODELS).map(([id, x]) => <option key={id} value={id}>{x.name} · ${x.in} / ${x.out} por MTok</option>)}</select></label>
          {num('sysTokens', 'Tokens fijos en caché (sistema + herramientas)', 50)}
          {num('chunks', 'Fragmentos recuperados por consulta')}
          {num('chunkTokens', 'Tokens por fragmento', 50)}
          {num('historyTokens', 'Tokens de historial (resumen + 6 turnos)', 50)}
          {num('outTokens', 'Tokens de respuesta (promedio)', 50)}
          {num('infraMonthly', 'Servidor al mes (USD): 4 vCPU / 8 GB con API, PostgreSQL + pgvector y embeddings', 1)}
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
            <tr key={s.name}><td className="t">{s.name} <span className="tag">estimado</span></td><td className="mono">{Math.round(s.qDay).toLocaleString('es-EC')}</td><td className="mono">{usd(s.perQuery, 5)}</td><td className="mono">{usd(s.llmMonthly)}</td><td className="mono">{usd(s.total)}</td></tr>
          ))}
          {use?.real?.perQueryUsd != null && [{ name: 'Normal', f: 1 }, { name: 'Matrículas (pico)', f: a.peakFactor }].map((s) => {
            const q = r.qDay * s.f; const llm = use.real!.perQueryUsd! * q * 30;
            return <tr key={`m-${s.name}`}><td className="t">{s.name} <span className="tag">medido</span></td><td className="mono">{Math.round(q).toLocaleString('es-EC')}</td><td className="mono">{usd(use.real!.perQueryUsd!, 5)}</td><td className="mono">{usd(llm)}</td><td className="mono">{usd(llm + a.infraMonthly)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <section className="card" aria-labelledby="reducir-costo">
        <h3 id="reducir-costo">Medidas para reducir el costo del modelo</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Medida</th><th>Estado</th><th>Efecto esperado</th></tr></thead>
            <tbody>
              <tr><td>Rutas sin modelo: saludos, crisis, salud, lugares y aulas, guías de trámite, filtros</td><td><span className="st indexado">Activa</span></td><td className="small">Esas consultas cuestan $0 (en la validación, ~25 % de las preguntas no llamaron al modelo)</td></tr>
              <tr><td>Tope de gasto (<span className="mono">ANTHROPIC_BUDGET_USD</span>) e interruptor <span className="mono">YACHI_LLM</span></td><td><span className="st indexado">Activa</span></td><td className="small">Al alcanzar el tope el chat sigue en modo sin modelo; el gasto nunca supera el presupuesto</td></tr>
              <tr><td>Catálogo compacto para el agente (id, título, descripción breve, vigencia)</td><td><span className="st indexado">Activa</span></td><td className="small">≈ 45 % menos tokens del catálogo, que se reenvía en cada paso del agente</td></tr>
              <tr><td>Caché de prompt en el ciclo del agente y en la redacción</td><td><span className="st indexado">Activa</span></td><td className="small">Lo ya enviado se relee al 10 % del precio de entrada</td></tr>
              <tr><td>Catálogo fijo en el prompt del sistema, compartido entre consultas</td><td><span className="st procesando">Propuesta</span></td><td className="small">La caché se reutiliza entre estudiantes (5 min); elimina una llamada por consulta</td></tr>
              <tr><td>Usar el agente solo si la búsqueda directa no es clara (similitud alta → responder directo)</td><td><span className="st procesando">Propuesta</span></td><td className="small">Las preguntas claras pasan de ~3 llamadas a 1</td></tr>
              <tr><td>Caché de respuestas para preguntas frecuentes (tendencias) con fuentes vigentes</td><td><span className="st procesando">Propuesta</span></td><td className="small">Las preguntas repetidas no vuelven a llamar al modelo</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Detalle, mediciones y metodología en <span className="mono">docs/entrega/costo-computacional.md</span>.</p>
      </section>
      <p className="small muted">Precios de la API de Anthropic por millón de tokens, consultados el 20-10-2026: Haiku 5.5 $0.10 entrada / $0.50 salida / $0.01 lectura de caché (prompts de hasta 100K tokens); Sonnet 5.5 $2 / $10 / $0.10. La escritura de caché (5 min) cuesta 1,25× la entrada y el prefijo mínimo cacheable es de 512 tokens. Fuente: platform.claude.com/docs/en/about-claude/pricing. Servidor: DigitalOcean Droplet Basic 4 vCPU / 8 GB, $48 al mes (digitalocean.com/pricing/droplets, consultado el 20-10-2026); alternativa con base de datos administrada: Droplet 2 vCPU / 4 GB $24 + PostgreSQL administrado $15,15.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bandeja "Sin respuesta": lo que el asistente no supo responder o recibió voto negativo
// ---------------------------------------------------------------------------

const REASON: Record<InboxItem['reason'], string> = { sin_fuente: 'Sin fuente', fuera_de_dominio: 'Fuera del ámbito', voto_negativo: 'Voto negativo', no_verificada: 'Dato no verificado' };
const FB_LABEL: Record<string, string> = { incorrecta: 'Incorrecta', desactualizada: 'Desactualizada', no_responde: 'No responde', confusa: 'Confusa' };

/**
 * Cierra el ciclo de mejora: pregunta sin respuesta → falta un documento (subirlo) → pregunta de control → Validación.
 * Así el set de control crece con preguntas reales de estudiantes, no inventadas.
 */
export function Inbox({ docs, onUpload, onValidate }: { docs: DocMeta[]; onUpload: () => void; onValidate: () => void }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<'nuevo' | 'todos'>('nuevo');
  const [converting, setConverting] = useState<string | null>(null);
  const [expect, setExpect] = useState('no_se');
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => void listInbox().then(setItems);
  useEffect(load, []);

  const shown = items.filter((x) => filter === 'todos' || x.status === 'nuevo').sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
  const count = (r: InboxItem['reason']) => items.filter((x) => x.reason === r && x.status === 'nuevo').length;

  const convert = async (x: InboxItem) => {
    const c = await addControlCase({ q: x.q, lang: x.lang === 'en' ? 'en' : 'es', expect });
    await updateInbox(x.id, { status: 'convertida', controlId: c.id });
    setConverting(null); setExpect('no_se');
    setMsg(`Se creó la pregunta de control ${c.id}. Ya forma parte del set de Validación.`);
    load();
  };
  const discard = async (x: InboxItem) => { await updateInbox(x.id, { status: 'descartada' }); load(); };
  const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <header>
        <div><h2>Sin respuesta</h2><p>Preguntas que el asistente no pudo responder con documentos oficiales o que recibieron un voto negativo. Revísalas: si falta un documento, súbelo; luego conviértelas en preguntas de control.</p></div>
      </header>
      <div className="kpis">
        <div className="kpi"><b>{count('sin_fuente')}</b><span>sin fuente (posible documento faltante)</span></div>
        <div className="kpi"><b>{count('voto_negativo')}</b><span>con voto negativo</span></div>
        <div className="kpi"><b>{count('fuera_de_dominio')}</b><span>fuera del ámbito</span></div>
        <div className="kpi"><b>{count('no_verificada')}</b><span>con datos no verificados en la fuente</span></div>
        <div className="kpi"><b>{items.filter((x) => x.status === 'convertida').length}</b><span>convertidas en preguntas de control</span></div>
      </div>
      <div className="row">
        <button className="chip" aria-pressed={filter === 'nuevo'} onClick={() => setFilter('nuevo')}>Pendientes</button>
        <button className="chip" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>Todas</button>
        <span className="sp" />
        <button className="btn sm" onClick={onUpload}>Subir documento</button>
        <button className="btn sm" onClick={onValidate}>Ir a Validación</button>
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pregunta</th><th>Motivo</th><th>Veces</th><th>Última vez</th><th>Estado</th><th><span className="sr">Acciones</span></th></tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.id}>
                <td><span className="t">{x.q}</span> <span className="tag mono">{x.lang.toUpperCase()}</span>
                  {converting === x.id && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <label className="field" style={{ minWidth: 260 }}><span>Respuesta correcta esperada</span>
                        <select className="inp" value={expect} onChange={(e) => setExpect(e.target.value)}>
                          <option value="no_se">«Sin información oficial» es lo correcto</option>
                          {docs.map((d) => <option key={d.id} value={d.id}>Debe citar: {d.title} ({d.version})</option>)}
                        </select>
                      </label>
                      <button className="btn sm primary" style={{ alignSelf: 'flex-end' }} onClick={() => void convert(x)}>Crear pregunta de control</button>
                      <button className="btn sm ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setConverting(null)}>Cancelar</button>
                    </div>
                  )}
                </td>
                <td>{REASON[x.reason]}{x.details && <div className="small muted">{Object.entries(x.details).map(([k, n]) => `${FB_LABEL[k] ?? k} (${n})`).join(' · ')}</div>}</td>
                <td className="mono">{x.count}</td>
                <td className="small">{fmt(x.lastAt)}</td>
                <td><span className={`st ${x.status === 'nuevo' ? 'procesando' : x.status === 'convertida' ? 'indexado' : 'error'}`}>{x.status === 'nuevo' ? 'Pendiente' : x.status === 'convertida' ? `Convertida (${x.controlId})` : 'Descartada'}</span></td>
                <td>
                  {x.status === 'nuevo' && converting !== x.id && (
                    <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => { setConverting(x.id); setExpect('no_se'); }}>Convertir</button>
                      <button className="btn sm ghost" onClick={() => void discard(x)}>Descartar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>No hay preguntas pendientes. Cuando el asistente no encuentre información oficial, aparecerán aquí.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Gasto real del modelo (tabla llm_usage) frente al tope; el interruptor YACHI_LLM y el tope se configuran en api/.env. */
function UsageCard({ u, qDay, infra, estimate }: { u: LlmUsage; qDay: number; infra: number; estimate: number }) {
  const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
  const pct = u.budgetUsd > 0 ? Math.min(100, (u.spentUsd / u.budgetUsd) * 100) : 0;
  const state = !u.hasKey ? 'Sin clave de Anthropic: el chat responde en modo sin modelo.'
    : !u.llmOn ? 'Clave cargada, pero el modelo está apagado (YACHI_LLM=off): no se gastan tokens.'
      : u.active ? `Modelo activo (${u.model}).` : 'Tope de gasto alcanzado: el chat pasó a modo sin modelo.';
  return (
    <section className="card" aria-labelledby="uso-real">
      <h3 id="uso-real">Uso real del modelo</h3>
      <p className="small" role="status">{state}</p>
      <div className="kpis">
        <div className="kpi"><b>{usd(u.spentUsd)}</b><span>gastado{u.budgetUsd > 0 ? ` de ${usd(u.budgetUsd)} (tope)` : ' (sin tope)'}</span></div>
        <div className="kpi"><b>{u.calls}</b><span>llamadas al modelo</span></div>
        <div className="kpi"><b>{u.real?.modelQueries ?? u.answeredWithModel}</b><span>respuestas redactadas por el modelo{u.real ? ' (período medido)' : ''}</span></div>
        <div className="kpi"><b>{u.real?.perModelAnswerUsd != null ? usd(u.real.perModelAnswerUsd) : '—'}</b><span>costo real por respuesta con modelo</span></div>
      </div>
      {u.budgetUsd > 0 && <div className="progress" role="progressbar" aria-label="Gasto frente al tope" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ transform: `scaleX(${pct / 100})` }} /></div>}
      {u.bySource.length > 0 && <p className="small muted">{u.bySource.map((s) => `${s.source === 'agente' ? 'Agente (elegir documentos)' : s.source === 'redaccion' ? 'Redacción' : s.source}: ${s.calls} llamadas · ${s.inputTokens.toLocaleString('es-EC')} tokens de entrada · ${s.outputTokens.toLocaleString('es-EC')} de salida · ${usd(s.usd)}`).join(' — ')}</p>}
      {u.real?.perQueryUsd != null && (
        <>
          <h3>Proyección con el costo medido</h3>
          <div className="kpis">
            <div className="kpi"><b>{usd(u.real.perQueryUsd)}</b><span>costo real por consulta ({u.real.queries} consultas medidas, {u.real.modelQueries} con modelo)</span></div>
            <div className="kpi"><b>{usd(u.real.perQueryUsd * qDay * 30)}</b><span>modelo al mes con {Math.round(qDay).toLocaleString('es-EC')} consultas/día</span></div>
            <div className="kpi"><b>{usd(u.real.perQueryUsd * qDay * 30 + infra)}</b><span>total al mes con el servidor ({usd(infra)})</span></div>
            <div className="kpi"><b>{estimate > 0 ? `${(u.real.perQueryUsd / estimate).toFixed(1)}×` : '—'}</b><span>medido frente a la estimación de abajo ({usd(estimate)})</span></div>
          </div>
          <p className="small muted">Medido desde {u.real.since ? new Date(u.real.since).toLocaleString('es-EC') : '—'} con los tokens reales de cada llamada (incluye lecturas y escrituras de caché y las decisiones del agente). El promedio incluye las consultas que se responden sin modelo.</p>
        </>
      )}
    </section>
  );
}
