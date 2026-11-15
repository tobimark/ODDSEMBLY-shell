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
    container.appendChild(this.app.canvas);

    this.world = new Container();
    this.scene = new LoomScene();
    this.world.addChild(this.scene);
    this.app.stage.addChild(this.world);

    const resize = () => this.layout();
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(container);

    this.app.ticker.add(() => this.tick());
    this.layout();
    this.bus.subscribe((s) => this.scene?.setStatus(s));
    this.bus.patch({ state: 'idle' });

    if (opts.autoplay && !this.staticMode) {
      window.setTimeout(() => { if (this.mode === 'idle') this.play(); }, 1600);
    }
    // one rendered frame
    requestAnimationFrame(() => this.readyResolve?.());
    this.readyResolve?.();
  }

  private layout(): void {
    if (!this.app || !this.world) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w / DESIGN.w, h / DESIGN.h) * 0.995;
    this.world.scale.set(scale);
    this.world.position.set((w - DESIGN.w * scale) / 2, (h - DESIGN.h * scale) / 2);
    // keep the page background identical to the canvas backdrop
    document.body.style.background = HEX.paper;
  }

  private tick(): void {
    if (!this.app || !this.scene) return;
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
    if (this.mode === 'paused') return;
    const running = this.mode === 'running';
    this.simulator.update(running ? dt : 0);
    this.scene.update(dt * this.speed, running);
    this.audio.whir(Math.min(1, this.rpmReport / 80));

    this.reportT += dt;
    if (this.reportT > 0.25) {
      this.reportT = 0;
      this.rpmReport = Math.min(120, this.rpmReport + (running ? 8 : -6));
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
    if (this.mode === 'idle') this.mode = 'running';
    this.bus.patch({ state: this.mode });
  }

  play(): void {
    this.audio.ensure();
    this.mode = 'running';
    this.scene?.setRunning(true);
    this.simulator.start();
    this.bus.patch({ state: 'running' });
  }

  pause(): void {
    this.mode = 'paused';
    this.simulator.pause();
    this.bus.patch({ state: 'paused' });
  }

  resume(): void {
    this.audio.ensure();
    this.mode = 'running';
    this.scene?.setRunning(true);
    this.simulator.resume();
    this.bus.patch({ state: 'running' });
  }

  stop(): void {
    this.mode = 'stopped';
    this.simulator.stop();
    this.scene?.setStopped();
    this.bus.patch({ state: 'stopped', rpm: 0 });
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.simulator.setSpeed(s);
    this.bus.patch({ speed: s });
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
    this.bus.patch({ muted: m });
  }

  trigger(type: ToolName): void {
    this.audio.ensure();
    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.mode = 'running';
      this.scene?.setRunning(true);
      this.simulator.start();
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

  destroy(): void {
    try { this.app?.destroy(true, { children: true }); } catch { /* noop */ }
    this.app = null;
  }
}
