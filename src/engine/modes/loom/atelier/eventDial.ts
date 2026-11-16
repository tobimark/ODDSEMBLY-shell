/**
 * Event-scale instrument — the large cropped drum dial that sits behind the
 * loom's left side, reconstructed from the reference machine's geometry:
 *
 *   huge ring cropped by the sheet corner
 *   → radial scale band with engraved ticks + screws
 *   → knurled grip ring + fine-ruled outer annulus with index wedges
 *   → blue reference arc bounding the inner drum (with oval inspection slots)
 *   → a tilted read-head window carrying the tool event (READ ×21 S01/12)
 *   → a radial needle ending in a clamped carriage that feeds a flexible
 *     conduit down into a control box (coil module, gauge, keys, punch row)
 *   → control box cable runs to the loom's queue coupler.
 *
 * Everything is procedurally drawn. Layout constants are in design space
 * (1472×1008); the dial centre deliberately sits off-sheet at the upper left.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { C, bolt, circle, label, line, metal, plate, poly, rect, surface } from './drawing';

export const DIAL = {
  cx: -610,
  cy: -390,
  blue: 980,
  faceOut: 1140,
  sepOut: 1152,
  tickOut: 1182,
  knurlOut: 1212,
  outerOut: 1296,
  lipOut: 1312,
  /** read-head radius (window centre) */
  headR: 1060,
  /** current read-head angle, degrees in screen space */
  angle: 40,
  /** control box (front layer) */
  box: { x: 88, y: 585, w: 245, h: 205 },
  queue: { x: 482, y: 838, w: 118, h: 52 },
} as const;

const P = (r: number, deg: number, cx = DIAL.cx, cy = DIAL.cy): [number, number] => [
  cx + Math.cos((deg * Math.PI) / 180) * r,
  cy + Math.sin((deg * Math.PI) / 180) * r,
];

