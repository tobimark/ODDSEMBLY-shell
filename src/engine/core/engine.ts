import { Application, Container } from 'pixi.js';
import { T } from '../theme';
import { AudioEngine } from './audio';
import { EventBus } from './bus';
import { DESIGN } from './design';
import { MODE_META, createMode, type ModeRuntime, type VisualMode } from './mode';
import { fetchReplay, ReplayPlayer, replayToolEvent } from './replay';
import { AgentSimulator } from './simulator';
import { LiveFeed } from '../../live/feedClient';
import { decidePlay } from '../../live/pacing';
import { emptyLiveStatus, type LiveCallMessage, type LiveLinkMessage, type LiveStatus } from '../../live/protocol';
import {
  TOOL_NAMES,
  type EngineState,
  type EngineStatus,
  type ModeId,
  type ToolEvent,
  type ToolName,
  type TriggerOptions,
} from './types';

export interface EngineOptions {
  autoplay?: boolean;
  /** render one frame then park the ticker; manual ticks drive everything */
  static?: boolean;
  /** no rAF autoplay of the engine clock; caller drives via tick() */
  deterministic?: boolean;
  replay?: boolean;
  mode?: ModeId;
  reducedMotion?: boolean;
  /** websocket endpoint that streams real agent tool events as JSON lines */
  feed?: string;
  replayUrl?: string;
}

const MAX_DT = 0.25;

/**
 * VisualEngine owns everything that is shared between worlds:
 * the Pixi application, the design-space layout, the event queue, the agent
 * simulator / replay transport, the audio graph, telemetry and mode switching.
 * Worlds only implement `VisualMode` and draw.
 */
export class VisualEngine {
  readonly bus: EventBus;
  readonly audio = new AudioEngine();
  private app: Application | null = null;
  /** becomes true once `app.init()` has resolved; until then `destroy()` must defer app teardown */
  private appReady = false;
  private world = new Container();
  private host = new Container();
  private modes = new Map<ModeId, VisualMode>();
  private activeId: ModeId;
  private transition: { from: VisualMode; to: VisualMode; t: number; dur: number } | null = null;
  private simulator: AgentSimulator;
  private mode: EngineState = 'idle';
  private speed = 1;
  private time = 0;
  private zoom = 1;
  private deterministic = false;
  private staticMode = false;
  private reducedMotion = false;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly resizeHandler = () => this.layout();
  private autoplayTimer = 0;
  private source: 'simulation' | 'external' = 'simulation';
  private eventTimes: number[] = [];
  private hudT = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private manualSeq = 100000;
  private replaySeq = 0;
  private replay: ReplayPlayer | null = null;
  private replayLoading: Promise<void> | null = null;
  /** real-agent link; configured with `?live=ws://…` (or the legacy `?feed=`) */
  private live: LiveFeed | null = null;
  private liveState: LiveStatus = emptyLiveStatus();
  private liveSeq = 0;
  /** true once a live endpoint is configured: synthetic input must not pollute it */
  private realtime = false;
  private readyResolve: (() => void) | null = null;
  private lastPublish = 0;
  readonly ready: Promise<void>;
  readonly replayReady: Promise<void>;
  private replayReadyResolve: (() => void) | null = null;
  private controlsBound = false;
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;

  constructor(initialMode: ModeId = 'loom') {
    this.activeId = initialMode;
    this.bus = new EventBus(initialMode, MODE_META[initialMode].title);
    this.ready = new Promise((res) => { this.readyResolve = res; });
    this.replayReady = new Promise((res) => { this.replayReadyResolve = res; });
    this.simulator = new AgentSimulator((e) => this.receive(e));
  }

