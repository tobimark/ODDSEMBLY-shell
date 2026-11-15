import { Container, Graphics, Text } from 'pixi.js';
import { FABRIC, LOOM } from '../layout';
import { FONT, T } from '../theme';
import { bolt } from './geometry';

/** Two heddle shafts with frames, heald wires and drive rods. */
export class Heddle extends Container {
  private shaftA = new Container();
  private shaftB = new Container();
  private rods = new Graphics();
  private baseA = LOOM.heddleA;
  private baseB = LOOM.heddleB;

  constructor() {
    super();
    this.buildShaft(this.shaftA, 'SHAFT A');
    this.buildShaft(this.shaftB, 'SHAFT B');
    this.shaftA.y = this.baseA;
    this.shaftB.y = this.baseB;
    this.addChild(this.shaftA, this.shaftB, this.rods);
  }

  private buildShaft(c: Container, label: string): void {
    const g = new Graphics();
    const x0 = FABRIC.x - 40;
    const w = FABRIC.w + 80;
    g.roundRect(x0, -7, w, 14, 3).fill({ color: 0xf5f0e7, alpha: 0.92 }).stroke({ width: 0.8, color: T.navy, alpha: 0.5 });
    g.rect(x0 + 6, -3.5, w - 12, 7).stroke({ width: 0.4, color: T.navy, alpha: 0.18 });
    for (let x = x0 + 16; x < x0 + w - 12; x += 26) bolt(g, x, 0, 1.7, 0.35);
    // end brackets
    for (const x of [x0, x0 + w]) {
      g.roundRect(x - 8, -12, 16, 24, 2).fill({ color: 0xefe8dd, alpha: 0.9 }).stroke({ width: 0.7, color: T.navy, alpha: 0.45 });
      g.moveTo(x, -12).lineTo(x, 12).stroke({ width: 0.4, color: T.navy, alpha: 0.25 });
    }
    c.addChild(g);
    const t = new Text({ text: label, style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.4 } });
    t.position.set(x0 + 10, 10);
    t.alpha = 0.5;
    c.addChild(t);
  }

  setOffsets(a: number, b: number): void {
    this.shaftA.y = this.baseA + a;
    this.shaftB.y = this.baseB + b;
  }

  /** draw drive rods from cam area to shaft ends; called each frame */
  drawRods(camY: number, phases: { a: number; b: number }): void {
    const g = this.rods;
    g.clear();
    const xl = FABRIC.x - 54;
    for (const [y, ph] of [[this.shaftA.y, phases.a], [this.shaftB.y, phases.b]] as const) {
      const x1 = xl + ph * 6;
      g.moveTo(xl, camY).lineTo(x1, y - 10).stroke({ width: 0.85, color: T.navy, alpha: 0.5 });
      g.circle(xl, camY, 3.2).stroke({ width: 0.7, color: T.navy, alpha: 0.5 });
      g.circle(x1, y - 10, 3.2).stroke({ width: 0.7, color: T.navy, alpha: 0.5 });
      g.circle(x1, y - 10, 1.2).fill({ color: T.navy, alpha: 0.5 });
    }
  }
}

/** Sley + reed comb + raceway. */
export class Reed extends Container {
  private sley = new Container();
  private teeth = new Graphics();
  private frame = new Graphics();
  private beat = 0;

