import { Container, Graphics } from 'pixi.js';
import { FABRIC } from '../layout';
import { T, WARP_COLORS } from '../theme';
import { bolt } from './geometry';

/** Warp beam bobbins: 12 spools with flanges, thread wraps and guide eyes. */
export class Bobbins extends Container {
  private spools: { body: Graphics; phase: number; baseX: number; color: number }[] = [];
  private guide = new Graphics();
  private t = 0;

  constructor() {
    super();
    const n = 12;
    const y = 132;
    const x0 = FABRIC.x + 8;
    const x1 = FABRIC.x + FABRIC.w - 8;
    const rail = new Graphics();
    rail.moveTo(x0 - 14, y - 1).lineTo(x1 + 14, y - 1).stroke({ width: 0.6, color: T.navy, alpha: 0.35 });
    for (let i = 0; i < n; i++) {
      const x = x0 + (i * (x1 - x0)) / (n - 1);
      const color = WARP_COLORS[i % WARP_COLORS.length];
      const g = new Graphics();
      // holder plate
      g.roundRect(x - 16, y - 28, 32, 40, 3).fill({ color: 0xf7f2e9, alpha: 0.96 }).stroke({ width: 0.6, color: T.navy, alpha: 0.42 });
      g.circle(x - 12, y - 24, 1.2).stroke({ width: 0.35, color: T.navy, alpha: 0.35 });
      g.circle(x + 12, y - 24, 1.2).stroke({ width: 0.35, color: T.navy, alpha: 0.35 });
      // colour bar
      g.roundRect(x - 10, y - 20, 20, 5, 2).fill({ color, alpha: 0.95 });
      // spool body
      g.roundRect(x - 7, y - 12, 14, 18, 2).fill({ color: 0xf3ece2, alpha: 0.9 }).stroke({ width: 0.5, color: T.navy, alpha: 0.4 });
      for (let k = 0; k < 3; k++) {
        g.moveTo(x - 5, y - 9 + k * 5).lineTo(x + 5, y - 9 + k * 5).stroke({ width: 0.42, color, alpha: 0.9 });
      }
      // flanges
      g.ellipse(x, y - 13, 8, 2.2).fill({ color: 0xfaf6ef, alpha: 0.98 }).stroke({ width: 0.45, color: T.navy, alpha: 0.35 });
      g.ellipse(x, y + 6, 8, 2.2).fill({ color: 0xfaf6ef, alpha: 0.98 }).stroke({ width: 0.45, color: T.navy, alpha: 0.35 });
      // core pin
      g.moveTo(x, y - 15).lineTo(x, y + 8).stroke({ width: 0.45, color: T.navy, alpha: 0.45 });
      g.circle(x, y - 15, 1.6).fill({ color: T.navy, alpha: 0.45 });
      this.addChild(g);
      this.spools.push({ body: g, phase: i * 0.52, baseX: x, color });
      // guide eye above
      this.guide.circle(x, y - 34, 2.2).stroke({ width: 0.45, color: T.navy, alpha: 0.4 });
      this.guide.moveTo(x, y - 32).lineTo(x, y - 22).stroke({ width: 0.35, color: T.navy, alpha: 0.3 });
    }
    this.addChild(this.guide);
    for (const x of [x0 - 14, x1 + 14]) bolt(this.guide, x, y - 1, 2.2, 0.45);
  }

  update(dt: number, rpm: number): void {
    this.t += dt * (0.4 + rpm * 3);
    for (const s of this.spools) {
      // subtle spin: wrap lines travel (redraw thin highlights only)
      const wobble = Math.sin(this.t + s.phase) * 0.35;
      s.body.x = wobble * (0.4 + rpm * 1.2);
    }
  }
}
