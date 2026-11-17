/**
 * Workbench state: dedup, per-session metric windows, full re-sync, snapshot.
 *
 * This is the single source of truth for the browser. It owns:
 *   - the OpenCode session list + the active session selection;
 *   - the active session's messages (from the message API, patched by SSE deltas);
 *   - the active session's tool calls, keyed by OpenCode `call_*` id
 *     (authoritative rebuild from message parts; live events only fill in
 *     unseen ids, so an SSE replay/reconnect can never double count);
 *   - cumulative tokens (Session.Info / usage.updated) — the only counters used
 *     for totals; step.ended only feeds the tok/s EMA delta;
 *   - the per-session rate window + token velocity (reset on session switch);
 *   - running shells / jobs / PTYs, pending permissions, model context limits;
 *   - the monotonically increasing snapshot `version`.
 *
 * Contract: kunlun-shell/docs/OPENCODE-WORKBENCH-CONTRACT.md §4.
 * Shape:    kunlun-shell/src/data/types.ts (WorkbenchSnapshot).
 */

import * as M from './metrics.mjs';
import { modelRef } from './opencode.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Curated project list. This is deliberately NOT `GET /api/project`: OpenCode
 * reports every directory any session has ever used (22 here, including
 * `C:\Users\51159`), while the sidebar must list only directories the user
 * added. The active project is shown by the block itself, not by this list.
 */
const STATE_DIR =
  process.env.BRIDGE_STATE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.state');
const PROJECTS_FILE = path.join(STATE_DIR, 'projects.json');

