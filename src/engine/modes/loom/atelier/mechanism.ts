import type { ToolEvent } from '../../../core/types';

const ease = (a: number, b: number, t: number) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
/** One queued tool event makes one complete pick. Every moving part reads this shaft. */
export class Mechanism {
  queue: ToolEvent[] = [];
  active: ToolEvent | null = null;
  phase = 0;
  picks = 0;
  angle = 0;
  direction = 1;
  committed = false;
  onPick: (e: ToolEvent) => void = () => {};
  push(e: ToolEvent) { this.queue.push(e); }
  stop() { this.queue = []; this.active = null; this.phase = 0; this.committed = false; }
  update(dt: number) {
    // Substeps preserve beat/commit ordering even in deterministic large steps.
    let remaining = Math.max(0, dt);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60); remaining -= step;
      if (!this.active && this.queue.length) { this.active = this.queue.shift()!; this.phase = 0; this.committed = false; }
      if (!this.active) continue;
      const advance = Math.min(step / 1.65, 1 - this.phase);
      this.phase += advance; this.angle += advance * Math.PI * 2;
      if (this.phase >= .84 && !this.committed) { this.committed = true; this.picks++; this.onPick(this.active); }
      if (this.phase >= 1 - 1e-8) { this.phase = 0; this.active = null; this.direction *= -1; }
    }
  }
  get shed() { return this.active ? ease(.02, .22, this.phase) * (1 - ease(.57, .72, this.phase)) : 0; }
  get travel() { const t = ease(.24, .57, this.phase); return this.direction > 0 ? t : 1 - t; }
  get beat() { return this.active ? ease(.72, .83, this.phase) * (1 - ease(.86, .99, this.phase)) : 0; }
  get takeup() { return this.active ? ease(.84, .98, this.phase) : 0; }
  get stage() { return !this.active ? 'READY' : this.phase < .24 ? 'SHEDDING' : this.phase < .58 ? 'PICKING' : this.phase < .72 ? 'CLOSING' : this.phase < .87 ? 'BEATING' : 'TAKE-UP'; }
  snapshot() { return { phase: this.phase, picks: this.picks, queued: this.queue.length, active: this.active?.type ?? null, stage: this.stage, shed: this.shed, beat: this.beat, travel: this.travel, angle: this.angle }; }
}
