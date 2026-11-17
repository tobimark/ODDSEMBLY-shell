/**
 * Pure metric functions for the ODDSEMBLY workbench bridge.
 *
 * This module is the ONLY place where workbench numbers are derived.
 * It has no I/O and no state; `store.mjs` feeds it OpenCode facts.
 *
 * Contract: kunlun-shell/docs/OPENCODE-WORKBENCH-CONTRACT.md §3 + §4.
 * Shape:    kunlun-shell/src/data/types.ts (MetricsView / MetricCounts).
 *
 * Honesty rules baked in here:
 *   - memoryMB is *not derivable* from OpenCode (no per-process RSS surface),
 *     so it is always null and always listed in `unavailable`.
 *   - nothing is estimated: unknown -> 0 for counters, null for optional values.
 */

/** Sliding window for card ② "calls / 15 s" (wall clock). */
export const RATE_WINDOW_MS = 15_000;
/** Number of 1 s buckets kept for the rate sparkline (oldest -> newest). */
export const RATE_SERIES_WINDOW = 30;
/** Card ③ rate window: output tokens produced in the trailing N ms, per second. */
export const TOK_WINDOW_MS = 8_000;
/** Card ③ velocity curve: 30 s window sampled at 4 Hz (oldest -> newest). */
export const TOK_SERIES_WINDOW = 30;
export const TOK_SERIES_BUCKET_MS = 250;
export const TOK_SERIES_BUCKETS = Math.round((TOK_SERIES_WINDOW * 1000) / TOK_SERIES_BUCKET_MS);
/** A bucket borrows the latest sample within this window before reading 0. */
/** Hard cap for ToolCallView.detail (server truncates, UI never guesses). */
export const DETAIL_MAX = 160;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Zeroed TokenUsage.Info. */
export function emptyUsage() {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
}

/**
 * Normalise an OpenCode TokenUsage.Info (`{input,output,reasoning,cache{read,write}}`)
 * into the contract shape. Missing/partial values become 0, never NaN.
 */
export function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return emptyUsage();
  const cache = raw.cache && typeof raw.cache === 'object' ? raw.cache : {};
  return {
    input: num(raw.input),
    output: num(raw.output),
    reasoning: num(raw.reasoning),
    cache: { read: num(cache.read), write: num(cache.write) },
  };
}

/** Sum of all token counters (used for `tokensTotal` and `contextUsed`). */
export function usageTotal(usage) {
  const u = usage || emptyUsage();
  return u.input + u.output + u.reasoning + u.cache.read + u.cache.write;
}

/** Cumulative output-token history for card ③: [{at, cum}], oldest first. */
export function emptyTokState() {
  return [];
}

/**
 * Output tokens/second over the trailing `TOK_WINDOW_MS` of cumulative output.
 *
 * The original app (recorded from cromma-bees.exe) draws a smooth flowing trace,
 * and this rate behaves the same way: it rises while tokens land and eases down
 * as they age out of the window, instead of jumping and snapping to zero. It is
 * still a plain measurement — the cumulative counter is only ever read.
 */
export function windowedTokPerSec(history, now, windowMs = TOK_WINDOW_MS) {
  const list = history || [];
  if (list.length === 0) return 0;
  const cumAt = (t) => {
    let best = null;
    for (const s of list) {
      if (typeof s?.at !== 'number' || typeof s?.cum !== 'number') continue;
      if (s.at <= t && (best === null || s.at > best.at)) best = s;
    }
    return best === null ? 0 : best.cum;
  };
  const delta = cumAt(now) - cumAt(now - windowMs);
  const perSec = delta / (windowMs / 1000);
  return Number.isFinite(perSec) && perSec > 0 ? Math.round(perSec * 10) / 10 : 0;
}

/** Scalar rate for the card readout (same value the curve is drawn from). */
export function computeTokPerSec(history, now) {
  return windowedTokPerSec(history, now);
}

/**
 * Raw OpenCode tool name -> the five Game View primitives.
 * `input` is only used as a fallback for names the bridge has never seen.
 */
