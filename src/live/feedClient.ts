/**
 * Resilient WebSocket client for the live agent feed.
 *
 * Responsibilities kept here (and nowhere else):
 *   - reconnect with capped exponential backoff + jitter;
 *   - one logical record per tool-call id: a duplicate `start` is dropped, a
 *     repeated `status` transition is dropped, so a reconnect cannot replay
 *     already-processed calls;
 *   - gap reporting: the upstream stream is volatile, so a reconnect is always
 *     announced as `reconnected` and, if recoverable data existed, `gap`;
 *   - legacy frames (`{type, detail, id}`) still accepted for the old bridge.
 *
 * It knows nothing about Pixi, the Loom, or React.
 */
import { classifyTool, isLiveCallStatus } from './classify';
import type { LiveCallMessage, LiveCallStatus, LiveLinkMessage, LiveMessage } from './protocol';

export interface LiveFeedHandlers {
  onCall(msg: LiveCallMessage): void;
  onLink(msg: LiveLinkMessage): void;
}

const MAX_TRACKED = 4000;

export class LiveFeed {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private retryTimer: number | null = null;
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  private readonly lastStatus = new Map<string, LiveCallStatus>();
  private legacySeq = 0;
  private connectedOnce = false;

  constructor(
    private readonly url: string,
    private readonly handlers: LiveFeedHandlers,
  ) {}

  get state(): 'connecting' | 'connected' | 'reconnecting' | 'closed' {
    if (this.stopped) return 'closed';
    if (this.ws?.readyState === WebSocket.OPEN) return 'connected';
    return this.attempt > 0 ? 'reconnecting' : 'connecting';
  }

  start(): void {
    if (this.stopped) return;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { this.ws?.close(); } catch { /* already closed */ }
    this.ws = null;
    this.handlers.onLink({ kind: 'link', state: 'closed', at: Date.now() });
  }

  private open(): void {
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      const reconnected = this.connectedOnce;
      this.connectedOnce = true;
      this.attempt = 0;
      this.handlers.onLink({ kind: 'link', state: reconnected ? 'reconnected' : 'connected', at: Date.now() });
    };

    ws.onmessage = (ev) => {
      try { this.consume(JSON.parse(String(ev.data))); } catch { /* malformed frame */ }
    };

    ws.onerror = () => { /* close handler owns recovery */ };

    ws.onclose = () => {
      if (this.stopped) return;
      this.handlers.onLink({ kind: 'link', state: 'reconnecting', at: Date.now(), retryInMs: this.nextDelay() });
      this.scheduleRetry();
    };
  }

  private nextDelay(): number {
    const base = Math.min(6000, 400 * Math.pow(1.8, this.attempt));
    return Math.round(base * (0.85 + Math.random() * 0.3));
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer !== null) return;
    const delay = this.nextDelay();
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay) as unknown as number;
  }

  private consume(msg: LiveMessage | Record<string, unknown>): void {
    if (!msg || typeof msg !== 'object') return;
    const kind = (msg as { kind?: string }).kind;

    if (kind === 'ping' || kind === 'ledger' || kind === 'hello') return;

    if (kind === 'link') {
      const link = msg as unknown as LiveLinkMessage;
      this.handlers.onLink(link);
      return;
    }

    if (kind === 'call') {
      this.consumeCall(msg as unknown as LiveCallMessage);
      return;
    }

    // Legacy frame from scripts/agent-bridge.mjs: {id, type, detail, at}
    const legacy = msg as { type?: string; tool?: string; detail?: string; id?: number; at?: number };
    const raw = legacy.type ?? legacy.tool;
    if (!raw) return;
    const callId = `legacy:${legacy.id ?? ++this.legacySeq}`;
    this.consumeCall({
      kind: 'call', phase: 'start', callId,
      tool: raw, cls: classifyTool(raw),
      detail: legacy.detail ?? raw,
      status: 'running', sessionID: null, at: legacy.at ?? Date.now(),
    });
  }

  private consumeCall(msg: LiveCallMessage): void {
    if (!msg.callId || typeof msg.callId !== 'string') return;

    if (msg.phase === 'start') {
      if (this.seen.has(msg.callId)) return; // reconnect / duplicate frame
      this.markSeen(msg.callId);
      this.lastStatus.set(msg.callId, msg.status);
      this.handlers.onCall(msg);
      return;
    }

    if (msg.phase === 'status') {
      const status = isLiveCallStatus(msg.status) ? msg.status : 'failed';
      if (this.lastStatus.get(msg.callId) === status) return; // idempotent
      // A status for a call we never saw start is still real information (the
      // link may have opened mid-call) — forward it, but do not resurrect a
      // played call.
      this.lastStatus.set(msg.callId, status);
      this.handlers.onCall({ ...msg, status });
      return;
    }

    if (msg.phase === 'recovered') {
      if (this.seen.has(msg.callId)) return;
      this.markSeen(msg.callId);
      this.lastStatus.set(msg.callId, msg.status);
      this.handlers.onCall(msg);
      return;
    }

    if (msg.phase === 'detail') {
      this.handlers.onCall(msg);
    }
  }

  private markSeen(callId: string): void {
    this.seen.add(callId);
    this.seenOrder.push(callId);
    while (this.seenOrder.length > MAX_TRACKED) {
      const drop = this.seenOrder.shift();
      if (drop) { this.seen.delete(drop); this.lastStatus.delete(drop); }
    }
  }
}