  async init(container: HTMLElement, opts: EngineOptions = {}): Promise<void> {
    if (this.disposed) { this.readyResolve?.(); return; }
    this.deterministic = !!opts.deterministic;
    this.staticMode = !!opts.static;
    this.reducedMotion = !!opts.reducedMotion;
    this.activeId = opts.mode ?? this.activeId;
    this.bus.patch({ modeId: this.activeId, modeLabel: MODE_META[this.activeId].title });

    const app = new Application();
    this.app = app;
    try {
      await app.init({
        background: T.paper,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        resizeTo: container,
        preference: 'webgl',
        powerPreference: 'high-performance',
      });
    } catch (err) {
      // A failed renderer must not leak the half-built Application (or the slot).
      this.disposeApp();
      throw err;
    }
    this.appReady = true;
    // `destroy()` may run while `app.init()` is awaiting (React StrictMode, HMR,
    // fast unmount). Tear the fully-built app down here instead of touching a
    // nulled `this.app`.
    if (this.disposed) { this.disposeApp(); this.readyResolve?.(); return; }
    container.appendChild(app.canvas);

    this.world.addChild(this.host);
    app.stage.addChild(this.world);

    window.addEventListener('resize', this.resizeHandler);
    this.resizeObserver = new ResizeObserver(this.resizeHandler);
    this.resizeObserver.observe(container);

    this.ensureMode(this.activeId);
    this.layout();
    const active = this.modes.get(this.activeId)!;
    active.enter();
    active.root.visible = true;
    this.publish(true);

    app.ticker.add((ticker) => this.frame(Math.min(MAX_DT, ticker.deltaMS / 1000)));
    if (this.deterministic || this.staticMode) {
      app.ticker.stop();
      app.render();
    }

    if (opts.feed) this.attachLiveFeed(opts.feed);
    if (opts.replay) void this.startReplay({ url: opts.replayUrl, deterministic: this.deterministic });
    else this.replayReadyResolve?.();

    // Autoplay would inject synthetic tool calls; never do that when a real
    // agent stream is configured, even before its socket opens.
    if (opts.autoplay && !this.staticMode && !this.deterministic && !opts.replay && !opts.feed) {
      this.autoplayTimer = window.setTimeout(() => { if (this.mode === 'idle') this.play(); }, 1600);
    }
    requestAnimationFrame(() => this.readyResolve?.());
  }

  /* ------------------------------------------------------------------ frames */

