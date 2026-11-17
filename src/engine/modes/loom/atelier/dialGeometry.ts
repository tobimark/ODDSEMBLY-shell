/**
 * Design-space geometry of the Loom event-scale instrument (the large cropped
 * dial behind the loom's left side). This module stays free of Pixi imports so
 * the pure dial model and the layout tests can consume the same constants.
 *
 * Provenance: constants below are the KunlunMeta reconstruction baseline
 * (fitted from the reference canvas), not source constants of the reference
 * program. See docs/EVENT_DIAL.md §Geometry.
 */
export const DIAL = {
  /** dial centre sits off-sheet at the upper left, so the ring is cropped */
  cx: -610,
  cy: -390,
  /** blue reference arc radius */
  blue: 980,
  faceOut: 1140,
  sepOut: 1152,
  /** engraved 5° scale band */
  tickOut: 1182,
  knurlOut: 1212,
  outerOut: 1296,
  lipOut: 1312,
  /** fixed read head: the pointer that the wheel indexes under (design space) */
  headDeg: 40,
  headR: 1082,
  /** aperture radius stays fixed; the readout hangs off the same arm */
  /** visible arc of the ring inside the 1472×1008 sheet */
  arc: { minDeg: 12, maxDeg: 70 },
  /** Fixed readout, suspended next to the read head (not inside the rotor).
   *  Axis-aligned, no rotation field, horizon-stable text. 180×92 design px. */
  panel: { x: 80, y: 170, w: 245, h: 100 },
  /** 12 card windows on the rotating index drum */
  card: { rIn: 1012, rOut: 1128, halfSpanDeg: 12 },
} as const;

export type DialGeometry = typeof DIAL;

/** Polar → design-space cartesian, degrees measured with +x = 0°, y down. */
export function polar(r: number, deg: number, cx = DIAL.cx, cy = DIAL.cy): [number, number] {
  return [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
}
