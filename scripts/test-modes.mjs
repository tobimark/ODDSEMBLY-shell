/**
 * Node-only logic test suite for the KunlunMeta engine — FINAL Loom-only scope.
 *
 *   node scripts/test-modes.mjs            # run all groups
 *   node scripts/test-modes.mjs --filter=loom
 *
 * Groups (delivery scope: Loom running through the reusable engine):
 *   core/replay       ReplayPlayer ordering, pause semantics, stable event ids
 *   core/spring       spring integrator determinism, bounds, easings, PRNG, tweens
 *   core/simulator    deterministic simulator sequence, ids/types, stop semantics
 *   loom/mechanism    shed precedes shuttle, one commit per event, FIFO, stop
 *   loom/linkage      fixed-length rod + crank constraints over the pose sweep
 *   fixtures/replay   public/replay/loom-session.json sanity (12 events, monotonic)
 *
 * Chips and Westworld are ARCHIVED experiments (user scope decision): their
 * pure-logic tests are intentionally not part of this suite. The snapshot with
 * those tests (51 checks) is preserved under review/v2/archive/.
 *
 * TypeScript modules are loaded with ts.transpileModule and imported from data:
 * URLs, the same trick as scripts/test-mechanism.mjs. Relative imports are
 * rewritten recursively so pure modules that share types stay testable.
 * Writes review/v2/test-results.json; exits 1 on any failed check.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
if (argv.help) {
  console.log('usage: node scripts/test-modes.mjs [--filter=group-substring]');
  process.exit(0);
}
const filter = argv.filter ? String(argv.filter).toLowerCase() : null;
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

/* ------------------------------------------------------- TypeScript ESM loader */
const tsUrlCache = new Map();
const tsModuleCache = new Map();
function resolveTsImport(fromAbs, spec) {
  const base = path.resolve(path.dirname(fromAbs), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts')];
  for (const cand of candidates) if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  return null;
}
/** Transpile a .ts file (recursively rewriting relative imports) to a data: URL. */
async function loadTsUrl(relPath) {
  const abs = path.resolve(root, relPath);
  if (tsUrlCache.has(abs)) return tsUrlCache.get(abs);
  const promise = (async () => {
    if (!fs.existsSync(abs)) throw new Error(`module not found: ${relPath}`);
    const source = fs.readFileSync(abs, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      fileName: abs,
    });
    let js = outputText;
    const specs = new Set();
    const re = /from\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = re.exec(js))) specs.add(match[1]);
    for (const spec of specs) {
      const resolved = resolveTsImport(abs, spec);
      if (!resolved) throw new Error(`unresolved relative import '${spec}' in ${relPath}`);
      const depUrl = await loadTsUrl(rel(resolved));
      js = js.split(`from '${spec}'`).join(`from '${depUrl}'`).split(`from "${spec}"`).join(`from '${depUrl}'`);
    }
    return dataUrl(js);
  })();
  tsUrlCache.set(abs, promise);
  return promise;
}
/** Import a .ts module for tests (returns the module namespace). */
async function loadTs(relPath) {
  const abs = path.resolve(root, relPath);
  if (tsModuleCache.has(abs)) return tsModuleCache.get(abs);
  const promise = (async () => import(await loadTsUrl(relPath)))();
  tsModuleCache.set(abs, promise);
  return promise;
}

/* --------------------------------------------------------------- test registry */
const groups = [];
let current = null;
function group(name, runner) { groups.push({ name, runner }); }
function check(name, fn) {
  try {
    fn();
    current.push({ name, status: 'pass' });
  } catch (err) {
    current.push({ name, status: 'fail', error: String(err?.message || err).slice(0, 600) });
  }
}
function skip(name, reason) { current.push({ name, status: 'skip', reason: String(reason) }); }

const fixtureEvents = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  type: ['Read', 'Edit', 'Write', 'Bash', 'Search'][i % 5],
  detail: `fixture ${i + 1}`,
  at: i * 120,
}));

