import { Container, Graphics, Text } from 'pixi.js';
import { FABRIC, LOOM } from '../layout';
import { FONT, T } from '../theme';
import { bolt, gear, hatch, rivetRow } from './geometry';

/** Loom frame: posts, beams, rollers, gussets, adjustment wheels, base plinth. */
export class Frame extends Container {
  readonly clothBeam = new Graphics();
  private shadow = new Graphics();
  private structure = new Graphics();

  constructor() {
    super();
    this.buildShadow();
    this.buildStructure();
    this.buildRollers();
    this.buildPlaque();
  }

  private buildShadow(): void {
    const g = this.shadow;
    const o = 3;
    g.rect(LOOM.leftPost + o, LOOM.topBeam + o, 26, LOOM.bottomBeam - LOOM.topBeam).fill({ color: T.navy, alpha: 0.07 });
    g.rect(LOOM.rightPost + o, LOOM.topBeam + o, 26, LOOM.bottomBeam - LOOM.topBeam).fill({ color: T.navy, alpha: 0.07 });
    g.rect(LOOM.leftPost - 20 + o, LOOM.topBeam + o, LOOM.rightPost - LOOM.leftPost + 60, 30).fill({ color: T.navy, alpha: 0.07 });
    // large soft shadow under the whole frame
    g.rect(LOOM.leftPost - 34 + 6, LOOM.topBeam + 10, LOOM.rightPost - LOOM.leftPost + 68, LOOM.bottomBeam - LOOM.topBeam + 20).fill({ color: T.navy, alpha: 0.035 });
    this.addChild(g);
  }

  private buildStructure(): void {
    const g = this.structure;
    const L = LOOM.leftPost, R = LOOM.rightPost, top = LOOM.topBeam, bot = LOOM.bottomBeam;

    // vertical posts (double wall + inner rail)
    for (const x of [L, R]) {
      g.rect(x - 13, top, 26, bot - top).fill({ color: 0xefe7dc, alpha: 0.68 });
      g.rect(x - 13, top, 26, bot - top).stroke({ width: 0.9, color: T.navy, alpha: 0.42 });
      g.rect(x - 8, top + 8, 16, bot - top - 16).stroke({ width: 0.45, color: T.navy, alpha: 0.18 });
      g.moveTo(x, top + 8).lineTo(x, bot - 8).stroke({ width: 0.35, color: T.navy, alpha: 0.14 });
      rivetRow(g, x - 9, x + 9, top + 26, 9.5, 1.5);
      rivetRow(g, x - 9, x + 9, bot - 26, 9.5, 1.5);
      // post feet
      g.rect(x - 22, bot - 6, 44, 18).fill({ color: 0xefe8dd, alpha: 0.9 }).stroke({ width: 0.8, color: T.navy, alpha: 0.5 });
      bolt(g, x - 14, bot + 3, 2.4, 0.5); bolt(g, x + 14, bot + 3, 2.4, 0.5);
    }

    // top beam + caps
    g.rect(L - 26, top - 12, R - L + 52, 22).fill({ color: 0xeee6da, alpha: 0.8 }).stroke({ width: 0.9, color: T.navy, alpha: 0.42 });
    g.rect(L - 20, top - 8, R - L + 40, 14).stroke({ width: 0.45, color: T.navy, alpha: 0.2 });
    rivetRow(g, L - 10, R + 10, top - 1, 24, 1.5);
    // end brackets
    for (const x of [L - 26, R + 26]) {
      g.moveTo(x - 10, top - 12).lineTo(x - 10, top + 10).lineTo(x + 10, top - 12).closePath().stroke({ width: 0.7, color: T.navy, alpha: 0.35 });
    }

    // bottom beam
    g.rect(L - 26, bot - 10, R - L + 52, 26).fill({ color: 0xeee6da, alpha: 0.8 }).stroke({ width: 0.9, color: T.navy, alpha: 0.42 });
    g.rect(L - 20, bot - 3, R - L + 40, 14).stroke({ width: 0.45, color: T.navy, alpha: 0.2 });
    rivetRow(g, L - 6, R + 6, bot + 8, 26, 1.5);

    // bottom beam tick scale
    for (let x = FABRIC.x; x <= FABRIC.x + FABRIC.w; x += 6) {
      const major = (x - FABRIC.x) % 30 === 0;
      g.moveTo(x, bot - 2).lineTo(x, bot - (major ? 12 : 6)).stroke({ width: major ? 0.6 : 0.35, color: T.navy, alpha: major ? 0.45 : 0.25 });
      if (major) {
        const t = new Text({ text: String((x - FABRIC.x) / 10).padStart(2, '0'), style: { fontFamily: FONT.mono, fontSize: 5.6, fill: T.navy } });
        t.anchor.set(0.5); t.position.set(x, bot - 18); t.alpha = 0.4; this.addChild(t);
      }
    }
    const q = new Text({ text: 'QUEUE 000', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.2 } });
    q.position.set(FABRIC.x + FABRIC.w + 16, bot + 4); q.alpha = 0.45; this.addChild(q);

