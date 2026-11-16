import type { AudioEngine } from '../../core/audio';
import type { CardData, HandResult } from './cards';
import { TOOL_NOTES } from './cards';

/** Chips sound kit: paper, chips, brass printer, bell. */
export class ChipsAudio {
  constructor(private readonly audio: AudioEngine) {}

  /** card lands in a hand slot; this is the causal beat for event n */
  deal(card: CardData): void {
    this.audio.markBeat(card.id, 'chips-deal');
    this.audio.noise({ dur: 0.045, gain: 0.11, freq: 2100, q: 1.4 });
    this.audio.tone({ hz: 190 + card.rank * 22, dur: 0.05, gain: 0.035, type: 'triangle' });
  }

  private pickup(): void {
    this.audio.noise({ dur: 0.03, gain: 0.05, freq: 2800, q: 2 });
  }

  private flip(): void {
    this.audio.noise({ dur: 0.05, gain: 0.07, freq: 1500, q: 1.2 });
  }

  /** combo reveal: name stamped on the table */
  combo(result: HandResult): void {
    this.audio.tone({ hz: 92, dur: 0.09, gain: 0.16, type: 'triangle' });
    this.audio.noise({ dur: 0.08, gain: 0.10, freq: 900, q: 0.8 });
    const base = result.comboMult >= 8 ? 523.25 : result.comboMult >= 4 ? 392 : 329.63;
    this.audio.chord([base, base * 1.25, base * 1.5], 0.5, 0.05, 'sine', 0.06);
  }

  /** score odometer ticks */
  tally(result: HandResult): void {
    this.audio.tone({ hz: 660, dur: 0.06, gain: 0.04, type: 'sine' });
    if (result.comboMult >= 6) this.audio.tone({ hz: 990, dur: 0.09, gain: 0.035, type: 'sine', delay: 0.07 });
  }

  /** printer feeds the settlement ticket */
  print(): void {
    this.audio.noise({ dur: 0.16, gain: 0.08, freq: 1300, q: 4 });
    this.audio.tone({ hz: 240, dur: 0.12, gain: 0.04, type: 'square' });
  }

  cash(): void {
    this.audio.markBeat(900000, 'chips-cash');
    this.audio.chord([523.25, 659.25, 783.99, 1046.5], 0.9, 0.05, 'triangle');
    this.audio.noise({ dur: 0.4, gain: 0.05, freq: 3200, q: 1 });
  }

  tick(): void { this.audio.tone({ hz: 1200, dur: 0.02, gain: 0.015, type: 'square' }); }
  pickupSound(): void { this.pickup(); }
  flipSound(): void { this.flip(); }
  note(type: keyof typeof TOOL_NOTES): string { return TOOL_NOTES[type]; }
}
