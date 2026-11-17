/**
 * Visual pacing policy — the one place that decides how fast the Loom may weave.
 *
 * The reference machine (CrommaCode Loom) performs exactly one short weaving
 * cycle per tool call and is completely still otherwise: a 15 s idle tail showed
 * 264 ms of residual motion, then 14.7 s of zeros. KunlunMeta's amplified pick
 * takes 1.65 s, so a real agent burst would otherwise queue for tens of seconds
 * and keep weaving long after the agent finished.
 *
 * Rules (deliberately simple, no adaptive tuning):
 *   1. every call is still injected into the engine → the ledger/counters stay exact;
 *   2. up to MAX_PENDING_GROUPS calls wait as full mechanical picks;
 *   3. beyond that the call is *folded* into the pick in flight (visual summary) —
 *      the dial still shows its own `×N` / slot step, so ordering survives;
 *   4. the pick itself shortens as the backlog grows, so a burst drains in ~2–3 s.
 */

/** KunlunMeta's amplified pick length (reference: one cycle per call). */
export const PICK_BASE_SECONDS = 1.65;

/** How many calls may wait for their own mechanical pick. */
export const MAX_PENDING_GROUPS = 3;

/**
 * Speed multiplier for a pick started with N calls already waiting.
 * Normal cadence (0–1 waiting) keeps the full 1.65 s cycle and complete
 * mechanical feedback; compression only starts once a real burst is queued.
 */
export function tempoScale(pending: number): number {
  const steps = [1, 1, 0.85, 0.6, 0.5];
  const i = Math.max(0, Math.min(steps.length - 1, Math.floor(pending)));
  return steps[i];
}

/** Seconds a pick started with N calls waiting will take. */
export function pickSecondsFor(pending: number): number {
  return PICK_BASE_SECONDS * tempoScale(pending);
}

/**
 * `fold` never drops a call: the engine records it, the dial groups it, and the
 * pick in flight absorbs its beat. It exists only to bound the mechanical queue.
 */
export function decidePlay(pending: number): 'pick' | 'fold' {
  return pending >= MAX_PENDING_GROUPS ? 'fold' : 'pick';
}
