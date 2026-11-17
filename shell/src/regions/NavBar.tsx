/**
 * NavBar — pixel replica of the CrommaCode navigation row.
 *
 * client box: left 265, top 49, 1166 x 51 (transparent — it sits on the
 * `#fcfaf6` surface that App.tsx paints). Internally the measured structure is
 *
 *   0  .. 38  content row
 *   38 .. 39  1px rule #eae8e4   (native y 187..188, spans x 543..2874)
 *   39 .. 51  12px soft gradient (native y 189..212) — the shadow the two cards
 *             above them throw upward. It is NOT uniform: it fades out to both
 *             sides and has two darker streaks, so it is painted as
 *                 background = vertical ramp,  mask = measured horizontal alpha
 *             (see SHADOW_ALPHA below). Modelled abs error 1.4/255 vs 2.9 flat.
 *
 * Every number is client-relative and was measured on the 2906x1730 capture with
 * tools/probe.py / _meas.py + fontmatch.py. The table lives in
 * docs/region-titlebar-navbar.md.
 *
 * Text: the capture is rendered by GPUI/Skia with sub-pixel AA (visible RGB
 * fringes on every stem), which fattens the glyphs by roughly half a device pixel.
 * Chrome's grayscale AA is thinner, so every run here is set to weight 600
 * (Maple Mono CN SemiBold) and the CJK advance is trimmed with letter-spacing so
 * the ink boxes land exactly on the measured ones. Both choices were picked by
 * rendering candidates in the browser and scoring them against the capture
 * (mean per-channel |d| over the ink patch) — SemiBold scored ~30% better than
 * Regular for every single run.
 *
 * Icons: each one is placed by its measured *ink* box, not by a uniform 16px box —
 * the assets' internal padding differs per glyph, and most of them were ~12% too
 * large at size 16. ASSET_INK holds the ink rect of the 16px asset (measured from
 * this build); Glyph() back-solves the size and box that put that ink on target.
 */
import type { ReactNode } from 'react';
import { Icon } from '../svg/Icon';
import { useWorkbench } from '../data/store';

const UI_FONT = "'Maple Mono CN', 'Cromma Sans', 'Microsoft YaHei UI', sans-serif";

/** colours sampled from the capture */
const INK = '#1a150f'; // selected tab label / terminal label / project name
const TAB = '#766f65'; // idle tab label
const ICON = '#8e867b'; // idle icon (tabs, right rail, keyboard hint)
const TAB_OFF = '#b7b2ab'; // disabled tab label (游戏 — locked)
const ICON_OFF = '#c3beb6'; // disabled tab icon

/** nav-local origin inside the client box (client x265 / y49) */
const X0 = 265;
const Y0 = 49;

/** vertical centre of the content row: native y 148 = client 67.5 */
const ROW_CY = 67.5 - Y0;

/** tab capsule: native (1219,118)-(2199,178) */
const CAPSULE = { l: 603 - X0, t: 52.5 - Y0, w: 490, h: 30 };
/** selected white pill: native (1380.5,123.5)-(1533,169.5) */
const PILL = { l: 683.5 - X0, t: 55.25 - Y0, w: 77, h: 23 };
/** the same pill over 文件: icon ink 780..790.5 + label 800.5..832.5 (client) */
const PILL_FILES = { l: 498.5, t: PILL.t, w: 75, h: PILL.h };
/** terminal shortcut pill: native (2303,124)-(2541,172) */
const TERM = { l: 1145 - X0, t: 55.5 - Y0, w: 119, h: 24 };