const TOOL_KIND_BY_NAME = new Map([
  // Read family
  ['read', 'Read'], ['view', 'Read'], ['cat', 'Read'], ['readfile', 'Read'],
  ['read_file', 'Read'], ['notebookread', 'Read'], ['notebook_read', 'Read'],
  ['readmany', 'Read'], ['read_many', 'Read'], ['open', 'Read'],
  // Write family (all count as "编辑" in §3)
  ['write', 'Write'], ['writefile', 'Write'], ['write_file', 'Write'],
  ['create', 'Write'], ['createfile', 'Write'], ['create_file', 'Write'],
  ['apply_patch', 'Write'], ['applypatch', 'Write'], ['patch', 'Write'],
  ['multiedit', 'Write'], ['multi_edit', 'Write'], ['multi-edit', 'Write'],
  // Edit family
  ['edit', 'Edit'], ['editfile', 'Edit'], ['edit_file', 'Edit'],
  ['str_replace', 'Edit'], ['strreplace', 'Edit'], ['replace', 'Edit'],
  ['notebookedit', 'Edit'], ['notebook_edit', 'Edit'],
  // Bash family
  ['bash', 'Bash'], ['shell', 'Bash'], ['exec', 'Bash'], ['execute', 'Bash'],
  ['run', 'Bash'], ['run_command', 'Bash'], ['terminal', 'Bash'],
  ['powershell', 'Bash'], ['pwsh', 'Bash'], ['cmd', 'Bash'], ['spawn', 'Bash'],
  // Search family
  ['grep', 'Search'], ['glob', 'Search'], ['search', 'Search'], ['find', 'Search'],
  ['rg', 'Search'], ['ripgrep', 'Search'], ['websearch', 'Search'],
  ['web_search', 'Search'], ['webfetch', 'Search'], ['web_fetch', 'Search'],
  ['list', 'Search'], ['ls', 'Search'],
]);

const FILE_PATH_KEYS = ['path', 'filePath', 'file_path', 'notebookPath', 'notebook_path'];
const DETAIL_KEYS = [
  'command', 'cmd', 'script', 'path', 'filePath', 'file_path', 'notebookPath',
  'notebook_path', 'pattern', 'query', 'description', 'message', 'text', 'title', 'url',
];

export function classifyToolKind(name, input) {
  const key = String(name ?? '').toLowerCase();
  if (TOOL_KIND_BY_NAME.has(key)) return TOOL_KIND_BY_NAME.get(key);
  // Provider-prefixed names such as "filesystem.read" / "bash.exec".
  const tail = key.split('.').pop();
  if (tail && TOOL_KIND_BY_NAME.has(tail)) return TOOL_KIND_BY_NAME.get(tail);
  // Unknown tool name: derive the primitive from the arguments we actually saw.
  if (input && typeof input === 'object') {
    if (typeof input.command === 'string' || typeof input.cmd === 'string') return 'Bash';
    if (FILE_PATH_KEYS.some((k) => typeof input[k] === 'string')) return 'Read';
    if (typeof input.pattern === 'string' || typeof input.query === 'string') return 'Search';
    if (typeof input.content === 'string' || typeof input.patch === 'string') return 'Write';
  }
  return 'Bash';
}

/** Collapse whitespace and hard-truncate (contract: detail <= 160 chars). */
export function truncateDetail(text, max = DETAIL_MAX) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Human summary for a tool call: command / path / pattern / raw args. */
export function extractDetail(input, fallback = '') {
  if (input == null) return truncateDetail(fallback);
  if (typeof input === 'string') return truncateDetail(input);
  if (typeof input !== 'object') return truncateDetail(String(input));
  for (const key of DETAIL_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return truncateDetail(value.trim());
  }
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return truncateDetail(value.trim());
  }
  return truncateDetail(fallback);
}

/** True for the two primitives that count as "改动" (§3). */
export function isEditKind(kind) {
  return kind === 'Write' || kind === 'Edit';
}

/**
 * Distinct file paths mentioned in tool inputs.
 * Only path-ish keys count: `pattern`/`query` are explicitly not files (§3).
 */
export function distinctFilePaths(records) {
  const seen = new Set();
  for (const record of records) {
    const input = record && record.input;
    if (!input || typeof input !== 'object') continue;
    for (const key of FILE_PATH_KEYS) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        // Windows paths are case-insensitive; normalise separators + case for dedup.
        seen.add(value.trim().toLowerCase().replace(/\//g, '\\'));
      }
    }
  }
  return seen.size;
}

/**
 * §3 counters.
 * @param {Array} records  internal tool-call records (must carry `input`/`name`/`kind`)
 * @param {object} tokens  cumulative TokenUsage for the active session
 * @param {number} childCount number of sub-sessions (parentID === activeSessionId)
 */
export function computeCounts(records, tokens, childCount) {
  const list = Array.isArray(records) ? records : [];
  const names = new Set();
  let edits = 0;
  for (const record of list) {
    names.add(String(record.name ?? '').toLowerCase());
    if (isEditKind(record.kind)) edits += 1;
  }
  return {
    agents: num(childCount),
    tools: names.size,
    calls: list.length,
    files: distinctFilePaths(list),
    edits,
    think: num(tokens && tokens.reasoning),
    output: num(tokens && tokens.output),
  };
}

