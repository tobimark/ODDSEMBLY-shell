/**
 * Width-safe formatters.
 *
 * The shell is a fixed 1453x865 stage with absolutely positioned, `nowrap`
 * text and measured slot widths (see docs/region-*.md). Real OpenCode data is
 * unbounded (model names, commands, token counts), so every value that reaches
 * a measured slot MUST pass through one of these helpers. The rule is:
 *   never let a number or name grow the box — compact it instead.
 */

/** Counts: 0..999 as-is, then 1.2k / 12k / 1.2M. Max 4 glyphs. */
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

/** Token throughput, matching card 3's `0.00` + `tok/s` slot (~38.5px / 4-5 glyphs). */
export function formatTokPerSec(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  if (n < 10) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** Memory slot: OpenCode has no per-process RSS, so this is always the em dash. */
export function formatMemory(): string {
  return '—';
}

/** Elapsed / relative time, Chinese, short. */
export function relativeTime(atMs: number, now: number = Date.now()): string {
  const d = Math.max(0, now - atMs);
  if (d < 1500) return '刚刚';
  if (d < 60_000) return `${Math.floor(d / 1000)}秒前`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}小时前`;
  return `${Math.floor(d / 86_400_000)}天前`;
}

/** Durations for tool calls / processes: 0.4s, 12s, 3m12s. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s ? `${s}s` : ''}`;
}

/** Middle-truncate a path so the tail (filename) stays visible. */
export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  const keep = max - 1; // one glyph for the ellipsis
  const head = Math.ceil(keep * 0.35);
  const tail = keep - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** End-truncate commands / names. */
export function truncateEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}

/** Single-line: collapse newlines and runs of spaces. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Model id for the composer footer: `provider/model` is what OpenCode reports
 * (e.g. `opencode/deepseek-v4.1-flash-free`). The measured slot is ~137px at
 * 12.8px, i.e. roughly 18-19 latin glyphs after the provider prefix is dropped.
 */
export function modelLabel(id: string | null | undefined, providerID?: string | null): string {
  if (!id) return '—';
  const slash = id.indexOf('/');
  const tail = slash >= 0 ? id.slice(slash + 1) : id;
  const prefix = providerID ? `${providerID}/` : slash >= 0 ? `${id.slice(0, slash)}/` : '';
  return truncateEnd(`${prefix}${tail}`, 22);
}

/** Percentage for context usage, only when a limit is known. */
export function formatContextPct(used: number, limit: number | null): string | null {
  if (!limit || limit <= 0) return null;
  const pct = Math.max(0, Math.min(999, Math.round((used / limit) * 100)));
  return `${pct}%`;
}