/** The baked drum body: ring bands, ticks, knurling, inner drum details. */
function dialBody(): Sprite {
  const { cx, cy } = DIAL;
  return surface(1472, 1008, g => {
    // contact shadow onto the sheet
    g.save(); g.shadowColor = '#2A241628'; g.shadowBlur = 30; g.shadowOffsetY = 12;
    g.beginPath(); g.arc(cx, cy, DIAL.lipOut, 0, Math.PI * 2); g.fillStyle = '#F0EBE0'; g.fill();
    g.restore();

    // radial band stack (outer → inner)
    circle(g, cx, cy, DIAL.lipOut, '#F3EEE4', '#C9C2B2', 1);
    circle(g, cx, cy, DIAL.outerOut, '#FAF7EF', '#C9C2B2', 0.7);
    circle(g, cx, cy, DIAL.knurlOut, '#F0EBE0', '#BDB5A4', 0.8);
    circle(g, cx, cy, DIAL.tickOut, '#F8F4EA', '#C9C2B2', 0.7);
    circle(g, cx, cy, DIAL.sepOut, '#E8E2D5', '#B9B2A2', 0.7);
    circle(g, cx, cy, DIAL.faceOut, '#FCFAF3', '#C9C2B2', 0.9);
    circle(g, cx, cy, DIAL.blue - 1, '#F7F2E6', '#DDD5C3', 0.7);

    // curvature shading across the drum, clipped to the ring
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.lipOut, 0, Math.PI * 2); g.clip();
    const shade = g.createRadialGradient(cx, cy, DIAL.blue - 60, cx, cy, DIAL.lipOut + 8);
    shade.addColorStop(0, 'rgba(23,28,96,0)');
    shade.addColorStop(0.3, 'rgba(23,28,96,0.012)');
    shade.addColorStop(0.72, 'rgba(23,28,96,0.045)');
    shade.addColorStop(1, 'rgba(23,28,96,0.075)');
    g.fillStyle = shade; g.fillRect(0, 0, 1472, 1008);
    g.restore();
    // soft recessed shadow inside the blue arc
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.blue + 8, 0, Math.PI * 2);
    g.shadowColor = 'rgba(30,34,48,0.20)'; g.shadowBlur = 16; g.shadowOffsetX = 6; g.shadowOffsetY = 8;
    g.strokeStyle = 'rgba(247,242,230,0.9)'; g.lineWidth = 7; g.stroke();
    g.restore();
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.blue + 7, 0, Math.PI * 2);
    g.strokeStyle = '#D8D1C0'; g.lineWidth = 1.4; g.stroke(); g.restore();

    // ---- outer fine-ruled band: dense hairlines, index wedges, screws
    for (let d = 12; d <= 70; d += 0.16) {
      const a = P(DIAL.knurlOut + 2, d); const b = P(DIAL.outerOut - 3, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F887866', 0.6);
    }
    for (let d = 15; d <= 65; d += 9) {
      const a = P(DIAL.knurlOut + 12, d); const b = P(DIAL.outerOut - 12, d);
      line(g, [a[0], a[1], b[0], b[1]], '#262A31', 3.2);
    }
    for (let d = 14; d <= 67; d += 4) {
      const [x, y] = P(DIAL.outerOut - 12, d);
      bolt(g, x, y, 2.5);
    }
    for (const r of [DIAL.knurlOut + 30, DIAL.knurlOut + 56, DIAL.outerOut - 26]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#8F88784D'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }

    // ---- knurled grip band: dense diagonal ridges
    for (let d = 12; d <= 70; d += 0.22) {
      const a = P(DIAL.tickOut + 2, d - 0.45); const b = P(DIAL.knurlOut - 2, d + 0.45);
      const strong = Math.round(d * 10) % 4 === 0;
      line(g, [a[0], a[1], b[0], b[1]], strong ? '#9E9684' : '#CFC7B5', strong ? 1.5 : 1);
      const a2 = P(DIAL.tickOut + 2, d + 0.1); const b2 = P(DIAL.knurlOut - 2, d + 0.1);
      line(g, [a2[0], a2[1], b2[0], b2[1]], '#FFFFFF88', 0.7);
    }
    for (const r of [DIAL.tickOut, DIAL.knurlOut - 1]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, (12 * Math.PI) / 180, (70 * Math.PI) / 180); g.strokeStyle = '#B4AC9A'; g.lineWidth = 0.9; g.stroke(); g.restore();
    }

    // ---- engraved tick scale band (the working scale)
    for (let d = 12; d <= 70; d += 0.34) {
      const major = Math.abs(d % 4) < 0.17;
      const mid = Math.abs(d % 1) < 0.17;
      const a = P(DIAL.sepOut + 2, d); const b = P(DIAL.tickOut - (major ? 4 : mid ? 8 : 12), d);
      line(g, [a[0], a[1], b[0], b[1]], major ? '#23272E' : mid ? '#4E5157' : '#A79E88', major ? 2 : mid ? 1 : 0.55);
    }
    for (let d = 14; d <= 66; d += 3) {
      const [x, y] = P(DIAL.tickOut - 9, d);
      circle(g, x, y, 2.2, '#EFE9DB', '#A79E88', 0.7);
    }

    // ---- smooth track ring between the plain face and the scale
    g.save(); g.beginPath(); g.arc(cx, cy, DIAL.faceOut + 4, 0, Math.PI * 2);
    g.strokeStyle = '#FFFFFFAA'; g.lineWidth = 1.2; g.stroke(); g.restore();

    // ---- plain white face band with sparse long index marks and screws
    for (const d of [18, 28, 38, 48, 58]) {
      const a = P(DIAL.blue + 26, d); const b = P(DIAL.faceOut - 26, d);
      line(g, [a[0], a[1], b[0], b[1]], '#23272E', 1.6);
    }
    for (let d = 13; d <= 67; d += 4) {
      const [x, y] = P(DIAL.faceOut - 16, d);
      circle(g, x, y, 2.4, '#EFE9DB', '#A79E88', 0.7);
      line(g, [x - 1.6, y + 0.6, x + 1.6, y - 0.6], '#8F8878', 0.6);
    }
    for (const r of [DIAL.blue + 52, DIAL.blue + 108]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#D8D1C055'; g.lineWidth = 0.7; g.stroke(); g.restore();
    }

    // ---- blue reference arc
    g.save();
    g.beginPath(); g.arc(cx, cy, DIAL.blue, 0, Math.PI * 2);
    g.strokeStyle = '#3F6FC2'; g.lineWidth = 4.4; g.stroke();
    g.beginPath(); g.arc(cx, cy, DIAL.blue - 2.6, 0, Math.PI * 2);
    g.strokeStyle = '#8FB0E0AA'; g.lineWidth = 1.1; g.stroke();
    g.restore();

    // ---- inner drum: panel seams, concentric guides, inspection slots
    for (const r of [300, 520, 760, 930]) {
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#8F88781F'; g.lineWidth = 0.8; g.stroke(); g.restore();
    }
    for (let d = 15; d <= 70; d += 3.5) {
      const a = P(140, d); const b = P(DIAL.blue - 16, d);
      line(g, [a[0], a[1], b[0], b[1]], '#8F887812', 0.7);
    }
    for (const [deg, r, w, h] of [[27, 872, 150, 46], [41, 906, 132, 40]] as const) {
      const [x, y] = P(r, deg);
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
    // ---- fixed clamps on the plain face band (the read-head carriage is separate)
    for (const [deg, r] of [[16, DIAL.faceOut - 36], [23, DIAL.faceOut - 26], [30, DIAL.faceOut - 20], [48, DIAL.faceOut - 18], [57, DIAL.faceOut - 28]] as const) {
      const [x, y] = P(r, deg);
      g.save(); g.translate(x, y); g.rotate(((deg + 90) * Math.PI) / 180);
      rect(g, -26, -19, 52, 38, '#F6F1E5', 4, '#B4AC9A');
      rect(g, -20, -13, 40, 26, '#FCFAF3', 3, '#C9C2B2');
      bolt(g, -15, -8, 2.2); bolt(g, 15, -8, 2.2); bolt(g, -15, 8, 2.2); bolt(g, 15, 8, 2.2);
      g.restore();
    }
  });
}

