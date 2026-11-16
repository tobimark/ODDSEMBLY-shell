import { Container } from 'pixi.js';
import { MODE_META, type ModeContext, type ModeRuntime, type VisualMode } from '../../core/mode';
import type { EngineState, ModeHud, ToolEvent, ToolName } from '../../core/types';
import { clamp } from '../../core/spring';
import { ChipsAudio } from './audio';
import {
  evaluateHand, handQuota, projectedChips, RankDeck,
  type CardData, type HandResult,
} from './cards';
import { CardView } from './cardsView';
import { LAYOUT } from './layout';
import { TableView, type ChipsViewState } from './table';

const SEED = 0x02_5eed;
const SAMPLES: Record<ToolName, string> = {
  Read: 'manual · src/engine/core/engine.ts · 262 lines',
  Edit: 'manual · src/engine/modes/chips/table.ts · 44 - 61',
  Write: 'manual · public/replay/chips-session.json · +64 lines',
  Bash: 'manual · npm run build · exit 0 · 3.4 s',
  Search: 'manual · grep "mult" src · 14 matches',
};

type Stage = 'idle' | 'dealing' | 'holding' | 'resolve' | 'sweep';

/**
 * Chips — the second catalogue world.
 *
 * One real agent tool call = one dealt card. Five cards make a hand; the tool mix
 * decides the card families, the seeded deck decides ranks. Combos set the
 * multiplier, the quota decides whether the ante is held. Everything is a pure
 * function of the event stream + seed, so the deterministic replay is exact.
 */
export class ChipsMode implements VisualMode {
  readonly meta = MODE_META.chips;
  readonly root = new Container();

  private ctx: ModeContext | null = null;
  private table = new TableView();
  private audio: ChipsAudio | null = null;
  private deck: RankDeck = new RankDeck(SEED);
  private cards: CardView[] = [];
  private hand: CardData[] = [];
  private queue: ToolEvent[] = [];

  private stage: Stage = 'idle';
  private stageT = 0;
  private dealing = false;

  private handNo = 1;
  private handInAnte = 1;
  private ante = 1;
  private score = 0;
  private globalMult = 1;
  private quota = handQuota(1, 1);
  private heat = 0;
  private sponsorLevel = 0;
  private lastResult: HandResult | null = null;
  private lastGained = 0;
  private resolvedHands = 0;
  private successHands = 0;
  private missHands = 0;
  private lastStageLabel = 'IDLE';
  private hudT = 0;
  private hudCache: ModeHud = {
    transport: 'LIVE TABLE',
    stage: 'IDLE',
    fields: [
      { label: 'SCORE', value: '0' },
      { label: 'CHIPS', value: '0' },
      { label: 'MULT', value: '×1.00' },
      { label: 'ANTE', value: '01 · 1/3' },
    ],
    caption: '等待事件 · 每一次调用，发一张牌',
    hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
  };

  /* --------------------------------------------------------------- lifecycle */

  mount(ctx: ModeContext): Container {
    this.ctx = ctx;
    this.audio = new ChipsAudio(ctx.audio);
    this.build();
    return this.root;
  }

  private build(): void {
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.table = new TableView();
    this.root.addChild(this.table);
    this.deck = new RankDeck(SEED);
    this.cards = [];
    this.hand = [];
    this.queue = [];
    this.stage = 'idle';
    this.stageT = 0;
    this.dealing = false;
    this.handNo = 1;
    this.handInAnte = 1;
    this.ante = 1;
    this.score = 0;
    this.globalMult = 1;
    this.quota = handQuota(1, 1);
    this.heat = 0;
    this.sponsorLevel = 0;
    this.lastResult = null;
    this.lastGained = 0;
    this.resolvedHands = 0;
    this.successHands = 0;
    this.missHands = 0;
    this.refreshHud();
    this.table.setState(this.viewState());
  }

  enter(): void { this.refreshHud(); }
  exit(): void { this.ctx?.audio.whir(0); }

  setState(state: EngineState): void {
    if (state === 'stopped') {
      this.queue = [];
      this.dealing = false;
      if (this.stage === 'dealing') this.stage = 'idle';
    }
  }

