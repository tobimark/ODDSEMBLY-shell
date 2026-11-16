/** Shared deterministic fixtures for the v2 verification harnesses.
 * The same 12-event burst is used by verify-v2, replay-proof and record-v2 so
 * every piece of evidence describes the identical agent session. */

export const TOOL_TYPES = ['Read', 'Edit', 'Write', 'Bash', 'Search'];

/** 12 synthetic agent tool calls, ids 1..12, spaced 120 ms apart. */
export const EVENTS_12 = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  type: TOOL_TYPES[i % TOOL_TYPES.length],
  detail: `burst event ${i + 1} · ${TOOL_TYPES[i % TOOL_TYPES.length].toLowerCase()} step ${100 + i}`,
  at: i * 120,
}));

/** Session file served from the build root for the integrated replay path. */
export const LOOM_SESSION = 'replay/loom-session.json';

/** Per-mode session filename convention used by src/engine/core/replay.ts. */
export function sessionPathFor(mode) {
  return `replay/${mode}-session.json`;
}

export const DESIGN_W = 1472;
export const DESIGN_H = 1008;