/** Read-head window panel (tilted rectangle), drawn empty; text is live. */
function windowPanel(): Sprite {
  const w = 560; const h = 116;
  return surface(w, h, g => {
    g.save();
    g.shadowColor = '#2A241620'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 13);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#F4F1EA'); grad.addColorStop(0.55, '#E9E6DD'); grad.addColorStop(1, '#DCD8CE');
    g.fillStyle = grad; g.fill();
    g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 13);
    g.strokeStyle = '#1F242D'; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 9);
    g.strokeStyle = '#8F8B80'; g.lineWidth = 0.9; g.stroke();
    g.beginPath(); g.roundRect(11, 11, w - 22, h - 22, 8);
    g.strokeStyle = '#FFFFFF99'; g.lineWidth = 0.8; g.stroke();
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]] as const) bolt(g, x, y, 2.6);
    // corner brackets and a centre index mark
    for (const [x, y, sx, sy] of [[10, 10, 1, 1], [w - 10, 10, -1, 1], [10, h - 10, 1, -1], [w - 10, h - 10, -1, -1]] as const) {
      g.beginPath(); g.moveTo(x, y + sy * 16); g.lineTo(x, y); g.lineTo(x + sx * 16, y);
      g.strokeStyle = '#2C3038'; g.lineWidth = 1.4; g.stroke();
    }
    g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, 15); g.strokeStyle = '#2C3038'; g.lineWidth = 1.2; g.stroke();
  });
}

/** Moving carriage parts baked once: clamp, link bar, joint block. */
function carriage(): Sprite {
  return surface(340, 120, g => {
    // clamp on the scale band
    g.save(); g.translate(34, 60);
    rect(g, -28, -22, 56, 44, '#F7F3E8', 5, '#B0A896');
    rect(g, -22, -16, 44, 32, '#FDFBF4', 3, '#C9C2B2');
    circle(g, 0, 0, 5, '#DCD6C6', '#8F8878', 0.9);
    bolt(g, -16, -10, 2.3); bolt(g, 16, -10, 2.3); bolt(g, -16, 10, 2.3); bolt(g, 16, 10, 2.3);
    g.restore();
    // link bar
    g.save(); g.translate(34, 60);
    line(g, [28, -2, 262, -3], '#4F5A66', 10);
    line(g, [28, -5, 262, -6], '#D8DDD5', 4);
    line(g, [28, 3, 262, 2], '#2A323C22', 4);
    for (const x of [32, 96, 160, 258]) {
      circle(g, x, 0, 7, '#CDD3CD', '#6C7884', 0.9);
      circle(g, x, 0, 2.4, '#59636E');
    }
    g.restore();
    // joint block
    g.save(); g.translate(300, 60);
    rect(g, -30, -24, 60, 48, '#F5F1E6', 6, '#AEA694');
    rect(g, -23, -17, 46, 34, '#FCFAF3', 4, '#C9C2B2');
    circle(g, 0, 0, 11, '#DFD9CA', '#8F8878', 1);
    circle(g, 0, 0, 4, '#59636E');
    bolt(g, -18, -12, 2.2); bolt(g, 18, -12, 2.2); bolt(g, -18, 12, 2.2); bolt(g, 18, 12, 2.2);
    g.restore();
  });
}

