/**
 * OpenCode v2 HTTP client for the ODDSEMBLY bridge.
 *
 * Responsibilities:
 *   1. Discover the managed service URL + password (server-side only).
 *   2. Speak the typed subset of the v2 `/api/*` surface the workbench needs.
 *   3. Hold the `/api/event` SSE subscription open, parse `data:` lines,
 *      skip `: heartbeat` comments, and reconnect with exponential backoff.
 *
 * SECURITY: the password is kept in a private field. It is never returned,
 * never logged, and never embedded in an error message. Errors carry only a
 * sanitised reason (`unauthorized` / `unreachable` / `timeout` / `http <n>`).
 *
 * Facts verified against OpenCode v2.2.6 — see
 * analysis/opencode-integration/opencode/FINDINGS.md and
 * kunlun-shell/docs/OPENCODE-WORKBENCH-CONTRACT.md.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** OpenCode always accepts this username for HTTP Basic. */
const AUTH_USER = 'opencode';
const DEFAULT_URL = 'http://127.0.0.1:19474';
const DEFAULT_TIMEOUT_MS = 8_000;
const STREAM_STALL_MS = 45_000; // OpenCode heartbeats every ~10 s
const STREAM_BACKOFF_BASE_MS = 400;
const STREAM_BACKOFF_MAX_MS = 8_000;

/** Sanitised client error: never contains credentials, only a reason. */
export class OpenCodeError extends Error {
  constructor(message, { kind = 'http', status = null } = {}) {
    super(message);
    this.name = 'OpenCodeError';
    this.kind = kind;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the OpenCode base URL + password.
 * Priority: env OPENCODE_URL / OPENCODE_PASSWORD, then service.json
 * (`~/.local/state/opencode/service.json`, then `~/.config/opencode/service.json`).
 */
export function loadConfig(env = process.env) {
  let url = (env.OPENCODE_URL || '').trim() || null;
  let password = env.OPENCODE_PASSWORD || null;
  let source = url || password ? 'env' : null;

  if (!url || !password) {
    const candidates = [
      path.join(os.homedir(), '.local', 'state', 'opencode', 'service.json'),
      path.join(os.homedir(), '.config', 'opencode', 'service.json'),
    ];
    for (const file of candidates) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!url && typeof parsed.url === 'string' && parsed.url) url = parsed.url;
        if (!url && typeof parsed.port === 'number') url = `http://127.0.0.1:${parsed.port}`;
        if (!password && typeof parsed.password === 'string' && parsed.password) password = parsed.password;
        if (url && password) {
          source = file;
          break;
        }
      } catch {
        // Missing / unreadable candidate: try the next one.
      }
    }
  }

  return {
    url: (url || DEFAULT_URL).replace(/\/+$/, ''),
    password: password || null,
    hasPassword: Boolean(password),
    source: source || 'default',
  };
}

/**
 * Thin client over the OpenCode v2 HTTP API.
 * All methods return parsed JSON (or a small projection); callers catch
 * OpenCodeError and map `.kind` onto honest health states.
 */
/**
 * Normalise a model selector into OpenCode's `Model.Ref`
 * (`{id, providerID, variant?}`).
 *
 * Accepts `"provider/model"` (provider = first `/` segment, so
 * `vercel/recursive/flint-v1.0` works) or an object already shaped like a ref.
 * Returns null for anything unusable, so callers fall back to the session or
 * global default instead of sending a bad request.
 */
export function modelRef(model) {
  if (!model) return null;
  if (typeof model === 'string') {
    const i = model.indexOf('/');
    if (i <= 0 || i === model.length - 1) return null;
    return { providerID: model.slice(0, i), id: model.slice(i + 1) };
  }
  if (typeof model === 'object' && typeof model.id === 'string' && typeof model.providerID === 'string') {
    const ref = { id: model.id, providerID: model.providerID };
    if (typeof model.variant === 'string' && model.variant) ref.variant = model.variant;
    return ref;
  }
  return null;
}

export class OpenCodeClient {
  #url;
  #password;
  #timeoutMs;
  #streamAbort = null;
  #streamStopped = true;
  #streamLoop = null;

  constructor(config, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.#url = config.url;
    this.#password = config.password;
    this.#timeoutMs = timeoutMs;
    /** 'connecting' | 'connected' | 'reconnecting' | 'closed' */
    this.streamState = 'connecting';
    this.lastStreamError = null;
    this.lastEventAt = null;
    this.lastConnectAt = null;
  }

