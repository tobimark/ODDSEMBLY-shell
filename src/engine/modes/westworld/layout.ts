/** Westworld layout — 1472×1008 design space. */
export const DIAL = {
  cx: 424,
  cy: 556,
  r: 298,
  face: 276,
  numR: 238,
  start: (140 * Math.PI) / 180,
  sweep: (260 * Math.PI) / 180,
  needle: 252,
} as const;

export const PLANT = {
  x: 742, y: 148, w: 444, h: 754,
  tanks: [
    { id: 'intake', family: 'Read' as const, cx: 800, base: 742, r: 42, h: 206, title: 'INTAKE', cn: '进料' },
    { id: 'reservoir', family: 'Write' as const, cx: 946, base: 742, r: 54, h: 276, title: 'RESERVOIR', cn: '蓄能' },
    { id: 'regulator', family: 'Edit' as const, cx: 1082, base: 742, r: 36, h: 168, title: 'REGULATOR', cn: '调压' },
  ],
  manifoldY: 788,
  manifoldX0: 764, manifoldX1: 1152,
  valves: [
    { family: 'Read' as const, x: 780 },
    { family: 'Edit' as const, x: 850 },
    { family: 'Write' as const, x: 920 },
    { family: 'Bash' as const, x: 990 },
    { family: 'Search' as const, x: 1060 },
  ],
  valveY: 812,
  valveR: 17,
  relief: { x: 946, y: 438, w: 74, h: 118 },
  relay: { x: 764, y: 168, w: 196, h: 132 },
  piston: { crankX: 960, crankY: 872, crankR: 16, rod: 62, cylinderX0: 1000, cylinderX1: 1072, y: 872 },
  heatGauge: { cx: 1122, cy: 870, r: 21 },
} as const;

export const SIDE = {
  sponsor: { x: 1204, y: 118, w: 238, h: 226 },
  printer: { x: 1204, y: 372, w: 238, h: 264 },
  counter: { x: 1204, y: 664, w: 238, h: 132 },
  plate: { x: 1204, y: 824, w: 238, h: 66 },
} as const;

/** Pipe polylines for pulses (design-space coordinates). */
export const PIPE_PATHS: Array<{ id: string; family: 'Read' | 'Edit' | 'Write' | 'Bash' | 'Search'; pts: Array<[number, number]> }> = [
  { id: 'intake', family: 'Read', pts: [[800, 742], [800, 788], [780, 788], [780, 820]] },
  { id: 'regulator', family: 'Edit', pts: [[1082, 742], [1082, 788], [858, 788], [858, 820]] },
  { id: 'reservoir', family: 'Write', pts: [[946, 742], [946, 788], [936, 788], [936, 820]] },
  { id: 'combustion', family: 'Bash', pts: [[946, 742], [1014, 742], [1014, 788], [1014, 820]] },
  { id: 'scanner', family: 'Search', pts: [[1082, 742], [1092, 742], [1092, 788], [1092, 820]] },
  { id: 'feed', family: 'Read', pts: [[746, 788], [764, 788], [764, 758], [706, 758], [706, 700]] },
  { id: 'relief', family: 'Write', pts: [[946, 438], [946, 380], [946, 300], [946, 220]] },
];

export function pressureAngle(pressure: number): number {
  return DIAL.start + Math.max(0, Math.min(1, pressure)) * DIAL.sweep;
}
