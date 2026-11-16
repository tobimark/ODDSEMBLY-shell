import type { EngineStatus, ToolEvent, ToolName } from './types';
export interface ReplayEvent { at: number; type: ToolName; detail: string }
export interface ReplayFile { name: string; events: ReplayEvent[] }
export async function fetchReplay(url = 'replay/loom-session.json'): Promise<ReplayFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`replay fetch failed: ${res.status}`);
  return (await res.json()) as ReplayFile;
}
/** Transport-aware replay clock: paused time never injects events, speed scales
 * offsets with mechanics, and stop cancels the remaining feed. */
export function scheduleReplay(replay: ReplayFile, inject: (e: ToolEvent) => void, status?: () => EngineStatus): () => void {
  const events = [...replay.events].sort((a,b) => a.at-b.at);
  let elapsed = 0, index = 0, previous = performance.now(), frame = 0, cancelled = false;
  const tick = (now: number) => {
    if (cancelled) return;
    const s = status?.();
    if (s?.state === 'stopped') return;
    if (!s || s.state === 'running') elapsed += Math.min(500, now - previous) * (s?.speed ?? 1);
    previous = now;
    while (index < events.length && events[index].at <= elapsed) {
      const ev = events[index++]; inject({ id: index, type: ev.type, detail: ev.detail, at: now });
    }
    if (index < events.length) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
export type { EngineStatus };
