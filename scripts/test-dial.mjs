/**
 * Build-time contract for the Loom event dial model. No browser, no Pixi:
 * the pure reducer + readout projection are transpiled with the installed
 * TypeScript and executed under node, same technique as test-mechanism.mjs.
 *
 * Covered contract:
 *   idle empty → arm 105 ms → 180 ms index step → hold → idle
 *   same-tool aggregation (×N) never steps the ring
 *   Sxx/12 slot bookkeeping, 12 slots, one slot per group
 *   frame-step independence and deterministic final angle
 *   reduced-motion collapse (0 ms arm/move)
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// dialModel imports ./toolPalette at runtime; inline the transpiled palette.
const paletteUrl = dataUrl(transpile(read('../src/engine/modes/loom/atelier/toolPalette.ts')));
const modelSource = read('../src/engine/modes/loom/atelier/dialModel.ts')
  .replace(/'\.\/toolPalette'/g, JSON.stringify(paletteUrl));
const m = await import(dataUrl(transpile(modelSource)));

const cfg = m.DIAL_CONFIG;
const ev = (type, id = 1, detail = 'src/modes/loom/scene.ts') => ({ id, type, detail, at: 0 });
const RO = (state, config = cfg) => m.dialReadout(state, config);

/* 1 — idle */
let s = m.createDialState();
assert.equal(s.phase, 'idle');
assert.equal(s.angleDeg, 0);
let ro = RO(s);
assert.equal(ro.empty, true);
assert.equal(ro.type, null);
assert.equal(ro.step, null);
console.log('ok 1 idle state renders an empty fixed readout');

/* 2 — arm delay then one index step */
s = m.dialPush(s, ev('Read'));
assert.equal(s.phase, 'arming');
assert.equal(s.card.count, 1);
assert.equal(s.targetDeg, 30);
s = m.dialTick(s, 50);
assert.equal(s.phase, 'arming');
assert.equal(s.angleDeg, 0, 'the ring must not move during the 105 ms display delay');
s = m.dialTick(s, 60); // 110 ms → armed
assert.equal(s.phase, 'moving');
assert.ok(s.angleDeg > 0 && s.angleDeg < 30, `mid-step angle ${s.angleDeg}`);
const midAngle = s.angleDeg;
s = m.dialTick(s, 200);
assert.equal(s.phase, 'holding');
assert.equal(s.angleDeg, 30);
ro = RO(s);
assert.equal(ro.type, 'Read');
assert.equal(ro.count, 1);
assert.deepEqual(ro.step, { index: 1, total: 12 });
assert.equal(ro.color, '#789ED0');
console.log('ok 2 display delay precedes one 30° index step; readout is S01/12');

/* 3 — same-tool aggregation is an in-place ×N, no extra rotation */
s = m.dialPush(s, ev('Read', 2, 'src/engine/core/engine.ts'));
assert.equal(s.card.count, 2, 'same tool inside the merge window aggregates');
assert.equal(s.targetDeg, 30, 'aggregation must not add a slot step');
const angleBefore = s.angleDeg;
s = m.dialTick(s, 500);
assert.equal(s.angleDeg, angleBefore);
assert.equal(RO(s).count, 2);
assert.equal(RO(s).step.index, 1);
console.log('ok 3 same-tool calls aggregate in place (×2, S01/12, ring stationary)');

/* 4 — a different tool starts the next group and advances one slot */
s = m.dialPush(s, ev('Bash', 3));
assert.equal(s.ordinal, 2);
assert.equal(s.targetDeg, 60);
assert.equal(RO(s).step.index, 2);
s = m.dialTick(s, 400);
assert.equal(s.phase, 'holding');
assert.equal(s.angleDeg, 60);
assert.equal(RO(s).type, 'Bash');
assert.equal(RO(s).color, '#77BA89');
console.log('ok 4 new tool → slot 2, 60°, measured Bash colour');

