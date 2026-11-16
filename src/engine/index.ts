import { Application, Container } from 'pixi.js';
import { DESIGN } from './layout';
import { T, HEX } from './theme';
import { LoomScene } from './loom/scene';
import { EventBus, type EngineStatus, type ToolEvent, type ToolName } from './events/types';
import { AgentSimulator } from './events/simulator';
import { LoomAudio } from './audio';

export interface LoomOptions { autoplay?: boolean; static?: boolean }

export class LoomEngine {
  readonly bus = new EventBus();
  readonly audio = new LoomAudio();
  private app: Application | null = null;
  private world: Container | null = null;
  private scene: LoomScene | null = null;
  private simulator: AgentSimulator;
  private mode: EngineStatus['state'] = 'idle';
  private speed = 1;
  private rpmReport = 0;
  private reportT = 0;
  private eventTimes: number[] = [];
  private staticMode = false;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeHandler = () => this.layout();
  private autoplayTimer = 0;
  private source: 'simulation' | 'external' = 'simulation';
  private viewScale = 1;
  private readyResolve: (() => void) | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise((res) => { this.readyResolve = res; });
    this.simulator = new AgentSimulator((e) => this.handleEvent(e));
  }

  async init(container: HTMLElement, opts: LoomOptions = {}): Promise<void> {
    this.staticMode = !!opts.static;
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

    this.world = new Container();
    this.scene = new LoomScene();
    this.world.addChild(this.scene);
    this.app.stage.addChild(this.world);

    window.addEventListener('resize', this.resizeHandler);
    this.resizeObserver = new ResizeObserver(this.resizeHandler);
    this.resizeObserver.observe(container);

    this.app.ticker.add(() => this.tick());
    this.layout();
    this.bus.subscribe((s) => this.scene?.setStatus(s));
    this.bus.patch({ state: 'idle' });

    if (opts.autoplay && !this.staticMode) {
      this.autoplayTimer = window.setTimeout(() => { if (this.mode === 'idle') this.play(); }, 1600);
    }
    // one rendered frame
    requestAnimationFrame(() => this.readyResolve?.());
    this.readyResolve?.();
  }

  private layout(): void {
    if (!this.app || !this.world) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w / DESIGN.w, h / DESIGN.h) * this.viewScale;
    this.world.scale.set(scale);
    this.world.position.set((w - DESIGN.w * scale) / 2, (h - DESIGN.h * scale) / 2);
    // keep the page background identical to the canvas backdrop
    document.body.style.background = HEX.paper;
  }

  private tick(): void {
    if (!this.app || !this.scene) return;
    // elapsedMS is the real interval; deltaMS is clamped by Pixi. The mechanism
    // substeps internally, so slow renderers do not slow down the loom clock.
    const dt = Math.min(0.5, this.app.ticker.elapsedMS / 1000);
    if (this.mode === 'paused') return;
    const running = this.mode === 'running';
    this.simulator.update(running ? dt : 0);
    this.scene.update(dt * this.speed, running);
    this.audio.whir(Math.min(1, this.rpmReport / 80));

    this.reportT += dt;
    if (this.reportT > 0.25) {
      this.reportT = 0;
      this.rpmReport = this.scene.telemetry.active ? Math.round(60 / 1.65 * this.speed) : 0;
      const now = performance.now();
      this.eventTimes = this.eventTimes.filter((t) => now - t < 15000);
      this.bus.patch({ rpm: Math.round(this.rpmReport), rate15s: this.eventTimes.length });
    }

    if (this.staticMode) this.app.ticker.stop();
  }

  private handleEvent(e: ToolEvent): void {
    this.scene?.trigger(e);
    this.eventTimes.push(performance.now());
    this.bus.emitEvent(e);
    this.audio.play(e.type);
    if (this.mode === 'idle' || this.mode === 'stopped') this.mode = 'running';
    this.bus.patch({ state: this.mode });
  }

  play(simulate = true): void {
    this.audio.ensure();
    this.mode = 'running';
    this.scene?.setRunning(true);
    this.source = simulate ? 'simulation' : 'external';
    if (simulate) this.simulator.start(); else this.simulator.stop();
    this.bus.patch({ state: 'running' });
  }

  pause(): void {
    this.mode = 'paused';
    this.simulator.pause();
    this.audio.whir(0);
    this.bus.patch({ state: 'paused' });
  }

  resume(): void {
    this.audio.ensure();
    this.mode = 'running';
    this.scene?.setRunning(true);
    if (this.source === 'simulation') this.simulator.resume();
    this.bus.patch({ state: 'running' });
  }

  stop(): void {
    this.mode = 'stopped';
    this.simulator.stop();
    this.scene?.setStopped();
    this.audio.whir(0);
    this.bus.patch({ state: 'stopped', rpm: 0 });
  }

  setSpeed(s: number): void {
    if (!Number.isFinite(s) || s <= 0) return;
    this.speed = s;
    this.simulator.setSpeed(s);
    this.bus.patch({ speed: s });
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
    this.bus.patch({ muted: m });
  }

  inject(e: ToolEvent): void {
    if (this.mode === 'idle' || this.mode === 'stopped') this.source = 'external';
    this.handleEvent(e);
  }

  trigger(type: ToolName): void {
    this.audio.ensure();
    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.source = 'external';
      this.mode = 'running';
      this.scene?.setRunning(true);
      // Manual input must not silently enable an unrelated simulated feed.
      this.bus.patch({ state: 'running' });
    }
    const detailPool: Record<ToolName, string> = {
      Read: 'manual · src/engine/loom/warpField.ts',
      Edit: 'manual · src/engine/loom/scene.ts',
      Write: 'manual · src/engine/loom/particles.ts',
      Bash: 'manual · npm run build · exit 0',
      Search: 'manual · grep "heddle" src',
    };
    const e: ToolEvent = { id: Date.now() % 100000, type, detail: detailPool[type], at: performance.now() };
    this.handleEvent(e);
  }

  /** deterministic step used by the headless recorder */
  manualTick(dt: number): void {
    if (!this.app || !this.scene) return;
    this.scene.update(dt, true);
    this.app.renderer.render(this.app.stage);
  }

  get status(): EngineStatus { return this.bus.status; }
  get mechanism() { return this.scene?.telemetry; }
  setView(detail: boolean): void {
    this.viewScale = detail ? 1.65 : 1;
    document.body.dataset.loomDetail = String(detail);
    this.layout();
  }

  destroy(): void {
    this.disposed = true;
    clearTimeout(this.autoplayTimer);
    window.removeEventListener('resize', this.resizeHandler);
    this.resizeObserver?.disconnect();
    this.simulator.stop();
    this.audio.destroy();
    // An async init owns its Application until it has resolved.
    if (!this.scene) return;
    try { this.app?.destroy(true, { children: true }); } catch { /* noop */ }
    this.app = null;
  }
}
