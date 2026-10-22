import { useState } from 'react';
import type { MapDebug } from '../lib/mapConversation';

interface Props {
  history: MapDebug[];
  examples: string[];
  onExample: (question: string) => void;
  onReset: () => void;
  busy: boolean;
}

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value);
  return <code className="mono">{text === '{}' || text === '[]' || text === undefined ? '—' : text}</code>;
}

export function MapDiagnostics({ history, examples, onExample, onReset, busy }: Props) {
  const [open, setOpen] = useState(false);
  const latest = history[0];

  if (!open) {
    return (
      <button className="map-diag-toggle" onClick={() => setOpen(true)} aria-expanded="false" aria-controls="map-diagnostics">
        Diagnóstico MAP
      </button>
    );
  }

  return (
    <aside id="map-diagnostics" className="map-diag" aria-label="Diagnóstico del modo de pruebas de mapas">
      <header>
        <div>
          <b>Diagnóstico MAP</b>
          <small>Modo de pruebas sin LLM</small>
        </div>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Contraer diagnóstico">×</button>
      </header>

      <div className="map-diag-actions">
        <button className="btn sm" onClick={onReset} disabled={busy}>Reiniciar conversación</button>
        <span className="tag">{history.length} turnos</span>
      </div>

      {latest ? (
        <section className="map-diag-turn" aria-live="polite">
          <h3>Último turno</h3>
          <dl>
            <div><dt>Pregunta</dt><dd>{latest.question}</dd></div>
            <div><dt>Normalizada</dt><dd className="mono">{latest.normalized}</dd></div>
            <div><dt>Intención</dt><dd><span className="tag">{latest.intent}</span></dd></div>
            <div><dt>Entidades</dt><dd><Json value={latest.entities} /></dd></div>
            <div><dt>Estado</dt><dd className="mono">{latest.previousState} → {latest.nextState}</dd></div>
            <div><dt>Destino</dt><dd>{latest.resolvedDestination ?? '—'}</dd></div>
            <div><dt>Origen</dt><dd>{latest.resolvedOrigin ?? '—'}</dd></div>
            <div><dt>Ruta</dt><dd>{latest.routeStatus ?? '—'}</dd></div>
            <div><dt>Navegación</dt><dd>{latest.navigationUrl ? <a href={latest.navigationUrl} target="_blank" rel="noreferrer">Google Maps</a> : '—'}</dd></div>
            {latest.error && <div><dt>Error</dt><dd className="err">{latest.error}</dd></div>}
          </dl>

          <h4>Llamadas</h4>
          {latest.calls.length ? (
            <ul className="map-diag-calls">
              {latest.calls.map((call, index) => (
                <li key={`${call.endpoint}-${index}`}>
                  <span className="mono">{call.method} {call.endpoint}</span>
                  <span className={call.status && call.status < 400 ? 'st indexado' : 'st error'}>{call.status ?? 'network'}</span>
                  <span className="mono">{call.durationMs} ms</span>
                </li>
              ))}
            </ul>
          ) : <p className="small muted">Sin llamadas a la API.</p>}
        </section>
      ) : <p className="small muted">Escribe una pregunta o usa un ejemplo para ver la traza.</p>}

      <section>
        <h3>Preguntas de ejemplo</h3>
        <div className="map-diag-examples">
          {examples.map((question) => (
            <button key={question} className="chip" onClick={() => onExample(question)} disabled={busy}>{question}</button>
          ))}
        </div>
      </section>

      {history.length > 1 && (
        <details className="map-diag-history">
          <summary>Turnos anteriores ({history.length - 1})</summary>
          <ol>
            {history.slice(1).map((turn, index) => (
              <li key={`${turn.question}-${index}`}>
                <b>{turn.question}</b>
                <span className="mono">{turn.previousState} → {turn.nextState}</span>
                <span className="small muted">{turn.intent} · {turn.calls.length} llamadas</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </aside>
  );
}