/* 5 — hold expiry clears the readout and returns to idle */
const held = s;
s = m.dialTick(s, cfg.timing.holdMs + 1);
assert.equal(s.phase, 'idle');
assert.equal(s.card, null);
assert.equal(RO(s).empty, true);
assert.equal(s.angleDeg, 60, 'idle keeps the ring where it stopped (no spin-back)');
assert.equal(m.dialTick(held, 1500).phase, 'holding', 'group stays for the hold window');
console.log('ok 5 hold window is honoured, then the readout returns to IDLE');

/* 6 — frame-step independence (deterministic reducer) */
const run = (dts) => {
  let st = m.createDialState();
  st = m.dialPush(st, ev('Write'));
  for (const dt of dts) st = m.dialTick(st, dt);
  return st;
};
const a = run(Array(60).fill(1000 / 60));
const b = run(Array(30).fill(1000 / 30));
const c = run([1000]);
for (const st of [a, b, c]) {
  assert.equal(st.phase, 'holding');
  assert.equal(st.angleDeg, 30);
  assert.deepEqual(RO(st).step, { index: 1, total: 12 });
}
assert.ok(Math.abs(a.clockMs - b.clockMs) < 1e-6);
assert.ok(Math.abs(b.clockMs - c.clockMs) < 1e-6);
console.log('ok 6 60 fps / 30 fps / single 1 s tick reach the same deterministic state');

/* 7 — shortest arc helper (used by future motion models) */
assert.equal(m.shortestDelta(350, 10), 20);
assert.equal(m.shortestDelta(10, 350), -20);
assert.equal(m.shortestDelta(0, 180), -180);
assert.equal(Math.abs(m.shortestDelta(0, 180)), 180);
console.log('ok 7 shortestDelta never wraps the long way');

/* 8 — slot / target bookkeeping */
assert.equal(m.slotForOrdinal(1), 1);
assert.equal(m.slotForOrdinal(12), 12);
assert.equal(m.slotForOrdinal(13), 1);
assert.equal(m.targetAngleFor(12), 360);
assert.equal(m.targetAngleFor(1, { count: 12, pitchDeg: 30 }), 30);
console.log('ok 8 12 slots of 30°; slot numbering wraps, ring phase accumulates');

/* 9 — reduced motion collapses the animation to an instant jump */
const fast = { ...cfg, timing: { ...cfg.timing, armDelayMs: 0, moveMs: 0 } };
let r = m.createDialState();
r = m.dialPush(r, ev('Search'), fast);
assert.equal(r.phase, 'moving');
r = m.dialTick(r, 0, fast);
assert.equal(r.phase, 'holding');
assert.equal(r.angleDeg, 30);
assert.equal(RO(r, fast).type, 'Search');
console.log('ok 9 reduced motion: arm 0 ms + move 0 ms → instant settle');

/* 10 — 12 distinct groups = one full turn; Sxx wraps at 12 */
const tools = ['Read', 'Bash', 'Edit', 'Write', 'Search'];
let bulk = m.createDialState();
for (let i = 0; i < 12; i++) {
  bulk = m.dialPush(bulk, ev(tools[i % tools.length], i));
  bulk = m.dialTick(bulk, 300);
}
assert.equal(bulk.ordinal, 12);
assert.equal(bulk.targetDeg, 360);
assert.equal(bulk.angleDeg, 360);
assert.equal(RO(bulk).step.index, 12);
assert.equal(RO(bulk).count, 1, 'every tool switch starts a new ×1 group');
const telemetry = m.dialTelemetry(bulk);
assert.equal(telemetry.phase, 'holding');
assert.equal(telemetry.slot, 12);
assert.equal(telemetry.count, 1);
console.log('ok 10 12 groups drive one full 360° turn; telemetry is flat/JSON-safe');

console.log('PASS: dial model — idle/arm/move/hold/expire, same-tool ×N, Sxx/12, determinism, reduced motion.');