  /** OpenCode base URL (no credentials in it). */
  get url() {
    return this.#url;
  }

  get hasPassword() {
    return Boolean(this.#password);
  }

  get timeoutMs() {
    return this.#timeoutMs;
  }

  #headers(extra = {}) {
    const headers = { accept: 'application/json', ...extra };
    if (this.#password) {
      const token = Buffer.from(`${AUTH_USER}:${this.#password}`, 'utf8').toString('base64');
      headers.authorization = `Basic ${token}`;
    }
    return headers;
  }

  /**
   * Single HTTP request with a hard timeout.
   * @returns {Promise<any>} parsed body (null for empty bodies)
   */
  async request(pathname, { method = 'GET', body, query, timeoutMs } = {}) {
    const url = new URL(`${this.#url}${pathname}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs ?? this.#timeoutMs);

    const label = pathname.split('?')[0];
    try {
      const response = await fetch(url, {
        method,
        headers: this.#headers(
          body !== undefined ? { 'content-type': 'application/json' } : {},
        ),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new OpenCodeError('OpenCode rejected the bridge credentials', {
          kind: 'unauthorized',
          status: response.status,
        });
      }

      const text = await response.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (!response.ok) {
        // Keep OpenCode's own reason visible (e.g. "Invalid attachment URI",
        // "provider.auth") — the UI must be able to say *why* a command failed.
        const detail =
          parsed && typeof parsed === 'object' && typeof parsed.message === 'string' && parsed.message
            ? `: ${parsed.message}`
            : '';
        throw new OpenCodeError(`OpenCode HTTP ${response.status}${detail} for ${label}`, {
          kind: response.status === 404 ? 'notfound' : 'http',
          status: response.status,
        });
      }
      return parsed;
    } catch (error) {
      if (error instanceof OpenCodeError) throw error;
      if (timedOut) {
        throw new OpenCodeError(`OpenCode request timed out (${label})`, { kind: 'timeout' });
      }
      const message = /timeout|abort/i.test(String(error?.message))
        ? `OpenCode request timed out (${label})`
        : 'OpenCode is unreachable';
      throw new OpenCodeError(message, { kind: 'unreachable', status: null });
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- discovery / health -------------------------------------------------

  /** GET /api/info — also used as the connectivity probe. */
  async info() {
    return this.request('/api/info');
  }

  /** Honest connectivity state for `health.opencode`. */
  async probe() {
    try {
      const info = await this.info();
      return { state: 'ok', info };
    } catch (error) {
      return {
        state: error.kind === 'unauthorized' ? 'unauthorized' : 'unreachable',
        error: error.message,
      };
    }
  }

  // ---- sessions -----------------------------------------------------------

  async listSessions({ limit = 50, order = 'desc', directory, parentID } = {}) {
    const result = await this.request('/api/session', {
      query: { limit, order, directory, parentID },
    });
    return result || { data: [] };
  }

  async getSession(sessionID) {
    const result = await this.request(`/api/session/${encodeURIComponent(sessionID)}`);
    return result?.data ?? result ?? null;
  }

  /** PATCH /api/session/{id} — mutable properties (title / archived / …). */
  async updateSession(sessionID, patch) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  /** POST /api/session/{id}/model — switch the model of an existing session. */
  async selectModel(sessionID, model) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/model`, {
      method: 'POST',
      body: { model },
    });
  }

