import { speechApi } from './kichwaSpeech';

let cancelCurrent = () => undefined as void;
export const serverSpeechSupported = () => !!speechApi && typeof Audio !== 'undefined';
export const stopKichwaSpeech = () => cancelCurrent();

export async function kichwaVoiceAvailable(): Promise<boolean> {
  if (!serverSpeechSupported()) return false;
  try {
    const response = await fetch(`${speechApi}/speech/capabilities`, { signal: AbortSignal.timeout(8000) });
    return response.ok && (await response.json() as { kichwaTts?: boolean }).kichwaTts === true;
  } catch { return false; }
}

/** Small chunks allow playback, bounded server work, and cancellation between phrases. */
export function speechChunks(text: string): string[] {
  const cleaned = text.replace(/\[(?:F|S)\d+\]/g, '').replace(/https?:\/\/\S+/g, '').replace(/[*#`]/g, '').trim();
  const chunks: string[] = [];
  let current = '';
  for (const word of cleaned.split(/\s+/)) {
    if (current.length + word.length + 1 > 220) { if (current) chunks.push(current); current = ''; }
    if (word.length > 220) { for (let i = 0; i < word.length; i += 220) chunks.push(word.slice(i, i + 220)); }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function speakKichwa(text: string, rate: number, onBoundary?: (index: number) => void): Promise<void> {
  stopKichwaSpeech();
  const controller = new AbortController();
  const audio = new Audio();
  let finish: (() => void) | undefined;
  const cancel = () => { controller.abort(); audio.pause(); audio.removeAttribute('src'); finish?.(); };
  cancelCurrent = cancel;
  try {
    for (const [index, chunk] of speechChunks(text).entries()) {
      if (controller.signal.aborted) return;
      const response = await fetch(`${speechApi}/speech/synthesize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunk }), signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { detail?: unknown };
        throw new Error(typeof error.detail === 'string' ? error.detail : 'No se pudo generar la voz Kichwa.');
      }
      const url = URL.createObjectURL(await response.blob());
      try {
        if (controller.signal.aborted) return;
        audio.src = url;
        audio.playbackRate = Math.max(0.6, Math.min(1.8, rate));
        onBoundary?.(index);
        await new Promise<void>((resolve, reject) => {
          finish = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('No se pudo reproducir el audio Kichwa.'));
          void audio.play().catch(reject);
        });
      } finally { finish = undefined; audio.pause(); URL.revokeObjectURL(url); }
    }
  } catch (error) { if (!controller.signal.aborted) throw error; }
  finally { audio.pause(); audio.removeAttribute('src'); if (cancelCurrent === cancel) cancelCurrent = () => undefined; }
}
