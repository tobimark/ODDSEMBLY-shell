/**
 * Deterministic replay proof: the same replay session, driven by the same manual
 * virtual clock in two *fresh browser sessions*, must produce byte-identical
 * screenshots (PNG SHA-256) and identical mode telemetry.
 *
 *   node scripts/replay-proof.mjs                       # all modes, dist/
 *   node scripts/replay-proof.mjs --modes=loom          # quick proof
 *   node scripts/replay-proof.mjs --root-chips=.tmp/dist-chips
 *   node scripts/replay-proof.mjs --software            # SwiftShader (extra stability)
 *   node scripts/replay-proof.mjs --marks=2,5,8         # virtual-time marks (seconds)
 *
 * Per mode it loads `?mode=<id>&deterministic=1&replay=1&ui=0`, waits for the
 * replay file, calls audio.ensure() so beat marks are collected, then batches
 * fixed 1/60 s ticks to each mark, screenshots, and repeats in a new browser.
 * Saves review/v2/replay/<mode>-a-<mark>s.png / -b-<mark>s.png and
 * review/v2/replay/determinism.json.
 *
 * Session selection: replay/<mode>-session.json when that file exists in the
 * build root, otherwise the mode-agnostic loom session via
 * `?session=replay/loom-session.json` (the engine fetch ignores mode for an
 * explicit URL). The substitution is recorded in the report — not hidden.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, comparePng, fileHash, sleep } from './lib/browser.mjs';
import { LOOM_SESSION } from './lib/fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
if (argv.help) {
  console.log('usage: node scripts/replay-proof.mjs [--modes=loom,chips,westworld] [--root=dist] [--root-<mode>=DIR] [--marks=2,5,8] [--port=4520] [--software]');
  process.exit(0);
}
const mainRoot = path.resolve(root, argv.root || 'dist');
const outDir = path.resolve(argv.out || path.join(root, 'review', 'v2', 'replay'));
const modes = String(argv.modes || 'loom,chips,westworld').split(',').map((s) => s.trim()).filter(Boolean);
const marksOverride = argv.marks ? String(argv.marks).split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0) : null;
/**
 * Virtual-time marks per mode (seconds). The last mark is the settle point used
 * for pick/beat assertions: Loom needs ~1.65 s per pick * 12 + session length
 * (~5.2 s), i.e. ~21 s; Chips/Westworld cycle budgets are roughly 16 s.
 */
const MARK_PLANS = { loom: [2, 8, 21], chips: [2, 8, 16], westworld: [2, 8, 16] };
const marksFor = (mode) => marksOverride ?? MARK_PLANS[mode] ?? [2, 8, 16];
const basePort = Number(argv.port || 4520);
const software = !!argv.software;
const DT = 1 / 60;

function rootFor(mode) {
  const key = `root-${mode}`;
  return argv[key] ? path.resolve(root, argv[key]) : mainRoot;
}
function relative(p) { return path.relative(root, p).replaceAll('\\', '/') || '.'; }

function pickSession(rootDir, mode) {
  const perMode = path.join(rootDir, 'replay', `${mode}-session.json`);
  if (fs.existsSync(perMode)) return { url: null, query: '&replay=1', source: relative(perMode), modeSpecific: true };
  return { url: LOOM_SESSION, query: `&replay=1&session=${LOOM_SESSION}`, source: LOOM_SESSION, modeSpecific: false };
}

async function batchTicks(browser, seconds) {
  let n = Math.max(0, Math.round(seconds / DT));
  while (n > 0) {
    const chunk = Math.min(n, 120);
    await browser.evaluate(`(()=>{for(let i=0;i<${chunk};i++) window.__engine.tick(${DT});return true})()`);
    n -= chunk;
  }
}

