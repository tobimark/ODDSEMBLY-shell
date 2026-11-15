import { Container, Graphics, Text } from 'pixi.js';
import { DRIVE, FABRIC, LOOM } from '../layout';
import { FONT, T } from '../theme';
import { bolt, dashedLine, gear } from './geometry';

/** Flywheel, gears, cam, belt, motor and the connecting rod to the sley. */
export class Drive extends Container {
  private flywheel = new Container();
  private gearBig = new Container();
  private gearSmall = new Container();
  private cam = new Container();
  private rod = new Graphics();
  private belt = new Graphics();
  private beltT = 0;
  private beltTick = new Graphics();
  private sleyAnchor: { x: number; y: number } = { x: FABRIC.x - 10, y: LOOM.reedY };

  constructor() {
    super();
    this.buildFlywheel();
    this.buildGears();
    this.buildBelt();
    this.buildMotor();
    this.addChild(this.belt, this.beltTick, this.rod);
  }

  private buildFlywheel(): void {
    const g = new Graphics();
    const R = 96;
    g.circle(0, 0, R).fill({ color: 0xf4eee4, alpha: 0.75 }).stroke({ width: 1.1, color: T.navy, alpha: 0.55 });
    g.circle(0, 0, R - 9).stroke({ width: 0.5, color: T.navy, alpha: 0.25 });
    g.circle(0, 0, 20).fill({ color: 0xefe7db, alpha: 0.9 }).stroke({ width: 0.8, color: T.navy, alpha: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const a2 = a + 0.12;
      g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      g.lineTo(Math.cos(a) * (R - 10), Math.sin(a) * (R - 10));
      g.lineTo(Math.cos(a2) * (R - 10), Math.sin(a2) * (R - 10));
      g.lineTo(Math.cos(a2) * 20, Math.sin(a2) * 20);
      g.closePath();
    }
    g.fill({ color: 0xf6f1e8, alpha: 0.85 }).stroke({ width: 0.7, color: T.navy, alpha: 0.45 });
    // rim bolts + counterweight + hub bolts
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      bolt(g, Math.cos(a) * (R - 5), Math.sin(a) * (R - 5), 2.4, 0.5);
    }
    g.roundRect(30, 26, 26, 18, 4).fill({ color: T.navySoft, alpha: 0.35 }).stroke({ width: 0.6, color: T.navy, alpha: 0.45 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bolt(g, Math.cos(a) * 10, Math.sin(a) * 10, 1.8, 0.45);
    }
    g.circle(0, 0, 7).fill({ color: T.navy, alpha: 0.55 });
    g.circle(0, 0, 3).fill({ color: 0xf6f1e8, alpha: 0.9 });
    // crank pin
    g.circle(62, 0, 5).fill({ color: T.teal, alpha: 0.8 }).stroke({ width: 0.8, color: T.navy, alpha: 0.6 });
    g.circle(62, 0, 2).fill({ color: T.navy, alpha: 0.6 });
    this.flywheel.addChild(g);
    this.flywheel.position.set(DRIVE.flywheel.x, DRIVE.flywheel.y);
    this.addChild(this.flywheel);

    const label = new Text({ text: 'FLYWHEEL', style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 1.4 } });
    label.anchor.set(0.5); label.position.set(DRIVE.flywheel.x, DRIVE.flywheel.y + 112); label.alpha = 0.5;
    this.addChild(label);
  }

  private buildGears(): void {
    const g1 = new Graphics();
    g1.circle(3, 3, DRIVE.gearBig.r + 6).fill({ color: T.navy, alpha: 0.05 });
    gear(g1, 0, 0, DRIVE.gearBig.r, 20, 5);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; bolt(g1, Math.cos(a) * 26, Math.sin(a) * 26, 2.1, 0.4); }
    this.gearBig.addChild(g1); this.gearBig.position.set(DRIVE.gearBig.x, DRIVE.gearBig.y); this.addChild(this.gearBig);