/** Control box: coil module, gauge, knobs, key row, punch-card connectors. */
function controlBox(): Sprite {
  const { w, h } = DIAL.box;
  return surface(w, h, g => {
    g.save(); g.shadowColor = '#2A241620'; g.shadowBlur = 12; g.shadowOffsetY = 5;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fillStyle = '#FBF7EE'; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12);
    g.strokeStyle = '#B4AC9A'; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.roundRect(7, 7, w - 14, h - 14, 9);
    g.strokeStyle = '#E2DCCD'; g.lineWidth = 0.8; g.stroke();
    for (const [x, y] of [[13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13]] as const) bolt(g, x, y, 2.8);

    // coil / transformer module
    rect(g, 14, 18, 104, 66, '#EFE9DC', 4, '#BDB5A4');
    rect(g, 18, 22, 96, 10, '#FDFBF4', 2, '#D4CDBD');
    line(g, [22, 27, 104, 27], '#C9C2B2', 0.7);
    for (const x0 of [24, 66]) {
      rect(g, x0, 42, 24, 28, '#F7F3E9', 2, '#A79F8B');
      for (let i = 0; i < 6; i++) line(g, [x0 + 2, 46 + i * 4, x0 + 22, 46 + i * 4], '#8F8878', 0.8);
      rect(g, x0, 42, 24, 6, '#DCD5C4', 2, '#A79F8B');
      rect(g, x0, 64, 24, 6, '#DCD5C4', 2, '#A79F8B');
    }
    metal(g, 56, 42, 8, 28, true);
    line(g, [18, 76, 114, 76], '#BDB5A4', 0.8); line(g, [18, 72, 114, 72], '#C9C2B2', 0.6);

    // gauge
    const gx = 182; const gy = 52; const gr = 28;
    circle(g, gx, gy, gr + 4, '#E7E1D4', '#B4AC9A', 0.9);
    circle(g, gx, gy, gr, '#FDFBF4', '#A79F8B', 1);
    for (let i = 0; i <= 10; i++) {
      const a = (-220 + i * 26) * Math.PI / 180;
      line(g, [gx + Math.cos(a) * (gr - 8), gy + Math.sin(a) * (gr - 8), gx + Math.cos(a) * (gr - 3), gy + Math.sin(a) * (gr - 3)], '#5C6168', 0.8);
    }
    circle(g, gx, gy, 2.2, '#30343C');

    // knobs
    for (const x0 of [158, 182, 206]) {
      circle(g, x0, 92, 5.6, '#EFE9DC', '#A79F8B', 0.8);
      line(g, [x0 - 3, 91, x0 + 3, 93], '#6F6A5B', 0.8);
    }

    // key grille
    rect(g, 132, 104, 100, 40, '#F1EBDF', 5, '#B4AC9A');
    for (let i = 0; i < 9; i++) {
      rect(g, 138 + i * 10.4, 109, 6.4, 30, '#FBF7EE', 2, '#C9C2B2');
    }

    // inscription slot
    rect(g, 14, 92, 104, 28, '#F6F1E5', 4, '#BDB5A4');
    rect(g, 20, 98, 62, 7, '#FDFBF4', 2, '#D4CDBD');
    line(g, [22, 101, 76, 101], '#C9C2B2', 0.6);
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
      rect(g, 19 + i * 10.6, 132, 8, 20, i % 2 ? '#E2DCCD' : '#FBF7EE', 1.5, '#C9C2B2');
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
    g.save(); g.shadowColor = '#2A241618'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 7); g.fillStyle = '#FBF7EE'; g.fill(); g.restore();
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 7);
    g.strokeStyle = '#A79F8B'; g.lineWidth = 1; g.stroke();
    label(g, '队列', 12, 33, 12, '#5C6168');
    line(g, [46, 14, 46, h - 12], '#C9C2B2', 0.7);
    // spool coupler on top of the plate
    rect(g, 70, 6, 34, 14, '#CFC8B6', 3, '#8F8878');
    rect(g, 76, 4, 22, 5, '#E7E1D4', 2, '#B4AC9A');
    bolt(g, 100, 34, 2.2);
  });
}

