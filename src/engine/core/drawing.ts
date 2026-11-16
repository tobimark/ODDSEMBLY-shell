/**
 * Shared programmatic drawing kit for every visual mode.
 *
 * The KunlunMeta catalogue is drawn, not imported: canvas 2D bakes materials and
 * fixed geometry into textures, PixiJS composites them and animates transforms.
 * Nothing here samples reference pixels; every mark is generated from numbers.
 *
 * Convention: `surface()` bakes a canvas into a Sprite at 2× resolution; `Pen`
 * helpers draw in logical units. Dynamic values should stay as Pixi Text so they
 * remain crisp while moving.
 */
import { Sprite, Texture } from 'pixi.js';
import { FONT, HEX, T, TOOL_TINTS } from '../theme';

export type Pen = CanvasRenderingContext2D;

export const C = {
  paper: HEX.paper,
  paperWarm: HEX.paperWarm,
  paperDeep: HEX.paperDeep,
  navy: HEX.navy,
  navySoft: HEX.navySoft,
  ink: HEX.ink,
  muted: HEX.muted,
  line: HEX.line,
  teal: HEX.teal,
  tealDeep: HEX.tealDeep,
  tealPale: HEX.tealPale,
  metal: HEX.metal,
  brass: HEX.brass,
  rose: HEX.rose,
  sage: HEX.sage,
  slate: HEX.slate,
  white: HEX.white,
} as const;

export const PALETTE = {
  paper: C.paper,
  warm: C.paperWarm,
  deep: C.paperDeep,
  navy: C.navy,
  ink: C.ink,
  line: C.line,
  muted: C.muted,
  teal: C.teal,
  tealDeep: C.tealDeep,
  tealPale: C.tealPale,
  metal: C.metal,
  metalDeep: '#707489',
  brass: C.brass,
  brassPale: '#D8C6AE',
  rose: C.rose,
  sage: C.sage,
  slate: C.slate,
} as const;

/* ------------------------------------------------------------------ textures */

const textureCache = new Map<string, Texture>();

/** Bakes a canvas at `res` device scale into a Pixi sprite of logical w×h. */
export function surface(w: number, h: number, draw: (g: Pen) => void, res = 2): Sprite {
  const s = new Sprite(texture(w, h, draw, res));
  s.width = w; s.height = h;
  return s;
}

/** Cached texture baking — use for repeated components (cards, chips, rivets). */
export function cachedTexture(key: string, w: number, h: number, draw: (g: Pen) => void, res = 2): Texture {
  const hit = textureCache.get(key);
  if (hit) return hit;
  const tex = texture(w, h, draw, res);
  textureCache.set(key, tex);
  return tex;
}

export function texture(w: number, h: number, draw: (g: Pen) => void, res = 2): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * res));
  canvas.height = Math.max(1, Math.ceil(h * res));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.scale(res, res);
  draw(g);
  return Texture.from(canvas);
}

export function cachedSurface(key: string, w: number, h: number, draw: (g: Pen) => void, res = 2): Sprite {
  const s = new Sprite(cachedTexture(key, w, h, draw, res));
  s.width = w; s.height = h;
  return s;
}

/* --------------------------------------------------------------------- shapes */

export function line(g: Pen, pts: number[], color: string = C.ink, width = 1): void {
  if (pts.length < 4) return;
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

export function poly(g: Pen, pts: number[], fill: string | CanvasGradient, stroke?: string, width = 1): void {
  if (pts.length < 6) return;
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

export function rect(g: Pen, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, r = 0, stroke?: string): void {
  g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, r));
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.7; g.stroke(); }
}

export function rectPath(g: Pen, x: number, y: number, w: number, h: number, r = 0): void {
  g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, r));
}

