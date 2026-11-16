import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { EngineStatus, ToolEvent } from '../events/types';
import { backdrop, heddle, reed, shuttle } from './atelier/assembly';
import { C, bearing, flywheelSprite, gearSprite, label, line, metal, surface } from './atelier/drawing';
import { Mechanism } from './atelier/mechanism';
import { solveLinkage } from './atelier/linkage';
import { Textile, WEAVE } from './atelier/textile';

/** Original procedural assembly. Canvas creates material textures; Pixi owns
 * compositing, part transforms and animation. No reference pixels are sampled. */
export class LoomScene extends Container {
  private mechanism = new Mechanism();
  private textile = new Textile();
  private wheel = flywheelSprite();
  private gearA = gearSprite(39, 24);
  private gearB = gearSprite(26, 16, true);
  private shaftA = heddle();
  private shaftB = heddle(906, true);
  private reed = reed();
  private shuttle = shuttle();
  private linkage = new Graphics();
  private weft = new Graphics();
  private needle = new Graphics();
  private stageLabel = new Text({ text: 'READY', style: { fontFamily: 'Consolas, monospace', fontSize: 9, fill: '#657582', letterSpacing: 1.6 } });
  private pickLabel = new Text({ text: '0000', style: { fontFamily: 'Consolas, monospace', fontSize: 17, fill: C.navy, letterSpacing: 2 } });
  private lastStage = '';
  private textures: Sprite[] = [];

  constructor(private readonly onBeat: (e: ToolEvent) => void = () => {}) {
    super();
    const base = backdrop();
    this.wheel.position.set(221, 660); this.gearA.position.set(221, 509); this.gearB.position.set(281, 509);
    this.shaftA.position.set(307, 401); this.shaftB.position.set(307, 513);
    this.reed.position.set(308, 606); this.shuttle.position.set(366, 675);
    const belt = surface(200, 140, g => {
      g.translate(-120, -486);
      // External tangents of 102:34 pitch pulleys, matching the 3:1 drive.
      line(g, [130, 614, 191, 494], '#4D5969', 5); line(g, [312, 614, 251, 494], '#4D5969', 5);
      line(g, [129, 614, 190, 494], '#D1D2BF', 1); line(g, [313, 614, 252, 494], '#D1D2BF', 1);
    });
    belt.position.set(120, 486);
    const race = surface(940, 52, g => {
      g.translate(-302, -651);
      metal(g, 326, 687, 884, 8);
      for (const x of [322, 1216]) bearing(g, x, 680, 12);
      for (const x of [344, 1188]) metal(g, x, 662, 7, 31, true);
    });
    race.position.set(302, 651);
    this.stageLabel.position.set(1350, 487); this.pickLabel.position.set(1270, 852);
    this.addChild(base, this.textile.cloth, this.textile.warp, this.shaftB, this.shaftA, belt, this.wheel, this.gearA, this.gearB, this.linkage, this.reed, this.weft, this.shuttle, this.textile.front, race, this.needle, this.stageLabel, this.pickLabel);
    this.textures = [base, belt, race, this.wheel, this.gearA, this.gearB, this.shaftA, this.shaftB, this.reed, this.shuttle];
    this.mechanism.onPick = e => { this.textile.commit(e.type); this.onBeat(e); this.pickLabel.text = String(this.mechanism.picks).padStart(4, '0'); };
    this.pose();
  }

  setStatus(_s: EngineStatus) { /* Counters stay in the quiet React transport. */ }
  trigger(e: ToolEvent) { this.mechanism.push(e); }
  setRunning(_on: boolean) { /* The event queue powers the shaft. */ }
  setStopped() { this.mechanism.stop(); this.pose(); }
  get telemetry() { return this.mechanism.snapshot(); }
  update(dt: number, _running: boolean) { this.mechanism.update(dt); this.pose(); }

  private pose() {
    const m = this.mechanism;
    const lift = m.shed * 19 * m.direction;
    this.shaftA.y = 401 - lift; this.shaftB.y = 513 + lift;
    this.reed.y = 606 + m.beat * 29;
    this.shuttle.x = 366 + m.travel * 809;
    this.shuttle.y = 675 - Math.sin(m.travel * Math.PI) * 2;
    this.wheel.rotation = m.angle; this.gearA.rotation = m.angle * 3; this.gearB.rotation = -m.angle * 4.5 + Math.PI / 16;
    this.textile.update(m.shed, m.direction);
    this.textile.cloth.y = WEAVE.fell + (m.active && m.committed ? -2 + m.takeup * 2 : 0);
    const g = this.linkage; g.clear();
    const rod = (x: number, y: number, ex: number, ey: number, w = 6) => {
      g.moveTo(x + 2, y + 3).lineTo(ex + 2, ey + 3).stroke({ color: 0x171C60, alpha: .16, width: w + 2 });
      g.moveTo(x, y).lineTo(ex, ey).stroke({ color: 0x5E6D7D, width: w });
      g.moveTo(x - .8, y - 1).lineTo(ex - .8, ey - 1).stroke({ color: 0xD8DDD7, width: w - 2 });
      for (const [a, b] of [[x, y], [ex, ey]]) { g.circle(a, b, w + 1).fill(0xD0D6D0).stroke({ color: 0x5A697B, width: .8 }); g.circle(a, b, 2.2).fill(0x667486); }
    };
    // Three explicitly servo-driven slider cranks. The decorative transmission
    // on the left no longer pretends to drive these independently commanded axes.
    for (const [base, target] of [[419, this.shaftA.y + 18], [531, this.shaftB.y + 18], [649, this.reed.y + 43]]) {
      const k = solveLinkage({ x: 1260, y: base + 70 }, { x: 1220, y: target });
      g.roundRect(1241, base + 51, 38, 38, 5).fill(0xD5DAD5).stroke({color:0x7D8996,width:1});
      g.circle(1260, base + 70, 16).fill(0x171C60).stroke({color:0xE7E9E1,width:2});
      rod(k.center.x, k.center.y, k.pin.x, k.pin.y, 4);
      rod(k.pin.x, k.pin.y, k.slider.x, k.slider.y, 4);
    }
    this.weft.clear();
    if (m.active && m.phase >= .24 && m.phase < .84) {
      const edge = m.direction > 0 ? WEAVE.x : WEAVE.x + WEAVE.w;
      this.weft.moveTo(edge, 683).lineTo(this.shuttle.x, 678).stroke({ color: m.active.type === 'Bash' ? 0x171C60 : 0x33CBCC, width: 1.4 });
    }
    const a = -1.15 + m.shed * .55 + m.beat * .2;
    this.needle.clear().moveTo(246, 392).lineTo(246 + Math.cos(a) * 22, 392 + Math.sin(a) * 22).stroke({ color: 0x171C60, width: 1.5 }).circle(246, 392, 2.5).fill(0x171C60);
    if (this.lastStage !== m.stage) { this.stageLabel.text = m.stage; this.lastStage = m.stage; }
  }

  override destroy() {
    this.textile.destroy();
    for (const sprite of this.textures) sprite.texture.destroy(true);
    super.destroy({ children: true });
  }
}