/* -------------------------------------------------------------------- core/replay */
group('core/replay', async () => {
  const { ReplayPlayer, replayToolEvent } = await loadTs('src/engine/core/replay.ts');
  check('total/cursor start at 3/0', () => { const p = new ReplayPlayer({ name: 't', events: [{ at: 300, type: 'Read', detail: 'a' }, { at: 100, type: 'Edit', detail: 'b' }, { at: 200, type: 'Write', detail: 'c' }] }); assert.equal(p.total, 3); assert.equal(p.cursor, 0); assert.equal(p.done, false); });
  check('events release in sorted time order', () => {
    const p = new ReplayPlayer({ name: 't', events: [{ at: 300, type: 'Read', detail: 'a' }, { at: 100, type: 'Edit', detail: 'b' }, { at: 200, type: 'Write', detail: 'c' }] });
    assert.deepEqual(p.advance(99), []);
    assert.deepEqual(p.advance(1).map((e) => e.type), ['Edit']);
    assert.deepEqual(p.advance(100).map((e) => e.type), ['Write']);
    assert.deepEqual(p.advance(100).map((e) => e.type), ['Read']);
    assert.equal(p.cursor, 3); assert.equal(p.done, true); assert.equal(p.elapsedMs, 300);
  });
  check('reset rewinds cursor and clock', () => { const p = new ReplayPlayer({ name: 't', events: [{ at: 10, type: 'Read', detail: 'a' }] }); p.advance(20); assert.equal(p.done, true); p.reset(); assert.equal(p.cursor, 0); assert.equal(p.done, false); assert.equal(p.elapsedMs, 0); });
  check('zero/negative advance does not move the clock', () => { const p = new ReplayPlayer({ name: 't', events: [{ at: 10, type: 'Read', detail: 'a' }] }); p.advance(5); p.advance(0); p.advance(-5); assert.equal(p.elapsedMs, 5); assert.equal(p.cursor, 0); });
  check('replayToolEvent gives stable ids 1..N and keeps detail/at', () => {
    const e = replayToolEvent({ at: 42, type: 'Bash', detail: 'npm run build' }, 0, 1234);
    assert.deepEqual(e, { id: 1, type: 'Bash', detail: 'npm run build', at: 1234 });
    assert.equal(replayToolEvent({ at: 0, type: 'Read', detail: 'x' }, 11, 0).id, 12);
  });
});

