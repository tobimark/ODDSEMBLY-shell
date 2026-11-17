import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { EngineStatus, ToolEvent, TriggerOptions } from '../../core/types';
import { sheetBase, loomPlate, heddle, reed, shuttle } from './atelier/assembly';
import { C, bearing, flywheelSprite, gearSprite, label, line, metal, surface } from './atelier/drawing';
import { Mechanism } from './atelier/mechanism';
import { solveLinkage } from './atelier/linkage';
import { Textile, CLOTH, WEAVE } from './atelier/textile';
import { DRAFT } from './atelier/draft';
import { Conduit } from './atelier/conduit';
import { toolColor } from './atelier/toolPalette';
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
  /** Four shafts, straight draw — the draft decides which pair lifts per pick. */
  private shafts = [heddle(), heddle(906, true), heddle(), heddle(906, true)];
  private static readonly SHAFT_Y = [372, 434, 496, 558];
  private static readonly SHAFT_LIFT = 22;
  private reed = reed();
  private shuttle = shuttle();
  private linkage = new Graphics();
  /** Rotating key on the output coupling, tied to the gear phase. */
  private shaftMark = new Graphics();
  private weft = new Graphics();
  private needle = new Graphics();
  private race!: Sprite;
  /** Rectangular crop: the cloth only exists below the fell. */
  private clothMask = new Graphics();
  private conduit = new Conduit();
  private glow = new Graphics();
  private glowT = 0;
  private glowColor = 0xffffff;
  private stageLabel = new Text({ text: 'READY', style: { fontFamily: 'Consolas, monospace', fontSize: 9, fill: '#657582', letterSpacing: 1.6 } });
  private pickLabel = new Text({ text: '0000', style: { fontFamily: 'Consolas, monospace', fontSize: 17, fill: '#7A6F62', letterSpacing: 2 } });
  private lastStage = '';
  private textures: Sprite[] = [];
  private readonly world = new Container();
  private readonly dial = new EventDial();
  /** Cropped stator nests behind the drive cassette and loom side frame. */
  private readonly dialBody = new Container();
  private readonly dialFront = new Container();

  constructor(private readonly onBeat: (e: ToolEvent) => void = () => {}) {
    super();
    const sheet = sheetBase();
    const base = loomPlate();
    this.world.scale.set(MOUNT.scale);
    this.textile.warp.alpha = 1;
    this.world.position.set(MOUNT.x, MOUNT.y);
    const dialView = { scale: 0.90, cx: 20 + .90 * DIAL.cx, cy: -30 + .90 * DIAL.cy };
    const dtx = dialView.cx - dialView.scale * DIAL.cx;
    const dty = dialView.cy - dialView.scale * DIAL.cy;
    for (const wrap of [this.dialBody, this.dialFront]) {
      wrap.scale.set(dialView.scale);
      wrap.position.set(dtx, dty);
    }
    this.dialBody.addChild(this.dial.body);
    this.dialFront.addChild(this.dial.front);

    // drive cluster pulled 60 px left of the loom frame, so it reads as a separate block
    this.wheel.position.set(161, 660); this.gearA.position.set(161, 509); this.gearB.position.set(221, 509);
    this.shaftMark.position.set(293, 530);
    this.shaftMark.circle(0, 0, 4).fill(0x2c3340);
    this.shaftMark.moveTo(0, 0).lineTo(9, 0).stroke({ color: 0x2c3340, width: 2 });
    this.shaftMark.circle(0, 0, 1.4).fill(0xd9d3c2);
    this.shafts.forEach((shaft, i) => shaft.position.set(307, LoomScene.SHAFT_Y[i]));
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
    this.race = race;
    this.stageLabel.position.set(1020, 900); this.pickLabel.position.set(1178, 852);
    // Warp first, then the frames, then the cloth: the bolt is woven in front of
    // the warp and behind the beater, so it hides the heddles as it rises.
    this.world.addChild(base, this.textile.warp, ...this.shafts, this.clothMask, this.textile.cloth, belt, this.wheel, this.gearA, this.gearB, this.linkage, this.shaftMark, this.reed, this.weft, this.shuttle, this.textile.front, race, this.needle, this.conduit.view, this.glow, this.stageLabel, this.pickLabel);
    this.textile.cloth.mask = this.clothMask;
    this.addChild(sheet, this.dialBody, this.world, this.dialFront);
    this.textures = [sheet, base, belt, race, this.wheel, this.gearA, this.gearB, this.reed, this.shuttle];
    this.conduit.onArrive = (color) => { this.glowColor = color; this.glowT = 1; };
    this.mechanism.onPick = e => { this.textile.commit(e.type); this.onBeat(e); this.pickLabel.text = String(this.mechanism.picks).padStart(4, '0'); };
    this.pose();
  }

  setStatus(_s: EngineStatus) { /* Counters stay in the quiet React transport. */ }
  trigger(e: ToolEvent, opts: TriggerOptions = {}) {
    // The dial always sees the call (its own `×N`/slot rules decide the readout);
    // the mechanism may fold it into the pick in flight under saturation.
    this.mechanism.push(e, opts);
    this.dial.pushEvent(e);
    this.dial.setQueue(this.mechanism.queue.length);
    // ...and every call, folded or woven, sends its light down the conduit.
    this.conduit.fire(Number.parseInt(toolColor(e.type).slice(1), 16));
  }
  setRunning(_on: boolean) { /* The event queue powers the shaft. */ }
  setReducedMotion(on: boolean) { this.dial.setReducedMotion(on); }
  setStopped() { this.mechanism.stop(); this.pose(); }
  get telemetry() { return this.mechanism.snapshot(); }
  /** Fixed-readout instrument state (also exposed through LoomMode.telemetry). */
  get dialState() { return this.dial.telemetry(); }
  /** Cloth progress, exposed for QA/acceptance (rows woven vs the bolt's capacity). */
  get clothState() { return { rows: this.textile.rowsWoven, rowsFull: this.textile.rowsFull, progress: this.textile.progress, draftRow: this.textile.draftRow }; }
  update(dt: number, _running: boolean) {
    this.mechanism.update(dt);
    this.dial.update(dt);
    this.conduit.update(dt);
    this.glowT = Math.max(0, this.glowT - dt / 0.55);
    this.pose();
  }


  private pose() {
    const m = this.mechanism;
    this.dial.setQueue(m.queue.length);
    // Needles/Lift: the draft selects a group of ends; only those frames rise.
    const row = m.picks % DRAFT.rows.length;
    const lifted = m.active ? DRAFT.rows[row] : [];
    const lifts = [0, 0, 0, 0];
    for (const shaft of lifted) lifts[shaft] = m.shed;
    this.shafts.forEach((frame, i) => { frame.y = LoomScene.SHAFT_Y[i] - lifts[i] * LoomScene.SHAFT_LIFT; });

    // Cloth: every pick lays one row at the fell. During take-up the edge slides
    // the last few pixels instead of snapping, so growth reads as weaving.
    const rows = m.active && m.committed ? m.picks - 1 + m.takeup : m.picks;
    const h = Math.max(0, Math.min(CLOTH.bottom - CLOTH.top, rows * CLOTH.rowH));
    const fell = CLOTH.bottom - h;
    this.clothMask.clear().rect(WEAVE.x, fell, WEAVE.w, h).fill(0xffffff);

    // The whole weaving head rides the fell: on an empty loom it sits right on
    // the take-up beam, and by the last row it has climbed to the top beam.
    const head = fell - WEAVE.fell;
    this.reed.y = 606 + head + m.beat * 29;
    this.race.y = 651 + head;
    this.shuttle.x = 366 + m.travel * 809;
    this.shuttle.y = 675 + head - Math.sin(m.travel * Math.PI) * 2;
    this.textile.front.y = 652 + head;
    this.wheel.rotation = m.angle; this.gearA.rotation = m.angle * 3; this.gearB.rotation = -m.angle * 4.5 + Math.PI / 16;
    this.shaftMark.rotation = m.angle * 3;
    this.textile.update(m.shed, m.direction, lifts);
    const g = this.linkage; g.clear();
    const rod = (x: number, y: number, ex: number, ey: number, w = 6) => {
      g.moveTo(x + .5, y + .7).lineTo(ex + .5, ey + .7).stroke({ color: 0x7A6F62, alpha: .04, width: w + .5 });
      g.moveTo(x, y).lineTo(ex, ey).stroke({ color: F.edge, width: w });
      g.moveTo(x - .8, y - 1).lineTo(ex - .8, ey - 1).stroke({ color: F.enamel, width: w - 1.3 });
      for (const [a, b] of [[x, y], [ex, ey]]) { g.circle(a, b, w + 1).fill(F.enamel).stroke({ color: F.muted, width: .6 }); g.circle(a, b, 2.2).fill(0x667486); }
    };
    // Three explicitly servo-driven slider cranks. The decorative transmission
    // on the left no longer pretends to drive these independently commanded axes.
    for (const [base, target] of [[419, this.shafts[0].y + 18], [531, this.shafts[2].y + 18], [649, this.reed.y + 43]]) {
      g.roundRect(1223, base + 51, 38, 38, 5).fill(F.enamel).stroke({color:0x7D8996,width:1});
      g.circle(1242, base + 70, 16).fill(F.steel).stroke({color:F.muted,width:.8});
      // The beater travels far enough to leave the crank's reach; when that
      // happens the rod is honestly absent and only the crank follows the target.
      let k: ReturnType<typeof solveLinkage> | null = null;
      try { k = solveLinkage({ x: 1242, y: base + 70 }, { x: 1202, y: target }); } catch { k = null; }
      if (k) {
        rod(k.center.x, k.center.y, k.pin.x, k.pin.y, 4);
        rod(k.pin.x, k.pin.y, k.slider.x, k.slider.y, 4);
      } else {
        const a = Math.atan2(target - (base + 70), 1202 - 1242);
        g.moveTo(1242, base + 70).lineTo(1242 + Math.cos(a) * 24, base + 70 + Math.sin(a) * 24)
          .stroke({ color: F.edge, width: 5 }).circle(1242 + Math.cos(a) * 24, base + 70 + Math.sin(a) * 24, 2.4).fill(F.muted);
      }
    }
    this.weft.clear();
    if (m.active && m.phase >= .24 && m.phase < .84) {
      const edge = m.direction > 0 ? WEAVE.x : WEAVE.x + WEAVE.w;
      this.weft.moveTo(edge, 683 + head).lineTo(this.shuttle.x, 678 + head).stroke({ color: Number.parseInt(toolColor(m.active.type).slice(1), 16), width: 1.4 });
    }
    const a = -1.15 + m.shed * .55 + m.beat * .2;
    this.needle.clear().moveTo(186, 392).lineTo(186 + Math.cos(a) * 22, 392 + Math.sin(a) * 22).stroke({ color: 0x7A6F62, width: 1.5 }).circle(186, 392, 2.5).fill(0x7A6F62);

    // Light arriving at the drive: a short glow on the gears, never a speed change.
    this.glow.clear();
    if (this.glowT > 0) {
      const k = this.glowT;
      for (const [x, y, r] of [[161, 660, 106], [161, 509, 41], [221, 509, 28]] as const) {
        this.glow.circle(x, y, r).fill({ color: this.glowColor, alpha: 0.10 * k })
          .stroke({ color: this.glowColor, width: 2.4, alpha: 0.42 * k });
      }
    }
    if (this.lastStage !== m.stage) { this.stageLabel.text = m.stage; this.lastStage = m.stage; }
  }

  override destroy() {
    this.dial.destroy();
    this.conduit.destroy();
    this.textile.destroy();
    for (const sprite of this.textures) sprite.texture.destroy(true);
    super.destroy({ children: true });
  }
}
