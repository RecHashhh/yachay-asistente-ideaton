import { useId, useRef, useState } from 'react';
import { sendTranslationReport, type TranslationReportSaved } from '../lib/api';
import { useT } from '../lib/i18n';

/** Reportar no aprueba traducciones ni modifica la memoria del asistente. */
export function TranslationReport({ messageId, question, answer }: { messageId: string; question: string; answer: string }) {
  const { lang } = useT();
  const en = lang === 'en';
  const [open, setOpen] = useState(false);
  const [fragment, setFragment] = useState('');
  const [correction, setCorrection] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<TranslationReportSaved | null>(null);
  const [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const clean = (text: string) => text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[dato omitido]').replace(/\b\d{10}\b/g, '[dato omitido]');
  const payload = () => ({ messageId, lang: 'qu' as const, question: clean(question.slice(0, 6000)), answer: clean(answer.slice(0, 16000)), fragment: clean(fragment.trim()), correction: clean(correction.trim()) });
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...payload(), ...saved }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `kichwa-reporte-${saved?.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="translation-report" lang={en ? 'en' : 'es'}>
    <button ref={trigger} className="translation-report-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {en ? 'Report translation' : 'Reportar traducción'}
    </button>
    {open && <div id={id} className="fb-panel" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      {saved ? <div role="status">
        <p>{saved.storage === 'local'
          ? (en ? 'Saved in this browser only. Download it to share with the team.' : 'Guardado solo en este navegador. Descárgalo para compartirlo con el equipo.')
          : (en ? 'Report saved for review.' : 'Reporte guardado para revisión.')}</p>
        <p className="small">{en ? 'Your proposal has not been approved or used to train the model.' : 'Tu propuesta no está aprobada ni se utilizó para entrenar el modelo.'}</p>
        <div className="row"><button className="btn sm" onClick={download}>{en ? 'Download report' : 'Descargar reporte'}</button><button className="btn sm ghost" onClick={close}>{en ? 'Close' : 'Cerrar'}</button></div>
      </div> : <form onSubmit={event => {
        event.preventDefault(); if (!fragment.trim() || pending) return;
        setPending(true); setError(false);
        void sendTranslationReport(payload()).then(setSaved).catch(() => setError(true)).finally(() => setPending(false));
      }}>
        <p><b>{en ? 'What seems mistranslated?' : '¿Qué parte parece mal traducida?'}</b></p>
        <label htmlFor={id + '-fragment'}>{en ? 'Phrase to review' : 'Frase que debemos revisar'}</label>
        <textarea id={id + '-fragment'} autoFocus required maxLength={2000} rows={2} value={fragment} onChange={event => setFragment(event.target.value)} />
        <label htmlFor={id + '-correction'}>{en ? 'Suggested correction (optional)' : 'Corrección sugerida (opcional)'}</label>
        <textarea id={id + '-correction'} maxLength={6000} rows={2} value={correction} onChange={event => setCorrection(event.target.value)} />
        <p className="small">{en ? 'Submitting saves this question, answer, phrase and correction. Avoid personal information.' : 'Al enviar se guardan esta pregunta, la respuesta, la frase y tu corrección. Evita incluir datos personales.'}</p>
        {error && <p className="err" role="alert">{en ? 'Could not save the report. Your text is preserved; try again.' : 'No se pudo guardar el reporte. Tu texto se conserva; vuelve a intentarlo.'}</p>}
        <div className="row"><button className="btn sm primary" disabled={pending || !fragment.trim()}>{pending ? (en ? 'Saving…' : 'Guardando…') : (en ? 'Submit report' : 'Enviar reporte')}</button><button type="button" className="btn sm ghost" onClick={close}>{en ? 'Cancel' : 'Cancelar'}</button></div>
      </form>}
    </div>}
  </div>;
}