export function stroke(g: Pen, color: string, width: number): void {
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

export function circle(g: Pen, x: number, y: number, r: number, fill: string | CanvasGradient, stroke?: string, width = 1): void {
  g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

export function ellipse(g: Pen, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string, width = 1): void {
  g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

export function arc(g: Pen, x: number, y: number, r: number, a0: number, a1: number, color: string, width = 1): void {
  g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

export function ring(g: Pen, x: number, y: number, r0: number, r1: number, fill: string | CanvasGradient, stroke?: string, width = 1): void {
  g.beginPath(); g.arc(x, y, r1, 0, Math.PI * 2); g.arc(x, y, r0, 0, Math.PI * 2, true);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

export function dashLine(g: Pen, x1: number, y1: number, x2: number, y2: number, color: string, width = 0.7, dash: number[] = [3, 3]): void {
  g.save(); g.setLineDash(dash); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = color; g.lineWidth = width; g.stroke(); g.restore();
}

/** Catmull-Rom-ish smooth polyline through points (pairs). */
export function smoothLine(g: Pen, pts: number[], color: string, width = 1, tension = 0.5): void {
  if (pts.length < 6) { line(g, pts, color, width); return; }
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 2; i += 2) {
    const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
    const x2 = pts[i + 2], y2 = pts[i + 3];
    const mx1 = x1 + (x2 - x0) * tension * 0.18;
    const my1 = y1 + (y2 - y0) * tension * 0.18;
    g.quadraticCurveTo(x1, y1, mx1, my1);
  }
  const n = pts.length;
  g.lineTo(pts[n - 2], pts[n - 1]);
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

/* --------------------------------------------------------------------- labels */

export function label(
  g: Pen, text: string, x: number, y: number, size = 9,
  color: string = C.ink, align: CanvasTextAlign = 'left', family: string = FONT.mono,
): void {
  g.font = `${size}px ${family}`; g.textAlign = align; g.fillStyle = color;
  g.fillText(text, x, y); g.textAlign = 'left';
}

export function tracked(g: Pen, text: string, x: number, y: number, size: number, color: string, spacing: number, align: CanvasTextAlign = 'left'): void {
  g.save();
  g.font = `${size}px ${FONT.display}`; g.fillStyle = color; g.textAlign = 'left';
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
  g.restore();
}

export function serif(g: Pen, text: string, x: number, y: number, size: number, color: string = C.navy, align: CanvasTextAlign = 'left'): void {
  g.font = `italic ${size}px ${FONT.serif}`; g.textAlign = align; g.fillStyle = color;
  g.fillText(text, x, y); g.textAlign = 'left';
}

/* --------------------------------------------------------------------- paper */

export interface PaperOptions {
  grain?: number;
  dots?: boolean;
  dotGap?: number;
  dotColor?: string;
  vignette?: boolean;
  warmTop?: boolean;
  seed?: number;
}

/** Warm paper field with ledger dots; shared by all mode backdrops. */
export function paper(g: Pen, w: number, h: number, opts: PaperOptions = {}): void {
  const { grain = 0.018, dots = true, dotGap = 16, dotColor = '#8F999023', vignette = true, warmTop = true, seed = 1 } = opts;
  rect(g, 0, 0, w, h, C.paper);
  if (warmTop) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#FAF7F1'); grad.addColorStop(0.55, '#FBF9F6'); grad.addColorStop(1, '#F7F2E9');
    rect(g, 0, 0, w, h, grad);
  }
  if (dots) {
    for (let x = (seed % 2) * dotGap * 0.5; x < w; x += dotGap) {
      for (let y = dotGap * 0.5; y < h; y += dotGap) circle(g, x, y, 0.55, dotColor);
    }
  }
  if (vignette) {
    const vg = g.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, '#FFFFFF00'); vg.addColorStop(1, '#B49E7A14');
    rect(g, 0, 0, w, h, vg);
  }
  if (grain > 0) grainOverlay(g, w, h, grain, seed);
}

/** Deterministic fine paper noise, baked once per surface. */
export function grainOverlay(g: Pen, w: number, h: number, amount = 0.02, seed = 1): void {
  const image = g.getImageData(0, 0, Math.min(g.canvas.width, Math.ceil(w * (g.canvas.width / w))), Math.min(g.canvas.height, Math.ceil(h * (g.canvas.height / h))));
  const d = image.data;
  let s = seed * 9301 + 49297;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 9301 + 49297) % 233280;
    const v = ((s / 233280) - 0.5) * 255 * amount;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  const tmp = document.createElement('canvas');
  tmp.width = image.width; tmp.height = image.height;
  tmp.getContext('2d')!.putImageData(image, 0, 0);
  g.save(); g.globalAlpha = 0.6;
  g.drawImage(tmp, 0, 0, w, h);
  g.restore();
}

/** Exhibition registration details: rules, corner crops, catalogue labels. */
export function sheetMarks(g: Pen, w: number, h: number, opts: { label?: string; sub?: string; right?: string } = {}): void {
  line(g, [40, 104, w - 40, 104], '#AAB1B251', 0.7);
  line(g, [40, h - 84, w - 40, h - 84], '#AAB1B251', 0.7);
  for (const [x, y, sx, sy] of [[40, 40, 1, 1], [w - 40, 40, -1, 1], [40, h - 40, 1, -1], [w - 40, h - 40, -1, -1]] as const) {
    line(g, [x, y, x + 16 * sx, y], '#9AA3A355', 0.7);
    line(g, [x, y, x, y + 16 * sy], '#9AA3A355', 0.7);
  }
  if (opts.label) label(g, opts.label, 42, 80, 9, '#8B9398');
  if (opts.sub) label(g, opts.sub, 42, h - 60, 9, '#8B9398');
  if (opts.right) label(g, opts.right, w - 42, h - 60, 9, '#8B9398', 'right');
}

export function dotField(g: Pen, x: number, y: number, w: number, h: number, gap = 14, color = '#8F999018'): void {
  for (let ix = x; ix <= x + w; ix += gap) for (let iy = y; iy <= y + h; iy += gap) circle(g, ix, iy, 0.5, color);
}

export function hatch(g: Pen, x: number, y: number, w: number, h: number, color: string, spacing = 6, width = 0.6, angle = -45): void {
  g.save(); rectPath(g, x, y, w, h); g.clip();
  const r = Math.hypot(w, h);
  g.translate(x + w / 2, y + h / 2); g.rotate((angle * Math.PI) / 180);
  g.strokeStyle = color; g.lineWidth = width;
  for (let i = -r; i < r; i += spacing) { g.beginPath(); g.moveTo(i, -r); g.lineTo(i, r); g.stroke(); }
  g.restore();
}

export function crossHatch(g: Pen, x: number, y: number, w: number, h: number, color: string, spacing = 7, width = 0.55): void {
  hatch(g, x, y, w, h, color, spacing, width, -45);
  hatch(g, x, y, w, h, color, spacing, width, 45);
}

export function shadow(g: Pen, x: number, y: number, w: number, h: number, r: number, color = '#171C6022', blur = 12): void {
  g.save(); g.filter = `blur(${blur}px)`; rect(g, x, y, w, h, color, r); g.restore();
}

/* -------------------------------------------------------------- mechanical bits */

export function metal(g: Pen, x: number, y: number, w: number, h: number, vertical = false): void {
  const grad = g.createLinearGradient(x, y, x + (vertical ? w : 0), y + (vertical ? 0 : h));
  ([[0, '#737E87'], [.12, '#D3D6D4'], [.29, '#FCFCF6'], [.46, '#E4E6E1'], [.78, '#A9B0AE'], [1, '#636D7C']] as const)
    .forEach(([s, c]) => grad.addColorStop(s, c));
  rect(g, x, y, w, h, grad, Math.min(3, h / 2), '#7D8691');
  line(g, [x + 1, y + 1, x + w - 1, y + 1], '#FFFFFF', 0.65);
}

export function bolt(g: Pen, x: number, y: number, r = 3.3): void {
  circle(g, x + .6, y + 1.1, r + 1, '#6D768850'); circle(g, x, y, r + .8, '#E7E6DF', '#92999D', 0.5);
  const pts: number[] = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  poly(g, pts, '#D1D5D3', '#65717E', 0.65); line(g, [x - r * .45, y + r * .3, x + r * .45, y - r * .3], '#555F70', 0.8);
  line(g, [x - r * .5, y - r * .65, x + r * .4, y - r * .65], '#FFFFFF', 0.7);
}

export function plate(g: Pen, x: number, y: number, w: number, h: number, dark = false, screws = true): void {
  rect(g, x + 4, y + 8, w + 2, h + 2, '#171C6019', 7);
  poly(g, [x + w, y, x + w + 8, y - 7, x + w + 8, y + h - 7, x + w, y + h], dark ? '#11183D' : '#929A9F');
  poly(g, [x, y, x + 8, y - 7, x + w + 8, y - 7, x + w, y], dark ? '#545D81' : '#FFFFFF');
  rect(g, x, y, w, h, dark ? C.navy : '#E9E9E2', 5, dark ? '#11183D' : '#7C858D');
  rect(g, x + 3, y + 3, w - 6, h - 6, dark ? '#242C66' : '#F6F5EF', 3, dark ? '#6C7795' : '#FFFFFF');
  if (screws) for (const a of [x + 9, x + w - 9]) for (const b of [y + 9, y + h - 9]) bolt(g, a, b, 2.6);
}

export function bearing(g: Pen, x: number, y: number, r = 18): void {
  plate(g, x - r - 5, y - r - 5, r * 2 + 10, r * 2 + 10, false, false);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bolt(g, x + sx * r, y + sy * r, 2.4);
  circle(g, x, y, r - 1, '#8D969C', '#626B79'); circle(g, x, y - .7, r - 4, '#EFF0EA', '#FFFFFF');
  circle(g, x, y, r - 8, '#485266', '#808C94'); circle(g, x, y, r - 10, '#C2C9C7'); bolt(g, x, y, 3.5);
}

export function rivetRow(g: Pen, x: number, y: number, len: number, spacing: number, r = 2.2, horizontal = true): void {
  for (let i = 0; i <= len; i += spacing) {
    horizontal ? bolt(g, x + i, y, r) : bolt(g, x, y + i, r);
  }
}

/* ------------------------------------------------------------------ typography frames */

/** Paper card with a hairline frame, inner register line, corner ticks and shadow. */
export function paperCard(
  g: Pen, x: number, y: number, w: number, h: number,
  opts: { r?: number; fill?: string; stroke?: string; inner?: string; ticks?: boolean; shadowBlur?: number; dashed?: boolean } = {},
): void {
  const { r = 10, fill = '#FCFAF5', stroke = '#B9BDB4', inner = '#C9CDC3', ticks = true, shadowBlur = 14, dashed = false } = opts;
  shadow(g, x + 3, y + 7, w, h, r, '#2A241816', shadowBlur);
  rect(g, x, y, w, h, fill, r, stroke);
  g.save();
  rectPath(g, x + 5, y + 5, w - 10, h - 10, Math.max(1, r - 4));
  g.strokeStyle = inner; g.lineWidth = 0.6;
  if (dashed) g.setLineDash([5, 4]);
  g.stroke(); g.restore();
  if (ticks) {
    const t = 7;
    line(g, [x, y + h * 0.5 - t / 2, x, y + h * 0.5 + t / 2], '#8C958F', 1);
    line(g, [x + w, y + h * 0.5 - t / 2, x + w, y + h * 0.5 + t / 2], '#8C958F', 1);
    line(g, [x + w * 0.5 - t / 2, y, x + w * 0.5 + t / 2, y], '#8C958F', 1);
    line(g, [x + w * 0.5 - t / 2, y + h, x + w * 0.5 + t / 2, y + h], '#8C958F', 1);
  }
}

/** Diagonal hatch placeholder used for empty sponsor / voucher slots. */
export function washi(g: Pen, x: number, y: number, w: number, h: number, r = 6, color = '#5F5A4C', alpha = 0.09, gap = 13): void {
  g.save(); rectPath(g, x, y, w, h, r); g.clip();
  rect(g, x, y, w, h, `rgba(233,227,214,0.55)`);
  g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 7;
  for (let i = -h; i < w + h; i += gap) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke(); }
  g.restore();
  rect(g, x, y, w, h, '#00000000', r, '#AEB2A8');
}

/* --------------------------------------------------------------------- chips/cards */

export interface ChipColors { face: string; rim: string; edge: string; ink: string }

export const CHIP_COLORS: Record<string, ChipColors> = {
  navy: { face: '#F6F3EA', rim: '#171C60', edge: '#2C3470', ink: '#171C60' },
  teal: { face: '#F2F8F4', rim: '#1F8F92', edge: '#33CBCC', ink: '#134A4C' },
  brass: { face: '#F8F2E4', rim: '#B28D5E', edge: '#8C6A3F', ink: '#5E4526' },
  ink: { face: '#F4F4EF', rim: '#22263F', edge: '#3B3F58', ink: '#22263F' },
  rose: { face: '#F9F1EE', rim: '#B4787A', edge: '#C79A9A', ink: '#693B3D' },
  sage: { face: '#F3F6F0', rim: '#6D8579', edge: '#9BB3A8', ink: '#374A3E' },
  paper: { face: '#FCFAF3', rim: '#A8AC9F', edge: '#CFD2C6', ink: '#5A5D52' },
};

/** Top-down poker chip with edge spots. */
export function chip(g: Pen, x: number, y: number, r: number, colors: ChipColors, value?: string): void {
  circle(g, x + 1.4, y + 2.4, r + 1, '#2A241820');
  circle(g, x, y, r, colors.rim, colors.edge, 0.8);
  circle(g, x, y, r * 0.84, colors.face, '#FFFFFF', 0.8);
  g.save(); g.beginPath(); g.arc(x, y, r * 0.99, 0, Math.PI * 2); g.clip();
  g.fillStyle = colors.face;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save(); g.translate(x, y); g.rotate(a);
    rect(g, -r * 0.14, -r, r * 0.28, r * 0.30, colors.edge);
    g.restore();
  }
  g.restore();
  circle(g, x, y, r * 0.62, '#00000006', '#00000018', 0.6);
  if (value) label(g, value, x, y + r * 0.18, Math.max(5, r * 0.55), colors.ink, 'center');
}

