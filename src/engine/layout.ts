/** Fixed design space: 1472 × 1008 (same aspect as the reference canvas). */
export const DESIGN = { w: 1472, h: 1008 } as const;

export const SHEET = { x: 30, y: 26, w: 1412, h: 956 } as const;

/** Dense woven field: 106 warp ends × 4.2 px pitch = 445 px. */
export const FABRIC = { x: 640, y: 196, w: 445, h: 700, ends: 106, pitch: 445 / 106 } as const;

export const LOOM = {
  leftPost: 606,
  rightPost: 1104,
  topBeam: 168,
  bottomBeam: 884,
  bobbinY: 130,
  heddleA: 392,
  heddleB: 486,
  reedY: 620,
  raceY: 668,
  clothTop: 690,
} as const;

export const DRIVE = {
  flywheel: { x: 452, y: 700, r: 96 },
  crank: { x: 452, y: 700, r: 62 },
  gearBig: { x: 452, y: 556, r: 54 },
  gearSmall: { x: 536, y: 556, r: 30 },
  cam: { x: 598, y: 556, r: 26 },
  motor: { x: 344, y: 792, w: 196, h: 78 },
} as const;

export const PANEL = {
  x: 1200,
  y: 120,
  w: 226,
  h: 742,
} as const;
