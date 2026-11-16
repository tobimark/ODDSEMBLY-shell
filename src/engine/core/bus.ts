import {
  emptyCounts,
  emptyHud,
  type EngineState,
  type EngineStatus,
  type ModeHud,
  type ModeId,
  type ToolEvent,
} from './types';

type Listener = (s: EngineStatus) => void;

/** Single source of truth for React (and capture tooling). Pixi never reads it
 * for animation: modes own their own clocks so the canvas can run deterministically. */
export class EventBus {
  private listeners = new Set<Listener>();
  status: EngineStatus;

  constructor(modeId: ModeId, modeLabel: string) {
    this.status = {
      state: 'idle',
      modeId,
      modeLabel,
      events: 0,
      rate15s: 0,
      counts: emptyCounts(),
      lastEvent: null,
      recent: [],
      muted: false,
      speed: 1,
      fps: 0,
      time: 0,
      hud: emptyHud(),
      replay: null,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  patch(p: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...p };
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  setHud(hud: ModeHud): void {
    this.patch({ hud });
  }

  emitEvent(e: ToolEvent): void {
    const s = this.status;
    s.events += 1;
    s.counts[e.type] += 1;
    s.lastEvent = e;
    s.recent = [e, ...s.recent].slice(0, 6);
    this.patch({});
  }

  setState(state: EngineState): void {
    this.patch({ state });
  }

  private snapshot(): EngineStatus {
    const s = this.status;
    return {
      ...s,
      counts: { ...s.counts },
      recent: [...s.recent],
      hud: { ...s.hud, fields: [...s.hud.fields] },
      replay: s.replay ? { ...s.replay } : null,
    };
  }
}