/** Stacked chips with a little perspective offset. */
export function chipStack(g: Pen, x: number, y: number, r: number, count: number, colors: ChipColors): void {
  const n = Math.min(count, 7);
  for (let i = n; i > 0; i--) {
    circle(g, x + i * 0.8, y - i * 2.4, r, colors.rim, colors.edge, 0.5);
  }
  chip(g, x, y, r, colors);
}

/* ---------------------------------------------------------------------- gauges */

export function tickRing(
  g: Pen, x: number, y: number, r0: number, r1: number, count: number,
  a0: number, a1: number, color: string, width = 0.8, majorEvery = 5, majorLen = 1.5,
): void {
  for (let i = 0; i <= count; i++) {
    const a = a0 + ((a1 - a0) * i) / count;
    const major = i % majorEvery === 0;
    const rr1 = major ? r1 + (r1 - r0) * (majorLen - 1) : r1;
    line(g, [x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * rr1, y + Math.sin(a) * rr1], color, major ? width + 0.35 : width);
  }
}

export function scaleBar(g: Pen, x: number, y: number, len: number, steps: number, color: string, opts: { labelEvery?: number; height?: number; vertical?: boolean; labels?: (i: number) => string } = {}): void {
  const { labelEvery = 5, height = 5, vertical = false, labels } = opts;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = vertical ? x : x + len * t;
    const py = vertical ? y + len * t : y;
    const major = i % labelEvery === 0;
    const h = major ? height + 3 : height;
    line(g, [px, py, px + (vertical ? h : 0), py + (vertical ? 0 : h)], color, major ? 0.9 : 0.6);
    if (major && labels) {
      if (vertical) label(g, labels(i), px - 6, py + 2.5, 6, color, 'right');
      else label(g, labels(i), px, py - 5, 6, color, 'center');
    }
  }
}

