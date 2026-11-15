import { Container, Graphics, Text } from 'pixi.js';
import { FABRIC, LOOM } from '../layout';
import { FONT, T } from '../theme';
import { bolt } from './geometry';

/** Additional mechanical assemblies: back rest, lease rods, treadles, cloth roll,
 *  heddle staves, tension springs and drafting callouts. */
export class Extras extends Container {
  private clothRoll = new Graphics();

  constructor() {
    super();
    this.buildBackRest();
    this.buildLeaseRods();
    this.buildStaves();
    this.buildBobbinThreads();
    this.buildHeddleWires();
    this.buildWeights();
    this.buildCables();
    this.buildRailPanel();
    this.buildSprings();
    this.buildTreadles();
    this.buildClothRoll();
    this.buildCallouts();
    this.buildDetail();
    this.addChild(this.clothRoll);
  }

  private buildBackRest(): void {
    const g = new Graphics();
    const x0 = FABRIC.x - 14, w = FABRIC.w + 28, y = 240;
    g.roundRect(x0, y - 9, w, 18, 8).fill({ color: 0xf3ece1, alpha: 0.9 }).stroke({ width: 0.9, color: T.navy, alpha: 0.5 });
    for (let x = x0 + 12; x < x0 + w - 8; x += 11) {
      g.moveTo(x, y - 7).lineTo(x, y + 7).stroke({ width: 0.35, color: T.navy, alpha: 0.16 });
    }
    for (const x of [x0, x0 + w]) {
      g.circle(x, y, 9).stroke({ width: 0.75, color: T.navy, alpha: 0.45 });
      g.circle(x, y, 3).fill({ color: T.navy, alpha: 0.35 });
      bolt(g, x + 22, y, 2.2, 0.4);
    }
    this.addChild(g);
  }

  private buildLeaseRods(): void {
    const g = new Graphics();
    for (const [y, alpha] of [[268, 0.5], [286, 0.42]] as const) {
      g.moveTo(FABRIC.x - 26, y).lineTo(FABRIC.x + FABRIC.w + 26, y).stroke({ width: 0.9, color: T.navy, alpha });
      for (const x of [FABRIC.x - 26, FABRIC.x + FABRIC.w + 26]) {
        g.circle(x, y, 4).fill({ color: 0xf3ece1, alpha: 0.9 }).stroke({ width: 0.6, color: T.navy, alpha: 0.45 });
      }
      // small thread eyes along the rod
      for (let x = FABRIC.x + 6; x < FABRIC.x + FABRIC.w; x += 24) {
        g.circle(x, y, 1.5).stroke({ width: 0.4, color: T.navy, alpha: 0.3 });
      }
    }
    this.addChild(g);
  }

  private buildStaves(): void {
    const g = new Graphics();
    for (const side of [-1, 1]) {
      const x = side < 0 ? FABRIC.x - 46 : FABRIC.x + FABRIC.w + 46;
      g.roundRect(x - 7, LOOM.heddleA - 18, 14, LOOM.heddleB - LOOM.heddleA + 40, 3)
        .fill({ color: 0xf1e9dd, alpha: 0.9 }).stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
      for (let y = LOOM.heddleA - 8; y < LOOM.heddleB + 16; y += 12) {
        bolt(g, x, y, 1.6, 0.35);
      }
      // guide rod up to the top beam
      g.moveTo(x, LOOM.heddleA - 18).lineTo(x, LOOM.topBeam + 4).stroke({ width: 0.6, color: T.navy, alpha: 0.25 });
    }
    this.addChild(g);
  }

  private buildBobbinThreads(): void {
    const g = new Graphics();
    for (let i = 0; i < 12; i++) {
      const x = FABRIC.x + 8 + (i * (FABRIC.w - 16)) / 11;
      g.moveTo(x, 150).lineTo(x, 196).stroke({ width: 0.45, color: T.navy, alpha: 0.28 });
      g.moveTo(x, 150).lineTo(x - 2, 172).stroke({ width: 0.35, color: T.navy, alpha: 0.2 });
    }
    this.addChild(g);
  }

