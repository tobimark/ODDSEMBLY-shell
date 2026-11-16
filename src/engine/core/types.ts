/** Core event + status vocabulary shared by every visual mode. */

export type ToolName = 'Read' | 'Edit' | 'Write' | 'Bash' | 'Search';
export const TOOL_NAMES: readonly ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'] as const;

export type ModeId = 'loom';
export type EngineState = 'idle' | 'running' | 'paused' | 'stopped';

/** One real agent tool call, already normalised by the host bridge. */
export interface ToolEvent {
  id: number;
  type: ToolName;
  /** short text shown in mode ledgers, e.g. "src/loom/warp.ts · 34 lines" */
  detail: string;
  /** wall-clock ms when the event entered the engine (not used for replay maths) */
  at: number;
}

export interface ModeMeta {
  id: ModeId;
  /** two-digit catalogue index, e.g. "01" */
  index: string;
  title: string;
  subtitle: string;
  /** short prose used by the header / review notes */
  tagline: string;
}

export type HudTone = 'ink' | 'teal' | 'muted';

export interface HudField {
  label: string;
  value: string;
  tone?: HudTone;
}

/** Everything the React HUD needs from a mode in one immutable snapshot. */
export interface ModeHud {
  /** transport label, e.g. "LIVE WEAVE" */
  transport: string;
  /** short mode-side state, e.g. "SHEDDING" / "RESOLVE" */
  stage: string;
  /** right-hand telemetry columns */
  fields: HudField[];
  /** bottom-left ledger line (usually the latest event) */
  caption: string;
  /** small bottom-right instruction line */
  hint: string;
}

export interface EngineStatus {
  state: EngineState;
  modeId: ModeId;
  modeLabel: string;
  events: number;
  rate15s: number;
  counts: Record<ToolName, number>;
  lastEvent: ToolEvent | null;
  recent: ToolEvent[];
  muted: boolean;
  speed: number;
  /** measured render frames per second (live only) */
  fps: number;
  /** engine clock in seconds; virtual clock in deterministic replays */
  time: number;
  hud: ModeHud;
  /** replay transport (if a replay session is loaded) */
  replay: { loaded: boolean; cursor: number; total: number; done: boolean } | null;
}

export function emptyCounts(): Record<ToolName, number> {
  return { Read: 0, Edit: 0, Write: 0, Bash: 0, Search: 0 };
}

export function emptyHud(): ModeHud {
  return {
    transport: 'STANDBY',
    stage: 'IDLE',
    fields: [],
    caption: '等待事件',
    hint: '',
  };
}
