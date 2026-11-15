/** Fixed design space: 1472 × 1008 (same aspect as the reference canvas). */
export const DESIGN = { w: 1472, h: 1008 } as const;

export const SHEET = { x: 30, y: 26, w: 1412, h: 956 } as const;

/** Dense woven field: 106 warp ends × 4.2 px pitch = 445 px. */
export const FABRIC = { x: 596, y: 180, w: 560, h: 700, ends: 106, pitch: 560 / 106 } as const;

export const LOOM = {
  leftPost: 560,
  rightPost: 1180,
  topBeam: 160,
  bottomBeam: 880,
  bobbinY: 120,
  heddleA: 380,
  heddleB: 480,
  reedY: 620,
  raceY: 668,
  clothTop: 690,
} as const;

export const DRIVE = {
  flywheel: { x: 420, y: 730, r: 88 },
  crank: { x: 420, y: 730, r: 56 },
  gearBig: { x: 420, y: 606, r: 48 },
  gearSmall: { x: 496, y: 606, r: 26 },
  cam: { x: 548, y: 606, r: 22 },
  motor: { x: 318, y: 812, w: 190, h: 72 },
} as const;

export const PANEL = {
  x: 1210,
  y: 120,
  w: 212,
  h: 742,
} as const;
