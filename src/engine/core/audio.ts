/** Tiny WebAudio synth + shared master/recording bus.
 * Modes own their sound design; the engine owns the graph, mute state and the
 * recorded beat ledger used by automated audio verification. */

export interface BeatRecord { eventId: number; audioTime: number; wallTime: number; kind: string }

export interface ToneOptions {
  hz: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  delay?: number;
  slide?: number;
  attack?: number;
}

export interface NoiseOptions {
  dur: number;
  gain: number;
  freq: number;
  q?: number;
  delay?: number;
  /** 'bandpass' | 'lowpass' | 'highpass' */
  filter?: BiquadFilterType;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private whirOsc: OscillatorNode | null = null;
  private whirGain: GainNode | null = null;
  muted = false;
  private recording: MediaStreamAudioDestinationNode | null = null;
  readonly beats: BeatRecord[] = [];

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.recording = this.ctx.createMediaStreamDestination();
    this.master.connect(this.recording);

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

  /** Continuous machinery bed, 0..1 (modes call this every frame). */
  whir(level: number): void {
    if (!this.ctx || !this.whirGain || !this.whirOsc) return;
    this.whirGain.gain.setTargetAtTime(level > 0 ? 0.010 + level * 0.032 : 0, this.ctx.currentTime, 0.09);
    this.whirOsc.frequency.setTargetAtTime(42 + level * 46, this.ctx.currentTime, 0.1);
  }

  get now(): number { return this.ctx?.currentTime ?? 0; }
  get state(): string | undefined { return this.ctx?.state; }
  get recordingStream(): MediaStream { this.ensure(); return this.recording!.stream; }

  /** Record the causal instant a mode chooses to sound a beat (audio verification). */
  markBeat(eventId: number, kind: string): void {
    if (!this.ctx) return;
    this.beats.push({ eventId, audioTime: this.ctx.currentTime, wallTime: performance.now(), kind });
    if (this.beats.length > 512) this.beats.shift();
  }

  tone(opts: ToneOptions): void {
    const { hz, dur, gain, type = 'sine', delay = 0, slide = 0, attack = 0.008 } = opts;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, hz + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  chord(hzs: number[], dur: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    hzs.forEach((hz, i) => this.tone({ hz, dur, gain, type, delay: delay + i * 0.012 }));
  }

  noise(opts: NoiseOptions): void {
    const { dur, gain, freq, q = 2, delay = 0, filter = 'bandpass' } = opts;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = filter; bp.frequency.value = freq; bp.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  /** Filtered noise sweep used for steam / release gestures. */
  sweep(fromHz: number, toHz: number, dur: number, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(fromHz, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), t + dur);
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  destroy(): void {
    this.whirOsc?.stop();
    if (this.ctx) void this.ctx.close();
    this.ctx = null; this.master = null; this.whirOsc = null; this.whirGain = null;
  }
}