/**
 * Static + animatable event-scale subsystem.
 * `body` renders behind the loom; `front` renders after it (control box, cable).
 */
export class EventDial {
  readonly body = new Container();
  readonly front = new Container();
  private readonly head = new Container();
  private readonly window = windowPanel();
  private readonly carriageSprite = carriage();
  private readonly needle = new Graphics();
  private readonly conduit = new Graphics();
  private readonly cables = new Graphics();
  private readonly readText = new Text({
    text: 'READ',
    style: { fontFamily: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif', fontSize: 22, fontWeight: '700', fill: '#1E2330', letterSpacing: 3.6 },
  });
  private readonly multText = new Text({
    text: '×21',
    style: { fontFamily: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif', fontSize: 20, fontWeight: '700', fill: '#1E2330', letterSpacing: 1.2 },
  });
  private readonly sessionText = new Text({
    text: 'S01/12',
    style: { fontFamily: 'Consolas, "SFMono-Regular", monospace', fontSize: 9, fill: '#67624F', letterSpacing: 1.3 },
  });
  private readonly queueCount = new Text({
    text: '0',
    style: { fontFamily: '"Arial Narrow", "Segoe UI", sans-serif', fontSize: 15, fill: '#23283A', letterSpacing: 1 },
  });
  private readonly badge = new Graphics();
  private readonly gaugeNeedle = new Graphics();
  private angle: number = DIAL.angle;

  constructor() {
    this.body.addChild(dialBody());
    this.body.addChild(this.head);
    this.window.anchor.set(0.5);
    this.window.rotation = Math.PI / 2;
    this.window.position.set(DIAL.headR, 0);
    this.head.addChild(this.window);
    this.needle.moveTo(DIAL.blue + 2, 0).lineTo(DIAL.tickOut - 10, 0).stroke({ color: 0x23283a, width: 1.7 });
    this.needle.circle(DIAL.blue + 2, 0, 2.2).fill(0x23283a);
    this.needle.poly([DIAL.tickOut - 26, -8, DIAL.tickOut - 8, 0, DIAL.tickOut - 26, 8]).fill(0x23283a);
    this.carriageSprite.anchor.set(0.5);
    this.carriageSprite.rotation = Math.PI / 2;
    this.carriageSprite.position.set(DIAL.headR + 170, 0);
    this.head.addChild(this.carriageSprite, this.needle);
    this.body.addChild(this.conduit, this.cables);
    for (const t of [this.readText, this.multText, this.sessionText]) this.body.addChild(t);
    this.body.addChild(this.badge);

    // front layer
    const box = controlBox();
    box.position.set(DIAL.box.x, DIAL.box.y);
    const queue = queueUnit();
    queue.position.set(DIAL.queue.x, DIAL.queue.y);
    this.front.addChild(box, queue, this.cables, this.gaugeNeedle, this.queueCount);
    this.queueCount.position.set(DIAL.queue.x + 72, DIAL.queue.y + 34);
    this.gaugeNeedle.position.set(DIAL.box.x + 182, DIAL.box.y + 52);
    this.gaugeNeedle.rotation = -1.0;
    this.setAngle(DIAL.angle);
  }

  /** Read-head angle in design-screen degrees (0 = +x). */
  setAngle(deg: number): void {
    this.angle = deg;
    const rad = (deg * Math.PI) / 180;
    this.head.position.set(DIAL.cx, DIAL.cy);
    this.head.rotation = rad;
    const cx = DIAL.cx + Math.cos(rad) * DIAL.headR;
    const cy = DIAL.cy + Math.sin(rad) * DIAL.headR;
    // text stays upright regardless of head rotation
    this.readText.position.set(cx - 80, cy + 8);
    this.multText.position.set(cx + 28, cy - 12);
    this.sessionText.position.set(cx + 30, cy + 6);
    this.badge.clear();
    this.badge.roundRect(cx - 86, cy - 86, 26, 26, 5).fill(0xfdfbf4).stroke({ color: 0x2c3038, width: 1.1 });
    for (let i = 0; i < 3; i++) this.badge.rect(cx - 80, cy - 78 + i * 6, 15, 1.6).fill(0x8f8878);
    this.badge.circle(cx - 67, cy - 86, 2.2).fill(0x33cbcc);
    this.drawConduit(rad);
    this.drawCables();
  }

  /** Tool-event readout, e.g. READ ×21 S01/12. */
  setRead(type: string, count: number): void {
    this.readText.text = type.toUpperCase();
    this.multText.text = `×${count}`;
    const x = this.sessionText.position.x;
    this.sessionText.text = `S01/${count}`;
    void x;
  }

  setSession(text: string): void { this.sessionText.text = text; }
  setQueue(n: number): void { this.queueCount.text = String(n); }

  private strand(g: Graphics, pts: number[], color: string, width: number): void {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ color, width });
  }

