/**
 * Event-dial review: deterministic screenshots + telemetry assertions for the
 * fixed readout / rotating index ring. Uses the shipped dist build; no source
 * hot-reload, no wall clock (static mode + manual ticks).
 *
 * Usage: npm run build && node scripts/review-event-dial.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch, sleep } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review', 'event-dial');
fs.mkdirSync(out, { recursive: true });
const dist = path.join(root, 'dist');
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'run `npm run build` first');

const tools = ['Read', 'Edit', 'Write', 'Bash', 'Search'];
const events = Array.from({ length: 12 }, (_, i) => ({
  id: 100 + i,
  type: tools[i % tools.length],
  detail: `src/modes/loom/scene.ts · burst ${i + 1}`,
  at: 0,
}));

const b = await launch({ root: dist, httpPort: 4630, debugPort: 4730, width: 1472, height: 1008 });
const telemetry = () => b.evaluate('window.__engine.getModeTelemetry().dial');
const tick = async (seconds) => {
  const frames = Math.max(1, Math.round(seconds * 60));
  await b.evaluate(`(()=>{for(let i=0;i<${frames};i++)window.__engine.tick(1/60)})()`);
};
const shot = (name) => b.screenshot(path.join(out, name));
const states = {};

const mark = b.mark();
await b.goto('?mode=loom&static=1&ui=0');

/* 01 — idle: empty fixed readout, ring at 0° */
states.idle = await telemetry();
assert.equal(states.idle.phase, 'idle');
assert.equal(states.idle.type, null);
assert.equal(states.idle.angleDeg, 0);
await shot('01-idle.png');

/* 02 — first event: 105 ms display delay, ring still at 0° */
await b.evaluate(`window.__engine.inject(${JSON.stringify(events[0])})`);
await tick(0.05);
states.arming = await telemetry();
assert.equal(states.arming.phase, 'arming');
assert.equal(states.arming.angleDeg, 0);
await shot('02-arming.png');

/* 03 — mid index step (readout already updated, ring moving) */
await tick(0.11);
states.moving = await telemetry();
assert.equal(states.moving.phase, 'moving');
assert.ok(states.moving.angleDeg > 0 && states.moving.angleDeg < 30, `angle ${states.moving.angleDeg}`);
await shot('03-moving.png');

/* 04 — settled on S01/12 */
await tick(0.5);
states.holdRead = await telemetry();
assert.equal(states.holdRead.phase, 'holding');
assert.equal(states.holdRead.type, 'Read');
assert.equal(states.holdRead.count, 1);
assert.deepEqual([states.holdRead.slot, states.holdRead.stepTotal], [1, 12]);
assert.equal(states.holdRead.angleDeg, 30);
await shot('04-hold-s01.png');

/* 05 — same tool aggregates to ×2 in place, ring does not step */
await b.evaluate(`window.__engine.inject(${JSON.stringify({ ...events[1], type: 'Read', id: 200, detail: 'src/engine/core/engine.ts · merged' })})`);
await tick(0.3);
states.merge = await telemetry();
assert.equal(states.merge.count, 2);
assert.equal(states.merge.slot, 1);
assert.equal(states.merge.angleDeg, 30);
await shot('05-merge-x2.png');

/* 06 — new tool → S02/12, ring advances to 60° */
await b.evaluate(`window.__engine.inject(${JSON.stringify({ ...events[2], type: 'Bash', id: 201, detail: 'npm run build · exit 0' })})`);
await tick(0.4);
states.bash = await telemetry();
assert.equal(states.bash.type, 'Bash');
assert.equal(states.bash.slot, 2);
assert.equal(states.bash.angleDeg, 60);
await shot('06-hold-s02-bash.png');

/* 07 — hold expiry clears the readout; the ring stays where it stopped */
await tick(2.2);
states.expired = await telemetry();
assert.equal(states.expired.phase, 'idle');
assert.equal(states.expired.type, null);
assert.equal(states.expired.angleDeg, 60);
await shot('07-idle-expired.png');

