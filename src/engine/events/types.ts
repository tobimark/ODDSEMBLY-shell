export type ToolName = 'Read' | 'Edit' | 'Write' | 'Bash' | 'Search';

export interface ToolEvent {
  id: number;
  type: ToolName;
  /** short text shown in the ledger, e.g. "src/loom/warp.ts · 34 lines" */
  detail: string;
  at: number;
}

export interface EngineStatus {
  state: 'idle' | 'running' | 'paused' | 'stopped';
  rpm: number;
  events: number;
  rate15s: number;
  counts: Record<ToolName, number>;
  lastEvent: ToolEvent | null;
  recent: ToolEvent[];
  muted: boolean;
  speed: number;
}

export type Listener = (s: EngineStatus) => void;

export class EventBus {
  private listeners: Listener[] = [];
  status: EngineStatus = {
    state: 'idle', rpm: 0, events: 0, rate15s: 0,
    counts: { Read: 0, Edit: 0, Write: 0, Bash: 0, Search: 0 },
    lastEvent: null, recent: [], muted: false, speed: 1,
  };

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    fn({ ...this.status, recent: [...this.status.recent], counts: { ...this.status.counts } });
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  patch(p: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...p };
    const snap = { ...this.status, recent: [...this.status.recent], counts: { ...this.status.counts } };
    for (const l of this.listeners) l(snap);
  }

  emitEvent(e: ToolEvent): void {
    this.status.events += 1;
    this.status.counts[e.type] += 1;
    this.status.lastEvent = e;
    this.status.recent = [e, ...this.status.recent].slice(0, 5);
    this.patch({});
  }
}
