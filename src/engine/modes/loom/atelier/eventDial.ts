/**
 * Event-scale instrument — the large cropped drum dial behind the loom's left
 * side, rebuilt as a *rotating 12-window index drum* with a *fixed* readout.
 *
 * Structure (research §9.2; deliberate KunlunMeta design, not a pixel replica):
 *
 *   stator  (never transformed)   outer bands · knurled grip · blue reference
 *                                 arc · inner drum · fixed clamp blocks
 *   rotor   (ringPhase only)      12 annular card windows + engraved 5° scale
 *   accent  (top of stator)       one coloured arc segment = current tool
 *   pointer (top of stator)       fixed read head the wheel indexes under
 *   front   control box · queue plate · harness · FIXED READOUT PANEL
 *
 * The readout panel is axis-aligned, mounted on the shared bed and positioned
 * once; its geometry carries no rotation field, so it cannot end up inside the
 * rotor by construction. Every `Text` lives in a non-rotating container: the
 * reference machine keeps its window text horizontal, and horizontal text in a
 * rotating tree would require a counter-rotation (blurred, sub-pixel drift).
 *
 * Motion follows the measured reference envelope, amplified on purpose:
 *   armDelay 105 ms → index step 180 ms (easeInOutCubic) → hold ≈2 s
 * Same-tool events aggregate in place as `×N` and do not step the ring.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { ToolEvent } from '../../../core/types';
import { FINISH as F } from './finish';
import { bolt, circle, label, line, rect, surface } from './drawing';
import { DIAL, polar } from './dialGeometry';
import {
  DIAL_CONFIG,
  DIAL_TIMING,
  createDialState,
  dialPush,
  dialReadout,
  dialTelemetry,
  dialTick,
  type DialConfig,
  type DialState,
  type ReadoutModel,
} from './dialModel';
import { DEFAULT_TOOL_COLOR } from './toolPalette';

export { DIAL };
export type { DialConfig, DialState } from './dialModel';

/** degrees per index slot on the 12-window drum */
const DIAL_SLOT_PITCH = 30;

/** prefers-reduced-motion: collapse arm + index step to an instant jump. */
const REDUCED_CFG: DialConfig = {
  ...DIAL_CONFIG,
  timing: { ...DIAL_TIMING, armDelayMs: 0, moveMs: 0 },
};

const SANS = '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif';
const MONO = 'Consolas, "SFMono-Regular", monospace';

/** Accent arc span: the reference window covers 24.0°–53.9° of the blue arc. */
const ACCENT = { fromDeg: 22, toDeg: 58 } as const;

/** Angular position of card window `slot` on the rotor (local degrees). */
const cardSlotDeg = (slot: number): number => DIAL.headDeg - slot * DIAL_SLOT_PITCH;

/* ------------------------------------------------------------------ baking */

/** Stator: ring bands, knurling, blue arc, inner drum. Baked once, never moves.
 *  Cropped to the visible bounding box of the instrument (≈700×820 instead of
 *  the full 1472×1008 sheet) to keep the texture near 9 MB. */