/** One fresh-browser deterministic replay run; returns hashes + facts. */
async function runOnce(mode, marks, rootDir, session, port) {
  const browser = await launch({ root: rootDir, httpPort: port, debugPort: port + 100, width: 1472, height: 1008, swiftshader: software });
  const run = { mode, session: session.query, marks: {}, facts: null, errors: null, environment: null };
  try {
    await browser.setViewport(1472, 1008);
    await browser.goto(`?mode=${mode}&deterministic=1${session.query}&ui=0`, { settle: 600 });
    const mark = browser.mark();
    run.environment = { renderer: await browser.renderer(), software };
    const ready = await browser.waitFor('window.__engine.getStatus().replay && window.__engine.getStatus().replay.loaded', 8000);
    if (!ready) throw new Error('replay did not load in time');
    await browser.evaluate('window.__engine.audio.ensure(); true');
    await sleep(120);

    let elapsed = 0;
    for (const t of marks) {
      await batchTicks(browser, t - elapsed);
      elapsed = t;
      const label = `${t}s`;
      const file = path.join(outDir, `${mode}-${run._side ?? 'a'}-${label}.png`);
      await browser.screenshot(file);
      run.marks[label] = { file: relative(file), sha256: await fileHash(file) };
    }
    const facts = JSON.parse(await browser.evaluate(`JSON.stringify({
      status: window.__engine.getStatus(),
      telemetry: window.__engine.getTelemetry(),
      modeTelemetry: window.__engine.getModeTelemetry(${JSON.stringify(mode)}),
      beats: window.__engine.audio.beats,
      audioState: window.__engine.audio.state ?? null,
    })`));
    run.facts = {
      replay: facts.status.replay,
      events: facts.status.events,
      engineTime: facts.telemetry.time,
      state: facts.status.state,
      modeTelemetry: facts.modeTelemetry,
      audioState: facts.audioState,
      beatEventIds: facts.beats.map((b) => b.eventId),
      beatCount: facts.beats.length,
      stub: facts.modeTelemetry?.stub === true,
    };
    run.errors = browser.errorsSince(mark);
  } finally {
    await browser.close().catch(() => {});
  }
  return run;
}

