/** Build-time kinematic contract: no browser or snapshots required. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// mechanism.ts imports the shared pacing policy at runtime; inline it.
const pacingUrl = dataUrl(transpile(read('../src/live/pacing.ts')));
const pacing = await import(pacingUrl);
const mechanismSource = read('../src/engine/modes/loom/atelier/mechanism.ts')
  .replace(/'\.\.\/\.\.\/\.\.\/\.\.\/live\/pacing'/g, JSON.stringify(pacingUrl));
const { Mechanism } = await import(dataUrl(transpile(mechanismSource)));

const event = (i) => ({ id: i, type: ['Read', 'Edit', 'Write', 'Bash', 'Search'][i % 5], detail: 'test', at: i });

/* ------------------------------------------- reference cadence (one pick at a time) */

// One call at a time is normal cadence: the pick keeps the full 1.65 s the Loom
// was designed around (compression only starts with a real backlog, see below).
const a = new Mechanism();
const committed = [];
a.onPick = (e) => committed.push(e.id);
a.push(event(0));

a.update(.3); assert(a.shed > .9); assert.equal(a.travel, 0); assert.equal(a.picks, 0);
a.update(.4); assert(a.travel > 0 && a.travel < 1); assert.equal(a.picks, 0); assert.equal(a.beat, 0);
a.update(.5); assert.equal(a.shed, 0); assert.equal(a.travel, 1); assert.equal(a.picks, 0);
a.update(.25); assert.equal(a.picks, 1); assert(a.beat > .8);
a.update(4);
assert.equal(a.picks, 1); assert.equal(a.active, null);
a.push(event(1));
a.update(4);
assert.equal(a.picks, 2); assert.deepEqual(committed, [0, 1]);

/* ------------------------------------------------------ FIFO + frame-step independence */

const c = new Mechanism(); for (let i = 0; i < 12; i++) c.push(event(i));
const d = new Mechanism(); for (let i = 0; i < 12; i++) d.push(event(i));
for (let i = 0; i < 2400; i++) c.update(.01);
d.update(24);
assert.equal(c.picks, 12); assert.equal(c.active, null);
assert.equal(d.picks, 12); assert.equal(d.active, null);
assert(Math.abs(c.angle - d.angle) < 1e-8);

/* ------------------------------------------------------------------- pacing bounds */

const base = pacing.PICK_BASE_SECONDS;
assert.equal(pacing.pickSecondsFor(0), base);
assert.equal(pacing.pickSecondsFor(1), base, 'a normal call keeps full mechanical feedback');
assert(pacing.pickSecondsFor(2) < base, 'a burst starts compressing');
assert(pacing.pickSecondsFor(4) < pacing.pickSecondsFor(2), 'compression grows with the backlog');
assert(pacing.pickSecondsFor(4) >= base * 0.4, 'but never collapses into an unreadable blur');
assert.equal(pacing.decidePlay(pacing.MAX_PENDING_GROUPS - 1), 'pick');
assert.equal(pacing.decidePlay(pacing.MAX_PENDING_GROUPS), 'fold');

// A saturated queue must compress the pick it starts, and still commit in order.
const e2 = new Mechanism();
const order = [];
e2.onPick = (e) => order.push(e.id);
for (let i = 0; i < 12; i++) e2.push(event(i));
e2.update(1 / 60);
assert(e2.pickSeconds < base, 'saturated queue shortens the pick');
e2.update(30);
assert.equal(e2.picks, 12); assert.deepEqual(order, Array.from({ length: 12 }, (_, i) => i));

/* --------------------------------------------------------------- fold (bounded queue) */

const f = new Mechanism();
assert.equal(f.push(event(7), { play: 'fold' }), true, 'fold with nothing in flight still becomes a pick');
f.update(1 / 60);
assert.equal(f.push(event(8), { play: 'fold' }), false, 'fold while a pick is in flight adds no queue entry');
assert.equal(f.folded, 1);
assert.equal(f.queue.length, 0);
assert.equal(f.snapshot().folded, 1);
f.update(4);
assert.equal(f.picks, 1, 'a folded call does not create an extra woven row');

/* ------------------------------------------------------------------ stop cancels queue */

const s = new Mechanism();
for (let i = 0; i < 5; i++) s.push(event(i));
s.update(.1);
s.stop();
s.update(10);
assert.equal(s.picks, 0);
assert.equal(s.active, null);
assert.equal(s.queue.length, 0);

console.log('PASS: shed precedes shuttle; no early cloth; one commit per event; FIFO; frame-step independence; '
  + 'tempo compression; fold absorbs without a queue entry; stop cancels queue.');

/* ------------------------------------------------------------------------ linkage */

const linkageSource = fs.readFileSync(new URL('../src/engine/modes/loom/atelier/linkage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(linkageSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { solveLinkage } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
let maxError = 0;
for (let i = 0; i <= 4000; i++) {
  const lift = 19 * Math.sin(i / 4000 * Math.PI * 2), beat = 29 * (1 + Math.sin(i / 4000 * Math.PI * 2)) / 2;
  for (const [basePos, dy] of [[419, -lift], [531, lift], [649, beat]]) {
    const k = solveLinkage({ x: 1260, y: basePos + 70 }, { x: 1220, y: basePos + dy });
    const err = Math.abs(Math.hypot(k.pin.x - k.slider.x, k.pin.y - k.slider.y) - 75);
    maxError = Math.max(maxError, err); assert(err < 1e-9);
    assert(Math.abs(Math.hypot(k.pin.x - k.center.x, k.pin.y - k.center.y) - 25) < 1e-9);
    assert(Number.isFinite(k.angle));
  }
}
assert.throws(() => solveLinkage({ x: 0, y: 0 }, { x: 0, y: 200 }));
console.log('PASS: 12,003 linkage poses, fixed 75px rod / 25px crank; maximum length error:', maxError);
