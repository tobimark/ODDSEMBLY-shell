/** Live Westworld plant: dial needle, tank levels, valve wheels, piston, pulses, steam. */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FONT } from '../../theme';
import { Spring, clamp, easeOutCubic } from '../../core/spring';
import {
  backdrop, counterArt, cylinderArt, dialFaceArt, flywheelArt, heatGaugeArt,
  namePlateArt, plantPlate, printerArt, pipesLayer, reliefValveArt, relayPanelArt,
  sponsorArt, tankArt, valveWheelArt,
} from './art';
import { DIAL, PLANT, SIDE, PIPE_PATHS, pressureAngle } from './layout';
import type { MachineSnapshot, ReleaseRecord } from './machine';
import { FAMILY_SPEC } from './machine';
import type { ToolName } from '../../core/types';

interface Pulse { path: number; t: number; speed: number; family: ToolName }
interface Steam { g: Graphics; x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }
interface Crop { w: number; h: number; r: number; h2: number; radius: number; color: string }

const TANK_GEOM = PLANT.tanks.map((t) => ({ ...t, spec: FAMILY_SPEC[t.family] }));

export class PlantView extends Container {
  private readonly needles = new Graphics();
  private readonly hub = new Graphics();
  private readonly liquids: Graphics[] = [];
  private readonly wheelSprites: Sprite[] = [];
  private readonly wheelRot: number[] = [0, 0, 0, 0, 0];
  private readonly wheelVel: number[] = [0, 0, 0, 0, 0];
  private readonly lamps = new Graphics();
  private readonly pulsesG = new Graphics();
  private readonly steamG = new Graphics();
  private readonly rodG = new Graphics();
  private readonly flywheel: Sprite;
  private readonly cylinder: Sprite;
  private readonly crankDot = new Graphics();
  private readonly heatNeedle = new Graphics();
  private readonly scannerG = new Graphics();
  private readonly reliever: Sprite;
  private readonly ticketLines: Text[] = [];
  private readonly sponsorPips = new Graphics();
  private readonly dialCounters: Text[] = [];
  private readonly sideCounters: Text[] = [];

  private needleSpring = new Spring(0, { stiffness: 48, damping: 12 });
  private heatSpring = new Spring(0, { stiffness: 60, damping: 14 });
  private reliefSpring = new Spring(0, { stiffness: 120, damping: 14 });
  private driveSpring = new Spring(0, { stiffness: 30, damping: 10 });
  private pulses: Pulse[] = [];
  private steam: Steam[] = [];
  private lastTick = 0;
  private purgeFlash = 0;
  private releaseFlash = 0;
  private scanAngle = 0;
  private primed = false;
  private tankDrawn = TANK_GEOM.map(() => -1);
  private lampVals: number[] = [0, 0, 0, 0, 0];
  private snapshot: MachineSnapshot | null = null;
  private ticketTimer = -1;
  private ticket: ReleaseRecord | null = null;