function statorBody(): Sprite {
  const { cx, cy } = DIAL;
  return surface(700, 820, g => {
    // contact shadow onto the sheet
    g.save(); g.shadowColor = '#2A241628'; g.shadowBlur = 2; g.shadowOffsetY = 1.2;
    g.beginPath(); g.arc(cx, cy, DIAL.lipOut, 0, Math.PI * 2); g.fillStyle = '#E8E8E0'; g.fill();
    g.restore();

    // radial band stack (outer → inner)
    circle(g, cx, cy, DIAL.lipOut, '#F5F3EC', '#BFC2BA', 1);
    circle(g, cx, cy, DIAL.outerOut, '#FBF9F6', '#BFC2BA', 0.7);
    circle(g, cx, cy, DIAL.knurlOut, '#E8E8E0', '#AEB3AE', 0.8);
    circle(g, cx, cy, DIAL.tickOut, '#F5F3EC', '#BFC2BA', 0.7);
    circle(g, cx, cy, DIAL.sepOut, '#DEDCD2', '#B9B2A2', 0.7);
    circle(g, cx, cy, DIAL.faceOut, '#FBF9F6', '#BFC2BA', 0.9);
    circle(g, cx, cy, DIAL.blue - 1, '#F5F3EC', '#DDD5C3', 0.7);

    // soft recessed shadow inside the blue arc
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.blue + 8, 0, Math.PI * 2);
    g.shadowColor = 'rgba(30,34,48,0.20)'; g.shadowBlur = 1; g.shadowOffsetX = .5; g.shadowOffsetY = 1;
    g.strokeStyle = 'rgba(247,242,230,0.9)'; g.lineWidth = 7; g.stroke();
    g.restore();
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.blue + 7, 0, Math.PI * 2);
    g.strokeStyle = '#D8D1C0'; g.lineWidth = 1.4; g.stroke(); g.restore();

    // ---- outer fine-ruled band: dense hairlines, index wedges, screws
    for (let d = 12; d <= 70; d += 0.16) {
      const a = polar(DIAL.knurlOut + 2, d); const b = polar(DIAL.outerOut - 3, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F887866', 0.6);
    }
    for (let d = 15; d <= 65; d += 9) {
      const a = polar(DIAL.knurlOut + 14, d); const b = polar(DIAL.outerOut - 14, d);
      line(g, [a[0], a[1], b[0], b[1]], '#6B6F76', 1.8);
    }
    for (let d = 14; d <= 67; d += 4) {
      const [x, y] = polar(DIAL.outerOut - 12, d);
      bolt(g, x, y, 2.5);
    }
    for (const r of [DIAL.knurlOut + 30, DIAL.knurlOut + 56, DIAL.outerOut - 26]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#8F88784D'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }

    // ---- knurled grip band: dense diagonal ridges
    for (let d = 12; d <= 70; d += 0.22) {
      const a = polar(DIAL.tickOut + 2, d - 0.45); const b = polar(DIAL.knurlOut - 2, d + 0.45);
      const strong = Math.round(d * 10) % 4 === 0;
      line(g, [a[0], a[1], b[0], b[1]], strong ? '#9E9684' : '#CFC7B5', strong ? 1.5 : 1);
      const a2 = polar(DIAL.tickOut + 2, d + 0.1); const b2 = polar(DIAL.knurlOut - 2, d + 0.1);
      line(g, [a2[0], a2[1], b2[0], b2[1]], '#FFFFFF88', 0.7);
    }
    for (const r of [DIAL.tickOut, DIAL.knurlOut - 1]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, (12 * Math.PI) / 180, (70 * Math.PI) / 180); g.strokeStyle = '#B4AC9A'; g.lineWidth = 0.9; g.stroke(); g.restore();
    }

    // ---- smooth track ring between the plain face and the scale
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.faceOut + 4, 0, Math.PI * 2);
    g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 1.2; g.stroke(); g.restore();

    // ---- stationary screws on the plain face band; the long index marks and
    //      card windows belong to the rotating ring (see dialRotor()).
    for (let d = 13; d <= 67; d += 4) {
      const [x, y] = polar(DIAL.faceOut - 16, d);
      circle(g, x, y, 2.4, '#EFE9DB', '#A79E88', 0.7);
      line(g, [x - 1.6, y + 0.6, x + 1.6, y - 0.6], '#8F8878', 0.6);
    }
    for (const r of [DIAL.blue + 52, DIAL.blue + 108]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#D8D1C055'; g.lineWidth = 0.7; g.stroke(); g.restore();
    }

    // ---- blue reference arc (the coloured current-tool segment is live)
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.blue, 0, Math.PI * 2);
    g.strokeStyle = '#171C60'; g.lineWidth = 4.4; g.stroke();
    g.beginPath(); g.arc(cx, cy, DIAL.blue - 2.6, 0, Math.PI * 2);
    g.strokeStyle = '#7888A060'; g.lineWidth = 1.1; g.stroke();
    g.restore();

    // ---- inner drum: panel seams, concentric guides, inspection slots
    for (const r of [300, 520, 760, 930]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#8F88781F'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }
    for (let d = 15; d <= 70; d += 3.5) {
      const a = polar(140, d); const b = polar(DIAL.blue - 16, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F887812', 0.7);
    }
    for (const [deg, r, w, h] of [[27, 872, 150, 46], [41, 906, 132, 40]] as const) {
      const [x, y] = polar(r, deg);
      g.save(); g.translate(x, y); g.rotate(((deg + 90) * Math.PI) / 180);
      g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      g.fillStyle = '#EAE4D6'; g.fill();
      g.strokeStyle = '#C6BFAE'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, (h - 8) / 2);
      g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 0.8; g.stroke();
      g.restore();
    }
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.lipOut + 2, 0, Math.PI * 2); g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 1.2; g.stroke(); g.restore();

    // rim joint segments along the outer lip
    for (let d = 12; d <= 70; d += 6) {
      const a0 = ((d - 1.8) * Math.PI) / 180; const a1 = ((d + 1.8) * Math.PI) / 180;
      g.save(); g.beginPath(); g.arc(cx, cy, DIAL.lipOut - 8, a0, a1); g.strokeStyle = '#B4AC9A'; g.lineWidth = 5; g.stroke();
      g.beginPath(); g.arc(cx, cy, DIAL.lipOut - 8, a0, a1); g.strokeStyle = '#E7E1D4'; g.lineWidth = 3; g.stroke(); g.restore();
    }

    // ---- fixed clamps holding the stationary housing (they never rotate)
    for (const [deg, r] of [[16, DIAL.faceOut - 36], [23, DIAL.faceOut - 26], [30, DIAL.faceOut - 20], [48, DIAL.faceOut - 18], [57, DIAL.faceOut - 28]] as const) {
      const [x, y] = polar(r, deg);
      g.save(); g.translate(x, y); g.rotate(((deg + 90) * Math.PI) / 180);
      rect(g, -26, -19, 52, 38, '#F6F1E5', 4, '#B4AC9A');
      rect(g, -20, -13, 40, 26, '#FBF9F6', 3, '#BFC2BA');
      bolt(g, -15, -8, 2.2); bolt(g, 15, -8, 2.2); bolt(g, -15, 8, 2.2); bolt(g, 15, 8, 2.2);
      g.restore();
    }
  });
}

