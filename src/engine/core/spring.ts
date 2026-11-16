/** Deterministic spring integrator (semi-implicit Euler, substeps for stability). */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  stiffness: number;
  damping: number;
  mass: number;
  private readonly min: number;
  private readonly max: number;

  constructor(value: number, opts: { stiffness?: number; damping?: number; mass?: number; min?: number; max?: number } = {}) {
    this.value = value;
    this.target = value;
    this.stiffness = opts.stiffness ?? 150;
    this.damping = opts.damping ?? 18;
    this.mass = opts.mass ?? 1;
    this.min = opts.min ?? -1e9;
    this.max = opts.max ?? 1e9;
  }

  step(dt: number): void {
    const h = Math.min(dt, 1 / 120);
    const sub = Math.max(1, Math.ceil(h / (1 / 480)));
    const sdt = h / sub;
    for (let i = 0; i < sub; i++) {
      const a = (-this.stiffness * (this.value - this.target) - this.damping * this.velocity) / this.mass;
      this.velocity += a * sdt;
      this.value += this.velocity * sdt;
      if (this.value < this.min) { this.value = this.min; this.velocity *= -0.25; }
      if (this.value > this.max) { this.value = this.max; this.velocity *= -0.25; }
    }
  }

  impulse(v: number): void { this.velocity += v; }
  snap(v: number): void { this.value = v; this.target = v; this.velocity = 0; }
  /** 0..1 settling progress helper for driving other properties */
  get settled(): boolean { return Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-3; }
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, t: number): number => {
  const k = clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t: number): number => Math.pow(clamp(t, 0, 1), 3);
export const easeInOutCubic = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
export const easeOutBack = (t: number, overshoot = 1.35): number => {
  const k = clamp(t, 0, 1) - 1;
  return 1 + (overshoot + 1) * k * k * k + overshoot * k * k;
};

/** Critically-ish damped noisy wander helper for gauges. */
export function noise1(seed: number, t: number): number {
  return Math.sin(t * 0.9 + seed * 12.9898) * 0.5 + Math.sin(t * 0.31 + seed * 78.233) * 0.35 + Math.sin(t * 2.1 + seed * 3.7) * 0.15;
}

/** Time parameter normalised 0..1 for a tween between two engine-time marks. */
export interface Tween {
  t: number;
  dur: number;
  from: number;
  to: number;
  easing: (t: number) => number;
  active: boolean;
  value: number;
}

export function tween(from = 0, to = 1, dur = 0.4, easing = easeOutCubic): Tween {
  return { t: 0, dur, from, to, easing, active: false, value: from };
}

export function stepTween(tw: Tween, dt: number): number {
  if (!tw.active) return tw.value;
  tw.t += dt;
  const k = tw.dur <= 0 ? 1 : clamp(tw.t / tw.dur, 0, 1);
  tw.value = tw.from + (tw.to - tw.from) * tw.easing(k);
  if (k >= 1) tw.active = false;
  return tw.value;
}

export function restartTween(tw: Tween, from: number, to: number, dur: number): void {
  tw.from = from; tw.to = to; tw.dur = dur; tw.t = 0; tw.value = from; tw.active = true;
}

/** Small deterministic PRNG (mulberry32) for card decks and procedural detail. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Keep a value inside a soft range by nudging velocity (used for needles). */
export function springToward(spring: Spring, target: number): void {
  spring.target = target;
}
