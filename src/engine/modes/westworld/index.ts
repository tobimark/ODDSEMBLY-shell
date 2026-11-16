import { Container } from 'pixi.js';
import { MODE_META, type ModeContext, type ModeRuntime, type VisualMode } from '../../core/mode';
import type { EngineState, ModeHud, ToolEvent, ToolName } from '../../core/types';
import { WestworldAudio } from './audio';
import { FAMILY_SPEC, WestworldMachine } from './machine';
import { PlantView } from './plant';

const SAMPLES: Record<ToolName, string> = {
  Read: 'manual · src/engine/core/engine.ts · 262 lines',
  Edit: 'manual · src/engine/modes/westworld/plant.ts · 44 - 61',
  Write: 'manual · public/replay/westworld-session.json · +64 lines',
  Bash: 'manual · npm run build · exit 0 · 3.4 s',
  Search: 'manual · grep "pressure" src · 14 matches',
};

/**
 * Westworld — the third catalogue world: the call becomes pressure.
 *
 * One tool call = one mechanical cycle in its own subsystem (intake / regulator /
 * reservoir / combustion / scanner). State accumulates; every fifth call lifts the
 * relief valve and prints a punch-card ticket, every twentieth purges the plant.
 * All numbers come from the deterministic machine; the view only follows state.
 */
export class WestworldMode implements VisualMode {
  readonly meta = MODE_META.westworld;
  readonly root = new Container();

  private ctx: ModeContext | null = null;
  private machine = new WestworldMachine();
  private plant: PlantView = new PlantView();
  private audio: WestworldAudio | null = null;
  private hudT = 0;
  private lastReleaseSeen = 0;
  private lastPurgeSeen = 0;
  private hudCache: ModeHud = {
    transport: 'PLANT LIVE',
    stage: 'IDLE',
    fields: [
      { label: 'PRESSURE', value: '0.16' },
      { label: 'CHARGE', value: '000' },
      { label: 'RELEASES', value: '00' },
      { label: 'HEAT', value: '0.06' },
    ],
    caption: '等待事件 · 每一次调用，给装置加压',
    hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
  };

  mount(ctx: ModeContext): Container {
    this.ctx = ctx;
    this.audio = new WestworldAudio(ctx.audio);
    this.build();
    return this.root;
  }

  private build(): void {
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.machine = new WestworldMachine();
    this.plant = new PlantView();
    this.root.addChild(this.plant);
    this.lastReleaseSeen = 0;
    this.lastPurgeSeen = 0;
    this.plant.setSnapshot(this.machine.snapshot());
    this.plant.update(0);
    this.refreshHud();
  }

  enter(): void { this.refreshHud(); }
  exit(): void { this.ctx?.audio.whir(0); }

  setState(state: EngineState): void {
    if (state === 'stopped') this.machine.clearQueue();
  }

  update(dt: number, rt: ModeRuntime): void {
    if (rt.state === 'paused') return;
    this.machine.update(dt);
    const snap = this.machine.snapshot();
    this.plant.setSnapshot(snap);
    this.plant.update(dt);
    for (const fx of this.machine.takeFx()) {
      if (fx.kind === 'actuate' && fx.family) {
        this.plant.actuate(fx.family, fx.index);
      } else if (fx.kind === 'release') {
        this.plant.release(this.machine.lastRelease);
        this.audio?.valveLift();
        this.audio?.bell();
      } else if (fx.kind === 'purge') {
        this.plant.purge();
        this.audio?.purge();
      }
    }
    if (snap.releases !== this.lastReleaseSeen) {
      this.lastReleaseSeen = snap.releases;
      if (snap.lastRelease) this.refreshHud();
    }
    if (snap.purges !== this.lastPurgeSeen) this.lastPurgeSeen = snap.purges;
    this.hudT += dt;
    if (this.hudT > 0.12) { this.hudT = 0; this.refreshHud(); }
  }

  trigger(e: ToolEvent): void {
    this.machine.trigger(e);
    this.audio?.actuate(e.id, e.type);
    if (e.type === 'Bash') this.audio?.pump(1);
    else this.audio?.pump(0.4);
    this.refreshHud();
  }

  private refreshHud(): void {
    const s = this.machine.snapshot();
    const last = s.lastRelease;
    const caption = last
      ? `RELEASE ${String(last.index).padStart(2, '0')} · ${last.ticket} · 票据已打印`
      : '等待事件 · 每一次调用，给装置加压';
    this.hudCache = {
      transport: 'PLANT LIVE',
      stage: s.stage,
      fields: [
        { label: 'PRESSURE', value: s.pressure.toFixed(2), tone: s.pressure > 0.72 ? 'muted' : 'ink' },
        { label: 'CHARGE', value: String(s.charge).padStart(3, '0'), tone: 'ink' },
        { label: 'RELEASES', value: String(s.releases).padStart(2, '0'), tone: s.releases > 0 ? 'teal' : 'muted' },
        { label: 'HEAT', value: s.heat.toFixed(2), tone: s.heat > 0.6 ? 'muted' : 'ink' },
      ],
      caption,
      hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
    };
  }

  hud(): ModeHud { return this.hudCache; }

  telemetry(): Record<string, unknown> {
    const s = this.machine.snapshot();
    return {
      mode: 'westworld',
      pressure: Math.round(s.pressure * 1000) / 1000,
      heat: Math.round(s.heat * 1000) / 1000,
      charge: s.charge,
      total: s.total,
      releases: s.releases,
      purges: s.purges,
      levels: {
        intake: Math.round(s.levels.intake * 1000) / 1000,
        regulator: Math.round(s.levels.regulator * 1000) / 1000,
        reservoir: Math.round(s.levels.reservoir * 1000) / 1000,
      },
      valves: s.valves,
      needle: s.pressure,
      scan: Math.round(s.scan * 1000) / 1000,
      drive: Math.round(s.drive * 100) / 100,
      activeFamily: s.activeFamily,
      progress: Math.round(s.progress * 100) / 100,
      queued: s.queued,
      stage: s.stage,
      lastRelease: s.lastRelease ? { index: s.lastRelease.index, families: s.lastRelease.families, ticket: s.lastRelease.ticket } : null,
      lastPurge: s.lastPurge,
      settled: s.settled,
      channels: FAMILY_SPEC,
    };
  }

  reset(): void { this.build(); }

  sample(type: ToolName): string { return SAMPLES[type]; }

  destroy(): void { this.root.destroy({ children: true }); }
}