    // base plinth
    g.rect(300, bot + 24, 880, 26).fill({ color: 0xf0e9df, alpha: 0.8 }).stroke({ width: 0.9, color: T.navy, alpha: 0.4 });
    g.rect(312, bot + 31, 856, 12).stroke({ width: 0.4, color: T.navy, alpha: 0.16 });
    hatch(g, 300, bot + 24, 880, 26, 9, 0.06);
    g.moveTo(320, bot + 56).lineTo(1160, bot + 56).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });

    // gussets
    for (const [x, sx] of [[L, 1], [R, -1]] as const) {
      g.moveTo(x + sx * 13, top + 24).lineTo(x + sx * 58, top + 24).lineTo(x + sx * 13, top + 62).closePath().stroke({ width: 0.7, color: T.navy, alpha: 0.35 });
      g.moveTo(x + sx * 13, bot - 60).lineTo(x + sx * 58, bot - 24).lineTo(x + sx * 13, bot - 24).closePath().stroke({ width: 0.7, color: T.navy, alpha: 0.35 });
      hatch(g, x + (sx > 0 ? 14 : -52), top + 26, 38, 34, 6, 0.08);
    }

    // corner plates at post/beam junctions
    for (const [x, y] of [[L, top], [R, top], [L, bot], [R, bot]] as const) {
      const sx = x === L ? 1 : -1;
      const sy = y === top ? 1 : -1;
      g.roundRect(x - sx * 4 - (sx > 0 ? 0 : 34), y - (sy > 0 ? 4 : 30), 38, 34, 3)
        .fill({ color: 0xf3ece2, alpha: 0.85 }).stroke({ width: 0.7, color: T.navy, alpha: 0.42 });
      bolt(g, x - sx * 4 - (sx > 0 ? 0 : 34) + 8, y - (sy > 0 ? 4 : 30) + 8, 2.2, 0.45);
      bolt(g, x - sx * 4 - (sx > 0 ? 0 : 34) + 30, y - (sy > 0 ? 4 : 30) + 8, 2.2, 0.45);
      bolt(g, x - sx * 4 - (sx > 0 ? 0 : 34) + 8, y - (sy > 0 ? 4 : 30) + 26, 2.2, 0.45);
      bolt(g, x - sx * 4 - (sx > 0 ? 0 : 34) + 30, y - (sy > 0 ? 4 : 30) + 26, 2.2, 0.45);
    }

    // diagonal cross bracing (rear plane, lighter)
    for (const [x1, y1, x2, y2] of [[L + 20, top + 40, R - 20, bot - 40], [R - 20, top + 40, L + 20, bot - 40]] as const) {
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 0.45, color: T.navy, alpha: 0.12 });
      g.circle(x1, y1, 2.2).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    }

    // oil cups at post tops
    for (const x of [L, R]) {
      g.circle(x, top - 26, 5).fill({ color: 0xf3ece2, alpha: 0.9 }).stroke({ width: 0.6, color: T.navy, alpha: 0.45 });
      g.circle(x, top - 26, 2).fill({ color: T.brass, alpha: 0.45 });
    }

    // rear depth rails (lighter)
    for (const y of [244, 300, 806]) {
      g.moveTo(L + 20, y).lineTo(R - 20, y).stroke({ width: 0.4, color: T.navy, alpha: 0.13 });
    }

    // adjustment wheels on posts
    for (const [x, y] of [[L - 30, 330], [R + 30, 330], [L - 30, 770], [R + 30, 770]] as const) {
      g.circle(x, y, 15).stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
      g.circle(x, y, 10).stroke({ width: 0.45, color: T.navy, alpha: 0.3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3).lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      }
      g.stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
      g.circle(x, y, 2).fill({ color: T.navy, alpha: 0.5 });
    }

    // tension cables from posts to heddle area
    for (const x of [L + 14, R - 14]) {
      g.moveTo(x, 300).lineTo(x + (x < 800 ? 30 : -30), 392).stroke({ width: 0.45, color: T.navy, alpha: 0.25 });
    }

    this.addChild(g);

    // warp beam roller (cylinder with ribs)
    const wb = new Graphics();
    const bx = FABRIC.x - 18, bw = FABRIC.w + 36;
    wb.roundRect(bx, 194, bw, 20, 8).fill({ color: 0xf3ece1, alpha: 0.9 }).stroke({ width: 0.9, color: T.navy, alpha: 0.5 });
    for (let x = bx + 8; x < bx + bw - 8; x += 9) {
      wb.moveTo(x, 196).lineTo(x, 212).stroke({ width: 0.4, color: T.navy, alpha: 0.16 });
    }
    for (const x of [bx, bx + bw]) {
      wb.circle(x, 204, 11).stroke({ width: 0.8, color: T.navy, alpha: 0.4 });
      wb.circle(x, 204, 4).fill({ color: T.navy, alpha: 0.35 });
    }
    this.addChild(wb);
  }

  private buildRollers(): void {
    const g = this.clothBeam;
    const bx = FABRIC.x - 16, bw = FABRIC.w + 32;
    g.roundRect(bx, 852, bw, 16, 7).fill({ color: 0xf3ece1, alpha: 0.9 }).stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
    for (let x = bx + 7; x < bx + bw - 7; x += 8) {
      g.moveTo(x, 854).lineTo(x, 866).stroke({ width: 0.35, color: T.navy, alpha: 0.14 });
    }
    this.addChild(g);
  }

  private buildPlaque(): void {
    const t = new Text({
      text: 'KUNLUN META · LOOM 01',
      style: { fontFamily: FONT.mono, fontSize: 7.2, fill: T.navy, letterSpacing: 1.5 },
    });
    t.anchor.set(0, 0.5);
    t.position.set(LOOM.leftPost + 26, LOOM.topBeam + 4);
    t.alpha = 0.55;
    this.addChild(t);
  }
}