export function dialFace(
  g: Pen, x: number, y: number, r: number,
  opts: { ticks?: number; a0?: number; a1?: number; ink?: string; faceA?: string; faceB?: string; rim?: number } = {},
): void {
  const { ticks = 60, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ink = '#59636A', faceA = '#FBF8EE', faceB = '#EFE9DA', rim = 10 } = opts;
  circle(g, x + 2, y + 4, r + rim / 2, '#2A241812');
  circle(g, x, y, r + rim, '#D9D6C9', '#7C817B', 1.2);
  circle(g, x, y, r + rim - 2, '#F4EFE2');
  const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, faceA); grad.addColorStop(1, faceB);
  circle(g, x, y, r, grad, '#9EA398', 0.8);
  tickRing(g, x, y, r - 5, r - 1, ticks, a0, a1, ink, 0.6, 5, 1.9);
}

/** Hand-wheel valve (viewed face-on). */
export function valveWheel(g: Pen, x: number, y: number, r: number, angle = 0, color = '#5C6670'): void {
  circle(g, x + 1.5, y + 2.5, r + 2, '#2A241816');
  g.save(); g.translate(x, y); g.rotate(angle);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    line(g, [0, 0, Math.cos(a) * r, Math.sin(a) * r], color, Math.max(2, r * 0.12));
    circle(g, Math.cos(a) * r, Math.sin(a) * r, r * 0.16, '#DDE0D8', '#7D8489', 0.7);
  }
  circle(g, 0, 0, r * 0.34, '#C9CCC3', color, 1);
  circle(g, 0, 0, r * 0.5, '#00000000', color, Math.max(1.4, r * 0.1));
  g.restore();
}

