import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { compactCount, formatDuration, modelLabel, oneLine, relativeTime, truncateEnd } from '../data/format';
import { useNow, useWorkbench, useWorkbenchActions, useWorkbenchError } from '../data/store';
import { fetchAgents, fetchCommands, fetchFiles, fetchFind, fetchModels } from '../data/client';
import type {
  AgentOption,
  CommandOption,
  FileEntry,
  HealthView,
  MessageView,
  ModelCatalogue,
  PermissionView,
  SessionView,
  ToolCallView,
} from '../data/types';
import { Markdown } from './markdown';

/**
 * Agent panel — the real OpenCode chat inside the pixel replica of the
 * CrommaCode 0.3.11 right-hand agent column.
 *
 * GEOMETRY IS FROZEN. Every number below is measured on the native 2906x1730
 * capture (`../.tmp/shell/ref.png`, 200% DPI) and converted with
 *   client-rel logical px = (native - 13) / 2
 * Panel-relative coordinates (what the children use) are
 *   panel-rel = client-rel - (1008, 100).
 *
 * The panel box (412x732 at client (1008,100)), the header (Agent/终端
 * segmented control + window icons), the conversation row, the composer frame
 * (382x78 at panel (15,639)), its paperclip/@/expand icons, the provider/model
 * slots and the send button keep their measured positions. What changed is the
 * *content*: the decorative SVG text / single `hi` bubble / inert composer are
 * replaced with data-bound rows, a real textarea and an overlay switcher.
 *
 * Data rules (see docs/OPENCODE-WORKBENCH-CONTRACT.md):
 *   - render `useWorkbench()` only; commands go through `useWorkbenchActions()`;
 *   - no fabricated messages / numbers / "online" claims — unknown is shown as
 *     unknown (empty state or `—`);
 *   - the list is keyed by OpenCode message id, so a streaming snapshot updates
 *     the same DOM node in place (no duplicates, no remount);
 *   - no window-level listeners (the future Loom canvas binds `window`): every
 *     key handler lives on the textarea / the menu button.
 *
 * See docs/region-agentpanel.md for the full measurement table.
 */

/**
 * NOTE (measured): headless Chromium renders `.client`'s 6.5px offset at 7px, so every
 * region lands 1 device px right/down of the native capture. It cannot be cancelled
 * inside a region: with the client at an even device offset, an element's left edge only
 * ever lands on even device px, while the reference panel edge is at odd native 2029.
 * Shifting this panel to 1007.5 measures worse (2.12 vs 1.43 meanAbs). Fix belongs in
 * styles.css / App.tsx (make the client offset land on 13 device px).
 */
const PANEL = {
  left: 1008,
  top: 100,
  width: 412, // native 2029..2852 (border box) = 824/2
  height: 732, // native 213..1676 (measured); CONVENTIONS lists 743 — pixels win
  bg: '#fefcf9',
  border: '#dcdad5',
  radius: 12.5, // native corner radius ~25
  /** 1px inner bevel: bright on top, darker just above the bottom border */
  bevelTop: '#fffefd',
  bevelBottom: '#eceae7',
};

const C = {
  ink: '#1a150f', // selected tab glyph/text, provider chip glyph
  icon: '#8e867b', // default icon + composer placeholder colour
  text: '#766f65', // list / secondary labels
  divider: '#edeae6',
  segBg: '#f9f6f1',
  segBorder: '#e4e0db',
  pillBg: '#fffdfb',
  composerBg: '#fffdfb',
  composerBorder: '#dfdcda',
  composerIcon: '#bbb6ae',
  bubbleTop: '#ffeac5',
  bubbleBottom: '#ffdda4',
  bubbleBorder: '#e2a520',
  bubbleInk: '#45310b',
  sendBg: '#f9f6f1',
  sendArrow: '#d2c9bc',
} as const;

/* — palette extensions for the functional surfaces (same warm, low-chroma family) — */
const F = {
  /** assistant body copy — between ink and secondary */
  body: '#3b352d',
  /** typed composer text (placeholder keeps C.icon) */
  input: '#4a443c',
  /** timestamps / micro labels */
  micro: '#a9a197',
  /** brighter muted for hints */
  hint: '#a39b90',
  /** enabled send circle — the app's amber accent */
  sendOn: '#f8ba3f',
  sendOnInk: '#1a150f',
  /** state colours: only ever driven by real health values */
  ok: '#5f9c68',
  warn: '#d09a35',
  bad: '#bf6250',
  errorInk: '#b4553f',
  /** permission / banner paper */
  paper: '#fffdfb',
  bannerBg: '#f8f2e6',
  bannerBorder: '#ecdfc8',
  bannerInk: '#8a6a2f',
  /** dropdown hover / active session wash */
  wash: '#f7f3ed',
  accent: '#e2a520',
} as const;

/* ------------------------------------------------------------------ */
/* frozen layout boxes (panel-relative px)                             */
/* ------------------------------------------------------------------ */

/** conversation row: glyph y 47, title baseline 59, icons clock/up/close x 321/353.7/385 */
const ROW = {
  hitLeft: 8,
  hitTop: 40,
  hitWidth: 396,
  hitHeight: 32,
  titleLeft: 34.5,
  titleTop: 47,
  titleLine: 16,
  /** title clip ends before the status dot at x≈306 */
  titleWidth: 262,
  dotLeft: 306,
  dotTop: 53.5,
  dotSize: 6,
};

/** message area between the conversation row and the footer/composer */
const MSG = {
  left: 14,
  top: 76,
  width: 384,
  bottom: 614, // 4px above the status footer, 25px above the composer
  height: 538,
};

/** permission card reserve: overlays the bottom of the message list, never the composer */
const PERM = { left: 15, width: 382, bottom: 118 }; // bottom = 732 - 614

/** one-line honest footer (only rendered when a command failed) */
const FOOT = { left: 15, top: 618, width: 382, height: 14 };

const COMP = { left: 15, top: 639, width: 382, height: 78 };

/**
 * composer text metrics. Placeholder baseline measured at panel y 667.5 with
 * 14.9px/600 Maple Mono CN (see docs/region-agentpanel.md §5-6). The textarea
 * and the custom placeholder share `top` + `line-height`, so the browser's own
 * baseline lands on the measured one.
 */
const INPUT = {
  left: COMP.left + 1, // inside the 1px frame border
  top: 652.8, // +1 vs the hand-fit: calibrated against ref.png (placeholder ink y 654.5..671.0)
  width: 342, // right edge 358 — clears the send circle at x 364 and expand icon at 368.9
  height: 33, // ends at 685.8, above the paperclip/@ row (y 688.7)
  padLeft: 12, // text origin 28 = measured placeholder ink origin (30.0) minus the glyph lsb
  padText: 328,
  size: 14.9,
  lineHeight: 20,
};

const SEND = { left: 364, top: 684, size: 24 };

const PLACEHOLDER = '给 agent 发消息，@ 引用文件，/ 命令';

const MONO = "'Maple Mono CN', 'Cromma Sans', monospace";

/**
 * Build the `file:///` URI OpenCode's `PromptInput.FileAttachment` requires.
 * The bridge proved this exact form is accepted ("Invalid attachment URI" is
 * returned for a bare relative path, 200 for `file:///D:/.../README.md`).
 */
function fileUri(directory: string, relativePath: string): string {
  const absolute = `${directory.replace(/[\\/]+$/, '')}\\${relativePath.replace(/^[\\/]+/, '')}`.replace(/\\/g, '/');
  return encodeURI(`file:///${absolute}`);
}

