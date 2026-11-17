/**
 * ODDSEMBLY × OpenCode workbench data contract.
 *
 * ONE source of truth for both sides:
 *   - `server/` (Node, ESM) produces `WorkbenchSnapshot` JSON;
 *   - `src/data/` (browser) consumes it and renders.
 *
 * Rules encoded here (see docs/OPENCODE-WORKBENCH-CONTRACT.md):
 *   1. Every metric is computed server-side, from OpenCode facts, exactly once.
 *      The UI never recomputes a metric a different way.
 *   2. Anything OpenCode cannot provide is `null` plus an entry in
 *      `metrics.unavailable` — never a fabricated number.
 *   3. Identity/dedup keys are OpenCode's own ids (session id, message id,
 *      tool call id). No positional or name-based counting.
 */

/** OpenCode token accounting (TokenUsage.Info in the v2 API). */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export const ZERO_USAGE: TokenUsage = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

/** The five visual primitives the future Game View consumes. */
export type ToolEventKind = 'Read' | 'Edit' | 'Write' | 'Bash' | 'Search';

export type ToolCallStatus = 'running' | 'completed' | 'error' | 'aborted';

export type OpenCodeHealth = 'ok' | 'unreachable' | 'unauthorized' | 'unknown';

export interface HealthView {
  /** Can the bridge reach the OpenCode server at all? */
  opencode: OpenCodeHealth;
  /** State of the bridge -> OpenCode SSE subscription. */
  stream: 'connected' | 'connecting' | 'reconnecting' | 'closed';
  /** bridge -> browser SSE is served by the bridge itself. */
  bridge: 'ok';
  lastEventAt: number | null;
  lastSyncAt: number | null;
  /** True while a full re-sync (session/message/stats) is in flight. */
  resyncing: boolean;
  /** Sanitised message for the status chip. Never contains credentials. */
  error: string | null;
}

export interface SessionView {
  id: string;
  title: string;
  parentID: string | null;
  createdAt: number;
  updatedAt: number;
  outcome: 'succeeded' | 'failed' | 'interrupted' | null;
  busy: boolean;
  model: { id: string; providerID: string } | null;
  /** Agent id chosen for this session; null means OpenCode's default (`build`). */
  agent: string | null;
  tokens: TokenUsage;
  cost: number;
}

export interface ToolCallView {
  /** OpenCode tool call id — the dedup key. */
  id: string;
  sessionID: string;
  /**
   * Id of the assistant message whose `tool` part carries this call.
   * `null` for calls observed live before the message was re-synced.
   * The chat renders a call under its own message only when this matches.
   */
  messageID: string | null;
  /** Raw OpenCode tool name (e.g. "bash", "read", "edit", "write", "grep"). */
  name: string;
  /** Normalised primitive for the future Game View. */
  kind: ToolEventKind;
  /** Human summary: path / command / pattern (already truncated server-side). */
  detail: string;
  status: ToolCallStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  /** Shell exit code when OpenCode reports one. */
  exit: number | null;
  truncated: boolean;
  /** First slice of the tool's textual result (already truncated server-side). */
  output: string | null;
}

/** One entry of `GET /api/fs/list` (path is relative to the session directory). */
export interface FileEntry {
  path: string;
  type: 'file' | 'directory';
}

/** One selectable model from the real OpenCode catalogue. */
export interface ModelOption {
  id: string;
  name: string | null;
  context: number | null;
}

export interface ProviderModels {
  id: string;
  models: ModelOption[];
}

/** `GET /api/models` — the catalogue grouped by provider. */
export interface ModelCatalogue {
  providers: ProviderModels[];
  current: { providerID: string; id: string } | null;
}

/** One selectable primary agent. */
export interface AgentOption {
  id: string;
  name: string;
  description: string | null;
}

/** `GET /api/agents` — selectable agents + the session's current one. */
export interface AgentCatalogue {
  agents: AgentOption[];
  current: { id: string; name: string };
}

/** One agent-advertised `/` command. */
export interface CommandOption {
  name: string;
  description: string | null;
}

/** `GET /api/commands` — the commands the agent advertises for this workspace. */
export interface CommandCatalogue {
  commands: CommandOption[];
  directory: string | null;
}

/** One curated project directory. */
export interface ProjectEntry {
  path: string;
  name: string;
  addedAt: number;
  lastUsedAt: number;
  /** false when the directory has disappeared from disk */
  exists: boolean;
  /** the directory the active session currently lives in */
  current: boolean;
}

/** `GET /api/projects` — the curated list plus the active directory. */
export interface ProjectList {
  current: { path: string; name: string } | null;
  projects: ProjectEntry[];
}

/** One file handed to the in-app preview (`GET /api/file`). */
export interface FilePreviewData {
  path: string;
  size: number;
  /** `text` renders source/preview, `image` a data URL, the rest explain why not. */
  kind: 'text' | 'image' | 'pdf' | 'binary' | 'too-large';
  mime: string | null;
  text?: string;
  base64?: string;
  truncated: boolean;
  lines?: number;
}

export interface MessageView {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'idle';
  text: string;
  /** True while an assistant message is still being streamed. */
  streaming: boolean;
  createdAt: number;
  completedAt: number | null;
  /** Model of an assistant message, when OpenCode reports it. */
  model: { id: string; providerID: string } | null;
  error: string | null;
}

export interface PermissionView {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save: string[];
  message: string | null;
  requestedAt: number;
}