/* ------------------------------------------------------------------------- */
/* top-of-card shadow band (native y 189..212, under the 1px rule)            */
/* ------------------------------------------------------------------------- */
/** mask alpha, measured at the client x = 265 + 10 * i (native 543 + 20i) */
const SHADOW_ALPHA = [
  0.23, 0.14, 0.09, 0.04, 0.01, 0.0, 0.0, 0.0, 0.03, 0.1, 0.16, 0.24, 0.26, 0.27, 0.29, 0.29, 0.3,
  0.31, 0.31, 0.29, 0.34, 0.38, 0.4, 0.38, 0.25, 0.27, 0.4, 0.52, 0.69, 0.77, 0.57, 0.45, 0.34,
  0.3, 0.31, 0.31, 0.3, 0.3, 0.3, 0.3, 0.31, 0.31, 0.3, 0.3, 0.3, 0.31, 0.3, 0.4, 0.88, 0.95,
  0.6, 0.35, 0.32, 0.32, 0.3, 0.3, 0.3, 0.29, 0.31, 0.29, 0.29, 0.27, 0.27, 0.24, 0.18, 0.1, 0.04,
];
const SHADOW_W = 665; // client 265 .. 930
const SHADOW_MASK = `linear-gradient(90deg, ${SHADOW_ALPHA.map(
  (a, i) => `rgba(0,0,0,${a}) ${i * 10}px`,
).join(', ')}, rgba(0,0,0,0) ${SHADOW_W}px)`;

/* ------------------------------------------------------------------------- */
/* per-icon ink of the 16px asset (css px inside the 16x16 viewBox)           */
/* measured from this build with _meas.py bbox over each icon's box           */
/* ------------------------------------------------------------------------- */
type Ink = { l: number; t: number; w: number; h: number };
const ASSET_INK: Record<string, Ink> = {
  lock: { l: 2.0, t: 0.6, w: 11.5, h: 14.5 },
  gauge: { l: 0.0, t: 0.5, w: 16.0, h: 13.5 },
  'file-text': { l: 2.0, t: 0.5, w: 11.5, h: 14.5 },
  bot: { l: 0.0, t: 0.9, w: 15.5, h: 13.5 },
  clock: { l: 0.0, t: 0.0, w: 15.5, h: 15.5 },
  trophy: { l: 1.5, t: 1.0, w: 12.5, h: 13.5 },
  terminal: { l: 0.5, t: 1.5, w: 14.5, h: 12.5 },
  'glyph-fork': { l: 2.75, t: 1.25, w: 10.5, h: 13.5 },
  waveform: { l: 1.5, t: 2.1, w: 12.5, h: 11.5 },
  volume: { l: 0.0, t: 1.5, w: 15.5, h: 12.5 },
  eye: { l: 0.5, t: 2.5, w: 15.0, h: 11.0 },
};

/**
 * Places one icon so that its *ink* lands on target ink box `(l, t, w, h)`
 * (nav-local css). The asset is scaled uniformly by the mean of the two axis
 * ratios: the per-axis ratios differ by a few percent because the ink was
 * measured with an antialiasing threshold, and squashing the artwork to chase
 * that difference made things worse (measured, not guessed), so a uniform
 * scale plus the mean ratio is what the pixels actually want.
 */
function Glyph({
  name,
  l,
  t,
  w,
  h,
  color,
}: {
  name: string;
  l: number;
  t: number;
  w: number;
  h: number;
  color: string;
}) {
  const a = ASSET_INK[name];
  const k = (w / a.w + h / a.h) / 2;
  const size = 16 * k;
  return (
    <div
      style={{
        position: 'absolute',
        left: l - a.l * k,
        top: t - a.t * k,
        width: size,
        height: size,
        color,
      }}
    >
      <Icon name={name} size={size} />
    </div>
  );
}