/** One annular card window as a polygon, in rotor-local coordinates. */
function cardWindowPoints(centerDeg: number): number[] {
  const { rIn, rOut, halfSpanDeg } = DIAL.card;
  const steps = 12;
  const a0 = ((centerDeg - halfSpanDeg) * Math.PI) / 180;
  const a1 = ((centerDeg + halfSpanDeg) * Math.PI) / 180;
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push(Math.cos(a) * rOut, Math.sin(a) * rOut);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push(Math.cos(a) * rIn, Math.sin(a) * rIn);
  }
  return pts;
}

/** Rotor: 12 annular card windows + engraved 5° scale. Built once; the
 *  container is positioned on the dial centre and only its rotation changes. */
function dialRotor(): Container {
  const rotor = new Container();
  const tickR = DIAL.tickOut - 4;              // 1178
  const minor = new Graphics();
  const mid = new Graphics();
  const major = new Graphics();
  const cards = new Graphics();

  for (let k = 0; k < 12; k++) {
    const centre = cardSlotDeg(1) + k * DIAL_SLOT_PITCH;
    const pts = cardWindowPoints(centre);
    const paper = k % 2 === 0 ? '#FDFBF4' : '#F8F4EA';
    cards.poly(pts, true).fill({ color: paper, alpha: 0.97 }).stroke({ color: '#AFB5B3', width: 1.05 });
    const a = (centre * Math.PI) / 180;
    const tx = -Math.sin(a); const ty = Math.cos(a);
    // recessed inner lip: reads as a window rather than a printed label
    for (const rr of [DIAL.card.rIn + 7, DIAL.card.rOut - 7]) {
      const x = Math.cos(a) * rr; const y = Math.sin(a) * rr;
      cards.moveTo(x - tx * 16, y - ty * 16).lineTo(x + tx * 16, y + ty * 16)
        .stroke({ color: '#D8D1C0', width: 0.6 });
    }
    // index pip at the outer edge: the 12 pips orbit visibly as the drum steps
    const pipR = DIAL.card.rOut - 12;
    cards.circle(Math.cos(a) * pipR, Math.sin(a) * pipR, 1.8).fill({ color: '#9A9E9E', alpha: 0.9 });
  }

  for (let d = 0; d < 360; d += 1) {
    if (d % 5 === 0) continue;
    const a = (d * Math.PI) / 180;
    const len = 7;
    minor.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
      .lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
  }
  minor.stroke({ color: '#A79E88', width: 0.55 });

  for (let d = 0; d < 360; d += 5) {
    if (d % 30 === 0) continue;
    const a = (d * Math.PI) / 180;
    const len = 15;
    mid.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
      .lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
  }
  mid.stroke({ color: '#4E5157', width: 0.9 });

  for (let d = 0; d < 360; d += 30) {
    const a = (d * Math.PI) / 180;
    const len = 24;
    major.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
      .lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
    const k0 = DIAL.sepOut - 4; const k1 = DIAL.sepOut + 2;
    major.moveTo(Math.cos(a) * k0, Math.sin(a) * k0)
      .lineTo(Math.cos(a) * k1, Math.sin(a) * k1);
    // 12 index pips sit in the separator ring, so the step stays readable even
    // where a card window is partially cropped by the sheet edge
    major.circle(Math.cos(a) * 1146, Math.sin(a) * 1146, 2.2).fill({ color: '#5C6168', alpha: 0.9 });
  }
  major.stroke({ color: '#23272E', width: 2 });

  rotor.addChild(cards, minor, mid, major);
  rotor.position.set(DIAL.cx, DIAL.cy);
  return rotor;
}

