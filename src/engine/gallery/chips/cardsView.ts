/** One physical card: paper stock, live Pixi text, spring motion and flip. */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { CARD_STOCK, handSlot } from './layout';
import type { CardData } from './cards';
import { cardBackTexture, cardFrontTexture } from './art';
import { clamp, easeOutCubic, smoothstep } from '../../core/spring';
import { FONT, TOOL_TINTS } from '../../theme';

interface FlyAnim {
  t: number;
  dur: number;
  fromX: number; fromY: number; fromRot: number; fromScale: number;
  toX: number; toY: number; toRot: number; toScale: number;
  arc: number;
  onLand?: () => void;
}

const RANK_FONT = 'Georgia, "Times New Roman", serif';

export class CardView extends Container {
  readonly data: CardData;
  private readonly shadow: Sprite;
  private readonly back: Sprite;
  private readonly face: Container;
  private readonly glow: Graphics;
  private readonly pin: Graphics;
  private fly: FlyAnim | null = null;
  private flipT = -1;
  private flipDur = 0.2;
  private readonly baseScale = 1;
  private lift = 0;
  private liftTarget = 0;
  private liftVel = 0;
  private tiltTarget = 0;
  private tilt = 0;
  private sweep: { t: number; dur: number; delay: number; fromX: number; fromY: number; fromRot: number; toX: number; toY: number; toRot: number; onDone?: () => void } | null = null;
  private highlighted = false;
  private hovered = false;
  private pinned = false;
  private disposed = false;

  constructor(data: CardData, x: number, y: number, rot: number) {
    super();
    this.data = data;
    this.position.set(x, y);
    this.rotation = rot;

    this.shadow = new Sprite(cardBackTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x000000;
    this.shadow.alpha = 0.16;
    this.shadow.width = 118 * 1.04;
    this.shadow.height = 170 * 1.04;
    this.shadow.position.set(3, 7);

    this.back = new Sprite(cardBackTexture());
    this.back.anchor.set(0.5);
    this.back.width = 118;
    this.back.height = 170;

    this.face = new Container();
    const tint = TOOL_TINTS[data.family];
    const faceBase = new Sprite(cardFrontTexture(data.family));
    faceBase.anchor.set(0.5);
    faceBase.width = 118;
    faceBase.height = 170;
    this.face.addChild(faceBase);

    // oversized ghost rank watermark behind the medallion
    const watermark = new Text({
      text: String(data.rank),
      style: { fontFamily: RANK_FONT, fontSize: 108, fontWeight: '600', fill: tint.deep, letterSpacing: -4 },
    });
    watermark.anchor.set(0.5);
    watermark.position.set(0, 2);
    watermark.alpha = 0.06;
    this.face.addChildAt(watermark, 0);

    const rank = new Text({
      text: String(data.rank),
      style: { fontFamily: RANK_FONT, fontSize: 26, fontWeight: '500', fill: tint.deep, letterSpacing: -1 },
    });
    rank.anchor.set(0.5);
    rank.position.set(-33, -25);

    const detail = new Text({
      text: fitDetail(data.detailText ?? ''),
      style: { fontFamily: FONT.mono, fontSize: 6, fill: '#5E5A4C', lineHeight: 8.4, letterSpacing: 0.15, wordWrap: true, wordWrapWidth: 96, breakWords: true },
    });
    detail.anchor.set(0.5, 0);
    detail.position.set(0, 35);

    const idTag = new Text({
      text: `EV ${String(data.id).padStart(2, '0')}`,
      style: { fontFamily: FONT.mono, fontSize: 4.8, fill: '#A39C89', letterSpacing: 0.6 },
    });
    idTag.anchor.set(1, 0.5);
    idTag.position.set(50, 73);

    this.face.addChild(rank, detail, idTag);

    if (data.edition !== 'plain') {
      const badge = new Graphics();
      const color = data.edition === 'foil' ? 0xb28d5e : data.edition === 'holo' ? 0x33cbcc : 0x171c60;
      const colorText = data.edition === 'foil' ? '#B28D5E' : data.edition === 'holo' ? '#1F8F92' : '#171C60';
      badge.roundRect(-30, 56, 60, 11, 3).fill({ color, alpha: 0.18 }).stroke({ color, width: 0.6 });
      this.face.addChild(badge);
      const ed = new Text({
        text: data.edition.toUpperCase(),
        style: { fontFamily: FONT.mono, fontSize: 4.8, fill: colorText, letterSpacing: 1.6 },
      });
      ed.anchor.set(0.5);
      ed.position.set(0, 61.5);
      this.face.addChild(ed);
      // sheen strip
      const sheen = new Graphics();
      sheen.poly([-54, -40, -18, -80, 6, -80, -30, -40]).fill({ color: 0xffffff, alpha: data.edition === 'foil' ? 0.22 : 0.12 });
      this.face.addChild(sheen);
    }

    this.glow = new Graphics();
    this.glow.visible = false;
    this.pin = new Graphics();
    this.pin.visible = false;

    this.addChild(this.shadow, this.back, this.face, this.glow, this.pin);
    this.face.visible = false;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => { this.hovered = true; this.liftTarget = this.pinned ? 14 : 5; this.tiltTarget = -0.02; });
    this.on('pointerout', () => { this.hovered = false; this.liftTarget = this.pinned ? 14 : 0; this.tiltTarget = 0; });
    this.on('pointertap', () => {
      if (this.fly || this.sweep) return;
      this.pinned = !this.pinned;
      this.liftTarget = this.pinned ? 14 : this.hovered ? 5 : 0;
      this.redrawPin();
    });
  }

