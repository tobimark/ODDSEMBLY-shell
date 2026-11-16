/** The Chips table: baked material layers plus live counters, gauge, banner and ticket. */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FONT, TOOL_TINTS } from '../../theme';
import { Spring, clamp, easeOutBack, easeOutCubic, smoothstep } from '../../core/spring';
import { LAYOUT } from './layout';
import {
  bellSprite, chipsBackdrop, chipTraySprite, chipTexture, discardSprite, printerSprite,
  scoreBoard, shoeSprite, sponsorSprite, tableSurface,
} from './art';
import type { DrawSpec, HandResult } from './cards';
import type { ToolName } from '../../core/types';

export interface ChipsViewState {
  handNo: number;
  handInAnte: number;
  ante: number;
  score: number;
  chips: number;
  mult: number;
  deckLeft: number;
  queued: number;
  quota: number;
  stage: string;
  handCount: number;
  heat: number;
  sponsorLevel: number;
  /** 0..1 live quota progress */
  gauge: number;
  /** chips gathered by the current hand (or the settled gain) */
  pot: number;
}

interface Particle { sprite: Sprite; t: number; delay: number; fromX: number; fromY: number; toX: number; toY: number; arc: number }

const num = (n: number): string => Math.round(n).toLocaleString('en-US');

export class TableView extends Container {
  private readonly scoreText: Text;
  private readonly handText: Text;
  private readonly chipsText: Text;
  private readonly multText: Text;
  private readonly quotaText: Text;
  private readonly stageText: Text;
  private readonly anteText: Text;
  private readonly deckText: Text;
  private readonly queueText: Text;
  private readonly potText: Text;
  private readonly sponsorPips: Graphics;
  private readonly ticketLines: Text[] = [];
  private readonly ticketBar: Graphics;
  private readonly dots: Graphics;
  private readonly heatGfx: Graphics;
  private readonly gauge: Graphics;
  private readonly stacks: Container;
  private readonly combo: Container;
  private readonly comboTitle: Text;
  private readonly comboMath: Text;
  private readonly comboStrip: Graphics;
  private readonly sponsorStamp: Container;
  private readonly sponsorText: Text;
  private readonly peek: Container;
  private readonly bell: Sprite;
  private readonly particles: Particle[] = [];

  private readonly dispScore = new Spring(0, { stiffness: 55, damping: 14 });
  private readonly dispChips = new Spring(0, { stiffness: 60, damping: 14 });
  private readonly dispMult = new Spring(1, { stiffness: 70, damping: 12 });
  private readonly dispGauge = new Spring(0, { stiffness: 50, damping: 14 });
  private dispHand = 0;
  private comboIn = -1;
  private comboOut = -1;
  private ticketT = -1;
  private bellT = -1;
  private heatFlash = 0;
  private peekT = 0;
  private lastChipsDrawn = -1;
  private lastDeck = -1;
  private lastHandCount = -1;
  private lastHeat = -1;
  private state: ChipsViewState | null = null;

