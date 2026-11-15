import type { ToolEvent, ToolName } from './types';

const DETAILS: Record<ToolName, string[]> = {
  Read: [
    'src/engine/loom/warpField.ts · 262 lines',
    'src/engine/loom/frame.ts · 141 lines',
    'README.md · 96 lines',
    'scripts/capture.mjs · 118 lines',
  ],
  Edit: [
    'src/engine/loom/heddleReed.ts · 12 - 38',
    'src/engine/loom/scene.ts · 44 - 61',
    'src/engine/layout.ts · 1 - 12',
    'src/styles.css · 88 - 104',
  ],
  Write: [
    'src/engine/loom/particles.ts · +64 lines',
    'src/engine/anim/spring.ts · +38 lines',
    'public/notes/weave.md · +21 lines',
    'scripts/serve.mjs · +46 lines',
  ],
  Bash: [
    'npm run build · exit 0 · 3.4 s',
    'python scripts/weave_check.py · ok',
    'git diff --stat · 6 files',
    'node scripts/capture.mjs · 4 shots',
  ],
  Search: [
    'grep "heddle" src · 14 matches',
    'grep "spring" src · 22 matches',
    'find . -name "*.ts" · 21 files',
    'grep "106" src · 6 matches',
  ],
};

const TYPES: ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'];
const WEIGHTS = [30, 25, 18, 15, 12];

/** Deterministic-ish simulated agent feed with idle / single / burst / pause phases. */
export class AgentSimulator {
  private seed = 7;
  private timer = 2.4;
  private running = false;
  private paused = false;
  private speed = 1;
  private id = 0;
  private phase: 'idle' | 'single' | 'burst' | 'think' = 'idle';
  private burstLeft = 0;

  constructor(private readonly onEvent: (e: ToolEvent) => void) {}

  start(): void { this.running = true; this.paused = false; this.timer = 1.2; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; this.running = true; this.timer = Math.min(this.timer, 0.8); }
  stop(): void { this.running = false; this.phase = 'idle'; this.burstLeft = 0; }
  setSpeed(s: number): void { this.speed = s; }

  update(dt: number): void {
    if (!this.running || this.paused) return;
    this.timer -= dt * this.speed;
    if (this.timer > 0) return;

    if (this.phase === 'burst' && this.burstLeft > 0) {
      this.emit();
      this.burstLeft -= 1;
      this.timer = this.burstLeft > 0 ? 0.14 + this.rand() * 0.18 : 1.6 + this.rand() * 1.6;
      if (this.burstLeft === 0) this.phase = 'idle';
      return;
    }

    const r = this.rand();
    if (r < 0.52) {
      // burst
      this.phase = 'burst';
      this.burstLeft = 3 + Math.floor(this.rand() * 5);
      this.emit();
      this.burstLeft -= 1;
      this.timer = 0.14 + this.rand() * 0.16;
    } else if (r < 0.78) {
      this.phase = 'single';
      this.emit();
      this.timer = 1.4 + this.rand() * 1.6;
    } else {
      this.phase = 'think';
      this.timer = 1.8 + this.rand() * 2.4;
    }
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private emit(): void {
    const r = this.rand() * 100;
    let acc = 0;
    let type: ToolName = 'Read';
    for (let i = 0; i < TYPES.length; i++) {
      acc += WEIGHTS[i];
      if (r <= acc) { type = TYPES[i]; break; }
    }
    const pool = DETAILS[type];
    const detail = pool[Math.floor(this.rand() * pool.length)];
    this.id += 1;
    this.onEvent({ id: this.id, type, detail, at: performance.now() });
  }
}