  private buildHeddleWires(): void {
    const g = new Graphics();
    for (const [barY, eyeY] of [[LOOM.heddleA, LOOM.heddleA], [LOOM.heddleB, LOOM.heddleB]] as const) {
      for (let i = 0; i < FABRIC.ends; i += 1) {
        const x = FABRIC.x + 1.6 + i * FABRIC.pitch;
        g.moveTo(x, barY + 8).lineTo(x, barY + 78).stroke({ width: 0.42, color: T.navy, alpha: 0.3 });
        g.ellipse(x, barY + 42, 1.4, 2.0).stroke({ width: 0.45, color: T.navy, alpha: 0.34 });
      }
    }
    this.addChild(g);
  }

  private buildRailPanel(): void {
    const x = 548, y = 212, w = 44, h = 642;
    const g = new Graphics();
    g.roundRect(x, y, w, h, 3).fill({ color: 0xf6f0e7, alpha: 0.95 }).stroke({ width: 0.7, color: T.navy, alpha: 0.42 });
    g.roundRect(x + 4, y + 4, w - 8, h - 8, 2).stroke({ width: 0.3, color: T.navy, alpha: 0.15 });
    for (let i = 0; i < 9; i++) {
      g.circle(x + w / 2, y + 26 + i * 22, 3).stroke({ width: 0.5, color: T.navy, alpha: 0.4 });
      g.circle(x + w / 2, y + 26 + i * 22, 1).fill({ color: T.navy, alpha: 0.35 });
    }
    // slider + lever
    g.roundRect(x + 15, y + 236, 14, 150, 6).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    g.roundRect(x + 17, y + 238, 10, 146, 5).fill({ color: 0xffffff, alpha: 0.5 });
    g.circle(x + 22, y + 300, 5).fill({ color: T.teal, alpha: 0.6 }).stroke({ width: 0.5, color: T.navy, alpha: 0.45 });
    g.circle(x + 22, y + 430, 7).stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
    g.moveTo(x + 22, y + 430).lineTo(x + 30, y + 408).stroke({ width: 1.2, color: T.navy, alpha: 0.55 });
    // labels
    for (const [i, label] of ['A', 'B', 'C', 'D'].entries()) {
      const t = new Text({ text: label, style: { fontFamily: FONT.mono, fontSize: 6, fill: T.navy, letterSpacing: 0.6 } });
      t.position.set(x + 10, y + 500 + i * 34); t.alpha = 0.4; this.addChild(t);
      g.moveTo(x + 16, y + 512 + i * 34).lineTo(x + 34, y + 512 + i * 34).stroke({ width: 0.35, color: T.navy, alpha: 0.16 });
    }
    this.addChild(g);
  }

