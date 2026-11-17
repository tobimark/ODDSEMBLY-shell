import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { EngineStatus, ToolEvent } from '../../core/types';
import { sheetBase, loomPlate, heddle, reed, shuttle } from './atelier/assembly';
import { C, bearing, flywheelSprite, gearSprite, label, line, metal, surface } from './atelier/drawing';
import { Mechanism } from './atelier/mechanism';
import { solveLinkage } from './atelier/linkage';
import { Textile, WEAVE } from './atelier/textile';
import { sharedChassis } from './atelier/integration';
import { FINISH as F, MOUNT } from './atelier/finish';
import { DIAL, EventDial } from './atelier/eventDial';

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
  /** Rotating key on the output coupling, tied to the gear phase. */
  private shaftMark = new Graphics();
  private weft = new Graphics();
  private needle = new Graphics();
  private stageLabel = new Text({ text: 'READY', style: { fontFamily: 'Consolas, monospace', fontSize: 9, fill: '#657582', letterSpacing: 1.6 } });
  private pickLabel = new Text({ text: '0000', style: { fontFamily: 'Consolas, monospace', fontSize: 17, fill: C.navy, letterSpacing: 2 } });
  private lastStage = '';
  private textures: Sprite[] = [];
  private readonly world = new Container();
  private readonly dial = new EventDial();
  /** The dial is a separate top-left instrument: 83% size, shifted so its
   *  outer edge stops before the loom frame (three-part composition). */
  private readonly dialBody = new Container();
  private readonly dialFront = new Container();
  /** Fixed signal conduit from read-head housing to the drive box. */
  private readonly signalConduit = new Graphics();

  constructor(private readonly onBeat: (e: ToolEvent) => void = () => {}) {
    super();
    const sheet = sheetBase();
    const base = loomPlate();
    const chassis = sharedChassis();
    this.world.scale.set(MOUNT.scale);
    this.textile.warp.alpha = 0.58;
    this.world.position.set(MOUNT.x, MOUNT.y);
    const dialView = { scale: 0.83, cx: -553, cy: -390 };
    const dtx = dialView.cx - dialView.scale * DIAL.cx;
    const dty = dialView.cy - dialView.scale * DIAL.cy;
    for (const wrap of [this.dialBody, this.dialFront]) {
      wrap.scale.set(dialView.scale);
      wrap.position.set(dtx, dty);
    }
    this.dialBody.addChild(this.dial.body);
    this.dialFront.addChild(this.dial.front);
    this.drawSignalConduit();
    // drive cluster pulled 60 px left of the loom frame, so it reads as a separate block
    this.wheel.position.set(161, 660); this.gearA.position.set(161, 509); this.gearB.position.set(221, 509);
    this.shaftMark.position.set(293, 530);
    this.shaftMark.circle(0, 0, 4).fill(0x2c3340);
    this.shaftMark.moveTo(0, 0).lineTo(9, 0).stroke({ color: 0x2c3340, width: 2 });
    this.shaftMark.circle(0, 0, 1.4).fill(0xd9d3c2);
    this.shaftA.position.set(307, 401); this.shaftB.position.set(307, 513);
    this.reed.position.set(308, 606); this.shuttle.position.set(366, 675);
    const belt = surface(200, 140, g => {
      g.translate(-120, -486);
      // External tangents of 102:34 pitch pulleys, matching the 3:1 drive.
      line(g, [130, 614, 191, 494], '#4D5969', 5); line(g, [312, 614, 251, 494], '#4D5969', 5);
      line(g, [129, 614, 190, 494], '#D1D2BF', 1); line(g, [313, 614, 252, 494], '#D1D2BF', 1);
    });
    belt.position.set(60, 486);
    const race = surface(940, 52, g => {
      g.translate(-302, -651);
      metal(g, 326, 687, 884, 8);
      for (const x of [322, 1216]) bearing(g, x, 680, 12);
      for (const x of [344, 1188]) metal(g, x, 662, 7, 31, true);
    });
    race.position.set(302, 651);
    this.stageLabel.position.set(1020, 930); this.pickLabel.position.set(1178, 852);
    this.world.addChild(base, this.textile.cloth, this.textile.warp, this.shaftB, this.shaftA, belt, this.wheel, this.gearA, this.gearB, this.linkage, this.shaftMark, this.reed, this.weft, this.shuttle, this.textile.front, race, this.needle, this.stageLabel, this.pickLabel);
    this.addChild(sheet, this.dialBody, chassis, this.world, this.signalConduit, this.dialFront);
    this.textures = [sheet, chassis, base, belt, race, this.wheel, this.gearA, this.gearB, this.shaftA, this.shaftB, this.reed, this.shuttle];
    this.mechanism.onPick = e => { this.textile.commit(e.type); this.onBeat(e); this.pickLabel.text = String(this.mechanism.picks).padStart(4, '0'); };
    this.pose();
  }

  setStatus(_s: EngineStatus) { /* Counters stay in the quiet React transport. */ }
  trigger(e: ToolEvent) {
    this.mechanism.push(e);
    this.dial.pushEvent(e);
    this.dial.setQueue(this.mechanism.queue.length);
  }
  setRunning(_on: boolean) { /* The event queue powers the shaft. */ }
  setReducedMotion(on: boolean) { this.dial.setReducedMotion(on); }
  setStopped() { this.mechanism.stop(); this.pose(); }
  get telemetry() { return this.mechanism.snapshot(); }
  /** Fixed-readout instrument state (also exposed through LoomMode.telemetry). */
  get dialState() { return this.dial.telemetry(); }
  update(dt: number, _running: boolean) { this.mechanism.update(dt); this.dial.update(dt); this.pose(); }


  /** Signal conduit: read-head housing → fixed outer housing → drive-box top.
   *  Five points, two clamps: one continuous rigid run, not a bead chain. */
  private drawSignalConduit(): void {
    const g = this.signalConduit;
    const pts: [number, number][] = [[209, 248], [190, 300], [181, 400], [202, 490], [235, 533]];
    for (const [w, color, alpha] of [[6.2, '#2A2416', .16], [5.0, '#5B6C7A', 1], [2.0, '#D9D6C7', 1]] as const) {
      g.moveTo(pts[0][0] + 1.2, pts[0][1] + 1.6);
      for (const [x, y] of pts.slice(1)) g.lineTo(x + 1.2, y + 1.6);
      g.stroke({ color, width: w, alpha, cap: 'round', join: 'round' });
    }
    for (const [x, y] of [[183, 350], [206, 486]] as const) {
      g.roundRect(x - 8, y - 9, 16, 18, 2).fill(0xd9d3c2).stroke({ color: 0x8f8878, width: 0.8 });
      g.circle(x, y - 4, 1.5).fill(0xefe9db); g.circle(x, y + 4, 1.5).fill(0xefe9db);
    }
    g.roundRect(221, 526, 26, 14, 2).fill(0xd9d3c2).stroke({ color: 0x6f7a78, width: 1 });
    g.circle(227, 533, 2).fill(0x6f7a78); g.circle(241, 533, 2).fill(0x6f7a78);
    g.circle(209, 248, 6.2).fill(0xe8e8e0).stroke({ color: 0x6f7a78, width: 1.2 });
    g.circle(209, 248, 2.2).fill(0x23283a);
  }

  private pose() {
    const m = this.mechanism;
    this.dial.setQueue(m.queue.length);
    const lift = m.shed * 19 * m.direction;
    this.shaftA.y = 401 - lift; this.shaftB.y = 513 + lift;
    this.reed.y = 606 + m.beat * 29;
    this.shuttle.x = 366 + m.travel * 809;
    this.shuttle.y = 675 - Math.sin(m.travel * Math.PI) * 2;
    this.wheel.rotation = m.angle; this.gearA.rotation = m.angle * 3; this.gearB.rotation = -m.angle * 4.5 + Math.PI / 16;
    this.shaftMark.rotation = m.angle * 3;
    this.textile.update(m.shed, m.direction);
    this.textile.cloth.y = WEAVE.fell + (m.active && m.committed ? -2 + m.takeup * 2 : 0);
    const g = this.linkage; g.clear();
    const rod = (x: number, y: number, ex: number, ey: number, w = 6) => {
      g.moveTo(x + .5, y + .7).lineTo(ex + .5, ey + .7).stroke({ color: 0x171C60, alpha: .04, width: w + .5 });
      g.moveTo(x, y).lineTo(ex, ey).stroke({ color: F.edge, width: w });
      g.moveTo(x - .8, y - 1).lineTo(ex - .8, ey - 1).stroke({ color: F.enamel, width: w - 1.3 });
      for (const [a, b] of [[x, y], [ex, ey]]) { g.circle(a, b, w + 1).fill(F.enamel).stroke({ color: F.muted, width: .6 }); g.circle(a, b, 2.2).fill(0x667486); }
    };
    // Three explicitly servo-driven slider cranks. The decorative transmission
    // on the left no longer pretends to drive these independently commanded axes.
    for (const [base, target] of [[419, this.shaftA.y + 18], [531, this.shaftB.y + 18], [649, this.reed.y + 43]]) {
      const k = solveLinkage({ x: 1242, y: base + 70 }, { x: 1202, y: target });
      g.roundRect(1223, base + 51, 38, 38, 5).fill(F.enamel).stroke({color:0x7D8996,width:1});
      g.circle(1242, base + 70, 16).fill(F.steel).stroke({color:F.muted,width:.8});
      rod(k.center.x, k.center.y, k.pin.x, k.pin.y, 4);
      rod(k.pin.x, k.pin.y, k.slider.x, k.slider.y, 4);
    }
    this.weft.clear();
    if (m.active && m.phase >= .24 && m.phase < .84) {
      const edge = m.direction > 0 ? WEAVE.x : WEAVE.x + WEAVE.w;
      this.weft.moveTo(edge, 683).lineTo(this.shuttle.x, 678).stroke({ color: m.active.type === 'Bash' ? 0x171C60 : 0x33CBCC, width: 1.4 });
    }
    const a = -1.15 + m.shed * .55 + m.beat * .2;
    this.needle.clear().moveTo(186, 392).lineTo(186 + Math.cos(a) * 22, 392 + Math.sin(a) * 22).stroke({ color: 0x171C60, width: 1.5 }).circle(186, 392, 2.5).fill(0x171C60);
    if (this.lastStage !== m.stage) { this.stageLabel.text = m.stage; this.lastStage = m.stage; }
  }

  override destroy() {
    this.dial.destroy();
    this.textile.destroy();
    for (const sprite of this.textures) sprite.texture.destroy(true);
    super.destroy({ children: true });
  }
}
