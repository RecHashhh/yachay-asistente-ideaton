import { useEffect, useState } from 'react';
import { listInquiries, MOCK, updateInquiry, type RegisteredInquiry } from '../lib/api';

export function AdminInquiries() {
  const [items, setItems] = useState<RegisteredInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try { setItems(await listInquiries()); }
    catch { setError('No se pudieron cargar las consultas. Intenta de nuevo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const change = async (code: string, status: RegisteredInquiry['status']) => {
    setSaving(code); setError(null);
    try { await updateInquiry(code, status); setItems(xs => xs.map(x => x.code === code ? { ...x, status } : x)); }
    catch { setError('No se guardó el estado. Intenta de nuevo.'); }
    finally { setSaving(null); }
  };
  return <>
    <header><div><h2>Consultas registradas</h2><p>Últimas 100 consultas vigentes. La atención y el contacto con el estudiante son manuales; cambiar el estado no envía un correo.</p></div><button className="btn" disabled={loading} onClick={() => void load()}>Actualizar</button></header>
    {MOCK && <p role="note">La bandeja requiere el backend real. El simulador no contiene consultas personales.</p>}
    {error && <p className="err" role="alert">{error}</p>}
    {loading ? <p role="status">Cargando consultas…</p> : items.length === 0 ? <p>No hay consultas registradas.</p> : items.map(item => <article className="card" key={item.code}>
      <div className="row"><b>{item.code}</b><span>{item.office}</span><time className="small" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('es-EC')}</time></div>
      <p>{item.question}</p><p className="small">Contacto: {item.email}</p>
      {item.transcript && <details><summary>Conversación adjunta</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.transcript}</p></details>}
      <label className="field"><span>Estado de {item.code}</span><select className="inp" value={item.status} disabled={saving === item.code} onChange={e => void change(item.code, e.target.value as RegisteredInquiry['status'])}>
        <option value="nueva">Nueva</option><option value="en_atencion">En atención</option><option value="resuelta">Resuelta</option>
      </select></label>
    </article>)}
  </>;
}