/** A background shell / PTY / job, as shown in card 4. */
export interface ProcessView {
  id: string;
  kind: 'shell' | 'pty' | 'job';
  title: string;
  command: string | null;
  status: string;
  pid: number | null;
  exit: number | null;
  startedAt: number | null;
  elapsedMs: number | null;
  /** Job kind (shell/subagent/image) for `kind === 'job'`. */
  jobKind: string | null;
  sessionID: string | null;
}

export interface MetricCounts {
  /** Sub-agent sessions (children of the active session). */
  agents: number;
  /** Distinct tool names. */
  tools: number;
  /** Distinct tool call ids (deduplicated). */
  calls: number;
  /** Distinct file paths touched by tool inputs. */
  files: number;
  /** Write/Edit-class calls. */
  edits: number;
  /** Cumulative reasoning tokens for the session. */
  think: number;
  /** Cumulative output tokens for the session. */
  output: number;
}

export interface MetricsView {
  counts: MetricCounts;
  tokens: TokenUsage;
  tokensTotal: number;
  /** Tool calls started within the trailing 15 s (integer, wall clock). */
  rate15s: number;
  /** Per-second call counts, oldest -> newest, for the sparkline. */
  rateSeries: number[];
  /** Window length of `rateSeries`, seconds. */
  rateSeriesWindow: number;
  /** Derived, smoothed output tokens/second (0 when idle). */
  tokPerSec: number;
  /** Per-second tok/s trace behind the card ③ curve, oldest -> newest. */
  tokSeries: number[];
  /** Window length of `tokSeries`, seconds. */
  tokSeriesWindow: number;
  /** OpenCode exposes no per-process RSS; always null (rendered as "—"). */
  memoryMB: null;
  /**
   * Tokens that entered the model on the most recent step
   * (`step.ended.tokens.input + cache.read`) — the only honest proxy for
   * context-window occupancy. `contextUsed` is cumulative and may exceed the
   * limit, so it must not be used for a percentage.
   */
  contextWindowUsed: number | null;
  contextUsed: number;
  contextLimit: number | null;
  cost: number | null;
  computedAt: number;
  /** Explicit list of metric keys that could not be sourced (rendered honestly). */
  unavailable: string[];
}

/**
 * Aggregates for the four expanded (full-panel) card views. Derived server-side
 * from the same recorded facts as the cards — one computation point, no guessing.
 */
export interface DetailView {
  /** per-tool call counts, biggest first (工具 × 时间) */
  toolCounts: Array<{ name: string; count: number }>;
  /** busiest 15 s window, calls started in it */
  peak15s: number;
  /** average calls per 15 s over the session */
  mean15s: number;
  /** one bar per session slice, oldest -> newest */
  rateHistory: number[];
  tokPeak: number;
  tokMean: number;
  /** age of the active session at snapshot time */
  sessionMs: number;
}

export interface WorkbenchSnapshot {
  /** Monotonic; the UI can drop out-of-order snapshots. */
  version: number;
  /** Server wall clock when the snapshot was built. */
  serverTime: number;
  health: HealthView;
  activeSessionId: string | null;
  sessions: SessionView[];
  messages: MessageView[];
  toolCalls: ToolCallView[];
  /** Expanded-card aggregates. */
  detail: DetailView;
  metrics: MetricsView;
  processes: ProcessView[];
  permissions: PermissionView[];
  model: { id: string; providerID: string; name: string | null } | null;
  /** Agent the composer would use right now (explicit session choice or default). */
  agent: { id: string; name: string };
  /** Always "OpenCode" today; kept as data so the panel header is not hard-coded. */
  providerLabel: string;
  /** Workspace directory of the active session (sidebar project path). */
  projectDirectory: string | null;
}

/** Empty-state snapshot used before the first fetch resolves. */
export function emptySnapshot(): WorkbenchSnapshot {
  return {
    version: 0,
    serverTime: Date.now(),
    health: {
      opencode: 'unknown',
      stream: 'connecting',
      bridge: 'ok',
      lastEventAt: null,
      lastSyncAt: null,
      resyncing: true,
      error: null,
    },
    activeSessionId: null,
    sessions: [],
    messages: [],
    toolCalls: [],
    detail: { toolCounts: [], peak15s: 0, mean15s: 0, rateHistory: [], tokPeak: 0, tokMean: 0, sessionMs: 0 },
    metrics: {
      counts: { agents: 0, tools: 0, calls: 0, files: 0, edits: 0, think: 0, output: 0 },
      tokens: ZERO_USAGE,
      tokensTotal: 0,
      rate15s: 0,
      rateSeries: [],
      rateSeriesWindow: 30,
      tokPerSec: 0,
      tokSeries: [],
      tokSeriesWindow: 30,
      memoryMB: null,
      contextWindowUsed: null,
      contextUsed: 0,
      contextLimit: null,
      cost: null,
      computedAt: Date.now(),
      unavailable: [],
    },
    processes: [],
    permissions: [],
    model: null,
    agent: { id: 'build', name: 'Build' },
    providerLabel: 'OpenCode',
    projectDirectory: null,
  };
}

/**
 * The frozen event interface for a future Game View (Loom).
 * Exactly the `ToolEvent` shape the Loom engine already consumes
 * (`kunlun-loom/src/engine/core/types.ts`), so integration is a drop-in.
 * Produced by `GET /api/gameview/events` (SSE). This round nothing consumes it.
 */
export interface GameViewToolEvent {
  id: number;
  type: ToolEventKind;
  detail: string;
  at: number;
}

