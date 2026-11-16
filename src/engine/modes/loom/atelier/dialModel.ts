/**
 * Pure state/logic for the Loom event dial — no Pixi, no clocks, no globals.
 *
 * Model of the reference machine (research `CrommaCode-Loom事件转盘-研究.md`):
 *   - steady state: the instrument does not move; the readout position is fixed;
 *   - a tool event shows up after ≈105 ms (observed display latency);
 *   - switching to a different tool produces a short 70–200 ms sweep of the
 *     card along the arc — the only observable motion in the reference build;
 *   - same-tool calls aggregate in place as `×N` without a sweep;
 *   - a lone event's card ages out after ≈1.98 s, aggregated groups live longer.
 *
 * KunlunMeta's deliberate change (a documented enhancement, not a replay of the
 * reference): the sweep is amplified into a perceptible 180 ms index step of the
 * rotating ring (`angleDeg = ordinal * 30°`, 12 slots), while the rectangular
 * readout stays fixed and structurally unable to rotate.
 *
 * Everything here is deterministic: `tick(dt)` is the only time source, so the
 * same sequence of dt values always yields the same state.
 */
import type { ToolEvent, ToolName } from '../../../core/types';
import { DEFAULT_TOOL_COLOR, toolColor } from './toolPalette';

export type DialPhase = 'idle' | 'arming' | 'moving' | 'holding';

export interface DialTiming {
  /** readout latency before the wheel answers a new group (observed ≈105 ms) */
  armDelayMs: number;
  /** amplified card sweep; the reference measured 70–200 ms */
  moveMs: number;
  /** how long the readout keeps the current group (single event observed ≈1.98 s) */
  holdMs: number;
  /** same-tool calls inside this window aggregate into one `×N` card */
  mergeWindowMs: number;
}

export interface DialSlots {
  /** 12 positions; the readout occupies exactly one of them */
  count: number;
  /** one slot per step, 360/12 = 30° */
  pitchDeg: number;
}

export interface DialReadoutConfig {
  /** denominator of `Sxx/12`; 12 is the observed runtime total */
  stepTotal: number;
}

export interface DialConfig {
  timing: DialTiming;
  slots: DialSlots;
  readout: DialReadoutConfig;
}

export const DIAL_TIMING: DialTiming = {
  armDelayMs: 105,
  moveMs: 180,
  holdMs: 2000,
  mergeWindowMs: 2000,
};

export const DIAL_SLOTS: DialSlots = { count: 12, pitchDeg: 30 };

export const DIAL_CONFIG: DialConfig = {
  timing: DIAL_TIMING,
  slots: DIAL_SLOTS,
  readout: { stepTotal: 12 },
};

export interface DialCard {
  readonly type: ToolName;
  /** `×N`: calls aggregated into this group */
  readonly count: number;
  /** 1-based group ordinal; `Sxx` is derived from it */
  readonly ordinal: number;
  /** 1-based slot shown by the readout, wraps at `slots.count` */
  readonly slot: number;
  readonly bornAtMs: number;
  readonly lastAtMs: number;
  readonly color: string;
  readonly detail: string;
}

export interface DialState {
  readonly phase: DialPhase;
  readonly clockMs: number;
  /** current ring phase in degrees (rotor transform = angleDeg) */
  readonly angleDeg: number;
  readonly fromDeg: number;
  readonly targetDeg: number;
  readonly armStartMs: number;
  readonly moveStartMs: number;
  readonly moveDurationMs: number;
  readonly card: DialCard | null;
  readonly ordinal: number;
  /** total accepted events (aggregation included) */
  readonly events: number;
  readonly lastEventAtMs: number;
}

export interface ReadoutModel {
  readonly empty: boolean;
  readonly type: ToolName | null;
  readonly count: number;
  readonly step: { readonly index: number; readonly total: number } | null;
  readonly detail: string;
  readonly color: string;
  readonly ageMs: number;
  readonly phase: DialPhase;
}

