import type { Container } from 'pixi.js';
import type { AudioEngine } from './audio';
import type { EventBus } from './bus';
import type { EngineState, ModeHud, ModeId, ModeMeta, ToolEvent, ToolName } from './types';

export interface ModeContext {
  readonly audio: AudioEngine;
  readonly bus: EventBus;
  readonly design: { w: number; h: number };
  readonly reducedMotion: boolean;
  /** stable seed for deterministic procedural layouts */
  readonly seed: number;
}

export interface ModeRuntime {
  state: EngineState;
  /** true when the engine clock is driven by manual ticks (deterministic replay) */
  deterministic: boolean;
  reducedMotion: boolean;
  /** engine seconds since init */
  time: number;
}

/** A self-contained visual world. The engine only knows this interface. */
export interface VisualMode {
  readonly meta: ModeMeta;
  /** root container in design space (owned by the mode, parented by the engine) */
  readonly root: Container;
  /** Build the mode root container. Called once, lazily, on first activation. */
  mount(ctx: ModeContext): Container;
  /** Mode became the visible world. */
  enter(): void;
  /** Mode was hidden by a switch. It stays alive and keeps its accumulation. */
  exit(): void;
  update(dt: number, rt: ModeRuntime): void;
  trigger(e: ToolEvent): void;
  /** engine transport state changes (running / paused / stopped) */
  setState?(state: EngineState): void;
  /** React HUD snapshot; must be cheap and side-effect free. */
  hud(): ModeHud;
  /** deterministic, JSON-safe inspection used by tests and reviewers */
  telemetry(): Record<string, unknown>;
  reset(): void;
  /** manual text shown on the ledger when the host triggers a tool */
  sample(type: ToolName): string;
  destroy(): void;
}

export type ModeFactory = () => VisualMode;

import { LoomMode } from '../modes/loom';
import { ChipsMode } from '../modes/chips';
import { WestworldMode } from '../modes/westworld';

export const MODE_ORDER: ModeId[] = ['loom', 'chips', 'westworld'];

export const MODE_META: Record<ModeId, ModeMeta> = {
  loom: {
    id: 'loom', index: '01', title: 'Loom', subtitle: '把思考织成经纬',
    tagline: 'Every tool call is one pick. Shed, shuttle, beat, cloth.',
  },
  chips: {
    id: 'chips', index: '02', title: 'Chips', subtitle: '把手牌押给下一手',
    tagline: 'Tool calls are dealt as cards. Five cards make a hand; skill settles the pot.',
  },
  westworld: {
    id: 'westworld', index: '03', title: 'Westworld', subtitle: '让机器记住压力',
    tagline: 'A pressure plant: every call charges the plant, every threshold releases it.',
  },
};

interface RegistryEntry { meta: ModeMeta; factory: ModeFactory }

const REGISTRY: Record<ModeId, RegistryEntry> = {
  loom: { meta: MODE_META.loom, factory: () => new LoomMode() },
  chips: { meta: MODE_META.chips, factory: () => new ChipsMode() },
  westworld: { meta: MODE_META.westworld, factory: () => new WestworldMode() },
};

export function modeMetas(): ModeMeta[] {
  return MODE_ORDER.map((id) => REGISTRY[id].meta);
}

export function createMode(id: ModeId): VisualMode {
  return REGISTRY[id].factory();
}