  private buildCables(): void {
    const g = new Graphics();
    // ribbon cable from control console to the loom frame
    const pts = [[300, 812], [360, 812], [420, 820], [470, 806], [520, 812], [560, 820], [596, 812]];
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke({ width: 2.2, color: 0x8e9bb3, alpha: 0.35 });
    g.moveTo(300, 816);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1] + 4);
    g.stroke({ width: 1.0, color: 0x8e9bb3, alpha: 0.25 });
    for (const p of pts.slice(1, -1)) g.circle(p[0], p[1] + 2, 2).fill({ color: T.navy, alpha: 0.18 });
    for (const side of [-1, 1]) {
      const x = side < 0 ? FABRIC.x - 74 : FABRIC.x + FABRIC.w + 74;
      g.circle(x, 300, 6).stroke({ width: 0.7, color: T.navy, alpha: 0.4 });
      g.circle(x, 300, 1.8).fill({ color: T.navy, alpha: 0.4 });
      g.moveTo(x, 306).lineTo(x, 560).stroke({ width: 0.5, color: T.navy, alpha: 0.28 });
      g.roundRect(x - 10, 560, 20, 34, 2).fill({ color: 0xefe7db, alpha: 0.95 }).stroke({ width: 0.6, color: T.navy, alpha: 0.42 });
      g.moveTo(x - 7, 566).lineTo(x + 7, 566).stroke({ width: 0.4, color: T.navy, alpha: 0.25 });
      g.moveTo(x - 7, 570).lineTo(x + 7, 570).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
      g.moveTo(x, 560).lineTo(x, 520).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    }
    this.addChild(g);
  }

  private buildWeights(): void {
    const g = new Graphics();
    for (const side of [-1, 1]) {
      const x = side < 0 ? FABRIC.x - 88 : FABRIC.x + FABRIC.w + 88;
      g.moveTo(x, 300).lineTo(x, 520).stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
      g.roundRect(x - 7, 520, 14, 26, 2).fill({ color: 0xf0e8db, alpha: 0.95 }).stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
      g.circle(x, 526, 1.2).fill({ color: T.navy, alpha: 0.35 });
    }
    this.addChild(g);
  }

  private buildSprings(): void {
    const g = new Graphics();
    for (const side of [-1, 1]) {
      const x = side < 0 ? FABRIC.x - 58 : FABRIC.x + FABRIC.w + 58;
      // zigzag spring from top beam down to heddle shaft bracket
      let y = LOOM.topBeam + 16;
      g.moveTo(x, y);
      let dir = 1;
      while (y < LOOM.heddleA - 30 && y < LOOM.heddleB - 40) {
        y += 5;
        g.lineTo(x + dir * 5, y);
        dir *= -1;
      }
      g.lineTo(x, Math.min(LOOM.heddleA - 30, y + 5));
      g.stroke({ width: 0.7, color: T.navy, alpha: 0.4 });
      g.circle(x, LOOM.topBeam + 14, 3).stroke({ width: 0.5, color: T.navy, alpha: 0.4 });
    }
    this.addChild(g);
  }

  private buildTreadles(): void {
    const g = new Graphics();
    const y0 = 902;
    for (let i = 0; i < 3; i++) {
      const x = 700 + i * 96;
      g.roundRect(x, y0, 74, 10, 3).fill({ color: 0xf1e9dd, alpha: 0.9 }).stroke({ width: 0.75, color: T.navy, alpha: 0.45 });
      g.circle(x + 6, y0 + 5, 2).fill({ color: T.navy, alpha: 0.4 });
      // linkage rods to heddle shafts
      g.moveTo(x + 60, y0).lineTo(x + 60, 780).stroke({ width: 0.5, color: T.navy, alpha: 0.22 });
    }
    g.moveTo(660, y0 + 14).lineTo(1010, y0 + 14).stroke({ width: 0.45, color: T.navy, alpha: 0.2 });
    this.addChild(g);

    const label = new Text({ text: 'TREADLE  BANK', style: { fontFamily: FONT.mono, fontSize: 6.8, fill: T.navy, letterSpacing: 1.2 } });
    label.position.set(660, y0 + 20); label.alpha = 0.45;
    this.addChild(label);
  }

  private buildClothRoll(): void {
    const g = this.clothRoll;
    const y = 862;
    const x0 = FABRIC.x - 8, x1 = FABRIC.x + FABRIC.w + 8;
    g.roundRect(x0, y - 15, x1 - x0, 30, 14).fill({ color: 0xf2eadd, alpha: 0.96 }).stroke({ width: 0.9, color: T.navy, alpha: 0.5 });
    // rolled cloth spiral
    for (let i = 0; i < 7; i++) {
      const r = 3 + i * 3.4;
      g.moveTo((x0 + x1) / 2 + Math.cos(Math.PI * 0.15) * r, y + Math.sin(Math.PI * 0.15) * r);
      g.arc((x0 + x1) / 2, y, r, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke({ width: 0.35, color: T.navy, alpha: 0.16 });
    }
    for (const x of [x0, x1]) {
      g.circle(x, y, 12).stroke({ width: 0.7, color: T.navy, alpha: 0.4 });
      g.circle(x, y, 4).fill({ color: T.navy, alpha: 0.35 });
    }
    // cloth guiding over the roll
    g.moveTo(x0 + 6, y - 15).lineTo(x0 + 6, y - 28).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    g.moveTo(x1 - 6, y - 15).lineTo(x1 - 6, y - 28).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
  }

  private callout(g: Graphics, fromX: number, fromY: number, toX: number, toY: number, text: string, align: 'left' | 'right' = 'right'): void {
    g.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: 0.55, color: T.navy, alpha: 0.35 });
    g.circle(fromX, fromY, 1.1).fill({ color: T.navy, alpha: 0.45 });
    const t = new Text({ text, style: { fontFamily: FONT.mono, fontSize: 6.6, fill: T.navy, letterSpacing: 1.1 } });
    t.anchor.set(align === 'right' ? 1 : 0, 0.5);
    t.position.set(toX + (align === 'right' ? -6 : 6), toY);
    t.alpha = 0.55;
    this.addChild(t);
  }

  private buildCallouts(): void {
    const g = new Graphics();
    const R = FABRIC.x + FABRIC.w;
    this.callout(g, FABRIC.x + 120, 176, FABRIC.x + 120, 104, 'WARP BEAM / 106 ENDS');
    this.callout(g, FABRIC.x - 30, LOOM.heddleB + 16, FABRIC.x - 100, LOOM.heddleB + 52, 'HEDDLE SHAFTS A/B', 'left');
    this.callout(g, FABRIC.x - 20, LOOM.reedY + 6, FABRIC.x - 100, LOOM.reedY + 36, 'REED 106 DENTS', 'left');
    this.callout(g, FABRIC.x + FABRIC.w + 8, LOOM.raceY, FABRIC.x + FABRIC.w + 76, LOOM.raceY - 18, 'SHUTTLE / PIRN');
    this.callout(g, FABRIC.x + FABRIC.w + 12, 858, FABRIC.x + FABRIC.w + 76, 838, 'CLOTH ROLL');
    this.callout(g, 380, 660, 300, 620, 'FLYWHEEL  Ø192', 'left');
    this.callout(g, 560, 542, 470, 528, 'CAM / HEDDLE DRIVE', 'left');
    this.callout(g, 352, 610, 300, 700, 'DRIVE BELT', 'left');
    this.addChild(g);

    // dimensions
    const d = new Graphics();
    // fabric width
    d.moveTo(FABRIC.x, 918).lineTo(FABRIC.x + FABRIC.w, 918).stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
    for (const x of [FABRIC.x, FABRIC.x + FABRIC.w]) {
      d.moveTo(x, 912).lineTo(x, 924).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
      d.moveTo(x, 918).lineTo(x + 6, 915.4).lineTo(x + 6, 920.6).closePath().fill({ color: T.navy, alpha: 0.3 });
    }
    const wt = new Text({ text: '445', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 0.8 } });
    wt.anchor.set(0.5); wt.position.set(FABRIC.x + FABRIC.w / 2, 905); wt.alpha = 0.45;
    this.addChild(wt);
    // fabric height
    d.moveTo(FABRIC.x - 74, FABRIC.y).lineTo(FABRIC.x - 74, FABRIC.y + FABRIC.h).stroke({ width: 0.5, color: T.navy, alpha: 0.28 });
    const ht = new Text({ text: '700', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 0.8 } });
    ht.anchor.set(0.5); ht.rotation = -Math.PI / 2; ht.position.set(FABRIC.x - 84, FABRIC.y + FABRIC.h / 2); ht.alpha = 0.45;
    this.addChild(ht);
    this.addChild(d);
  }

  private buildDetail(): void {
    const cx = 322, cy = 112, R = 42;
    const g = new Graphics();
    g.circle(cx, cy, R).fill({ color: 0xfdfbf7, alpha: 0.9 }).stroke({ width: 0.7, color: T.navy, alpha: 0.4 });
    g.circle(cx, cy, R - 6).stroke({ width: 0.35, color: T.navy, alpha: 0.2 });
    // magnified thread pitch detail
    for (let i = 0; i < 6; i++) {
      const x = cx - 24 + i * 9.6;
      g.moveTo(x, cy - 26).lineTo(x, cy + 26).stroke({ width: 1.1, color: T.navy, alpha: 0.5 });
    }
    g.moveTo(cx - 24, cy + 22).lineTo(cx - 24 + 9.6, cy + 22).stroke({ width: 0.9, color: T.teal, alpha: 0.9 });
    g.moveTo(cx - 24, cy + 18).lineTo(cx - 24, cy + 26).stroke({ width: 0.5, color: T.teal, alpha: 0.7 });
    g.moveTo(cx - 24 + 9.6, cy + 18).lineTo(cx - 24 + 9.6, cy + 26).stroke({ width: 0.5, color: T.teal, alpha: 0.7 });
    const t = new Text({ text: 'DETAIL A — WARP PITCH 4.2', style: { fontFamily: FONT.mono, fontSize: 6.6, fill: T.navy, letterSpacing: 1.1 } });
    t.anchor.set(0.5); t.position.set(cx, cy + R + 10); t.alpha = 0.5;
    this.addChild(t, g);
  }
}
