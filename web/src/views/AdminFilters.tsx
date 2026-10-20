import { useEffect, useState } from 'react';
import { checkFilter, listFilters, saveFilter, testFilters, type FilterCategory, type FilterCheck, type FilterTerm, type FilterTest } from '../lib/api';

const CATS: { id: FilterCategory; label: string; help: string }[] = [
  { id: 'crisis', label: 'Crisis', help: 'Autolesión o riesgo de vida. Yachi responde con un mensaje fijo: ECU 911 y Psicología/Bienestar. No se guarda el texto.' },
  { id: 'denuncia', label: 'Acoso y violencia', help: 'Nunca se trata como insulto. Yachi ofrece la Consejería de Derechos y responde con los documentos. No se guarda el texto.' },
  { id: 'manipulacion', label: 'Manipulación', help: 'Intentos de cambiar las reglas del asistente o ver sus instrucciones internas.' },
  { id: 'profanidad', label: 'Groserías', help: 'Solo el insulto sin consulta recibe el aviso de respeto. Si hay una pregunta real, se responde sin la grosería.' },
  { id: 'fuera_de_dominio', label: 'Fuera del ámbito', help: 'Temas ajenos a la universidad (clima, chistes, cripto…). Usa frases precisas para no bloquear consultas válidas.' },
  { id: 'permitido', label: 'Nunca filtrar', help: 'Identidad, salud sexual y salud mental: se retiran antes de revisar las otras listas para no discriminar ni impedir consultas.' },
];

const KIND: Record<string, string> = {
  normal: 'Consulta normal (va a la búsqueda)', crisis: 'Crisis', denuncia: 'Acoso o violencia', manipulacion: 'Manipulación', respeto: 'Insulto',
  saludo: 'Saludo', cierre: 'Despedida o agradecimiento', vacio: 'Sin contenido', confesionario: 'Confesionario (no es canal oficial)', fuera_de_dominio: 'Fuera del ámbito',
};

/** Listas de filtros editables, prueba de una frase y casos de prueba (falsos positivos y negativos). */
export function Filters() {
  const [terms, setTerms] = useState<FilterTerm[]>([]);
  const [cat, setCat] = useState<FilterCategory>('profanidad');
  const [draft, setDraft] = useState('');
  const [probe, setProbe] = useState('');
  const [check, setCheck] = useState<FilterCheck | null>(null);
  const [test, setTest] = useState<FilterTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => void listFilters().then(setTerms).catch((e: Error) => setErr(e.message));
  useEffect(load, []);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null); setBusy(true);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const add = () => run(async () => {
    if (draft.trim().length < 2) return;
    await saveFilter({ category: cat, term: draft, active: true });
    setDraft(''); setTest(null); load();
  });
  const toggle = (t: FilterTerm) => run(async () => { await saveFilter({ category: t.category, term: t.term, active: !t.active }); setTest(null); load(); });

  const info = CATS.find((c) => c.id === cat)!;
  const shown = terms.filter((t) => t.category === cat);
  const fails = test?.rows.filter((r) => !r.ok) ?? [];

  return (
    <>
      <header>
        <div>
          <h2>Filtros</h2>
          <p>Qué hace Yachi antes de buscar: proteger a quien está en riesgo, no tratar una denuncia como insulto, no dejarse manipular y no bloquear consultas legítimas. Los cambios se aplican en menos de un minuto.</p>
        </div>
      </header>

      {err && <p className="err" role="alert">{err}</p>}

      <section className="card" aria-labelledby="f-probe">
        <h3 id="f-probe">Probar una frase</h3>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (probe.trim()) void run(async () => setCheck(await checkFilter(probe))); }}>
          <label className="field" style={{ flex: 1, minWidth: 220 }}><span>Mensaje de un estudiante</span>
            <input className="inp" value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Ej.: mi profesor me dijo idiota" maxLength={1000} />
          </label>
          <button className="btn primary" style={{ alignSelf: 'flex-end' }} disabled={busy || !probe.trim()}>Probar</button>
        </form>
        {check && (
          <p className="small" role="status">
            <b>{KIND[check.kind ?? check.route] ?? check.kind ?? check.route}</b>
            {check.matched && <> · activado por <span className="tag mono">{check.matched}</span></>}
            {check.sensitive && <> · el texto no se guarda</>}
            {check.question !== probe && <> · se busca como: <i>{check.question}</i></>}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="f-test">
        <div className="row">
          <h3 id="f-test" style={{ margin: 0 }}>Casos de prueba</h3>
          <span className="sp" />
          <button className="btn sm" disabled={busy} onClick={() => void run(async () => setTest(await testFilters()))}>Correr casos</button>
        </div>
        <p className="small muted">Frases reales y difíciles: crisis, denuncias, insultos disfrazados (put@, p u t a), consultas legítimas sobre identidad o salud y datos personales. Córrelos después de editar una lista.</p>
        {test && (
          <>
            <div className="kpis">
              <div className="kpi"><b>{test.ok}/{test.total}</b><span>casos correctos</span></div>
              <div className="kpi"><b>{test.falsosPositivos}/{test.consultasLegitimas}</b><span>consultas legítimas bloqueadas (falsos positivos)</span></div>
              <div className="kpi"><b>{test.falsosNegativos}/{test.casosDeRiesgo}</b><span>crisis, denuncias o insultos que pasaron (falsos negativos)</span></div>
            </div>
            {fails.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Frase</th><th>Esperado</th><th>Obtenido</th></tr></thead>
                  <tbody>{fails.map((r) => <tr key={r.text}><td>{r.text}</td><td>{KIND[r.expect] ?? r.expect}</td><td>{KIND[r.got] ?? r.got}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card" aria-labelledby="f-lists">
        <h3 id="f-lists">Listas</h3>
        <div className="row" role="group" aria-label="Categoría">
          {CATS.map((c) => (
            <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label} <span className="muted">({terms.filter((t) => t.category === c.id && t.active).length})</span>
            </button>
          ))}
        </div>
        <p className="small muted">{info.help} Un <span className="mono">*</span> al final cubre cualquier terminación (<span className="mono">hostig*</span> → hostigar, hostigamiento). Las mayúsculas, tildes, letras repetidas y trucos como «put@» se normalizan solos.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}><span>Agregar a «{info.label}»</span>
            <input className="inp" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} placeholder="palabra o frase" />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} disabled={busy || draft.trim().length < 2}>Agregar</button>
        </form>
        <ul className="filter-terms">
          {shown.map((t) => (
            <li key={t.term}>
              <button className="chip" aria-pressed={t.active} onClick={() => void toggle(t)} disabled={busy}
                title={`${t.active ? 'Activo' : 'Desactivado'} · ${t.updatedBy} · ${new Date(t.updatedAt).toLocaleDateString('es-EC')}. Clic para ${t.active ? 'desactivar' : 'activar'}.`}>
                <span style={t.active ? undefined : { textDecoration: 'line-through' }}>{t.term}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="muted small">Sin términos en esta lista.</li>}
        </ul>
        <p className="small muted">Los términos no se borran: se desactivan, y queda registrado quién y cuándo (trazabilidad).</p>
      </section>
    </>
  );
}