  constructor() {
    super();
    this.addChild(backdrop());
    const dial = dialFaceArt();
    dial.position.set(DIAL.cx, DIAL.cy);
    dial.anchor.set(0.5);
    this.addChild(dial);

    const plateSprite = plantPlate();
    plateSprite.position.set(PLANT.x, PLANT.y);
    this.addChild(plateSprite);

    this.addChild(pipesLayer());

    // tanks: liquid first, then the glass artwork on top
    for (const t of TANK_GEOM) {
      const liquid = new Graphics();
      this.addChild(liquid);
      this.liquids.push(liquid);
      this.tankDrawn.push(-1);
      const art = tankArt(t.family, t.r, t.h);
      art.anchor.set(0.5, 0);
      art.position.set(t.cx, t.base - 24 - t.h);
      this.addChild(art);
    }

    // valves
    PLANT.valves.forEach((v, i) => {
      const wheel = valveWheelArt(v.family, PLANT.valveR);
      wheel.position.set(v.x, PLANT.valveY);
      wheel.anchor.set(0.5);
      this.addChild(wheel);
      this.wheelSprites.push(wheel);
      // stem
      const stem = new Graphics();
      stem.rect(0, PLANT.manifoldY + 4, 3, PLANT.valveY - PLANT.manifoldY - 14).fill(0x8e9a90);
      stem.x = v.x - 1.5;
      this.addChild(stem);
    });

    // combustion assembly
    this.flywheel = flywheelArt(30);
    this.flywheel.anchor.set(0.5);
    this.flywheel.position.set(PLANT.piston.crankX, PLANT.piston.crankY);
    this.addChild(this.flywheel);
    this.cylinder = cylinderArt(PLANT.piston.cylinderX1 - PLANT.piston.cylinderX0, 40);
    this.cylinder.anchor.set(0.5);
    this.cylinder.position.set((PLANT.piston.cylinderX0 + PLANT.piston.cylinderX1) / 2, PLANT.piston.y);
    this.addChild(this.cylinder);
    this.addChild(this.rodG);
    this.addChild(this.crankDot);

    // relief valve + relay + heat gauge
    this.reliever = reliefValveArt();
    this.reliever.anchor.set(0.5);
    this.reliever.position.set(PLANT.relief.x, PLANT.relief.y);
    this.addChild(this.reliever);
    const relay = relayPanelArt();
    relay.position.set(PLANT.relay.x, PLANT.relay.y);
    this.addChild(relay);
    this.addChild(this.scannerG);
    const heat = heatGaugeArt(PLANT.heatGauge.r);
    heat.anchor.set(0.5);
    heat.position.set(PLANT.heatGauge.cx, PLANT.heatGauge.cy);
    this.addChild(heat);
    this.addChild(this.heatNeedle);

    // dial needle + hub above face
    this.addChild(this.needles);
    this.addChild(this.hub);
    this.hub.circle(0, 0, 24).fill(0xc7a878).stroke({ color: 0x7e5e35, width: 1 });
    this.hub.circle(0, 0, 15).fill(0xe9d5ab).stroke({ color: 0x8a6a3f, width: 0.8 });
    this.hub.circle(0, 0, 5).fill(0x171c60);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.hub.circle(Math.cos(a) * 19, Math.sin(a) * 19, 2).fill(0x8a6a3f);
    }
    this.hub.position.set(DIAL.cx, DIAL.cy);

    // right column
    const sponsor = sponsorArt(); sponsor.position.set(SIDE.sponsor.x, SIDE.sponsor.y); this.addChild(sponsor);
    const printer = printerArt(); printer.position.set(SIDE.printer.x, SIDE.printer.y); this.addChild(printer);
    const counter = counterArt(); counter.position.set(SIDE.counter.x, SIDE.counter.y); this.addChild(counter);
    const plate2 = namePlateArt(); plate2.position.set(SIDE.plate.x, SIDE.plate.y); this.addChild(plate2);
    this.addChild(this.sponsorPips);