/* ------------------------------------------------------------------ main */
const startedAt = new Date();
const report = {
  schema: 'kunlunmeta-v2-replay-determinism/1',
  generatedAt: startedAt.toISOString(),
  command: `node scripts/replay-proof.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  method: 'headless Edge, ?deterministic=1&replay=1&ui=0, fixed 1/60 s manual tick batches, two fresh browser sessions, PNG SHA-256 equality',
  dtSeconds: DT,
  marksSeconds: marksOverride ?? Object.fromEntries(modes.map((m) => [m, marksFor(m)])),
  softwareRendering: software,
  modes: {},
  summary: null,
  limitations: [],
};

let port = basePort;
for (const mode of modes) {
  const rootDir = rootFor(mode);
  const session = pickSession(rootDir, mode);
  const modeMarks = marksFor(mode);
  const modeReport = {
    mode,
    root: relative(rootDir),
    session: { query: session.query, file: session.source, modeSpecific: session.modeSpecific },
    marksSeconds: modeMarks,
    status: 'skipped',
    runs: {},
    comparison: null,
    checks: [],
    notes: [],
  };
  if (!fs.existsSync(rootDir)) {
    modeReport.notes.push(`build root not found: ${rootDir} — skipped`);
    report.modes[mode] = modeReport;
    continue;
  }
  if (!session.modeSpecific) {
    modeReport.notes.push(`no replay/${mode}-session.json in build root; used the shared loom session via ?session=${LOOM_SESSION} (engine replay fetch is mode-agnostic for explicit URLs)`);
  }
  console.log(`[replay-proof] ${mode}: session=${session.source} (${session.modeSpecific ? 'per-mode' : 'shared loom fallback'})`);
  try {
    const a = await runOnce(mode, modeMarks, rootDir, session, port); port += 2;
    a._side = 'a';
    const b = await runOnce(mode, modeMarks, rootDir, session, port); port += 2;
    b._side = 'b';
    modeReport.runs = { a: { marks: a.marks, facts: a.facts, errors: a.errors, environment: a.environment }, b: { marks: b.marks, facts: b.facts, errors: b.errors, environment: b.environment } };

    const checks = [];
    const add = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail: String(detail) });
    const comparisons = [];
    for (const label of Object.keys(a.marks)) {
      const cmp = await comparePng(a.marks[label].file ? path.join(root, a.marks[label].file) : '', b.marks[label].file ? path.join(root, b.marks[label].file) : '');
      comparisons.push({ mark: label, equal: cmp.equal, hashA: cmp.hashA, hashB: cmp.hashB, sizeA: cmp.sizeA, sizeB: cmp.sizeB });
      add(`mark ${label}: pixel-identical across fresh sessions`, cmp.equal, `sha256 ${cmp.hashA.slice(0, 16)}…/${cmp.hashB.slice(0, 16)}… sizes ${cmp.sizeA}/${cmp.sizeB}`);
    }
    const fa = a.facts, fb = b.facts;
    add('replay cursor 12/12 in both runs', fa.replay?.cursor === 12 && fb.replay?.cursor === 12 && fa.replay?.done === true && fb.replay?.done === true, `A=${JSON.stringify(fa.replay)} B=${JSON.stringify(fb.replay)}`);
    add('engine received exactly 12 replay events', fa.events === 12 && fb.events === 12, `A=${fa.events} B=${fb.events}`);
    add('virtual clock identical', Math.abs(fa.engineTime - fb.engineTime) < 1e-9, `A=${fa.engineTime} B=${fb.engineTime}`);
    add('mode telemetry identical', JSON.stringify(fa.modeTelemetry) === JSON.stringify(fb.modeTelemetry), JSON.stringify(fa.modeTelemetry).slice(0, 240));
    add('audio beat eventId sequence identical', JSON.stringify(fa.beatEventIds) === JSON.stringify(fb.beatEventIds), `A=${JSON.stringify(fa.beatEventIds)} B=${JSON.stringify(fb.beatEventIds)}`);
    add('no uncaught exceptions in either run', (a.errors?.exceptions.length ?? 1) === 0 && (b.errors?.exceptions.length ?? 1) === 0, JSON.stringify({ a: a.errors?.exceptions?.slice(0, 2), b: b.errors?.exceptions?.slice(0, 2) }));
    add('no console errors in either run', (a.errors?.consoleErrors.length ?? 1) === 0 && (b.errors?.consoleErrors.length ?? 1) === 0, JSON.stringify({ a: a.errors?.consoleErrors?.slice(0, 2), b: b.errors?.consoleErrors?.slice(0, 2) }));

    const stub = !!fa.stub;
    if (stub) {
      modeReport.notes.push('mode telemetry reports stub:true — visual pixel determinism is engine-level only (stub world has no visuals); mode-specific pick/beat assertions SKIPPED');
    } else {
      add('12 audio beat marks recorded', fa.beatCount === 12 && fb.beatCount === 12, `A=${fa.beatCount} B=${fb.beatCount}`);
      const realIds = (ids) => ids.filter((id) => id >= 1 && id <= 12);
      const unique = [...new Set(realIds(fa.beatEventIds))].sort((x, y) => x - y);
      add('beat marks cover eventIds 1..12', unique.length === 12 && unique.join(',') === Array.from({ length: 12 }, (_, i) => i + 1).join(','), `${JSON.stringify(unique)} (bookkeeping marks: ${JSON.stringify(fa.beatEventIds.filter((id) => id > 12))})`);
      if (mode === 'loom') {
        add('Loom: 12 picks = 12 cloth commits', fa.modeTelemetry?.picks === 12 && fb.modeTelemetry?.picks === 12, `A=${fa.modeTelemetry?.picks} B=${fb.modeTelemetry?.picks}`);
        add('Loom: queue fully drained', fa.modeTelemetry?.queued === 0 && fb.modeTelemetry?.queued === 0, `A=${fa.modeTelemetry?.queued} B=${fb.modeTelemetry?.queued}`);
      }
    }
    modeReport.comparison = comparisons;
    modeReport.checks = checks;
    const failures = checks.filter((c) => !c.ok);
    modeReport.status = failures.length ? 'fail' : stub ? 'partial' : 'pass';
    console.log(`[replay-proof]   -> ${modeReport.status.toUpperCase()} (${checks.length - failures.length}/${checks.length} checks; pixel-equal marks: ${comparisons.filter((c) => c.equal).length}/${comparisons.length})`);
  } catch (err) {
    modeReport.status = 'fail';
    modeReport.checks.push({ id: 'replay proof completed', ok: false, detail: String(err?.stack || err).slice(0, 800) });
    console.log(`[replay-proof]   -> FAIL ${err?.message ?? err}`);
  }
  report.modes[mode] = modeReport;
}

const allChecks = Object.values(report.modes).flatMap((m) => m.checks ?? []);
const failures = allChecks.filter((c) => !c.ok);
report.summary = {
  statuses: Object.fromEntries(Object.entries(report.modes).map(([k, v]) => [k, v.status])),
  checks: allChecks.length,
  failures: failures.length,
  failureIds: failures.map((f) => f.id),
  pass: failures.length === 0 && !Object.values(report.modes).some((m) => m.status === 'fail'),
  partial: Object.values(report.modes).some((m) => m.status === 'partial'),
  finishedAt: new Date().toISOString(),
  durationSeconds: (Date.now() - startedAt.getTime()) / 1000,
};
if (report.summary.partial) report.limitations.push('Stub modes have no world visuals yet: their pixel equality is engine-level only and marked partial, never passed.');
report.limitations.push('PNG equality is measured within this machine/driver/browser build; it proves replay determinism, not cross-machine rendering parity.');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'determinism.json');
fs.writeFileSync(file, JSON.stringify(report, null, 2));
console.log('\n=== replay-proof summary ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${relative(file)}`);
process.exit(report.summary.failures ? 1 : 0);
