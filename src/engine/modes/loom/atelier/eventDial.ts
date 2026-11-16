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
const ACCENT = { fromDeg: 37, toDeg: 43 } as const;

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
    for (let d = 12; d <= 70; d += 0.45) {
      const a = polar(DIAL.knurlOut + 2, d); const b = polar(DIAL.outerOut - 3, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F887826', 0.5);
    }
    for (let d = 15; d <= 65; d += 30) {
      const a = polar(DIAL.knurlOut + 14, d); const b = polar(DIAL.outerOut - 14, d);
      line(g, [a[0], a[1], b[0], b[1]], '#9DA0A2', 0.9);
    }
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.knurlOut + 40, 0, Math.PI * 2);
    g.strokeStyle = '#8F88782E'; g.lineWidth = 0.7; g.stroke(); g.restore();

    // ---- knurled grip band: dense diagonal ridges
    for (let d = 12; d <= 70; d += 0.5) {
      const a = polar(DIAL.tickOut + 2, d - 0.45); const b = polar(DIAL.knurlOut - 2, d + 0.45);
      const strong = Math.round(d * 10) % 4 === 0;
      line(g, [a[0], a[1], b[0], b[1]], strong ? '#BDB5A0' : '#DCD6C7', strong ? 0.9 : 0.7);
      const a2 = polar(DIAL.tickOut + 2, d + 0.1); const b2 = polar(DIAL.knurlOut - 2, d + 0.1);
      line(g, [a2[0], a2[1], b2[0], b2[1]], '#FFFFFF54', 0.55);
    }
    for (const r of [DIAL.tickOut, DIAL.knurlOut - 1]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, (12 * Math.PI) / 180, (70 * Math.PI) / 180); g.strokeStyle = '#B4AC9A'; g.lineWidth = 0.9; g.stroke(); g.restore();
    }

    // ---- smooth track ring between the plain face and the scale
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.faceOut + 4, 0, Math.PI * 2);
    g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 1.2; g.stroke(); g.restore();

    // ---- stationary screws on the plain face band; the long index marks and
    //      card windows belong to the rotating ring (see dialRotor()).
    for (let d = 13; d <= 67; d += 8) {
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

    // ---- a few quiet face guides anchor the suspended readout: three
    //      concentric rings and three radial seams, low contrast on purpose.
    for (const r of [430, 720, 930]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, (10 * Math.PI) / 180, (74 * Math.PI) / 180);
      g.strokeStyle = '#8F88781F'; g.lineWidth = 0.7; g.stroke(); g.restore();
    }
    for (const d of [18, 34, 50]) {
      const a = polar(170, d); const b = polar(DIAL.blue - 14, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F88781C', 0.7);
    }

    // ---- inner drum: panel seams, concentric guides, inspection slots
    for (const r of [300, 520, 760, 930]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#8F88781F'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.lipOut + 2, 0, Math.PI * 2); g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 1.2; g.stroke(); g.restore();


    // ---- fixed clearance ring between the rotating card windows (r ≤ 1128)
    //      and the rotating separator (r ≥ 1140): the stator keeps a visible
    //      4–8 px gap so fixed hardware can never be mistaken for a rotor part.
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.card.rOut + 4, 0, Math.PI * 2);
    g.strokeStyle = '#FFFFFFB0'; g.lineWidth = 1.1; g.stroke();
    g.beginPath(); g.arc(cx, cy, DIAL.card.rOut + 8, 0, Math.PI * 2);
    g.strokeStyle = '#8F887840'; g.lineWidth = 0.7; g.stroke();
    g.restore();

    // ---- fixed clamps now live entirely on the stationary outer housing
    //      (r 1220–1290); nothing fixed intrudes into the rotating bands.
    for (const [deg, r] of [[30, 1240], [57, 1248]] as const) {
      const [x, y] = polar(r, deg);
      g.save(); g.translate(x, y); g.rotate(((deg + 90) * Math.PI) / 180);
      // shadow of the clamp foot on the housing
      g.save(); g.translate(1.5, 2.2);
      rect(g, -25, -18, 50, 36, '#2A241614', 4);
      g.restore();
      rect(g, -22, -16, 44, 32, '#F6F1E5', 4, '#B4AC9A');
      rect(g, -16, -10, 32, 20, '#FBF9F6', 3, '#BFC2BA');
      bolt(g, -11, -6, 1.9); bolt(g, 11, -6, 1.9); bolt(g, -11, 6, 1.9); bolt(g, 11, 6, 1.9);
      // short standoff toward the fixed guide ring (never crosses the card band)
      const [ix, iy] = polar(r - 22, deg);
      line(g, [0, -18, ix - x, iy - y], '#B4AC9A', 2.2);
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
    const paper = k % 2 === 0 ? '#FBF9F6' : '#F7F4EC';
    cards.poly(pts, true).fill({ color: paper, alpha: 0.62 }).stroke({ color: '#C4C6BE', width: 0.8 });
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

  for (let d = 0; d < 360; d += 15) {
    if (d % 30 === 0) continue;
    const a = (d * Math.PI) / 180;
    const len = 7;
    minor.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
      .lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
  }
  minor.stroke({ color: '#A79E88', width: 0.55 });

  for (let d = 0; d < 360; d += 15) {
    if (d % 30 === 0) continue;
    const a = (d * Math.PI) / 180;
    const len = 15;
    mid.moveTo(Math.cos(a) * tickR, Math.sin(a) * tickR)
      .lineTo(Math.cos(a) * (tickR - len), Math.sin(a) * (tickR - len));
  }
  mid.stroke({ color: '#7C8085', width: 0.75 });

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
  major.stroke({ color: '#3B4046', width: 1.5 });

  rotor.addChild(cards, minor, mid, major);
  rotor.position.set(DIAL.cx, DIAL.cy);
  return rotor;
}

/** Fixed compact readout shell (180×92): header, neutral rule, mounting rail. */
function readoutPanel(w: number, h: number): Sprite {
  return surface(w, h, g => {
    g.save(); g.shadowColor = '#2A241626'; g.shadowBlur = 2.2; g.shadowOffsetX = .7; g.shadowOffsetY = 1.4;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 6); g.fillStyle = F.enamel; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 6); g.strokeStyle = F.edge; g.lineWidth = 1.1; g.stroke();
    rect(g, 6, 6, w - 12, h - 12, F.paper, 3, F.fine);
    line(g, [9, 56, w - 9, 56], F.fine, 0.7);
    // mounting rail at the bottom edge, bolted to the suspension bracket
    rect(g, w / 2 - 27, h - 9, 54, 5, F.steel, 2, F.edge);
    bolt(g, w / 2 - 16, h - 6.5, 1.6); bolt(g, w / 2 + 16, h - 6.5, 1.6);
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
  /** Behind the loom (stator + rotor + accent + simplified read head). */
  readonly body = new Container();
  /** In front of the loom: the fixed face-mounted readout only. */
  readonly front = new Container();

  private cfg: DialConfig;
  private state: DialState = createDialState();
  private readonly rotor: Container;
  private readonly slotTint = new Graphics();
  private readonly accent = new Graphics();
  private readonly pointer = new Graphics();
  private readonly mount = new Graphics();
  private readonly readout = new Container();
  private readonly readoutPanelSprite: Sprite;
  private readonly typeText: Text;
  private readonly multText: Text;
  private readonly stepText: Text;
  private readonly textures: Sprite[] = [];
  private lastReadout: ReadoutModel | null = null;
  private lastTintSlot = -1;
  private queueValue = -1;

  constructor(cfg: DialConfig = DIAL_CONFIG) {
    this.cfg = cfg;
    const { panel } = DIAL;

    const stator = statorBody();
    this.rotor = dialRotor();
    this.rotor.addChild(this.slotTint);
    this.body.addChild(stator, this.rotor, this.accent, this.pointer, this.mount);
    this.textures.push(stator);

    this.readoutPanelSprite = readoutPanel(panel.w, panel.h);
    this.textures.push(this.readoutPanelSprite);
    this.readout.addChild(this.readoutPanelSprite);

    this.typeText = new Text({
      text: 'IDLE',
      style: { fontFamily: SANS, fontSize: 44, fontWeight: '700', fill: '#8B9398', letterSpacing: 1 },
    });
    this.typeText.position.set(11, 9);
    this.multText = new Text({
      text: '',
      style: { fontFamily: SANS, fontSize: 22, fontWeight: '700', fill: '#1E2330', letterSpacing: 0.4 },
    });
    this.multText.anchor.set(1, 0);
    this.multText.position.set(panel.w - 11, 58);
    this.stepText = new Text({
      text: '',
      style: { fontFamily: MONO, fontSize: 22, fill: '#67624F', letterSpacing: 0.8 },
    });
    this.stepText.position.set(11, 58);

    this.readout.addChild(this.typeText, this.multText, this.stepText);
    this.readout.position.set(panel.x, panel.y);
    this.front.addChild(this.readout);

    this.drawPointer();
    this.drawMount();
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
  }

  private readoutChanged(a: ReadoutModel, b: ReadoutModel): boolean {
    return a.empty !== b.empty
      || a.type !== b.type
      || a.count !== b.count
      || (a.step?.index ?? -1) !== (b.step?.index ?? -1)
      || (a.step?.total ?? -1) !== (b.step?.total ?? -1);
  }

  private syncReadout(ro: ReadoutModel): void {
    this.readout.alpha = ro.empty ? 0.8 : 1;
    if (ro.empty) {
      this.typeText.text = 'IDLE';
      this.typeText.style.fill = '#8B9398';
      this.multText.text = '';
      this.stepText.text = '';
      this.paintTint(DEFAULT_TOOL_COLOR, 0, 0);
      this.paintAccent(DEFAULT_TOOL_COLOR);
      return;
    }
    const slot = ro.step ? ro.step.index : 1;
    this.typeText.text = ro.type ? ro.type.toUpperCase() : '—';
    this.typeText.style.fill = '#1E2330';
    this.multText.text = `×${ro.count}`;
    this.stepText.text = ro.step ? `S${pad2(ro.step.index)} / ${ro.step.total}` : 'S— / —';
    this.paintTint(ro.color, slot, 1);
    this.paintAccent(ro.color);
  }

  /** Very light tool tint on the current card window; the information lives in
   *  the readout, so the window must stay a quiet mechanical surface. */
  private paintTint(color: string, slot: number, alpha: number): void {
    if (slot === this.lastTintSlot && alpha === 0) return;
    this.lastTintSlot = slot;
    const g = this.slotTint;
    g.clear();
    if (slot < 1 || alpha <= 0) return;
    const centre = cardSlotDeg(slot);
    const pts = cardWindowPoints(centre);
    g.poly(pts, true).fill({ color, alpha: 0.025 }).stroke({ color, width: 1.1, alpha: 0.2 });
    // one short coloured edge strip on the current window: colour without area
    const a0 = ((centre - 11) * Math.PI) / 180;
    const a1 = ((centre + 11) * Math.PI) / 180;
    g.arc(0, 0, DIAL.card.rOut - 4, a0, a1).stroke({ color, width: 2.4, alpha: 0.55 });
  }

  /** One short coloured segment of the blue reference arc = current tool. */
  private paintAccent(color: string): void {
    const g = this.accent;
    g.clear();
    const { cx, cy } = DIAL;
    const a0 = (ACCENT.fromDeg * Math.PI) / 180;
    const a1 = (ACCENT.toDeg * Math.PI) / 180;
    g.arc(cx, cy, DIAL.blue, a0, a1).stroke({ color, width: 7 });
    g.arc(cx, cy, DIAL.blue - 5, a0, a1).stroke({ color: '#FFFFFF', width: 1.2, alpha: 0.5 });
  }

  /** Fixed read head: one bolted mount, one elevated arm, one aperture and a
   *  short locating notch. No fork, no conduit, no extra brackets. */
  private drawPointer(): void {
    const g = this.pointer;
    const deg = DIAL.headDeg;
    const a = (deg * Math.PI) / 180;
    const nx = Math.cos(a); const ny = Math.sin(a);
    const tx = -Math.sin(a); const ty = Math.cos(a);
    const P = (r: number, t = 0): [number, number] =>
      [DIAL.cx + nx * r + tx * t, DIAL.cy + ny * r + ty * t];

    // arm shadow shows it passes above the rotor
    const [sx0, sy0] = P(1196); const [sx1, sy1] = P(1074);
    g.moveTo(sx0 + 3, sy0 + 4).lineTo(sx1 + 3, sy1 + 4).stroke({ color: 0x2a2416, width: 6, alpha: 0.16 });
    // arm
    g.moveTo(sx0, sy0).lineTo(sx1, sy1).stroke({ color: 0x6b7075, width: 5.2, cap: 'round' });
    g.moveTo(sx0, sy0).lineTo(sx1, sy1).stroke({ color: 0xc9cbc5, width: 2.2, cap: 'round' });
    g.moveTo(sx0, sy0).lineTo(sx1, sy1).stroke({ color: 0xffffff, width: 0.8, cap: 'round' });

    // mount plate on the fixed outer housing
    const [mx, my] = P(1224);
    const plate: number[] = [];
    for (const [u, v] of [[-26, -16], [26, -16], [26, 16], [-26, 16]] as const) {
      plate.push(mx + tx * u + nx * v, my + ty * u + ny * v);
    }
    g.poly(plate, true).fill(0xf6f1e5).stroke({ color: 0xb4ac9a, width: 1 });
    for (const [u, v] of [[-16, 0], [16, 0]] as const) {
      g.circle(mx + tx * u + nx * v, my + ty * u + ny * v, 2.1)
        .fill(0xefe9db).stroke({ color: 0xa79e88, width: 0.7 });
    }

    // aperture + needle
    const [apx, apy] = P(1082);
    g.circle(apx, apy, 5.6).fill(0xfdfbf4).stroke({ color: 0x6b7075, width: 1.1 });
    g.circle(apx, apy, 1.9).fill(0x23283a);
    const [t0x, t0y] = P(1078); const [t1x, t1y] = P(1066, -3.2); const [t2x, t2y] = P(1066, 3.2);
    g.poly([t0x, t0y, t1x, t1y, t2x, t2y], true).fill(0x23283a);

    // short locating mark in the clearance gap (fixed, never rotates)
    const [n0x, n0y] = P(1136, -8); const [n1x, n1y] = P(1136, 8);
    g.moveTo(n0x, n0y).lineTo(n1x, n1y).stroke({ color: 0x171c60, width: 1.3, alpha: 0.75 });
  }

  /** Suspended readout: two clamps on the fixed blue arc carry the panel, and
   *  a short link ties it to the read-head arm. The arc is the visible datum. */
  private drawMount(): void {
    const g = this.mount;
    const p = DIAL.panel;
    const bx = p.x - 6; const by = p.y - 6; const bw = p.w + 12; const bh = p.h + 12;
    g.roundRect(bx + 2, by + 3, bw, bh, 6).fill({ color: '#2A2416', alpha: 0.15 });
    g.roundRect(bx, by, bw, bh, 6).fill(0xe8e8e0).stroke({ color: 0x9a9e9e, width: 1.1 });
    g.roundRect(bx + 2, by + 2, bw - 4, bh - 4, 4).stroke({ color: 0xffffff, width: 0.7, alpha: 0.5 });

    // clamp plate on the fixed blue arc, oriented tangentially
    const clamp = (deg: number, len: number, depth: number) => {
      const [x, y] = polar(DIAL.blue, deg);
      const a = (deg * Math.PI) / 180;
      const nx = Math.cos(a); const ny = Math.sin(a);
      const tx = -Math.sin(a); const ty = Math.cos(a);
      const c: number[] = [];
      for (const [u, v] of [[-len, -depth], [len, -depth], [len, depth], [-len, depth]] as const) {
        c.push(x + tx * u + nx * v, y + ty * u + ny * v);
      }
      g.poly(c, true).fill(0xd9d3c2).stroke({ color: 0x8f8878, width: 0.9 });
      for (const u of [-len + 5, len - 5]) {
        g.circle(x + tx * u, y + ty * u, 1.8).fill(0xefe9db).stroke({ color: 0xa79e88, width: 0.6 });
      }
    };

    // top clamp at arc 30° → panel top-right; bottom clamp at arc 44° → panel bottom-left
    const [t1x, t1y] = polar(DIAL.blue, 30);
    const [b1x, b1y] = polar(DIAL.blue, 44);
    clamp(30, 11, 6); clamp(44, 11, 6);
    const link = (x0: number, y0: number, x1: number, y1: number) => {
      g.moveTo(x0 + 2, y0 + 3).lineTo(x1 + 2, y1 + 3).stroke({ color: 0x2a2416, width: 5, alpha: 0.12 });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0x9a9e9e, width: 4.8, cap: 'round' });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0xe8e8e0, width: 2.8, cap: 'round' });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0xffffff, width: 0.7, cap: 'round' });
    };
    link(t1x, t1y, p.x + p.w - 22, p.y);
    link(b1x, b1y, p.x + 16, p.y + p.h);

    // short link to the read-head arm (r≈1152)
    const [hx, hy] = polar(1152, DIAL.headDeg);
    const sx = p.x + p.w - 16; const sy = p.y + p.h - 2;
    link(sx, sy, hx, hy);
    for (const [x, y] of [[t1x, t1y], [b1x, b1y], [sx, sy], [hx, hy]] as const) {
      g.circle(x, y, 2.4).fill(0xd9d3c2).stroke({ color: 0x8f8878, width: 0.7 });
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
