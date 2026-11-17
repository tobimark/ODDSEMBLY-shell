/**
 * Build-time contract for the weave draft. No browser, no Pixi.
 *
 * This is the test that makes "the cloth is woven, not drawn" falsifiable:
 *   · every pick lifts exactly the shafts the draft names;
 *   · the lifted ends put warp over weft, the rest put weft over warp;
 *   · consecutive picks shift the pattern by one end (the twill diagonal);
 *   · a different draft produces a different row — the pattern is a function of
 *     the draft, not a fixed texture.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;

const mod = await import('data:text/javascript;base64,' + Buffer.from(transpile(read('../src/engine/modes/loom/atelier/draft.ts'))).toString('base64'));
const { DRAFT, shaftOf, rowOf, liftedAt, warpOver, rowCells } = mod;

const ENDS = 112;

// straight draw: end → shaft, repeating
for (let i = 0; i < 12; i++) assert.equal(shaftOf(i), i % 4, `end ${i}`);

// the draft itself: 4 picks, 2 of 4 shafts up each time
assert.equal(DRAFT.rows.length, 4);
for (let r = 0; r < 4; r++) assert.equal(DRAFT.rows[r].length, 2, `row ${r} lifts two shafts`);

// every pick lifts exactly its own pair, and nothing else
for (let pick = 0; pick < 8; pick++) {
  const expected = DRAFT.rows[pick % 4];
  for (let s = 0; s < 4; s++) {
    assert.equal(liftedAt(s, pick), expected.includes(s), `pick ${pick} shaft ${s}`);
  }
}

// a lifted end is up, so the weft goes under it: warp on top
for (let pick = 0; pick < 6; pick++) {
  for (let i = 0; i < ENDS; i++) {
    assert.equal(warpOver(i, pick), DRAFT.rows[pick % 4].includes(i % 4));
  }
}

// half the ends on top, every pick
for (let pick = 0; pick < 8; pick++) {
  const cells = rowCells(ENDS, pick);
  assert.equal(cells.filter(Boolean).length, ENDS / 2, `pick ${pick} is 50/50`);
}

// the twill diagonal: next pick's cell is this pick's neighbour
for (let pick = 0; pick < 6; pick++) {
  for (let i = 1; i < ENDS; i++) {
    assert.equal(warpOver(i, pick + 1), warpOver(i - 1, pick), `diagonal at end ${i} pick ${pick}`);
  }
}

// same draft, same cloth — deterministic
assert.deepEqual(rowCells(ENDS, 5), rowCells(ENDS, 5));

// a different draft weaves a different cloth
const OTHER = { shafts: 4, rows: [[0, 2], [1, 3]] };
const other = rowCells(ENDS, 0, OTHER);
assert.notDeepEqual(other, rowCells(ENDS, 0), 'draft changes the fabric');
assert.equal(other.filter(Boolean).length, ENDS / 2);

// and an entirely plain weave is reachable too
const PLAIN = { shafts: 2, rows: [[0], [1]] };
assert.deepEqual(rowCells(8, 0, PLAIN), [true, false, true, false, true, false, true, false]);
assert.deepEqual(rowCells(8, 1, PLAIN), [false, true, false, true, false, true, false, true]);

console.log('PASS: weave draft — straight draw, 2/2 twill, 50/50 rows, diagonal shift, draft-dependent cloth.');
