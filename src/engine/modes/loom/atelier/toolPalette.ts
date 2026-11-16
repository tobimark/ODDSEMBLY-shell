/**
 * Single source of truth for "tool type → instrument colour".
 *
 * Values are runtime frame samples of the reference machine's coloured arc
 * (research/dial/captures/arc-colours.csv, user screenshot `READ ×21`):
 *   Read #789ED0 · Bash #77BA89 · Edit #C686C0 · Write #D5A868 · Task #5AB2B6
 * The reference exposes five observed slots; KunlunMeta's `Search` tool has no
 * observed colour, so it borrows the teal observed on grep/glob/task events.
 *
 * NOTE: this palette is the dial/read-head accent. The woven weft palette in
 * `textile.ts` is a separate yarn-material palette and is intentionally not
 * rewritten by this module.
 */
import type { ToolName } from '../../../core/types';

export const TOOL_COLORS: Readonly<Record<ToolName, string>> = {
  Read: '#789ED0',
  Bash: '#77BA89',
  Edit: '#C686C0',
  Write: '#D5A868',
  Search: '#5AB2B6',
};

/** Idle arc colour observed on the reference machine (Read / default). */
export const DEFAULT_TOOL_COLOR = '#789ED0';

export function toolColor(tool: ToolName): string {
  return TOOL_COLORS[tool] ?? DEFAULT_TOOL_COLOR;
}

/** Darker companion used for text on the light panel, if ever needed. */
export function toolInk(tool: ToolName): string {
  const hex = toolColor(tool);
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.62);
  const g = Math.round(((n >> 8) & 255) * 0.62);
  const b = Math.round((n & 255) * 0.62);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
