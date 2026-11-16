import { Container } from 'pixi.js';
import { MODE_META, type ModeContext, type ModeRuntime, type VisualMode } from '../../core/mode';
import type { ModeHud, ToolEvent, ToolName } from '../../core/types';

/** Placeholder world while the real Westworld plant is being built. */
export class WestworldMode implements VisualMode {
  readonly meta = MODE_META.westworld;
  readonly root = new Container();
  private hudCache: ModeHud = {
    transport: 'LIVE PRESSURE', stage: 'IDLE',
    fields: [{ label: 'PRESSURE', value: '0.0' }, { label: 'CHARGE', value: '0' }, { label: 'PURGE', value: '0' }],
    caption: '等待事件 · 每一次调用，为装置充能',
    hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
  };
  mount(_ctx: ModeContext): Container { return this.root; }
  enter(): void {}
  exit(): void {}
  update(_dt: number, _rt: ModeRuntime): void {}
  trigger(_e: ToolEvent): void {}
  hud(): ModeHud { return this.hudCache; }
  telemetry(): Record<string, unknown> { return { mode: 'westworld', stub: true }; }
  reset(): void {}
  sample(_type: ToolName): string { return 'stub'; }
  destroy(): void { this.root.destroy({ children: true }); }
}
