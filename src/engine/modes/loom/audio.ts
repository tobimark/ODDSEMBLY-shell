import type { AudioEngine } from '../../core/audio';
import type { ToolEvent } from '../../core/types';

/** Loom sound kit: the beat-up is the only *committed* sound.
 * Nothing is audible when an event merely enters the queue; the reed strike at
 * cloth-commit time is the single audible down-beat, exactly once per pick. */
export class LoomAudio {
  constructor(private readonly engine: AudioEngine) {}

  whir(rpmNorm: number): void {
    this.engine.whir(rpmNorm);
  }

  /** Called from Mechanism.onPick — the same callback that commits the weft row. */
  beat(e: ToolEvent): void {
    this.engine.markBeat(e.id, 'loom-beat');
    this.engine.noise({ dur: 0.055, gain: 0.24, freq: 1200, q: 1, delay: 0 });
    this.engine.tone({ hz: 110, dur: 0.075, gain: 0.12, type: 'triangle' });
    this.engine.tone({ hz: 68, dur: 0.11, gain: 0.07, type: 'sine', delay: 0.008 });
  }

  /** Quiet mechanical tick while the shuttle crosses (not a beat). */
  pick(): void {
    this.engine.noise({ dur: 0.03, gain: 0.03, freq: 2400, q: 2 });
  }
}
