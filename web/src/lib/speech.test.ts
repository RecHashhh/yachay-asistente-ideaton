import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeRoute, listenOnce, parseCommand, speak, stopSpeaking, toSpeech } from './speech';
import { publicVoiceUrl, voiceMapLink } from './voiceActions';
import type { Procedure } from './types';

afterEach(() => { stopSpeaking(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('voice cancellation', () => {
  it.each(['es', 'en'] as const)('settles %s speech even if browser cancel emits no event, without restarting the queue', async lang => {
    vi.useFakeTimers();
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    const pending = speak('First sentence. Second sentence.', lang, { rate: 1, autoListen: true });
    expect(synth.speak).toHaveBeenCalledTimes(1);
    stopSpeaking();
    await pending;
    await vi.advanceTimersByTimeAsync(30000);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
  it('ignores late recognition results after abort', async () => {
    const instances: any[] = [];
    class Recognition {
      onend = () => undefined;
      onresult: (event: unknown) => void = () => undefined;
      constructor() { instances.push(this); }
      start() {}
      stop() {}
      abort() { this.onend(); }
    }
    vi.stubGlobal('window', { SpeechRecognition: Recognition });
    const interim = vi.fn();
    const listener = listenOnce('es', interim);
    listener.abort();
    instances[0].onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'late question' }], { isFinal: true })] });
    expect(await listener.done).toBe('');
    expect(interim).not.toHaveBeenCalled();
  });
});

describe('useful spoken responses', () => {
  const procedure: Procedure = { title: 'Test procedure', summary: 'Verified summary', office: 'Test office', documents: ['Test document'],
    steps: [{ title: 'First official action' }, { title: 'Second official action' }],
    source: { docId: 'test', title: 'Test source', snippet: '', version: 'v1', url: 'https://example.edu/document.pdf' } };
  it.each(['es', 'en', 'qu'] as const)('announces real links and procedure controls in %s', lang => {
    const spoken = toSpeech({ procedure, map: { destino: 'biblioteca', lat: 0.4, lon: -78.1 } }, lang, '', '');
    expect(spoken.intro).toContain('Google Maps');
    expect(spoken.intro).toContain('Test document');
    expect(spoken.steps).toHaveLength(2);
    expect(spoken.steps[0]).toContain('1/2');
    expect(spoken.outro).toContain('Test source');
  });
  it('does not turn schematic coordinates into walking instructions', () => {
    expect(describeRoute({ destino: 'biblioteca', origen: 'entrada' }, 'es')).not.toMatch(/camina|noreste|junto a/);
    expect(voiceMapLink({ map: { destino: 'biblioteca' } })).toBeUndefined();
  });
  it('rejects unsafe links and invalid coordinates', () => {
    expect(publicVoiceUrl('javascript:alert(1)')).toBeUndefined();
    expect(voiceMapLink({ map: { destino: 'test', lat: 200, lon: 20 } })).toBeUndefined();
    expect(voiceMapLink({ map: { destino: 'test', mapsUrl: 'https://unrelated.example/' } })).toBeUndefined();
  });
  it.each([['siguiente', 'next'], ['next step', 'next'], ['katina', 'next'], ['mapa', 'map'], ['source', 'source'], ['harkana', 'stop']])('supports command %s', (text, command) => {
    expect(parseCommand(text, 0)).toBe(command);
  });
});