  private drawConduit(rad: number): void {
    // joint world position (carriage block at the outer edge of the ring)
    const jx = DIAL.cx + Math.cos(rad) * (DIAL.headR + 310);
    const jy = DIAL.cy + Math.sin(rad) * (DIAL.headR + 310);
    const g = this.conduit;
    g.clear();
    const path: Array<[number, number]> = [
      [jx, jy], [jx + 6, jy + 52], [jx - 12, jy + 92],
      [jx - 22, jy + 150], [DIAL.box.x + 126, DIAL.box.y - 14], [DIAL.box.x + 124, DIAL.box.y + 4],
    ];
    // flexible conduit: dark outline, five strands, highlight and collars
    this.strand(g, path.flat(), '#6F7A78', 9);
    for (let i = -2; i <= 2; i++) {
      const off = i * 2.1;
      const pts: number[] = [];
      path.forEach(([x, y], k) => pts.push(x + off * (k < 3 ? 1 : 0.4), y + off * (k < 3 ? 0 : 1)));
      this.strand(g, pts, i === 0 ? '#E2DDD0' : '#B9B2A2', i === 0 ? 2 : 1.6);
    }
    this.strand(g, path.flat(), '#FFFFFF', 0.8);
    for (const k of [1, 2, 3, 4, 5]) {
      const [x, y] = path[k];
      g.roundRect(x - 9, y - 3, 18, 6, 2).fill(0xd9d3c2).stroke({ color: 0x6f7a78, width: 0.8 });
      g.rect(x - 9, y - 5, 18, 1.2).fill({ color: 0xffffff, alpha: 0.67 });
    }
    // elbow fitting into the control box
    g.roundRect(DIAL.box.x + 108, DIAL.box.y - 10, 36, 14, 4).fill(0xefe9dc).stroke({ color: 0x8f8878, width: 1 });
    for (let i = 0; i < 3; i++) g.rect(DIAL.box.x + 112, DIAL.box.y - 7 + i * 3.4, 28, 1).fill(0xb4ac9a);
  }

  private drawCables(): void {
    const g = this.cables;
    g.clear();
    const bx = DIAL.box.x; const by = DIAL.box.y; const bw = DIAL.box.w; const bh = DIAL.box.h;
    // two signal lines from the box toward the loom base
    this.strand(g, [bx + bw - 4, by + 160, bx + bw + 40, by + 166, bx + bw + 60, by + 176], '#AEB6B4', 2.2);
    this.strand(g, [bx + bw - 4, by + 168, bx + bw + 40, by + 174, bx + bw + 60, by + 182], '#C9CFC9', 1.4);
    // cable from the box gland down, then right to the queue coupler
    const q = DIAL.queue;
    const path: Array<[number, number]> = [
      [bx + bw - 24, by + bh - 4], [bx + bw - 24, by + bh + 26], [bx + bw - 46, by + bh + 38],
      [q.x - 24, q.y + 18], [q.x + 12, q.y + 8],
    ];
    for (let i = 0; i < 2; i++) {
      const pts: number[] = [];
      path.forEach(([x, y]) => pts.push(x + i * 1.6, y));
      this.strand(g, pts, i ? '#C9CFC9' : '#AEB6B4', i ? 1.2 : 2);
    }
    g.circle(bx + bw - 24, by + bh - 4, 3.4).fill(0xd9d3c2).stroke({ color: 0x8f8878, width: 0.7 });
    // gauge needle
    const gn = this.gaugeNeedle;
    gn.clear();
    gn.moveTo(0, 0).lineTo(Math.cos(-1.05) * 19, Math.sin(-1.05) * 19).stroke({ color: 0x23283a, width: 1.8 });
    gn.circle(0, 0, 2.6).fill(0x30343c);
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}

// Explicitly referenced palette helpers keep the drawing kit tree-shakeable.
void plate; void metal; void poly; void rect; void C;
