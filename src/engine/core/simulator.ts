import { TOOL_NAMES, type ToolEvent, type ToolName } from './types';

export interface SimulatorSamples {
  details: Record<ToolName, string[]>;
  weights?: number[];
}

const DEFAULT_DETAILS: Record<ToolName, string[]> = {
  Read: ['src/engine/core/engine.ts · 262 lines', 'README.md · 96 lines'],
  Edit: ['src/engine/core/mode.ts · 12 - 38', 'src/App.tsx · 44 - 61'],
  Write: ['src/engine/modes/loom/atelier/textile.ts · +64 lines', 'public/notes/weave.md · +21 lines'],
  Bash: ['npm run build · exit 0 · 3.4 s', 'node scripts/verify.mjs · pass'],
  Search: ['grep "mode" src · 14 matches', 'find . -name "*.ts" · 21 files'],
};

/** Deterministic simulated agent feed: idle / single / burst / think phases.
 * The host can replace it at any time with real events via `inject()`. */
export class AgentSimulator {
  private seed = 7;
  private timer = 2.4;
  private running = false;
  private paused = false;
  private id = 0;
  private phase: 'idle' | 'single' | 'burst' | 'think' = 'idle';
  private burstLeft = 0;

  constructor(
    private readonly onEvent: (e: ToolEvent) => void,
    private readonly samples: SimulatorSamples = { details: DEFAULT_DETAILS },
  ) {}

  start(): void { this.running = true; this.paused = false; this.timer = 1.2; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; this.running = true; this.timer = Math.min(this.timer, 0.8); }
  stop(): void { this.running = false; this.phase = 'idle'; this.burstLeft = 0; }

  update(dt: number): void {
    if (!this.running || this.paused) return;
    this.timer -= dt;
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
    const weights = this.samples.weights ?? [30, 25, 18, 15, 12];
    const r = this.rand() * 100;
    let acc = 0;
    let type: ToolName = 'Read';
    for (let i = 0; i < TOOL_NAMES.length; i++) {
      acc += weights[i];
      if (r <= acc) { type = TOOL_NAMES[i]; break; }
    }
    const pool = this.samples.details[type];
    const detail = pool[Math.floor(this.rand() * pool.length)];
    this.id += 1;
    this.onEvent({ id: this.id, type, detail, at: performance.now() });
  }
}