  private frame(dt: number): void {
    if (this.disposed) return;
    this.fpsFrames += 1;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsT);
      this.fpsFrames = 0; this.fpsT = 0;
    }
    this.step(dt);
  }

  /** Advance the simulation clock by dt seconds and (in manual mode) render. */
  tick(dt = 1 / 60): void {
    this.step(Math.min(MAX_DT, Math.max(0, dt)));
    this.app?.render();
  }

  private step(dt: number): void {
    if (!this.app || this.disposed) return;
    if (this.mode === 'paused') return;
    const scaled = dt * this.speed;
    const replaying = this.source === 'external' && !!this.replay;

    if (this.mode === 'running') {
      if (!replaying) this.simulator.update(scaled);
      this.advanceReplay(scaled);
      const active = this.modes.get(this.activeId);
      active?.update(scaled, this.runtime());
      this.time += scaled;
    } else {
      // idle/stopped worlds may still idle-breathe, but engine time only runs when live
      const active = this.modes.get(this.activeId);
      active?.update(scaled, this.runtime());
    }
    this.updateTransition(scaled);
    this.hudT += dt;
    if (this.hudT > 0.1) { this.hudT = 0; this.publish(); }
  }

  private runtime(): ModeRuntime {
    return { state: this.mode, deterministic: this.deterministic, reducedMotion: this.reducedMotion, time: this.time };
  }

  private updateTransition(dt: number): void {
    if (!this.transition) return;
    const tr = this.transition;
    tr.t += dt / tr.dur;
    const k = Math.min(1, tr.t);
    const e = 1 - Math.pow(1 - k, 3);
    tr.to.root.alpha = e;
    tr.from.root.alpha = 1 - e;
    if (k >= 1) {
      tr.from.root.visible = false;
      tr.to.root.alpha = 1;
      this.transition = null;
    }
  }

  /* ------------------------------------------------------------------- modes */

  private ensureMode(id: ModeId): VisualMode {
    let mode = this.modes.get(id);
    if (mode) return mode;
    mode = createMode(id);
    const root = mode.mount({
      audio: this.audio,
      bus: this.bus,
      design: DESIGN,
      reducedMotion: this.reducedMotion,
      seed: 0x5eed + id.length * 977,
    });
    root.visible = false;
    this.host.addChild(root);
    this.modes.set(id, mode);
    return mode;
  }

  setMode(id: ModeId): void {
    if (id === this.activeId || this.disposed) return;
    const old = this.modes.get(this.activeId) ?? null;
    const next = this.ensureMode(id);
    if (old && old !== next) old.exit();
    next.enter();
    next.root.visible = true;
    if (old && old !== next) {
      next.root.alpha = this.reducedMotion ? 1 : 0;
      old.root.visible = true;
      this.transition = { from: old, to: next, t: this.reducedMotion ? 1 : 0, dur: this.reducedMotion ? 0.001 : 0.42 };
    }
    this.activeId = id;
    this.audio.whir(0);
    this.bus.patch({ modeId: id, modeLabel: (MODE_META as Record<string, { title: string }>)[id]?.title ?? 'LOOM', hud: next.hud(), state: this.mode });
    this.publish(true);
  }

  /* ------------------------------------------------------------------ events */

  private receive(e: ToolEvent, opts: TriggerOptions = {}): void {
    const active = this.modes.get(this.activeId);
    active?.trigger(e, opts);
    this.bus.emitEvent(e);
    this.eventTimes.push(this.time);
    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.mode = 'running';
      this.bus.patch({ state: 'running' });
    }
    this.publish(true);
  }

  /** External host bridge (console, tests, WebSocket feed, future Electron IPC). */
  inject(e: ToolEvent, opts: TriggerOptions = {}): void {
    if (this.mode === 'idle' || this.mode === 'stopped') this.source = 'external';
    this.receive({ ...e, at: e.at || performance.now() }, opts);
  }

  /**
   * Synthetic demo trigger (keyboard 1–5, footer buttons, capture scripts).
   * Refused while a real agent stream is attached: a fake call must never enter
   * the same counters as a real one.
   */
  trigger(type: ToolName): void {
    if (this.realtime) return;
    this.audio.ensure();
    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.source = 'external';
      this.mode = 'running';
      this.bus.patch({ state: 'running' });
    }
    const active = this.modes.get(this.activeId);
    const detail = active?.sample(type) ?? type;
    this.receive({ id: ++this.manualSeq, type, detail, at: performance.now() });
  }

  private advanceReplay(scaledDt: number): void {
    if (!this.replay) return;
    const due = this.replay.advance(scaledDt * 1000);
    for (const ev of due) {
      this.replaySeq += 1;
      this.receive(replayToolEvent(ev, this.replaySeq - 1, performance.now()));
    }
    if (this.replay.done) this.publishReplay();
  }

  async startReplay(opts: { url?: string; deterministic?: boolean; reset?: boolean } = {}): Promise<void> {
    if (this.replayLoading) await this.replayLoading;
    if (opts.deterministic) {
      this.deterministic = true;
      this.app?.ticker.stop();
    }
    this.replayLoading = (async () => {
      try {
        const file = await fetchReplay(this.activeId, opts.url);
        if (this.disposed) return;
        this.simulator.stop();
        if (opts.reset !== false) this.modes.get(this.activeId)?.reset();
        this.replaySeq = 0;
        this.replay = new ReplayPlayer(file);
        this.source = 'external';
        this.mode = 'running';
        this.bus.patch({ state: 'running' });
        this.publishReplay();
        if (this.deterministic || this.staticMode) this.app?.render();
      } catch (err) {
        console.error('replay failed', err);
        throw err;
      } finally {
        this.replayReadyResolve?.();
      }
    })();
    return this.replayLoading;
  }

  private publishReplay(): void {
    const r = this.replay;
    this.bus.patch({
      replay: r ? { loaded: true, cursor: r.cursor, total: r.total, done: r.done } : null,
    });
  }

  /* ---------------------------------------------------------------- transport */

  play(simulate = true): void {
    this.audio.ensure();
    // In real mode the only source of events is the agent stream.
    const sim = simulate && !this.realtime;
    this.mode = 'running';
    this.source = sim ? 'simulation' : 'external';
    if (sim) this.simulator.start(); else this.simulator.stop();
    this.modes.get(this.activeId)?.setState?.('running');
    this.bus.patch({ state: 'running' });
    this.publish(true);
  }

  pause(): void {
    this.mode = 'paused';
    this.simulator.pause();
    this.audio.whir(0);
    this.modes.get(this.activeId)?.setState?.('paused');
    this.bus.patch({ state: 'paused' });
    this.publish(true);
  }

  resume(): void {
    this.audio.ensure();
    this.mode = 'running';
    if (this.source === 'simulation') this.simulator.resume();
    this.modes.get(this.activeId)?.setState?.('running');
    this.bus.patch({ state: 'running' });
    this.publish(true);
  }

  stop(): void {
    this.mode = 'stopped';
    this.simulator.stop();
    this.modes.get(this.activeId)?.setState?.('stopped');
    this.audio.whir(0);
    this.bus.patch({ state: 'stopped', rate15s: 0 });
    this.eventTimes = [];
    this.publish(true);
  }

  resetAll(): void {
    for (const mode of this.modes.values()) mode.reset();
    this.eventTimes = [];
    this.replay = null;
    this.replaySeq = 0;
    this.mode = 'idle';
    this.time = 0;
    this.bus.patch({ events: 0, rate15s: 0, replay: null, state: 'idle', time: 0 });
    for (const t of TOOL_NAMES) this.bus.status.counts[t] = 0;
    this.publish(true);
  }

  setSpeed(s: number): void {
    if (!Number.isFinite(s) || s <= 0) return;
    this.speed = s;
    this.bus.patch({ speed: s });
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
    this.bus.patch({ muted: m });
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0.2, Math.min(3, z));
    this.layout();
  }

  setReducedMotion(r: boolean): void {
    this.reducedMotion = r;
    this.bus.patch({});
  }

  /* ------------------------------------------------------------------- HUD */

  private publish(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastPublish < 60) return;
    this.lastPublish = now;
    const active = this.modes.get(this.activeId);
    const windowStart = this.time - 15;
    this.eventTimes = this.eventTimes.filter((t) => t >= windowStart);
    const status: Partial<EngineStatus> = {
      state: this.mode,
      modeId: this.activeId,
      modeLabel: MODE_META[this.activeId].title,
      time: this.time,
      fps: this.fps,
      rate15s: this.eventTimes.length,
      hud: active?.hud() ?? this.bus.status.hud,
      live: this.live ? this.liveSnapshot() : null,
    };
    if (this.replay) {
      status.replay = { loaded: true, cursor: this.replay.cursor, total: this.replay.total, done: this.replay.done };
    }
    this.bus.patch(status);
  }

  private publishReplayState(): void { this.publishReplay(); }

  get status(): EngineStatus { return this.bus.status; }
  get currentMode(): VisualMode | undefined { return this.modes.get(this.activeId); }
  get activeModeId(): ModeId { return this.activeId; }
  /** live mode instance (debug/QA only; visuals stay owned by the mode) */
  modeInstance(id: ModeId = this.activeId): VisualMode | undefined { return this.modes.get(id); }
  modeTelemetry(id: ModeId = this.activeId): Record<string, unknown> {
    return this.modes.get(id)?.telemetry() ?? {};
  }
  get audioEngine(): AudioEngine { return this.audio; }
  get clockTime(): number { return this.time; }
  get isDeterministic(): boolean { return this.deterministic; }

  telemetrySnapshot(): Record<string, unknown> {
    return {
      time: this.time,
      state: this.mode,
      mode: this.activeId,
      events: this.bus.status.events,
      replay: this.replay ? { cursor: this.replay.cursor, total: this.replay.total, done: this.replay.done, elapsedMs: this.replay.elapsedMs } : null,
      modes: Object.fromEntries([...this.modes.entries()].map(([id, m]) => [id, m.telemetry()])),
    };
  }

  /* --------------------------------------------------------------- plumbing */

  /**
   * Attach a real agent stream. The page URL is `?mode=loom&live=ws://host:port`.
   * Classification and dedupe live in `src/live/*`; pacing in `pacing.ts`; this
   * method only turns accepted calls into engine events.
   */
  attachLiveFeed(url: string): void {
    this.live?.stop();
    this.realtime = true;
    this.simulator.stop();
    this.liveState = { ...emptyLiveStatus(), state: 'connecting', url, realtime: true };
    const feed = new LiveFeed(url, {
      onCall: (m) => this.onLiveCall(m),
      onLink: (m) => this.onLiveLink(m),
    });
    this.live = feed;
    feed.start();
    this.bus.patch({ live: this.liveSnapshot() });
  }

  private onLiveCall(msg: LiveCallMessage): void {
    const s = this.liveState;

    if (msg.phase === 'detail') {
      if (s.lastCall?.callId === msg.callId && msg.detail) s.lastCall = { ...s.lastCall, detail: msg.detail };
      return;
    }

    if (msg.phase === 'recovered') {
      // Rebuilt from the session log after a gap: counted, never replayed as if
      // it had been observed live.
      s.calls += 1;
      s.recovered += 1;
      this.countStatus(s, msg.status);
      s.lastCall = { callId: msg.callId, tool: msg.tool, cls: msg.cls, status: msg.status, error: null, at: msg.at, detail: msg.detail };
      this.publish(true);
      return;
    }

    if (msg.phase === 'status') {
      s.statuses.running = Math.max(0, s.statuses.running - 1);
      if (msg.status === 'success') s.statuses.success += 1;
      else if (msg.status === 'failed') s.statuses.failed += 1;
      else if (msg.status === 'aborted') s.statuses.aborted += 1;
      if (s.lastCall?.callId === msg.callId) {
        s.lastCall = { ...s.lastCall, status: msg.status, error: msg.error ?? null };
      }
      this.publish(true);
      return;
    }

    // phase === 'start'
    s.calls += 1;
    s.lastCall = { callId: msg.callId, tool: msg.tool, cls: msg.cls, status: msg.status, error: null, at: msg.at, detail: msg.detail };

    if (!msg.cls) {
      // No faithful Loom class: record it, name it, never dress it up.
      s.unmapped += 1;
      s.unmappedTools[msg.tool] = (s.unmappedTools[msg.tool] ?? 0) + 1;
      this.countStatus(s, msg.status);
      this.publish(true);
      return;
    }

    s.mapped += 1;
    const play = decidePlay(this.pendingPicks());
    if (play === 'fold') s.folded += 1; else s.played += 1;
    this.countStatus(s, msg.status);
    this.inject({ id: ++this.liveSeq, type: msg.cls, detail: msg.detail || msg.tool, at: performance.now() }, { play });
  }

  private countStatus(s: LiveStatus, status: LiveCallMessage['status']): void {
    if (status === 'running') s.statuses.running += 1;
    else if (status === 'success') s.statuses.success += 1;
    else if (status === 'failed') s.statuses.failed += 1;
    else s.statuses.aborted += 1;
  }

  private onLiveLink(msg: LiveLinkMessage): void {
    const s = this.liveState;
    if (msg.server) s.server = msg.server;
    if (msg.state === 'connected' || msg.state === 'reconnected') s.state = 'connected';
    else if (msg.state === 'reconnecting') s.state = 'reconnecting';
    else if (msg.state === 'closed') s.state = 'closed';
    else if (msg.state === 'gap') {
      s.state = 'connected';
      s.gaps += 1;
      s.recovered += msg.recovered ?? 0;
      s.lastGap = { at: msg.at, recovered: msg.recovered ?? 0, missed: msg.missed ?? 'unknown' };
    }
    this.publish(true);
  }

  /** Waiting mechanical picks (the Loom's own queue depth). */
  private pendingPicks(): number {
    const t = this.modeTelemetry(this.activeId) as { queued?: unknown };
    return typeof t.queued === 'number' ? t.queued : 0;
  }

  liveSnapshot(): LiveStatus {
    return { ...this.liveState, statuses: { ...this.liveState.statuses }, unmappedTools: { ...this.liveState.unmappedTools } };
  }

  get liveStatus(): LiveStatus { return this.liveSnapshot(); }
  get isRealtime(): boolean { return this.realtime; }

  private layout(): void {
    if (!this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w / DESIGN.w, h / DESIGN.h) * this.zoom;
    this.world.scale.set(scale);
    this.world.position.set((w - DESIGN.w * scale) / 2, (h - DESIGN.h * scale) / 2);
    // No page-level side effects: the engine is also mounted inside a host shell
    // whose own paper colour must win.
  }

  bindKeyboard(): void {
    if (this.controlsBound) return;
    this.controlsBound = true;
    this.keyHandler = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (this.mode === 'running') this.pause();
        else if (this.mode === 'paused') this.resume();
        else this.play();
      }
      if (ev.key === 'm' || ev.key === 'M') { this.setMuted(!this.bus.status.muted); }
      if (ev.key === '[' || ev.key === ']') {
        const order: ModeId[] = ['loom'];
        const i = order.indexOf(this.activeId);
        const n = ev.key === ']' ? (i + 1) % order.length : (i + order.length - 1) % order.length;
        this.setMode(order[n]);
      }
      const n = Number(ev.key);
      if (n >= 1 && n <= 5) this.trigger(TOOL_NAMES[n - 1]);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  destroy(): void {
    this.disposed = true;
    clearTimeout(this.autoplayTimer);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
    this.simulator.stop();
    this.live?.stop();
    this.live = null;
    this.audio.destroy();
    for (const mode of this.modes.values()) { try { mode.destroy(); } catch { /* noop */ } }
    this.modes.clear();
    // If init() is still awaiting app.init(), it owns teardown and calls
    // disposeApp() once the renderer exists. Destroying a half-built Application
    // here would leave it partially torn down and leak its canvas/WebGL context.
    if (!this.appReady) return;
    this.disposeApp();
  }

  private disposeApp(): void {
    const app = this.app;
    this.app = null;
    this.appReady = false;
    if (!app) return;
    try { app.destroy(true, { children: true }); } catch { /* noop */ }
  }
}