  constructor() {
    super();
    this.addChild(chipsBackdrop());
    const table = tableSurface();
    table.position.set(LAYOUT.table.x, LAYOUT.table.y);
    this.addChild(table);
    const board = scoreBoard();
    board.position.set(LAYOUT.board.x, LAYOUT.board.y);
    this.addChild(board);
    const shoe = shoeSprite(); shoe.position.set(LAYOUT.shoe.x, LAYOUT.shoe.y); this.addChild(shoe);
    const discard = discardSprite(); discard.position.set(LAYOUT.discard.x, LAYOUT.discard.y); this.addChild(discard);
    const sponsor = sponsorSprite(); sponsor.position.set(LAYOUT.sponsor.x, LAYOUT.sponsor.y); this.addChild(sponsor);
    const printer = printerSprite(); printer.position.set(LAYOUT.printer.x, LAYOUT.printer.y); this.addChild(printer);
    const tray = chipTraySprite(); tray.position.set(LAYOUT.chips.x, LAYOUT.chips.y); this.addChild(tray);
    this.bell = bellSprite(); this.bell.position.set(1096, 806); this.addChild(this.bell);

    const bx = LAYOUT.board.x; const by = LAYOUT.board.y;
    const mkText = (text: string, size: number, color: string, align: 'left' | 'right' | 'center' = 'right', family = FONT.display): Text => {
      const t = new Text({ text, style: { fontFamily: family, fontSize: size, fill: color, letterSpacing: 0.5 } });
      t.anchor.set(align === 'right' ? 1 : align === 'center' ? 0.5 : 0, 0.5);
      return t;
    };
    this.handText = mkText('01', 27, '#171C60', 'center'); this.handText.position.set(bx + 76, by + 100); this.addChild(this.handText);
    this.scoreText = mkText('0', 27, '#171C60', 'right'); this.scoreText.position.set(bx + 382, by + 100); this.addChild(this.scoreText);
    this.chipsText = mkText('0', 19, '#1F8F92', 'right'); this.chipsText.position.set(bx + 494, by + 102); this.addChild(this.chipsText);
    this.multText = mkText('×1.00', 19, '#171C60', 'right'); this.multText.position.set(bx + 590, by + 102); this.addChild(this.multText);
    this.quotaText = mkText('QUOTA 640', 6.5, '#837C6A', 'right', FONT.mono); this.quotaText.position.set(bx + 596, by + 174); this.addChild(this.quotaText);

    this.anteText = mkText('ANTE 01 · HAND 1/3', 8, '#6F6A5B', 'left', FONT.mono);
    this.anteText.position.set(LAYOUT.quota.x, LAYOUT.quota.y - 12); this.addChild(this.anteText);
    this.stageText = mkText('IDLE', 7, '#9A937F', 'right', FONT.mono);
    this.stageText.position.set(LAYOUT.quota.x + LAYOUT.quota.w, LAYOUT.quota.y - 12); this.addChild(this.stageText);

    this.deckText = mkText('45', 8, '#F6E9CB', 'right', FONT.mono);
    this.deckText.position.set(LAYOUT.shoe.x + LAYOUT.shoe.w - 26, LAYOUT.shoe.y + LAYOUT.shoe.h - 26); this.addChild(this.deckText);
    this.queueText = mkText('QUEUED 0', 6.5, '#9A937F', 'center', FONT.mono);
    this.queueText.position.set(LAYOUT.shoe.x + LAYOUT.shoe.w / 2, LAYOUT.shoe.y + LAYOUT.shoe.h + 14); this.addChild(this.queueText);
    this.potText = mkText('0', 13, '#171C60', 'center');
    this.potText.position.set(LAYOUT.table.x + LAYOUT.table.w / 2, LAYOUT.table.y + 418); this.addChild(this.potText);
    this.sponsorPips = new Graphics(); this.addChild(this.sponsorPips);

    this.dots = new Graphics(); this.addChild(this.dots);
    this.heatGfx = new Graphics(); this.addChild(this.heatGfx);
    this.gauge = new Graphics(); this.addChild(this.gauge);
    this.stacks = new Container(); this.addChild(this.stacks);
    const heatLabel = new Text({ text: 'HEAT', style: { fontFamily: FONT.mono, fontSize: 5.6, fill: '#9a937f', letterSpacing: 1.2 } });
    heatLabel.anchor.set(1, 0.5); heatLabel.position.set(1002, 884); this.addChild(heatLabel);

    // combo banner
    this.combo = new Container();
    this.comboStrip = new Graphics();
    this.comboTitle = new Text({ text: '', style: { fontFamily: FONT.display, fontSize: 27, fontWeight: '600', fill: '#171C60', letterSpacing: 4 } });
    this.comboTitle.anchor.set(0.5);
    this.comboTitle.position.set(0, -8);
    this.comboMath = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 9.5, fill: '#6F6A5B', letterSpacing: 1.8 } });
    this.comboMath.anchor.set(0.5);
    this.comboMath.position.set(0, 22);
    this.combo.addChild(this.comboStrip, this.comboTitle, this.comboMath);
    this.combo.position.set(LAYOUT.combo.x, 392);
    this.combo.visible = false;
    this.addChild(this.combo);

    // sponsor stamp
    this.sponsorStamp = new Container();
    const stampBg = new Graphics();
    stampBg.roundRect(-92, -20, 184, 40, 4).fill({ color: 0x171c60, alpha: 0.08 }).stroke({ color: 0x171c60, width: 1.4, alpha: 0.75 });
    this.sponsorText = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 9, fill: '#171C60', letterSpacing: 1.6 } });
    this.sponsorText.anchor.set(0.5);
    this.sponsorStamp.addChild(stampBg, this.sponsorText);
    this.sponsorStamp.position.set(LAYOUT.sponsor.x + LAYOUT.sponsor.w / 2, LAYOUT.sponsor.y + 150);
    this.sponsorStamp.rotation = -0.08;
    this.sponsorStamp.visible = false;
    this.addChild(this.sponsorStamp);

    this.peek = new Container();
    this.peek.position.set(LAYOUT.shoe.x + LAYOUT.shoe.w + 10, LAYOUT.shoe.y + 10);
    this.peek.visible = false;
    this.addChild(this.peek);

    // printed ticket lines over the printer paper (dynamic)
    for (let i = 0; i < 4; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: i === 0 ? 9 : 7.2, fill: i === 0 ? '#171C60' : '#6F6A5B', letterSpacing: i === 0 ? 1.4 : 0.4 } });
      t.position.set(LAYOUT.printer.x + 22, LAYOUT.printer.y + 132 + i * 20);
      this.ticketLines.push(t);
      this.addChild(t);
    }
    this.ticketBar = new Graphics();
    this.addChild(this.ticketBar);
  }

  setState(s: ChipsViewState): void {
    this.state = s;
    this.dispScore.target = s.score;
    this.dispChips.target = s.chips;
    this.dispMult.target = s.mult;
    this.dispGauge.target = clamp(s.gauge, 0, 1);
    if (s.handNo !== this.dispHand) { this.dispHand = s.handNo; this.handText.text = String(s.handNo).padStart(2, '0'); }
    this.handText.text = String(s.handNo).padStart(2, '0');
    this.quotaText.text = `QUOTA ${num(s.quota)}`;
    this.anteText.text = `ANTE ${String(s.ante).padStart(2, '0')} · HAND ${s.handInAnte}/3`;
    this.stageText.text = s.stage.toUpperCase();
    this.queueText.text = `QUEUED ${String(s.queued).padStart(2, '0')}`;
    if (s.deckLeft !== this.lastDeck) { this.lastDeck = s.deckLeft; this.deckText.text = String(s.deckLeft); }
    if (s.handCount !== this.lastHandCount) { this.lastHandCount = s.handCount; this.drawDots(s.handCount); }
    if (s.heat !== this.lastHeat) { this.lastHeat = s.heat; this.drawHeat(s.heat); }
    this.potText.text = num(s.pot);
    this.drawSponsorPips(s.sponsorLevel);
    this.sponsorStamp.visible = s.sponsorLevel > 0;
    if (s.sponsorLevel > 0) this.sponsorText.text = `ANTE ${String(s.sponsorLevel).padStart(2, '0')} CLEARED`;
    this.drawStacks(s.chips);
    this.drawGauge();
  }

  private drawDots(count: number): void {
    const g = this.dots;
    g.clear();
    for (let i = 0; i < 5; i++) {
      const x = LAYOUT.board.x + 54 + i * 22;
      const y = LAYOUT.board.y + 157;
      const filled = i < count;
      g.circle(x, y, 6.2).fill(filled ? 0x33c6c6 : 0xeee7d7).stroke({ color: filled ? 0x1f8f92 : 0xa79e88, width: 0.9 });
      g.circle(x, y, filled ? 2.6 : 2.2).fill(filled ? 0xffffff : 0xc9c2ae);
    }
  }

  private drawHeat(count: number): void {
    const g = this.heatGfx;
    g.clear();
    const x0 = 1012; const y = 884;
    labelLines(g);
    for (let i = 0; i < 3; i++) {
      const on = i < count;
      g.circle(x0 + i * 20, y, 5.4).fill(on ? (count >= 3 ? 0xc75a4a : 0xe0a34c) : 0xeee7d7).stroke({ color: 0xa79e88, width: 0.8 });
    }
    if (count >= 3 && this.heatFlash > 0) {
      g.circle(x0 + 20, y, 14).stroke({ color: 0xc75a4a, width: 1.4, alpha: this.heatFlash });
    }
  }

  private drawGauge(): void {
    const g = this.gauge;
    g.clear();
    const x = LAYOUT.quota.x; const y = LAYOUT.quota.y + 10; const w = LAYOUT.quota.w; const h = 12;
    g.roundRect(x - 2, y - 2, w + 4, h + 4, 4).fill(0xf3ecdd).stroke({ color: 0xb3a992, width: 0.8 });
    g.roundRect(x, y, w, h, 3).fill(0xe5ddca);
    const k = clamp(this.dispGauge.value, 0, 1);
    if (k > 0.001) g.roundRect(x, y, w * k, h, 3).fill(k >= 1 ? 0x1f8f92 : 0x33cbcc);
    for (let i = 0; i <= 10; i++) g.moveTo(x + (w * i) / 10, y).lineTo(x + (w * i) / 10, y + (i % 5 === 0 ? h : h * 0.5)).stroke({ color: 0x9a937f, width: 0.5, alpha: 0.5 });
    g.moveTo(x + w, y - 5).lineTo(x + w, y + h + 5).stroke({ color: 0x171c60, width: 1.4 });
  }

  private drawSponsorPips(level: number): void {
    const g = this.sponsorPips;
    g.clear();
    for (let i = 0; i < 4; i++) {
      const x = LAYOUT.sponsor.x + 22 + i * 13;
      const y = LAYOUT.sponsor.y + 236;
      const on = i < level;
      g.circle(x, y, 3.8).fill(on ? 0x2a9e5e : 0xefe8d8).stroke({ color: on ? 0x1d7a45 : 0xa79e88, width: 0.7 });
    }
  }

  private drawStacks(chips: number): void {
    if (chips === this.lastChipsDrawn) return;
    this.lastChipsDrawn = chips;
    this.stacks.removeChildren().forEach((c) => c.destroy());
    const wells = [[LAYOUT.chips.x + 50, LAYOUT.chips.y + 100], [LAYOUT.chips.x + 128, LAYOUT.chips.y + 100], [LAYOUT.chips.x + 206, LAYOUT.chips.y + 100]] as const;
    const counts = [Math.min(6, Math.floor(chips / 10)), Math.min(6, Math.floor(chips / 100)), Math.min(6, Math.floor(chips / 1000))];
    const kinds: ('navy' | 'teal' | 'brass')[] = ['navy', 'teal', 'brass'];
    wells.forEach(([x, y], wi) => {
      const n = counts[wi];
      for (let i = 0; i < n; i++) {
        const s = new Sprite(chipTexture(kinds[wi]));
        s.anchor.set(0.5);
        s.position.set(x + i * 0.6, y - i * 5.2);
        s.width = 40; s.height = 40;
        this.stacks.addChild(s);
      }
    });
  }

  /** combo reveal */
  showCombo(result: HandResult, totalMult: number): void {
    this.comboTitle.text = result.label;
    this.comboMath.text = `CHIPS ${num(result.handChips)}   ×   MULT ${(totalMult).toFixed(2)}`;
    this.combo.visible = true;
    this.comboIn = 0;
    this.comboOut = -1;
    this.comboStrip.clear();
    this.comboStrip.roundRect(-220, -40, 440, 80, 7).fill({ color: 0xfcf8ee, alpha: 0.97 }).stroke({ color: 0xb3a992, width: 1 });
    this.comboStrip.roundRect(-213, -33, 426, 66, 4).stroke({ color: 0x171c60, width: 0.6, alpha: 0.32 });
    for (const [x, y] of [[-220, -40], [220, -40], [-220, 40], [220, 40]] as const) this.comboStrip.circle(x, y, 2.2).fill(0xb28d5e);
    this.comboStrip.moveTo(-60, -28).lineTo(60, -28).stroke({ color: 0x9a937f, width: 0.6, alpha: 0.5 });
  }

  hideCombo(): void { if (this.combo.visible) this.comboOut = 0; }

  /** print the settlement ticket */
  printTicket(result: HandResult, state: ChipsViewState, gained: number): void {
    this.ticketLines[0].text = `${result.label}  +${num(gained)}`;
    this.ticketLines[1].text = `CHIPS ${num(result.handChips)} × MULT ${(result.totalMult * state.mult).toFixed(2)}`;
    this.ticketLines[2].text = `SCORE ${num(state.score)}   CHIPS ${num(state.chips)}`;
    this.ticketLines[3].text = `ANTE ${String(state.ante).padStart(2, '0')} · HAND ${state.handInAnte}/3 · ${state.deckLeft} IN DECK`;
    this.ticketT = 0;
    this.ticketBar.clear();
    for (let i = 0; i < 26; i++) {
      const w = i % 3 === 0 ? 2 : 1;
      this.ticketBar.rect(LAYOUT.printer.x + 30 + i * 5.6, LAYOUT.printer.y + 218, w, 12).fill(0x171c60);
    }
  }

  ringBell(): void { this.bellT = 0; }

  /** chips cascade from the pot to the score box */
  payoutPulse(): void {
    for (let i = 0; i < 12; i++) {
      const sprite = new Sprite(chipTexture((['teal', 'brass', 'navy'] as const)[i % 3]));
      sprite.anchor.set(0.5); sprite.width = 18; sprite.height = 18;
      const px = LAYOUT.table.x + LAYOUT.table.w / 2 + (i % 5) * 5 - 10;
      const py = LAYOUT.table.y + 470;
      sprite.position.set(px, py);
      this.addChild(sprite);
      this.particles.push({
        sprite, t: -i * 0.035, delay: 0,
        fromX: px, fromY: py,
        toX: LAYOUT.board.x + 360 + (i % 5) * 8, toY: LAYOUT.board.y + 100,
        arc: 70 + (i % 4) * 24,
      });
    }
  }

  flashHeat(): void { this.heatFlash = 1; }

  setPeek(specs: DrawSpec[]): void {
    this.peek.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.peek.visible = specs.length > 0;
    const families: ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'];
    specs.forEach((spec, i) => {
      const c = new Graphics();
      const fam = families[(spec.rank + i) % families.length];
      const tint = TOOL_TINTS[fam];
      c.roundRect(0, 0, 46, 64, 5).fill(0xfdfbf4).stroke({ color: 0xa79e88, width: 0.9 });
      c.roundRect(3, 3, 40, 13, 3).fill({ color: tint.base, alpha: 0.24 });
      c.roundRect(3, 20, 40, 40, 3).stroke({ color: 0xc9c1ae, width: 0.6 });
      this.peek.addChild(c);
      const rank = new Text({ text: String(spec.rank), style: { fontFamily: 'Georgia, serif', fontSize: 18, fill: tint.deep } });
      rank.anchor.set(0.5); rank.position.set(23, 40);
      const cap = new Text({ text: 'PEEK', style: { fontFamily: FONT.mono, fontSize: 4.6, fill: '#9a937f', letterSpacing: 0.8 } });
      cap.anchor.set(0.5); cap.position.set(23, 57);
      this.peek.addChild(rank, cap);
      c.position.set(i * 52, 0);
      c.rotation = i * 0.04;
    });
    const note = new Text({ text: 'NEXT DRAW', style: { fontFamily: FONT.mono, fontSize: 5.6, fill: '#9a937f', letterSpacing: 1 } });
    note.position.set(0, 70);
    this.peek.addChild(note);
    this.peekT = 4.0;
  }

  update(dt: number): void {
    this.dispScore.step(dt);
    this.dispChips.step(dt);
    this.dispMult.step(dt);
    this.dispGauge.step(dt);
    this.scoreText.text = num(this.dispScore.value);
    this.chipsText.text = num(this.dispChips.value);
    this.multText.text = `×${this.dispMult.value.toFixed(2)}`;
    this.drawGauge();

    if (this.heatFlash > 0) { this.heatFlash = Math.max(0, this.heatFlash - dt * 1.4); this.drawHeat(this.lastHeat); }
    if (this.comboIn >= 0) {
      this.comboIn += dt;
      const k = clamp(this.comboIn / 0.32, 0, 1);
      this.combo.alpha = Math.min(1, k * 1.4);
      this.combo.scale.set(0.86 + 0.14 * easeOutBack(k, 2.2));
      this.combo.y = 392 - Math.sin(k * Math.PI) * 6;
      if (k >= 1) this.comboIn = -1;
    }
    if (this.comboOut >= 0) {
      this.comboOut += dt;
      const k = clamp(this.comboOut / 0.28, 0, 1);
      this.combo.alpha = 1 - k;
      this.combo.scale.set(1 - k * 0.05);
      if (k >= 1) { this.comboOut = -1; this.combo.visible = false; this.combo.alpha = 0; }
    }
    if (this.ticketT >= 0) {
      this.ticketT += dt;
      const k = clamp(this.ticketT / 0.5, 0, 1);
      const offset = (1 - easeOutCubic(k)) * -18;
      for (const line of this.ticketLines) line.y = LAYOUT.printer.y + 132 + this.ticketLines.indexOf(line) * 20 + offset;
      this.ticketBar.y = offset;
    }
    if (this.bellT >= 0) {
      this.bellT += dt;
      const k = clamp(this.bellT / 0.6, 0, 1);
      this.bell.rotation = Math.sin(k * Math.PI * 6) * 0.12 * (1 - k);
      this.bell.scale.set(1 + Math.sin(k * Math.PI) * 0.12);
      if (k >= 1) { this.bellT = -1; this.bell.rotation = 0; this.bell.scale.set(1); }
    }
    if (this.peekT > 0) {
      this.peekT -= dt;
      this.peek.alpha = clamp(this.peekT / 0.4, 0, 1);
      if (this.peekT <= 0) this.peek.visible = false;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = clamp(p.t / 0.62, 0, 1);
      const e = easeOutCubic(k);
      p.sprite.x = p.fromX + (p.toX - p.fromX) * e;
      p.sprite.y = p.fromY + (p.toY - p.fromY) * e - Math.sin(k * Math.PI) * p.arc;
      p.sprite.rotation += dt * 6;
      p.sprite.alpha = 1 - smoothstep(0.75, 1, k);
      if (k >= 1) { this.removeChild(p.sprite); p.sprite.destroy(); this.particles.splice(i, 1); }
    }
  }

  get currentState(): ChipsViewState | null { return this.state; }

  destroy(): void {
    super.destroy({ children: true });
  }
}

/** tiny helper to keep the heat label drawn in the dynamic layer (avoids baked drift) */
function labelLines(g: Graphics): void {
  g.moveTo(966, 881).lineTo(996, 881).stroke({ color: 0x9a937f, width: 0.7 });
}