  /* --------------------------------------------------------------- transport */

  update(dt: number, rt: ModeRuntime): void {
    if (rt.state === 'paused') return;
    this.table.update(dt);
    for (const card of this.cards) card.update(dt);

    switch (this.stage) {
      case 'holding':
        this.stageT += dt;
        if (this.stageT > 0.24) this.resolveHand();
        break;
      case 'resolve':
        this.stageT += dt;
        if (this.stageT > 2.05) this.startSweep();
        break;
      case 'sweep':
        this.stageT += dt;
        if (this.stageT > 0.95) this.finishSweep();
        break;
      case 'idle':
        if (this.queue.length > 0 && !this.dealing) this.startDeal(this.queue.shift()!);
        break;
      default:
        break;
    }
    this.hudT += dt;
    if (this.hudT > 0.12) { this.hudT = 0; this.refreshHud(); }
    this.table.setState(this.viewState());
  }

  trigger(e: ToolEvent): void {
    this.queue.push(e);
    if (this.stage === 'idle' && !this.dealing) this.startDeal(this.queue.shift()!);
    this.refreshHud();
  }

  private startDeal(event: ToolEvent): void {
    if (!this.audio) return;
    this.stage = 'dealing';
    this.dealing = true;
    this.stageT = 0;
    const data = this.deck.draw(event.type, event.id, event.detail);
    const card = new CardView(data, LAYOUT.shoe.x + 66, LAYOUT.shoe.y + 34, -0.42);
    this.cards.push(card);
    this.root.addChild(card);
    const slot = this.hand.length;
    card.dealTo(slot, 0, () => this.onCardLanded(data, event));
  }

  private onCardLanded(data: CardData, event: ToolEvent): void {
    this.hand.push(data);
    this.dealing = false;
    this.heat = this.hand.filter((c) => c.family === 'Bash').length;
    this.audio?.deal(data);
    if (event.type === 'Read' || event.type === 'Search') {
      this.table.setPeek(this.deck.peek(event.type === 'Read' ? 2 : 1));
    }
    this.table.setState(this.viewState());
    if (this.hand.length >= 5) {
      this.stage = 'holding';
      this.stageT = 0;
    } else {
      this.stage = 'idle';
      if (this.queue.length > 0) this.startDeal(this.queue.shift()!);
    }
  }

  private resolveHand(): void {
    const result = evaluateHand(this.hand);
    const appliedMult = this.globalMult;
    const gained = Math.round(result.score * appliedMult);
    this.lastResult = result;
    this.lastGained = gained;
    this.score += gained;
    this.resolvedHands += 1;
    const success = gained >= this.quota;
    if (success) {
      this.successHands += 1;
      this.globalMult = Math.min(4, Math.round((this.globalMult + 0.25) * 100) / 100);
      this.audio?.cash();
      this.table.ringBell();
      this.table.payoutPulse();
    } else {
      this.missHands += 1;
      this.globalMult = 1;
    }
    for (let i = 0; i < this.cards.length; i++) this.cards[i].highlight(result.scoring.includes(i));
    this.table.showCombo(result, result.totalMult * appliedMult);
    this.audio?.combo(result);
    this.audio?.tally(result);
    this.audio?.print();
    this.table.printTicket(result, { ...this.viewState(), score: this.score, mult: appliedMult }, gained);
    if (result.overheat) this.table.flashHeat();
    this.stage = 'resolve';
    this.stageT = 0;
    this.refreshHud();
  }

  private startSweep(): void {
    this.stage = 'sweep';
    this.stageT = 0;
    this.table.hideCombo();
    const tx = LAYOUT.discard.x + 71;
    const ty = LAYOUT.discard.y + 128;
    this.cards.forEach((card, i) => {
      card.sweepTo(tx, ty, 0.42, i * 0.055);
    });
  }

  private finishSweep(): void {
    for (const card of this.cards) {
      this.root.removeChild(card);
      card.destroy();
    }
    this.cards = [];
    this.hand = [];
    this.heat = 0;
    this.handNo += 1;
    this.handInAnte += 1;
    if (this.handInAnte > 3) {
      this.handInAnte = 1;
      this.ante += 1;
      this.sponsorLevel += 1;
    }
    this.quota = handQuota(this.ante, this.handInAnte);
    this.stage = 'idle';
    this.stageT = 0;
    this.table.setState(this.viewState());
    this.refreshHud();
    if (this.queue.length > 0) this.startDeal(this.queue.shift()!);
  }

