/**
 * Weave draft — the plan the loom actually executes.
 *
 * Reference facts this is modelled on (`loom-detail.md` §3.3, §5;
 * `CrommaCode-Loom场景动画-视觉映射.md` §7):
 *   · one tool call = `Shuttle → Needles/Lift → Dock → BeatUp → Lower → TakeUp/Stitch`
 *   · `Needles/Lift` **selects a group of ends** and lifts them — the shed is a
 *     selection, not a global two-sheet flip;
 *   · the cloth is generated from "the stitches woven in" (brightness 0.75/0.875,
 *     colour cap 255), i.e. the row is a product of the selection, not a texture;
 *   · the jacquard only does geometry/phase maths — no RNG was found.
 *
 * So the same array drives the heddle frames and the cloth cells. Change the
 * draft and both the machine and the fabric change together.
 */

export interface Draft {
  readonly shafts: number;
  /** One entry per pick: the shaft indices lifted for that pick. */
  readonly rows: readonly (readonly number[])[];
}

/** Straight draw, 2/2 twill: two shafts up, shifting one per pick. */
export const DRAFT: Draft = {
  shafts: 4,
  rows: [[0, 1], [1, 2], [2, 3], [3, 0]],
};

/** Which shaft an end is threaded through (straight draw). */
export const shaftOf = (end: number, draft: Draft = DRAFT) => ((end % draft.shafts) + draft.shafts) % draft.shafts;

/** Draft row used by a given pick (0-based pick index). */
export const rowOf = (pick: number, draft: Draft = DRAFT) => ((pick % draft.rows.length) + draft.rows.length) % draft.rows.length;

/** True when this shaft is lifted for that pick. */
export const liftedAt = (shaft: number, pick: number, draft: Draft = DRAFT) =>
  draft.rows[rowOf(pick, draft)].indexOf(shaft) >= 0;

/**
 * Does the warp show on top at this cell?
 * A lifted end is up, so the weft passes underneath it: warp over weft.
 */
export const warpOver = (end: number, pick: number, draft: Draft = DRAFT) =>
  liftedAt(shaftOf(end, draft), pick, draft);

/** The cells of one row, back to front — handy for rendering and for tests. */
export function rowCells(ends: number, pick: number, draft: Draft = DRAFT): boolean[] {
  const cells = new Array<boolean>(ends);
  for (let i = 0; i < ends; i++) cells[i] = warpOver(i, pick, draft);
  return cells;
}