/* -------------------------------------------------------------------- core/spring */
group('core/spring', async () => {
  const spring = await loadTs('src/engine/core/spring.ts');
  const { Spring, clamp, lerp, smoothstep, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, mulberry32, hashString, tween, stepTween, restartTween, springToward } = spring;
  check('two identical springs produce bit-identical state', () => {
    const a = new Spring(0, { stiffness: 150, damping: 18 }); const b = new Spring(0, { stiffness: 150, damping: 18 });
    a.target = 1; b.target = 1;
    for (let i = 0; i < 600; i++) { a.step(1 / 60); b.step(1 / 60); }
    assert.equal(a.value, b.value); assert.equal(a.velocity, b.velocity);
    assert(Math.abs(a.value - 1) < 1e-3, `spring did not settle: ${a.value}`);
    assert.equal(a.settled, true);
  });
  check('spring respects min/max bounds and zero velocity on snap', () => {
    const s = new Spring(0, { stiffness: 300, damping: 4, min: -1, max: 2 });
    s.target = 10; for (let i = 0; i < 2000; i++) s.step(1 / 60);
    assert(s.value <= 2 + 1e-9, `value ${s.value} above max`);
    s.snap(0.5); assert.equal(s.value, 0.5); assert.equal(s.target, 0.5); assert.equal(s.velocity, 0);
  });
  check('springToward only retargets', () => { const s = new Spring(0); springToward(s, 3); assert.equal(s.target, 3); assert.equal(s.value, 0); });
  check('scalar helpers are clamped and hit endpoints', () => {
    assert.equal(clamp(5, 0, 1), 1); assert.equal(clamp(-5, 0, 1), 0); assert.equal(clamp(0.4, 0, 1), 0.4);
    assert.equal(lerp(0, 10, 0.25), 2.5);
    assert.equal(smoothstep(0, 1, 0), 0); assert.equal(smoothstep(0, 1, 1), 1); assert.equal(smoothstep(0, 1, 0.5), 0.5);
    assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1);
    assert.equal(easeInCubic(0), 0); assert.equal(easeInCubic(1), 1);
    assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1);
    assert(Math.abs(easeOutBack(0)) < 1e-12); assert(Math.abs(easeOutBack(1) - 1) < 1e-12);
  });
  check('mulberry32 is deterministic, in [0,1) and seed-sensitive', () => {
    const a = mulberry32(123); const b = mulberry32(123); const c = mulberry32(124);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    assert.deepEqual(seqA, seqB);
    assert(seqA.every((v) => v >= 0 && v < 1));
    assert.notDeepEqual(seqA, Array.from({ length: 100 }, () => c()));
  });
  check('hashString is stable and unsigned', () => {
    assert.equal(hashString('loom'), hashString('loom'));
    assert.notEqual(hashString('loom'), hashString('chips'));
    for (const s of ['', 'a', 'src/engine/modes/loom/scene.ts']) { const h = hashString(s); assert(Number.isInteger(h) && h >= 0); }
  });
  check('tween lifecycle drives from -> to and deactivates', () => {
    const tw = tween(0, 1, 0.5); assert.equal(tw.value, 0); assert.equal(tw.active, false);
    restartTween(tw, 0, 1, 0.5); assert.equal(tw.active, true);
    stepTween(tw, 0.25); assert(Math.abs(tw.value - 0.875) < 1e-9, `value ${tw.value}`); // easeOutCubic(0.5)
    stepTween(tw, 0.25); assert.equal(tw.value, 1); assert.equal(tw.active, false);
  });
});

/* ----------------------------------------------------------------- core/simulator */
group('core/simulator', async () => {
  const { AgentSimulator } = await loadTs('src/engine/core/simulator.ts');
  const TOOL_TYPES = ['Read', 'Edit', 'Write', 'Bash', 'Search'];
  const run = (frames) => {
    const events = [];
    const sim = new AgentSimulator((e) => events.push(e));
    sim.start();
    for (let i = 0; i < frames; i++) sim.update(1 / 60);
    return events;
  };
  check('identical step sequences produce identical simulated decisions', () => {
    const a = run(3600); const b = run(3600);
    const shape = (list) => list.map((e) => `${e.id}:${e.type}:${e.detail}`);
    assert.deepEqual(shape(a), shape(b));
    assert(a.length > 0, 'simulator produced no events');
  });
  check('simulated events use ids 1..N in order, valid types and details', () => {
    const events = run(3600);
    assert(events.length > 5, `only ${events.length} events`);
    events.forEach((e, i) => { assert.equal(e.id, i + 1); assert(TOOL_TYPES.includes(e.type)); assert(typeof e.detail === 'string' && e.detail.length > 0); });
  });
  check('stop() halts emission until start() again', () => {
    const events = []; const sim = new AgentSimulator((e) => events.push(e)); sim.start();
    for (let i = 0; i < 600; i++) sim.update(1 / 60);
    sim.stop(); const n = events.length;
    for (let i = 0; i < 600; i++) sim.update(1 / 60);
    assert.equal(events.length, n);
    sim.start(); for (let i = 0; i < 600; i++) sim.update(1 / 60);
    assert(events.length > n);
  });
  check('pause() freezes emission and resume() continues', () => {
    const events = []; const sim = new AgentSimulator((e) => events.push(e)); sim.start();
    for (let i = 0; i < 300; i++) sim.update(1 / 60);
    sim.pause(); const n = events.length;
    for (let i = 0; i < 300; i++) sim.update(1 / 60);
    assert.equal(events.length, n);
    sim.resume(); for (let i = 0; i < 300; i++) sim.update(1 / 60);
    assert(events.length > n);
  });
});