    // ticket text over the printer paper (title + five tool lines + footer)
    for (let i = 0; i < 7; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: i === 0 ? 8 : i === 6 ? 5.4 : 6.4, fill: i === 0 ? '#171C60' : '#6F6A5B', letterSpacing: i === 0 ? 1.2 : 0.3 } });
      t.position.set(SIDE.printer.x + 26, SIDE.printer.y + 100 + i * 15);
      this.ticketLines.push(t);
      this.addChild(t);
    }
    for (let i = 0; i < 2; i++) {
      const t = new Text({ text: '000', style: { fontFamily: FONT.display, fontSize: 17, fill: '#D9BD8C', letterSpacing: 2 } });
      t.anchor.set(0.5);
      const wx = i === 0 ? DIAL.cx - 176 : DIAL.cx + 28;
      t.position.set(wx + 74, DIAL.cy + 216);
      this.dialCounters.push(t);
      this.addChild(t);
    }
    for (let i = 0; i < 3; i++) {
      const t = new Text({ text: '000', style: { fontFamily: FONT.display, fontSize: 15, fill: '#D9BD8C', letterSpacing: 1.2 } });
      t.anchor.set(0.5);
      t.position.set(SIDE.counter.x + 46 + i * 72, SIDE.counter.y + 87);
      this.sideCounters.push(t);
      this.addChild(t);
    }
    this.addChild(this.lamps);
    this.addChild(this.pulsesG);
    this.addChild(this.steamG);
  }

  /* ------------------------------------------------------------------ state */

  setSnapshot(s: MachineSnapshot): void {
    this.snapshot = s;
    if (!this.primed) {
      this.needleSpring.value = pressureAngle(s.pressure);
      this.heatSpring.value = s.heat;
      this.driveSpring.value = s.drive;
      this.primed = true;
    }
    this.needleSpring.target = pressureAngle(s.pressure);
    this.heatSpring.target = s.heat;
    this.driveSpring.target = s.drive;
    for (let i = 0; i < 5; i++) {
      const f = PLANT.valves[i].family;
      this.lampVals[i] = Math.max(this.lampVals[i], s.valves[f]);
    }
    this.dialCounters[0].text = String(s.releases).padStart(3, '0');
    this.dialCounters[1].text = String(s.charge).padStart(3, '0');
    this.sideCounters[0].text = String(s.charge).padStart(3, '0');
    this.sideCounters[1].text = String(s.releases).padStart(3, '0');
    this.sideCounters[2].text = String(s.purges).padStart(3, '0');
    this.drawSponsorPips(s.releases >= 1 ? Math.min(4, s.releases) : 0);
    this.drawTanks(s);
    this.drawLamps();
  }

  private drawSponsorPips(level: number): void {
    this.sponsorPips.clear();
    for (let i = 0; i < 4; i++) {
      const x = SIDE.sponsor.x + 20 + i * 13;
      const y = SIDE.sponsor.y + 208;
      const on = i < level;
      this.sponsorPips.circle(x, y, 3.4).fill(on ? 0x2a9e5e : 0xefe8d8).stroke({ color: on ? 0x1d7a45 : 0xa79e88, width: 0.7 });
    }
  }

  private drawTanks(s: MachineSnapshot): void {
    TANK_GEOM.forEach((t, i) => {
      const level = s.levels[t.id as 'intake' | 'regulator' | 'reservoir'] ?? 0;
      if (Math.abs(this.tankDrawn[i] - level) < 0.004) return;
      this.tankDrawn[i] = level;
      const g = this.liquids[i];
      g.clear();
      const x = t.cx - t.r + 5;
      const w = t.r * 2 - 10;
      const hMax = t.h - 16;
      const h = Math.max(3, hMax * clamp(level, 0, 1));
      const y = t.base - 8 - h;
      const tints: Record<string, string> = { intake: '#425679', regulator: '#171C60', reservoir: '#1F8F92' };
      const base = tints[t.id] ?? '#425679';
      g.roundRect(x, y, w, h, 4).fill({ color: base, alpha: 0.5 });
      g.rect(x, y, w, Math.min(10, h)).fill({ color: 0xffffff, alpha: 0.25 });
      g.rect(x + 4, y + 2, 2, Math.max(2, h - 4)).fill({ color: 0xffffff, alpha: 0.32 });
      // bubbles
      for (let b = 0; b < 3; b++) {
        const bx = x + 8 + ((b * 37 + i * 13) % Math.max(1, w - 16));
        const by = y + 8 + ((b * 53 + i * 29) % Math.max(1, h - 12));
        g.circle(bx, by, 1.6).fill({ color: 0xffffff, alpha: 0.4 });
      }
    });
  }

  private drawLamps(): void {
    const g = this.lamps;
    g.clear();
    for (let i = 0; i < 5; i++) {
      const x = PLANT.valves[i].x;
      const y = PLANT.valveY;
      const v = clamp(this.lampVals[i], 0, 1);
      const hex = parseInt(FAMILY_SPEC[PLANT.valves[i].family].tint.slice(1), 16);
      if (v > 0.02) {
        g.circle(x, y, PLANT.valveR + 10).fill({ color: hex, alpha: 0.10 * v });
        g.circle(x, y, PLANT.valveR + 5).fill({ color: hex, alpha: 0.16 * v });
      }
      g.circle(x, y, PLANT.valveR + 3.5).stroke({ color: v > 0.08 ? hex : 0xa79e88, width: 1, alpha: v > 0.08 ? 0.85 : 0.45 });
      g.circle(x, y, 2.6).fill({ color: v > 0.05 ? hex : 0xefe8d8 });
    }
  }

  /* ------------------------------------------------------------------- fx */

  actuate(family: ToolName, index: number): void {
    const paths = PIPE_PATHS.map((p, i) => ({ p, i })).filter(({ p }) => p.family === family);
    const pick = paths[index % Math.max(1, paths.length)];
    if (pick) this.pulses.push({ path: pick.i, t: 0, speed: 0.85, family });
    // valve kick
    const vi = PLANT.valves.findIndex((v) => v.family === family);
    if (vi >= 0) { this.wheelVel[vi] += 10; this.lampVals[vi] = 1; }
    if (family === 'Bash') {
      this.steam.push(this.makeSteam(PLANT.piston.cylinderX1 - 10, PLANT.piston.y - 18, 0.6));
      this.releaseFlash = Math.max(this.releaseFlash, 0.35);
    }
  }

  release(ticket: ReleaseRecord | null): void {
    this.reliefSpring.value = 0;
    this.reliefSpring.target = 1;
    this.releaseFlash = 1;
    this.ticket = ticket;
    this.ticketTimer = 0;
    if (ticket) this.fillTicket(ticket);
    for (let i = 0; i < 14; i++) {
      this.steam.push(this.makeSteam(PLANT.relief.x + (i % 2 ? 8 : -8), PLANT.relief.y - 40, 1));
    }
  }

  purge(): void {
    this.purgeFlash = 1;
    for (let i = 0; i < 26; i++) {
      this.steam.push(this.makeSteam(PLANT.relief.x + ((i * 37) % 60) - 30, 120 + ((i * 23) % 30), 1.2));
    }
  }

  private makeSteam(x: number, y: number, strength: number): Steam {
    const g = new Graphics();
    const r = 6 + (0.6 + strength * 0.8) * 8;
    g.circle(0, 0, r).fill({ color: 0xf6f4ec, alpha: 0.5 });
    g.position.set(x, y);
    this.steamG.addChild(g);
    const max = 0.9 + strength * 0.5;
    return { g, x, y, vx: ((this.steam.length * 17) % 30 - 15) * 0.5, vy: -40 - strength * 26, life: 0, max, r };
  }

  /* ----------------------------------------------------------------- update */

  update(dt: number): void {
    const s = this.snapshot;
    if (!s) return;
    this.needleSpring.step(dt);
    this.heatSpring.step(dt);
    this.reliefSpring.step(dt);
    this.driveSpring.step(dt);

    // dial needle
    const ang = this.needleSpring.value;
    const g = this.needles;
    g.clear();
    const nx = Math.cos(ang); const ny = Math.sin(ang);
    const tx = Math.cos(ang + Math.PI / 2); const ty = Math.sin(ang + Math.PI / 2);
    g.moveTo(DIAL.cx + nx * 22, DIAL.cy + ny * 22);
    g.lineTo(DIAL.cx + nx * (DIAL.needle - 10) + tx * 3.4, DIAL.cy + ny * (DIAL.needle - 10) + ty * 3.4);
    g.lineTo(DIAL.cx + nx * DIAL.needle + tx * 0.6, DIAL.cy + ny * DIAL.needle + ty * 0.6);
    g.lineTo(DIAL.cx + nx * (DIAL.needle - 10) - tx * 3.4, DIAL.cy + ny * (DIAL.needle - 10) - ty * 3.4);
    g.closePath().fill(0x171c60).stroke({ color: 0x0c1036, width: 0.8 });
    // counterweight + red tip
    g.circle(DIAL.cx - nx * 34, DIAL.cy - ny * 34, 7).fill(0xb08a5b).stroke({ color: 0x7e5e35, width: 1 });
    g.circle(DIAL.cx + nx * DIAL.needle, DIAL.cy + ny * DIAL.needle, 3.2).fill(0xa6513f);

    // heat needle
    const hg = this.heatNeedle;
    hg.clear();
    const hc = PLANT.heatGauge;
    const ha = Math.PI * 0.75 + clamp(this.heatSpring.value, 0, 1) * Math.PI * 1.2;
    hg.moveTo(hc.cx + Math.cos(ha) * 6, hc.cy + Math.sin(ha) * 6);
    hg.lineTo(hc.cx + Math.cos(ha) * (hc.r - 8), hc.cy + Math.sin(ha) * (hc.r - 8));
    hg.stroke({ color: 0xa6513f, width: 2 });

    // valves
    for (let i = 0; i < this.wheelSprites.length; i++) {
      const target = s.valves[PLANT.valves[i].family] * 2.4;
      const k = Math.min(1, dt * 8);
      this.wheelRot[i] += (target - this.wheelRot[i]) * k;
      this.wheelSprites[i].rotation = this.wheelRot[i] + this.wheelVel[i] * 0.08;
      this.wheelVel[i] *= Math.max(0, 1 - dt * 5);
    }

    // lamps fade
    for (let i = 0; i < 5; i++) this.lampVals[i] = Math.max(0, this.lampVals[i] - dt * 1.4);
    this.drawLamps();

    // flywheel + slider crank (fixed rod length, joint solved geometrically)
    const theta = this.driveSpring.value;
    this.flywheel.rotation = theta;
    const c = PLANT.piston;
    const pinX = c.crankX + Math.cos(theta) * c.crankR;
    const pinY = c.crankY + Math.sin(theta) * c.crankR;
    const dx = c.crankR * Math.sin(theta);
    const root = Math.sqrt(Math.max(0, c.rod * c.rod - dx * dx));
    const sliderX = c.crankX + Math.cos(theta) * c.crankR + root;
    const rg = this.rodG;
    rg.clear();
    rg.moveTo(pinX, pinY).lineTo(sliderX, c.y).stroke({ color: 0x8e9a90, width: 5 });
    rg.moveTo(pinX, pinY).lineTo(sliderX, c.y).stroke({ color: 0xc9cfc9, width: 2 });
    rg.circle(pinX, pinY, 3.2).fill(0x171c60);
    rg.rect(sliderX - 5, c.y - 9, 10, 18).fill(0xb08a5b).stroke({ color: 0x7e5e35, width: 0.8 });
    this.crankDot.clear();
    this.crankDot.circle(pinX, pinY, 3.4).fill(0x171c60);
    this.crankDot.circle(sliderX, c.y, 2.4).fill(0x171c60);

    // relief valve lift
    this.reliever.y = PLANT.relief.y - this.reliefSpring.value * 7;
    if (this.reliefSpring.value > 0.05) this.reliefSpring.target = 0;

    // steam
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const st = this.steam[i];
      st.life += dt;
      const k = st.life / st.max;
      if (k >= 1) { this.steamG.removeChild(st.g); st.g.destroy(); this.steam.splice(i, 1); continue; }
      st.g.x += st.vx * dt;
      st.g.y += st.vy * dt;
      st.g.alpha = (1 - k) * 0.55;
      st.g.scale.set(0.7 + k * 1.5);
    }

    // pulses along the pipe network
    const pg = this.pulsesG;
    pg.clear();
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt * p.speed;
      const path = PIPE_PATHS[p.path];
      if (!path || p.t >= 1) { this.pulses.splice(i, 1); continue; }
      const pos = pointOnPolyline(path.pts, p.t);
      const hex = parseInt(FAMILY_SPEC[p.family].tint.slice(1), 16);
      pg.circle(pos[0], pos[1], 6).fill({ color: hex, alpha: 0.14 });
      pg.circle(pos[0], pos[1], 3).fill({ color: hex, alpha: 0.95 });
    }

    // scanner beam (deterministic: driven by accumulated scan angle, not wall clock)
    this.scannerG.clear();
    const scan = s.scan;
    this.scanAngle += dt * (2.2 + scan * 9);
    if (scan > 0.02) {
      const cxp = PLANT.relay.x + 42; const cyp = PLANT.relay.y + 74;
      const a = this.scanAngle;
      this.scannerG.moveTo(cxp, cyp).lineTo(cxp + Math.cos(a) * 70, cyp + Math.sin(a) * 70).stroke({ color: 0x33cbcc, width: 1.2, alpha: 0.5 * scan });
      this.scannerG.circle(cxp, cyp, 5 + scan * 3).stroke({ color: 0x33cbcc, width: 1, alpha: 0.6 * scan });
    }

    // purge / release flash
    if (this.purgeFlash > 0) this.purgeFlash = Math.max(0, this.purgeFlash - dt * 0.7);
    if (this.releaseFlash > 0) this.releaseFlash = Math.max(0, this.releaseFlash - dt * 1.2);
    this.alpha = 1;

    // ticket feed
    if (this.ticketTimer >= 0) {
      this.ticketTimer += dt;
      const k = clamp(this.ticketTimer / 0.5, 0, 1);
      const off = (1 - easeOutCubic(k)) * -14;
      for (let i = 0; i < this.ticketLines.length; i++) this.ticketLines[i].y = SIDE.printer.y + 100 + i * 15 + off;
      if (k >= 1) this.ticketTimer = -1;
    }
    this.lastTick = dt;
  }

  showTicket(record: ReleaseRecord): void {
    this.ticket = record;
    this.ticketTimer = 0;
    this.fillTicket(record);
    for (const line of this.ticketLines) line.alpha = 1;
  }

  private fillTicket(record: ReleaseRecord): void {
    this.ticketLines[0].text = `RELEASE ${String(record.index).padStart(2, '0')}  OK`;
    record.families.forEach((f, i) => {
      if (i + 1 < this.ticketLines.length - 1) this.ticketLines[i + 1].text = `${String(i + 1).padStart(2, '0')}  ${FAMILY_SPEC[f].label}`;
    });
    this.ticketLines[this.ticketLines.length - 1].text = 'PRESSURE RELIEVED · KH-03';
  }

  destroy(): void {
    super.destroy({ children: true });
  }
}

function pointOnPolyline(pts: Array<[number, number]>, t: number): [number, number] {
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); total += d;
  }
  let target = clamp(t, 0, 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? target / segs[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    target -= segs[i];
  }
  return pts[0];
}