  /* ------------------------------------------------------------------ view */

  private viewState(): ChipsViewState {
    const projected = this.stage === 'resolve' ? this.lastGained : projectedChips(this.hand);
    return {
      handNo: this.handNo,
      handInAnte: this.handInAnte,
      ante: this.ante,
      score: this.score,
      chips: Math.floor(this.score / 10),
      mult: this.globalMult,
      deckLeft: this.deck.remaining,
      queued: this.queue.length,
      quota: this.quota,
      stage: this.stageLabel(),
      handCount: this.hand.length,
      heat: this.heat,
      sponsorLevel: this.sponsorLevel,
      gauge: this.quota > 0 ? clamp(projected / this.quota, 0, 1) : 0,
      pot: this.stage === 'resolve' ? (this.lastResult?.handChips ?? 0) : projectedChips(this.hand),
    };
  }

  private stageLabel(): string {
    switch (this.stage) {
      case 'dealing': return 'DEALING';
      case 'holding': return 'READING HAND';
      case 'resolve': return 'SETTLING';
      case 'sweep': return 'SWEEPING';
      default: return this.hand.length > 0 ? 'IN HAND' : 'IDLE';
    }
  }

  private refreshHud(): void {
    const stage = this.stageLabel();
    if (stage !== this.lastStageLabel) this.lastStageLabel = stage;
    const caption = this.lastResult
      ? `${this.lastResult.label} ×${(this.lastResult.totalMult * Math.max(1, this.globalMult)).toFixed(2)} · ${this.lastGained >= 0 ? '+' : ''}${this.lastGained.toLocaleString('en-US')}`
      : '等待事件 · 每一次调用，发一张牌';
    this.hudCache = {
      transport: 'LIVE TABLE',
      stage,
      fields: [
        { label: 'SCORE', value: this.score.toLocaleString('en-US'), tone: 'ink' },
        { label: 'CHIPS', value: Math.floor(this.score / 10).toLocaleString('en-US'), tone: 'teal' },
        { label: 'MULT', value: `×${this.globalMult.toFixed(2)}`, tone: this.globalMult > 1 ? 'teal' : 'muted' },
        { label: 'ANTE', value: `${String(this.ante).padStart(2, '0')} · ${this.handInAnte}/3`, tone: 'ink' },
      ],
      caption,
      hint: 'SPACE 暂停 · 1–5 触发 · M 静音',
    };
  }

  hud(): ModeHud { return this.hudCache; }

  telemetry(): Record<string, unknown> {
    return {
      mode: 'chips',
      stage: this.stage,
      stageLabel: this.stageLabel(),
      handNo: this.handNo,
      handInAnte: this.handInAnte,
      ante: this.ante,
      score: this.score,
      chips: Math.floor(this.score / 10),
      globalMult: this.globalMult,
      quota: this.quota,
      deckLeft: this.deck.remaining,
      queued: this.queue.length,
      hand: this.hand.map((c) => ({ id: c.id, family: c.family, rank: c.rank, edition: c.edition })),
      lastCombo: this.lastResult?.combo ?? null,
      lastLabel: this.lastResult?.label ?? null,
      lastHandChips: this.lastResult?.handChips ?? 0,
      lastTotalMult: this.lastResult?.totalMult ?? 0,
      lastScore: this.lastResult?.score ?? 0,
      lastGained: this.lastGained,
      heat: this.heat,
      resolvedHands: this.resolvedHands,
      successHands: this.successHands,
      missHands: this.missHands,
      sponsorLevel: this.sponsorLevel,
      totalDealt: this.resolvedHands * 5 + this.hand.length,
    };
  }

  reset(): void { this.build(); }

  sample(type: ToolName): string { return SAMPLES[type]; }

  destroy(): void {
    for (const card of this.cards) card.destroy();
    this.cards = [];
    this.root.destroy({ children: true });
  }
}