/** Windows paths compare case-insensitively and with one separator. */
function projectKey(value) {
  return path.resolve(String(value ?? '')).replace(/\//g, '\\').toLowerCase();
}

/**
 * Model used for newly created sessions when the caller does not pass one.
 * Explicit by default so a fresh session can actually run on a free-tier
 * account (some OpenCode defaults are paid and answer 403 provider.auth).
 * Set BRIDGE_MODEL to override; set it to '' to defer to OpenCode's default.
 */
const NEW_SESSION_MODEL = process.env.BRIDGE_MODEL ?? 'opencode/deepseek-v4.1-flash-free';

const CAPS = Object.freeze({
  sessions: 50,
  messages: 120,
  toolCalls: 200,
  processes: 12,
  messageText: 4_000,
});

/** How much of a tool's textual result travels to the browser (the chat card). */
const TOOL_OUTPUT_MAX = 1_200;

const IDLE_RESYNC_MS = 15_000;
const EVENT_RESYNC_DEBOUNCE_MS = 400;
const MODEL_CACHE_TTL_MS = 10 * 60_000;
const AGENT_CACHE_TTL_MS = 5 * 60_000;
const COMMAND_CACHE_TTL_MS = 5 * 60_000;
/** OpenCode's default primary agent when a session carries no explicit choice. */
const DEFAULT_AGENT_ID = 'build';
const PROMPT_RESYNC_DELAY_MS = 800;

const normalizeDir = (dir) =>
  String(dir ?? '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase();

/** Windows-aware same-directory comparison. */
export function sameDirectory(a, b) {
  if (!a || !b) return false;
  return normalizeDir(a) === normalizeDir(b);
}

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
};

const toTimestamp = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeModelRef = (raw) => {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  return { id: raw.id, providerID: typeof raw.providerID === 'string' ? raw.providerID : '' };
};

const truncateText = (text, max = CAPS.messageText) => {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};

const parseJsonSafe = (text) => {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** HTTP-ish error that the server layer turns into a status code. */
export function bridgeError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** Map OpenCode tool state onto the contract status enum. */
function mapToolStatus(status, error) {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return error && error.type === 'aborted' ? 'aborted' : 'error';
    case 'running':
    case 'streaming':
    default:
      return 'running';
  }
}

/**
 * Join a tool part's textual result (`state.content[]`) into one string.
 * Only `type:"text"` parts carry readable output today; anything else is
 * ignored rather than stringified, so the snapshot never embeds JSON blobs.
 */
function toolOutputText(state) {
  const parts = Array.isArray(state?.content) ? state.content : [];
  const text = parts
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
  return text || null;
}

/**
 * OpenCode reports directory entries with the platform separator and a trailing
 * one (`sub\`). The UI needs one canonical form: forward slashes, no trailing
 * separator, so the same string is a stable row key, a `@path` token and a
 * `fs/list?path=` argument.
 */
function normalizeEntryPath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .replace(/^\.\//, '');
}

/**
 * Text preview budget. The reference viewer labels its own truncation as
 * `# lines · first 4 MB`, so the same 4 MiB window is used here; bigger binary
 * payloads (images) are refused instead of being base64'd into the snapshot.
 */
const FILE_TEXT_PREVIEW_MAX = 4 * 1024 * 1024;
const FILE_BINARY_PREVIEW_MAX = 8 * 1024 * 1024;

const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

function extOf(name) {
  const i = String(name ?? '').lastIndexOf('.');
  return i < 0 ? '' : String(name).slice(i + 1).toLowerCase();
}

/** UTF-8 text that contains no NUL byte in its head. */
function looksLikeText(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (const byte of head) if (byte === 0) return false;
  const decoded = bytes.toString('utf8');
  if (!decoded) return true;
  const bad = decoded.split('\uFFFD').length - 1;
  return bad / Math.max(1, decoded.length) < 0.002;
}

export class WorkbenchStore {
  constructor({ client, projectDir, log = () => {} }) {
    this.client = client;
    this.projectDir = projectDir;
    this.log = log;

    this.version = 0;
    this.dirty = true;

    /** Raw OpenCode Session.Info objects (authoritative for the list). */
    this.sessionsRaw = [];
    /** sessionID -> location.directory (views do not expose it). */
    this.sessionDirs = new Map();

    this.activeSessionId = null;
    this.activeDir = null;

    /** id -> internal message record */
    this.messages = new Map();
    /** id -> internal tool-call record (carries `input`; never serialised) */
    this.toolCalls = new Map();
    this.childCount = 0;

    this.tokens = M.emptyUsage();
    this.cost = null;
    /**
     * Tokens that entered the model on the last completed step
     * (`input + cache.read`). This is the only honest proxy for context-window
     * occupancy; cumulative `tokens` may exceed the window and must not be used
     * for a percentage.
     */
    this.lastStepTokens = null;
    this.outcome = null;
    /** sessionID -> boolean busy override from lifecycle events */
    this.busy = new Map();

    /** `${providerID}:${modelID}` -> { id, providerID, name, context } */
    this.models = new Map();
    this.modelsAt = 0;
    this.agents = new Map();
    this.agentsAt = 0;
    this.commands = [];
    this.commandsAt = 0;
    /** curated project list, lazily read from `.state/projects.json` */
    this.projects = null;

    /** id -> Shell.Info */
    this.shells = new Map();
    /** id -> Pty */
    this.ptys = new Map();
    this.jobs = [];

    /** id -> PermissionView */
    this.permissions = new Map();

    /** cumulative output-token history [{at, cum}] for the card ③ rate + curve */
    this.tokHistory = M.emptyTokState();

    this.health = {
      opencode: 'unknown',
      stream: 'connecting',
      bridge: 'ok',
      lastEventAt: null,
      lastSyncAt: null,
      resyncing: false,
      error: null,
    };

    /** Queued Game View events ({id,type,detail,at}), drained by the server. */
    this.gameview = [];
    this.gameviewSeq = 0;
    this.gameviewEmitted = new Set();

    this._resyncing = false;
    this._resyncQueued = false;
    this._resyncTimer = null;
    this._idleTimer = null;
    this._switchToken = 0;
    this._bootSelectDone = false;
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  start() {
    this._idleTimer = setInterval(() => {
      if (this._resyncing) return;
      const lastEvent = this.health.lastEventAt ?? 0;
      if (Date.now() - lastEvent > IDLE_RESYNC_MS) this.resync('idle');
    }, IDLE_RESYNC_MS);
    this._idleTimer.unref?.();
  }

  async dispose() {
    if (this._idleTimer) clearInterval(this._idleTimer);
    if (this._resyncTimer) clearTimeout(this._resyncTimer);
    this._idleTimer = null;
    this._resyncTimer = null;
  }

  setStreamState(state) {
    this.health.stream = state;
    this.dirty = true;
  }

  markDirty() {
    this.dirty = true;
  }

  // ---------------------------------------------------------------------
  // Full re-sync (boot, SSE reconnect, session switch, ~15 s idle)
  // ---------------------------------------------------------------------

  async resync(reason = 'manual') {
    if (this._resyncing) {
      this._resyncQueued = true;
      return;
    }
    this._resyncing = true;
    this.health.resyncing = true;
    this.dirty = true;
    const token = this._switchToken;

    try {
      const listDirectory = (this.activeSessionId && this.#directoryOf(this.activeSessionId)) || this.projectDir;
      const sessionsResult = await this.#safe(() =>
        this.client.listSessions({ limit: CAPS.sessions, order: 'desc', directory: listDirectory }),
      );
      if (token !== this._switchToken) return;
      if (!sessionsResult.ok) {
        this.#degradeHealth(sessionsResult.error);
        return;
      }
      this.#applySessionList(sessionsResult.data);
      this.#raiseHealthOk();

      // Boot selection (contract addition from the Lead): no auto-create, pick the
      // most recently updated session whose location is BRIDGE_PROJECT_DIR.
      if (!this._bootSelectDone) {
        this._bootSelectDone = true;
        if (!this.activeSessionId) {
          const candidate = this.sessionsRaw
            .filter((session) => sameDirectory(session?.location?.directory, this.projectDir))
            .sort((a, b) => toTimestamp(b?.time?.updated) - toTimestamp(a?.time?.updated))[0];
          if (candidate) {
            this.activeSessionId = candidate.id;
            this.activeDir = candidate.location.directory;
          }
        }
      }

      const active = this.activeSessionId;
      if (!active) {
        this.#clearSessionDerived();
        this.health.lastSyncAt = Date.now();
        return;
      }

      const activeDir = this.#directoryOf(active) || this.projectDir;
      const [
        sessionInfoResult,
        messagesResult,
        sessionPermissionsResult,
        locationPermissionsResult,
        shellsResult,
        ptysResult,
        jobsResult,
        childrenResult,
        modelsResult,
      ] = await Promise.all([
        this.#safe(() => this.client.getSession(active)),
        this.#safe(() => this.client.listMessages(active, { limit: CAPS.messages, order: 'asc' })),
        this.#safe(() => this.client.sessionPermissions(active)),
        this.#safe(() => this.client.listPermissions(activeDir)),
        this.#safe(() => this.client.listShell(activeDir)),
        this.#safe(() => this.client.listPty(activeDir)),
        this.#safe(() => this.client.listJobs(active)),
        this.#safe(() => this.client.listSessions({ limit: 100, order: 'desc', parentID: active })),
        this.#safe(() => this.#refreshModelsIfStale(activeDir)),
        this.#safe(() => this.#refreshAgentsIfStale(activeDir)),
      ]);
      if (token !== this._switchToken) return;

      if (sessionInfoResult.ok && sessionInfoResult.data) {
        this.#applySessionInfo(sessionInfoResult.data);
      } else if (sessionInfoResult.error?.kind === 'notfound') {
        this.activeSessionId = null;
        this.activeDir = null;
        this.#clearSessionDerived();
        this.health.lastSyncAt = Date.now();
        return;
      }

      if (messagesResult.ok) {
        this.#applyMessages(asArray(messagesResult.data), active);
      }
      if (childrenResult.ok) {
        this.childCount = asArray(childrenResult.data).length;
      }
      if (sessionPermissionsResult.ok || locationPermissionsResult.ok) {
        this.#applyPermissionsFromApi([
          ...asArray(sessionPermissionsResult.ok ? sessionPermissionsResult.data : []),
          ...asArray(locationPermissionsResult.ok ? locationPermissionsResult.data : []),
        ]);
      }
      if (shellsResult.ok) this.#applyShellList(asArray(shellsResult.data), activeDir, active);
      if (ptysResult.ok) this.#applyPtyList(asArray(ptysResult.data));
      if (jobsResult.ok) {
        this.jobs = asArray(jobsResult.data).filter(
          (job) => !job?.sessionID || job.sessionID === active,
        );
      }
      // modelsResult failures are fine: the cache is kept (never fabricated).
      // modelsResult is intentionally not part of the health degrade list
      // because a missing catalogue only makes contextLimit null + unavailable.

      for (const result of [sessionInfoResult, messagesResult, shellsResult, sessionPermissionsResult, locationPermissionsResult]) {
        if (!result.ok && (result.error?.kind === 'unauthorized' || result.error?.kind === 'timeout' || result.error?.kind === 'unreachable')) {
          this.#degradeHealth(result.error);
        }
      }

      this.health.lastSyncAt = Date.now();
      this.dirty = true;
      this.log(`resynced (${reason}) session=${active} calls=${this.toolCalls.size} msgs=${this.messages.size}`);
    } finally {
      this._resyncing = false;
      this.health.resyncing = false;
      this.dirty = true;
      if (this._resyncQueued) {
        this._resyncQueued = false;
        setTimeout(() => this.resync('queued'), 0);
      }
    }
  }

  #scheduleResync(reason, delay = EVENT_RESYNC_DEBOUNCE_MS) {
    if (this._resyncTimer) return;
    this._resyncTimer = setTimeout(() => {
      this._resyncTimer = null;
      this.resync(reason);
    }, delay);
    this._resyncTimer.unref?.();
  }

  async #safe(fn) {
    try {
      return { ok: true, data: await fn() };
    } catch (error) {
      return {
        ok: false,
        error: {
          kind: error?.kind || 'unreachable',
          message: error?.message || 'OpenCode request failed',
        },
      };
    }
  }

  #raiseHealthOk() {
    this.health.opencode = 'ok';
    this.health.error = null;
  }

  #degradeHealth(error) {
    if (!error) return;
    const kind = error.kind || 'unreachable';
    if (kind === 'unauthorized') {
      this.health.opencode = 'unauthorized';
      this.health.error = 'OpenCode rejected the bridge credentials';
    } else if (kind === 'timeout' || kind === 'unreachable') {
      this.health.opencode = 'unreachable';
      this.health.error = kind === 'timeout' ? 'OpenCode request timed out' : 'OpenCode is unreachable';
    }
  }

  // ---------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------

  #applySessionList(payload) {
    const data = asArray(payload).filter((session) => session && typeof session.id === 'string');
    this.sessionsRaw = data.slice(0, CAPS.sessions);
    this.sessionDirs.clear();
    for (const session of data) {
      if (session?.id && session?.location?.directory) {
        this.sessionDirs.set(session.id, session.location.directory);
      }
    }
  }

  #deriveBusy(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const time = raw.time || {};
    if (typeof time.busy !== 'number') return false;
    if (typeof time.idle !== 'number') return true;
    return time.busy > time.idle;
  }

  #activeSessionRaw() {
    return this.sessionsRaw.find((session) => session.id === this.activeSessionId) || null;
  }

  /**
   * Model of the active session.
   * `Session.Info.model` is sometimes null (e.g. a session created without an
   * explicit model), so fall back to the most recent assistant message model —
   * that is still an OpenCode fact, not a guess.
   */
  #activeModelRef() {
    const raw = this.#activeSessionRaw();
    const direct = normalizeModelRef(raw?.model);
    if (direct) return direct;
    let newest = null;
    let newestAt = -Infinity;
    for (const message of this.messages.values()) {
      if (!message.model) continue;
      if (message.createdAt >= newestAt) {
        newest = message.model;
        newestAt = message.createdAt;
      }
    }
    return newest;
  }

  #directoryOf(sessionID) {
    if (!sessionID) return null;
    return this.sessionDirs.get(sessionID) || (sessionID === this.activeSessionId ? this.activeDir : null);
  }

  #applySessionInfo(info) {
    if (!info || typeof info !== 'object') return;
    this.activeDir = info.location?.directory || this.activeDir;
    if (info.id) this.sessionDirs.set(info.id, this.activeDir || this.projectDir);
    this.tokens = M.normalizeUsage(info.tokens);
    this.cost = typeof info.cost === 'number' ? info.cost : null;
    this.outcome = info.outcome ?? null;
    this.busy.set(info.id, this.#deriveBusy(info));
    // Keep the list entry in sync with the authoritative single-session fetch.
    const index = this.sessionsRaw.findIndex((session) => session.id === info.id);
    if (index >= 0) this.sessionsRaw[index] = { ...this.sessionsRaw[index], ...info };
    else if (info.id) this.sessionsRaw.unshift(info);
    this.dirty = true;
  }

  #clearSessionDerived() {
    this.messages.clear();
    this.toolCalls.clear();
    this.childCount = 0;
    this.tokens = M.emptyUsage();
    this.cost = null;
    this.lastStepTokens = null;
    this.outcome = null;
    this.tokHistory = M.emptyTokState();
    this.jobs = [];
    this.permissions.clear();
    if (this.activeSessionId) this.busy.set(this.activeSessionId, false);
    this.dirty = true;
  }

  async selectSession(sessionID) {
    if (!sessionID) throw bridgeError('sessionID is required', 400);
    let info;
    try {
      info = await this.client.getSession(sessionID);
    } catch (error) {
      if (error?.kind === 'notfound') throw bridgeError('session not found', 404);
      throw bridgeError(error?.message || 'could not load session', 502);
    }
    if (!info?.id) throw bridgeError('session not found', 404);

    this.activeSessionId = info.id;
    this.activeDir = info.location?.directory || this.activeDir || this.projectDir;
    this.sessionDirs.set(info.id, this.activeDir);
    this._bootSelectDone = true;
    this._switchToken += 1;
    this.#clearSessionDerived();
    this.#applySessionInfo(info);
    this.markDirty();
    await this.resync('select');
    return this.activeSessionId;
  }

  async createSession(title, model, directory = null) {
    let info;
    // `model` (route body) > BRIDGE_MODEL > OpenCode default. Explicit is safer:
    // a free-tier account gets 403 provider.auth on some default models, and the
    // workbench must not create sessions that cannot run.
    const ref = modelRef(model) || modelRef(NEW_SESSION_MODEL);
    try {
      info = await this.client.createSession({
        title: title || undefined,
        // A project switch creates the session in THAT directory; otherwise the
        // bridge default project dir keeps its old behaviour.
        directory: directory || this.projectDir,
        model: ref,
      });
    } catch (error) {
      throw bridgeError(error?.message || 'could not create session', 502);
    }
    const sessionID = info?.id;
    if (!sessionID) throw bridgeError('OpenCode did not return a session id', 502);
    this._bootSelectDone = true;
    await this.selectSession(sessionID);
    return sessionID;
  }

  // ---------------------------------------------------------------------
  // Messages / tool calls (authoritative rebuild)
  // ---------------------------------------------------------------------

  #normalizeMessage(raw) {
    if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
    const type = raw.type;
    const role = type === 'user' ? 'user' : type === 'assistant' ? 'assistant' : type === 'idle' ? 'idle' : 'system';
    let text = '';
    if (typeof raw.text === 'string') text = raw.text;
    else if (Array.isArray(raw.content)) {
      text = raw.content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
    }
    const completedAt = typeof raw.time?.completed === 'number' ? raw.time.completed : null;
    return {
      id: raw.id,
      role,
      text,
      streaming: role === 'assistant' && completedAt == null,
      createdAt: toTimestamp(raw.time?.created, 0),
      completedAt,
      model: normalizeModelRef(raw.model),
      error: raw.error?.message || (raw.finish === 'error' ? 'error' : null),
    };
  }

  #adoptToolPart(part, sessionID, messageID = null) {
    if (!part || typeof part.id !== 'string' || !part.id) return;
    const state = part.state && typeof part.state === 'object' ? part.state : {};
    const input = state.input ?? null;
    const time = part.time && typeof part.time === 'object' ? part.time : {};
    const startedAt = toTimestamp(time.created ?? time.ran, 0);
    const record = {
      id: part.id,
      sessionID,
      messageID: typeof messageID === 'string' ? messageID : null,
      name: typeof part.name === 'string' && part.name ? part.name : 'unknown',
      kind: M.classifyToolKind(part.name, input),
      detail: M.extractDetail(input, ''),
      status: mapToolStatus(state.status, state.error),
      startedAt,
      endedAt: typeof time.completed === 'number' ? time.completed : null,
      exit: M.numOrNull(state.metadata?.exit),
      truncated: Boolean(state.metadata?.truncated),
      input,
      rawInputText: '',
      shellID: typeof state.metadata?.shellID === 'string' ? state.metadata.shellID : null,
      output: toolOutputText(state),
    };
    this.toolCalls.set(record.id, record);
  }

  #applyMessages(rawMessages, sessionID) {
    this.messages.clear();
    this.toolCalls.clear();
    const sorted = rawMessages
      .slice()
      .sort((a, b) => toTimestamp(a?.time?.created) - toTimestamp(b?.time?.created));
    for (const raw of sorted) {
      const message = this.#normalizeMessage(raw);
      if (message) this.messages.set(message.id, message);
      if (Array.isArray(raw?.content)) {
        for (const part of raw.content) {
          // The message owns the part: this is the link the chat needs to show
          // a tool call under its own assistant bubble.
          if (part && part.type === 'tool') this.#adoptToolPart(part, sessionID, message?.id ?? raw?.id ?? null);
        }
      }
      // Rebuild the context-window proxy from the newest assistant message, so a
      // bridge restart does not blank it until the next live step.
      if (raw?.type === 'assistant' && raw.tokens) {
        const usage = M.normalizeUsage(raw.tokens);
        this.lastStepTokens = usage.input + usage.cache.read;
      }
    }
    this.dirty = true;
  }

  #ensureAssistantMessage(messageID, at) {
    if (!messageID) return null;
    let message = this.messages.get(messageID);
    if (!message) {
      message = {
        id: messageID,
        role: 'assistant',
        text: '',
        streaming: true,
        createdAt: toTimestamp(at, Date.now()),
        completedAt: null,
        model: null,
        error: null,
      };
      this.messages.set(messageID, message);
    }
    return message;
  }

  // ---------------------------------------------------------------------
  // Processes / permissions / models
  // ---------------------------------------------------------------------

  #shellBelongs(info, activeDir, activeSessionID) {
    const sessionID = info?.metadata?.sessionID;
    if (activeSessionID && sessionID) return sessionID === activeSessionID;
    if (info?.cwd && activeDir) return sameDirectory(info.cwd, activeDir);
    return true;
  }

  #applyShellList(list, activeDir, activeSessionID) {
    const next = new Map();
    for (const info of list) {
      if (!info || typeof info.id !== 'string') continue;
      if (!this.#shellBelongs(info, activeDir, activeSessionID)) continue;
      next.set(info.id, info);
    }
    this.shells = next;
    this.dirty = true;
  }

  #applyPtyList(list) {
    const next = new Map();
    for (const pty of list) {
      if (pty && typeof pty.id === 'string') next.set(pty.id, pty);
    }
    this.ptys = next;
    this.dirty = true;
  }

  #permissionView(raw, fallbackAt) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.requestID;
    if (typeof id !== 'string' || !id) return null;
    const existing = this.permissions.get(id);
    return {
      id,
      sessionID: typeof raw.sessionID === 'string' ? raw.sessionID : existing?.sessionID ?? '',
      action: typeof raw.action === 'string' ? raw.action : existing?.action ?? '',
      resources: Array.isArray(raw.resources) ? raw.resources.map(String) : existing?.resources ?? [],
      save: Array.isArray(raw.save) ? raw.save.map(String) : existing?.save ?? [],
      message: typeof raw.message === 'string' ? raw.message : existing?.message ?? null,
      requestedAt:
        existing?.requestedAt ??
        toTimestamp(raw.time?.created ?? raw.created ?? raw.requestedAt, fallbackAt ?? Date.now()),
    };
  }

  #applyPermissionsFromApi(list) {
    const next = new Map();
    const now = Date.now();
    for (const raw of list) {
      const view = this.#permissionView(raw, now);
      if (view) next.set(view.id, view);
    }
    this.permissions = next;
    this.dirty = true;
  }

  async #refreshModelsIfStale(directory) {
    if (this.models.size > 0 && Date.now() - this.modelsAt < MODEL_CACHE_TTL_MS) return;
    const result = await this.client.listModels(directory);
    const list = asArray(result);
    if (!list.length) return;
    const next = new Map();
    for (const model of list) {
      if (!model || typeof model.id !== 'string') continue;
      const entry = {
        id: model.id,
        providerID: typeof model.providerID === 'string' ? model.providerID : '',
        name: typeof model.name === 'string' ? model.name : null,
        context: typeof model.limit?.context === 'number' ? model.limit.context : null,
      };
      next.set(`${entry.providerID}:${entry.id}`, entry);
      if (typeof model.modelID === 'string') next.set(`${entry.providerID}:${model.modelID}`, entry);
    }
    this.models = next;
    this.modelsAt = Date.now();
  }

  #modelEntry(ref) {
    if (!ref) return null;
    return this.models.get(`${ref.providerID}:${ref.id}`) || this.models.get(`${ref.providerID}:${ref.id.replace(/^.*\//, '')}`) || null;
  }

  #contextLimitFor(ref) {
    const entry = this.#modelEntry(ref);
    return entry && typeof entry.context === 'number' ? entry.context : null;
  }

  #modelName(ref) {
    const entry = this.#modelEntry(ref);
    return entry?.name ?? null;
  }

  async #refreshAgentsIfStale(directory) {
    if (this.agents.size > 0 && Date.now() - this.agentsAt < AGENT_CACHE_TTL_MS) return;
    const result = await this.client.listAgents(directory);
    const list = asArray(result);
    if (!list.length) return;
    const next = new Map();
    for (const agent of list) {
      if (!agent || typeof agent.id !== 'string') continue;
      next.set(agent.id, {
        id: agent.id,
        name: typeof agent.name === 'string' ? agent.name : agent.id,
        description: typeof agent.description === 'string' ? agent.description : null,
        mode: typeof agent.mode === 'string' ? agent.mode : null,
        hidden: agent.hidden === true,
      });
    }
    this.agents = next;
    this.agentsAt = Date.now();
  }

  #agentName(id) {
    return this.agents.get(id)?.name ?? null;
  }

  /** The agent a session would use right now (explicit choice, else default). */
  #activeAgentId() {
    const raw = this.sessionsRaw.find((session) => session.id === this.activeSessionId);
    return (raw && typeof raw.agent === 'string' && raw.agent) || DEFAULT_AGENT_ID;
  }

  /**
   * Selectable agents: visible primary agents only.
   *
   * Subagents (`mode:"subagent"`) are spawned by the primary agent and cannot be
   * chosen for a session; internal helpers (`title`, `summary`, `compaction`) are
   * `hidden`.
   */
  async agentsView() {
    await this.#refreshAgentsIfStale(this.activeDir || this.projectDir);
    const currentId = this.#activeAgentId();
    const agents = [...this.agents.values()]
      .filter((agent) => !agent.hidden && agent.mode !== 'subagent')
      .sort((a, b) => {
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((agent) => ({ id: agent.id, name: agent.name, description: agent.description }));
    return { agents, current: { id: currentId, name: this.#agentName(currentId) ?? currentId } };
  }

  /** Switch the agent of a session (OpenCode `POST /api/session/{id}/agent`). */
  async selectAgent(sessionID, agentID) {    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    const id = String(agentID ?? '').trim();
    if (!id) throw bridgeError('agent is required', 400);
    await this.#refreshAgentsIfStale(this.activeDir || this.projectDir);
    if (this.agents.size > 0 && !this.agents.has(id)) {
      throw bridgeError(`unknown agent: ${id}`, 400);
    }
    try {
      await this.client.selectAgent(target, id);
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the agent change', 502);
    }
    const raw = this.sessionsRaw.find((session) => session.id === target);
    if (raw) {
      raw.agent = id;
      this.dirty = true;
    }
    await this.resync('agent');
    return { sessionID: target, agent: { id, name: this.#agentName(id) ?? id } };
  }

  /* -------------------------------------------------------------- projects -- */

  async #loadProjects() {
    if (this.projects) return this.projects;
    try {
      const raw = await fs.readFile(PROJECTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.projects) ? parsed.projects : [];
      this.projects = list
        .filter((entry) => entry && typeof entry.path === 'string' && entry.path)
        .map((entry) => ({
          path: path.resolve(entry.path),
          name: typeof entry.name === 'string' && entry.name ? entry.name : path.basename(entry.path),
          addedAt: Number(entry.addedAt) || 0,
          lastUsedAt: Number(entry.lastUsedAt) || 0,
        }));
    } catch {
      this.projects = [];
    }
    return this.projects;
  }

  async #saveProjects() {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(
      PROJECTS_FILE,
      `${JSON.stringify({ version: 1, projects: this.projects ?? [] }, null, 2)}\n`,
      'utf8',
    );
  }

  /** Absolute path that must exist and be a directory. */
  async #assertDirectory(target) {
    const text = String(target ?? '').trim();
    if (!/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(text)) throw bridgeError('请填写绝对路径', 400);
    const absolute = path.resolve(text);
    let stat;
    try {
      stat = await fs.stat(absolute);
    } catch {
      throw bridgeError('目录不存在', 400);
    }
    if (!stat.isDirectory()) throw bridgeError('这不是一个目录', 400);
    return absolute;
  }

  /** The curated list + the directory the active session actually lives in. */
  async projectsView() {
    const list = await this.#loadProjects();
    const currentPath = this.activeDir || this.projectDir;
    const projects = [];
    for (const entry of list) {
      let exists = true;
      try {
        exists = (await fs.stat(entry.path)).isDirectory();
      } catch {
        exists = false;
      }
      projects.push({
        ...entry,
        exists,
        current: currentPath ? projectKey(entry.path) === projectKey(currentPath) : false,
      });
    }
    projects.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    return {
      current: currentPath ? { path: currentPath, name: path.basename(currentPath) } : null,
      projects,
    };
  }

  /** Add an absolute directory to the curated list. Does NOT switch to it. */
  async addProject(target) {
    const absolute = await this.#assertDirectory(target);
    const list = await this.#loadProjects();
    const key = projectKey(absolute);
    if (!list.some((entry) => projectKey(entry.path) === key)) {
      list.push({ path: absolute, name: path.basename(absolute), addedAt: Date.now(), lastUsedAt: 0 });
      await this.#saveProjects();
    }
    return this.projectsView();
  }

  /**
   * Switch project: select the directory's most recent session, or create one
   * when it has none — OpenCode has no "open project" call, a project exists
   * because a session lives in it.
   */
  async selectProject(target) {
    const absolute = await this.#assertDirectory(target);
    let sessionID = null;
    try {
      const result = await this.client.listSessions({ limit: 1, order: 'desc', directory: absolute });
      const list = asArray(result);
      if (list.length > 0 && typeof list[0].id === 'string') sessionID = list[0].id;
    } catch {
      sessionID = null;
    }
    if (sessionID) await this.selectSession(sessionID);
    else await this.createSession(null, null, absolute);

    const list = await this.#loadProjects();
    const entry = list.find((item) => projectKey(item.path) === projectKey(absolute));
    if (entry) {
      entry.lastUsedAt = Date.now();
      await this.#saveProjects();
    }
    return { sessionID: this.activeSessionId ?? sessionID, directory: absolute };
  }

  /** Forget a project (the directory on disk is untouched). */
  async removeProject(target) {
    const key = projectKey(target);
    const list = await this.#loadProjects();
    const next = list.filter((entry) => projectKey(entry.path) !== key);
    if (next.length === list.length) throw bridgeError('项目不在列表里', 404);
    this.projects = next;
    await this.#saveProjects();
    return this.projectsView();
  }

  async #refreshCommandsIfStale(directory) {    if (this.commands.length > 0 && Date.now() - this.commandsAt < COMMAND_CACHE_TTL_MS) return;
    const result = await this.client.listCommands(directory);
    const list = asArray(result);
    if (!list.length) return;
    this.commands = list
      .filter((command) => command && typeof command.name === 'string' && command.name)
      .map((command) => ({
        name: command.name,
        description: typeof command.description === 'string' ? command.description : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.commandsAt = Date.now();
  }

  /**
   * Commands the agent advertises for `/` in the composer.
   *
   * These are NOT a client-side list: OpenCode returns them from the session's
   * agent configuration (`init`, `review`, `goal` on this install), which is the
   * same source the reference client renders after ACP `available_commands_update`.
   */
  async commandsView() {
    await this.#refreshCommandsIfStale(this.activeDir || this.projectDir);
    return {
      commands: this.commands.map((command) => ({ ...command })),
      directory: this.activeDir || this.projectDir,
    };
  }

  /**
   * Run a command: `POST /api/session/{id}/command` (204 — the turn streams
   * through the normal event pipeline, so we only mark the session busy).
   */
  async sendCommand(name, text, sessionID, files = null) {
    const command = String(name ?? '').trim();
    if (!command) throw bridgeError('command name is required', 400);
    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    await this.#refreshCommandsIfStale(this.activeDir || this.projectDir);
    if (this.commands.length > 0 && !this.commands.some((entry) => entry.name === command)) {
      throw bridgeError(`unknown command: /${command}`, 400);
    }
    if (target !== this.activeSessionId) await this.selectSession(target);
    try {
      await this.client.sendCommand(target, {
        name: command,
        text: String(text ?? ''),
        ...(Array.isArray(files) && files.length > 0 ? { files } : {}),
      });
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the command', 502);
    }
    this.busy.set(target, true);
    this.markDirty();
    this.#scheduleResync('command', PROMPT_RESYNC_DELAY_MS);
    return { sessionID: target, name: command };
  }

  /**
   * Model catalogue for the picker, grouped by provider.
   *
   * The catalogue is large (≈670 entries over 4 providers) and every entry
   * reports `status:"active"` / `enabled:true`, so availability cannot be
   * pre-filtered honestly — the UI must show the real list and surface the
   * failure if a provider rejects the model at call time.
   */
  async modelsView() {
    await this.#refreshModelsIfStale(this.activeDir || this.projectDir);
    const seen = new Set();
    const byProvider = new Map();
    for (const entry of this.models.values()) {
      if (!entry || !entry.providerID || !entry.id) continue;
      const key = `${entry.providerID}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = byProvider.get(entry.providerID) ?? [];
      list.push({ id: entry.id, name: entry.name, context: entry.context });
      byProvider.set(entry.providerID, list);
    }
    const order = ['opencode', 'opencode-go', 'openrouter', 'vercel'];
    const providers = [...byProvider.entries()]
      .map(([id, models]) => ({
        id,
        models: models.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
      }))
      .sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
      });
    const current = this.#activeModelRef();
    return {
      providers,
      current: current ? { providerID: current.providerID, id: current.id } : null,
    };
  }

  /** Switch the model of a session (OpenCode `POST /api/session/{id}/model`). */
  async selectModel(sessionID, model) {
    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    const ref = modelRef(model);
    if (!ref) throw bridgeError('model must have providerID and id', 400);
    try {
      await this.client.selectModel(target, ref);
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the model change', 502);
    }
    // Optimistic flip so the footer changes before the re-sync lands.
    const raw = this.sessionsRaw.find((session) => session.id === target);
    if (raw) {
      raw.model = { id: ref.id, providerID: ref.providerID };
      this.dirty = true;
    }
    await this.resync('model');
    return { sessionID: target, model: ref };
  }

  /** Rename a session (OpenCode `PATCH /api/session/{id}` with `title`). */
  async renameSession(sessionID, title) {
    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    const clean = String(title ?? '').trim();
    if (!clean) throw bridgeError('title is required', 400);
    if (clean.length > 200) throw bridgeError('title is too long (max 200)', 400);
    try {
      await this.client.updateSession(target, { title: clean });
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the rename', 502);
    }
    const raw = this.sessionsRaw.find((session) => session.id === target);
    if (raw) {
      raw.title = clean;
      this.dirty = true;
    }
    await this.resync('rename');
    return { sessionID: target, title: clean };
  }

  /**
   * Delete a session (OpenCode also deletes its child sessions).
   *
   * If the deleted session was active, the bridge immediately selects the most
   * recently updated survivor so the workbench never points at a dead id.
   */
  async deleteSession(sessionID) {
    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    try {
      await this.client.deleteSession(target);
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the delete', 502);
    }
    this.sessionsRaw = this.sessionsRaw.filter((session) => session.id !== target);
    if (this.activeSessionId === target) {
      this.#clearSessionDerived();
      this.activeSessionId = null;
      this.activeDir = null;
      const next = [...this.sessionsRaw].sort((a, b) => toTimestamp(b?.time?.updated) - toTimestamp(a?.time?.updated))[0];
      this.dirty = true;
      if (next) {
        await this.selectSession(next.id);
        return { deleted: target, activeSessionId: this.activeSessionId };
      }
      return { deleted: target, activeSessionId: null };
    }
    await this.resync('delete');
    return { deleted: target, activeSessionId: this.activeSessionId };
  }

  // ---------------------------------------------------------------------
  // Prompt / interrupt / permission reply
  // ---------------------------------------------------------------------

  async sendPrompt(text, sessionID, files = null) {
    const body = String(text ?? '').trim();
    if (!body) throw bridgeError('text is required', 400);
    let target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    if (target !== this.activeSessionId) {
      await this.selectSession(target);
      target = this.activeSessionId;
    }
    try {
      const result = await this.client.prompt(target, body, files);
      this.busy.set(target, true);
      this.markDirty();
      this.#scheduleResync('prompt', PROMPT_RESYNC_DELAY_MS);
      return { sessionID: target, admitted: result ?? null };
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the prompt', 502);
    }
  }

  /**
   * List one directory of the active workspace.
   *
   * `path` is relative to the session directory (OpenCode's own contract); an
   * absolute path, a drive prefix or a `..` segment is rejected here so the
   * browser cannot enumerate anything outside the project the bridge was
   * started for.
   */
  async listFiles(path = '.') {
    const directory = this.activeDir || this.projectDir;
    if (!directory) throw bridgeError('no active session directory', 409);
    const relative = String(path ?? '.').trim() || '.';
    if (/^[a-zA-Z]:|^[\\/]/.test(relative) || relative.split(/[\\/]+/).includes('..')) {
      throw bridgeError('path must stay inside the session directory', 400);
    }
    let result;
    try {
      result = await this.client.fsList(directory, relative);
    } catch (error) {
      throw bridgeError(error?.message || 'could not list the directory', 502);
    }
    const entries = asArray(result?.data)
      .filter((entry) => entry && typeof entry.path === 'string')
      .map((entry) => ({
        path: normalizeEntryPath(entry.path),
        type: entry.type === 'directory' ? 'directory' : 'file',
      }))
      .filter((entry) => entry.path && entry.path !== '.')
      .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'directory' ? -1 : 1));
    return { directory, path: relative, entries };
  }

  /**
   * One file for the in-app preview.
   *
   * Text is decoded up to 4 MiB — the reference viewer labels its own cut as
   * `# lines · first 4 MB` — and reports whether it was truncated. Images come
   * back as a data URL; PDF and other binaries return an explicit `kind` so the
   * viewer can say why it will not render instead of showing mojibake.
   */
  async readFile(path = '') {
    const directory = this.activeDir || this.projectDir;
    if (!directory) throw bridgeError('no active session directory', 409);
    const relative = normalizeEntryPath(path);
    if (!relative || /^[a-zA-Z]:|^[\\/]/.test(relative) || relative.split('/').includes('..')) {
      throw bridgeError('path must stay inside the session directory', 400);
    }
    let result;
    try {
      result = await this.client.readFile(directory, relative);
    } catch (error) {
      if (error?.kind === 'notfound') throw bridgeError('file not found', 404);
      throw bridgeError(error?.message || 'could not read the file', 502);
    }

    const { bytes } = result;
    const size = bytes.length;
    const ext = extOf(relative);
    const mime = result.contentType ? result.contentType.split(';')[0] : null;

    if (ext === 'pdf' || mime === 'application/pdf') {
      return { path: relative, size, kind: 'pdf', mime: mime ?? 'application/pdf', truncated: false };
    }
    if (IMAGE_MIME[ext] || (mime?.startsWith('image/') && mime !== 'image/svg+xml')) {
      if (size > FILE_BINARY_PREVIEW_MAX) {
        return { path: relative, size, kind: 'too-large', mime: mime ?? IMAGE_MIME[ext] ?? null, truncated: false };
      }
      return {
        path: relative,
        size,
        kind: 'image',
        mime: mime ?? IMAGE_MIME[ext] ?? 'application/octet-stream',
        base64: bytes.toString('base64'),
        truncated: false,
      };
    }
    if (!looksLikeText(bytes.subarray(0, Math.min(size, FILE_TEXT_PREVIEW_MAX)))) {
      return { path: relative, size, kind: 'binary', mime, truncated: false };
    }

    const truncated = size > FILE_TEXT_PREVIEW_MAX;
    const text = bytes.subarray(0, truncated ? FILE_TEXT_PREVIEW_MAX : size).toString('utf8');
    return {
      path: relative,
      size,
      kind: 'text',
      mime,
      text,
      truncated,
      lines: text.length === 0 ? 0 : text.split('\n').length,
    };
  }

  /** Workspace-wide file search for the `@` picker (`GET /api/fs/find`). */
  async findFiles(query, limit = 8) {
    const directory = this.activeDir || this.projectDir;
    if (!directory) throw bridgeError('no active session directory', 409);
    const text = String(query ?? '').trim();
    if (!text) return { directory, query: text, entries: [] };
    const capped = Math.max(1, Math.min(20, Number(limit) || 8));
    let result;
    try {
      result = await this.client.fsFind(directory, text, capped);
    } catch (error) {
      throw bridgeError(error?.message || 'could not search the workspace', 502);
    }
    const entries = asArray(result?.data)
      .filter((entry) => entry && typeof entry.path === 'string' && entry.type !== 'directory')
      .map((entry) => ({ path: normalizeEntryPath(entry.path), type: 'file' }))
      .filter((entry) => entry.path)
      .slice(0, capped);
    return { directory, query: text, entries };
  }

  async interrupt(sessionID) {
    const target = sessionID || this.activeSessionId;
    if (!target) throw bridgeError('no active session', 409);
    let result;
    try {
      result = await this.client.interrupt(target);
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the interrupt', 502);
    }
    const interrupted = Boolean(result?.interrupted ?? result?.data?.interrupted ?? false);
    if (interrupted) {
      this.busy.set(target, false);
      this.markDirty();
      this.#scheduleResync('interrupt', 500);
    }
    return interrupted;
  }

  async respondPermission(permissionID, decision, message = null) {
    const allowed = ['once', 'always', 'reject'];
    if (!allowed.includes(decision)) throw bridgeError("decision must be 'once' | 'always' | 'reject'", 400);
    let permission = this.permissions.get(permissionID);
    if (!permission) {
      await this.resync('permission-lookup');
      permission = this.permissions.get(permissionID);
    }
    if (!permission) throw bridgeError('unknown pending permission', 404);
    try {
      await this.client.replyPermission(permission.sessionID, permissionID, decision, message ?? null);
    } catch (error) {
      throw bridgeError(error?.message || 'OpenCode rejected the permission reply', 502);
    }
    this.permissions.delete(permissionID);
    this.markDirty();
    this.#scheduleResync('permission-replied', 600);
    return { replied: true, sessionID: permission.sessionID, decision };
  }

  // ---------------------------------------------------------------------
  // SSE event ingestion
  // ---------------------------------------------------------------------

  applyEvent(event) {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') return;
    const type = event.type;
    const data = event.data && typeof event.data === 'object' ? event.data : {};
    const at = toTimestamp(event.created, Date.now());
    const sessionID = typeof data.sessionID === 'string' ? data.sessionID : null;

    this.health.lastEventAt = Date.now();
    this.dirty = true;

    switch (type) {
      // ---- session lifecycle ------------------------------------------------
      case 'session.created':
      case 'session.renamed':
      case 'session.moved':
      case 'session.archived':
      case 'session.unarchived':
      case 'session.metadata.updated':
      case 'session.model.selected':
      case 'session.agent.selected':
        this.#scheduleResync(type);
        break;
      case 'session.deleted': {
        const deletedID = sessionID || data.id || data.sessionID;
        if (deletedID && deletedID === this.activeSessionId) {
          this.activeSessionId = null;
          this.activeDir = null;
          this.#clearSessionDerived();
        }
        this.#scheduleResync(type);
        break;
      }
      case 'session.idle': {
        if (sessionID) this.busy.set(sessionID, false);
        this.#scheduleResync(type);
        break;
      }
      case 'session.status': {
        if (sessionID) {
          const status = String(data.status ?? data.state ?? '');
          this.busy.set(sessionID, status === 'busy' || status === 'running' || status === 'working');
        }
        break;
      }
      case 'session.execution.started': {
        if (sessionID) this.busy.set(sessionID, true);
        break;
      }
      case 'session.execution.succeeded':
      case 'session.execution.failed':
      case 'session.execution.interrupted': {
        if (sessionID) {
          this.busy.set(sessionID, false);
          const outcome =
            type === 'session.execution.succeeded'
              ? 'succeeded'
              : type === 'session.execution.failed'
                ? 'failed'
                : 'interrupted';
          if (sessionID === this.activeSessionId) this.outcome = outcome;
          const raw = this.sessionsRaw.find((s) => s.id === sessionID);
          if (raw) raw.outcome = outcome;
          this.#scheduleResync(type, 300);
        }
        break;
      }

      // ---- streaming text ---------------------------------------------------
      case 'session.text.started': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.#ensureAssistantMessage(data.assistantMessageID, at);
        if (message) message.streaming = true;
        break;
      }
      case 'session.text.delta': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.#ensureAssistantMessage(data.assistantMessageID, at);
        if (message && typeof data.delta === 'string') {
          message.text += data.delta;
          message.streaming = true;
        }
        break;
      }
      case 'session.text.ended': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.messages.get(data.assistantMessageID);
        if (message) message.streaming = false;
        break;
      }
      case 'session.reasoning.started':
      case 'session.reasoning.delta':
      case 'session.reasoning.ended':
        // Reasoning text is not rendered; only cumulative tokens.reasoning matters.
        break;

      // ---- steps ------------------------------------------------------------
      case 'session.step.started': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.#ensureAssistantMessage(data.assistantMessageID, at);
        if (message && data.model) message.model = normalizeModelRef(data.model);
        if (sessionID) this.busy.set(sessionID, true);
        break;
      }
      case 'session.step.ended': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.messages.get(data.assistantMessageID);
        if (message) {
          message.streaming = false;
          if (typeof data.finish === 'string' && data.finish === 'error' && !message.error) {
            message.error = data.error?.message || 'step failed';
          }
        }
        // Context occupancy proxy: what this step actually sent to the model.
        if (data.tokens && typeof data.tokens === 'object') {
          const usage = M.normalizeUsage(data.tokens);
          this.lastStepTokens = usage.input + usage.cache.read;
        }
        break;
      }
      case 'session.step.failed': {
        if (sessionID && sessionID !== this.activeSessionId) break;
        const message = this.messages.get(data.assistantMessageID);
        if (message) {
          message.streaming = false;
          message.error = data.error?.message || 'step failed';
        }
        break;
      }

      // ---- cumulative usage (authoritative token totals) --------------------
      case 'session.usage.updated': {
        if (typeof data.sessionID !== 'string') break;
        const raw = this.sessionsRaw.find((s) => s.id === data.sessionID);
        if (raw) {
          if (data.tokens) raw.tokens = data.tokens;
          if (typeof data.cost === 'number') raw.cost = data.cost;
        }
        if (data.sessionID === this.activeSessionId) {
          this.tokens = M.normalizeUsage(data.tokens);
          if (typeof data.cost === 'number') this.cost = data.cost;
        }
        break;
      }

      // ---- tool calls -------------------------------------------------------
      case 'session.tool.input.started':
      case 'session.tool.input.delta':
      case 'session.tool.input.ended':
      case 'session.tool.called':
      case 'session.tool.progress':
      case 'session.tool.success':
      case 'session.tool.failed':
        this.#applyToolEvent(type, data, at);
        break;

      // ---- permissions ------------------------------------------------------
      case 'permission.asked': {
        const view = this.#permissionView(data, at);
        if (view) {
          this.permissions.set(view.id, { ...view, requestedAt: at });
          this.#scheduleResync('permission-asked', 250);
        }
        break;
      }
      case 'permission.replied': {
        const requestID = data.requestID || data.id;
        if (typeof requestID === 'string') this.permissions.delete(requestID);
        break;
      }

      // ---- processes --------------------------------------------------------
      case 'shell.created': {
        const info = data.info;
        if (info && typeof info.id === 'string') {
          const dir = event.location?.directory;
          if (!dir || !this.activeDir || sameDirectory(dir, this.activeDir)) {
            this.shells.set(info.id, info);
          }
        }
        break;
      }
      case 'shell.exited': {
        const id = data.id;
        const info = this.shells.get(id);
        if (info) {
          this.shells.set(id, {
            ...info,
            status: typeof data.status === 'string' ? data.status : 'exited',
            exit: typeof data.exit === 'number' ? data.exit : info.exit,
            time: { ...(info.time || {}), completed: typeof info.time?.completed === 'number' ? info.time.completed : at },
          });
        }
        break;
      }
      case 'shell.deleted': {
        if (typeof data.id === 'string') this.shells.delete(data.id);
        break;
      }
      case 'session.shell.started':
      case 'session.shell.ended': {
        const info = data.shell;
        if (info && typeof info.id === 'string') this.shells.set(info.id, info);
        break;
      }
      case 'pty.created':
      case 'pty.updated': {
        const pty = data.pty || data.info || data;
        if (pty && typeof pty.id === 'string') this.ptys.set(pty.id, pty);
        break;
      }
      case 'pty.exited':
      case 'pty.deleted': {
        const id = data.id || data.ptyID;
        if (typeof id === 'string') this.ptys.delete(id);
        break;
      }
      default:
        break;
    }
  }

  #applyToolEvent(type, data, at) {
    const id = data.id;
    if (typeof id !== 'string' || !id) return;
    if (typeof data.sessionID === 'string' && data.sessionID !== this.activeSessionId) return;

    let record = this.toolCalls.get(id);
    const createIfMissing = () => {
      if (record) return record;
      record = {
        id,
        sessionID: data.sessionID || this.activeSessionId,
        messageID: typeof data.assistantMessageID === 'string' ? data.assistantMessageID : null,
        name: typeof data.name === 'string' ? data.name : 'unknown',
        kind: 'Bash',
        detail: '',
        status: 'running',
        startedAt: at,
        endedAt: null,
        exit: null,
        truncated: false,
        input: null,
        rawInputText: '',
        shellID: null,
        output: null,
      };
      this.toolCalls.set(id, record);
      return record;
    };

    switch (type) {
      case 'session.tool.input.started': {
        record = createIfMissing();
        if (typeof data.name === 'string' && data.name) record.name = data.name;
        record.startedAt = record.startedAt || at;
        record.kind = M.classifyToolKind(record.name, record.input);
        break;
      }
      case 'session.tool.input.delta': {
        record = createIfMissing();
        if (typeof data.delta === 'string') record.rawInputText += data.delta;
        break;
      }
      case 'session.tool.input.ended': {
        record = createIfMissing();
        if (typeof data.text === 'string' && data.text) {
          record.rawInputText = data.text;
          const parsed = parseJsonSafe(data.text);
          if (parsed !== null) record.input = parsed;
        }
        if (record.input !== null) {
          record.detail = M.extractDetail(record.input, record.detail);
          record.kind = M.classifyToolKind(record.name, record.input);
        }
        break;
      }
      case 'session.tool.called': {
        record = createIfMissing();
        if (data.input && typeof data.input === 'object') record.input = data.input;
        if (typeof data.name === 'string' && data.name) record.name = data.name;
        record.detail = M.extractDetail(record.input, record.detail);
        record.kind = M.classifyToolKind(record.name, record.input);
        this.#emitGameview(record, at);
        break;
      }
      case 'session.tool.progress': {
        record = createIfMissing();
        if (typeof data.metadata?.shellID === 'string') record.shellID = data.metadata.shellID;
        break;
      }
      case 'session.tool.success': {
        record = createIfMissing();
        record.status = 'completed';
        record.endedAt = at;
        record.exit = M.numOrNull(data.metadata?.exit);
        record.truncated = Boolean(data.metadata?.truncated);
        if (typeof data.metadata?.shellID === 'string') record.shellID = data.metadata.shellID;
        if (!record.output) record.output = toolOutputText(data);
        this.#emitGameview(record, at);
        break;
      }
      case 'session.tool.failed': {
        record = createIfMissing();
        record.status = data.error?.type === 'aborted' ? 'aborted' : 'error';
        record.endedAt = at;
        record.exit = M.numOrNull(data.metadata?.exit);
        if (typeof data.error?.message === 'string' && !record.detail) {
          record.detail = M.truncateDetail(data.error.message);
        }
        this.#emitGameview(record, at);
        break;
      }
      default:
        break;
    }
  }

  #emitGameview(record, at) {
    if (!record || this.gameviewEmitted.has(record.id)) return;
    const detail = record.detail || record.name || '';
    if (!detail) return;
    this.gameviewEmitted.add(record.id);
    this.gameview.push({
      id: ++this.gameviewSeq,
      type: record.kind,
      detail: M.truncateDetail(detail),
      at: toTimestamp(at, Date.now()),
    });
  }

  /** Drain queued Game View events (the server forwards them over SSE). */
  takeGameview() {
    if (!this.gameview.length) return [];
    const events = this.gameview;
    this.gameview = [];
    return events;
  }

  // ---------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------

  getHealthView() {
    return {
      opencode: this.health.opencode,
      stream: this.health.stream,
      bridge: 'ok',
      lastEventAt: this.health.lastEventAt,
      lastSyncAt: this.health.lastSyncAt,
      resyncing: this.health.resyncing,
      error: this.health.error,
    };
  }

  #sessionView(raw) {
    const time = raw.time || {};
    const busy = this.busy.has(raw.id) ? this.busy.get(raw.id) : this.#deriveBusy(raw);
    const model = raw.model ? { id: raw.model.id, providerID: raw.model.providerID ?? '' } : null;
    return {
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : '',
      parentID: typeof raw.parentID === 'string' ? raw.parentID : null,
      createdAt: toTimestamp(time.created, 0),
      updatedAt: toTimestamp(time.updated ?? time.created, 0),
      outcome: raw.outcome ?? null,
      busy: Boolean(busy),
      model,
      agent: typeof raw.agent === 'string' ? raw.agent : null,
      tokens: M.normalizeUsage(raw.tokens),
      cost: typeof raw.cost === 'number' ? raw.cost : 0,
    };
  }

  #buildProcesses(now) {
    if (!this.activeSessionId) return [];
    const processes = [];

    for (const info of this.shells.values()) {
      if (!info || info.status !== 'running') continue;
      const startedAt = typeof info.time?.started === 'number' ? info.time.started : null;
      processes.push({
        id: info.id,
        kind: 'shell',
        title: info.command || 'shell',
        command: typeof info.command === 'string' ? info.command : null,
        status: info.status,
        pid: typeof info.pid === 'number' ? info.pid : null,
        exit: typeof info.exit === 'number' ? info.exit : null,
        startedAt,
        elapsedMs: startedAt != null ? Math.max(0, now - startedAt) : null,
        jobKind: null,
        sessionID: typeof info.metadata?.sessionID === 'string' ? info.metadata.sessionID : null,
      });
    }

    for (const job of this.jobs) {
      if (!job || typeof job.id !== 'string') continue;
      if (job.sessionID && job.sessionID !== this.activeSessionId) continue;
      const startedAt = typeof job.time?.started === 'number' ? job.time.started : null;
      processes.push({
        id: job.id,
        kind: 'job',
        title: job.title || job.command || job.kind || 'job',
        command: typeof job.command === 'string' ? job.command : null,
        status: typeof job.status === 'string' ? job.status : 'unknown',
        pid: null,
        exit: null,
        startedAt,
        elapsedMs: startedAt != null ? Math.max(0, now - startedAt) : null,
        jobKind: typeof job.kind === 'string' ? job.kind : null,
        sessionID: job.sessionID ?? null,
      });
    }

    for (const pty of this.ptys.values()) {
      if (!pty || pty.status !== 'running') continue;
      const startedAt = typeof pty.time?.started === 'number' ? pty.time.started : null;
      processes.push({
        id: pty.id,
        kind: 'pty',
        title: pty.title || pty.command || 'pty',
        command: typeof pty.command === 'string' ? pty.command : null,
        status: pty.status,
        pid: typeof pty.pid === 'number' ? pty.pid : null,
        exit: typeof pty.exitCode === 'number' ? pty.exitCode : null,
        startedAt,
        elapsedMs: startedAt != null ? Math.max(0, now - startedAt) : null,
        jobKind: null,
        sessionID: null,
      });
    }

    // Oldest first, so the cap keeps the long-running (most interesting) entries.
    processes.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    return processes.slice(0, CAPS.processes);
  }

  snapshot() {
    const now = Date.now();
    this.version += 1;

    const activeSessionId = this.activeSessionId;
    const activeModelRef = activeSessionId ? this.#activeModelRef() : null;
    const records = [...this.toolCalls.values()];

    const counts = M.computeCounts(records, this.tokens, this.childCount);
    const { rate15s, rateSeries } = M.computeRateSeries(
      records.map((record) => record.startedAt),
      now,
    );
    const tokensTotal = M.usageTotal(this.tokens);
    const contextLimit = activeModelRef ? this.#contextLimitFor(activeModelRef) : null;
    const cost = this.cost === null ? null : this.cost;

    const messages = [...this.messages.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-CAPS.messages)
      .map((message) => ({
        id: message.id,
        role: message.role,
        text: truncateText(message.text),
        streaming: Boolean(message.streaming),
        createdAt: message.createdAt,
        completedAt: message.completedAt,
        model: message.model,
        error: message.error,
      }));

    const toolCalls = records
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, CAPS.toolCalls)
      .map((record) => ({
        id: record.id,
        sessionID: record.sessionID || activeSessionId,
        messageID: record.messageID ?? null,
        name: record.name,
        kind: record.kind,
        detail: M.truncateDetail(record.detail),
        status: record.status,
        startedAt: record.startedAt,
        endedAt: record.endedAt ?? null,
        durationMs:
          record.endedAt != null && record.startedAt
            ? Math.max(0, record.endedAt - record.startedAt)
            : null,
        exit: record.exit ?? null,
        truncated: Boolean(record.truncated),
        output: record.output ? truncateText(record.output, TOOL_OUTPUT_MAX) : null,
      }));

    // Card ③ curve sampling: the scalar tok/s is an EMA that decays over 3 s, so
    // Card ③ reads the cumulative output counter: record it whenever it moves,
    // and keep re-broadcasting while the trailing window still holds tokens so
    // the trace eases down instead of freezing.
    const cumOutput = this.tokens.output;
    const lastHist = this.tokHistory[this.tokHistory.length - 1];
    if (!lastHist || lastHist.cum !== cumOutput) {
      this.tokHistory.push({ at: now, cum: cumOutput });
      const histCutoff = now - M.TOK_WINDOW_MS * 3;
      while (this.tokHistory.length && this.tokHistory[0].at < histCutoff) this.tokHistory.shift();
    }
    const tokNow = M.computeTokPerSec(this.tokHistory, now);
    if (tokNow > 0) this.dirty = true;

    const activeRaw = this.sessionsRaw.find((s) => s.id === activeSessionId);
    // Session age: OpenCode stamps `time.created` (epoch ms, or s on old builds);
    // if the session was created before we synced, fall back to the earliest call.
    const createdRaw = activeRaw?.time?.created ?? activeRaw?.createdAt ?? null;
    let created = typeof createdRaw === 'number' && createdRaw > 0 ? createdRaw : null;
    if (created != null && created < 1e12) created *= 1000;
    if (created == null) {
      const starts = records.map((r) => r.startedAt).filter((t) => typeof t === 'number' && t > 0);
      if (starts.length > 0) created = Math.min(...starts);
    }
    const sessionMs = created != null ? Math.max(0, now - created) : 0;
    const detail = M.computeDetail({ calls: records, sessionMs, now, tokSeries: M.computeTokSeries(this.tokHistory, now) });

    return {
      version: this.version,
      serverTime: now,
      health: this.getHealthView(),
      activeSessionId,
      sessions: this.sessionsRaw.slice(0, CAPS.sessions).map((raw) => this.#sessionView(raw)),
      messages,
      toolCalls,
      detail: { ...detail, sessionMs },
      metrics: {
        counts,
        tokens: {
          input: this.tokens.input,
          output: this.tokens.output,
          reasoning: this.tokens.reasoning,
          cache: { read: this.tokens.cache.read, write: this.tokens.cache.write },
        },
        tokensTotal,
        rate15s,
        rateSeries,
        rateSeriesWindow: M.RATE_SERIES_WINDOW,
        tokPerSec: tokNow,
        tokSeries: M.computeTokSeries(this.tokHistory, now),
        tokSeriesWindow: M.TOK_SERIES_WINDOW,
        memoryMB: null,
        contextWindowUsed: this.lastStepTokens,
        contextUsed: tokensTotal,
        contextLimit,
        cost,
        computedAt: now,
        unavailable: M.unavailableKeys({ contextLimit, cost }),
      },
      processes: this.#buildProcesses(now),
      permissions: [...this.permissions.values()]
        .slice()
        .sort((a, b) => a.requestedAt - b.requestedAt)
        .map((permission) => ({ ...permission })),
      model: activeModelRef
        ? { id: activeModelRef.id, providerID: activeModelRef.providerID, name: this.#modelName(activeModelRef) }
        : null,
      agent: {
        id: this.#activeAgentId(),
        name: this.#agentName(this.#activeAgentId()) ?? this.#activeAgentId(),
      },
      providerLabel: 'OpenCode',
      projectDirectory: this.activeDir || this.projectDir,
    };
  }
}