/* --------------------------------------------------------------- loom/mechanism */
group('loom/mechanism', async () => {
  const { Mechanism } = await loadTs('src/engine/modes/loom/atelier/mechanism.ts');
  const make = () => { const m = new Mechanism(); const committed = []; m.onPick = (e) => committed.push(e.id); return { m, committed }; };
  check('12 queued events: shed precedes shuttle and no early commit', () => {
    const { m } = make(); fixtureEvents.forEach((e) => m.push(e));
    m.update(0.3); assert(m.shed > 0.9); assert.equal(m.travel, 0); assert.equal(m.picks, 0);
    m.update(0.4); assert(m.travel > 0 && m.travel < 1); assert.equal(m.picks, 0); assert.equal(m.beat, 0);
    m.update(0.5); assert.equal(m.shed, 0); assert.equal(m.travel, 1); assert.equal(m.picks, 0);
    m.update(0.25); assert.equal(m.picks, 1); assert(m.beat > 0.8);
  });
  check('12 events commit 12 picks in FIFO order; queue drains; stage returns READY', () => {
    const { m, committed } = make(); fixtureEvents.forEach((e) => m.push(e));
    m.update(22);
    assert.equal(m.picks, 12); assert.equal(m.active, null); assert.deepEqual(committed, fixtureEvents.map((e) => e.id));
    const snap = m.snapshot(); assert.equal(snap.queued, 0); assert.equal(snap.stage, 'READY'); assert.equal(snap.phase, 0);
  });
  check('frame-step independence: 2400 x 0.01 s equals one 22 s step', () => {
    const a = make().m; fixtureEvents.forEach((e) => a.push(e)); a.update(22);
    const b = make().m; fixtureEvents.forEach((e) => b.push(e)); for (let i = 0; i < 2400; i++) b.update(0.01);
    assert.equal(b.picks, a.picks); assert(Math.abs(a.angle - b.angle) < 1e-8);
  });
  check('stop() cancels the queue and never commits the cancelled event', () => {
    const { m } = make(); fixtureEvents.forEach((e) => m.push(e));
    m.update(0.4); m.push({ id: 99, type: 'Read', detail: 'late', at: 0 }); m.stop(); m.update(10);
    assert.equal(m.picks, 0); assert.equal(m.active, null); assert.equal(m.queue.length, 0);
  });
});

/* ----------------------------------------------------------------- loom/linkage */
group('loom/linkage', async () => {
  const { solveLinkage } = await loadTs('src/engine/modes/loom/atelier/linkage.ts');
  check('4002 pose sweep keeps fixed 75 px rod / 25 px crank (12,006 constraints)', () => {
    let maxError = 0;
    let poses = 0;
    for (let i = 0; i <= 4001; i++) {
      const lift = 19 * Math.sin((i / 4001) * Math.PI * 2);
      const beat = (29 * (1 + Math.sin((i / 4001) * Math.PI * 2))) / 2;
      for (const [base, dy] of [[419, -lift], [531, lift], [649, beat]]) {
        const k = solveLinkage({ x: 1260, y: base + 70 }, { x: 1220, y: base + dy });
        const err = Math.abs(Math.hypot(k.pin.x - k.slider.x, k.pin.y - k.slider.y) - 75);
        maxError = Math.max(maxError, err); assert(err < 1e-9);
        assert(Math.abs(Math.hypot(k.pin.x - k.center.x, k.pin.y - k.center.y) - 25) < 1e-9);
        assert(Number.isFinite(k.angle));
        poses += 1;
      }
    }
    assert.equal(poses, 12006);
    assert(maxError < 1e-9);
  });
  check('impossible geometry throws instead of returning fake joints', () => {
    assert.throws(() => solveLinkage({ x: 0, y: 0 }, { x: 0, y: 200 }));
  });
});

