/**
 * Chips card logic — pure and deterministic.
 *
 * A real agent tool call is the *family* of the card (Read/Edit/Write/Bash/Search),
 * while the deck supplies a deterministic rank 1–9 and an occasional edition.
 * Five cards make a hand; standard poker-style combinations set the multiplier,
 * and the per-tool effects (chips / mult / wild / peek / heat) decide the payout.
 *
 * No Date/performance/Math.random here: every draw is derived from a seeded PRNG,
 * so the exact same 12 agent events always produce the exact same two hands.
 */
import type { ToolName } from '../../core/types';
import { hashString, mulberry32 } from '../../core/spring';

export type Edition = 'plain' | 'foil' | 'holo' | 'negative';

export interface CardData {
  /** engine event id (stable per session, used by audio beat ledger) */
  id: number;
  family: ToolName;
  rank: number;
  edition: Edition;
  /** short agent-action text stamped onto the card face */
  detailText: string;
}

export interface DrawSpec { rank: number; edition: Edition }

export type ComboId =
  | 'HIGH_CARD' | 'PAIR' | 'TWO_PAIR' | 'THREE' | 'STRAIGHT' | 'FLUSH'
  | 'FULL_HOUSE' | 'FOUR' | 'STRAIGHT_FLUSH' | 'FIVE_OF_A_KIND';

export interface ComboDef { id: ComboId; label: string; mult: number; blurb: string }

export const COMBOS: Record<ComboId, ComboDef> = {
  HIGH_CARD: { id: 'HIGH_CARD', label: 'HIGH CARD', mult: 1, blurb: '单张成手，保住节奏' },
  PAIR: { id: 'PAIR', label: 'PAIR', mult: 2, blurb: '同点数两张' },
  TWO_PAIR: { id: 'TWO_PAIR', label: 'TWO PAIR', mult: 3, blurb: '两组对子' },
  THREE: { id: 'THREE', label: 'THREE', mult: 4, blurb: '同点数三张' },
  STRAIGHT: { id: 'STRAIGHT', label: 'STRAIGHT', mult: 5, blurb: '五张连续点数' },
  FLUSH: { id: 'FLUSH', label: 'FLUSH', mult: 6, blurb: '五张同工具族' },
  FULL_HOUSE: { id: 'FULL_HOUSE', label: 'FULL HOUSE', mult: 8, blurb: '三条 + 一对' },
  FOUR: { id: 'FOUR', label: 'FOUR OF A KIND', mult: 10, blurb: '同点数四张' },
  STRAIGHT_FLUSH: { id: 'STRAIGHT_FLUSH', label: 'STRAIGHT FLUSH', mult: 14, blurb: '同族顺子' },
  FIVE_OF_A_KIND: { id: 'FIVE_OF_A_KIND', label: 'FIVE OF A KIND', mult: 16, blurb: '同点数五张' },
};

export const FAMILIES: ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'];

export const TOOL_CHIPS: Record<ToolName, number> = {
  Read: 12,
  Edit: 8,
  Write: 34,
  Bash: 48,
  Search: 18,
};

export const TOOL_NOTES: Record<ToolName, string> = {
  Read: 'PEEK · 预读牌堆',
  Edit: 'MULT +0.25',
  Write: 'CHIPS +34',
  Bash: 'CHIPS +48 · HEAT',
  Search: 'WILD · 任意族',
};

/**
 * Deterministic 45-card rank deck: five copies of ranks 1..9 in seeded order,
 * with rare editions stamped onto fixed positions (never re-rolled per frame).
 */
export class RankDeck {
  private specs: DrawSpec[] = [];
  private cursor = 0;
  private generation = 0;
  private readonly seed: number;

  constructor(seed: number) { this.seed = seed >>> 0; this.reshuffle(); }

  private reshuffle(): void {
    const rng = mulberry32(hashString(`${this.seed}:${this.generation}`));
    const base: DrawSpec[] = [];
    for (let rank = 1; rank <= 9; rank++) for (let copy = 0; copy < 5; copy++) base.push({ rank, edition: 'plain' });
    // deterministic Fisher–Yates
    for (let i = base.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    // rare editions stamped deterministically
    for (let i = 0; i < base.length; i++) {
      const r = rng();
      if (r < 0.035) base[i].edition = 'foil';
      else if (r < 0.06) base[i].edition = 'holo';
      else if (r < 0.075) base[i].edition = 'negative';
    }
    this.specs = base;
    this.cursor = 0;
    this.generation += 1;
  }

  get remaining(): number { return this.specs.length - this.cursor; }

  draw(family: ToolName, id: number, detailText = ''): CardData {
    if (this.cursor >= this.specs.length) this.reshuffle();
    const spec = this.specs[this.cursor++];
    return { id, family, rank: spec.rank, edition: spec.edition, detailText };
  }

  /** next N draws without consuming them (Read peek) */
  peek(n: number): DrawSpec[] {
    const out: DrawSpec[] = [];
    for (let i = 0; i < n; i++) {
      let idx = this.cursor + i;
      if (idx >= this.specs.length) idx -= this.specs.length;
      out.push(this.specs[idx]);
    }
    return out;
  }

  reset(seed = this.seed): void { this.generation = 0; void seed; this.reshuffle(); }
}

/* ---------------------------------------------------------------- evaluation */

export interface HandResult {
  combo: ComboId;
  label: string;
  blurb: string;
  comboMult: number;
  baseChips: number;
  chipBonus: number;
  multBonus: number;
  overheat: boolean;
  totalMult: number;
  handChips: number;
  score: number;
  /** cards that compose the combination (indices), for highlight */
  scoring: number[];
  heat: number;
  /** human-readable breakdown used by the printed ticket */
  lines: string[];
}

function rankCounts(cards: CardData[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  cards.forEach((c, i) => {
    const list = map.get(c.rank) ?? [];
    list.push(i);
    map.set(c.rank, list);
  });
  return map;
}

function isFlush(cards: CardData[]): boolean {
  const wilds = cards.filter((c) => c.family === 'Search');
  const others = cards.filter((c) => c.family !== 'Search');
  if (others.length === 0) return true;
  const family = others[0].family;
  return others.every((c) => c.family === family) && (others.length + wilds.length === 5);
}

function straightHigh(cards: CardData[]): number | null {
  const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
  if (ranks.length !== 5) return null;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i - 1] + 1) return null;
  return ranks[4];
}

