/** Record bounded PCM WAV locally, then send only to the configured Yachi API. */
const configured = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const api = import.meta.env.DEV && /^https?:\/\//.test(configured) ? '/__yachi_api' : configured;
export const kichwaRecordingSupported = () => !!api && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';

export function listenKichwa(onStatus: (text: string) => void): { done: Promise<string>; stop: () => void; abort: () => void } {
  let stop = () => undefined as void;
  let cancelled = false;
  const controller = new AbortController();
  const done = (async () => {
    if (!kichwaRecordingSupported()) throw new Error('Necesitas conexión con la API y permiso de micrófono.');
    const status = await fetch(`${api}/speech/capabilities`, { signal: controller.signal });
    if (!status.ok || !(await status.json() as { kichwaAsr: boolean }).kichwaAsr) throw new Error('El servidor todavía no tiene instalado el reconocimiento Kichwa.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
    if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return ''; }
    let context: AudioContext;
    try { context = new AudioContext({ sampleRate: 16000 }); }
    catch (error) { stream.getTracks().forEach((t) => t.stop()); throw error; }
    let source: MediaStreamAudioSourceNode | undefined;
    let processor: ScriptProcessorNode | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const parts: Float32Array[] = [];
    let count = 0;
    try {
      await context.resume();
      source = context.createMediaStreamSource(stream);
      // No external worklet/codec; PCM is resampled below if the browser ignores sampleRate.
      processor = context.createScriptProcessor(4096, 1, 1);
      await new Promise<void>((resolve) => {
        stop = resolve;
        if (cancelled) return resolve();
        processor!.onaudioprocess = (event) => {
          const data = event.inputBuffer.getChannelData(0).slice();
          parts.push(data); count += data.length;
          if (count >= context.sampleRate * 15) resolve();
        };
        source!.connect(processor!); processor!.connect(context.destination);
        timer = setTimeout(resolve, 15000);
        onStatus('Grabando Kichwa… pulsa el micrófono para terminar (máximo 15 s).');
      });
    } finally {
      clearTimeout(timer);
      if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
      source?.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await context.close();
    }
    if (cancelled) return '';
    const pcm = new Float32Array(count);
    let offset = 0;
    for (const part of parts) { pcm.set(part, offset); offset += part.length; }
    const frames = Math.min(240000, Math.floor(count * 16000 / context.sampleRate));
    if (frames < 1600) return '';
    const wav = new ArrayBuffer(44 + frames * 2), view = new DataView(wav);
    const str = (at: number, text: string) => [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
    str(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) {
      const sample = Math.max(-1, Math.min(1, pcm[Math.floor(i * context.sampleRate / 16000)] ?? 0));
      view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    onStatus('Transcribiendo Kichwa… revisa el texto antes de enviarlo.');
    const response = await fetch(`${api}/speech/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav, signal: controller.signal });
    const result = await response.json() as { text?: string; detail?: string };
    if (!response.ok) throw new Error(result.detail ?? 'No se pudo transcribir el audio.');
    return result.text ?? '';
  })();
  return { done, stop: () => stop(), abort: () => { cancelled = true; controller.abort(); stop(); } };
}
