import type { ModeId, ToolEvent, ToolName } from './types';

export interface ReplayEvent { at: number; type: ToolName; detail: string }
export interface ReplayFile { name: string; mode?: ModeId; events: ReplayEvent[] }

const DEFAULT_FILE: Record<ModeId, string> = {
  loom: 'replay/loom-session.json',
  chips: 'replay/chips-session.json',
  westworld: 'replay/westworld-session.json',
};

export async function fetchReplay(mode: ModeId, url?: string): Promise<ReplayFile> {
  const target = url ?? DEFAULT_FILE[mode];
  const res = await fetch(target);
  if (!res.ok) throw new Error(`replay fetch failed: ${target} (${res.status})`);
  return (await res.json()) as ReplayFile;
}

/**
 * Transport-aware replay clock. Advancing the engine by `dtMs` (already scaled by
 * playback speed) releases every event whose offset is now due. Pausing the engine
 * therefore pauses the replay too, without any requestAnimationFrame coupling —
 * the same class powers real-time playback and deterministic manual stepping.
 */
export class ReplayPlayer {
  private events: ReplayEvent[];
  private index = 0;
  private elapsed = 0;
  readonly name: string;
  readonly total: number;

  constructor(file: ReplayFile) {
    this.name = file.name;
    this.events = [...file.events].sort((a, b) => a.at - b.at);
    this.total = this.events.length;
  }

  /** Advance by milliseconds of replay time and return the due events in order. */
  advance(dtMs: number): ReplayEvent[] {
    if (dtMs > 0) this.elapsed += dtMs;
    const due: ReplayEvent[] = [];
    while (this.index < this.events.length && this.events[this.index].at <= this.elapsed) {
      due.push(this.events[this.index]);
      this.index += 1;
    }
    return due;
  }

  reset(): void { this.index = 0; this.elapsed = 0; }
  get cursor(): number { return this.index; }
  get done(): boolean { return this.index >= this.events.length; }
  get elapsedMs(): number { return this.elapsed; }
}

/** Turn a replay event into an engine event; ids are stable 1..N for verification. */
export function replayToolEvent(ev: ReplayEvent, index: number, at: number): ToolEvent {
  return { id: index + 1, type: ev.type, detail: ev.detail, at };
}
