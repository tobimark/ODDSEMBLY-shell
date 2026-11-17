/**
 * Bottom overlay of the centre canvas: the "游戏视图" caption, the HUD stat row
 * and the four metric cards.
 *
 * Everything here floats ON TOP of the GameView canvas (CanvasWell), so the root
 * is an absolutely positioned, transparent layer in `.client` coordinates and the
 * gaps between cards let the canvas colour through.
 *
 * All numbers are CSS/logical px measured from the native 2x capture; the comment
 * next to each group gives the native coords it was derived from
 * (client = (native - 13) / 2).
 *
 * ── data binding (this round) ────────────────────────────────────────────────
 * Every value below comes from ONE `WorkbenchSnapshot` (src/data/: the server
 * computes each metric once, the UI only renders and formats it — see
 * docs/OPENCODE-WORKBENCH-CONTRACT.md §3). Nothing here recomputes a metric.
 *
 * The boxes and origins are frozen measured geometry; real numbers are
 * unbounded, so every dynamic string is width-budgeted against the measured
 * slot *before* it is rendered:
 *   · HUD number slot = 19.5 px from the value origin to the next label origin.
 *     Maple Mono CN advance is 0.6 em ASCII / 1.2 em CJK (measured from the
 *     installed TTF), so 2 glyphs fit at 13 px; 3 glyphs are drawn at 12 px
 *     (ink gap stays positive: digit right bearing 0.78 + CJK left bearing 1.81
 *     > the 2.1 px advance overrun); only the last cell (输出) has free space to
 *     its right and may use 4+ glyphs. Anything longer in a bounded cell is
 *     squeezed with a horizontal transform instead of overlapping the next label.
 *   · Card bodies clip + scroll horizontally-neutral; every string is
 *     end-truncated by *pixel* budget (`clipToPx`), because tool details and
 *     commands may be CJK (1.2 em per glyph) where the char-based
 *     `format.ts#truncateEnd` budget would be ~2x too optimistic.
 *   · Exact (un-compacted) numbers are always available in the native `title`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { UI_ICON_PATHS } from '../svg/uiIcons';
import { CardsExpanded } from './CardsExpanded';
import type {
  MetricCounts,
  MetricsView,
  ProcessView,
  ToolCallStatus,
  ToolCallView,
  ToolEventKind,
} from '../data/types';
import { useNow, useWorkbench } from '../data/store';
import {
  compactCount,
  formatDuration,
  formatMemory,
  formatTokPerSec,
  oneLine,
  relativeTime,
} from '../data/format';

const FAMILY = "'Maple Mono CN', 'Microsoft YaHei UI', 'Microsoft YaHei', monospace";
const SIZE = 13;
/** baseline offset inside a `line-height: 13px` box (measured, see region-cards.md) */
const BASELINE = 11.2;

/** sampled from the capture */
const C = {
  cardBg: '#fefcfa',
  border: '#ede6dc',
  accent: '#f8ba3f', // header square
  label: '#8e867b', // titles, HUD labels, muted body text
  value: '#1a150f', // HUD counters, the em dash
  iconFaint: '#b0aaa1', // expand corner brackets
  blue: '#3a81d7', // token throughput
  chipBg: '#f9f6f1', // disabled icon plate
  chipIcon: '#d2c9bc',
} as const;

/** tool kind -> shipped UI icon (the Loom card shows a small kind chip per row) */
const KIND_GLYPH: Partial<Record<ToolEventKind | string, string>> = {
  Read: 'file-text',
  Write: 'file-text',
  Edit: 'file-text',
  Bash: 'terminal',
  Grep: 'search',
  Glob: 'search',
  Fetch: 'globe',
  Task: 'bot',
  Todo: 'check',
  Other: 'file-text',
};

/** Tool-kind tints, matching the Loom `TOOL_TINTS` palette. */
const TOOL_TINTS: Record<ToolEventKind, string> = {
  Read: '#789ed0',
  Bash: '#77ba89',
  Edit: '#c686c0',
  Write: '#d5a868',
  Search: '#5ab2b6',
};

/** Status ink: running amber, completed muted, error/aborted reddish. */
const STATUS_INK: Record<ToolCallStatus, string> = {
  running: '#d99a26',
  completed: '#b0aaa1',
  error: '#b4573f',
  aborted: '#b4573f',
};

