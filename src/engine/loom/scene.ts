import { Container, Graphics, Sprite, Text, TilingSprite, Texture } from 'pixi.js';
import { FABRIC, LOOM } from '../layout';
import { FONT, T } from '../theme';
import { Spring } from '../anim/spring';
import type { ToolEvent, ToolName } from '../events/types';
import { Backdrop } from './backdrop';
import { Frame } from './frame';
import { Bobbins } from './bobbins';
import { WarpField } from './warpField';
import { Heddle, Reed, Shuttle } from './heddleReed';
import { Drive } from './drive';
import { Instruments, Console } from './instruments';
import { Particles } from './particles';
import { Extras } from './extras';
import { Shadows } from './shadows';
import { DraftPanel } from './draft';

export class LoomScene extends Container {
  private backdrop = new Backdrop();
  private frame = new Frame();
  private bobbins = new Bobbins();
  private warp = new WarpField();
  private heddle = new Heddle();
  private reed = new Reed();
  private shuttle = new Shuttle();
  private drive = new Drive();
  private instruments = new Instruments();
  private console = new Console();
  private particles = new Particles();
  private extras = new Extras();
  private shadows = new Shadows();
  private draft = new DraftPanel();
  private grain!: TilingSprite;
  private paperGlow!: Sprite;
  private annotation = new Container();
  private vignette = new Graphics();

  private rpm = new Spring(4, { stiffness: 26, damping: 9 });
  private beat = new Spring(0, { stiffness: 90, damping: 10 });
  private shuttleP = new Spring(0, { stiffness: 34, damping: 8 });
  private tension = new Spring(0.32, { stiffness: 60, damping: 11 });
  private density = new Spring(0.18, { stiffness: 40, damping: 12 });
  private crank = 0;
  private t = 0;
  private rows = 0;
  private rpmValue = 4;

  constructor() {
    super();
    const wf = this.warp.display;
    for (const s of wf) {
      s.x = FABRIC.x; s.y = FABRIC.y;
      s.width = FABRIC.w; s.height = FABRIC.h;
    }
    this.addChild(this.vignette);
    this.addChild(this.backdrop, this.shadows, this.frame, this.extras, this.bobbins, ...wf, this.heddle, this.reed, this.shuttle, this.drive, this.instruments, this.console, this.draft, this.particles, this.annotation);
    this.buildPaperGlow();
    this.buildGrain();
    this.buildAnnotations();
    this.buildVignette();
    this.layoutFabricShadow();
  }

  private layoutFabricShadow(): void {
    const g = new Graphics();
    g.rect(FABRIC.x - 3, FABRIC.y - 2, FABRIC.w + 6, FABRIC.h + 6).stroke({ width: 0.5, color: T.navy, alpha: 0.14 });
    // inner shadow edges
    g.moveTo(FABRIC.x, FABRIC.y).lineTo(FABRIC.x, FABRIC.y + FABRIC.h).stroke({ width: 2.2, color: T.navy, alpha: 0.035 });
    g.moveTo(FABRIC.x + FABRIC.w, FABRIC.y).lineTo(FABRIC.x + FABRIC.w, FABRIC.y + FABRIC.h).stroke({ width: 2.2, color: T.navy, alpha: 0.035 });
    this.addChildAt(g, this.getChildIndex(this.warp.display[0]));
  }

  private buildVignette(): void {
    const g = this.vignette;
    for (let i = 0; i < 4; i++) {
      const a = 0.012 - i * 0.002;
      g.rect(SHEETLIKE.x + i * 8, SHEETLIKE.y + i * 8, SHEETLIKE.w - i * 16, SHEETLIKE.h - i * 16).stroke({ width: 8, color: T.navy, alpha: a });
    }
  }

  private buildPaperGlow(): void {
    const c = document.createElement('canvas');
    c.width = 736; c.height = 504;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(400, 300, 40, 400, 300, 520);
    g.addColorStop(0, 'rgba(255,253,248,0.9)');
    g.addColorStop(0.55, 'rgba(251,247,240,0.45)');
    g.addColorStop(1, 'rgba(232,222,206,0.35)');
    x.fillStyle = g;
    x.fillRect(0, 0, 736, 504);
    this.paperGlow = new Sprite(Texture.from(c));
    this.paperGlow.width = 1472; this.paperGlow.height = 1008;
    this.addChildAt(this.paperGlow, 0);
  }

