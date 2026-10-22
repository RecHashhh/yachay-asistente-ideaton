import { useId, useRef, useState } from 'react';
import { sendTranslationReport, type TranslationReportSaved } from '../lib/api';
import { useT } from '../lib/i18n';

/** Reportar no aprueba traducciones ni modifica la memoria del asistente. */
export function TranslationReport({ messageId, question, answer, footer = false }: { messageId: string; question: string; answer: string; footer?: boolean }) {
  const { lang } = useT();
  const en = lang === 'en';
  const qu = lang === 'qu';
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
  return <div className={`translation-report${footer ? ' translation-report-footer' : ''}`} lang={lang === 'qu' ? 'qu-EC' : lang}>
    {footer && <span className="translation-footnote">{lang === 'qu' ? 'Shimita tikrachishkapi pantaykuna tiyayta ushan.' : en ? 'Translations may contain errors.' : 'Las traducciones pueden contener errores.'} </span>}
    <button ref={trigger} className="translation-report-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {lang === 'qu' ? 'Kaypi pantayta willay' : en ? 'Report a problem here' : 'Reportar un problema aquí'}
    </button>
    {open && <div id={id} className="fb-panel" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      {saved ? <div role="status">
        <p>{saved.storage === 'local'
          ? (qu ? 'Kay navegadorllapimi wakaychishka. Mashikunawan rakinakapak uraykachiy.' : en ? 'Saved in this browser only. Download it to share with the team.' : 'Guardado solo en este navegador. Descárgalo para compartirlo con el equipo.')
          : (qu ? 'Rikunapak willay wakaychishka.' : en ? 'Report saved for review.' : 'Reporte guardado para revisión.')}</p>
        <p className="small">{qu ? 'Kay allichinata manarak ari nishkanchu; modelota yachachinkapak mana llamkachishkanchu.' : en ? 'Your proposal has not been approved or used to train the model.' : 'Tu propuesta no está aprobada ni se utilizó para entrenar el modelo.'}</p>
        <div className="row"><button className="btn sm" onClick={download}>{qu ? 'Willayta uraykachina' : en ? 'Download report' : 'Descargar reporte'}</button><button className="btn sm ghost" onClick={close}>{qu ? 'Wichkana' : en ? 'Close' : 'Cerrar'}</button></div>
      </div> : <form onSubmit={event => {
        event.preventDefault(); if (!fragment.trim() || pending) return;
        setPending(true); setError(false);
        void sendTranslationReport(payload()).then(setSaved).catch(() => setError(true)).finally(() => setPending(false));
      }}>
        <p><b>{qu ? '¿Maykan shimita tikrachishkapi pantay tiyan?' : en ? 'What seems mistranslated?' : '¿Qué parte parece mal traducida?'}</b></p>
        <label htmlFor={id + '-fragment'}>{qu ? 'Rikunapak killka' : en ? 'Phrase to review' : 'Frase que debemos revisar'}</label>
        <textarea id={id + '-fragment'} autoFocus required maxLength={2000} rows={2} value={fragment} onChange={event => setFragment(event.target.value)} />
        <label htmlFor={id + '-correction'}>{qu ? 'Allichishka killka (munashpalla)' : en ? 'Suggested correction (optional)' : 'Corrección sugerida (opcional)'}</label>
        <textarea id={id + '-correction'} maxLength={6000} rows={2} value={correction} onChange={event => setCorrection(event.target.value)} />
        <p className="small">{qu ? 'Kachashpaka tapuyta, kutichita, killkata, allichishkatapash wakaychinchik. Kikinpa willayta ama killkaychu.' : en ? 'Submitting saves this question, answer, phrase and correction. Avoid personal information.' : 'Al enviar se guardan esta pregunta, la respuesta, la frase y tu corrección. Evita incluir datos personales.'}</p>
        {error && <p className="err" role="alert">{qu ? 'Willayta mana wakaychiyta ushashkanchu. Killkaka tiyanmi; kutin kachay.' : en ? 'Could not save the report. Your text is preserved; try again.' : 'No se pudo guardar el reporte. Tu texto se conserva; vuelve a intentarlo.'}</p>}
        <div className="row"><button className="btn sm primary" disabled={pending || !fragment.trim()}>{pending ? (qu ? 'Wakaychikuni…' : en ? 'Saving…' : 'Guardando…') : (qu ? 'Willayta kachana' : en ? 'Submit report' : 'Enviar reporte')}</button><button type="button" className="btn sm ghost" onClick={close}>{qu ? 'Sakina' : en ? 'Cancel' : 'Cancelar'}</button></div>
      </form>}
    </div>}
  </div>;
}