  /** DELETE /api/session/{id} — deletes the session and its child sessions. */
  async deleteSession(sessionID) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}`, { method: 'DELETE' });
  }

  /** Create a session inside `directory` (location is required for the demo). */
  async createSession({ title, directory, model } = {}) {
    const body = {};
    if (title) body.title = title;
    if (directory) body.location = { directory };
    // Explicit model keeps new sessions off a paid/inaccessible default
    // (a free-tier account gets 403 provider.auth on models like qwen4-max).
    const ref = modelRef(model);
    if (ref) body.model = ref;
    const result = await this.request('/api/session', { method: 'POST', body });
    return result?.data ?? result ?? null;
  }

  async listMessages(sessionID, { limit = 120, order = 'asc' } = {}) {
    const result = await this.request(
      `/api/session/${encodeURIComponent(sessionID)}/message`,
      { query: { limit, order } },
    );
    return result || { data: [] };
  }

  async prompt(sessionID, text, files = null) {
    const body = { text };
    // `files` are PromptInput.FileAttachment objects; only pass them when the
    // caller supplied at least one, so the plain-text path stays byte-identical.
    if (Array.isArray(files) && files.length > 0) body.files = files;
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/prompt`, {
      method: 'POST',
      body,
      timeoutMs: Math.max(this.#timeoutMs, 15_000),
    });
  }

  /**
   * GET /api/fs/list — one directory of the workspace.
   * `path` is relative to `directory` (OpenCode's own convention).
   */
  async fsList(directory, path = '.') {
    return this.request('/api/fs/list', {
      query: {
        'location[directory]': directory,
        path,
      },
    });
  }

  /** GET /api/fs/find — workspace-wide path search by file name. */
  async fsFind(directory, query, limit = 8) {
    return this.request('/api/fs/find', {
      query: {
        'location[directory]': directory,
        query,
        limit,
      },
    });
  }

  async interrupt(sessionID) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/interrupt`, {
      method: 'POST',
      timeoutMs: Math.max(this.#timeoutMs, 15_000),
    });
  }

  // ---- permissions --------------------------------------------------------

  /** Pending asks for a location (deepObject query: `location[directory]`). */
  async listPermissions(directory) {
    const result = await this.request('/api/permission/request', {
      query: directory ? { 'location[directory]': directory } : undefined,
    });
    return result || { data: [] };
  }

  async sessionPermissions(sessionID) {
    const result = await this.request(
      `/api/session/${encodeURIComponent(sessionID)}/permission`,
    );
    return result || { data: [] };
  }

  async replyPermission(sessionID, requestID, decision, message = null) {
    return this.request(
      `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
      { method: 'POST', body: { decision, message } },
    );
  }

  // ---- processes ----------------------------------------------------------

  async listShell(directory) {
    const result = await this.request('/api/shell', {
      query: directory ? { 'location[directory]': directory } : undefined,
    });
    return result || { data: [] };
  }

  async listPty(directory) {
    const result = await this.request('/api/pty', {
      query: directory ? { 'location[directory]': directory } : undefined,
    });
    return result || { data: [] };
  }

  async listJobs(sessionID) {
    const result = await this.request('/api/experimental/job', {
      query: sessionID ? { sessionID } : undefined,
    });
    return result || { data: [] };
  }

  // ---- models / stats -----------------------------------------------------

  /** Full model catalogue (~526 KB); callers cache it (contract §3 / task spec). */
  async listModels(directory) {
    const result = await this.request('/api/model', {
      query: directory ? { 'location[directory]': directory } : undefined,
      timeoutMs: Math.max(this.#timeoutMs, 20_000),
    });
    return result || { data: [] };
  }

  /** GET /api/agent — the real agent catalogue (build / plan / subagents …). */
  async listAgents(directory) {
    const result = await this.request('/api/agent', {
      query: directory ? { 'location[directory]': directory } : undefined,
      timeoutMs: Math.max(this.#timeoutMs, 20_000),
    });
    return result || { data: [] };
  }

  /** POST /api/session/{id}/agent — switch the agent used by a session. */
  async selectAgent(sessionID, agent) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/agent`, {
      method: 'POST',
      body: { agent },
    });
  }

  /** GET /api/fs/read/{path} — raw bytes (this endpoint streams, it is not JSON). */
  async readFile(directory, relativePath) {
    const encoded = String(relativePath)
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = new URL(`${this.#url}/api/fs/read/${encoded}`);
    if (directory) url.searchParams.set('location[directory]', directory);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(this.#timeoutMs, 20_000));
    try {
      const response = await fetch(url, {
        headers: this.#headers({ accept: '*/*' }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new OpenCodeError('OpenCode rejected the bridge credentials', {
          kind: 'unauthorized',
          status: response.status,
        });
      }
      if (response.status === 404) {
        throw new OpenCodeError('file not found', { kind: 'notfound', status: 404 });
      }
      if (!response.ok) {
        throw new OpenCodeError(`OpenCode HTTP ${response.status} for /api/fs/read`, {
          kind: 'http',
          status: response.status,
        });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType: response.headers.get('content-type') ?? null };
    } catch (error) {
      if (error instanceof OpenCodeError) throw error;
      if (timedOut) throw new OpenCodeError('reading the file timed out', { kind: 'timeout' });
      throw new OpenCodeError(error?.message || 'could not read the file', { kind: 'network' });
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /api/command — commands advertised by the agent (init / review / goal …). */
  async listCommands(directory) {
    const result = await this.request('/api/command', {
      query: directory ? { 'location[directory]': directory } : undefined,
      timeoutMs: Math.max(this.#timeoutMs, 20_000),
    });
    return result || { data: [] };
  }

  /** POST /api/session/{id}/command — run an agent command (204, fire-and-forget). */
  async sendCommand(sessionID, body) {
    return this.request(`/api/session/${encodeURIComponent(sessionID)}/command`, {
      method: 'POST',
      body,
    });
  }

  async sessionStats() {
    return this.request('/api/experimental/session/stats');
  }

  // ---- SSE subscription ---------------------------------------------------

  /**
   * Subscribe to `/api/event`.
   * @param {(event:object)=>void} onEvent  called per parsed SSE data payload
   * @param {(state:string, error?:OpenCodeError)=>void} onState
   */
  startStream({ onEvent, onState = () => {} }) {
    if (this.#streamLoop) return this.#streamLoop;
    this.#streamStopped = false;
    this.#streamLoop = this.#runStreamLoop(onEvent, onState);
    return this.#streamLoop;
  }

  async stopStream() {
    this.#streamStopped = true;
    this.streamState = 'closed';
    if (this.#streamAbort) this.#streamAbort.abort();
    const loop = this.#streamLoop;
    this.#streamLoop = null;
    if (loop) await loop.catch(() => {});
  }

  async #runStreamLoop(onEvent, onState) {
    let attempt = 0;
    while (!this.#streamStopped) {
      this.streamState = attempt === 0 ? 'connecting' : 'reconnecting';
      onState(this.streamState);
      const controller = new AbortController();
      this.#streamAbort = controller;
      let lastByteAt = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastByteAt > STREAM_STALL_MS) controller.abort();
      }, 5_000);

      try {
        const response = await fetch(`${this.#url}/api/event`, {
          headers: this.#headers({ accept: 'text/event-stream', 'cache-control': 'no-cache' }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const kind =
            response.status === 401 || response.status === 403 ? 'unauthorized' : 'http';
          throw new OpenCodeError(`OpenCode event stream HTTP ${response.status}`, {
            kind,
            status: response.status,
          });
        }

        attempt = 0; // connected: reset backoff
        this.streamState = 'connected';
        this.lastStreamError = null;
        this.lastConnectAt = Date.now();
        onState('connected');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          lastByteAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '');
            buffer = buffer.slice(newlineIndex + 1);
            if (!rawLine) continue;
            if (rawLine.startsWith(':')) continue; // ": heartbeat" comment
            if (!rawLine.startsWith('data:')) continue;
            const payload = rawLine.slice(5).trim();
            if (!payload) continue;
            let event;
            try {
              event = JSON.parse(payload);
            } catch {
              continue; // malformed frame: skip, never crash the bridge
            }
            this.lastEventAt = Date.now();
            try {
              onEvent(event);
            } catch {
              // Consumer-side errors must not kill the subscription.
            }
          }
        }
      } catch (error) {
        if (this.#streamStopped) break;
        const kind = error instanceof OpenCodeError ? error.kind : 'unreachable';
        this.lastStreamError =
          kind === 'unauthorized'
            ? 'event stream unauthorized'
            : 'event stream disconnected';
        onState('reconnecting', error instanceof OpenCodeError ? error : undefined);
        if (kind === 'unauthorized') {
          // Bad credentials: still retry, but slowly, so health flips back if fixed.
          attempt = Math.max(attempt, 3);
        }
      } finally {
        clearInterval(watchdog);
      }

      if (this.#streamStopped) break;
      this.streamState = 'reconnecting';
      attempt += 1;
      const delay =
        Math.min(STREAM_BACKOFF_MAX_MS, STREAM_BACKOFF_BASE_MS * 2 ** Math.min(attempt, 5)) +
        Math.floor(Math.random() * 250);
      this.#streamAbort = null;
      await sleep(delay);
    }
    this.streamState = 'closed';
    onState('closed');
  }
}
