import { describe, expect, it } from 'vitest';
import { VoiceActivity } from './voiceActivity';

const block = (level: number) => new Float32Array(1600).fill(level);
describe('voice turn endpoint', () => {
  it('waits through a short pause and stops after speech followed by silence', () => {
    const gate = new VoiceActivity();
    for (let i = 0; i < 8; i++) expect(gate.update(block(0.08), 16000)).toBe(false);
    for (let i = 0; i < 6; i++) expect(gate.update(block(0), 16000)).toBe(false);
    for (let i = 0; i < 5; i++) expect(gate.update(block(0.08), 16000)).toBe(false);
    let ended = false;
    for (let i = 0; i < 15; i++) ended ||= gate.update(block(0), 16000);
    expect(ended).toBe(true);
    expect(gate.hasSpeech).toBe(true);
  });
  it('ends an empty recording without treating quiet background as speech', () => {
    const gate = new VoiceActivity();
    let ended = false;
    for (let i = 0; i < 55; i++) ended ||= gate.update(block(0.002), 16000);
    expect(ended).toBe(true);
    expect(gate.hasSpeech).toBe(false);
  });
});