/** Fixed rectangular readout panel, baked shell only (text is live). */
function readoutPanel(w: number, h: number): Sprite {
  return surface(w, h, g => {
    g.save(); g.shadowColor = '#2A241622'; g.shadowBlur = 2; g.shadowOffsetY = 1.4;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 8); g.fillStyle = F.enamel; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 8); g.strokeStyle = F.edge; g.lineWidth = 1.2; g.stroke();
    rect(g, 8, 8, w - 16, h - 16, F.paper, 4, F.fine);
    for (const [x, y] of [[13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13]] as const) bolt(g, x, y, 2.5);
    label(g, 'EVENT READOUT', 15, 22, 7.5, F.muted);
    line(g, [14, 29, w - 14, 29], F.fine, 0.7);
    line(g, [14, h - 26, w - 14, h - 26], F.fine, 0.7);
    label(g, '12-SLOT INDEX', w - 30, h - 9, 6.2, '#A39C89', 'right');
    // two mounting tabs read as "bolted to the shared bed"
    g.beginPath(); g.roundRect(w / 2 - 26, h - 14, 52, 10, 3); g.fillStyle = F.steel; g.fill();
    g.strokeStyle = F.edge; g.lineWidth = 0.7; g.stroke();
    bolt(g, w / 2 - 15, h - 9, 2.1); bolt(g, w / 2 + 15, h - 9, 2.1);
  });
}

/** Control box: coil module, gauge, knobs, key row, punch-card connectors. */
function controlBox(): Sprite {
  const { w, h } = DIAL.box;
  return surface(w, h, g => {
    g.save(); g.shadowColor = '#2A241620'; g.shadowBlur = 1; g.shadowOffsetY = 1;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fillStyle = '#FBF9F6'; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12);
    g.strokeStyle = '#B4AC9A'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.roundRect(7, 7, w - 14, h - 14, 9);
    g.strokeStyle = '#E2DCCD'; g.lineWidth = 0.8; g.stroke();
    for (const [x, y] of [[13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13]] as const) bolt(g, x, y, 2.8);

    // coil / transformer module
    rect(g, 14, 18, 104, 66, '#EFE9DC', 4, '#AEB3AE');
    rect(g, 18, 22, 96, 10, '#FDFBF4', 2, '#D4CDBD');
    line(g, [22, 27, 104, 27], '#BFC2BA', 0.7);
    for (const x0 of [24, 66]) {
      rect(g, x0, 42, 24, 28, '#F7F3E9', 2, '#A79F8B');
      for (let i = 0; i < 6; i++) line(g, [x0 + 2, 46 + i * 4, x0 + 22, 46 + i * 4], '#8F8878', 0.8);
      rect(g, x0, 42, 24, 6, '#DCD5C4', 2, '#A79F8B');
      rect(g, x0, 64, 24, 6, '#DCD5C4', 2, '#A79F8B');
    }
    rect(g, 56, 42, 8, 28, '#E8E8E0', 2, '#A79F8B');
    line(g, [18, 76, 114, 76], '#AEB3AE', 0.8); line(g, [18, 72, 114, 72], '#BFC2BA', 0.6);

    // gauge with a baked, fixed needle (no second rotation state to drift)
    const gx = 182; const gy = 52; const gr = 28;
    circle(g, gx, gy, gr + 4, '#E7E1D4', '#B4AC9A', 0.9);
    circle(g, gx, gy, gr, '#FDFBF4', '#A79F8B', 1);
    for (let i = 0; i <= 10; i++) {
      const a = (-220 + i * 26) * Math.PI / 180;
      line(g, [gx + Math.cos(a) * (gr - 8), gy + Math.sin(a) * (gr - 8), gx + Math.cos(a) * (gr - 3), gy + Math.sin(a) * (gr - 3)], '#5C6168', 0.8);
    }
    line(g, [gx, gy, gx + Math.cos(-1.05) * (gr - 8), gy + Math.sin(-1.05) * (gr - 8)], '#23283A', 1.8);
    circle(g, gx, gy, 2.2, '#30343C');

    // knobs
    for (const x0 of [158, 182, 206]) {
      circle(g, x0, 92, 5.6, '#EFE9DC', '#A79F8B', 0.8);
      line(g, [x0 - 3, 91, x0 + 3, 93], '#6F6A5B', 0.8);
    }

    // key grille
    rect(g, 132, 104, 100, 40, '#F1EBDF', 5, '#B4AC9A');
    for (let i = 0; i < 9; i++) {
      rect(g, 138 + i * 10.4, 109, 6.4, 30, '#FBF9F6', 2, '#BFC2BA');
    }

    // inscription slot
    rect(g, 14, 92, 104, 28, '#F6F1E5', 4, '#AEB3AE');
    rect(g, 20, 98, 62, 7, '#FDFBF4', 2, '#D4CDBD');
    line(g, [22, 101, 76, 101], '#BFC2BA', 0.6);
    bolt(g, 106, 106, 2.2);
    line(g, [20, 112, 96, 112], '#D8D1C0', 0.6);

    // vents
    for (let i = 0; i < 3; i++) {
      line(g, [136, 154 + i * 8, 226, 154 + i * 8], '#B4AC9A', 0.7);
      line(g, [136, 154 + i * 8, 136, 158 + i * 8], '#B4AC9A', 0.7);
      line(g, [226, 154 + i * 8, 226, 158 + i * 8], '#B4AC9A', 0.7);
    }

    // punch-card connector row
    rect(g, 14, 128, 112, 28, '#EFE9DC', 4, '#B4AC9A');
    for (let i = 0; i < 10; i++) {
      rect(g, 19 + i * 10.6, 132, 8, 20, i % 2 ? '#E2DCCD' : '#FBF9F6', 1.5, '#BFC2BA');
      bolt(g, 23 + i * 10.6, 142, 1.1);
    }
    circle(g, 116, 142, 3.4, '#D9D3C2', '#8F8878', 0.7);

    // conduit collar at the top of the box
    rect(g, 112, 1, 26, 8, '#C7C0B0', 2, '#8F8878');
    label(g, 'EVENT SCALE / 事件刻度 · KH-00', 14, h - 9, 4.8, '#A39C89');
  });
}