/** one card box: native x565 / 929 / 1293 / 1657, y1377, 348x300 */
const CARD = { top: 682, w: 174, h: 150, radius: 14.5 };
const LEFT = [276, 458, 640, 822];
/** per-card title origin (border-box-relative, i.e. outer offset − 1). The
 *  capture itself is not uniform here — card 2's title sits 1 native px left of
 *  the other three — and this is the meanAbs optimum for the (slightly wider)
 *  replica glyphs. Values come from the ink-masked ±4 native shift search. */
const TITLE_LEFT = [19.25, 18.25, 18.75, 19.25];

/* ---------------------------------------------------------- width budget --- */

/** Maple Mono CN advance in em: ASCII 0.6, CJK/full-width 1.2 (TTC `/hmtx`). */
function advanceEm(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6);
  return wide ? 1.2 : 0.6;
}

/** Measured advance width of `text` at `size` px. */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += advanceEm(ch);
  return em * size;
}

/**
 * End-truncate to a *pixel* budget. `format.ts#truncateEnd` budgets in chars,
 * which is only safe for ASCII; tool details / process commands may be CJK
 * (1.2 em per glyph), so every dynamic body string is clipped by width here.
 * The ellipsis is the same single `…` truncateEnd uses.
 */
function clipToPx(text: string, maxPx: number, size: number): string {
  if (textWidth(text, size) <= maxPx) return text;
  let w = textWidth('…', size);
  let out = '';
  for (const ch of text) {
    const cw = advanceEm(ch) * size;
    if (w + cw > maxPx) break;
    out += ch;
    w += cw;
  }
  return out ? `${out}…` : '…';
}

/* ------------------------------------------------------------------ text --- */

