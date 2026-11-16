import type { AudioEngine } from '../../core/audio';
import type { ToolName } from '../../core/types';
import { FAMILY_SPEC } from './machine';

/** Westworld sound kit: steam hiss, valve clunk, pump thump, bell, scanner. */
export class WestworldAudio {
  constructor(private readonly audio: AudioEngine) {}

  /** a tool call reaches its machine; causal beat for the event ledger */
  actuate(eventId: number, family: ToolName): void {
    this.audio.markBeat(eventId, 'ww-actuate');
    const spec = FAMILY_SPEC[family];
    if (family === 'Bash') {
      this.audio.tone({ hz: 74, dur: 0.16, gain: 0.15, type: 'triangle' });
      this.audio.noise({ dur: 0.1, gain: 0.09, freq: 420, q: 0.7 });
    } else if (family === 'Write') {
      this.audio.tone({ hz: 190, dur: 0.14, gain: 0.06, type: 'sine' });
      this.audio.noise({ dur: 0.06, gain: 0.04, freq: 1400, q: 2 });
    } else if (family === 'Search') {
      for (let i = 0; i < 4; i++) this.audio.tone({ hz: 640 + i * 190, dur: 0.035, gain: 0.02, type: 'square', delay: i * 0.05 });
    } else if (family === 'Edit') {
      this.audio.tone({ hz: 120, dur: 0.1, gain: 0.08, type: 'triangle' });
    } else {
      this.audio.noise({ dur: 0.08, gain: 0.05, freq: 2100, q: 1.6 });
      this.audio.tone({ hz: 240, dur: 0.06, gain: 0.03, type: 'sine' });
    }
    void spec;
  }

  valveLift(): void {
    this.audio.noise({ dur: 0.34, gain: 0.12, freq: 2600, q: 0.6 });
    this.audio.tone({ hz: 88, dur: 0.18, gain: 0.12, type: 'triangle' });
  }

  bell(): void {
    this.audio.chord([523.25, 783.99], 1.1, 0.06, 'sine');
    this.audio.tone({ hz: 1046.5, dur: 0.9, gain: 0.05, type: 'sine', delay: 0.04 });
  }

  purge(): void {
    this.audio.noise({ dur: 0.9, gain: 0.14, freq: 800, q: 0.4 });
    this.audio.sweep(320, 60, 0.8, 0.1);
  }

  pump(strength: number): void {
    this.audio.tone({ hz: 56 + strength * 30, dur: 0.1, gain: 0.05 * (0.4 + strength), type: 'triangle' });
  }

  hiss(): void { this.audio.noise({ dur: 0.05, gain: 0.02, freq: 3400, q: 2 }); }
}
