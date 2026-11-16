import { Application, Container } from 'pixi.js';
import { T, HEX } from '../theme';
import { AudioEngine } from './audio';
import { EventBus } from './bus';
import { DESIGN } from './design';
import { MODE_META, createMode, type ModeRuntime, type VisualMode } from './mode';
import { fetchReplay, ReplayPlayer, replayToolEvent } from './replay';
import { AgentSimulator } from './simulator';
import {
  TOOL_NAMES,
  type EngineState,
  type EngineStatus,
  type ModeId,
  type ToolEvent,
  type ToolName,
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
  private feed: WebSocket | null = null;
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
    this.deterministic = !!opts.deterministic;
    this.staticMode = !!opts.static;
    this.reducedMotion = !!opts.reducedMotion;
    this.activeId = opts.mode ?? this.activeId;
    this.bus.patch({ modeId: this.activeId, modeLabel: MODE_META[this.activeId].title });

    this.app = new Application();
    await this.app.init({
      background: T.paper,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      resizeTo: container,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    if (this.disposed) { this.app.destroy(true, { children: true }); this.app = null; return; }
    container.appendChild(this.app.canvas);

    this.world.addChild(this.host);
    this.app.stage.addChild(this.world);

    window.addEventListener('resize', this.resizeHandler);
    this.resizeObserver = new ResizeObserver(this.resizeHandler);
    this.resizeObserver.observe(container);

    this.ensureMode(this.activeId);
    this.layout();
    const active = this.modes.get(this.activeId)!;
    active.enter();
    active.root.visible = true;
    this.publish(true);

    this.app.ticker.add((ticker) => this.frame(Math.min(MAX_DT, ticker.deltaMS / 1000)));
    if (this.deterministic || this.staticMode) {
      this.app.ticker.stop();
      this.app.render();
    }

    if (opts.feed) this.connectFeed(opts.feed);
    if (opts.replay) void this.startReplay({ url: opts.replayUrl, deterministic: this.deterministic });
    else this.replayReadyResolve?.();

    if (opts.autoplay && !this.staticMode && !this.deterministic && !opts.replay) {
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

  private receive(e: ToolEvent): void {
    const active = this.modes.get(this.activeId);
    active?.trigger(e);
    this.bus.emitEvent(e);
    this.eventTimes.push(this.time);
    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.mode = 'running';
      this.bus.patch({ state: 'running' });
    }
    this.publish(true);
  }

  /** External host bridge (console, tests, WebSocket feed, future Electron IPC). */
  inject(e: ToolEvent): void {
    if (this.mode === 'idle' || this.mode === 'stopped') this.source = 'external';
    this.receive({ ...e, at: e.at || performance.now() });
  }

  trigger(type: ToolName): void {
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
    this.mode = 'running';
    this.source = simulate ? 'simulation' : 'external';
    if (simulate) this.simulator.start(); else this.simulator.stop();
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

  private connectFeed(url: string): void {
    try {
      const ws = new WebSocket(url);
      this.feed = ws;
      ws.onopen = () => { this.play(false); this.audio.ensure(); };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data)) as { type?: string; tool?: string; detail?: string; id?: number };
          const raw = (data.type ?? data.tool ?? '').toLowerCase();
          const map: Record<string, ToolName> = {
            read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', search: 'Search', grep: 'Search', glob: 'Search',
          };
          const type = map[raw];
          if (!type) return;
          this.inject({ id: data.id ?? ++this.manualSeq, type, detail: data.detail ?? raw, at: performance.now() });
        } catch { /* ignore malformed frames */ }
      };
      ws.onerror = () => console.warn('event feed failed', url);
    } catch (e) { console.warn('event feed unavailable', e); }
  }

  private layout(): void {
    if (!this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w / DESIGN.w, h / DESIGN.h) * this.zoom;
    this.world.scale.set(scale);
    this.world.position.set((w - DESIGN.w * scale) / 2, (h - DESIGN.h * scale) / 2);
    document.body.style.background = HEX.paper;
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
    this.feed?.close();
    this.audio.destroy();
    for (const mode of this.modes.values()) { try { mode.destroy(); } catch { /* noop */ } }
    this.modes.clear();
    if (!this.app) return;
    try { this.app.destroy(true, { children: true }); } catch { /* noop */ }
    this.app = null;
  }
}
