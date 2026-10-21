import type { StreamEvent } from './types';

/** Da al navegador oportunidad de pintar entre fragmentos, incluso si todo el SSE llega junto. */
export async function* displayStream(
  source: AsyncIterable<StreamEvent>, signal: AbortSignal, reducedMotion: boolean,
): AsyncGenerator<StreamEvent> {
  for await (const event of source) {
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    if (event.type !== 'token' || reducedMotion || document.hidden) {
      yield event;
      continue;
    }
    // Agrupa palabras; nunca añade, reescribe ni elimina contenido.
    const words = event.text.match(/\S+\s*|\s+/gu) ?? [];
    let part = '';
    for (const word of words) {
      if (part && part.length + word.length > 48) {
        yield { type: 'token', text: part };
        await nextPaint(signal);
        part = '';
      }
      part += word;
    }
    if (part) {
      yield { type: 'token', text: part };
      await nextPaint(signal);
    }
  }
}

function nextPaint(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'));
  if (document.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let frame = 0;
    const clean = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', stop);
      document.removeEventListener('visibilitychange', visible);
    };
    const stop = () => { clean(); reject(new DOMException('Stopped', 'AbortError')); };
    const visible = () => { if (document.hidden) { clean(); resolve(); } };
    signal.addEventListener('abort', stop, { once: true });
    document.addEventListener('visibilitychange', visible);
    frame = requestAnimationFrame(() => { clean(); resolve(); });
  });
}
