import { Container, Graphics, Text, TilingSprite, Texture } from 'pixi.js';
import { SHEET } from '../layout';
import { T, FONT } from '../theme';
import { dashedLine } from './geometry';

function arc(g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number): void {
  g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
  g.arc(cx, cy, r, a0, a1);
}

/** Drafting-sheet backdrop: border, zone ticks, dot grid, arc scale, title block. */
export class Backdrop extends Container {
  private arcMarker = new Graphics();
  private dots!: TilingSprite;
  private arcCx = 336;
  private arcCy = 574;
  private arcR = 386;

  constructor() {
    super();
    this.buildBorder();
    this.buildGrid();
    this.buildArc();
    this.addChild(this.arcMarker);
  }

  private buildBorder(): void {
    const g = new Graphics();
    const s = SHEET;
    g.rect(s.x, s.y, s.w, s.h).stroke({ width: 0.9, color: T.navy, alpha: 0.42 });
    g.rect(s.x + 7, s.y + 7, s.w - 14, s.h - 14).stroke({ width: 0.5, color: T.navy, alpha: 0.18 });

    // zone ticks along the four borders
    for (let x = s.x + 40; x < s.x + s.w - 20; x += 40) {
      const major = ((x - s.x) / 40) % 5 === 0;
      g.moveTo(x, s.y).lineTo(x, s.y + (major ? 9 : 4)).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });
      g.moveTo(x, s.y + s.h).lineTo(x, s.y + s.h - (major ? 9 : 4)).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });
    }
    for (let y = s.y + 40; y < s.y + s.h - 20; y += 40) {
      const major = ((y - s.y) / 40) % 5 === 0;
      g.moveTo(s.x, y).lineTo(s.x + (major ? 9 : 4), y).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });
      g.moveTo(s.x + s.w, y).lineTo(s.x + s.w - (major ? 9 : 4), y).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });
    }

    // registration crosses
    for (const [x, y] of [[s.x + 22, s.y + 22], [s.x + s.w - 22, s.y + 22], [s.x + 22, s.y + s.h - 22], [s.x + s.w - 22, s.y + s.h - 22]]) {
      g.moveTo(x - 6, y).lineTo(x + 6, y).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
      g.moveTo(x, y - 6).lineTo(x, y + 6).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    }

    // faint hatch strip on the right edge of the sheet
    g.rect(SHEET.x + SHEET.w - 26, SHEET.y + 26, 12, SHEET.h - 52).stroke({ width: 0.4, color: T.navy, alpha: 0.14 });
    this.addChild(g);
  }

  private buildGrid(): void {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(23,28,96,0.16)';
    x.beginPath(); x.arc(8, 8, 0.75, 0, Math.PI * 2); x.fill();
    const tex = Texture.from(c);
    this.dots = new TilingSprite({ texture: tex, width: SHEET.w - 20, height: SHEET.h - 20 });
    this.dots.x = SHEET.x + 10; this.dots.y = SHEET.y + 10;
    this.dots.alpha = 0.33;
    this.addChild(this.dots);
  }

  private buildArc(): void {
    const g = new Graphics();
    const cx = this.arcCx, cy = this.arcCy, R = this.arcR;
    // main arc from -118deg to 118deg (sweep opens toward the loom)
    const a0 = (-118 * Math.PI) / 180;
    const a1 = (118 * Math.PI) / 180;
    arc(g, cx, cy, R, a0, a1);
    g.stroke({ width: 1.0, color: T.navy, alpha: 0.45 });
    arc(g, cx, cy, R - 26, a0, a1);
    g.stroke({ width: 0.55, color: T.navy, alpha: 0.26 });
    arc(g, cx, cy, R + 24, a0, a1);
    g.stroke({ width: 0.4, color: T.navy, alpha: 0.16 });

    // ticks: every 2deg minor, every 10deg major + labels
    for (let deg = -118; deg <= 118; deg += 2) {
      const a = (deg * Math.PI) / 180;
      const major = deg % 10 === 0;
      const r0 = R - (major ? 13 : 6);
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke({ width: major ? 0.8 : 0.45, color: T.navy, alpha: major ? 0.55 : 0.3 });
      if (major) {
        const tr = R + 16;
        const label = String(deg).padStart(3, '0');
        const t = new Text({ text: label, style: { fontFamily: FONT.mono, fontSize: 8.5, fill: T.navy, letterSpacing: 0.4 } });
        t.anchor.set(0.5);
        t.position.set(cx + Math.cos(a) * tr, cy + Math.sin(a) * tr);
        t.alpha = 0.5;
        this.addChild(t);
      }
    }
    // radial guides
    for (let deg = -110; deg <= 110; deg += 20) {
      const a = (deg * Math.PI) / 180;
      dashedLine(g, cx + Math.cos(a) * 60, cy + Math.sin(a) * 60, cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30), 5, 6, 0.45, 0.14);
    }
    // --- outer instrument scale (large sweeping ring, like a drafting dial) ---
    const ocx = 250, ocy = 620;
    const R1 = 432, R2 = 474;
    const s0 = (-118 * Math.PI) / 180, s1 = (-16 * Math.PI) / 180;
    arc(g, ocx, ocy, R1, s0, s1);
    g.stroke({ width: 1.1, color: T.navy, alpha: 0.5 });
    arc(g, ocx, ocy, R2, s0, s1);
    g.stroke({ width: 0.5, color: T.navy, alpha: 0.22 });
    arc(g, ocx, ocy, R1 - 8, s0, s1);
    g.stroke({ width: 0.45, color: T.navy, alpha: 0.2 });
    // wide pale band between the rings
    arc(g, ocx, ocy, (R1 + R2) / 2, s0, s1);
    g.stroke({ width: R2 - R1 - 4, color: 0xf1e9dd, alpha: 0.32 });
    // fine ticks
    for (let deg = -118; deg <= -16; deg += 1.5) {
      const a = (deg * Math.PI) / 180;
      const major = Math.abs(deg % 10) < 0.01;
      const big = Math.abs(deg % 20) < 0.01;
      const r0 = R2 - (big ? 26 : major ? 16 : 8);
      g.moveTo(ocx + Math.cos(a) * r0, ocy + Math.sin(a) * r0);
      g.lineTo(ocx + Math.cos(a) * R2, ocy + Math.sin(a) * R2);
      g.stroke({ width: big ? 0.9 : 0.45, color: T.navy, alpha: big ? 0.5 : 0.3 });
      if (big) {
        const t = new Text({ text: String((deg + 118) * 2).padStart(3, '0'), style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 0.5 } });
        t.anchor.set(0.5);
        t.position.set(ocx + Math.cos(a) * (R2 + 14), ocy + Math.sin(a) * (R2 + 14));
        t.alpha = 0.5;
        this.addChild(t);
      }
    }
    // ribbed instrument plate between the rings
    arc(g, ocx, ocy, (R1 + R2) / 2, s0, s1);
    g.stroke({ width: R2 - R1 - 10, color: 0xe6ddcd, alpha: 0.5 });
    for (let deg = -116; deg <= -18; deg += 4) {
      const a = (deg * Math.PI) / 180;
      g.moveTo(ocx + Math.cos(a) * (R1 + 6), ocy + Math.sin(a) * (R1 + 6));
      g.lineTo(ocx + Math.cos(a) * (R2 - 6), ocy + Math.sin(a) * (R2 - 6));
      g.stroke({ width: 0.4, color: T.navy, alpha: 0.12 });
    }
    // teal working arc
    arc(g, ocx, ocy, R1 - 14, (-108 * Math.PI) / 180, (-64 * Math.PI) / 180);
    g.stroke({ width: 3.6, color: T.teal, alpha: 0.45 });
    arc(g, ocx, ocy, R1 - 2, s0, s1);
    g.stroke({ width: 0.6, color: T.tealDeep, alpha: 0.18 });

    // center hub
    g.circle(cx, cy, 5).stroke({ width: 0.6, color: T.navy, alpha: 0.35 });
    g.circle(cx, cy, 1.6).fill({ color: T.navy, alpha: 0.45 });
    this.addChild(g);

    // labels
    const cap = new Text({ text: 'TENSION  /  DRIVE  ANGLE', style: { fontFamily: FONT.mono, fontSize: 8, fill: T.navy, letterSpacing: 1.6 } });
    cap.position.set(cx - 210, cy + R + 44);
    cap.alpha = 0.5;
    this.addChild(cap);
  }

  /** animate the teal sweep marker along the arc (drive angle feedback) */
  setDriveAngle(norm: number): void {
    this.arcMarker.clear();
    const a = ((-118 + ((norm % 1) + 1) % 1 * 236) * Math.PI) / 180;
    const R = this.arcR;
    const x = this.arcCx + Math.cos(a) * R;
    const y = this.arcCy + Math.sin(a) * R;
    this.arcMarker.circle(x, y, 2.2).fill({ color: T.teal, alpha: 0.85 });
    this.arcMarker.circle(x, y, 5.5).stroke({ width: 0.7, color: T.teal, alpha: 0.4 });
  }
}
