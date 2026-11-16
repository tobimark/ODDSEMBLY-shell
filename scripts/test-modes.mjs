/**
 * Node-only logic test suite for the multi-mode engine (no browser, no Pixi).
 *
 *   node scripts/test-modes.mjs            # run all groups
 *   node scripts/test-modes.mjs --filter=loom
 *
 * Groups:
 *   core/replay       ReplayPlayer ordering, pause semantics, stable event ids
 *   core/spring       spring integrator determinism, bounds, easings, PRNG, tweens
 *   core/simulator    deterministic simulator sequence, ids/types, stop semantics
 *   loom/mechanism    shed precedes shuttle, one commit per event, FIFO, stop
 *   loom/linkage      fixed-length rod + crank constraints over the pose sweep
 *   fixtures/replay   public/replay/*.json sanity (12 events, valid types, monotonic)
 *   chips/logic       pure Chips modules: discovery now, semantic tests once the API
 *                     is confirmed (SKIPPED explicitly while absent/unconfirmed)
 *   westworld/logic   pure Westworld machine: same discovery/SKIP policy
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
async function checkAsync(name, fn) {
  try {
    await fn();
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
  check('4002 pose sweep keeps fixed 75 px rod / 25 px crank', () => {
    let maxError = 0;
    for (let i = 0; i <= 4001; i++) {
      const lift = 19 * Math.sin((i / 4001) * Math.PI * 2);
      const beat = (29 * (1 + Math.sin((i / 4001) * Math.PI * 2))) / 2;
      for (const [base, dy] of [[419, -lift], [531, lift], [649, beat]]) {
        const k = solveLinkage({ x: 1260, y: base + 70 }, { x: 1220, y: base + dy });
        const err = Math.abs(Math.hypot(k.pin.x - k.slider.x, k.pin.y - k.slider.y) - 75);
        maxError = Math.max(maxError, err); assert(err < 1e-9);
        assert(Math.abs(Math.hypot(k.pin.x - k.center.x, k.pin.y - k.center.y) - 25) < 1e-9);
        assert(Number.isFinite(k.angle));
      }
    }
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
  check('public/replay/loom-session.json exists', () => assert(files.includes('loom-session.json'), `files: ${files.join(',') || '(none)'}`));
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
      if (file.mode !== undefined) assert(['loom', 'chips', 'westworld'].includes(file.mode));
    });
  }
  for (const mode of ['chips', 'westworld']) {
    const name = `${mode}-session.json`;
    if (files.includes(name)) {
      check(`${name}: ReplayPlayer reads 12 events in order`, () => {
        const file = JSON.parse(fs.readFileSync(path.join(replayDir, name), 'utf8'));
        assert.equal(file.events.length, 12);
        const sorted = [...file.events].sort((a, b) => a.at - b.at);
        assert.deepEqual(sorted.map((e) => e.at), file.events.map((e) => e.at));
      });
    } else {
      skip(`${name} exists`, `missing public/replay/${name} — engine currently falls back to ?session=replay/loom-session.json (owner: ${mode}-dev; requested via QA message)`);
    }
  }
});

/* ------------------------------------- WIP pure-mode discovery (chips / westworld) */
function listPureCandidates(dirRel) {
  const abs = path.join(root, dirRel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => `${dirRel}/${f}`)
    .filter((relPath) => {
      const src = fs.readFileSync(path.join(root, relPath), 'utf8');
      return !/from\s+['"]pixi\.js['"]/.test(src); // pure logic only: no renderer imports
    });
}
async function discoverGroup(groupName, dirRel, knownTests) {
  group(groupName, async () => {
    const candidates = listPureCandidates(dirRel);
    if (!candidates.length) {
      skip(`${dirRel} pure logic modules present`, `${dirRel}/ has no non-Pixi modules yet — mode WIP, semantic tests SKIPPED`);
      return;
    }
    const exportsByFile = {};
    for (const relPath of candidates) {
      await checkAsync(`${relPath}: transpiles and imports without Pixi`, async () => {
        const mod = await loadTs(relPath);
        exportsByFile[relPath] = Object.keys(mod);
        assert(Object.keys(mod).length > 0, 'module has no exports');
      });
      // record discovered API surface for review/debug even if no test is registered yet
      if (exportsByFile[relPath]) {
        current.push({ name: `${relPath}: exports [${exportsByFile[relPath].join(', ')}]`, status: 'info' });
      }
    }
    const allExports = Object.values(exportsByFile).flat();
    for (const [testName, matcher] of Object.entries(knownTests)) {
      const hit = matcher(exportsByFile, allExports);
      if (!hit) { skip(testName, `required export not discovered yet (exports: ${allExports.join(', ') || 'none'})`); continue; }
      await checkAsync(testName, async () => { await hit(); });
    }
    const pending = Object.keys(knownTests).length === 0;
    if (pending) skip(`${dirRel} semantic assertions`, 'API not confirmed by owner yet — discovery only (QA will add tests when owner replies)');
  });
}
// Known-API test registry. Each entry is resolved only when the owning module's
// expected export is actually discovered; otherwise the check is SKIPPED (never
// silently passed). Chips API confirmed from src/engine/modes/chips/cards.ts.
const fileHasExport = (byFile, fileSuffix, exportName) =>
  Object.entries(byFile).some(([file, keys]) => file.endsWith(fileSuffix) && keys.includes(exportName));
const chipsTests = {
  'cards: RankDeck draws are deterministic for a fixed seed': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'RankDeck') && (async () => {
    const { RankDeck } = await loadTs('src/engine/modes/chips/cards.ts');
    const shape = (d) => Array.from({ length: 20 }, (_, i) => { const c = d.draw('Read', i + 1, 'x'); return `${c.rank}:${c.edition}`; });
    assert.deepEqual(shape(new RankDeck(12345)), shape(new RankDeck(12345)));
    assert.notDeepEqual(shape(new RankDeck(12345)), shape(new RankDeck(54321)));
  }),
  'cards: RankDeck covers ranks 1..9, reshuffles after 45 and peek does not consume': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'RankDeck') && (async () => {
    const { RankDeck } = await loadTs('src/engine/modes/chips/cards.ts');
    const deck = new RankDeck(7);
    const peeked = deck.peek(5);
    const drawn = [0, 1, 2, 3, 4].map((i) => deck.draw('Read', i + 1));
    assert.deepEqual(peeked.map((p) => `${p.rank}:${p.edition}`), drawn.map((c) => `${c.rank}:${c.edition}`));
    const fresh = new RankDeck(7);
    const ranks = new Set();
    for (let i = 0; i < 45; i++) { const c = fresh.draw('Read', i + 1); assert(c.rank >= 1 && c.rank <= 9); ranks.add(c.rank); }
    assert.equal(fresh.remaining, 0);
    assert.deepEqual([...ranks].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const after = fresh.draw('Read', 46);
    assert(after.rank >= 1 && after.rank <= 9);
    assert.equal(fresh.remaining, 44, 'reshuffle should refill the deck');
  }),
  'cards: evaluateHand classifies all ten combo tiers': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'evaluateHand') && (async () => {
    const { evaluateHand } = await loadTs('src/engine/modes/chips/cards.ts');
    const card = (rank, family, edition = 'plain') => ({ id: 0, family, rank, edition, detailText: '' });
    const hand = (ranks, families) => ranks.map((r, i) => card(r, families[i]));
    const cases = [
      ['HIGH_CARD', [[1, 3, 5, 7, 9], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['PAIR', [[2, 2, 5, 7, 9], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['TWO_PAIR', [[2, 2, 5, 5, 9], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['THREE', [[3, 3, 3, 6, 9], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['STRAIGHT', [[1, 2, 3, 4, 5], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['FLUSH', [[2, 4, 6, 8, 9], ['Read', 'Read', 'Read', 'Read', 'Read']]],
      ['FULL_HOUSE', [[4, 4, 4, 7, 7], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['FOUR', [[5, 5, 5, 5, 9], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
      ['STRAIGHT_FLUSH', [[1, 2, 3, 4, 5], ['Read', 'Read', 'Read', 'Read', 'Read']]],
      ['FIVE_OF_A_KIND', [[6, 6, 6, 6, 6], ['Read', 'Edit', 'Write', 'Bash', 'Read']]],
    ];
    for (const [expected, [ranks, families]] of cases) {
      assert.equal(evaluateHand(hand(ranks, families)).combo, expected, `${expected} misclassified`);
    }
    // Search cards are wild for flush completion
    assert.equal(evaluateHand(hand([1, 3, 5, 7, 9], ['Read', 'Read', 'Read', 'Read', 'Search'])).combo, 'FLUSH');
  }),
  'cards: tool effects (edit mult / write chips / bash overheat) and score formula': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'evaluateHand') && (async () => {
    const cards = await loadTs('src/engine/modes/chips/cards.ts');
    const { evaluateHand, COMBOS, TOOL_CHIPS } = cards;
    const card = (rank, family) => ({ id: 0, family, rank, edition: 'plain', detailText: '' });
    const hand = [card(3, 'Edit'), card(3, 'Bash'), card(3, 'Write'), card(6, 'Read'), card(9, 'Search')];
    const r = evaluateHand(hand);
    assert.equal(r.combo, 'THREE');
    assert.equal(r.multBonus, 0.25);
    assert.equal(r.chipBonus, 10);
    assert.equal(r.overheat, false);
    const expectedBase = 20 + hand.reduce((acc, c) => acc + c.rank * 8 + TOOL_CHIPS[c.family], 0);
    assert.equal(r.baseChips, expectedBase);
    assert.equal(r.handChips, expectedBase + 10);
    assert.equal(r.totalMult, Math.round((COMBOS.THREE.mult + 0.25) * 100) / 100);
    assert.equal(r.score, Math.round(r.handChips * r.totalMult));
    assert(r.lines.some((l) => l.startsWith('SCORE')));
    const hot = evaluateHand([card(1, 'Bash'), card(3, 'Bash'), card(5, 'Bash'), card(7, 'Read'), card(9, 'Write')]);
    assert.equal(hot.combo, 'HIGH_CARD');
    assert.equal(hot.overheat, true);
    assert.equal(hot.chipBonus, 40 + 10);
    assert.equal(hot.totalMult, 1.5, `HIGH_CARD + overheat expected 1.5, got ${hot.totalMult}`);
    // determinism: pure function, same hand => identical result object
    assert.deepEqual(evaluateHand(hand), evaluateHand(hand));
  }),
  'cards: handQuota rises within an ante and between antes': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'handQuota') && (async () => {
    const { handQuota } = await loadTs('src/engine/modes/chips/cards.ts');
    assert.equal(handQuota(1, 1), 640);
    for (let ante = 1; ante <= 3; ante++) {
      const values = [1, 2, 3].map((n) => handQuota(ante, n));
      assert(values[0] < values[1] && values[1] < values[2], `quota not rising within ante ${ante}: ${values}`);
      values.forEach((v) => assert(Number.isInteger(v) && v > 0));
    }
    assert(handQuota(2, 1) > handQuota(1, 1), 'quota should rise between antes');
    assert(handQuota(3, 1) > handQuota(2, 1), 'quota should rise between antes');
  }),
  'cards: projectedChips grows with dealt cards and matches full-hand score': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'projectedChips') && (async () => {
    const { projectedChips, evaluateHand } = await loadTs('src/engine/modes/chips/cards.ts');
    const card = (rank, family) => ({ id: 0, family, rank, edition: 'plain', detailText: '' });
    assert.equal(projectedChips([]), 0);
    const one = projectedChips([card(5, 'Read')]);
    const three = projectedChips([card(5, 'Read'), card(6, 'Write'), card(2, 'Edit')]);
    assert(one > 0 && three > one, `projection not growing: ${one} -> ${three}`);
    const hand = [card(2, 'Read'), card(2, 'Edit'), card(5, 'Write'), card(7, 'Search'), card(9, 'Read')];
    assert.equal(projectedChips(hand), evaluateHand(hand).score);
  }),
  'cards: combo table ordering, tool family table and edition labels': (byFile) => fileHasExport(byFile, '/chips/cards.ts', 'COMBOS') && (async () => {
    const { COMBOS, FAMILIES, TOOL_CHIPS, TOOL_NOTES, editionLabel } = await loadTs('src/engine/modes/chips/cards.ts');
    const order = ['HIGH_CARD', 'PAIR', 'TWO_PAIR', 'THREE', 'STRAIGHT', 'FLUSH', 'FULL_HOUSE', 'FOUR', 'STRAIGHT_FLUSH', 'FIVE_OF_A_KIND'];
    for (let i = 1; i < order.length; i++) assert(COMBOS[order[i]].mult > COMBOS[order[i - 1]].mult, `mult order broken at ${order[i]}`);
    assert.deepEqual(FAMILIES, ['Read', 'Edit', 'Write', 'Bash', 'Search']);
    FAMILIES.forEach((f) => { assert(TOOL_CHIPS[f] > 0); assert(typeof TOOL_NOTES[f] === 'string' && TOOL_NOTES[f].length > 0); });
    assert.equal(editionLabel('plain'), '');
    assert.equal(editionLabel('foil'), 'FOIL');
    assert.equal(editionLabel('negative'), 'NEGATIVE');
  }),
};
const chipsLayoutTests = {
  'layout: hand fan is deterministic, symmetric and monotonic': (byFile) => fileHasExport(byFile, '/chips/layout.ts', 'handSlot') && (async () => {
    const { handSlot, LAYOUT } = await loadTs('src/engine/modes/chips/layout.ts');
    const slots = [0, 1, 2, 3, 4].map((i) => handSlot(i, 5));
    assert.deepEqual(slots, [0, 1, 2, 3, 4].map((i) => handSlot(i, 5)));
    for (let i = 1; i < 5; i++) assert(slots[i].x > slots[i - 1].x, 'hand slots not left-to-right');
    assert(Math.abs(slots[0].y - slots[4].y) < 1e-9);
    assert.deepEqual([slots[0].rot, slots[4].rot].map((r) => Math.round(r * 1e6) / 1e6), [-0.075, 0.075]);
    assert(Math.abs(slots[2].rot) < 1e-12);
    assert.equal(LAYOUT.hand.count, 5);
    assert(handSlot(2, 5).y <= handSlot(0, 5).y, 'centre card should sit highest');
  }),
  'layout: design-space boxes stay inside 1472x1008 and stock colours are valid': (byFile) => fileHasExport(byFile, '/chips/layout.ts', 'LAYOUT') && (async () => {
    const { LAYOUT, CARD_STOCK } = await loadTs('src/engine/modes/chips/layout.ts');
    for (const [name, box] of Object.entries(LAYOUT)) {
      if (typeof box !== 'object' || !('x' in box) || !('w' in box)) continue;
      assert(box.x >= 0 && box.y >= 0, `${name} starts off-canvas`);
      assert(box.x + box.w <= 1472 && box.y + box.h <= 1008, `${name} overflows design space`);
    }
    for (const [name, value] of Object.entries(CARD_STOCK)) assert(/^#[0-9A-Fa-f]{6}$/.test(value), `bad colour ${name}=${value}`);
  }),
};
// Westworld machine API confirmed from src/engine/modes/westworld/machine.ts.
const wwEvents = (types) => types.map((type, i) => ({ id: i + 1, type, detail: `ww ${i + 1}`, at: i * 120 }));
const wwDrain = (machine, maxSeconds = 40, dt = 1 / 60) => {
  let t = 0;
  while (machine.snapshot().queued > 0 && t < maxSeconds) { machine.update(dt); t += dt; }
  return t;
};
const westworldTests = {
  'machine: 12 events are deterministic and release twice (5-call cycle)': (byFile) => fileHasExport(byFile, '/westworld/machine.ts', 'WestworldMachine') && (async () => {
    const { WestworldMachine, FAMILY_SPEC } = await loadTs('src/engine/modes/westworld/machine.ts');
    const types = ['Read', 'Edit', 'Write', 'Bash', 'Search', 'Read', 'Edit', 'Write', 'Bash', 'Search', 'Read', 'Edit'];
    const run = () => { const m = new WestworldMachine(); wwEvents(types).forEach((e) => m.trigger(e)); wwDrain(m); return m.snapshot(); };
    const a = run(); const b = run();
    assert.deepEqual(a, b);
    assert.equal(a.total, 12);
    assert.equal(a.releases, 2, `releases=${a.releases}`);
    assert.equal(a.queued, 0);
    assert.equal(a.activeFamily, null);
    assert(a.pressure > 0 && a.pressure <= 1);
    assert(a.heat >= 0 && a.heat <= 1);
    for (const spec of Object.values(FAMILY_SPEC)) assert(spec.duration > 0);
  }),
  'machine: each tool family actuates its own subsystem with distinct effects': (byFile) => fileHasExport(byFile, '/westworld/machine.ts', 'WestworldMachine') && (async () => {
    const { WestworldMachine, FAMILY_SPEC } = await loadTs('src/engine/modes/westworld/machine.ts');
    const baseline = new WestworldMachine().snapshot();
    const results = {};
    for (const family of ['Read', 'Edit', 'Write', 'Bash', 'Search']) {
      const m = new WestworldMachine();
      m.trigger({ id: 1, type: family, detail: 'x', at: 0 });
      wwDrain(m);
      results[family] = m.snapshot();
    }
    assert.equal(results.Read.levels.intake > baseline.levels.intake, true, 'Read must fill the intake');
    assert.equal(results.Edit.levels.regulator > baseline.levels.regulator, true, 'Edit must raise the regulator');
    assert.equal(results.Write.levels.reservoir > baseline.levels.reservoir, true, 'Write must fill the reservoir');
    assert(results.Bash.heat > results.Read.heat, 'Bash must add more heat than Read');
    assert(results.Bash.pressure > results.Read.pressure, 'Bash must add more pressure than Read');
    for (const family of Object.keys(results)) assert(results[family].total === 1);
    // distinct subsystem families per tool
    const channels = new Set(Object.values(FAMILY_SPEC).map((s) => s.channel));
    assert.equal(channels.size, 5, `channels not distinct: ${[...channels]}`);
  }),
  'machine: 20 calls => 4 releases + 1 full purge; ticket ledger capped': (byFile) => fileHasExport(byFile, '/westworld/machine.ts', 'WestworldMachine') && (async () => {
    const { WestworldMachine, RELEASE_EVERY, PURGE_EVERY } = await loadTs('src/engine/modes/westworld/machine.ts');
    assert.equal(RELEASE_EVERY, 5);
    assert.equal(PURGE_EVERY, 20);
    const types = Array.from({ length: 20 }, (_, i) => ['Read', 'Edit', 'Write', 'Bash', 'Search'][i % 5]);
    const m = new WestworldMachine();
    wwEvents(types).forEach((e) => m.trigger(e));
    wwDrain(m, 60);
    const snap = m.snapshot();
    assert.equal(snap.total, 20);
    assert.equal(snap.releases, 4, `releases=${snap.releases}`);
    assert.equal(snap.purges, 1, `purges=${snap.purges}`);
    assert.equal(snap.lastPurge, 1);
    assert.equal(snap.queued, 0);
    assert.equal(m.tickets.length, 4, `ticket log=${m.tickets.length}`);
    assert.equal(snap.lastRelease.families.length, 5);
    assert(snap.lastRelease.ticket.length > 0);
    // purge resets the tanks to their base levels, never below it
    for (const level of Object.values(snap.levels)) assert(level >= 0 && level <= 1);
  }),
  'machine: reset() restores a fresh deterministic plant': (byFile) => fileHasExport(byFile, '/westworld/machine.ts', 'WestworldMachine') && (async () => {
    const { WestworldMachine } = await loadTs('src/engine/modes/westworld/machine.ts');
    const types = ['Read', 'Edit', 'Write', 'Bash', 'Search', 'Read', 'Edit'];
    const fresh = new WestworldMachine();
    wwEvents(types).forEach((e) => fresh.trigger(e)); wwDrain(fresh);
    const expected = fresh.snapshot();
    const reused = new WestworldMachine();
    wwEvents(types).forEach((e) => reused.trigger(e)); wwDrain(reused);
    reused.reset();
    wwEvents(types).forEach((e) => reused.trigger(e)); wwDrain(reused);
    assert.deepEqual(reused.snapshot(), expected);
  }),
  'machine: fx events are consumed once and include release/purge marks': (byFile) => fileHasExport(byFile, '/westworld/machine.ts', 'WestworldMachine') && (async () => {
    const { WestworldMachine } = await loadTs('src/engine/modes/westworld/machine.ts');
    const m = new WestworldMachine();
    wwEvents(Array.from({ length: 20 }, (_, i) => ['Read', 'Edit', 'Write', 'Bash', 'Search'][i % 5])).forEach((e) => m.trigger(e));
    wwDrain(m, 60);
    const fx = m.takeFx();
    assert(fx.filter((f) => f.kind === 'actuate').length === 20, `actuate fx=${fx.filter((f) => f.kind === 'actuate').length}`);
    assert(fx.filter((f) => f.kind === 'release').length === 4, 'release fx marks missing');
    assert(fx.filter((f) => f.kind === 'purge').length === 1, 'purge fx mark missing');
    assert.deepEqual(m.takeFx(), []);
  }),
};
const westworldLayoutTests = {
  'layout: dial needle maps pressure 0..1 monotonically and clamps': (byFile) => fileHasExport(byFile, '/westworld/layout.ts', 'pressureAngle') && (async () => {
    const { DIAL, pressureAngle } = await loadTs('src/engine/modes/westworld/layout.ts');
    assert.equal(pressureAngle(0), DIAL.start);
    assert(Math.abs(pressureAngle(1) - (DIAL.start + DIAL.sweep)) < 1e-12);
    const mid = pressureAngle(0.5);
    assert(mid > pressureAngle(0) && mid < pressureAngle(1));
    assert.equal(pressureAngle(-1), DIAL.start);
    assert.equal(pressureAngle(2), DIAL.start + DIAL.sweep);
    for (let i = 1; i <= 50; i++) assert(pressureAngle(i / 50) > pressureAngle((i - 1) / 50));
  }),
  'layout: plant tanks/valves/pipes stay inside the 1472x1008 design space': (byFile) => fileHasExport(byFile, '/westworld/layout.ts', 'PLANT') && (async () => {
    const { PLANT, PIPE_PATHS, SIDE, DIAL } = await loadTs('src/engine/modes/westworld/layout.ts');
    const inCanvas = (x, y, pad = 0) => x >= pad && y >= pad && x <= 1472 - pad && y <= 1008 - pad;
    for (const tank of PLANT.tanks) {
      assert(inCanvas(tank.cx - tank.r, tank.base - tank.h) && inCanvas(tank.cx + tank.r, tank.base), `tank ${tank.id} overflows`);
      assert(['intake', 'regulator', 'reservoir'].includes(tank.id));
    }
    assert.equal(new Set(PLANT.valves.map((v) => v.family)).size, 5, 'five valve families expected');
    for (const valve of PLANT.valves) assert(inCanvas(valve.x - PLANT.valveR, PLANT.valveY - PLANT.valveR) && inCanvas(valve.x + PLANT.valveR, PLANT.valveY + PLANT.valveR));
    for (const side of Object.values(SIDE)) assert(side.x >= 0 && side.y >= 0 && side.x + side.w <= 1472 && side.y + side.h <= 1008, 'side panel overflows');
    for (const path of PIPE_PATHS) {
      assert(path.pts.length >= 2, `pipe ${path.id} needs a polyline`);
      assert(['Read', 'Edit', 'Write', 'Bash', 'Search'].includes(path.family));
      for (const [x, y] of path.pts) assert(inCanvas(x, y), `pipe ${path.id} leaves the canvas at ${x},${y}`);
    }
    assert(DIAL.cx - DIAL.r >= 0 && DIAL.cx + DIAL.r <= 1472 && DIAL.cy - DIAL.r >= 0 && DIAL.cy + DIAL.r <= 1008, 'dial face overflows');
    assert(DIAL.needle <= DIAL.r);
  }),
};
await discoverGroup('chips/logic', 'src/engine/modes/chips', { ...chipsTests, ...chipsLayoutTests });
await discoverGroup('westworld/logic', 'src/engine/modes/westworld', { ...westworldTests, ...westworldLayoutTests });

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
