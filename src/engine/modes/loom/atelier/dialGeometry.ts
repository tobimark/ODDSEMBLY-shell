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
  /** visible arc of the ring inside the 1472×1008 sheet */
  arc: { minDeg: 12, maxDeg: 70 },
  /**
   * Fixed rectangular readout, mounted on the inner drum face and tied to the
   * 40° read head by a fixed bracket. Axis-aligned and never transformed: the
   * geometry type carries no rotation field, so the readout can never end up
   * inside the rotating tree. The rect fits entirely inside the visible inner
   * drum (all four corners r ≤ 972 < blue arc 980).
   */
  panel: { x: 8, y: 30, w: 190, h: 126 },
  /** fixed bracket from the panel's lower right corner to the read-head root */
  panelBracket: { x: 168, y: 156, headR: 1078 },
  /** 12 card windows on the rotating index drum */
  card: { rIn: 1012, rOut: 1128, halfSpanDeg: 12 },
  /** control box (front layer) */
  box: { x: 88, y: 585, w: 245, h: 205 },
  queue: { x: 353, y: 834, w: 138, h: 36 },
} as const;

export type DialGeometry = typeof DIAL;

/** Polar → design-space cartesian, degrees measured with +x = 0°, y down. */
export function polar(r: number, deg: number, cx = DIAL.cx, cy = DIAL.cy): [number, number] {
  return [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
}
