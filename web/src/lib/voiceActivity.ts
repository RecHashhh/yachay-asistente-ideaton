/** Conservative energy gate: close a turn after speech followed by 1.3 s of quiet. */
export class VoiceActivity {
  private elapsed = 0;
  private voiced = 0;
  private quiet = 0;
  private noise = 0.003;
  update(samples: Float32Array, sampleRate: number): boolean {
    const seconds = samples.length / sampleRate;
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / Math.max(1, samples.length));
    this.elapsed += seconds;
    const threshold = Math.max(0.012, this.noise * 3);
    if (rms > threshold) { this.voiced += seconds; this.quiet = 0; }
    else {
      this.quiet += seconds;
      this.noise = this.noise * 0.95 + Math.min(rms, 0.01) * 0.05;
    }
    return (this.voiced >= 0.25 && this.quiet >= 1.3) || (this.voiced < 0.25 && this.elapsed >= 5);
  }
  get hasSpeech() { return this.voiced >= 0.25; }
}