/* -------------------------------------------------------------------- pipes/tanks */

/** Draw a pipe with rounded elbows: `pts` are centreline pairs. */
export function pipePath(g: Pen, pts: number[], width: number, opts: { body?: string; edge?: string; inner?: string; radius?: number } = {}): void {
  const { body = '#E4E1D6', edge = '#8B928F', inner = '#FFFFFF88', radius = 10 } = opts;
  const p = [...pts];
  const r = Math.min(radius, width * 2.2);
  const path = (): void => {
    g.beginPath(); g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) {
      const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1], x2 = p[i + 2], y2 = p[i + 3];
      const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      const ax = x1 - ((x1 - x0) / (d1 || 1)) * rr, ay = y1 - ((y1 - y0) / (d1 || 1)) * rr;
      const bx = x1 + ((x2 - x1) / (d2 || 1)) * rr, by = y1 + ((y2 - y1) / (d2 || 1)) * rr;
      g.lineTo(ax, ay); g.quadraticCurveTo(x1, y1, bx, by);
    }
    g.lineTo(p[p.length - 2], p[p.length - 1]);
  };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  path(); g.strokeStyle = edge; g.lineWidth = width + 1.2; g.stroke();
  path(); g.strokeStyle = body; g.lineWidth = width; g.stroke();
  path(); g.strokeStyle = inner; g.lineWidth = Math.max(0.7, width * 0.28); g.stroke();
  g.restore();
}

