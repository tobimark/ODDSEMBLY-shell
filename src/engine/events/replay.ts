import type { EngineStatus, ToolEvent, ToolName } from './types';

export interface ReplayEvent { at: number; type: ToolName; detail: string }
export interface ReplayFile { name: string; events: ReplayEvent[] }

export async function fetchReplay(url = 'replay/loom-session.json'): Promise<ReplayFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`replay fetch failed: ${res.status}`);
  return (await res.json()) as ReplayFile;
}

/** Deterministic replay: injects ToolEvents on their recorded offsets. */
export function scheduleReplay(
  replay: ReplayFile,
  inject: (e: ToolEvent) => void,
): () => void {
  const timers: number[] = [];
  replay.events.forEach((ev, i) => {
    timers.push(window.setTimeout(() => {
      inject({ id: i + 1, type: ev.type, detail: ev.detail, at: performance.now() });
    }, ev.at));
  });
  return () => timers.forEach((t) => clearTimeout(t));
}

export type { EngineStatus };