    const g2 = new Graphics();
    g2.circle(2, 2, DRIVE.gearSmall.r + 5).fill({ color: T.navy, alpha: 0.05 });
    gear(g2, 0, 0, DRIVE.gearSmall.r, 12, 4);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; bolt(g2, Math.cos(a) * 14, Math.sin(a) * 14, 1.8, 0.4); }
    this.gearSmall.addChild(g2); this.gearSmall.position.set(DRIVE.gearSmall.x, DRIVE.gearSmall.y); this.addChild(this.gearSmall);

    const gc = new Graphics();
    const R = DRIVE.cam.r;
    gc.circle(0, 0, R).fill({ color: 0xf3ece2, alpha: 0.95 }).stroke({ width: 0.8, color: T.navy, alpha: 0.55 });
    gc.moveTo(0, 0); gc.lineTo(R + 12, 5); gc.lineTo(R + 10, -8); gc.closePath();
    gc.fill({ color: 0xefe6d9, alpha: 0.98 }).stroke({ width: 0.7, color: T.navy, alpha: 0.5 });
    gc.circle(0, 0, 9).stroke({ width: 0.5, color: T.navy, alpha: 0.35 });
    gc.circle(0, 0, 3.5).fill({ color: T.navy, alpha: 0.55 });
    this.cam.addChild(gc); this.cam.position.set(DRIVE.cam.x, DRIVE.cam.y); this.addChild(this.cam);

    // drive shaft segments
    const shaft = new Graphics();
    shaft.moveTo(DRIVE.gearBig.x, DRIVE.gearBig.y).lineTo(DRIVE.gearSmall.x, DRIVE.gearSmall.y).lineTo(DRIVE.cam.x, DRIVE.cam.y)
      .stroke({ width: 1.2, color: T.navy, alpha: 0.35 });
    shaft.moveTo(DRIVE.gearBig.x, DRIVE.gearBig.y).lineTo(DRIVE.flywheel.x, DRIVE.flywheel.y).stroke({ width: 1.4, color: T.navy, alpha: 0.28 });
    this.addChild(shaft);
  }

  private buildBelt(): void {
    const g = this.belt;
    const f = DRIVE.flywheel;
    const p = { x: 352, y: 610, r: 20 };
    // belt loop (approx external tangent path)
    g.moveTo(f.x - 24, f.y - f.r);
    g.bezierCurveTo(f.x - 60, f.y - f.r, p.x + 40, p.y - p.r, p.x, p.y - p.r);
    g.moveTo(p.x, p.y + p.r);
    g.bezierCurveTo(p.x + 40, p.y + p.r, f.x - 60, f.y + f.r, f.x - 24, f.y + f.r);
    g.stroke({ width: 1.6, color: T.navy, alpha: 0.5 });
    g.moveTo(f.x - 24, f.y - f.r + 3);
    g.bezierCurveTo(f.x - 60, f.y - f.r + 3, p.x + 40, p.y - p.r + 3, p.x, p.y - p.r + 3);
    g.stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
    // pulley
    g.circle(p.x, p.y, p.r).fill({ color: 0xf3ece2, alpha: 0.9 }).stroke({ width: 0.8, color: T.navy, alpha: 0.5 });
    g.circle(p.x, p.y, 3).fill({ color: T.navy, alpha: 0.45 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5).lineTo(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18);
    }
    g.stroke({ width: 0.5, color: T.navy, alpha: 0.3 });
    this.addChild(g);
    const label = new Text({ text: 'BELT  A-42', style: { fontFamily: FONT.mono, fontSize: 7, fill: T.navy, letterSpacing: 1.2 } });
    label.position.set(330, 686); label.alpha = 0.45; label.rotation = -1.45;
    this.addChild(label);
  }

  private buildMotor(): void {
    const m = DRIVE.motor;
    const g = new Graphics();
    g.roundRect(m.x, m.y, m.w, m.h, 8).fill({ color: 0xf2ebe1, alpha: 0.95 }).stroke({ width: 1.0, color: T.navy, alpha: 0.5 });
    g.roundRect(m.x + 6, m.y + 6, m.w - 12, m.h - 12, 5).stroke({ width: 0.45, color: T.navy, alpha: 0.2 });
    for (let i = 0; i < 6; i++) {
      g.roundRect(m.x + 16 + i * 16, m.y + 16, 9, m.h - 32, 2).stroke({ width: 0.4, color: T.navy, alpha: 0.22 });
    }
    g.circle(m.x + m.w - 18, m.y + m.h / 2, 12).stroke({ width: 0.8, color: T.navy, alpha: 0.45 });
    g.circle(m.x + m.w - 18, m.y + m.h / 2, 4).fill({ color: T.navy, alpha: 0.4 });
    bolt(g, m.x + 9, m.y + 9, 2.2, 0.45); bolt(g, m.x + m.w - 9, m.y + 9, 2.2, 0.45);
    bolt(g, m.x + 9, m.y + m.h - 9, 2.2, 0.45); bolt(g, m.x + m.w - 9, m.y + m.h - 9, 2.2, 0.45);
    this.addChild(g);

    const label = new Text({ text: 'DRIVE UNIT  KM-220', style: { fontFamily: FONT.mono, fontSize: 7.5, fill: T.navy, letterSpacing: 1.5 } });
    label.position.set(m.x + 14, m.y + m.h + 8);
    label.alpha = 0.55;
    this.addChild(label);
  }

  update(dt: number, crank: number, angularVel: number, sleyX: number, sleyY: number): void {
    this.flywheel.rotation = crank;
    this.gearBig.rotation = -crank * 0.52;
    this.gearSmall.rotation = crank * 1.35;
    this.cam.rotation = crank * 0.78;

    // crank pin (world) and rod to sley
    const pinX = DRIVE.flywheel.x + Math.cos(crank) * 62;
    const pinY = DRIVE.flywheel.y + Math.sin(crank) * 62;
    this.sleyAnchor = { x: sleyX, y: sleyY - 22 };
    const g = this.rod;
    g.clear();
    g.moveTo(pinX, pinY).lineTo(this.sleyAnchor.x, this.sleyAnchor.y).stroke({ width: 1.3, color: T.navy, alpha: 0.55 });
    g.circle(pinX, pinY, 4.2).fill({ color: T.teal, alpha: 0.85 }).stroke({ width: 0.7, color: T.navy, alpha: 0.55 });
    g.circle(this.sleyAnchor.x, this.sleyAnchor.y, 4.2).stroke({ width: 0.7, color: T.navy, alpha: 0.55 });
    g.circle(this.sleyAnchor.x, this.sleyAnchor.y, 1.4).fill({ color: T.navy, alpha: 0.5 });

    // belt tick highlight (single reusable marker)
    this.beltT += dt * (0.2 + Math.abs(angularVel) * 0.9);
    const tick = this.beltT % 1;
    this.beltTick.clear();
    this.beltTick.circle(380 + tick * 40, 620 + Math.sin(tick * Math.PI) * 10, 1.2).fill({ color: T.teal, alpha: 0.35 });
  }
}