  constructor() {
    super();
    const x0 = FABRIC.x - 22;
    const w = FABRIC.w + 44;
    const g = this.frame;
    g.roundRect(x0, -16, w, 18, 3).fill({ color: 0xf3ede3, alpha: 0.92 }).stroke({ width: 0.85, color: T.navy, alpha: 0.5 });
    g.roundRect(x0, 16, w, 12, 3).fill({ color: 0xf3ede3, alpha: 0.92 }).stroke({ width: 0.85, color: T.navy, alpha: 0.5 });
    // comb teeth
    const tg = this.teeth;
    for (let i = 0; i < FABRIC.ends; i++) {
      const x = x0 + 22 + i * FABRIC.pitch;
      tg.moveTo(x, -1).lineTo(x, 17).stroke({ width: 0.42, color: T.navy, alpha: 0.32 });
      tg.circle(x, 8, 0.8).fill({ color: T.navy, alpha: 0.28 });
    }
    // comb base
    tg.rect(x0 + 18, 6, w - 36, 4).fill({ color: 0xffffff, alpha: 0.5 });
    this.sley.addChild(g, tg);
    this.sley.y = LOOM.reedY;
    this.addChild(this.sley);

    // raceway rails (static)
    const rail = new Graphics();
    rail.moveTo(x0 - 30, LOOM.raceY - 10).lineTo(x0 + w + 30, LOOM.raceY - 10).stroke({ width: 0.55, color: T.navy, alpha: 0.3 });
    rail.moveTo(x0 - 30, LOOM.raceY + 10).lineTo(x0 + w + 30, LOOM.raceY + 10).stroke({ width: 0.55, color: T.navy, alpha: 0.3 });
    for (let x = x0 - 20; x < x0 + w + 20; x += 18) {
      rail.moveTo(x, LOOM.raceY - 12).lineTo(x, LOOM.raceY - 8).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
      rail.moveTo(x, LOOM.raceY + 8).lineTo(x, LOOM.raceY + 12).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    }
    this.addChild(rail);
  }

  setSley(dx: number, beatNorm: number): void {
    this.beat = beatNorm;
    this.sley.x = dx;
    this.sley.y = LOOM.reedY - beatNorm * 9;
  }
}

/** Shuttle boat with pirn and trailing weft. */
export class Shuttle extends Container {
  private hull = new Container();
  private trail = new Graphics();
  private pirn = new Graphics();

  constructor() {
    super();
    const g = new Graphics();
    g.poly([-38, 0, -29, -8, 22, -8, 37, 0, 22, 8, -29, 8]).fill({ color: 0xf1e8da, alpha: 0.98 }).stroke({ width: 0.9, color: T.navy, alpha: 0.6 });
    g.moveTo(-29, -8).lineTo(-29, 8).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    g.moveTo(22, -8).lineTo(22, 8).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    g.moveTo(-38, 0).lineTo(-30, 0).stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
    g.moveTo(30, 0).lineTo(37, 0).stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
    g.roundRect(-10, -5, 22, 10, 4).fill({ color: 0xffffff, alpha: 0.5 }).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    this.hull.addChild(g);
    // pirn
    this.pirn.roundRect(-4, -3.4, 12, 6.8, 2).fill({ color: T.teal, alpha: 0.5 }).stroke({ width: 0.5, color: T.navy, alpha: 0.4 });
    this.pirn.moveTo(-6, 0).lineTo(-4, 0).stroke({ width: 0.6, color: T.navy, alpha: 0.4 });
    this.hull.addChild(this.pirn);
    // nose highlight
    const hi = new Graphics();
    hi.moveTo(26, 0).lineTo(34, 0).stroke({ width: 1.1, color: T.navy, alpha: 0.5 });
    this.hull.addChild(hi);
    this.hull.y = LOOM.raceY;
    this.addChild(this.trail, this.hull);
  }

  /** x = center of shuttle; trailFromX = left cloth edge */
  setPose(x: number, trailFromX: number, active: boolean): void {
    this.hull.x = x;
    this.trail.clear();
    if (active) {
      const y = LOOM.raceY;
      this.trail.moveTo(trailFromX, y).lineTo(x - 38, y).stroke({ width: 0.55, color: T.teal, alpha: 0.55 });
      this.trail.moveTo(trailFromX, y + 1.2).lineTo(x - 38, y + 1.2).stroke({ width: 0.35, color: T.navy, alpha: 0.25 });
    }
  }
}