export function flange(g: Pen, x: number, y: number, r: number, horizontal = false): void {
  g.save(); g.translate(x, y); if (!horizontal) g.rotate(Math.PI / 2);
  rect(g, -r, -r * 0.22, r * 2, r * 0.44, '#D8D5C9', 2, '#8B928F');
  for (let i = -1; i <= 1; i++) bolt(g, i * r * 0.66, 0, Math.max(1.8, r * 0.1));
  g.restore();
}

/* ------------------------------------------------------------------ tool symbols */

/** Compact line glyph for the five agent tools (drawn, not font-based). */
export function toolGlyph(g: Pen, type: string, x: number, y: number, size: number, color: string, width = 1.2): void {
  const s = size / 2;
  g.save(); g.translate(x, y);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (type) {
    case 'Read': // open book with a lens
      g.moveTo(-s, -s * 0.55); g.quadraticCurveTo(-s * 0.35, -s * 0.8, 0, -s * 0.35);
      g.quadraticCurveTo(s * 0.35, -s * 0.8, s, -s * 0.55);
      g.lineTo(s, s * 0.55); g.quadraticCurveTo(s * 0.35, s * 0.3, 0, s * 0.65);
      g.quadraticCurveTo(-s * 0.35, s * 0.3, -s, s * 0.55); g.closePath();
      g.stroke();
      g.beginPath(); g.arc(s * 0.05, s * 0.1, s * 0.28, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(s * 0.26, s * 0.32); g.lineTo(s * 0.55, s * 0.6); g.stroke();
      break;
    case 'Edit': // pen nib
      g.moveTo(-s * 0.7, s * 0.7); g.lineTo(-s * 0.25, -s * 0.2); g.lineTo(s * 0.15, -s * 0.75);
      g.lineTo(s * 0.72, -s * 0.15); g.lineTo(s * 0.2, s * 0.25); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.3, s * 0.35); g.lineTo(s * 0.05, -s * 0.05); g.stroke();
      break;
    case 'Write': // inkwell / nib on a stroke
      g.moveTo(-s * 0.7, s * 0.6); g.lineTo(s * 0.7, s * 0.6); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.5, -s * 0.7); g.lineTo(s * 0.2, s * 0.2); g.lineTo(-s * 0.1, s * 0.45); g.closePath();
      g.stroke();
      g.beginPath(); g.arc(-s * 0.55, -s * 0.72, s * 0.14, 0, Math.PI * 2); g.fill();
      break;
    case 'Bash': // terminal chevron + cursor
      g.moveTo(-s * 0.7, -s * 0.5); g.lineTo(-s * 0.15, 0); g.lineTo(-s * 0.7, s * 0.5); g.stroke();
      g.beginPath(); g.moveTo(s * 0.05, s * 0.5); g.lineTo(s * 0.7, s * 0.5); g.stroke();
      break;
    case 'Search': // magnifier
      g.arc(-s * 0.15, -s * 0.15, s * 0.48, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(s * 0.24, s * 0.24); g.lineTo(s * 0.72, s * 0.72); g.stroke();
      break;
    default:
      g.arc(0, 0, s * 0.5, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

export function toolTint(type: string) {
  return TOOL_TINTS[type] ?? TOOL_TINTS.Read;
}

/* --------------------------------------------------------------------- pixi util */

export function anchorSprite(s: Sprite, ax = 0.5, ay = 0.5): Sprite {
  s.anchor.set(ax, ay);
  return s;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function pad(n: number, len = 3): string {
  return String(Math.max(0, Math.round(n))).padStart(len, '0');
}

export function fixed(n: number, d = 1): string {
  return n.toFixed(d);
}

/** Deterministic sub-pixel wobble used for hand-drawn (but stable) edges. */
export function wobble(seed: number): number {
  return Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 4.1414) * 0.3;
}

export function tintOf(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export { T };