/** Queue coupler plate that sits against the loom's left base. */
function queueUnit(): Sprite {
  const { w, h } = DIAL.queue;
  return surface(w, h, g => {
    g.save(); g.shadowColor = '#2A241618'; g.shadowBlur = 1; g.shadowOffsetY = 1;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 7); g.fillStyle = '#FBF9F6'; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 7);
    g.strokeStyle = '#A79F8B'; g.lineWidth = 1; g.stroke();
    label(g, 'QUEUE', 10, 22, 8, '#5C6168');
    line(g, [46, 14, 46, h - 12], '#BFC2BA', 0.7);
    // spool coupler on top of the plate
    rect(g, 60, 6, 12, 22, '#CFC8B6', 3, '#8F8878');
    rect(g, 63, 9, 6, 16, '#E7E1D4', 2, '#B4AC9A');
    bolt(g, 126, 18, 2.2);
  });
}

/* -------------------------------------------------------------------- view */

const pad2 = (n: number): string => String(n).padStart(2, '0');

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'NOW';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export class EventDial {
  /** Behind the loom (stator + rotor + accent + read-head plumbing). */
  readonly body = new Container();
  /** In front of the loom: control box, queue plate, harness, fixed readout. */
  readonly front = new Container();

  private cfg: DialConfig;
  private state: DialState = createDialState();
  private readonly rotor: Container;
  private readonly slotTint = new Graphics();
  private readonly accent = new Graphics();
  private readonly pointer = new Graphics();
  private readonly plumbing = new Graphics();
  private readonly harness = new Graphics();
  private readonly readout = new Container();
  private readonly readoutPanelSprite: Sprite;
  private readonly typeText: Text;
  private readonly multText: Text;
  private readonly stepText: Text;
  private readonly detailText: Text;
  private readonly ageText: Text;
  private readonly chip = new Graphics();
  private readonly rule = new Graphics();
  private readonly flash = new Graphics();
  private readonly queueCount: Text;
  private readonly textures: Sprite[] = [];
  private lastReadout: ReadoutModel | null = null;
  private lastTintSlot = -1;
  private flashStartMs = -1e9;
  private queueValue = -1;
  private ageUpdatedAt = -1e9;

  constructor(cfg: DialConfig = DIAL_CONFIG) {
    this.cfg = cfg;
    const { panel } = DIAL;

    const stator = statorBody();
    this.rotor = dialRotor();
    this.rotor.addChild(this.slotTint);
    this.body.addChild(stator, this.rotor, this.accent, this.pointer, this.plumbing);
    this.textures.push(stator);

    const box = controlBox();
    box.position.set(DIAL.box.x, DIAL.box.y);
    const queue = queueUnit();
    queue.position.set(DIAL.queue.x, DIAL.queue.y);
    this.textures.push(box, queue);

    this.readoutPanelSprite = readoutPanel(panel.w, panel.h);
    this.textures.push(this.readoutPanelSprite);
    this.readout.addChild(this.readoutPanelSprite);

    this.typeText = new Text({
      text: 'IDLE',
      style: { fontFamily: SANS, fontSize: 26, fontWeight: '700', fill: '#8B9398', letterSpacing: 2.4 },
    });
    this.typeText.position.set(16, 42);
    this.multText = new Text({
      text: '',
      style: { fontFamily: SANS, fontSize: 20, fontWeight: '700', fill: '#1E2330', letterSpacing: 1.2 },
    });
    this.multText.anchor.set(1, 0);
    this.multText.position.set(panel.w - 16, 48);
    this.stepText = new Text({
      text: '',
      style: { fontFamily: MONO, fontSize: 10, fill: '#67624F', letterSpacing: 1.2 },
    });
    this.stepText.position.set(16, 88);
    this.detailText = new Text({
      text: '',
      style: { fontFamily: MONO, fontSize: 9, fill: '#78818A', letterSpacing: 0.4 },
    });
    this.detailText.position.set(16, 106);
    this.ageText = new Text({
      text: '',
      style: { fontFamily: MONO, fontSize: 8, fill: '#98A0A6', letterSpacing: 0.8 },
    });
    this.ageText.position.set(16, 130);

    this.readout.addChild(this.rule, this.chip, this.typeText, this.multText, this.stepText, this.detailText, this.ageText, this.flash);
    this.readout.position.set(panel.x, panel.y);

    this.queueCount = new Text({
      text: '0',
      style: { fontFamily: '"Arial Narrow", "Segoe UI", sans-serif', fontSize: 15, fill: '#23283A', letterSpacing: 1 },
    });
    this.queueCount.position.set(DIAL.queue.x + 88, DIAL.queue.y + 9);

    this.front.addChild(box, queue, this.harness, this.queueCount, this.readout);

    this.drawPointer();
    this.drawPlumbing();
    this.drawHarness();
    this.update(0);
  }

  /** The only event entry point. */
  pushEvent(event: ToolEvent): void {
    this.state = dialPush(this.state, event, this.cfg);
    this.apply(0);
  }

  /** The only time entry point (seconds, engine/replay clock). */
  update(dtSec: number): void {
    const dtMs = Number.isFinite(dtSec) && dtSec > 0 ? dtSec * 1000 : 0;
    const next = dialTick(this.state, dtMs, this.cfg);
    this.state = next;
    this.apply(dtMs);
  }

  setQueue(n: number): void {
    if (n === this.queueValue) return;
    this.queueValue = n;
    this.queueCount.text = String(n);
  }

  /** Engine's reduced-motion preference; collapses the index step (research §9.3). */
  setReducedMotion(on: boolean): void {
    const next = on ? REDUCED_CFG : DIAL_CONFIG;
    if (next === this.cfg) return;
    this.cfg = next;
    this.state = dialTick(this.state, 0, this.cfg);
    this.apply(0);
  }

  stateSnapshot(): DialState { return this.state; }

  telemetry(): Record<string, unknown> {
    return { ...dialTelemetry(this.state, this.cfg), queue: this.queueValue };
  }

  /* --------------------------------------------------------------- render */

  private apply(_dtMs: number): void {
    this.rotor.rotation = (this.state.angleDeg * Math.PI) / 180;

    const ro = dialReadout(this.state, this.cfg);
    if (!this.lastReadout || this.readoutChanged(this.lastReadout, ro)) {
      this.syncReadout(ro);
      this.lastReadout = ro;
    }

    // age label is refreshed a few times per second, never per frame
    if (!ro.empty && this.state.clockMs - this.ageUpdatedAt >= 200) {
      this.ageUpdatedAt = this.state.clockMs;
      this.ageText.text = formatAge(ro.ageMs);
    }

    const since = this.state.clockMs - this.flashStartMs;
    const k = since < 0 ? 0 : Math.max(0, 1 - since / 150);
    this.flash.alpha = k;
  }

  private readoutChanged(a: ReadoutModel, b: ReadoutModel): boolean {
    return a.empty !== b.empty
      || a.type !== b.type
      || a.count !== b.count
      || (a.step?.index ?? -1) !== (b.step?.index ?? -1)
      || (a.step?.total ?? -1) !== (b.step?.total ?? -1)
      || a.detail !== b.detail
      || a.color !== b.color;
  }

  private syncReadout(ro: ReadoutModel): void {
    this.readout.alpha = ro.empty ? 0.82 : 1;
    if (ro.empty) {
      this.typeText.text = 'IDLE';
      this.typeText.style.fill = '#8B9398';
      this.multText.text = '';
      this.stepText.text = '';
      this.detailText.text = '';
      this.ageText.text = '';
      this.paintChip(DEFAULT_TOOL_COLOR, 0.35);
      this.paintRule(DEFAULT_TOOL_COLOR, 0.28);
      this.paintTint(DEFAULT_TOOL_COLOR, 0, 0);
      this.paintAccent(DEFAULT_TOOL_COLOR);
      return;
    }
    const slot = ro.step ? ro.step.index : 1;
    this.typeText.text = ro.type ? ro.type.toUpperCase() : '—';
    this.typeText.style.fill = '#1E2330';
    this.multText.text = `×${ro.count}`;
    this.stepText.text = ro.step ? `S${pad2(ro.step.index)}/${ro.step.total}` : 'S—/—';
    this.detailText.text = truncate(ro.detail, 38);
    this.ageText.text = formatAge(ro.ageMs);
    this.paintChip(ro.color, 1);
    this.paintRule(ro.color, 0.85);
    this.paintTint(ro.color, slot, 1);
    this.paintAccent(ro.color);
    this.flashStartMs = this.state.clockMs;
    this.paintFlash(ro.color);
  }

  private paintChip(color: string, alpha: number): void {
    const g = this.chip;
    g.clear();
    g.roundRect(DIAL.panel.w - 34, 15, 18, 9, 2).fill({ color, alpha }).stroke({ color: '#FFFFFF', width: 0.6, alpha: 0.7 });
  }

  /** Thin tool-colour rule under the type row: ties panel and arc together. */
  private paintRule(color: string, alpha: number): void {
    const g = this.rule;
    g.clear();
    g.roundRect(16, 76, DIAL.panel.w - 32, 2.5, 1.2).fill({ color, alpha });
  }

  /** Translucent tool tint on the card window currently under the read head. */
  private paintTint(color: string, slot: number, alpha: number): void {
    if (slot === this.lastTintSlot && alpha === 0) return;
    this.lastTintSlot = slot;
    const g = this.slotTint;
    g.clear();
    if (slot < 1 || alpha <= 0) return;
    const pts = cardWindowPoints(cardSlotDeg(slot));
    g.poly(pts, true).fill({ color, alpha: 0.18 }).stroke({ color, width: 2, alpha: 0.85 });
  }

  /** One coloured segment of the blue reference arc = the current tool. */
  private paintAccent(color: string): void {
    const g = this.accent;
    g.clear();
    const { cx, cy } = DIAL;
    const a0 = (ACCENT.fromDeg * Math.PI) / 180;
    const a1 = (ACCENT.toDeg * Math.PI) / 180;
    g.arc(cx, cy, DIAL.blue, a0, a1).stroke({ color, width: 10 });
    g.arc(cx, cy, DIAL.blue - 7, a0, a1).stroke({ color: '#FFFFFF', width: 1.4, alpha: 0.55 });
    g.arc(cx, cy, DIAL.blue + 6, a0, a1).stroke({ color, width: 1.4, alpha: 0.45 });
  }

  private paintFlash(color: string): void {
    const g = this.flash;
    const { w, h } = DIAL.panel;
    g.clear();
    g.roundRect(1.5, 1.5, w - 3, h - 3, 8).stroke({ color, width: 2 });
  }

  /** Fixed read head: needle + arrow + bolted mount on the stationary housing. */
  private drawPointer(): void {
    const g = this.pointer;
    const deg = DIAL.headDeg;
    const [x0, y0] = polar(1002, deg);
    const [x1, y1] = polar(1168, deg);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0x23283a, width: 2.2, cap: 'round' });
    const a = (deg * Math.PI) / 180;
    const nx = Math.cos(a); const ny = Math.sin(a);
    const tx = -Math.sin(a); const ty = Math.cos(a);
    g.poly([
      x1, y1,
      x1 - nx * 18 + tx * 7.5, y1 - ny * 18 + ty * 7.5,
      x1 - nx * 18 - tx * 7.5, y1 - ny * 18 - ty * 7.5,
    ], true).fill(0x23283a);
    g.circle(x0, y0, 3.2).fill(0x23283a);
    // bolted mount riding the fixed outer housing, strapped to the needle root
    const [mx, my] = polar(1204, deg);
    const mtx = -Math.sin(a); const mty = Math.cos(a);
    const mrx = Math.cos(a); const mry = Math.sin(a);
    const [sx, sy] = polar(1176, deg);
    g.moveTo(sx, sy).lineTo(mx - mrx * 9, my - mry * 9).stroke({ color: 0x23283a, width: 3 });
    const corners: number[] = [];
    for (const [u, v] of [[-27, -17], [27, -17], [27, 17], [-27, 17]] as const) {
      corners.push(mx + mtx * u + mrx * v, my + mty * u + mry * v);
    }
    g.poly(corners, true).fill(0xf6f1e5).stroke({ color: 0xb4ac9a, width: 1.1 });
    for (const [u, v] of [[-19, -9], [19, -9], [-19, 9], [19, 9]] as const) {
      g.circle(mx + mtx * u + mrx * v, my + mty * u + mry * v, 2.2).fill(0xefe9db).stroke({ color: 0xa79e88, width: 0.7 });
    }
  }

  /** Static read-head feed: mount → control-box collar. */
  private drawPlumbing(): void {
    const g = this.plumbing;
    const [sx, sy] = polar(1204, DIAL.headDeg);
    const path: Array<[number, number]> = [
      [sx, sy],
      [352, 470],
      [250, 520],
      [214, DIAL.box.y + 2],
    ];
    const flat = path.flat();
    const strand = (pts: number[], color: string, width: number) => {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ color, width, cap: 'round', join: 'round' });
    };
    strand(flat, F.edge, 6);
    for (let i = -2; i <= 2; i++) {
      const off = i * 1.3;
      const pts: number[] = [];
      path.forEach(([x, y], k) => pts.push(x + off * (k < 2 ? 1 : 0.4), y + off * (k < 2 ? 0 : 1)));
      strand(pts, i === 0 ? '#E2DDD0' : '#B9B2A2', i === 0 ? 1.5 : 0.8);
    }
    strand(flat, '#FFFFFF', 0.8);
    for (const [x, y] of path.slice(1, -1)) {
      g.roundRect(x - 9, y - 3, 18, 6, 2).fill(0xd9d3c2).stroke({ color: 0x6f7a78, width: 0.8 });
      g.rect(x - 9, y - 5, 18, 1.2).fill({ color: 0xffffff, alpha: 0.67 });
    }
    g.roundRect(DIAL.box.x + 112, DIAL.box.y - 14, 36, 16, 4).fill(0xefe9dc).stroke({ color: 0x8f8878, width: 1 });
    for (let i = 0; i < 3; i++) g.rect(DIAL.box.x + 116, DIAL.box.y - 11 + i * 3.6, 28, 1).fill(0xb4ac9a);
  }

  /** Static harness: control box → queue coupler → console panel; fixed terminals. */
  private drawHarness(): void {
    const g = this.harness;
    const bx = DIAL.box.x; const by = DIAL.box.y; const bw = DIAL.box.w; const bh = DIAL.box.h;
    const q = DIAL.queue;
    const p = DIAL.panel;
    const strand = (pts: number[], color: string, width: number) => {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ color, width, cap: 'round', join: 'round' });
    };
    const pts = [bx + bw - 24, by + bh - 4, bx + bw - 24, 816, 338, 816, 338, q.y + 18, q.x, q.y + 18];
    strand(pts, F.edge, 4); strand(pts, F.enamel, 2.2);
    strand([q.x + q.w, q.y + 18, 511, q.y + 18, 511, 838], F.edge, 3.5);
    strand([q.x + q.w, q.y + 18, 511, q.y + 18, 511, 838], F.enamel, 1.8);
    for (const [x, y] of [[bx + bw - 24, by + bh - 4], [q.x, q.y + 18], [q.x + q.w, q.y + 18], [511, 838]]) {
      g.roundRect(x - 5, y - 5, 10, 10, 2).fill(F.steel).stroke({ color: F.muted, width: 0.6 });
      for (let i = -2; i <= 2; i += 2) g.moveTo(x + i, y - 4).lineTo(x + i, y + 4).stroke({ color: F.fine, width: 0.5 });
    }
    // console links: control box → readout panel, readout panel → queue plate
    strand([210, by + bh, 210, p.y + 2], F.edge, 5); strand([210, by + bh, 210, p.y + 2], F.enamel, 2.6);
    strand([p.x + p.w, p.y + 34, q.x + 2, q.y + 18], F.edge, 4); strand([p.x + p.w, p.y + 34, q.x + 2, q.y + 18], F.enamel, 2);
    for (const [x, y] of [[210, by + bh], [210, p.y + 2], [p.x + p.w, p.y + 34], [q.x + 2, q.y + 18]]) {
      g.roundRect(x - 5, y - 5, 10, 10, 2).fill(F.steel).stroke({ color: F.muted, width: 0.6 });
    }
  }

  destroy(): void {
    for (const sprite of this.textures) {
      try { sprite.texture.destroy(true); } catch { /* texture may already be gone */ }
    }
    this.textures.length = 0;
    this.body.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