  private buildGrain(): void {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d')!;
    const img = x.createImageData(128, 128);
    let seed = 11;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = 120 + (seed / 2147483647) * 120;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 10 + (seed % 14);
    }
    x.putImageData(img, 0, 0);
    this.grain = new TilingSprite({ texture: Texture.from(c), width: 1412, height: 956 });
    this.grain.x = 30; this.grain.y = 26;
    this.grain.alpha = 0.07;
    this.grain.blendMode = 'overlay';
    this.addChild(this.grain);
  }

  private buildAnnotations(): void {
    const mk = (txt: string, x: number, y: number, size = 7.2, alpha = 0.5) => {
      const t = new Text({ text: txt, style: { fontFamily: FONT.mono, fontSize: size, fill: T.navy, letterSpacing: 1.5 } });
      t.position.set(x, y); t.alpha = alpha; this.annotation.addChild(t);
    };
    mk('WARP FIELD  ·  106 ENDS  ·  WEFT / PIRN  ·  EVENT SYNC', FABRIC.x, LOOM.bottomBeam + 78);
    
    const g = new Graphics();
    g.moveTo(FABRIC.x, 916).lineTo(FABRIC.x + FABRIC.w, 916).stroke({ width: 0.4, color: T.navy, alpha: 0.2 });
    this.annotation.addChild(g);
  }

  setStatus(s: import('../events/types').EngineStatus): void {
    this.instruments.setStatus(s);
  }

  trigger(e: ToolEvent): void {
    const type = e.type;
    this.rows += 1;
    if (type === 'Bash') {
      this.beat.impulse(2.2);
      this.rpm.impulse(26);
      this.tension.impulse(1.6);
      this.warp.trigger(type, this.rows);
      this.particles.burst(FABRIC.x + FABRIC.w * 0.5, LOOM.reedY + 6, 1.2, T.teal);
      this.particles.ring(FABRIC.x + FABRIC.w * 0.5, LOOM.reedY + 6, T.teal, 40);
      this.shuttleP.target = this.shuttleP.target > 0.5 ? 0 : 1;
    } else if (type === 'Write') {
      this.beat.impulse(1.1);
      this.rpm.impulse(14);
      this.tension.impulse(1.1);
      this.warp.trigger(type, this.rows);
      this.particles.burst(FABRIC.x + FABRIC.w * 0.7, LOOM.raceY, 0.7, T.teal);
    } else if (type === 'Edit') {
      this.beat.impulse(0.9);
      this.rpm.impulse(10);
      this.tension.impulse(0.8);
      this.warp.trigger(type, this.rows);
      this.shuttleP.target = this.shuttleP.target > 0.5 ? 0 : 1;
    } else if (type === 'Read') {
      this.rpm.impulse(5);
      this.warp.trigger(type, this.rows);
    } else {
      this.rpm.impulse(7);
      this.tension.impulse(0.5);
      this.warp.trigger(type, this.rows);
      this.particles.ring(FABRIC.x + FABRIC.w * 0.5, LOOM.reedY - 40, T.sage, 26);
    }
    this.density.target = Math.min(1, this.density.target + 0.22);
    if (type !== 'Read') this.draft.addEvent();
  }

  setRunning(on: boolean): void {
    this.rpm.target = on ? 26 : 4;
    this.tension.target = on ? 0.55 : 0.3;
  }

  setStopped(): void {
    this.rpm.target = 0;
    this.tension.target = 0.1;
    this.density.target = 0.1;
  }

  update(dt: number, running: boolean): void {
    this.t += dt;
    this.rpm.step(dt);
    this.beat.step(dt);
    this.shuttleP.step(dt);
    this.tension.step(dt);
    this.density.step(dt);
    this.rpmValue = Math.max(0, this.rpm.value);
    const rpmNorm = Math.min(1, this.rpmValue / 70);
    this.crank += (this.rpmValue / 60) * Math.PI * 2 * dt * 0.55;

    // cam-driven heddle shafts (opposite phase)
    const camA = Math.sin(this.crank * 0.55) * (2.4 + rpmNorm * 3.6);
    const camB = Math.sin(this.crank * 0.55 + Math.PI) * (2.4 + rpmNorm * 3.6);
    const vibe = Math.sin(this.t * 22) * rpmNorm * 0.25;
    this.heddle.setOffsets(camA + vibe, camB - vibe);
    this.heddle.drawRods(DRIVE_CAM_Y, { a: Math.sign(camA), b: Math.sign(camB) });

    // sley + beat
    const sleyDx = Math.sin(this.crank) * (2.5 + rpmNorm * 3.5);
    this.reed.setSley(sleyDx, this.beat.value);
    this.shuttle.setPose(FABRIC.x + 18 + this.shuttleP.value * (FABRIC.w - 36), FABRIC.x + 18, running);

    // drive train
    this.drive.update(dt, this.crank, this.rpmValue, FABRIC.x - 10 + sleyDx, LOOM.reedY - this.beat.value * 9 + 22);

    // warp/cloth
    this.warp.setShafts(camA, camB);
    this.warp.update(dt, rpmNorm);

    // instruments
    this.instruments.update(dt, this.rpmValue, this.t);
    this.instruments.setGaugeValue(0, rpmNorm, String(Math.round(this.rpmValue)));
    this.instruments.setGaugeValue(1, this.tension.value, (this.tension.value * 100).toFixed(0));
    this.instruments.setGaugeValue(2, this.density.value, (this.density.value * 100).toFixed(0));
    this.console.setTension(this.tension.value);
    this.console.update(dt);

    this.backdrop.setDriveAngle(this.crank / (Math.PI * 2));
    this.bobbins.update(dt, rpmNorm);
    this.particles.update(dt);
    this.draft.update(dt);

    // natural decay
    this.density.target = Math.max(0.12, this.density.target - dt * 0.08);
    this.rpm.target = Math.max(running ? 24 : 4, this.rpm.target - dt * 6);
  }
}

const SHEETLIKE = { x: 30, y: 26, w: 1412, h: 956 };
const DRIVE_CAM_Y = 556;