/* ---------------------------------------------------------------- fixtures/replay */
group('fixtures/replay', async () => {
  const replayDir = path.join(root, 'public', 'replay');
  const files = fs.existsSync(replayDir) ? fs.readdirSync(replayDir).filter((f) => f.endsWith('.json')) : [];
  check('public/replay/loom-session.json exists (final delivery session)', () => assert(files.includes('loom-session.json'), `files: ${files.join(',') || '(none)'}`));
  for (const f of files) {
    check(`${f}: 12 events, valid types, monotonic times, non-empty details`, () => {
      const file = JSON.parse(fs.readFileSync(path.join(replayDir, f), 'utf8'));
      assert.equal(typeof file.name, 'string');
      assert(Array.isArray(file.events));
      assert.equal(file.events.length, 12, `expected 12 events, got ${file.events.length}`);
      let last = -Infinity;
      for (const e of file.events) {
        assert(Number.isFinite(e.at) && e.at >= 0, `bad at: ${JSON.stringify(e)}`);
        assert(['Read', 'Edit', 'Write', 'Bash', 'Search'].includes(e.type), `bad type: ${e.type}`);
        assert(typeof e.detail === 'string' && e.detail.length > 0);
        assert(e.at >= last, `non-monotonic times: ${e.at} after ${last}`);
        last = e.at;
      }
      if (file.mode !== undefined) {
        if (file.mode === 'loom') assert(true);
        else skip(`${f}: mode is archived experiment (${file.mode})`, 'data validated for sanity only; not part of Loom-only delivery');
      }
    });
  }
  const archivedSessions = files.filter((f) => f !== 'loom-session.json' && f !== 'agent-session.json');
  if (archivedSessions.length) current.push({ name: `archived-mode replay sessions present (${archivedSessions.join(', ')})`, status: 'info', reason: 'validated for data sanity only — not part of delivery' });
});

/* --------------------------------------------------------------------- main */
const startedAt = new Date();
const results = [];
let pass = 0; let fail = 0; let skipCount = 0;
for (const g of groups) {
  if (filter && !g.name.toLowerCase().includes(filter)) continue;
  current = [];
  try {
    await g.runner();
  } catch (err) {
    current.push({ name: `${g.name}: group bootstrap`, status: 'fail', error: String(err?.stack || err).slice(0, 800) });
  }
  for (const c of current) {
    if (c.status === 'pass') pass += 1;
    else if (c.status === 'fail') fail += 1;
    else if (c.status === 'skip') skipCount += 1;
  }
  results.push({ group: g.name, checks: current });
  const statuses = current.map((c) => c.status);
  console.log(`${statuses.includes('fail') ? 'FAIL' : 'PASS'} ${g.name.padEnd(18)} ${current.filter((c) => c.status === 'pass').length} pass, ${current.filter((c) => c.status === 'fail').length} fail, ${current.filter((c) => c.status === 'skip').length} skip`);
  for (const c of current) {
    if (c.status === 'fail') console.log(`     FAIL ${c.name}\n          ${c.error}`);
    else if (c.status === 'skip') console.log(`     SKIP ${c.name} — ${c.reason}`);
    else if (c.status === 'info') console.log(`     INFO ${c.name}`);
  }
}
const report = {
  schema: 'kunlunmeta-v2-node-tests/1',
  generatedAt: startedAt.toISOString(),
  command: `node scripts/test-modes.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  node: process.version,
  scope: 'loom-final',
  archivedModes: 'Chips/Westworld pure-logic tests were run before the scope change; that 51-check snapshot is preserved under review/v2/archive/. They are intentionally excluded here.',
  filter,
  groups: results,
  summary: {
    groups: results.length,
    checks: pass + fail + skipCount,
    pass,
    fail,
    skip: skipCount,
    passAll: fail === 0,
    finishedAt: new Date().toISOString(),
    durationSeconds: (Date.now() - startedAt.getTime()) / 1000,
  },
};
const outFile = path.join(root, 'review', 'v2', 'test-results.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\n=== test-modes summary ===`);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${rel(outFile)}`);
process.exit(fail === 0 ? 0 : 1);
