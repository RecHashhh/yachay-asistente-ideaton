import { useEffect, useState } from 'react';
import type { Procedure } from './types';

const KEY = 'yt-procedure-progress-v1';
export const PROGRESS_EVENT = 'yachi:procedure-progress';
export interface Preparation { revision: string; documents: number[]; steps: number[]; updatedAt?: number }
const identity = (p: Procedure) => p.id ?? `${p.source.docId}:${p.title}`;
const revision = (p: Procedure) => p.revision ?? `${p.source.version}:${p.documents.length}:${p.steps.length}`;
function all(): Record<string, Preparation> {
  try { const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Preparation> : {}; }
  catch { return {}; }
}
export function readPreparation(p: Procedure): Preparation {
  const saved = all()[identity(p)];
  const valid = (xs: unknown, length: number): number[] => Array.isArray(xs) ? [...new Set(xs.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < length))] : [];
  return saved?.revision === revision(p)
    ? { revision: revision(p), documents: valid(saved.documents, p.documents.length), steps: valid(saved.steps, p.steps.length), updatedAt: saved.updatedAt }
    : { revision: revision(p), documents: [], steps: [] };
}
export function usePreparation(p: Procedure) {
  const [value, setValue] = useState(() => readPreparation(p));
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const update = () => setValue(readPreparation(p)); update();
    window.addEventListener('storage', update); window.addEventListener(PROGRESS_EVENT, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(PROGRESS_EVENT, update); };
  }, [p.id, p.revision, p.source.docId, p.source.version, p.title]);
  const save = (next: Preparation | null) => {
    const items = all();
    if (next) items[identity(p)] = { ...next, updatedAt: Date.now() }; else delete items[identity(p)];
    const limited = Object.fromEntries(Object.entries(items).sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0)).slice(0, 100));
    try { localStorage.setItem(KEY, JSON.stringify(limited)); setSaveError(false); window.dispatchEvent(new Event(PROGRESS_EVENT)); }
    catch { setSaveError(true); setValue(next ?? { revision: revision(p), documents: [], steps: [] }); }
  };
  const toggle = (kind: 'documents' | 'steps', index: number) => {
    const current = saveError ? value : readPreparation(p), xs = current[kind];
    save({ ...current, [kind]: xs.includes(index) ? xs.filter(x => x !== index) : [...xs, index] });
  };
  return { value, saveError, toggle, reset: () => save(null) };
}

export function preparationText(p: Procedure, value: Preparation, lang: string): string {
  const en = lang === 'en';
  const checks = (xs: string[], checked: number[]) => xs.map((x, i) => `${checked.includes(i) ? '[x]' : '[ ]'} ${x}`).join('\n');
  return [p.title, p.summary, '', `${en ? 'Office' : 'Dependencia'}: ${p.office}`,
    `${en ? 'Processing time' : 'Tiempo total'}: ${p.duration || (en ? 'Not specified in the available source' : 'No especificado en la fuente disponible')}`,
    '', en ? 'Documents' : 'Documentos', checks(p.documents, value.documents) || (en ? 'Consult the current call.' : 'Consulta la convocatoria vigente.'),
    '', en ? 'Steps' : 'Pasos', checks(p.steps.map(s => `${s.title}${s.detail ? ': ' + s.detail : ''}`), value.steps),
    '', ...(p.deadlines ?? []).map(d => `${d.title}: ${d.start}${d.end ? ' - ' + d.end : ''}`),
    ...(p.contacts ?? []).map(c => `${c.label}: ${c.email}`), ...(p.links ?? []).map(l => `${l.label}: ${l.url}`), '',
    en ? 'Sources' : 'Fuentes', ...(p.sources ?? [p.source]).map(s => `${s.title} | ${s.version} | ${s.docDate} | ${s.locator ?? ''}${s.url ? '\n' + s.url : ''}`), '',
    en ? 'Personal preparation checklist. This does not submit an application or confirm eligibility or approval.' : 'Lista de preparación personal. No presenta una solicitud ni confirma elegibilidad o aprobación.',
  ].join('\n');
}