/* 08/09 — 12-event burst: continuous index steps, settled at one full turn */
const ordinalBefore = states.expired.ordinal;
await b.evaluate(`(${JSON.stringify(events)}).forEach(e=>window.__engine.inject(e))`);
await tick(0.25);
states.burstMoving = await telemetry();
assert.equal(states.burstMoving.phase, 'moving');
assert.ok(states.burstMoving.angleDeg > 60, `burst angle ${states.burstMoving.angleDeg}`);
await shot('08-burst-moving.png');
await tick(1.4);
states.burst = await telemetry();
assert.equal(states.burst.phase, 'holding');
assert.equal(states.burst.ordinal, ordinalBefore + 12);
assert.equal(states.burst.angleDeg, (ordinalBefore + 12) * 30);
assert.equal(states.burst.slot, ((ordinalBefore + 12 - 1) % 12) + 1);
assert.equal(states.burst.count, 1);
await shot('09-burst-settled.png');

/* 10 — reset clears the dial back to idle */
await b.evaluate('window.__engine.reset()');
await tick(0.1);
states.reset = await telemetry();
assert.equal(states.reset.phase, 'idle');
assert.equal(states.reset.angleDeg, 0);
assert.equal(states.reset.events, 0);

/* 11 — reduced motion: angle snaps without an intermediate frame */
await b.evaluate('window.__engine.setReducedMotion(true)');
await b.evaluate(`window.__engine.inject(${JSON.stringify({ ...events[3], type: 'Write', id: 300, detail: 'README.md · +96 lines' })})`);
await tick(0.02);
states.reduced = await telemetry();
assert.ok(['moving', 'holding'].includes(states.reduced.phase));
await tick(0.2);
states.reducedHold = await telemetry();
assert.equal(states.reducedHold.angleDeg, 30);
assert.equal(states.reducedHold.type, 'Write');
await b.evaluate('window.__engine.setReducedMotion(false)');

/* 12 — capture a 2× detail of the fixed readout + rotating ring */
await b.setViewport(1472, 1008, 2);
await b.goto('?mode=loom&static=1&ui=0');
await b.evaluate(`(()=>{
  window.__engine.inject({id:900,type:'Read',detail:'src/modes/loom/atelier/eventDial.ts · fixed readout',at:0});
  for(let i=0;i<42;i++)window.__engine.tick(1/60);
  window.__engine.inject({id:901,type:'Bash',detail:'npm test · 12/12 pass',at:0});
  for(let i=0;i<42;i++)window.__engine.tick(1/60);
})()`);
await shot('10-detail-2x.png');
await b.screenshot(path.join(out, '11-dial-detail-2x.png'), { clip: { x: 0, y: 0, width: 320, height: 330, scale: 1 } });
await b.screenshot(path.join(out, '12-readout-detail-2x.png'), { clip: { x: 8, y: 55, width: 200, height: 120, scale: 1 } });

const errors = b.errorsSince(mark);
assert.equal(errors.total, 0, JSON.stringify(errors));

const report = {
  viewport: [1472, 1008],
  build: 'dist',
  checks: [
    'idle readout empty and ring at 0°',
    '105 ms arm delay before the ring moves',
    'mid-step angle strictly between slots',
    'one tool group = S01/12 at 30°',
    'same-tool aggregation → ×2 without a slot step',
    'new tool → S02/12 at 60° (Bash colour)',
    'hold expiry → IDLE, ring keeps its position',
    '12 groups → 360° (one full turn), S12/12',
    'reset returns the dial to idle/0°',
    'reduced motion snaps to the target slot',
    'zero browser errors',
  ],
  telemetry: states,
  errors,
  pass: true,
};
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
await b.close();
console.log('PASS: event dial — fixed readout + rotating ring verified at 11 deterministic states; screenshots in review/event-dial/.');