export function easeInOutCubic(t: number): number {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Shortest signed difference between two angles, in (−180°, 180°]. */
export function shortestDelta(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function slotForOrdinal(ordinal: number, count: number = DIAL_SLOTS.count): number {
  return ((ordinal - 1) % Math.max(1, count)) + 1;
}

/**
 * The rotor always advances by one slot per group, so the 12-position ring
 * makes exactly one turn every 12 groups. Accumulating instead of wrapping is
 * intentional: the wheel must never spin backwards between groups.
 */
export function targetAngleFor(ordinal: number, slots: DialSlots = DIAL_SLOTS): number {
  return ordinal * slots.pitchDeg;
}

export function createDialState(): DialState {
  return {
    phase: 'idle',
    clockMs: 0,
    angleDeg: 0,
    fromDeg: 0,
    targetDeg: 0,
    armStartMs: 0,
    moveStartMs: 0,
    moveDurationMs: 0,
    card: null,
    ordinal: 0,
    events: 0,
    lastEventAtMs: -Infinity,
  };
}

/**
 * Accept one tool event.
 * - same tool inside `mergeWindowMs` while the card is alive → `×N++` in place
 *   (the reference does this: card bounding box never moves, multiplier grows);
 * - different tool (or expired window) → a new group starts and the ring gets a
 *   new target slot; the display is armed for `armDelayMs` first.
 */
export function dialPush(state: DialState, event: ToolEvent, cfg: DialConfig = DIAL_CONFIG): DialState {
  const now = state.clockMs;
  const card = state.card;
  const sameTool = !!card && card.type === event.type && now - card.lastAtMs <= cfg.timing.mergeWindowMs;

  if (card && sameTool) {
    const merged: DialCard = { ...card, count: card.count + 1, lastAtMs: now };
    return { ...state, card: merged, events: state.events + 1, lastEventAtMs: now };
  }

  const ordinal = state.ordinal + 1;
  const armDelay = Math.max(0, cfg.timing.armDelayMs);
  const nextCard: DialCard = {
    type: event.type,
    count: 1,
    ordinal,
    slot: slotForOrdinal(ordinal, cfg.slots.count),
    bornAtMs: now,
    lastAtMs: now,
    color: toolColor(event.type),
    detail: event.detail ?? '',
  };
  return {
    ...state,
    phase: armDelay > 0 ? 'arming' : 'moving',
    armStartMs: now,
    fromDeg: state.angleDeg,
    targetDeg: targetAngleFor(ordinal, cfg.slots),
    moveStartMs: armDelay > 0 ? now + armDelay : now,
    moveDurationMs: Math.max(0, cfg.timing.moveMs),
    card: nextCard,
    ordinal,
    events: state.events + 1,
    lastEventAtMs: now,
  };
}

/**
 * Advance the dial clock. Phase transitions:
 *   arming --(armDelay)--> moving --(moveMs)--> holding --(holdMs)--> idle
 * A large dt (deterministic replay, tab restore) is still processed exactly:
 * every transition is a function of absolute timestamps, never of substeps.
 */
export function dialTick(state: DialState, dtMs: number, cfg: DialConfig = DIAL_CONFIG): DialState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const clockMs = state.clockMs + dt;
  let phase = state.phase;
  let angleDeg = state.angleDeg;
  let fromDeg = state.fromDeg;
  let moveStartMs = state.moveStartMs;
  let moveDurationMs = state.moveDurationMs;
  let card = state.card;

  if (phase === 'arming' && clockMs >= state.armStartMs + Math.max(0, cfg.timing.armDelayMs)) {
    fromDeg = angleDeg;
    moveStartMs = state.armStartMs + Math.max(0, cfg.timing.armDelayMs);
    moveDurationMs = Math.max(0, cfg.timing.moveMs);
    phase = 'moving';
  }

  if (phase === 'moving') {
    const k = moveDurationMs <= 0 ? 1 : (clockMs - moveStartMs) / moveDurationMs;
    if (k >= 1) {
      angleDeg = state.targetDeg;
      phase = 'holding';
    } else if (k > 0) {
      angleDeg = fromDeg + (state.targetDeg - fromDeg) * easeInOutCubic(k);
    }
  }

  if (phase !== 'idle' && (!card || clockMs - card.lastAtMs > cfg.timing.holdMs)) {
    phase = 'idle';
    card = null;
  }

  return {
    ...state,
    clockMs,
    phase,
    angleDeg,
    fromDeg,
    moveStartMs,
    moveDurationMs,
    card,
  };
}

/** Pure projection from state to what the fixed readout panel shows. */
export function dialReadout(state: DialState, cfg: DialConfig = DIAL_CONFIG): ReadoutModel {
  const card = state.card;
  if (!card) {
    return {
      empty: true,
      type: null,
      count: 0,
      step: null,
      detail: '',
      color: DEFAULT_TOOL_COLOR,
      ageMs: 0,
      phase: state.phase,
    };
  }
  return {
    empty: false,
    type: card.type,
    count: card.count,
    step: { index: card.slot, total: cfg.readout.stepTotal },
    detail: card.detail,
    color: card.color,
    ageMs: Math.max(0, state.clockMs - card.bornAtMs),
    phase: state.phase,
  };
}

/** Flat, JSON-safe snapshot for browser QA and regression scripts. */
export function dialTelemetry(state: DialState, cfg: DialConfig = DIAL_CONFIG): Record<string, unknown> {
  const card = state.card;
  return {
    phase: state.phase,
    angleDeg: state.angleDeg,
    targetDeg: state.targetDeg,
    slot: card ? card.slot : null,
    ordinal: state.ordinal,
    type: card ? card.type : null,
    count: card ? card.count : 0,
    events: state.events,
    ageMs: card ? Math.max(0, state.clockMs - card.bornAtMs) : null,
    stepTotal: cfg.readout.stepTotal,
  };
}