export function evaluateHand(cards: CardData[]): HandResult {
  const counts = rankCounts(cards);
  const sorted = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const flush = isFlush(cards);
  const straight = straightHigh(cards);
  const topCount = sorted[0]?.[1].length ?? 0;
  const secondCount = sorted[1]?.[1].length ?? 0;

  let combo: ComboId = 'HIGH_CARD';
  let scoring: number[] = [];
  if (topCount >= 5) { combo = 'FIVE_OF_A_KIND'; scoring = sorted[0][1]; }
  else if (flush && straight !== null) { combo = 'STRAIGHT_FLUSH'; scoring = cards.map((_, i) => i); }
  else if (topCount === 4) { combo = 'FOUR'; scoring = sorted[0][1]; }
  else if (topCount === 3 && secondCount === 2) { combo = 'FULL_HOUSE'; scoring = [...sorted[0][1], ...sorted[1][1]]; }
  else if (flush) { combo = 'FLUSH'; scoring = cards.map((_, i) => i); }
  else if (straight !== null) { combo = 'STRAIGHT'; scoring = cards.map((_, i) => i); }
  else if (topCount === 3) { combo = 'THREE'; scoring = sorted[0][1]; }
  else if (topCount === 2 && secondCount === 2) { combo = 'TWO_PAIR'; scoring = [...sorted[0][1], ...sorted[1][1]]; }
  else if (topCount === 2) { combo = 'PAIR'; scoring = sorted[0][1]; }
  else { combo = 'HIGH_CARD'; scoring = [0]; }

  const editCount = cards.filter((c) => c.family === 'Edit').length;
  const writeCount = cards.filter((c) => c.family === 'Write').length;
  const bashCount = cards.filter((c) => c.family === 'Bash').length;
  const overheat = bashCount >= 3;

  const baseChips = 20 + cards.reduce((acc, c) => acc + c.rank * 8 + TOOL_CHIPS[c.family], 0);
  const chipBonus = (writeCount ? writeCount * 10 : 0) + (bashCount >= 3 ? 40 : 0);
  const multBonus = editCount * 0.25;
  const def = COMBOS[combo];
  const heatMult = overheat ? 0.5 : 0;
  const totalMult = Math.round((def.mult + multBonus + heatMult) * 100) / 100;
  const handChips = baseChips + chipBonus;
  const score = Math.round(handChips * totalMult);

  const lines = [
    `${def.label} ×${totalMult.toFixed(2)}`,
    `CHIPS ${baseChips}${chipBonus ? ` +${chipBonus}` : ''} = ${handChips}`,
    editCount ? `EDIT MULT +${multBonus.toFixed(2)}` : '',
    overheat ? `BASH OVERHEAT +0.50` : '',
    `SCORE ${score}`,
  ].filter(Boolean);

  return {
    combo, label: def.label, blurb: def.blurb, comboMult: def.mult,
    baseChips, chipBonus, multBonus, overheat, totalMult, handChips, score,
    scoring, heat: bashCount, lines,
  };
}

/** Quota for the current hand; rises within an ante and between antes. */
export function handQuota(ante: number, handInAnte: number): number {
  return Math.round((640 + (handInAnte - 1) * 260) * (1 + (ante - 1) * 0.55));
}

/** Live chip preview while a hand is still being dealt (drives the quota gauge). */
export function projectedChips(cards: CardData[]): number {
  if (cards.length === 0) return 0;
  const base = 20 + cards.reduce((acc, c) => acc + c.rank * 8 + TOOL_CHIPS[c.family], 0);
  const writeCount = cards.filter((c) => c.family === 'Write').length;
  const bashCount = cards.filter((c) => c.family === 'Bash').length;
  const bonus = (writeCount ? writeCount * 10 : 0) + (bashCount >= 3 ? 40 : 0);
  const mult = COMBOS[cards.length >= 5 ? evaluateHand(cards).combo : 'HIGH_CARD'].mult + cards.filter((c) => c.family === 'Edit').length * 0.25;
  return Math.round((base + bonus) * mult);
}

export function editionLabel(edition: Edition): string {
  return edition === 'plain' ? '' : edition.toUpperCase();
}