function Text({
  left,
  right,
  baseline,
  color,
  size = SIZE,
  title,
  metric,
  children,
  style,
}: {
  left?: number;
  /** right-anchor instead of `left` (used for the row-end meta columns) */
  right?: number;
  baseline: number;
  color: string;
  size?: number;
  title?: string;
  /** HUD counter key exposed as `data-metric` for the acceptance harness */
  metric?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      title={title}
      data-metric={metric}
      style={{
        position: 'absolute',
        left: right == null ? left : undefined,
        right,
        top: baseline - size * (BASELINE / SIZE),
        fontFamily: FAMILY,
        fontSize: size,
        lineHeight: `${size}px`,
        fontWeight: 400,
        letterSpacing: 0,
        whiteSpace: 'nowrap',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- icons --- */
/* The four glyphs used here do not exist in src/svg/icons.ts (that table is the
   *named* icon theme: no maximize / cpu / terminal / arrow-down). icon-mapper
   recovered them from the binary into `src/svg/uiIcons.ts`; we read that table
   directly (the table is a plain Record<key, inner-SVG>), so this region needs no
   change to the shared Icon.tsx. If the Lead wires UI_ICON_PATHS into <Icon>,
   swap `Glyph` for `<Icon name=... />` 1:1.
   The icons are 16x16 grids whose *ink* is smaller than the box, so every use
   below passes the size that reproduces the measured native ink (see docs). */

function Glyph({ name, size, color }: { name: string; size: number; color: string }) {
  const inner = UI_ICON_PATHS[name];
  if (!inner) return null; // 图标表未就绪时安静占位（不占布局）
  // NB: render the <svg> as a block box directly (not an inline svg inside a
  // span) — an inline replaced box is baseline-aligned, which shifts the artwork
  // down by a few native px inside the fixed-size box.
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      style={{ display: 'block', flex: 'none', color }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/* ------------------------------------------------------------------ card --- */

function Card({
  i,
  title,
  children,
  expand = true,
  testId,
  onExpand,
}: {
  i: number;
  title: ReactNode;
  children?: ReactNode;
  expand?: boolean;
  /** click handler for the expand glyph (opens the full-panel view) */
  onExpand?: () => void;
  /** stable DOM hook for the acceptance harness (no visual effect) */
  testId?: string;
}) {
  const left = LEFT[i];
  return (
    <div
      data-testid={testId}
      style={{
        position: 'absolute',
        left,
        top: CARD.top,
        width: CARD.w,
        height: CARD.h,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: CARD.radius,
        boxSizing: 'border-box',
      }}
    >
      {/* header: amber square + title. NB: absolutely positioned children are
          laid out from the *padding* edge, so every offset below is the
          measured card-relative value minus the 1px border. */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          top: 18,
          width: 4,
          height: 4,
          background: C.accent,
        }}
      />
      {/* NB: 19.75 (not 20) — the capture's glyph raster phase matches this
          half-native origin better (meanAbs 12.3 vs 15.8 in the title window),
          even though the ink bbox edge sits 1 native px left of the capture. */}
      <Text left={TITLE_LEFT[i]} baseline={25} color={C.label}>
        {title}
      </Text>
      {expand && (
        <button
          type="button"
          onClick={onExpand}
          title="展开"
          aria-label="展开"
          style={{
            position: 'absolute',
            left: 144,
            top: 9,
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* native ink 22x22; this asset's ink is 12.25/16 of the box */}
          <Glyph name="expand-corners" size={14.37} color={C.iconFaint} />
        </button>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------- card 1 · 工具流 --- */

/** visible rows and their vertical pitch inside the 174x150 card body */
const TOOL_ROW = 36;
/** body viewport: starts below the 13px title; exactly 3 rows tall (4*36 + 108),
 *  so a 4th row is clipped instead of peeking through as a sliver. */
const TOOL_BODY = { top: 30, h: 112 };

function ToolStreamBody({
  calls,
  now,
  hasConversation,
}: {
  calls: ToolCallView[];
  now: number;
  /** true once the session has any message, so "no calls yet" is distinguishable
   *  from "nothing happened at all" (a plain chat reply calls no tools). */
  hasConversation: boolean;
}) {
  if (calls.length === 0) {
    return (
      <Text left={12} baseline={62} color={C.label} size={12} title={hasConversation ? '该会话有消息，但还没有任何工具调用' : undefined}>
        {hasConversation ? '本会话尚无工具调用' : '等待工具调用'}
      </Text>
    );
  }
  return (
    // wheel-scrollable, scrollbar hidden: the viewport is exactly 3 rows tall
    // (3*36 = 108), so a 4th row is fully clipped and a sliver of it can never
    // paint over the card's rounded bottom edge; the rest scrolls.
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: TOOL_BODY.top,
        width: 172,
        height: TOOL_BODY.h,
        overflowX: 'hidden',
        overflowY: 'auto',
        scrollbarWidth: 'none',
        overscrollBehavior: 'contain',
        pointerEvents: 'auto',
      }}
    >
      {calls.slice(0, 40).map((call, i) => {
        const top = 4 + i * TOOL_ROW;
        const tint = TOOL_TINTS[call.kind] ?? C.label;
        const dot = STATUS_INK[call.status] ?? C.label;
        const duration =
          call.durationMs != null
            ? formatDuration(call.durationMs)
            : call.status === 'running'
              ? formatDuration(now - call.startedAt)
              : '—';
        const ago = clipToPx(relativeTime(call.startedAt, now), 44, 9);
        const dur = clipToPx(duration, 34, 9);
        const detail = clipToPx(oneLine(call.detail || call.name), 110, 10);
        const tip = [
          `${call.kind} · ${call.name}`,
          oneLine(call.detail || ''),
          `${call.status} · ${duration}${call.exit != null ? ` · exit ${call.exit}` : ''} · ${relativeTime(call.startedAt, now)}`,
        ]
          .filter(Boolean)
          .join('\n');
        return (
          <div
            key={call.id}
            title={tip}
            style={{ position: 'absolute', left: 0, top, width: 172, height: TOOL_ROW }}
          >
            {/* CrommaCode's Loom card draws a tool call as a stitched line:
                kind chip, a run of weave dots, an amber needle at the head,
                then the relative time. The exact call detail stays in 	itle. */}
            <div
              style={{
                position: 'absolute',
                left: 7,
                top: 6,
                width: 18,
                height: 18,
                borderRadius: 4.5,
                background: C.chipBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Glyph name={KIND_GLYPH[call.kind] ?? 'file-text'} size={12.45} color={tint} />
            </div>
            <div style={{ position: 'absolute', left: 31, top: 14.5, height: 3, display: 'flex', alignItems: 'center', gap: 1.6 }}>
              {Array.from({ length: 12 }, (_, k) => (
                <span
                  key={k}
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 0.6,
                    background: k < 9 ? '#d9d2c7' : '#e6ded0',
                    opacity: k < 9 ? 1 : 0.7,
                  }}
                />
              ))}
              <span style={{ width: 4, height: 4, borderRadius: 0.6, background: C.accent, marginLeft: 1 }} />
            </div>
            <Text right={9} baseline={18} size={9} color={C.label}>
              {ago}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------- card 2 · 调用率 15s --- */

/** bar sparkline geometry: 30 buckets, 3px bar + 1px gap, sitting on the
 *  measured 152x1 dashed baseline (top 137). */
const BAR = { w: 3, pitch: 4, top: 136, maxH: 56, baselineW: 152, baselineLeft: 10 };

/** card 2 body: the count starts on card 2's title origin so it reads as part
 *  of the card (not floating at the border). 21 px keeps the LCD-rasterised
 *  numeral solid instead of a fuzzy double outline, and a 3-digit count
 *  (37.8 px) still ends far from the 174 px card edge. Baseline 60 leaves an
 *  even gap to the title (bottom ≈28.5) and to the tallest bar (top 80). */
const RATE_LEFT = TITLE_LEFT[1]; // 18.25
const RATE_BASELINE = 60;
const RATE_SIZE = 21;

function RateBody({ metrics }: { metrics: MetricsView }) {
  const win = metrics.rateSeriesWindow > 0 ? metrics.rateSeriesWindow : 30;
  const series = metrics.rateSeries.slice(-win);
  const peak = series.reduce((m, v) => (v > m ? v : m), 0);
  const norm = peak > 0 ? peak : 1;
  const left0 = BAR.baselineLeft + Math.max(0, (BAR.baselineW - win * BAR.pitch) / 2);
  const rate = Math.trunc(metrics.rate15s);
  const rateText = String(rate);
  const rateEnd = RATE_LEFT + textWidth(rateText, RATE_SIZE);
  // the number is clipped at maxWidth below; only draw the unit if it still fits
  const showUnit = rateEnd + 5 + 10 <= 160;
  return (
    <>
      <Text
        left={RATE_LEFT}
        baseline={RATE_BASELINE}
        size={RATE_SIZE}
        color={rate > 0 ? C.value : C.label}
        title={`最近 15 秒工具调用数：${rate}`}
        style={{
          pointerEvents: 'auto',
          maxWidth: 124,
          overflow: 'hidden',
          WebkitTextStroke: '0',
          textShadow: 'none',
        }}
      >
        {rateText}
      </Text>
      {showUnit && (
        <Text left={rateEnd + 5} baseline={RATE_BASELINE} size={10} color={C.label}>
          次
        </Text>
      )}
      {peak > 0 ? (
        series.map((v, i) => {
          const h = v > 0 ? Math.max(3, Math.round((v / norm) * BAR.maxH)) : 2;
          // the original tints the busiest bucket solid amber and the rest soft
          const isPeak = v > 0 && v === Math.max(...series);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: left0 + i * BAR.pitch,
                top: BAR.top - h,
                width: BAR.w,
                height: h,
                background: v > 0 ? (isPeak ? '#f8ba3f' : '#fbda98') : C.border,
                // bars grow/shrink like the original instead of snapping
                transition: 'height 320ms cubic-bezier(0.22,0.61,0.36,1), top 320ms cubic-bezier(0.22,0.61,0.36,1)',
              }}
            />
          );
        })
      ) : rate === 0 ? (
        // zero is honest: no bars are invented, just the muted count + a line
        <Text left={RATE_LEFT} baseline={104} size={10} color={C.label}>
          最近 15 秒无调用
        </Text>
      ) : null}
    </>
  );
}

/* ------------------------------------------------ card 4 · 后台进程 rows --- */

const PROCESS_ROW = 30;
/** rows live below the card's leading (disabled) terminal chip at y 39.5..57.5 */
const PROCESS_BODY = { top: 58, h: 90 };
const KIND_TAG: Record<ProcessView['kind'], string> = { shell: 'SH', pty: 'PTY', job: 'JOB' };

function processStatusInk(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running') return STATUS_INK.running;
  if (s.includes('err') || s.includes('fail') || s === 'exited') {
    return s === 'exited' ? STATUS_INK.completed : '#b4573f';
  }
  return STATUS_INK.completed;
}

function ProcessBody({ processes, now }: { processes: ProcessView[]; now: number }) {
  // running first, then newest: presentation order only (no metric is derived).
  const rows = [...processes].sort((a, b) => {
    const rank = (p: ProcessView) => (p.status.toLowerCase() === 'running' ? 0 : 1);
    return rank(a) - rank(b) || (b.startedAt ?? 0) - (a.startedAt ?? 0);
  });
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 10,
          top: 39.5,
          width: 18,
          height: 18,
          borderRadius: 4.5,
          background: C.chipBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Glyph name="terminal" size={12.45} color={C.chipIcon} />
      </div>
      {rows.length === 0 ? (
        <Text left={35} baseline={53} color={C.label}>
          没有后台进程
        </Text>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: PROCESS_BODY.top,
            width: 172,
            height: PROCESS_BODY.h,
            overflowX: 'hidden',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            overscrollBehavior: 'contain',
            pointerEvents: 'auto',
          }}
        >
          {rows.slice(0, 30).map((p, i) => {
            const top = i * PROCESS_ROW;
            const tag = KIND_TAG[p.kind] ?? 'JOB';
            const duration =
              p.startedAt != null
                ? formatDuration(Math.max(0, now - p.startedAt))
                : formatDuration(p.elapsedMs);
            const command = clipToPx(oneLine(p.command || p.title || '—'), 88, 9.5);
            const elapsed = clipToPx(duration, 34, 9);
            const meta = clipToPx(
              `${p.pid != null ? `pid ${p.pid} · ` : ''}${p.status}${p.exit != null ? ` · exit ${p.exit}` : ''}`,
              145,
              8.5,
            );
            const tip = [
              `${p.kind}${p.jobKind ? `/${p.jobKind}` : ''} · ${p.status}`,
              oneLine(p.command || p.title || ''),
              `${p.pid != null ? `pid ${p.pid} · ` : ''}${duration}${p.exit != null ? ` · exit ${p.exit}` : ''}`,
              p.sessionID ? `会话 ${p.sessionID}` : '',
            ]
              .filter(Boolean)
              .join('\n');
            return (
              <div
                key={p.id}
                data-testid="process-row"
                title={tip}
                style={{ position: 'absolute', left: 0, top, width: 172, height: PROCESS_ROW }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 9,
                    top: 5.2,
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    background: processStatusInk(p.status),
                  }}
                />
                <Text left={16} baseline={8.5} size={8.5} color={C.label}>
                  {tag}
                </Text>
                <Text
                  left={34}
                  baseline={8.5}
                  size={9.5}
                  color={C.value}
                  style={{ maxWidth: 88, overflow: 'hidden' }}
                >
                  {command}
                </Text>
                <Text
                  right={9}
                  baseline={8.5}
                  size={9}
                  color={
                    p.status.toLowerCase().includes('err') ||
                    p.status.toLowerCase().includes('fail')
                      ? '#b4573f'
                      : C.label
                  }
                >
                  {elapsed}
                </Text>
                <Text
                  left={16}
                  baseline={20}
                  size={8.5}
                  color={C.label}
                  style={{ maxWidth: 145, overflow: 'hidden' }}
                >
                  {meta}
                </Text>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ view --- */

/** HUD stats: [label, label origin x, value origin x] in client px.
 *  Origin = measured ink x minus the glyph's left side bearing, so every entry
 *  is a whole *native* pixel (client*2+13 is an integer).
 *  `key` selects the contract §3 counter; `last` marks the final cell, whose
 *  right budget is the AgentPanel edge instead of the next label. */
const HUD: Array<{
  label: string;
  labelLeft: number;
  valueLeft: number;
  key: keyof MetricCounts;
  last?: boolean;
}> = [
  { label: 'AGENT', labelLeft: 610.5, valueLeft: 654, key: 'agents' },
  { label: '工具', labelLeft: 673.5, valueLeft: 709, key: 'tools' },
  { label: '调用', labelLeft: 728.5, valueLeft: 764, key: 'calls' },
  { label: '文件', labelLeft: 783.5, valueLeft: 819, key: 'files' },
  { label: '改动', labelLeft: 838.5, valueLeft: 874, key: 'edits' },
  { label: '思考', labelLeft: 893.5, valueLeft: 929, key: 'think' },
  { label: '输出', labelLeft: 948.5, valueLeft: 984, key: 'output', last: true },
];

/** value origin -> next label origin, measured (FINDINGS §4: "~19.5px later") */
const HUD_SLOT = 19.5;
/**
 * The last cell (输出) has no *label* to its right, but the AgentPanel is drawn
 * after `Cards` (App.tsx order) and its opaque 412px frame starts at client
 * x=1008. The 输出 value origin is 984, so only 24px of the value is actually
 * visible: 3 glyphs at 13px (ink ends 22.75px in) fit; a 4th glyph would be
 * painted over by the panel. Budget 23px of ink to stay clear.
 */
const HUD_LAST_INK = 23;

/**
 * Fit a compacted HUD counter into the measured slot.
 *   1-2 glyphs: 7.8 px each at 13 px = 15.6 px -> untouched.
 *   3 glyphs   : 20.7 px advance at 11.5 px. Measured ink clears the next label
 *                by 3 native px; at 12 px it collapses to 1 native px and at 13 px
 *                the third digit's ink touches the label (2.75 native px overlap).
 *   4+ glyphs  : only reachable from 1k up (e.g. 思考 "1.2k"); squeeze the width
 *                axis instead of moving the origin or touching the next label.
 */
function fitHud(text: string, maxInk: number): { size: number; scaleX: number } {
  const glyphs = [...text].length;
  if (glyphs <= 2) return { size: SIZE, scaleX: 1 };
  if (glyphs === 3) return { size: maxInk >= HUD_LAST_INK ? SIZE : 11.5, scaleX: 1 };
  const w = textWidth(text, 11.5);
  return { size: 11.5, scaleX: Math.min(1, maxInk / w) };
}

/* ------------------------------------------------- card 3 · 流速曲线 ---- */

/**
 * Velocity curve — modelled on the ORIGINAL app, not on the idle screenshot.
 *
 * Ground truth: `r3-tokenflow/` recorded the real cromma-bees.exe with live
 * token usage (PrintWindow, 2x). While tokens flow the card draws a thin blue
 * polyline that fills the WHOLE card body — it enters near the lower-left, runs
 * up to the top-right corner (right edge = "now"), carries a soft pale-blue glow
 * along its underside, and the `tok/s` / `MB` readout is painted on top of it.
 * At 0.00 tok/s nothing is drawn (`.tmp/shell/ref.png` idle scan: the body is
 * empty) and only the faint 152x10.5 band at the very bottom remains, which is
 * reproduced as-is.
 *
 * So the plot area is the card body, not a small inset chart; values are
 * auto-scaled to the window maximum (the original keeps the trace full-height at
 * 52 tok/s and at 8.6 K tok/s alike), and the newest sample sits at the right
 * edge. Offsets are card-relative minus the 1 px border.
 */
/**
 * The trace owns only the band between the title and the readout: title ink ends
 * at ~27, the ↓ glyph starts at 99.22, so the curve may not cross either. Before
 * this bound the curve used the whole body (22..138) and ran through `tok/s`.
 */
const CURVE = { left: 2, top: 32, w: 170, h: 62 };
/** the reference's bottom band — measured, static, independent of the chart */
const SHELF = { left: 10, top: 127, w: 152, h: 10.5 };

/**
 * Catmull-Rom (centripetal, α=0.5) through every sample, converted to cubic
 * Béziers. Gives a natural trace through sparse points; y is clamped into the
 * plot so the spline cannot overshoot the card.
 */
function smoothPath(points: Array<readonly [number, number]>, minY: number, maxY: number): string {
  if (points.length === 0) return '';
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  if (points.length === 1) return `M ${points[0][0].toFixed(2)} ${clamp(points[0][1]).toFixed(2)}`;
  const p = points.map(([x, y]) => [x, clamp(y)] as const);
  let d = `M ${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

function TokenCurve({ series }: { series: number[] }) {
  const n = series.length > 1 ? series.length : 120;
  const raw = Array.from({ length: n }, (_, i) => {
    const v = series[series.length - n + i];
    return typeof v === 'number' && v > 0 ? v : 0;
  });
  // A centred 3-sample average removes the 4 Hz stair-stepping without hiding
  // the shape; the rate itself is already a smooth trailing-window value.
  const data = raw.map((_, i) => (raw[i - 1] ?? raw[i]) * 0.25 + raw[i] * 0.5 + (raw[i + 1] ?? raw[i]) * 0.25);
  const max = Math.max(...data);
  // The trace starts where samples start: a flat zero line across the body would
  // claim measured output that does not exist (the idle reference has no line).
  const first = data.findIndex((v) => v > 0);
  const span = first >= 0 ? data.slice(first) : [];
  // peaks reach the band's top edge, idle samples sit on its bottom edge
  const pad = 1;
  const plotH = CURVE.h - pad * 2;
  const stepX = CURVE.w / (n - 1);
  const points = span.map((v, i) => [(first + i) * stepX, CURVE.h - pad - (v / max) * plotH] as const);
  const d = points.length > 1 ? smoothPath(points, pad, CURVE.h - pad) : '';

  return (
    <>
      <div
        aria-hidden
        data-testid="token-curve"
        data-top={CURVE.top}
        data-height={CURVE.h}
        style={{
          position: 'absolute',
          left: CURVE.left,
          top: CURVE.top,
          width: CURVE.w,
          height: CURVE.h,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <svg width={CURVE.w} height={CURVE.h} viewBox={`0 0 ${CURVE.w} ${CURVE.h}`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="tok-curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3A81D7" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#3A81D7" stopOpacity="0.015" />
            </linearGradient>
            <filter id="tok-curve-glow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          {max > 0 && d && (
            <>
              {/* the original's pale wash under the trace */}
              <path
                d={`${d} L ${CURVE.w.toFixed(2)} ${CURVE.h} L ${points[0][0].toFixed(2)} ${CURVE.h} Z`}
                fill="url(#tok-curve-fill)"
              />
              {/* soft glow trailing the line */}
              <path
                d={d}
                fill="none"
                stroke="#3A81D7"
                strokeOpacity="0.30"
                strokeWidth={3.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#tok-curve-glow)"
              />
              <path
                d={d}
                fill="none"
                stroke="#3A81D7"
                strokeOpacity="0.92"
                strokeWidth={1.35}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
      </div>
      {/* the reference's bottom band */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: SHELF.left,
          top: SHELF.top,
          width: SHELF.w,
          height: SHELF.h,
          pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(245,246,249,0) 0%, rgba(245,246,249,1) 100%)',
        }}
      />
    </>
  );
}

export function Cards() {
  const snapshot = useWorkbench();
  const now = useNow(1000);
  const [expanded, setExpanded] = useState<null | { kind: 'tools' | 'rate' | 'token' | 'processes'; title: string }>(null);
  const { metrics, toolCalls, processes, activeSessionId, messages } = snapshot;
  const counts = metrics.counts;
  const hasSession = activeSessionId != null;

  const tok = formatTokPerSec(metrics.tokPerSec);
  const tokNatural = textWidth(tok, SIZE);
  /** card 3 value column is 67 -> 105.5 = 38.5 px wide (FINDINGS §4). */
  const tokSize = tokNatural <= 38.5 ? SIZE : Math.max(10, (38.5 / tokNatural) * SIZE);
  /** OpenCode reports step tokens only at `step.ended`, so a running step has no
   *  rate yet. Say "生成中" instead of a misleading 0.00 while the step runs. */
  const stepRunning = Boolean(snapshot.sessions.find((s) => s.id === activeSessionId)?.busy);
  const showGenerating = stepRunning && metrics.tokPerSec === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* 游戏视图 caption, native ink x576..690 / baseline y1350 */}
      <Text left={279.5} baseline={668.5} color={C.label}>
        游戏视图
      </Text>

      {/* HUD row. Every token is absolutely placed at its measured ink x
          (client = (native_ink − bearing − 13) / 2) instead of relying on flex
          gaps: sub-pixel gap accumulation both drifted up to 2 native px and
          forced half-pixel glyph positions (blurred AA). All lefts below land on
          whole *native* pixels, so stems stay crisp like the capture. */}
      <div data-testid="hud" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {HUD.map(({ label, labelLeft, valueLeft, key, last }) => {
          // §3 口径: think/output are session-cumulative tokens; without an active
          // session they are unknown (—), while the five session-scoped counts are
          // genuinely 0. Nothing is ever invented.
          const unknown = !hasSession && (key === 'think' || key === 'output');
          const exact = unknown ? '—' : String(counts[key]);
          const text = unknown ? '—' : compactCount(counts[key]);
          const fit = fitHud(text, last === true ? HUD_LAST_INK : HUD_SLOT);
          const unit = key === 'think' || key === 'output' ? ' tokens' : '';
          return (
            <Fragment key={label}>
              <Text left={labelLeft} baseline={668.5} color={C.label}>
                {label}
              </Text>
              <Text
                left={valueLeft}
                baseline={668.5}
                color={C.value}
                size={fit.size}
                metric={key}
                title={unknown ? `${label}：无活动会话，数值不可得` : `${label} ${exact}${unit}`}
                style={{
                  pointerEvents: 'auto',
                  transform: fit.scaleX === 1 ? undefined : `scaleX(${fit.scaleX})`,
                  transformOrigin: 'left center',
                }}
              >
                {text}
              </Text>
            </Fragment>
          );
        })}
      </div>

      {/* 1 · 工具流 — real tool-call rows (newest first, 3 visible, rest scroll) */}
      <Card
        i={0}
        title="工具流"
        testId="card-tools"
        onExpand={() => setExpanded({ kind: 'tools', title: '工具流' })}
      >
        <ToolStreamBody calls={toolCalls} now={now} hasConversation={messages.length > 0} />
      </Card>
      {/* 2 · 调用率 / 15 秒 — big count + 30-bucket bar sparkline over the
          measured dashed baseline */}
      <Card
        i={1}
        title="调用率 / 15 秒"
        testId="card-rate"
        onExpand={() => setExpanded({ kind: 'rate', title: '调用率 / 15 秒' })}
      >
        <RateBody metrics={metrics} />
        <div
          style={{
            position: 'absolute',
            left: 10,
            top: 137,
            width: 152,
            height: 1,
            backgroundImage:
              'repeating-linear-gradient(90deg, #ede6dc 0 4.5px, rgba(0,0,0,0) 4.5px 6.5px)',
          }}
        />
      </Card>
      {/* 3 · Token 流速 — curve (behind) + throughput + memory */}
      <Card
        i={2}
        title="Token 流速"
        testId="card-token"
        onExpand={() => setExpanded({ kind: 'token', title: 'Token 流速' })}
      >
        <TokenCurve series={metrics.tokSeries} />
        <div style={{ position: 'absolute', left: 9.5, top: 99.22 }}>
          {/* native ink 16x22 — asset ink is 8.81x11.35/16 of the box.
              top: 99.22 measured 3.69 in the icon window vs 4.04 at the bbox
              exact 100.22 (a 1-native shift re-phases the raster, which costs
              more than the geometric error it fixes). */}
          <Glyph name="arrow-down" size={15} color={C.blue} />
        </div>
        <Text
          left={67}
          baseline={111.5}
          color={C.blue}
          size={tokSize}
          title={`输出 token 流速（按步骤计：步骤输出 token ÷ 步骤耗时，EMA α=0.4；空闲 3 秒归零）：${metrics.tokPerSec.toFixed(2)} tok/s`}
          style={{ pointerEvents: 'auto' }}
        >
          {tok}
        </Text>
        <Text
          left={105.5}
          baseline={111.5}
          color={C.label}
          size={showGenerating ? 10 : undefined}
          title={showGenerating ? '该步骤正在生成，OpenCode 在步骤结束时才上报 token' : undefined}
        >
          {showGenerating ? '生成中' : 'tok/s'}
        </Text>
        <div style={{ position: 'absolute', left: 9.83, top: 121.83 }}>
          {/* native ink 26x26; cpu's ink is 14.5/16 of the box */}
          <Glyph name="cpu" size={14.34} color={C.value} />
        </div>
        {/* memory: OpenCode exposes no per-process RSS — never fabricated. */}
        <Text
          left={90.5}
          baseline={133.5}
          color={C.value}
          title="OpenCode API 不提供进程内存"
          style={{ pointerEvents: 'auto' }}
        >
          {formatMemory()}
        </Text>
        <Text
          left={106}
          baseline={133.5}
          color={C.label}
          title="OpenCode API 不提供进程内存"
          style={{ pointerEvents: 'auto' }}
        >
          MB
        </Text>
      </Card>
      {/* 4 · 后台进程 — real shell/job rows, or the original empty line */}
      <Card
        i={3}
        title="后台进程"
        testId="card-processes"
        onExpand={() => setExpanded({ kind: 'processes', title: '后台进程' })}
      >
        <ProcessBody processes={processes} now={now} />
      </Card>

      {/* expanded (full-panel) view of whichever card was opened */}
      {expanded && (
        <CardsExpanded
          kind={expanded.kind}
          title={expanded.title}
          snapshot={snapshot}
          now={now}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}










