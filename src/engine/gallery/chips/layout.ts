/** Chips world layout — 1472×1008 design space (header < 104, footer > 924). */
export const LAYOUT = {
  board: { x: 396, y: 112, w: 618, h: 186 },
  table: { x: 168, y: 306, w: 1016, h: 606, r: 26 },
  felt: { x: 192, y: 330, w: 968, h: 558, r: 20 },
  shoe: { x: 214, y: 560, w: 132, h: 232 },
  discard: { x: 1006, y: 566, w: 142, h: 218 },
  sponsor: { x: 1210, y: 128, w: 228, h: 272 },
  printer: { x: 1210, y: 428, w: 228, h: 258 },
  chips: { x: 1210, y: 714, w: 228, h: 172 },
  quota: { x: 430, y: 846, w: 588, h: 34 },
  legend: { x: 196, y: 850, w: 200, h: 26 },
  hand: { cx: 676, y: 596, count: 5 },
  card: { w: 118, h: 170 },
  combo: { x: 676, y: 352 },
} as const;

/** Five hand slots: slight fan, fixed deterministic pose. */
export function handSlot(i: number, count = LAYOUT.hand.count): { x: number; y: number; rot: number } {
  const gap = 126;
  const cx = LAYOUT.hand.cx;
  const x = cx + (i - (count - 1) / 2) * gap;
  const y = LAYOUT.hand.y + Math.abs(i - (count - 1) / 2) * 7;
  const rot = ((i - (count - 1) / 2) / Math.max(1, (count - 1) / 2)) * 0.075;
  return { x, y, rot };
}

export const CARD_STOCK = {
  paperA: '#FDFBF4',
  paperB: '#F3EDDF',
  edge: '#C8C2B2',
  ink: '#20243A',
  hair: '#B7B3A4',
  navy: '#171C60',
  teal: '#33CBCC',
  brass: '#B28D5E',
} as const;
