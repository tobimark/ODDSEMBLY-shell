/** Tiny WebAudio synth: mechanical clicks, clacks and a low drive hum. */
export class LoomAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private whirOsc: OscillatorNode | null = null;
  private whirGain: GainNode | null = null;
  muted = false;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.whirOsc = this.ctx.createOscillator();
    this.whirOsc.type = 'sawtooth';
    this.whirOsc.frequency.value = 48;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    this.whirGain = this.ctx.createGain();
    this.whirGain.gain.value = 0;
    this.whirOsc.connect(lp).connect(this.whirGain).connect(this.master);
    this.whirOsc.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  whir(rpmNorm: number): void {
    if (!this.ctx || !this.whirGain || !this.whirOsc) return;
    this.whirGain.gain.setTargetAtTime(0.012 + rpmNorm * 0.035, this.ctx.currentTime, 0.08);
    this.whirOsc.frequency.setTargetAtTime(42 + rpmNorm * 46, this.ctx.currentTime, 0.1);
  }

  play(type: string): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    if (type === 'Bash') {
      this.noise(now, 0.12, 0.28, 900, 120);
      this.tone(now, 74, 0.16, 0.18, 'triangle');
      this.tone(now + 0.02, 118, 0.1, 0.1, 'square');
    } else if (type === 'Write') {
      this.tone(now, 620, 0.08, 0.07, 'sine');
      this.tone(now + 0.05, 880, 0.1, 0.05, 'sine');
      this.noise(now, 0.04, 0.05, 2600, 400);
    } else if (type === 'Edit') {
      this.noise(now, 0.05, 0.08, 1800, 300);
      this.tone(now, 220, 0.06, 0.05, 'triangle');
    } else if (type === 'Read') {
      this.tone(now, 960, 0.05, 0.035, 'sine');
      this.noise(now, 0.02, 0.02, 3200, 800);
    } else {
      this.noise(now, 0.07, 0.05, 2200, 500);
      this.tone(now, 340, 0.05, 0.03, 'sine');
    }
  }

  private tone(t: number, hz: number, dur: number, gain: number, type: OscillatorType): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number, freq: number, q: number): void {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = Math.max(0.4, q / 100);
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }
}
