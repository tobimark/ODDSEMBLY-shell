/**
 * Single workbench store.
 *
 * Design rules (these are what keep the metrics trustworthy):
 *   - The server computes every metric once. The client NEVER derives a metric
 *     from a different source; it only renders numbers that arrive in the
 *     snapshot.
 *   - Snapshots are versioned; an out-of-order/older snapshot is dropped, so a
 *     reconnect cannot rewind or double-apply state.
 *  - Streaming arrives as whole snapshots (coalesced server-side at <=10 Hz)
 *     rather than deltas: no client-side merge means no merge bugs.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createContext, useContext } from 'react';
import type { WorkbenchSnapshot } from './types';
import { emptySnapshot } from './types';
import {
  deleteSession as deleteSessionRequest,
  fetchSnapshot,
  patchSessionTitle,
  postCreateSession,
  postInterrupt,
  postPermission,
  postCommand,
  postPrompt,
  postSelectAgent,
  postSelectModel,
  postSelectSession,
} from './client';

type Listener = () => void;

class WorkbenchStore {
  private snapshot: WorkbenchSnapshot = emptySnapshot();
  private listeners = new Set<Listener>();
  private source: EventSource | null = null;
  private pollTimer: number | null = null;
  private connectAttempt = 0;
  private started = false;
  /** Last command failure, surfaced in the UI without corrupting the snapshot. */
  private lastError: string | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WorkbenchSnapshot => this.snapshot;

  getLastError = (): string | null => this.lastError;

  /** Idempotent: StrictMode double-mount and HMR both call this. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.source?.close();
    this.source = null;
    if (this.pollTimer != null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private apply(next: WorkbenchSnapshot): void {
    // Drop stale frames (a reconnect can deliver an older build first).
    if (next.version < this.snapshot.version) return;
    if (next.version === this.snapshot.version && next.serverTime <= this.snapshot.serverTime) return;
    this.snapshot = next;
    this.emit();
  }

  async refresh(): Promise<void> {
    try {
      this.apply(await fetchSnapshot());
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  private connect(): void {
    if (!this.started) return;
    try {
      this.source?.close();
      const es = new EventSource('/api/events');
      this.source = es;
      es.onopen = () => {
        this.connectAttempt = 0;
        if (this.pollTimer != null) {
          window.clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      };
      es.onmessage = (ev) => {
        try {
          this.apply(JSON.parse(ev.data) as WorkbenchSnapshot);
        } catch {
          /* malformed frame: ignore, next snapshot supersedes it */
        }
      };
      es.onerror = () => {
        // EventSource retries on its own; add a poll fallback so the UI still
        // updates if the SSE channel is wedged behind a proxy.
        this.connectAttempt += 1;
        if (this.pollTimer == null) {
          this.pollTimer = window.setInterval(() => void this.refresh(), 2000);
        }
        if (this.connectAttempt > 6) {
          // Hard cycling: recreate the EventSource (some proxies never recover).
          window.setTimeout(() => this.connect(), 1500);
        }
      };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      window.setTimeout(() => this.connect(), 2000);
    }
  }

  /* ------------------------------------------------------------- commands */

  async prompt(text: string, files?: Array<{ uri: string; name?: string }> | null): Promise<void> {
    const body = text.trim();
    if (!body) return;
    this.lastError = null;
    try {
      await postPrompt(body, this.snapshot.activeSessionId, files ?? null);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      this.#recoverStale(err);
      throw err;
    }
  }

  /** Run an agent command (`/name args`) instead of a plain prompt. */
  async command(
    name: string,
    text: string,
    files?: Array<{ uri: string; name?: string }> | null,
  ): Promise<void> {
    this.lastError = null;
    try {
      await postCommand(name, text, this.snapshot.activeSessionId, files ?? null);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      this.#recoverStale(err);
      throw err;
    }
  }

  /**
   * A 404 here means the active session vanished (deleted in another window,
   * or a stale snapshot after a project switch). That is not a user error worth
   * pinning on the composer: re-sync so the UI lands on a session that exists.
   */
  #recoverStale(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|not found|不存在/i.test(message)) void this.refresh();
  }

  async interrupt(): Promise<void> {
    this.lastError = null;
    try {
      await postInterrupt(this.snapshot.activeSessionId);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  async selectSession(id: string): Promise<void> {
    this.lastError = null;
    try {
      await postSelectSession(id);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  async createSession(
    title?: string,
    model?: { providerID: string; id: string } | null,
  ): Promise<void> {
    this.lastError = null;
    try {
      await postCreateSession(title, model ?? null);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  /** Delete a session; the bridge re-selects a survivor when it was active. */
  async deleteSession(id: string): Promise<void> {
    this.lastError = null;
    try {
      await deleteSessionRequest(id);
      await this.refresh();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    }
  }

  /** Switch the model of the active session (real OpenCode selection). */
  async selectModel(model: { providerID: string; id: string }): Promise<void> {
    this.lastError = null;
    try {
      await postSelectModel(model, this.snapshot.activeSessionId);
      await this.refresh();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    }
  }

  /** Switch the agent of the active session (real OpenCode selection). */
  async selectAgent(agent: string): Promise<void> {
    this.lastError = null;
    try {
      await postSelectAgent(agent, this.snapshot.activeSessionId);
      await this.refresh();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    }
  }

  /** Rename the active session. */
  async renameSession(title: string): Promise<void> {
    this.lastError = null;
    try {
      await patchSessionTitle(title, this.snapshot.activeSessionId);
      await this.refresh();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
      throw err;
    }
  }

  async respondPermission(requestID: string, decision: 'once' | 'always' | 'reject'): Promise<void> {
    this.lastError = null;
    try {
      await postPermission(requestID, decision);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }
}

let singleton: WorkbenchStore | null = null;

export function getStore(): WorkbenchStore {
  if (!singleton) singleton = new WorkbenchStore();
  return singleton;
}

const StoreContext = createContext<WorkbenchStore | null>(null);

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  const store = getStore();
  useEffect(() => {
    store.start();
    return () => {
      // Keep the store alive across StrictMode remounts; only stop on real
      // unmount (the singleton is per-document anyway).
    };
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The whole snapshot; re-renders on every server push (coalesced to <=10 Hz). */
export function useWorkbench(): WorkbenchSnapshot {
  const store = useContext(StoreContext) ?? getStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Command surface (stable identity, safe in deps). */
export function useWorkbenchActions() {
  const store = useContext(StoreContext) ?? getStore();
  return useMemo(
    () => ({
      prompt: (text: string, files?: Array<{ uri: string; name?: string }> | null) => store.prompt(text, files),
      command: (name: string, text: string, files?: Array<{ uri: string; name?: string }> | null) =>
        store.command(name, text, files),
      interrupt: () => store.interrupt(),
      selectSession: (id: string) => store.selectSession(id),
      createSession: (title?: string, model?: { providerID: string; id: string } | null) =>
        store.createSession(title, model),
      selectModel: (model: { providerID: string; id: string }) => store.selectModel(model),
      selectAgent: (agent: string) => store.selectAgent(agent),
      renameSession: (title: string) => store.renameSession(title),
      deleteSession: (id: string) => store.deleteSession(id),
      respondPermission: (id: string, d: 'once' | 'always' | 'reject') => store.respondPermission(id, d),
      refresh: () => store.refresh(),
    }),
    [store],
  );
}

/** Last command error (not part of the snapshot: it is UI-local). */
export function useWorkbenchError(): string | null {
  const store = useContext(StoreContext) ?? getStore();
  return useSyncExternalStore(store.subscribe, store.getLastError, store.getLastError);
}

/**
 * A 1 Hz clock for relative timestamps ("12秒前", elapsed). Isolated so that
 * ticking does not re-render the whole workbench.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
