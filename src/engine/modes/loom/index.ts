import { Container } from 'pixi.js';
import { MODE_META, type ModeContext, type ModeRuntime, type VisualMode } from '../../core/mode';
import type { EngineState, ModeHud, ToolEvent, ToolName } from '../../core/types';
import { LoomAudio } from './audio';
import { LoomScene } from './scene';

const SAMPLES: Record<ToolName, string> = {
  Read: 'manual · src/modes/loom/warpField.ts',
  Edit: 'manual · src/modes/loom/scene.ts',
  Write: 'manual · src/modes/loom/textile.ts',
  Bash: 'manual · npm run build · exit 0',
  Search: 'manual · grep "heddle" src',
};

/**
 * Loom = the first catalogue world. The mechanical assembly and its programme are
 * inherited unchanged from the Astra review-v2 baseline; only the hosting
 * interface is new, so the established visuals keep their exact geometry.
 */
export class LoomMode implements VisualMode {
  readonly meta = MODE_META.loom;
  readonly root = new Container();
  private scene: LoomScene | null = null;
  private kit: LoomAudio | null = null;
  private ctx: ModeContext | null = null;
  private state: EngineState = 'idle';
  private hudCache: ModeHud = {
    transport: 'LIVE WEAVE',
    stage: 'READY',
    fields: [
      { label: 'PICKS', value: '0' },
      { label: 'QUEUE', value: '0' },
      { label: 'SHED', value: '0%' },
    ],
    caption: '等待事件 · 每一次调用，织入一道纬线',
    hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
  };
  private hudT = 0;

  mount(ctx: ModeContext): Container {
    this.ctx = ctx;
    this.kit = new LoomAudio(ctx.audio);
    this.buildScene();
    return this.root;
  }

  private buildScene(): void {
    if (!this.kit) return;
    const scene = new LoomScene((e) => this.kit!.beat(e));
    this.scene = scene;
    this.root.addChild(scene);
  }

  enter(): void { /* the loom runs on its own clock */ }
  exit(): void { this.ctx?.audio.whir(0); }

  update(dt: number, rt: ModeRuntime): void {
    const scene = this.scene;
    if (!scene) return;
    if (rt.state === 'paused') return;
    scene.update(dt, rt.state === 'running');
    const t = scene.telemetry;
    // audible drive only while a pick is advancing
    this.kit?.whir(t.active ? 0.55 + Math.min(0.35, Math.abs(t.travel - 0.5) * 0.9) : 0);
    this.hudT += dt;
    if (this.hudT > 0.1) { this.hudT = 0; this.refreshHud(); }
  }

  trigger(e: ToolEvent): void { this.scene?.trigger(e); this.refreshHud(); }

  hud(): ModeHud { return this.hudCache; }

  private refreshHud(): void {
    const t = this.scene?.telemetry;
    const stage = t?.stage ?? 'READY';
    const fields = [
      { label: 'PICKS', value: String(t?.picks ?? 0), tone: 'ink' as const },
      { label: 'QUEUE', value: String(t?.queued ?? 0), tone: (t?.queued ?? 0) > 0 ? 'teal' as const : 'muted' as const },
      { label: 'SHED', value: `${Math.round((t?.shed ?? 0) * 100)}%` },
    ];
    this.hudCache = {
      transport: 'LIVE WEAVE',
      stage,
      fields,
      caption: this.caption,
      hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
    };
  }

  private caption = '等待事件 · 每一次调用，织入一道纬线';

  telemetry(): Record<string, unknown> {
    return { mode: 'loom', ...(this.scene?.telemetry ?? {}) };
  }

  reset(): void {
    const old = this.scene;
    this.scene = null;
    if (old) { this.root.removeChild(old); old.destroy(); }
    this.buildScene();
    this.refreshHud();
  }

  sample(type: ToolName): string { return SAMPLES[type]; }

  destroy(): void {
    this.scene?.destroy();
    this.scene = null;
    this.root.destroy({ children: true });
  }
}
