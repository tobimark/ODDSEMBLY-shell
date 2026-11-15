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
}

/** Critically-ish damped noisy wander helper for gauges. */
export function noise1(seed: number, t: number): number {
  return Math.sin(t * 0.9 + seed * 12.9898) * 0.5 + Math.sin(t * 0.31 + seed * 78.233) * 0.35 + Math.sin(t * 2.1 + seed * 3.7) * 0.15;
}