/**
 * §3 card ③ curve: the same trailing-window rate sampled on
 * `TOK_SERIES_BUCKETS` buckets of `TOK_SERIES_BUCKET_MS` (oldest -> newest), so
 * the trace and the number above it can never disagree. Bucket i is the rate at
 * `now - (N-1-i) * bucketMs`.
 */
export function computeTokSeries(history, now) {
  const series = new Array(TOK_SERIES_BUCKETS).fill(0);
  const list = history || [];
  if (list.length === 0) return series;
  for (let i = 0; i < TOK_SERIES_BUCKETS; i++) {
    const t = now - (TOK_SERIES_BUCKETS - 1 - i) * TOK_SERIES_BUCKET_MS;
    series[i] = windowedTokPerSec(list, t);
  }
  return series;
}

/**
 * §3 card ②: calls started inside the trailing 15 s + 30 one-second buckets.
 * Bucket index 0 is the current second; `rateSeries` is oldest -> newest.
 */
export function computeRateSeries(startedAtList, now) {
  const series = new Array(RATE_SERIES_WINDOW).fill(0);
  let rate15s = 0;
  for (const startedAt of startedAtList || []) {
    if (typeof startedAt !== 'number' || startedAt <= 0) continue;
    const ageMs = now - startedAt;
    if (ageMs < 0 || ageMs > RATE_WINDOW_MS) continue;
    rate15s += 1;
    const bucket = Math.floor(ageMs / 1000);
    if (bucket >= 0 && bucket < RATE_SERIES_WINDOW) {
      series[RATE_SERIES_WINDOW - 1 - bucket] += 1;
    }
  }
  return { rate15s, rateSeries: series };
}

/**
 * Expanded-card aggregates (§3). Every value is derived from recorded facts:
 * the deduped tool calls, their wall-clock start times, the active session age
 * and the same token-rate trace the card draws. Nothing is estimated; a field
 * that cannot be derived stays 0 / empty.
 */
export function computeDetail({ calls, sessionMs, tokSeries, now }) {
  const list = calls || [];
  const byTool = new Map();
  for (const c of list) {
    if (!c || typeof c.name !== 'string') continue;
    byTool.set(c.name, (byTool.get(c.name) || 0) + 1);
  }
  const toolCounts = [...byTool.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const starts = list
    .map((c) => c.startedAt)
    .filter((t) => typeof t === 'number' && t > 0)
    .sort((a, b) => a - b);

  // busiest 15 s window (sliding over every start), the card's "峰值"
  let peak15s = 0;
  for (let i = 0; i < starts.length; i += 1) {
    let j = i;
    while (j < starts.length && starts[j] - starts[i] < RATE_WINDOW_MS) j += 1;
    peak15s = Math.max(peak15s, j - i);
  }
  const mean15s = sessionMs > 0 ? Math.round((starts.length / (sessionMs / RATE_WINDOW_MS)) * 10) / 10 : 0;

  // one bar per equal slice of the session, oldest -> newest (max 60)
  const bucketCount = Math.min(60, Math.max(1, Math.ceil(sessionMs / 10_000)));
  const rateHistory = new Array(bucketCount).fill(0);
  const at = typeof now === 'number' ? now : 0;
  if (starts.length > 0 && sessionMs > 0 && at > 0) {
    const span = Math.max(1, sessionMs);
    for (const t of starts) {
      const age = Math.max(0, Math.min(span, at - t));
      const idx = bucketCount - 1 - Math.min(bucketCount - 1, Math.floor((age / span) * bucketCount));
      rateHistory[idx] += 1;
    }
  }

  const tok = (tokSeries || []).filter((v) => typeof v === 'number' && v > 0);
  const tokPeak = tok.length ? Math.max(...tok) : 0;
  const tokMean = tok.length ? Math.round((tok.reduce((a, b) => a + b, 0) / tok.length) * 10) / 10 : 0;

  return { toolCounts, peak15s, mean15s, rateHistory, tokPeak, tokMean };
}

/**
 * §3 availability disclosure. `memoryMB` is always unavailable (OpenCode has no
 * per-process RSS surface), plus any optional value the bridge could not source.
 */
export function unavailableKeys({ contextLimit, cost } = {}) {
  const keys = ['memoryMB'];
  if (contextLimit == null) keys.push('contextLimit');
  if (cost == null) keys.push('cost');
  return keys;
}

export { numOrNull, num };