/** Keep the *tail* of a path (the file name) and mark that it was clipped. */
function clipStart(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - (max - 1))}`;
}

/* ------------------------------------------------------------------ */
/* icons                                                               */
/*                                                                     */
/* The 189-icon theme shipped in `src/svg/icons.ts` has no artwork for  */
/* this panel's pictograms (they belong to a second, stroke-based icon  */
/* set that was not extracted from the binary), so the shapes below     */
/* were re-drawn from the reference pixels. Each uses a 16x16 viewBox   */
/* and the ink lands on the measured sub-rectangle noted in the         */
/* comment; icon-mapper can swap in the real vectors later.            */
/* ------------------------------------------------------------------ */

interface GlyphProps {
  /** panel-relative top-left of the 16x16 icon box */
  x: number;
  y: number;
  color?: string;
  style?: CSSProperties;
}

function Stroke16({ x, y, color, strokeWidth = 1.5, size = 16, style, children }: GlyphProps & { strokeWidth?: number; size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: 'absolute', left: x, top: y, display: 'block', overflow: 'visible', ...style }}
    >
      {children}
    </svg>
  );
}

/** Thick picture-frame glyph. ink x 3..13, y 2..14 (header, conversation row, provider chip). */
function PanelGlyph({ x, y, color, dy = 0 }: GlyphProps & { dy?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill={color}
      style={{ position: 'absolute', left: x, top: y, display: 'block', overflow: 'visible' }}
    >
      <g transform={`translate(0 ${dy})`}>
        <path
          fillRule="evenodd"
          d="M4.2 2h7.6A1.2 1.2 0 0 1 13 3.2v9.6a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 12.8V3.2A1.2 1.2 0 0 1 4.2 2Zm1.8 2.5v7h4v-7H6Z"
        />
      </g>
    </svg>
  );
}

/** Speech bubble with a tail at the lower left. ink ~0.8..15.2 x 1.0..14.4. */
function ChatBubble({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.5} size={15.4}>
      <path d="M8 2.25c3.7 0 6.25 2.25 6.25 4.65S11.7 11.5 8 11.5c-1.1 0-2.1-.2-3-.5l-1.7 2.75.8-3.35C2.7 9.5 1.75 8.3 1.75 6.9 1.75 4.5 4.3 2.25 8 2.25Z" />
    </Stroke16>
  );
}

/** Terminal window: rounded rect with a prompt + underscore. ink x 1.5..14.5, y 2..14. */
function TerminalGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color}>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2.6" />
      <path d="M5.4 6.2 7.5 8.2l-2.1 2" strokeWidth={1.3} />
      <path d="M8.9 10.2h2.3" strokeWidth={1.3} />
    </Stroke16>
  );
}

/** Fullscreen / maximise: two diagonal corner brackets. ink 1.6..14.4 square. */
function ExpandGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.6}>
      <path d="M8.6 2.4h5v5" />
      <path d="M7.4 13.6h-5v-5" />
    </Stroke16>
  );
}

/** Minimise: a single horizontal rule. ink x 2..14, y 7.2..8.8. */
function MinimizeGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.6}>
      <path d="M3.05 8h9.9" />
    </Stroke16>
  );
}

/** Close: 10x10 cross. ink 3..13. */
function CloseGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.6}>
      <path d="M3.8 3.8 12.2 12.2M12.2 3.8 3.8 12.2" />
    </Stroke16>
  );
}

/** Outline clock (conversation history). ink fills the 16 box. */
function ClockGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.6}>
      <circle cx="8" cy="8" r="7.2" />
      <path d="M8 4.4v4.1l2.7 1.5" strokeWidth={1.4} />
    </Stroke16>
  );
}

/** Up arrow (conversation row + send button). ink x 2.55..13.45, y 1.95..14.55. */
function ArrowUpGlyph({ x, y, color, style }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.7} style={style}>
      <path d="M8 2.95v10.6M4.15 6.5 8 2.95l3.85 3.55" />
    </Stroke16>
  );
}

/** Paperclip (24-unit artwork scaled to a 17.5px box, ink ~13.5x13.5 at 1.9..15.4). */
function PaperclipGlyph({ x, y, color }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14.8}
      height={14.8}
      fill="none"
      stroke={color}
      strokeWidth={2.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: 'absolute', left: x, top: y, display: 'block', overflow: 'visible' }}
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/** @ mention (24-unit artwork scaled to a 16px box, ink ~13.5x13.5). */
function AtGlyph({ x, y, color }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14.93}
      height={14.93}
      fill="none"
      stroke={color}
      strokeWidth={2.14}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: 'absolute', left: x, top: y, display: 'block', overflow: 'visible' }}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}

/** Chevron down. ink x 3.4..12.6, y 6.4..11.4. */
function ChevronGlyph({ x, y, color }: GlyphProps) {
  return (
    <Stroke16 x={x} y={y} color={color} strokeWidth={1.6}>
      <path d="M4.3 7.15 8 10.65l3.7-3.5" />
    </Stroke16>
  );
}

/** Stop mark for the busy send button: a 6.8px rounded square centred in 24x24. */
function StopGlyph({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      style={{ position: 'absolute', left: SEND.left + 4, top: SEND.top + 4, display: 'block', pointerEvents: 'none' }}
    >
      <rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.7" fill={color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/** A text run anchored by its measured baseline (SVG text => metric-exact). */
function Txt({
  x,
  baseline,
  size,
  color,
  weight = 400,
  children,
}: {
  x: number;
  baseline: number;
  size: number;
  color: string;
  weight?: number;
  children: string;
}) {
  return (
    <text x={x} y={baseline} fontFamily={MONO} fontSize={size} fontWeight={weight} fill={color}>
      {children}
    </text>
  );
}

/** Thin, invisible scrollbar (the panel must not grow an OS scrollbar). */
const HIDE_SCROLLBAR: CSSProperties = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

/* ------------------------------------------------------------------ */
/* honest health helpers                                               */
/* ------------------------------------------------------------------ */

function healthColour(h: HealthView): string {
  if (h.opencode === 'unreachable' || h.opencode === 'unauthorized') return F.bad;
  if (h.stream === 'connected') return F.ok;
  if (h.stream === 'connecting' || h.stream === 'reconnecting') return F.warn;
  return F.bad;
}

function healthTitle(h: HealthView): string {
  const parts = [`opencode: ${h.opencode}`, `stream: ${h.stream}`];
  if (h.resyncing) parts.push('同步中');
  if (h.lastEventAt != null) parts.push(`最近事件 ${relativeTime(h.lastEventAt)}`);
  if (h.error) parts.push(h.error);
  return parts.join(' · ');
}

/**
 * Muted banner for a real connectivity gap. `null` when the workbench is healthy:
 * a healthy panel shows no banner (the session-row dot carries the state).
 */
function healthBanner(h: HealthView, lastSyncAt: number | null): string | null {
  if (h.opencode === 'unreachable') return 'OpenCode 未连接 · 重试中';
  if (h.opencode === 'unauthorized') return 'OpenCode 未授权 · 请检查登录';
  if (h.stream === 'reconnecting') return '实时连接中断 · 重连中';
  if (h.stream === 'closed') return '实时连接已关闭';
  if (h.stream === 'connecting') return lastSyncAt == null ? '正在连接工作台…' : '正在重新连接…';
  if (h.opencode === 'unknown') return 'OpenCode 状态未知';
  return null;
}

/** Message types that carry a chat body; `idle` markers are turn bookkeeping. */
function isVisibleMessage(m: MessageView): boolean {
  if (m.role === 'idle') return false;
  if (m.role === 'assistant' && !m.text.trim() && !m.streaming && !m.error) return false;
  if (m.role === 'system' && !m.text.trim()) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* message rows                                                        */
/* ------------------------------------------------------------------ */

const USER_BUBBLE: CSSProperties = {
  maxWidth: '100%',
  padding: '10px 14.75px',
  borderRadius: 20.75,
  background: `linear-gradient(180deg, ${C.bubbleTop} 0%, ${C.bubbleBottom} 100%)`,
  border: `1px solid ${C.bubbleBorder}`,
  color: C.bubbleInk,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: '19.5px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
};

const ASSISTANT_TEXT: CSSProperties = {
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 400,
  lineHeight: '19.5px',
  color: F.body,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
};

const META: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.4,
  lineHeight: '13px',
  color: F.micro,
  marginTop: 3,
};

/** The measured bubble tail (hand-fitted, ±1–2 native px in the reference). */
function BubbleTail() {
  return (
    <svg
      viewBox="0 0 16 9"
      width={16}
      height={9}
      style={{ position: 'absolute', right: 16.25, top: 'calc(100% - 1.5px)', display: 'block', overflow: 'visible', pointerEvents: 'none' }}
    >
      <path d="M0 0 H16 C15.6 2.6 15.7 5.4 14.6 7.4 C14.2 8.2 13.6 8.6 13 8.7 C8.6 7.6 3.4 4.2 0 0 Z" fill={C.bubbleBottom} />
      <path d="M0 0 C3.4 4.2 8.6 7.6 13 8.7" stroke={C.bubbleBorder} strokeWidth={1.1} fill="none" />
      <path d="M16 0 C15.6 2.6 15.7 5.4 14.6 7.4 C14.2 8.2 13.6 8.6 13 8.7" stroke={C.bubbleBorder} strokeWidth={1.1} fill="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* inline tool card (one per tool call of THIS assistant message)      */
/* ------------------------------------------------------------------ */

/** Same tints as the HUD card ① so a tool reads the same colour everywhere. */
const TOOL_INK: Record<string, string> = {
  Read: '#789ed0',
  Bash: '#77ba89',
  Edit: '#c686c0',
  Write: '#d5a868',
  Search: '#5ab2b6',
};

const TOOL_STATUS_INK: Record<string, string> = {
  running: '#d99a26',
  completed: '#b0aaa1',
  error: '#b4573f',
  aborted: '#b4573f',
};

/** Stable empty list so a message without tools never gets a fresh identity. */
const EMPTY_TOOLS: ToolCallView[] = [];

function ToolCard({ call, now }: { call: ToolCallView; now: number }) {
  const [open, setOpen] = useState(false);
  const duration =
    call.durationMs != null
      ? formatDuration(call.durationMs)
      : call.status === 'running'
        ? formatDuration(now - call.startedAt)
        : null;
  const tint = TOOL_INK[call.kind] ?? C.text;
  const dot = TOOL_STATUS_INK[call.status] ?? C.text;
  const detail = truncateEnd(oneLine(call.detail) || call.name, 64);
  const output = call.output ? call.output.trim() : '';
  return (
    <div
      data-testid="tool-card"
      data-tool-id={call.id}
      data-tool-status={call.status}
      style={{
        margin: '5px 0 3px',
        border: `1px solid ${C.segBorder}`,
        borderRadius: 6,
        background: '#fbf8f3',
        overflow: 'hidden',
        maxWidth: '100%',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={[`${call.kind} · ${call.name}`, call.detail, call.exit != null ? `exit ${call.exit}` : '']
          .filter(Boolean)
          .join('\n')}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          width: '100%',
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          padding: '4px 7px',
          cursor: output || call.detail ? 'pointer' : 'default',
          textAlign: 'left',
          fontFamily: MONO,
        }}
      >
        <span style={{ flex: 'none', width: 4, height: 4, borderRadius: 2, background: dot, transform: 'translateY(-2px)' }} />
        <span style={{ flex: 'none', fontSize: 8.8, fontWeight: 600, color: tint, letterSpacing: 0.2 }}>
          {call.kind.toUpperCase()}
        </span>
        <span style={{ flex: 'none', fontSize: 10.2, color: C.ink, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {call.name}
        </span>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 9.8, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </span>
        {call.exit != null && call.exit !== 0 && (
          <span style={{ flex: 'none', fontSize: 9, color: TOOL_STATUS_INK.error }}>exit {call.exit}</span>
        )}
        {duration && <span style={{ flex: 'none', fontSize: 9, color: call.status === 'running' ? TOOL_STATUS_INK.running : C.icon }}>{duration}</span>}
        <span style={{ flex: 'none', width: 8, textAlign: 'center', fontSize: 8, color: C.icon }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: '0 7px 6px',
            maxHeight: 132,
            overflow: 'auto',
            fontFamily: MONO,
            fontSize: 9.6,
            lineHeight: '13.5px',
            color: '#5d564c',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {output || call.detail || '（无输出）'}
        </pre>
      )}
    </div>
  );
}

function MessageRow({ m, now, withTail, tools }: { m: MessageView; now: number; withTail: boolean; tools: ToolCallView[] }) {
  const rowAttrs = {
    'data-testid': 'message',
    'data-role': m.role,
    'data-msg-id': m.id,
    ...(m.streaming ? { 'data-streaming': 'true' } : {}),
  };
  if (m.role === 'system') {
    return (
      <div
        {...rowAttrs}
        style={{ ...META, textAlign: 'center', margin: '2px 0 12px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
      >
        {m.text}
      </div>
    );
  }

  if (m.role === 'user') {
    return (
      <div
        {...rowAttrs}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 14, maxWidth: '100%' }}
      >
        <div style={{ position: 'relative', maxWidth: '92%' }}>
          <div style={USER_BUBBLE}>{m.text}</div>
          {withTail && <BubbleTail />}
        </div>
        {/* the measured tail hangs 1.5..7.1px under the bubble; keep the meta below it */}
        <div style={{ ...META, marginTop: 8.5, paddingRight: 34 }}>{relativeTime(m.createdAt, now)}</div>
      </div>
    );
  }

  // assistant — markdown body, then this message's own tool calls, then meta
  return (
    <div {...rowAttrs} style={{ marginBottom: 14, maxWidth: '100%' }}>
      {m.text.trim().length > 0 && (
        <div style={ASSISTANT_TEXT}>
          <Markdown text={m.text} caret={m.streaming} />
        </div>
      )}
      {tools.length > 0 && (
        <div data-testid="message-tools" style={{ marginTop: 2 }}>
          {tools.map((call) => (
            <ToolCard key={call.id} call={call} now={now} />
          ))}
        </div>
      )}
      {m.error && (
        <div
          style={{ ...META, color: F.errorInk, marginTop: 2, overflowWrap: 'break-word' }}
          title={m.error}
        >
          {`⚠ ${truncateEnd(oneLine(m.error), 88)}`}
        </div>
      )}
      <div style={META}>
        {m.streaming ? <span style={{ color: F.warn }}>生成中…</span> : relativeTime(m.createdAt, now)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* inline permission prompt                                            */
/* ------------------------------------------------------------------ */

function PermissionPrompt({
  request,
  pendingCount,
  now,
  activeSessionID,
  sessionTitle,
  pendingDecision,
  onRespond,
}: {
  request: PermissionView;
  pendingCount: number;
  now: number;
  /** decision currently in flight for THIS request (all buttons lock meanwhile) */
  pendingDecision: 'once' | 'always' | 'reject' | null;
  activeSessionID: string | null;
  sessionTitle: string | null;
  onRespond: (id: string, decision: 'once' | 'always' | 'reject') => void;
}) {
  const action = truncateEnd(oneLine(request.action) || '未知操作', 34);
  const shownResources = request.resources.slice(0, 3);
  const extraResources = request.resources.length - shownResources.length;
  const resources = shownResources.map((r) => truncateEnd(oneLine(r), 34)).join('、') + (extraResources > 0 ? ` ＋${extraResources}` : '');
  const isOtherSession = activeSessionID != null && request.sessionID !== activeSessionID;
  const busy = pendingDecision != null;

  const btn = (label: string, decision: 'once' | 'always' | 'reject', colours: { bg: string; border: string; ink: string }) => (
    <button
      type="button"
      disabled={busy}
      data-testid={`permission-${decision}`}
      onClick={() => onRespond(request.id, decision)}
      style={{
        flex: '1 1 0',
        height: 22,
        border: `1px solid ${colours.border}`,
        borderRadius: 6,
        background: colours.bg,
        color: colours.ink,
        fontFamily: MONO,
        fontSize: 10.8,
        lineHeight: '20px',
        padding: 0,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {pendingDecision === decision ? '处理中…' : label}
    </button>
  );

  return (
    <div
      data-testid="permission"
      style={{
        position: 'absolute',
        left: PERM.left,
        width: PERM.width,
        bottom: PERM.bottom,
        maxHeight: 116,
        overflow: 'hidden',
        background: F.paper,
        border: `1px solid ${C.segBorder}`,
        borderRadius: 10,
        boxShadow: '0 6px 16px rgba(80,70,55,0.12)',
        padding: '8px 10px 8px',
        zIndex: 20,
        fontFamily: MONO,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 11.4, fontWeight: 600, color: C.ink, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          权限请求 · {action}
        </span>
        <span style={{ fontSize: 10.2, color: F.micro, flex: 'none' }} title={isOtherSession ? (sessionTitle ?? '其他会话') : undefined}>
          {isOtherSession ? '其他会话' : relativeTime(request.requestedAt, now)}
          {pendingCount > 1 ? `  ＋${pendingCount - 1}` : ''}
        </span>
      </div>
      <div
        style={{ fontSize: 10.8, lineHeight: '14px', color: C.text, marginTop: 4, maxHeight: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={request.resources.join('\n')}
      >
        {resources || '（无资源列表）'}
      </div>
      {request.message && (
        <div
          style={{ fontSize: 10.4, lineHeight: '13px', color: F.micro, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={request.message}
        >
          {truncateEnd(oneLine(request.message), 92)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
        {btn('允许一次', 'once', { bg: '#f8efd8', border: '#e6cf9f', ink: '#6d4f12' })}
        {btn('总是允许', 'always', { bg: C.segBg, border: C.segBorder, ink: '#5d564c' })}
        {btn('拒绝', 'reject', { bg: '#fdf3f0', border: '#e9c9c0', ink: '#a3543f' })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* session switcher                                                    */
/* ------------------------------------------------------------------ */

function SessionMenu({
  sessions,
  activeSessionID,
  now,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onClose,
  menuRef,
}: {
  sessions: SessionView[];
  activeSessionID: string | null;
  now: number;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionID) ?? null,
    [sessions, activeSessionID],
  );

  useEffect(() => {
    if (!renaming) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [renaming]);

  const ordered = useMemo(() => {
    const list = [...sessions];
    list.sort((a, b) => {
      const aActive = a.id === activeSessionID ? 0 : 1;
      const bActive = b.id === activeSessionID ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [sessions, activeSessionID]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (renaming && !pending) {
        setRenaming(false);
        setError(null);
        return;
      }
      onClose();
    }
  };

  const startRename = () => {
    if (!activeSession) return;
    setDraft(activeSession.title || '');
    setError(null);
    setRenaming(true);
  };

  const commitRename = async () => {
    const title = draft.trim();
    if (!title || pending) return;
    setPending(true);
    setError(null);
    try {
      await onRename(title);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  const commitDelete = async () => {
    if (!activeSession || deletePending) return;
    setDeletePending(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeletePending(false);
    }
  };

  const itemStyle = (key: string, active: boolean): CSSProperties => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    height: 34,
    border: 'none',
    padding: '0 10px 0 12px',
    background: active || hover === key ? F.wash : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: MONO,
    borderRadius: 6,
  });

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      role="menu"
      data-testid="session-menu"
      aria-label="会话列表"
      onKeyDown={onKeyDown}
      className="hide-scrollbar"
      style={{
        position: 'absolute',
        left: MSG.left,
        top: 73,
        width: MSG.width,
        maxHeight: 322,
        overflowY: 'auto',
        ...HIDE_SCROLLBAR,
        background: F.paper,
        border: `1px solid ${C.segBorder}`,
        borderRadius: 10,
        boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
        padding: '5px 0',
        zIndex: 41,
        outline: 'none',
        fontFamily: MONO,
      }}
    >
      {renaming ? (
        <div style={{ padding: '6px 10px 8px' }}>
          <div style={{ fontSize: 10.6, color: F.micro, marginBottom: 5 }}>重命名会话</div>
          <input
            ref={inputRef}
            data-testid="session-rename-input"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename();
              }
            }}
            style={{
              width: '100%',
              height: 26,
              boxSizing: 'border-box',
              border: `1px solid ${C.segBorder}`,
              borderRadius: 6,
              background: '#fffdfb',
              padding: '0 8px',
              fontFamily: MONO,
              fontSize: 12,
              color: C.ink,
              outline: 'none',
            }}
          />
          {error && (
            <div style={{ marginTop: 5, fontSize: 10.2, lineHeight: '13px', color: F.errorInk, overflowWrap: 'break-word' }}>
              {truncateEnd(oneLine(error), 120)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            <button
              type="button"
              data-testid="session-rename-save"
              disabled={!draft.trim() || pending}
              onClick={() => void commitRename()}
              style={{
                flex: '1 1 0',
                height: 24,
                border: `1px solid ${F.accent}`,
                borderRadius: 6,
                background: F.sendOn,
                color: '#fffdfb',
                fontFamily: MONO,
                fontSize: 11,
                cursor: !draft.trim() || pending ? 'default' : 'pointer',
                opacity: !draft.trim() || pending ? 0.55 : 1,
              }}
            >
              {pending ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              data-testid="session-rename-cancel"
              disabled={pending}
              onClick={() => {
                setRenaming(false);
                setError(null);
              }}
              style={{
                flex: '1 1 0',
                height: 24,
                border: `1px solid ${C.segBorder}`,
                borderRadius: 6,
                background: C.segBg,
                color: C.text,
                fontFamily: MONO,
                fontSize: 11,
                cursor: pending ? 'default' : 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            data-testid="session-new"
            onClick={onCreate}
            onMouseEnter={() => setHover('__new__')}
            onMouseLeave={() => setHover(null)}
            style={{ ...itemStyle('__new__', false), height: 30, fontSize: 12.4, fontWeight: 600, color: C.ink }}
          >
            <span style={{ fontSize: 13, lineHeight: '16px' }}>＋</span>
            <span>新建会话</span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="session-rename"
            disabled={!activeSession}
            onClick={startRename}
            onMouseEnter={() => setHover('__rename__')}
            onMouseLeave={() => setHover(null)}
            style={{
              ...itemStyle('__rename__', false),
              height: 30,
              fontSize: 12.4,
              color: activeSession ? C.text : F.micro,
              cursor: activeSession ? 'pointer' : 'default',
            }}
          >
            <span style={{ fontSize: 12, lineHeight: '16px' }}>✎</span>
            <span>重命名当前会话</span>
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="session-delete"
            disabled={!activeSession}
            onClick={() => {
              setConfirmingDelete(true);
              setError(null);
            }}
            onMouseEnter={() => setHover('__delete__')}
            onMouseLeave={() => setHover(null)}
            style={{
              ...itemStyle('__delete__', false),
              height: 30,
              fontSize: 12.4,
              color: activeSession ? '#a3543f' : F.micro,
              cursor: activeSession ? 'pointer' : 'default',
            }}
          >
            <span style={{ fontSize: 12, lineHeight: '16px' }}>⌫</span>
            <span>删除当前会话</span>
          </button>
          {confirmingDelete && activeSession && (
            <div
              data-testid="session-delete-confirm-box"
              style={{
                margin: '2px 10px 6px',
                padding: '6px 8px',
                border: '1px solid #e9c9c0',
                borderRadius: 6,
                background: '#fdf3f0',
              }}
            >
              <div style={{ fontSize: 10.4, lineHeight: '14px', color: '#a3543f', overflowWrap: 'break-word' }}>
                删除「{truncateEnd(oneLine(activeSession.title) || '未命名会话', 26)}」？子会话一并删除，不可恢复。
              </div>
              {error && (
                <div style={{ marginTop: 4, fontSize: 9.8, lineHeight: '13px', color: F.errorInk, overflowWrap: 'break-word' }}>
                  {truncateEnd(oneLine(error), 100)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  data-testid="session-delete-confirm"
                  disabled={deletePending}
                  onClick={() => void commitDelete()}
                  style={{
                    flex: '1 1 0',
                    height: 22,
                    border: '1px solid #e0b4a8',
                    borderRadius: 6,
                    background: '#f6d9d1',
                    color: '#8e3d28',
                    fontFamily: MONO,
                    fontSize: 10.8,
                    cursor: deletePending ? 'default' : 'pointer',
                    opacity: deletePending ? 0.6 : 1,
                  }}
                >
                  {deletePending ? '删除中…' : '确认删除'}
                </button>
                <button
                  type="button"
                  data-testid="session-delete-cancel"
                  disabled={deletePending}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setError(null);
                  }}
                  style={{
                    flex: '1 1 0',
                    height: 22,
                    border: `1px solid ${C.segBorder}`,
                    borderRadius: 6,
                    background: C.segBg,
                    color: C.text,
                    fontFamily: MONO,
                    fontSize: 10.8,
                    cursor: deletePending ? 'default' : 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {ordered.length === 0 && (
            <div style={{ height: 26, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, color: F.micro }}>
              暂无会话
            </div>
          )}
          {ordered.map((s) => {
            const active = s.id === activeSessionID;
            return (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                data-testid="session-item"
                data-session-id={s.id}
                title={s.title || '未命名会话'}
                onClick={() => onSelect(s.id)}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                style={itemStyle(s.id, active)}
              >
                {active && (
                  <span
                    style={{ position: 'absolute', left: 4, top: 10, width: 2.5, height: 14, borderRadius: 1.25, background: F.accent }}
                  />
                )}
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12.4,
                    fontWeight: active ? 600 : 400,
                    color: active ? C.ink : C.text,
                  }}
                >
                  {truncateEnd(oneLine(s.title) || '未命名会话', 34)}
                </span>
                {s.busy && (
                  <span title="生成中" style={{ width: 5, height: 5, borderRadius: 2.5, background: F.warn, flex: 'none' }} />
                )}
                <span style={{ flex: 'none', fontSize: 10.4, color: F.micro, marginLeft: 2 }}>{relativeTime(s.updatedAt, now)}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* model picker                                                        */
/* ------------------------------------------------------------------ */

function ModelPicker({
  catalogue,
  loading,
  error,
  current,
  pending,
  onPick,
  onClose,
}: {
  catalogue: ModelCatalogue | null;
  loading: boolean;
  error: string | null;
  current: { providerID: string; id: string } | null;
  pending: string | null;
  onPick: (model: { providerID: string; id: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query, provider]);

  const providers = catalogue?.providers ?? [];
  const total = useMemo(() => providers.reduce((sum, p) => sum + p.models.length, 0), [providers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{ providerID: string; id: string; name: string | null; context: number | null }> = [];
    for (const p of providers) {
      if (provider && p.id !== provider) continue;
      for (const model of p.models) {
        if (q && !`${model.name ?? ''} ${model.id}`.toLowerCase().includes(q)) continue;
        list.push({ providerID: p.id, id: model.id, name: model.name, context: model.context });
        if (list.length >= 80) return list;
      }
    }
    return list;
  }, [providers, provider, query]);

  const activeIndex = rows.length === 0 ? -1 : Math.min(cursor, rows.length - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelectorAll('[data-testid="model-item"]')[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <>
      <div
        data-testid="model-picker-backdrop"
        onMouseDown={() => onClose()}
        style={{ position: 'absolute', inset: 0, zIndex: 29, background: 'transparent' }}
      />
      <div
        data-testid="model-picker"
        role="dialog"
        aria-label="选择模型"
        style={{
          position: 'absolute',
          left: COMP.left,
          bottom: 732 - COMP.top + 6,
          width: COMP.width,
          maxHeight: 300,
          display: 'flex',
          flexDirection: 'column',
          background: F.paper,
          border: `1px solid ${C.segBorder}`,
          borderRadius: 10,
          boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
          zIndex: 31,
          fontFamily: MONO,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 10px 4px' }}>
          <span style={{ fontSize: 11.6, fontWeight: 600, color: C.ink }}>选择模型</span>
          <span style={{ fontSize: 9.6, color: F.micro, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={current ? `${current.providerID}/${current.id}` : undefined}>
            {current ? `${current.providerID}/${current.id}` : '当前会话没有模型'}
          </span>
          <span style={{ fontSize: 9.4, color: F.micro }}>Esc</span>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '0 10px 5px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="model-provider-all"
            onClick={() => setProvider(null)}
            style={providerChipStyle(provider === null)}
          >
            全部 {total}
          </button>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`model-provider-${p.id}`}
              onClick={() => setProvider(p.id)}
              style={providerChipStyle(provider === p.id)}
            >
              {p.id} {p.models.length}
            </button>
          ))}
        </div>

        <div style={{ padding: '0 10px 5px' }}>
          <input
            ref={inputRef}
            data-testid="model-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (rows.length === 0) return;
                setCursor((value) => (value + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const row = rows[activeIndex];
                if (row && pending == null) onPick({ providerID: row.providerID, id: row.id });
              }
            }}
            placeholder="按名称或 id 搜索…"
            style={{
              width: '100%',
              height: 24,
              boxSizing: 'border-box',
              border: `1px solid ${C.segBorder}`,
              borderRadius: 6,
              background: '#fffdfb',
              padding: '0 8px',
              fontFamily: MONO,
              fontSize: 11.4,
              color: C.ink,
              outline: 'none',
            }}
          />
        </div>

        <div ref={listRef} className="hide-scrollbar" style={{ overflowY: 'auto', ...HIDE_SCROLLBAR, padding: '0 0 4px', minHeight: 40 }}>
          {loading && <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>加载模型目录…</div>}
          {!loading && error && (
            <div style={{ padding: '6px 12px', fontSize: 10.4, lineHeight: '13.5px', color: F.errorInk, overflowWrap: 'break-word' }}>
              模型目录不可用：{truncateEnd(oneLine(error), 80)}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>没有匹配的模型</div>
          )}
          {rows.map((row, index) => {
            const key = `${row.providerID}:${row.id}`;
            const isCurrent = current != null && current.providerID === row.providerID && current.id === row.id;
            const isPending = pending === key;
            const isCursor = index === activeIndex;
            return (
              <button
                key={key}
                type="button"
                data-testid="model-item"
                data-model-key={key}
                aria-selected={isCursor}
                disabled={pending != null}
                onClick={() => onPick({ providerID: row.providerID, id: row.id })}
                onMouseEnter={() => setCursor(index)}
                title={`${row.providerID}/${row.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  width: '100%',
                  border: 'none',
                  padding: '5px 10px',
                  background: isCurrent ? F.wash : isCursor ? '#faf5ec' : 'transparent',
                  boxShadow: isCursor ? `inset 2px 0 0 ${F.accent}` : 'none',
                  cursor: pending != null ? 'default' : 'pointer',
                  textAlign: 'left',
                  fontFamily: MONO,
                  opacity: pending != null && !isPending ? 0.55 : 1,
                }}
              >
                <span style={{ flex: 'none', width: 6, fontSize: 9, color: F.accent }}>{isCurrent ? '●' : ''}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: 11.4,
                      color: isCurrent ? C.ink : C.text,
                      fontWeight: isCurrent ? 600 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.name || row.id}
                  </span>
                  <span style={{ fontSize: 9.2, color: F.micro, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.providerID}/{row.id}
                  </span>
                </span>
                {row.context != null && (
                  <span style={{ flex: 'none', fontSize: 9, color: C.icon }}>{compactCount(row.context)}</span>
                )}
                {isPending && <span style={{ flex: 'none', fontSize: 9, color: F.warn }}>切换中…</span>}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '4px 10px 6px', borderTop: `1px solid ${C.divider}`, fontSize: 9.4, color: F.micro }}>
          {rows.length >= 80 ? '仅显示前 80 个，继续输入可缩小范围' : '选择后立即切换当前会话的模型'}
        </div>
      </div>
    </>
  );
}

function providerChipStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? F.accent : C.segBorder}`,
    borderRadius: 5,
    background: active ? '#fdf3dd' : C.segBg,
    color: active ? '#6d4f12' : C.text,
    fontFamily: MONO,
    fontSize: 9.2,
    lineHeight: '13px',
    padding: '2px 6px',
    cursor: 'pointer',
  };
}

/* ------------------------------------------------------------------ */
/* agent picker (left pill)                                            */
/* ------------------------------------------------------------------ */

function AgentPicker({
  agents,
  loading,
  error,
  current,
  pending,
  onPick,
  onClose,
}: {
  agents: AgentOption[] | null;
  loading: boolean;
  error: string | null;
  current: { id: string; name: string };
  pending: string | null;
  onPick: (agent: AgentOption) => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const rows = agents ?? [];
  const activeIndex = rows.length === 0 ? -1 : Math.min(cursor, rows.length - 1);

  return (
    <>
      <div
        data-testid="agent-picker-backdrop"
        onMouseDown={() => onClose()}
        style={{ position: 'absolute', inset: 0, zIndex: 29, background: 'transparent' }}
      />
      <div
        data-testid="agent-picker"
        role="dialog"
        aria-label="选择 agent"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: COMP.left,
          bottom: 732 - COMP.top + 6,
          width: COMP.width,
          maxHeight: 244,
          display: 'flex',
          flexDirection: 'column',
          background: F.paper,
          border: `1px solid ${C.segBorder}`,
          borderRadius: 10,
          boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
          zIndex: 31,
          fontFamily: MONO,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 10px 4px' }}>
          <span style={{ fontSize: 11.6, fontWeight: 600, color: C.ink }}>选择 agent</span>
          <span style={{ fontSize: 9.6, color: F.micro, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current.name} · {current.id}
          </span>
          <span style={{ fontSize: 9.4, color: F.micro }}>Esc</span>
        </div>

        <div className="hide-scrollbar" style={{ overflowY: 'auto', ...HIDE_SCROLLBAR, padding: '0 0 4px' }}>
          {loading && <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>加载 agent 列表…</div>}
          {!loading && error && (
            <div style={{ padding: '6px 12px', fontSize: 10.4, lineHeight: '13.5px', color: F.errorInk, overflowWrap: 'break-word' }}>
              agent 列表不可用：{truncateEnd(oneLine(error), 80)}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>没有可选的 agent</div>
          )}
          {rows.map((agent, index) => {
            const isCurrent = current.id === agent.id;
            const isPending = pending === agent.id;
            const isCursor = index === activeIndex;
            return (
              <button
                key={agent.id}
                type="button"
                data-testid="agent-item"
                data-agent-id={agent.id}
                aria-selected={isCursor}
                disabled={pending != null}
                onClick={() => onPick(agent)}
                onMouseEnter={() => setCursor(index)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  width: '100%',
                  border: 'none',
                  padding: '6px 10px',
                  background: isCurrent ? F.wash : isCursor ? '#faf5ec' : 'transparent',
                  boxShadow: isCursor ? `inset 2px 0 0 ${F.accent}` : 'none',
                  cursor: pending != null ? 'default' : 'pointer',
                  textAlign: 'left',
                  fontFamily: MONO,
                  opacity: pending != null && !isPending ? 0.55 : 1,
                }}
              >
                <span style={{ flex: 'none', width: 6, fontSize: 9, color: F.accent }}>{isCurrent ? '●' : ''}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 11.8, color: isCurrent ? C.ink : C.text, fontWeight: isCurrent ? 600 : 400 }}>
                    {agent.name}
                    <span style={{ fontSize: 9.2, color: F.micro, marginLeft: 5 }}>{agent.id}</span>
                  </span>
                  {agent.description && (
                    <span style={{ fontSize: 9.4, color: F.micro, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncateEnd(oneLine(agent.description), 52)}
                    </span>
                  )}
                </span>
                {isPending && <span style={{ flex: 'none', fontSize: 9, color: F.warn }}>切换中…</span>}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '4px 10px 6px', borderTop: `1px solid ${C.divider}`, fontSize: 9.4, color: F.micro }}>
          subagent 由主 agent 派生，不能直接选择
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function AgentPanel() {
  const snapshot = useWorkbench();
  const actions = useWorkbenchActions();
  const commandError = useWorkbenchError();
  const now = useNow();

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [permPending, setPermPending] = useState<{ id: string; decision: 'once' | 'always' | 'reject' } | null>(null);
  const [stick, setStick] = useState(true);

  /* model picker (catalogue is fetched once per page, then reused) */
  const [modelsOpen, setModelsOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelPending, setModelPending] = useState<string | null>(null);

  /* agent picker (the left pill; separate from the model) */
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentList, setAgentList] = useState<AgentOption[] | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentPending, setAgentPending] = useState<string | null>(null);

  const composingRef = useRef(false);
  const imeEndAtRef = useRef(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);

  const { health, messages, permissions, activeSessionId } = snapshot;

  const activeSession = useMemo(
    () => snapshot.sessions.find((s) => s.id === activeSessionId) ?? null,
    [snapshot.sessions, activeSessionId],
  );

  const busy = useMemo(() => !!activeSession?.busy || messages.some((m) => m.streaming), [activeSession, messages]);

  // The left pill is the AGENT selector (build / plan / …), not the provider:
  // OpenCode's provider is fixed for a workbench, the agent is the choice.
  const agentText = truncateEnd(oneLine(snapshot.agent?.name || 'Build'), 8);
  const modelText = truncateEnd(
    modelLabel(snapshot.model?.id ?? activeSession?.model?.id, snapshot.model?.providerID ?? activeSession?.model?.providerID),
    18,
  );

  const sessionTitle = truncateEnd(oneLine(activeSession?.title ?? '') || snapshot.providerLabel || 'OpenCode', 30);

  const visible = useMemo(() => messages.filter(isVisibleMessage), [messages]);

  const latestTool = useMemo(() => {
    const scoped = activeSessionId ? snapshot.toolCalls.filter((t) => t.sessionID === activeSessionId) : snapshot.toolCalls;
    if (scoped.length === 0) return null;
    return [...scoped].sort((a, b) => b.startedAt - a.startedAt)[0];
  }, [snapshot.toolCalls, activeSessionId]);

  const banner = healthBanner(health, health.lastSyncAt);
  const oldestPermission = useMemo(
    () => (permissions.length === 0 ? null : [...permissions].sort((a, b) => a.requestedAt - b.requestedAt)[0]),
    [permissions],
  );

  /* ---------------------------------------------------- autoscroll ---- */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !stick) return;
    el.scrollTop = el.scrollHeight;
  }, [stick, visible, snapshot.messages]);

  // A session switch always lands at the bottom of the new transcript.
  useEffect(() => {
    setStick(true);
  }, [activeSessionId]);

  useEffect(() => {
    if (menuOpen) menuRef.current?.focus();
  }, [menuOpen]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
    setStick(atBottom);
  }, []);

  const jumpToBottom = useCallback(() => {
    setStick(true);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  /* ---------------------------------------------------- tool cards ---- */
  /** messageID -> that message's tool calls, oldest first (chat order). */
  const toolsByMessage = useMemo(() => {
    const map = new Map<string, ToolCallView[]>();
    for (const call of snapshot.toolCalls) {
      if (!call.messageID) continue;
      const list = map.get(call.messageID);
      if (list) list.push(call);
      else map.set(call.messageID, [call]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startedAt - b.startedAt);
    return map;
  }, [snapshot.toolCalls]);

  /* ---------------------------------------------------- @ mentions ---- */
  /**
   * `@` picker: the token before the caret is resolved against the real
   * workspace (`/api/fs/find`, or `/api/fs/list` for an empty query). Picking an
   * entry inserts `@relative/path` as plain text — the same token the send path
   * turns into a structured `files[]` attachment, so what the user sees and what
   * OpenCode receives can never diverge.
   */
  const [mention, setMention] = useState<{
    open: boolean;
    query: string;
    start: number;
    index: number;
    loading: boolean;
    error: string | null;
    items: FileEntry[];
  }>({ open: false, query: '', start: 0, index: 0, loading: false, error: null, items: [] });
  const mentionSeq = useRef(0);
  const mentionTimer = useRef<number | null>(null);
  const knownPaths = useRef<Set<string>>(new Set());

  // Sidebar → composer: clicking a file appends the same `@path` token the
  // picker inserts, and registers it so the send path attaches it.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      const path = typeof detail?.path === 'string' ? detail.path : null;
      if (!path) return;
      knownPaths.current.add(path);
      setText((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}@${path} `);
      setStick(true);
      taRef.current?.focus();
    };
    window.addEventListener('kunlun:mention-file', handler);
    return () => window.removeEventListener('kunlun:mention-file', handler);
  }, []);

  // Prime the known-path set with the workspace root, so a hand-typed
  // `@README.md` still becomes a real attachment even if the picker was never
  // opened in this page.
  useEffect(() => {
    let live = true;
    void fetchFiles('.')
      .then((result) => {
        if (!live) return;
        for (const entry of result.entries) {
          if (entry.type === 'file') knownPaths.current.add(entry.path);
        }
      })
      .catch(() => {
        /* the picker surfaces the same failure when the user actually needs it */
      });
    return () => {
      live = false;
    };
  }, [activeSessionId]);

  const closeMention = useCallback(() => {
    if (mentionTimer.current != null) {
      window.clearTimeout(mentionTimer.current);
      mentionTimer.current = null;
    }
    mentionSeq.current += 1;
    setMention((value) => (value.open || value.items.length || value.loading ? { ...value, open: false, loading: false, items: [] } : value));
  }, []);

  const loadMentionItems = useCallback(async (query: string) => {
    const seq = mentionSeq.current + 1;
    mentionSeq.current = seq;
    setMention((value) => ({ ...value, open: true, loading: true, error: null, query, index: 0 }));
    try {
      const result = query.trim() ? await fetchFind(query, 8) : await fetchFiles('.');
      if (seq !== mentionSeq.current) return;
      const entries = result.entries.filter((entry) => entry.type === 'file').slice(0, 8);
      for (const entry of entries) knownPaths.current.add(entry.path);
      setMention((value) => ({ ...value, open: true, loading: false, error: null, items: entries, index: 0 }));
    } catch (err) {
      if (seq !== mentionSeq.current) return;
      setMention((value) => ({
        ...value,
        open: true,
        loading: false,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const scheduleMention = useCallback(
    (query: string) => {
      if (mentionTimer.current != null) window.clearTimeout(mentionTimer.current);
      mentionTimer.current = window.setTimeout(() => {
        mentionTimer.current = null;
        void loadMentionItems(query);
      }, 140);
    },
    [loadMentionItems],
  );

  /** Detect an `@token` ending at the caret; open/close the picker accordingly. */
  const syncMention = useCallback(
    (value: string, caret: number) => {
      const before = value.slice(0, caret);
      const match = /(^|\s)@([^\s@]*)$/.exec(before);
      if (!match) {
        closeMention();
        return;
      }
      const start = match.index + (match[1] ? match[1].length : 0);
      const query = match[2];
      setMention((current) => ({ ...current, open: true, query, start, index: 0, error: null }));
      scheduleMention(query);
    },
    [closeMention, scheduleMention],
  );

  const applyMention = useCallback(
    (entry: FileEntry) => {
      const ta = taRef.current;
      if (!ta) return;
      const caret = ta.selectionStart ?? text.length;
      const start = Math.min(mention.start, caret);
      const next = `${text.slice(0, start)}@${entry.path} ${text.slice(caret)}`;
      const position = start + entry.path.length + 2;
      knownPaths.current.add(entry.path);
      setText(next);
      closeMention();
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(position, position);
      });
    },
    [closeMention, mention.start, text],
  );

  /** Paperclip / `@` icon: type an `@` at the caret and open the picker. */
  const openPicker = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? text.length;
    const next = `${text.slice(0, caret)}@${text.slice(caret)}`;
    setText(next);
    setMention({ open: true, query: '', start: caret, index: 0, loading: true, error: null, items: [] });
    scheduleMention('');
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret + 1, caret + 1);
    });
  }, [scheduleMention, text]);

  /**
   * `/` commands — the list is the agent's own (`GET /api/commands` → OpenCode
   * `/api/command`), which is exactly what the reference client renders from ACP
   * `available_commands_update`; nothing here is a hardcoded command table.
   */
  const [slash, setSlash] = useState<{
    open: boolean;
    query: string;
    start: number;
    index: number;
    loading: boolean;
    error: string | null;
    items: CommandOption[];
  }>({ open: false, query: '', start: 0, index: 0, loading: false, error: null, items: [] });
  const slashCache = useRef<CommandOption[] | null>(null);

  const matchCommands = useCallback((query: string, items: CommandOption[]): CommandOption[] => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Name prefixes win over name substrings, which win over description hits:
    // typing `/rev` must land on `review`, not on a command whose description
    // merely mentions "review".
    const ranked: Array<{ command: CommandOption; rank: number }> = [];
    for (const command of items) {
      const name = command.name.toLowerCase();
      const description = (command.description ?? '').toLowerCase();
      let rank = 3;
      if (name.startsWith(q)) rank = 0;
      else if (name.includes(q)) rank = 1;
      else if (description.includes(q)) rank = 2;
      if (rank < 3) ranked.push({ command, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name));
    return ranked.map((entry) => entry.command);
  }, []);

  const loadCommands = useCallback(async (): Promise<CommandOption[]> => {
    if (slashCache.current) return slashCache.current;
    const result = await fetchCommands();
    slashCache.current = result.commands;
    return result.commands;
  }, []);

  const closeSlash = useCallback(() => {
    setSlash((value) => (value.open || value.items.length > 0 ? { ...value, open: false, items: [] } : value));
  }, []);

  /** Detect a `/token` ending at the caret; open/close the command picker. */
  const syncSlash = useCallback(
    (value: string, caret: number) => {
      const before = value.slice(0, caret);
      const match = /(^|\s)\/([^\s/]*)$/.exec(before);
      if (!match) {
        closeSlash();
        return;
      }
      const start = match.index + (match[1] ? match[1].length : 0);
      const query = match[2];
      const cached = slashCache.current;
      setSlash((current) => ({
        ...current,
        open: true,
        query,
        start,
        index: 0,
        error: null,
        loading: cached == null,
        items: cached ? matchCommands(query, cached) : [],
      }));
      if (cached) return;
      void loadCommands()
        .then((items) => setSlash((current) => (current.open ? { ...current, loading: false, items: matchCommands(query, items) } : current)))
        .catch((err) =>
          setSlash((current) => ({
            ...current,
            loading: false,
            items: [],
            error: err instanceof Error ? err.message : String(err),
          })),
        );
    },
    [closeSlash, loadCommands, matchCommands],
  );

  const applySlashCommand = useCallback(
    (command: CommandOption) => {
      const ta = taRef.current;
      if (!ta) return;
      const caret = ta.selectionStart ?? text.length;
      const start = Math.min(slash.start, caret);
      const next = `${text.slice(0, start)}/${command.name} ${text.slice(caret)}`;
      const position = start + command.name.length + 2;
      setText(next);
      closeSlash();
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(position, position);
      });
    },
    [closeSlash, slash.start, text],
  );

  /* ---------------------------------------------------- agent picker -- */
  const openAgents = useCallback(async () => {
    if (!activeSessionId) return;
    setAgentOpen(true);
    setModelsOpen(false);
    closeMention();
    if (agentList) return;
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const result = await fetchAgents();
      setAgentList(result.agents);
    } catch (err) {
      setAgentsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentsLoading(false);
    }
  }, [activeSessionId, agentList, closeMention]);

  const pickAgent = useCallback(
    async (agent: AgentOption) => {
      setAgentPending(agent.id);
      setAgentsError(null);
      try {
        await actions.selectAgent(agent.id);
        setAgentOpen(false);
      } catch (err) {
        setAgentsError(err instanceof Error ? err.message : String(err));
      } finally {
        setAgentPending(null);
      }
    },
    [actions],
  );

  /* ---------------------------------------------------- model picker -- */
  const openModels = useCallback(async () => {
    if (!activeSessionId) return;
    setModelsOpen(true);
    setAgentOpen(false);
    closeMention();
    if (catalogue) return;
    setModelsLoading(true);
    setModelsError(null);
    try {
      setCatalogue(await fetchModels());
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelsLoading(false);
    }
  }, [activeSessionId, catalogue, closeMention]);

  const pickModel = useCallback(
    async (model: { providerID: string; id: string }) => {
      const key = `${model.providerID}:${model.id}`;
      setModelPending(key);
      setModelsError(null);
      try {
        await actions.selectModel(model);
        setModelsOpen(false);
      } catch (err) {
        // Keep the picker open: the failure reason (403 provider.auth, …) is
        // the whole point of not hiding the real catalogue.
        setModelsError(err instanceof Error ? err.message : String(err));
      } finally {
        setModelPending(null);
      }
    },
    [actions],
  );

  const handleRename = useCallback(
    async (title: string) => {
      await actions.renameSession(title);
      setMenuOpen(false);
    },
    [actions],
  );

  /* ---------------------------------------------------- composer ----- */
  const hasText = text.trim().length > 0;
  const canSend = hasText && !busy && activeSessionId != null;
  const sendColour = busy ? C.sendBg : canSend ? F.sendOn : C.sendBg;

  /**
   * Turn the `@path` tokens the user actually typed into structured attachments.
   * Only paths the picker has already shown are attached, so `@someone` or an
   * email address never becomes a bogus file URI; unknown tokens stay as text.
   */
  const attachmentsFor = useCallback(
    (body: string): Array<{ uri: string; name: string }> | null => {
      const directory = snapshot.projectDirectory;
      if (!directory) return null;
      const paths = new Set<string>();
      for (const match of body.matchAll(/(^|\s)@([^\s@]+)/g)) {
        const candidate = match[2].replace(/[),.;:]+$/, '');
        if (knownPaths.current.has(candidate)) paths.add(candidate);
      }
      if (paths.size === 0) return null;
      return [...paths].map((path) => ({
        uri: fileUri(directory, path),
        name: path.split(/[\\/]/).pop() || path,
      }));
    },
    [snapshot.projectDirectory],
  );

  const doSend = useCallback(async () => {
    const body = text.trim();
    if (!body || busy || sending || activeSessionId == null) return;
    if (mention.open) closeMention();
    if (slash.open) closeSlash();
    setSending(true);
    try {
      // `/name args` only becomes a command when the agent actually advertises
      // that name; otherwise it is ordinary text (a leading "/" is not magic).
      // Names may contain ':' (`rea:verify_reconstruction`) and '_'/'-'.
      const commandMatch = /^\/([A-Za-z0-9][A-Za-z0-9_:.-]*)(?:\s+([\s\S]*))?$/.exec(body);
      let handled = false;
      if (commandMatch) {
        let known = slashCache.current;
        if (!known) {
          try {
            known = (await fetchCommands()).commands;
            slashCache.current = known;
          } catch {
            known = null;
          }
        }
        if (known?.some((command) => command.name === commandMatch[1])) {
          await actions.command(commandMatch[1], (commandMatch[2] ?? '').trim(), attachmentsFor(body));
          handled = true;
        }
      }
      if (!handled) await actions.prompt(body, attachmentsFor(body));
      // Only clear once the bridge accepted it; a failure keeps the text.
      setText('');
      setStick(true);
    } catch {
      /* store.lastError() is surfaced in the footer; text stays in the box */
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }, [actions, activeSessionId, attachmentsFor, busy, closeMention, closeSlash, mention.open, sending, slash.open, text]);

  const doStop = useCallback(() => {
    void actions.interrupt();
    taRef.current?.focus();
  }, [actions]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slash.open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSlash((value) => {
            if (value.items.length === 0) return value;
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            return { ...value, index: (value.index + delta + value.items.length) % value.items.length };
          });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlash();
          return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && slash.items.length > 0) {
          e.preventDefault();
          applySlashCommand(slash.items[Math.min(slash.index, slash.items.length - 1)]);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          closeSlash();
          return;
        }
      }
      if (mention.open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setMention((value) => {
            if (value.items.length === 0) return value;
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            return { ...value, index: (value.index + delta + value.items.length) % value.items.length };
          });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && mention.items.length > 0) {
          e.preventDefault();
          applyMention(mention.items[Math.min(mention.index, mention.items.length - 1)]);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          closeMention();
          return;
        }
      }
      if (e.key !== 'Enter') return;
      const native = e.nativeEvent;
      // IME guard: never send while composing (or right after compositionend).
      if (composingRef.current || native.isComposing || native.keyCode === 229) return;
      if (Date.now() - imeEndAtRef.current < 120) return;
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      void doSend();
    },
    [applyMention, applySlashCommand, closeMention, closeSlash, doSend, mention, slash],
  );

  const onRespondPermission = useCallback(
    (id: string, decision: 'once' | 'always' | 'reject') => {
      if (permPending) return;
      setPermPending({ id, decision });
      void actions.respondPermission(id, decision).finally(() => setPermPending(null));
    },
    [actions, permPending],
  );

  const openMenu = useCallback(() => {
    setMenuOpen((open) => !open);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    rowRef.current?.focus();
  }, []);

  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape' && menuOpen) {
        e.stopPropagation();
        closeMenu();
      }
    },
    [menuOpen, closeMenu],
  );

  const onSelectSession = useCallback(
    (id: string) => {
      setMenuOpen(false);
      if (id !== activeSessionId) void actions.selectSession(id);
    },
    [actions, activeSessionId],
  );

  const onCreateSession = useCallback(() => {
    setMenuOpen(false);
    // A new session inherits the model the footer currently shows, instead of
    // silently dropping back to BRIDGE_MODEL for every new conversation.
    const model = snapshot.model
      ? { providerID: snapshot.model.providerID, id: snapshot.model.id }
      : null;
    void actions.createSession(undefined, model);
  }, [actions, snapshot.model]);

  const handleDelete = useCallback(async () => {
    if (!activeSessionId) return;
    await actions.deleteSession(activeSessionId);
    setMenuOpen(false);
  }, [actions, activeSessionId]);

  /* ---------------------------------------------------- message area - */
  const emptyPrimary = activeSessionId == null ? '选择或新建一个会话' : '还没有消息';
  const emptySecondary =
    activeSessionId == null ? '点击上方会话行切换，或用 ＋ 新建会话' : '在下方输入内容，Enter 发送，Shift+Enter 换行';

  // Live tool calls are rendered inside their own message bubble. The tail line
  // only survives for a call observed live before a re-sync could attach it to
  // a message — that call would otherwise be invisible in the chat.
  const showToolLine = latestTool != null && !latestTool.messageID && (busy || latestTool.status === 'running');
  const toolElapsed =
    latestTool == null
      ? null
      : latestTool.status === 'running'
        ? now - latestTool.startedAt
        : latestTool.durationMs;

  /* ---------------------------------------------------- render ------- */
  return (
    <div
      data-testid="agent-panel"
      style={{
        position: 'absolute',
        left: PANEL.left,
        top: PANEL.top,
        width: PANEL.width,
        height: PANEL.height,
        background: PANEL.bg,
        borderRadius: PANEL.radius,
      }}
    >
      {/* ---------- header (native y 213..287) ---------- */}
      <PanelGlyph x={12} y={10.5} dy={0.5} color={C.icon} />

      {/* segmented control: native (2291,224)-(2591,276) -> panel (131,5.5) 150x26 */}
      <div
        style={{
          position: 'absolute',
          left: 131,
          top: 5.5,
          width: 150,
          height: 26,
          background: C.segBg,
          border: `1px solid ${C.segBorder}`,
          borderRadius: 6.5,
        }}
      >
        {/* selected pill: native (2296,229)-(2448,269) -> panel (133.5,8) 76x20 */}
        <div
          style={{
            position: 'absolute',
            left: 1.5,
            top: 1.5,
            width: 76,
            height: 20,
            background: C.pillBg,
            borderRadius: 6.5,
            boxShadow: '0 1px 3px rgba(90,80,65,0.10), 0 0 2px rgba(90,80,65,0.07)',
          }}
        />
      </div>
      <ChatBubble x={141} y={10.5} color={C.ink} />
      <TerminalGlyph x={218} y={10.5} color={C.icon} />

      {/* window controls */}
      <ExpandGlyph x={321.9} y={11.4} color={C.icon} />
      <MinimizeGlyph x={353} y={10.7} color={C.icon} />
      <CloseGlyph x={385} y={10.5} color={C.icon} />

      {/* ---------- conversation row (native y 287..~380) ----------
          Icons keep their measured positions; the whole row is the session
          switcher hit area (an overlay, so the row itself does not move). */}
      <PanelGlyph x={12} y={47} color={C.icon} />
      <ClockGlyph x={321} y={47} color={C.icon} />
      <ArrowUpGlyph x={353.7} y={47.9} color={C.icon} />
      <CloseGlyph x={385} y={47} color={C.icon} />
      <span
        title={healthTitle(health)}
        style={{
          position: 'absolute',
          left: ROW.dotLeft,
          top: ROW.dotTop,
          width: ROW.dotSize,
          height: ROW.dotSize,
          borderRadius: ROW.dotSize / 2,
          background: healthColour(health),
          boxShadow: '0 0 0 1px rgba(255,255,255,0.55)',
          display: 'block',
        }}
      />
      <button
        ref={rowRef}
        type="button"
        data-testid="session-row"
        data-role="session-row"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={sessionTitle}
        onClick={openMenu}
        onKeyDown={onRowKeyDown}
        style={{
          position: 'absolute',
          left: ROW.hitLeft,
          top: ROW.hitTop,
          width: ROW.hitWidth,
          height: ROW.hitHeight,
          border: 'none',
          padding: 0,
          background: 'transparent',
          borderRadius: 8,
          cursor: 'pointer',
          outline: 'none',
          textAlign: 'left',
          fontFamily: MONO,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: ROW.titleLeft - ROW.hitLeft,
            top: 7,
            width: ROW.titleWidth,
            height: ROW.titleLine,
            lineHeight: `${ROW.titleLine}px`,
            fontSize: 12.8,
            fontWeight: 400,
            color: C.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {sessionTitle}
        </span>
      </button>

      {/* ---------- message list ---------- */}
      <div
        ref={listRef}
        data-testid="messages"
        data-role="messages"
        onScroll={onListScroll}
        style={{
          position: 'absolute',
          left: MSG.left,
          top: MSG.top,
          width: MSG.width,
          height: MSG.height,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...HIDE_SCROLLBAR,
          padding: banner ? '32px 0 12px' : '6px 0 12px',
          zIndex: 1,
        }}
      >
        {visible.length === 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 248,
              width: MSG.width,
              textAlign: 'center',
              pointerEvents: 'none',
              fontFamily: MONO,
            }}
          >
            <div style={{ fontSize: 12.8, color: F.hint }}>{emptyPrimary}</div>
            <div style={{ fontSize: 11, color: '#b6ada1', marginTop: 6, lineHeight: '15px' }}>{emptySecondary}</div>
          </div>
        )}

        {visible.map((m, i) => {
          const next = visible[i + 1];
          const withTail = m.role === 'user' && (!next || next.role !== 'user');
          return (
            <MessageRow key={m.id} m={m} now={now} withTail={withTail} tools={toolsByMessage.get(m.id) ?? EMPTY_TOOLS} />
          );
        })}

        {showToolLine && latestTool && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              margin: '0 0 6px',
              fontFamily: MONO,
              fontSize: 10.6,
              lineHeight: '14px',
              color: F.micro,
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <span style={{ flex: 'none', fontWeight: 600, color: latestTool.status === 'running' ? F.warn : '#8f877c' }}>
              {latestTool.kind.toUpperCase()}
            </span>
            <span
              style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={latestTool.detail || latestTool.name}
            >
              {truncateEnd(oneLine(latestTool.detail) || latestTool.name, 64)}
            </span>
            <span style={{ flex: 'none', color: '#bdb5a9' }}>·</span>
            <span style={{ flex: 'none' }}>{formatDuration(toolElapsed)}</span>
          </div>
        )}
      </div>

      {/* honest banner for a real connectivity gap (overlays the list top) */}
      {banner && (
        <div
          style={{
            position: 'absolute',
            left: MSG.left,
            top: MSG.top,
            width: MSG.width,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px',
            background: F.bannerBg,
            border: `1px solid ${F.bannerBorder}`,
            borderRadius: 6,
            fontFamily: MONO,
            fontSize: 10.8,
            color: F.bannerInk,
            zIndex: 3,
            pointerEvents: 'none',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 2.5, background: F.warn, flex: 'none' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{banner}</span>
        </div>
      )}

      {/* “回到底部” — only when the user scrolled away from the tail */}
      {!stick && visible.length > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 96,
            width: 76,
            height: 20,
            border: `1px solid ${C.segBorder}`,
            borderRadius: 10,
            background: 'rgba(255,253,251,0.96)',
            color: C.text,
            fontFamily: MONO,
            fontSize: 10.4,
            lineHeight: '18px',
            padding: 0,
            cursor: 'pointer',
            zIndex: 5,
            boxShadow: '0 1px 3px rgba(90,80,65,0.10)',
          }}
        >
          回到底部
        </button>
      )}

      {/* permission request — overlays the list bottom, never pushes the composer */}
      {oldestPermission && (
        <PermissionPrompt
          request={oldestPermission}
          pendingCount={permissions.length}
          now={now}
          pendingDecision={permPending && permPending.id === oldestPermission.id ? permPending.decision : null}
          activeSessionID={activeSessionId}
          sessionTitle={activeSession ? truncateEnd(oneLine(activeSession.title), 16) : null}
          onRespond={onRespondPermission}
        />
      )}

      {/* footer: only rendered for a real command failure (nothing is faked when healthy) */}
      {commandError && (
        <div
          style={{
            position: 'absolute',
            left: FOOT.left,
            top: FOOT.top,
            width: FOOT.width,
            height: FOOT.height,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: MONO,
            fontSize: 10.6,
            lineHeight: '14px',
            zIndex: 6,
          }}
        >
          <span
            style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: F.errorInk }}
            title={commandError}
          >
            ⚠ {truncateEnd(oneLine(commandError), 56)}
          </span>
          <button
            type="button"
            onClick={() => void actions.refresh()}
            title="重新拉取快照"
            style={{
              flex: 'none',
              height: 13,
              padding: '0 5px',
              border: `1px solid ${C.segBorder}`,
              borderRadius: 5,
              background: C.segBg,
              color: C.text,
              fontFamily: MONO,
              fontSize: 9.6,
              lineHeight: '11px',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* ---------- `/` commands: the agent's own list, inserted as text ---------- */}
      {slash.open && (
        <div
          data-testid="slash-popover"
          role="listbox"
          aria-label="命令"
          className="hide-scrollbar"
          style={{
            position: 'absolute',
            left: COMP.left,
            bottom: 732 - COMP.top + 6,
            width: COMP.width,
            maxHeight: 232,
            overflowY: 'auto',
            ...HIDE_SCROLLBAR,
            background: F.paper,
            border: `1px solid ${C.segBorder}`,
            borderRadius: 10,
            boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
            padding: '4px 0',
            zIndex: 30,
            fontFamily: MONO,
          }}
        >
          <div style={{ padding: '2px 10px 4px', fontSize: 9.6, color: F.micro, letterSpacing: 0.3 }}>
            命令 · ↑↓ 选择 · Enter 插入 · Esc 关闭
          </div>
          {slash.loading && slash.items.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>加载命令…</div>
          )}
          {slash.error && (
            <div style={{ padding: '6px 12px', fontSize: 10.6, color: F.errorInk, lineHeight: '14px' }}>
              命令列表不可用：{truncateEnd(oneLine(slash.error), 56)}
            </div>
          )}
          {!slash.loading && !slash.error && slash.items.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>
              {slash.query ? `没有匹配 “/${truncateEnd(slash.query, 20)}” 的命令` : '这个 agent 没有提供命令'}
            </div>
          )}
          {slash.items.map((command, i) => {
            const active = i === slash.index;
            return (
              <button
                key={command.name}
                type="button"
                role="option"
                aria-selected={active}
                data-testid="slash-item"
                data-command={command.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySlashCommand(command)}
                onMouseEnter={() => setSlash((value) => ({ ...value, index: i }))}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 7,
                  width: '100%',
                  border: 'none',
                  background: active ? F.wash : 'transparent',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: MONO,
                }}
              >
                <span style={{ flex: 'none', fontSize: 11.4, fontWeight: 600, color: active ? C.ink : C.text }}>
                  /{command.name}
                </span>
                {command.description && (
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      fontSize: 9.8,
                      color: F.micro,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={command.description}
                  >
                    {truncateEnd(oneLine(command.description), 58)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- `@` picker: real workspace files, inserted as text ---------- */}
      {mention.open && (
        <div
          data-testid="mention-popover"
          role="listbox"
          aria-label="引用工作区文件"
          className="hide-scrollbar"
          style={{
            position: 'absolute',
            left: COMP.left,
            bottom: 732 - COMP.top + 6, // 6 px above the composer frame
            width: COMP.width,
            maxHeight: 232,
            overflowY: 'auto',
            ...HIDE_SCROLLBAR,
            background: F.paper,
            border: `1px solid ${C.segBorder}`,
            borderRadius: 10,
            boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
            padding: '4px 0',
            zIndex: 30,
            fontFamily: MONO,
          }}
        >
          <div style={{ padding: '2px 10px 4px', fontSize: 9.6, color: F.micro, letterSpacing: 0.3 }}>
            引用工作区文件 · ↑↓ 选择 · Enter 插入 · Esc 关闭
          </div>
          {mention.loading && mention.items.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>搜索中…</div>
          )}
          {mention.error && (
            <div style={{ padding: '6px 12px', fontSize: 10.6, color: F.errorInk, lineHeight: '14px' }}>
              文件列表不可用：{truncateEnd(oneLine(mention.error), 60)}
            </div>
          )}
          {!mention.loading && !mention.error && mention.items.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: F.micro }}>
              {mention.query ? `没有匹配 “${truncateEnd(mention.query, 24)}” 的文件` : '这个目录里没有文件'}
            </div>
          )}
          {mention.items.map((entry, i) => {
            const active = i === mention.index;
            return (
              <button
                key={entry.path}
                type="button"
                role="option"
                aria-selected={active}
                data-testid="mention-item"
                data-path={entry.path}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMention(entry)}
                onMouseEnter={() => setMention((value) => ({ ...value, index: i }))}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  width: '100%',
                  border: 'none',
                  background: active ? F.wash : 'transparent',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: MONO,
                }}
              >
                <span style={{ flex: 'none', fontSize: 9, color: C.icon }}>▤</span>
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    fontSize: 11.4,
                    color: active ? C.ink : C.text,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  title={entry.path}
                >
                  {clipStart(entry.path, 46)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- composer (native 2059,1491 - 2823,1647) -> panel (15,639) 382x78 ---------- */}
      <div
        onClick={() => taRef.current?.focus()}
        style={{
          position: 'absolute',
          left: COMP.left,
          top: COMP.top,
          width: COMP.width,
          height: COMP.height,
          background: C.composerBg,
          border: `1px solid ${C.composerBorder}`,
          borderRadius: 13,
          cursor: 'text',
        }}
      />
      <ExpandGlyph x={368.9} y={650.9} color={C.composerIcon} />

      <PaperclipGlyph x={32.7} y={688.7} color={C.icon} />
      <AtGlyph x={58.4} y={688.4} color={C.icon} />
      <PanelGlyph x={85} y={688} color={C.ink} />
      <ChevronGlyph x={169} y={687.15} color={C.icon} />
      <ChevronGlyph x={339} y={687.15} color={C.icon} />

      {/* hit areas for the two file-reference icons (the artwork itself is SVG) */}
      <button
        type="button"
        data-testid="composer-attach"
        aria-label="引用工作区文件"
        title="引用工作区文件（插入 @路径）"
        onClick={openPicker}
        style={{
          position: 'absolute',
          left: 28.7,
          top: 684.7,
          width: 23,
          height: 23,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 5,
          cursor: 'pointer',
          zIndex: 9,
        }}
      />
      <button
        type="button"
        data-testid="composer-mention"
        aria-label="插入文件引用"
        title="插入文件引用（@）"
        onClick={openPicker}
        style={{
          position: 'absolute',
          left: 54.4,
          top: 684.4,
          width: 23,
          height: 23,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 5,
          cursor: 'pointer',
          zIndex: 9,
        }}
      />
      <button
        type="button"
        data-testid="agent-button"
        aria-label="选择 agent"
        aria-haspopup="dialog"
        title={activeSessionId ? '选择 agent' : '先新建会话才能选择 agent'}
        disabled={!activeSessionId}
        onClick={() => void openAgents()}
        style={{
          position: 'absolute',
          left: 80,
          top: 686,
          width: 88,
          height: 23,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 6,
          cursor: activeSessionId ? 'pointer' : 'default',
          zIndex: 9,
        }}
      />
      <button
        type="button"
        data-testid="model-button"
        aria-label="选择模型"
        aria-haspopup="dialog"
        title={activeSessionId ? '选择模型' : '先新建会话才能选择模型'}
        disabled={!activeSessionId}
        onClick={() => void openModels()}
        style={{
          position: 'absolute',
          left: 168,
          top: 686,
          width: 186,
          height: 23,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 6,
          cursor: activeSessionId ? 'pointer' : 'default',
          zIndex: 9,
        }}
      />

      {/* real input: same frame, same font, same measured baseline as the placeholder */}
      {text.length === 0 && (
        <div
          style={{
            position: 'absolute',
            left: INPUT.left + INPUT.padLeft,
            top: INPUT.top,
            width: INPUT.padText,
            height: INPUT.lineHeight,
            fontFamily: MONO,
            fontSize: INPUT.size,
            fontWeight: 600,
            lineHeight: `${INPUT.lineHeight}px`,
            color: C.icon,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {PLACEHOLDER}
        </div>
      )}
      <textarea
        ref={taRef}
        value={text}
        data-testid="composer"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          syncMention(next, e.target.selectionStart ?? next.length);
          syncSlash(next, e.target.selectionStart ?? next.length);
        }}
        onKeyDown={onKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          imeEndAtRef.current = Date.now();
        }}
        spellCheck={false}
        aria-label="给 agent 发消息"
        style={{
          position: 'absolute',
          left: INPUT.left,
          top: INPUT.top,
          width: INPUT.width,
          height: INPUT.height,
          margin: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          resize: 'none',
          padding: 0,
          paddingLeft: INPUT.padLeft,
          fontFamily: MONO,
          fontSize: INPUT.size,
          fontWeight: 600,
          lineHeight: `${INPUT.lineHeight}px`,
          color: F.input,
          caretColor: F.accent,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...HIDE_SCROLLBAR,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
        }}
      />

      {/* send / stop — one 24x24 circle, two honest states */}
      <button
        type="button"
        data-testid={busy ? 'stop' : 'send'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (busy ? doStop() : void doSend())}
        disabled={!busy && !canSend}
        aria-label={busy ? '停止生成' : '发送消息'}
        title={
          busy
            ? '停止生成'
            : canSend
              ? sending
                ? '发送中…'
                : '发送 (Enter)'
              : activeSessionId == null
                ? '先选择或新建会话'
                : '输入内容后可发送'
        }
        style={{
          position: 'absolute',
          left: SEND.left,
          top: SEND.top,
          width: SEND.size,
          height: SEND.size,
          borderRadius: SEND.size / 2,
          border: 'none',
          padding: 0,
          background: sendColour,
          cursor: busy || canSend ? 'pointer' : 'default',
          outline: 'none',
          boxShadow: canSend ? '0 1px 2px rgba(150,105,20,0.25)' : 'none',
          transition: 'background 120ms linear',
        }}
      />
      {busy ? (
        <StopGlyph color={C.text} />
      ) : (
        <ArrowUpGlyph
          x={368.95}
          y={688.05}
          color={canSend ? F.sendOnInk : C.sendArrow}
          style={{ strokeWidth: 1.8, pointerEvents: 'none' }}
        />
      )}

      {/* ---------- all static text (SVG: baseline placement is metric-exact) ---------- */}
      <svg width={PANEL.width} height={PANEL.height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <Txt weight={700} x={161.5} baseline={22.5} size={12.8} color={C.ink}>Agent</Txt>
        <Txt weight={600} x={239} baseline={23} size={12.8} color={C.text}>终端</Txt>
        <Txt weight={600} x={103.5} baseline={700} size={12.8} color={C.text}>{agentText}</Txt>
        <Txt weight={600} x={201.5} baseline={700.5} size={12.8} color={C.text}>{modelText}</Txt>
      </svg>

      {/* ---------- exposed main-surface strip below the panel (native y 1677..1698).
          The replica has no global surface layer yet, so without this the area renders
          in the chrome colour. Delete once App.tsx paints the main surface. ---------- */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: PANEL.height,
          width: PANEL.width,
          height: 11,
          background: '#fcfaf6',
        }}
      />

      {/* ---------- session dropdown (overlay: no layout shift) ---------- */}
      {menuOpen && (
        <>
          <div
            onMouseDown={() => setMenuOpen(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: 'default' }}
          />
          <SessionMenu
            sessions={snapshot.sessions}
            activeSessionID={activeSessionId}
            now={now}
            onSelect={onSelectSession}
            onCreate={onCreateSession}
            onRename={handleRename}
            onDelete={handleDelete}
            onClose={closeMenu}
            menuRef={menuRef}
          />
        </>
      )}

      {/* ---------- agent picker (left pill) ---------- */}
      {agentOpen && (
        <AgentPicker
          agents={agentList}
          loading={agentsLoading}
          error={agentsError}
          current={{ id: snapshot.agent?.id ?? 'build', name: snapshot.agent?.name ?? 'Build' }}
          pending={agentPending}
          onPick={(agent) => void pickAgent(agent)}
          onClose={() => setAgentOpen(false)}
        />
      )}

      {/* ---------- model picker (overlay above the composer) ---------- */}
      {modelsOpen && (
        <ModelPicker
          catalogue={catalogue}
          loading={modelsLoading}
          error={modelsError}
          current={snapshot.model ? { providerID: snapshot.model.providerID, id: snapshot.model.id } : null}
          pending={modelPending}
          onPick={(model) => void pickModel(model)}
          onClose={() => setModelsOpen(false)}
        />
      )}

      {/* ---------- frame (drawn last so it sits above header rules) ---------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `1px solid ${PANEL.border}`,
          borderRadius: PANEL.radius,
          boxShadow: `inset 0 1px 0 0 ${PANEL.bevelTop}, inset 0 -1px 0 0 ${PANEL.bevelBottom}`,
          pointerEvents: 'none',
        }}
      />
      {/* header / body separator: native y 285..287 -> panel y 36 */}
      <div style={{ position: 'absolute', left: 0, top: 36, width: '100%', height: 1, background: C.divider }} />
    </div>
  );
}