  /** slide from the shoe into a hand slot, flip face-up on landing */
  dealTo(slotIndex: number, delay = 0, onLand?: () => void): void {
    const slot = handSlot(slotIndex);
    this.fly = {
      t: -delay,
      dur: 0.44 + slotIndex * 0.02,
      fromX: this.x, fromY: this.y, fromRot: this.rotation, fromScale: 1.04,
      toX: slot.x, toY: slot.y, toRot: slot.rot, toScale: 1,
      arc: 46 + slotIndex * 6,
      onLand,
    };
    this.face.visible = false;
    this.back.visible = true;
    this.flipT = -1;
  }

  private startFlip(): void { this.flipT = 0; }

  highlight(on: boolean): void {
    this.highlighted = on;
    if (on) {
      this.liftTarget = 12;
      this.glow.visible = true;
    } else {
      this.glow.visible = false;
      this.liftTarget = this.pinned ? 14 : 0;
    }
  }

  sweepTo(x: number, y: number, rot: number, delay: number, onDone?: () => void): void {
    this.liftTarget = 0;
    this.sweep = { t: -delay, dur: 0.5, delay, fromX: this.x, fromY: this.y, fromRot: this.rotation, toX: x, toY: y, toRot: rot, onDone };
    this.alpha = 1;
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (this.fly) {
      this.fly.t += dt;
      const k = clamp(this.fly.t / this.fly.dur, 0, 1);
      const e = easeOutCubic(k);
      this.x = this.fly.fromX + (this.fly.toX - this.fly.fromX) * e;
      this.y = this.fly.fromY + (this.fly.toY - this.fly.fromY) * e - Math.sin(k * Math.PI) * this.fly.arc;
      this.rotation = this.fly.fromRot + (this.fly.toRot - this.fly.fromRot) * e;
      const s = this.fly.fromScale + (this.fly.toScale - this.fly.fromScale) * e;
      this.scale.set(s);
      this.shadow.alpha = 0.16 + Math.sin(k * Math.PI) * 0.1;
      if (k >= 1) {
        const cb = this.fly.onLand;
        this.fly = null;
        this.scale.set(1);
        this.startFlip();
        cb?.();
      }
    }
    if (this.flipT >= 0) {
      this.flipT += dt;
      const k = clamp(this.flipT / this.flipDur, 0, 1);
      const sx = Math.abs(Math.cos(k * Math.PI));
      this.scale.x = Math.max(0.02, sx);
      this.back.visible = k < 0.5;
      this.face.visible = k >= 0.5;
      if (k >= 1) { this.flipT = -1; this.scale.x = 1; }
    }
    if (this.sweep) {
      this.sweep.t += dt;
      const k = clamp(this.sweep.t / this.sweep.dur, 0, 1);
      if (k > 0) {
        const e = easeOutCubic(k);
        this.x = this.sweep.fromX + (this.sweep.toX - this.sweep.fromX) * e;
        this.y = this.sweep.fromY + (this.sweep.toY - this.sweep.fromY) * e - Math.sin(k * Math.PI) * 20;
        this.rotation = this.sweep.fromRot + (this.sweep.toRot - this.sweep.fromRot) * e;
        this.alpha = 1 - smoothstep(0.55, 1, k) * 0.85;
        this.scale.set(1 - smoothstep(0.5, 1, k) * 0.16);
      }
      if (k >= 1) {
        const cb = this.sweep.onDone;
        this.sweep = null;
        cb?.();
      }
    }
    // lift + tilt springs (semi-implicit, cheap)
    const kSpring = 180; const kDamp = 20;
    this.liftVel += (-kSpring * (this.lift - this.liftTarget) - kDamp * this.liftVel) * Math.min(dt, 1 / 60);
    this.lift += this.liftVel * Math.min(dt, 1 / 60);
    this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * 10);
    if (!this.sweep) {
      this.y += 0; // lift is applied to face child so the shadow can stay on the table
      this.face.y = -this.lift;
      this.glow.y = -this.lift;
      this.rotation += this.tilt * 0.15;
      this.shadow.alpha = 0.16 + this.lift * 0.004;
    }
    if (this.highlighted) this.redrawGlow();
  }

  private redrawGlow(): void {
    const g = this.glow;
    g.clear();
    g.roundRect(-62, -89, 124, 178, 11).stroke({ color: 0x33cbcc, width: 1.6, alpha: 0.85 });
    g.roundRect(-58, -85, 116, 170, 9).stroke({ color: 0x33cbcc, width: 0.7, alpha: 0.35 });
  }

  private redrawPin(): void {
    const g = this.pin;
    g.clear();
    g.visible = this.pinned;
    if (!this.pinned) return;
    g.circle(-52, 76, 7).fill({ color: 0x33cbcc, alpha: 0.9 }).stroke({ color: 0x1f8f92, width: 1 });
    g.moveTo(-52, 71).lineTo(-52, 81).stroke({ color: 0x0c3a3b, width: 1 });
    g.circle(-47, 72, 2).stroke({ color: 0x0c3a3b, width: 0.8 });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    super.destroy({ children: true });
  }
}

const EFFECT_LABEL: Record<string, string> = {
  Read: 'PEEK · 预读',
  Edit: 'MULT +0.25',
  Write: 'CHIPS +34',
  Bash: 'CHIPS +48',
  Search: 'WILD · 万能',
};

function fitDetail(text: string): string {
  const clean = text.replace(/\\/g, '/').replace(/\s+/g, ' ').trim();
  return clean.length > 40 ? clean.slice(0, 39) + '…' : clean;
}