function Label({
  children,
  l,
  t,
  color,
  size = 15,
  weight = 600,
  spacing = 0,
}: {
  children: ReactNode;
  l: number;
  t: number;
  color: string;
  size?: number;
  weight?: number;
  spacing?: number;
}) {
  return (
    <span
      style={{
        position: 'absolute',
        left: l,
        top: t,
        fontFamily: UI_FONT,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1,
        letterSpacing: spacing || undefined,
        color,
        whiteSpace: 'pre',
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------- data bindings --- */
/* Only the project-name string is data-bound; its origin (12.75, 10.75) and the
 * 15 px / 600 run are the measured values. The next element starts at
 * nav-local x 338 (the 6-tab capsule), so the name is clipped to 300 px —
 * ASCII 0.6em / CJK 1.2em at 15 px. */

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

function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += advanceEm(ch);
  return em * size;
}

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

/** Last path segment of the workspace directory (`D:\a\b` -> `b`). */
function dirBasename(dir: string | null): string | null {
  if (!dir) return null;
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

export function NavBar({
  mode = 'vibe',
  canShowFiles = false,
  onModeChange,
}: {
  mode?: 'vibe' | 'files';
  canShowFiles?: boolean;
  onModeChange?: (mode: 'vibe' | 'files') => void;
}) {
  const snapshot = useWorkbench();
  const projectName = dirBasename(snapshot.projectDirectory) ?? 'test';
  /** the selected pill moves with the mode; 文件 is 4.5px narrower (measured ink) */
  const pill = mode === 'files' ? PILL_FILES : PILL;
  return (
    <div style={{ position: 'absolute', left: X0, top: Y0, width: 1166, height: 51 }}>
      {/* bottom rule: native y 187..188 */}
      <div style={{ position: 'absolute', left: 0, top: 38, width: 1166, height: 1, background: '#eae8e4' }} />
      {/* cards' shadow, native y 189..212: ramp x measured horizontal alpha */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 39,
          width: SHADOW_W,
          height: 12,
          background: 'linear-gradient(#eeece6 0%, #eceae5 25%, #ece8e4 62.5%, #e6e4df 100%)',
          maskImage: SHADOW_MASK,
          WebkitMaskImage: SHADOW_MASK,
        }}
      />

      {/* ---- backgrounds -------------------------------------------------------- */}
      <div
        style={{
          position: 'absolute',
          left: CAPSULE.l,
          top: CAPSULE.t,
          width: CAPSULE.w,
          height: CAPSULE.h,
          background: '#f9f6f1',
          border: '1px solid #e8e4df',
          borderRadius: 9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: pill.l,
          top: pill.t,
          width: pill.w,
          height: pill.h,
          background: '#fffdfb',
          border: '0.5px solid #edeae5',
          borderRadius: 6.5,
          boxShadow: '0 1.5px 4px rgba(26,21,15,0.16)',
          transition: 'left 120ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: TERM.l,
          top: TERM.t,
          width: TERM.w,
          height: TERM.h,
          background: '#f2ece3',
          borderRadius: 7,
        }}
      />

      {/* ---- project name (ink native 569..638, 138..158) ----------------------- */}
      <Label l={12.75} t={10.75} color={INK}>
        {clipToPx(projectName, 300, 15)}
      </Label>

      {/* ---- 游戏 — locked / disabled (ink 1289..1352) -------------------------- */}
      <Glyph name="lock" l={352.5} t={11.5} w={10.5} h={13.5} color={ICON_OFF} />
      <Label l={370.75} t={11} color={TAB_OFF}>
        游戏
      </Label>

      {/* ---- 氛围 — selected (ink 1446..1508) ---------------------------------- */}
      <Glyph name="gauge" l={429} t={12} w={14.5} h={12} color={mode === 'vibe' ? INK : ICON} />
      <Label l={449} t={11} color={mode === 'vibe' ? INK : TAB}>
        氛围
      </Label>

      {/* ---- 文件 (icon ink 1560..1581, label ink 1601..1665) ------------------ */}
      <Glyph name="file-text" l={509} t={12} w={10.5} h={12.5} color={mode === 'files' ? INK : ICON} />
      <Label l={526.75} t={11} color={mode === 'files' ? INK : TAB}>
        文件
      </Label>

      {/* mode hit areas (above the labels, below the icons' own layers) */}
      <button
        type="button"
        data-testid="nav-vibe"
        aria-label="氛围"
        aria-pressed={mode === 'vibe'}
        onClick={() => onModeChange?.('vibe')}
        style={{
          position: 'absolute',
          left: PILL.l,
          top: PILL.t,
          width: PILL.w,
          height: PILL.h,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 7,
          cursor: 'pointer',
          zIndex: 3,
        }}
      />
      <button
        type="button"
        data-testid="nav-files"
        aria-label="文件"
        aria-pressed={mode === 'files'}
        title={canShowFiles ? '文件' : '先从左侧打开一个文件'}
        onClick={() => canShowFiles && onModeChange?.('files')}
        style={{
          position: 'absolute',
          left: PILL_FILES.l,
          top: PILL_FILES.t,
          width: PILL_FILES.w,
          height: PILL_FILES.h,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: 7,
          cursor: canShowFiles ? 'pointer' : 'default',
          zIndex: 3,
        }}
      />

      {/* ---- 蜂群 (icon ink 1713..1740, label 1756..1820) ---------------------- */}
      <Glyph name="bot" l={585} t={12.5} w={13.5} h={12} color={ICON} />
      <Label l={604.5} t={11} color={TAB}>
        蜂群
      </Label>

      {/* ---- 痕迹 (icon ink 1869..1896, label 1912..1976) ---------------------- */}
      <Glyph name="clock" l={663} t={11.5} w={13.5} h={13.5} color={ICON} />
      <Label l={682.75} t={11} color={TAB}>
        痕迹
      </Label>

      {/* ---- 排行榜 (icon ink 2027..2050, label 2068..2168) -------------------- */}
      <Glyph name="trophy" l={742.5} t={12.5} w={11.5} h={11.5} color={ICON} />
      <Label l={761} t={11} color={TAB}>
        排行榜
      </Label>

      {/* ---- terminal shortcut pill (box native 2303..2541, 124..172) ---------- */}
      <Glyph name="terminal" l={888.5} t={12.5} w={12.5} h={11.5} color={ICON} />
      <Label l={908.25} t={11.75} color={INK} size={13} spacing={-0.5}>
        终端
      </Label>
      <Label l={945.25} t={12.25} color={ICON} size={12.5} weight={400}>
        Ctrl+J
      </Label>

      {/* ---- right icon rail (32px pitch, centres native 2580.5 .. 2836.5) ----- */}
      <Glyph name="eye" l={1011.5} t={12.5} w={15} h={12} color={ICON} />
      <Glyph name="glyph-fork" l={1046} t={12} w={10} h={12.5} color={ICON} />
      <Glyph name="waveform" l={1076.5} t={12.5} w={12.5} h={11.5} color={ICON} />
      <Glyph name="volume" l={1107} t={12} w={15.5} h={12.5} color={ICON} />
      <PanelGlyph />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* right-most rail glyph: "panel"                                             */
/* No counterpart in icons.ts / uicons.ts — traced pixel-by-pixel from the     */
/* capture. Ink native (2822,137)-(2851,158) = 14.5 x 10.5 css.                */
/* True geometry (dark runs measured per row): a rounded frame whose left and  */
/* right sides are *concave* arcs (the border centre bows 2px inward), plus a  */
/* dashed vertical bar down the middle (dashes 1 / 2 / 1 css with 1px gaps).   */
/* -------------------------------------------------------------------------- */
function PanelGlyph() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 1139.5,
        top: 13,
        width: 14.5,
        height: 10.5,
        color: ICON,
      }}
    >
      <svg viewBox="0 0 14.5 10.5" width={14.5} height={10.5} style={{ display: 'block' }} aria-hidden>
        {/* frame: flat top/bottom, concave left/right sides (centre bows 2px inward) */}
        <path
          d="M3 1 H11.5 Q13.5 1 13.4 2.3 C13.4 3.6 11.4 4.5 11.4 5.25 C11.4 6 13.4 6.9 13.4 8.2 Q13.5 9.5 11.5 9.5 H3 Q1 9.5 1.1 8.2 C1.1 6.9 3.1 6 3.1 5.25 C3.1 4.5 1.1 3.6 1.1 2.3 Q1 1 3 1 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* dashed centre bar: dashes 1 / 2 / 1 css with 1px gaps (measured) */}
        <g fill="currentColor">
          <rect x={7} y={2} width={1.5} height={1} />
          <rect x={7} y={4} width={1.5} height={3} />
          <rect x={7} y={8} width={1.5} height={1} />
        </g>
      </svg>
    </div>
  );
}
