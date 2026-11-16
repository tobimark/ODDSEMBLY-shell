/**
 * V2 independent verification harness for the KunlunMeta engine.
 *
 * FINAL DELIVERY SCOPE = Loom only (user decision 2026-11-16): Chips and
 * Westworld were archived as experiments and do not ship. The per-mode profiles
 * for them are kept only for replaying archived evidence with explicit
 * `--modes=chips,westworld` (never part of the final report).
 *
 *   node scripts/verify-v2.mjs                          # Loom final pass from dist/
 *   node scripts/verify-v2.mjs --modes=loom --no-ui      # canvas pass only
 *   node scripts/verify-v2.mjs --modes=chips --root-chips=ARCHIVE_DIST  # archive replay
 *   node scripts/verify-v2.mjs --strict                 # non-pass => exit 1
 *
 * What it proves (Loom):
 *   - boots with exactly one canvas and no uncaught/page errors
 *   - idle screenshot at 1472x1008
 *   - 12-event burst screenshot (mid-animation) + settled screenshot
 *   - engine telemetry: 12 events seen, queue drained, 12 picks, beats 1..12
 *   - audio: AudioContext running + ordered beat marks for the 12 events
 *   - responsive 1920x1080 and 768x1024 screenshots (canvas resize + no overflow)
 *   - final UI: single-mode header (brand/caption/telemetry/transport/tools) OR
 *     mode tabs when a multi-mode build is being inspected, plus screenshots
 * Writes review/v2/verification.json plus review/v2/shots/*.png.
 *
 * Honest reporting: a mode whose telemetry reports `stub: true` is marked
 * "partial" with mode-specific checks SKIPPED (not fabricated as passing).
 * No source files are modified; dist is served read-only from a private port.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, fileHash, sleep } from './lib/browser.mjs';
import { DESIGN_W, DESIGN_H, EVENTS_12 } from './lib/fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
if (argv.help) {
  console.log('usage: node scripts/verify-v2.mjs [--modes=loom,chips,westworld] [--root=dist] [--root-chips=DIR] [--root-westworld=DIR] [--port=4510] [--w=1472] [--h=1008] [--out=review/v2] [--no-ui] [--strict] [--settle-loom=26] [--settle-chips=20] [--settle-westworld=20]');
  process.exit(0);
}

const W = Number(argv.w || DESIGN_W);
const H = Number(argv.h || DESIGN_H);
const basePort = Number(argv.port || 4510);
const outRoot = path.resolve(argv.out || path.join(root, 'review', 'v2'));
const shotsDir = path.join(outRoot, 'shots');
const mainRoot = path.resolve(root, argv.root || 'dist');
const requestedModes = String(argv.modes || (argv.archived ? 'loom,chips,westworld' : 'loom')).split(',').map((m) => m.trim()).filter(Boolean);

function rootFor(mode) {
  const key = `root-${mode}`;
  return argv[key] ? path.resolve(root, argv[key]) : mainRoot;
}
const DT = 0.1;
const GENERIC_EVENTS = 12;

/* ------------------------------------------------------------------ profiles */
/** Per-mode expectations. `settled` receives the mode telemetry object and
 * returns [name, ok, detail] rows. Unknown APIs are reported as FAIL with the
 * observed top-level keys so the mode owner can act on the concrete gap. */
const PROFILES = {
  loom: {
    label: 'Loom',
    midSeconds: 8,
    settleSeconds: Number(argv['settle-loom'] || 26),
    audio: 'exact12',
    settled(tel) {
      const rows = [];
      rows.push(['picks === 12', tel.picks === 12, `picks=${tel.picks}`]);
      rows.push(['queue drained', tel.queued === 0, `queued=${tel.queued}`]);
      rows.push(['stage READY', tel.stage === 'READY', `stage=${tel.stage}`]);
      return rows;
    },
  },
  chips: {
    label: 'Chips',
    midSeconds: 5,
    settleSeconds: Number(argv['settle-chips'] || 20),
    audio: 'covers12',
    /** Contract confirmed by the mode owner (2026-11-16): 12 events => 2 hands,
     * 12 deal beats (ids 1..12) + optional cash marks, queue drained, score > 0. */
    settled(tel, _leaves, after) {
      const rows = [];
      rows.push(['totalDealt === 12', tel.totalDealt === 12, `totalDealt=${tel.totalDealt}`]);
      rows.push(['resolvedHands === 2', tel.resolvedHands === 2, `resolvedHands=${tel.resolvedHands}`]);
      rows.push(['score > 0', typeof tel.score === 'number' && tel.score > 0, `score=${tel.score}`]);
      rows.push(['queue empty', tel.queued === 0, `queued=${tel.queued}`]);
      const stage = tel.stage ?? null;
      const stageLabel = tel.stageLabel ?? null;
      rows.push(['stage settled (idle/holding)', stage === 'idle' || stage === 'holding', `stage=${stage} stageLabel=${stageLabel}`]);
      const dealBeats = (after?.beats ?? []).filter((b) => b.kind === 'chips-deal').map((b) => b.eventId);
      const cashBeats = (after?.beats ?? []).filter((b) => String(b.kind).startsWith('chips-cash')).length;
      rows.push(['12 chips-deal beat marks in order', JSON.stringify(dealBeats) === JSON.stringify(EVENTS_12.map((e) => e.id)), `deal=${JSON.stringify(dealBeats)} cashMarks=${cashBeats}`]);
      return rows;
    },
  },
  westworld: {
    label: 'Westworld',
    midSeconds: 5,
    settleSeconds: Number(argv['settle-westworld'] || 20),
    audio: 'covers12',
    /** Expected contract from src/engine/modes/westworld/machine.ts:
     * 12 calls => charge/total=12, 2 relief releases (5-call cycle), 0 purges (<20),
     * queue drained, plant stable, 12 ordered actuation beats. */
    settled(tel, _leaves, after) {
      const rows = [];
      rows.push(['charge/total === 12', (tel.charge ?? tel.total) === 12, `charge=${tel.charge} total=${tel.total}`]);
      rows.push(['releases === 2', tel.releases === 2, `releases=${tel.releases}`]);
      rows.push(['purges === 0', (tel.purges ?? 0) === 0, `purges=${tel.purges}`]);
      rows.push(['queue empty', tel.queued === 0, `queued=${tel.queued}`]);
      rows.push(['plant stable', tel.stage === 'STABLE', `stage=${tel.stage}`]);
      rows.push(['pressure/heat in 0..1', typeof tel.pressure === 'number' && tel.pressure >= 0 && tel.pressure <= 1 && typeof tel.heat === 'number' && tel.heat >= 0 && tel.heat <= 1, `pressure=${tel.pressure} heat=${tel.heat}`]);
      const lr = tel.lastRelease;
      rows.push(['release #2 ticket lists 5 calls', !!lr && lr.index === 2 && Array.isArray(lr.families) && lr.families.length === 5 && typeof lr.ticket === 'string' && lr.ticket.length > 0, `lastRelease=${JSON.stringify(lr)}`]);
      rows.push(['lastPurge === 0 (no purge before 20 calls)', (tel.lastPurge ?? 0) === 0, `lastPurge=${tel.lastPurge}`]);
      const actuateBeats = (after?.beats ?? []).filter((b) => String(b.kind).startsWith('ww-')).map((b) => b.eventId).filter((id) => id >= 1 && id <= 12);
      rows.push(['12 ordered ww actuation beats', [...new Set(actuateBeats)].sort((a, b) => a - b).join(',') === EVENTS_12.map((e) => e.id).join(','), `wwBeats=${JSON.stringify(actuateBeats)}`]);
      return rows;
    },
  },
};

/* ------------------------------------------------------------------ helpers */
function numericLeaves(obj, prefix = '', depth = 0, out = []) {
  if (obj == null || depth > 4) return out;
  if (typeof obj === 'number' && Number.isFinite(obj)) { out.push({ path: prefix || '(root)', value: obj }); return out; }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => numericLeaves(v, `${prefix}[${i}]`, depth + 1, out));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) numericLeaves(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
  }
  return out;
}
function pickLeaf(leaves, re) { return leaves.find((l) => re.test(l.path.split('.').pop() ?? l.path)); }
function leafKeys(leaves) { return leaves.map((l) => l.path).slice(0, 14).join(', ') || '(none)'; }
const isStub = (tel) => !!tel && tel.stub === true;

async function batchTicks(browser, seconds, dt = DT) {
  let n = Math.max(0, Math.round(seconds / dt));
  while (n > 0) {
    const chunk = Math.min(n, 100);
    await browser.evaluate(`(()=>{for(let i=0;i<${chunk};i++) window.__engine.tick(${dt});return true})()`);
    n -= chunk;
  }
}

async function shot(browser, file) {
  await browser.screenshot(file);
  return { file: path.relative(root, file).replaceAll('\\', '/'), sha256: await fileHash(file) };
}

/** Deterministic SHA-256 over the served build tree (rel path + bytes, sorted). */
function hashTree(rootDir) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) files.push(p);
    }
  })(rootDir);
  files.sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(path.relative(rootDir, f).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(f));
    hash.update('\0');
  }
  const newest = Math.max(...files.map((f) => fs.statSync(f).mtimeMs));
  return { treeSha256: hash.digest('hex'), files: files.length, sizeBytes: files.reduce((a, f) => a + fs.statSync(f).size, 0), builtAt: new Date(newest).toISOString() };
}

function makeChecks() {
  const checks = [];
  const add = (id, ok, detail = '') => { checks.push({ id, ok: !!ok, detail: String(detail) }); return !!ok; };
  /** A skipped check is recorded explicitly (never counted as pass or fail). */
  const skip = (id, detail = '') => { checks.push({ id, ok: true, skipped: true, detail: String(detail) }); };
  return { checks, add, skip };
}

/* ------------------------------------------------------------------ per-mode canvas pass */
async function verifyModeCanvas(mode, profile, port) {
  const rootDir = rootFor(mode);
  const result = {
    mode,
    label: profile.label,
    root: path.relative(root, rootDir).replaceAll('\\', '/') || '.',
    query: `?mode=${mode}&deterministic=1&noauto=1&ui=0`,
    status: 'skipped',
    stub: null,
    checks: [],
    screenshots: {},
    hashes: {},
    telemetry: null,
    modeTelemetry: null,
    audio: null,
    errors: null,
    environment: null,
    notes: [],
  };
  if (!fs.existsSync(rootDir)) {
    result.notes.push(`build root not found: ${rootDir} — skipped (run a build first)`);
    return result;
  }
  const { checks, add, skip } = makeChecks();
  let browser;
  try {
    browser = await launch({ root: rootDir, httpPort: port, debugPort: port + 100, width: W, height: H });
    await browser.setViewport(W, H);
    await browser.goto(result.query, { settle: 600 });
    const mark = browser.mark();

    // --- boot integrity
    const boot = JSON.parse(await browser.evaluate(`JSON.stringify({
      canvases: document.querySelectorAll('canvas').length,
      fatal: document.querySelector('.fatal')?.textContent ?? null,
      status: window.__engine.getStatus(),
      mode: window.__engine.getMode(),
      engineReady: !!window.__engine,
      inner: { w: innerWidth, h: innerHeight },
      canvasCss: (()=>{const c=document.querySelector('canvas');return c?{w:c.clientWidth,h:c.clientHeight,bw:c.width,bh:c.height}:null})(),
      overflow: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
    })`));
    result.environment = { renderer: await browser.renderer(), viewport: `${W}x${H}` };
    add('engine bridge exposed', boot.engineReady);
    add('exactly one canvas', boot.canvases === 1, `canvases=${boot.canvases}`);
    add('no fatal overlay', boot.fatal === null, boot.fatal ?? '');
    add('modeId matches query', boot.mode === mode, `mode=${boot.mode}`);
    add('initial state idle (noauto)', boot.status.state === 'idle', `state=${boot.status.state}`);
    add('engine clock at 0', Math.abs(boot.status.time) < 1e-9, `time=${boot.status.time}`);
    add('canvas fills viewport', !!boot.canvasCss && Math.abs(boot.canvasCss.w - boot.inner.w) <= 1 && Math.abs(boot.canvasCss.h - boot.inner.h) <= 1, JSON.stringify(boot.canvasCss));
    add('no document overflow', boot.overflow.scrollW <= boot.inner.w + 1 && boot.overflow.scrollH <= boot.inner.h + 1, JSON.stringify(boot.overflow));

    // --- audio context + idle frame
    await browser.evaluate('window.__engine.audio.ensure(); true');
    await sleep(200);
    const audioState = await browser.evaluate('window.__engine.audio.state ?? null');
    add('AudioContext created', !!audioState, `state=${audioState}`);
    await browser.evaluate('window.__engine.tick(1/60); true');
    result.screenshots.idle = await shot(browser, path.join(shotsDir, `${mode}-idle.png`));
    result.hashes.idle = result.screenshots.idle.sha256;

    // --- 12-event burst on the deterministic clock
    await browser.evaluate(`(()=>{${JSON.stringify(EVENTS_12)}.forEach(e=>window.__engine.inject(e));return true})()`);
    await batchTicks(browser, profile.midSeconds);
    result.screenshots.burst = await shot(browser, path.join(shotsDir, `${mode}-burst.png`));
    result.hashes.burst = result.screenshots.burst.sha256;
    result.midTelemetry = JSON.parse(await browser.evaluate(`JSON.stringify({status: window.__engine.getStatus().state, tel: window.__engine.getModeTelemetry('${mode}')})`));

    await batchTicks(browser, Math.max(0, profile.settleSeconds - profile.midSeconds));
    result.screenshots.settled = await shot(browser, path.join(shotsDir, `${mode}-settled.png`));
    result.hashes.settled = result.screenshots.settled.sha256;

    // --- post-burst facts
    const after = JSON.parse(await browser.evaluate(`JSON.stringify({
      status: window.__engine.getStatus(),
      telemetry: window.__engine.getTelemetry(),
      modeTelemetry: window.__engine.getModeTelemetry('${mode}'),
      beats: window.__engine.audio.beats,
      audioState: window.__engine.audio.state ?? null,
    })`));
    result.telemetry = after.telemetry;
    result.modeTelemetry = after.modeTelemetry;
    result.audio = {
      state: after.audioState,
      beatCount: after.beats.length,
      beats: after.beats.map((b) => ({ eventId: b.eventId, kind: b.kind })),
    };
    result.stub = isStub(after.modeTelemetry) ? true : null;

    add('engine received 12 events', after.status.events === GENERIC_EVENTS, `events=${after.status.events}`);
    add('engine clock advanced', after.telemetry.time >= profile.settleSeconds - 0.5, `virtualTime=${after.telemetry.time.toFixed(2)}s (status time is publish-throttled: ${after.status.time.toFixed(2)}s)`);
    add('event counts sum to 12', Object.values(after.status.counts).reduce((a, b) => a + b, 0) === GENERIC_EVENTS, JSON.stringify(after.status.counts));
    add('no replay loaded in burst pass', after.status.replay === null, JSON.stringify(after.status.replay));
    if (typeof after.modeTelemetry?.queued === 'number') {
      add('mode queue drained', after.modeTelemetry.queued === 0, `queued=${after.modeTelemetry.queued}`);
    }

    // --- mode-specific expectations (skipped for stubs, reported verbatim)
    if (result.stub) {
      result.notes.push('telemetry reports stub:true — mode not implemented yet; mode-specific + audio expectations SKIPPED');
    } else {
      const leaves = numericLeaves(after.modeTelemetry);
      for (const row of profile.settled(after.modeTelemetry, leaves, result.audio)) add(...row);
      const beatIds = after.beats.map((b) => b.eventId);
      // Sentinel bookkeeping marks (e.g. chips cash-out 900000) are allowed; only 1..12 are agent events.
      const realIds = beatIds.filter((id) => id >= 1 && id <= 12);
      const sentinels = beatIds.filter((id) => id > 12);
      const uniqueIds = [...new Set(realIds)].sort((a, b) => a - b);
      const expectedIds = EVENTS_12.map((e) => e.id);
      if (profile.audio === 'exact12') {
        add('exactly 12 audio beats', after.beats.length === 12, `beats=${after.beats.length}`);
        add('audio beat eventIds 1..12 in order', JSON.stringify(after.beats.map((b) => b.eventId)) === JSON.stringify(expectedIds), JSON.stringify(after.beats.map((b) => b.eventId)));
      } else {
        add('audio beats cover events 1..12', uniqueIds.length >= 12 && uniqueIds.slice(0, 12).join(',') === expectedIds.join(','), `eventIds=${JSON.stringify(beatIds)} bookkeeping=${JSON.stringify(sentinels)}`);
      }
      add('AudioContext running', after.audioState === 'running', `state=${after.audioState}`);
    }

    // --- responsive renders (canvas pass, deterministic clock)
    for (const [w, h, name] of [[1920, 1080, '1920'], [768, 1024, '768']]) {
      await browser.setViewport(w, h);
      await sleep(420);
      await browser.evaluate('window.__engine.tick(1/60); true');
      const layout = JSON.parse(await browser.evaluate(`JSON.stringify({
        inner: {w: innerWidth, h: innerHeight},
        canvas: (()=>{const c=document.querySelector('canvas');return c?{w:c.clientWidth,h:c.clientHeight}:null})(),
        overflow: {scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight},
        canvases: document.querySelectorAll('canvas').length,
      })`));
      result.screenshots[`responsive-${name}`] = await shot(browser, path.join(shotsDir, `${mode}-${name}.png`));
      result.hashes[`responsive-${name}`] = result.screenshots[`responsive-${name}`].sha256;
      add(`responsive ${w}x${h}: single canvas`, layout.canvases === 1, `canvases=${layout.canvases}`);
      add(`responsive ${w}x${h}: canvas fills viewport`, !!layout.canvas && Math.abs(layout.canvas.w - layout.inner.w) <= 2 && Math.abs(layout.canvas.h - layout.inner.h) <= 2, JSON.stringify(layout.canvas));
      add(`responsive ${w}x${h}: no overflow`, layout.overflow.scrollW <= layout.inner.w + 2 && layout.overflow.scrollH <= layout.inner.h + 2, JSON.stringify(layout.overflow));
    }
    await browser.setViewport(W, H);

    // --- errors for the whole mode session
    const errors = browser.errorsSince(mark);
    result.errors = errors;
    add('zero uncaught exceptions', errors.exceptions.length === 0, JSON.stringify(errors.exceptions.slice(0, 3)));
    add('zero console errors', errors.consoleErrors.length === 0, JSON.stringify(errors.consoleErrors.slice(0, 3)));
    add('zero browser log errors', errors.logErrors.length === 0, JSON.stringify(errors.logErrors.slice(0, 3)));

    const failed = checks.filter((c) => !c.ok);
    result.status = result.stub ? 'partial' : failed.length ? 'fail' : 'pass';
    if (result.stub) result.notes.push('generic engine checks passed; mode-specific checks pending real implementation');
  } catch (err) {
    checks.push({ id: 'harness completed', ok: false, detail: String(err?.stack || err).slice(0, 800) });
    result.status = 'fail';
    result.notes.push('harness error: ' + String(err?.message || err));
  } finally {
    result.checks = checks;
    if (browser) await browser.close().catch(() => {});
  }
  return result;
}

/* ------------------------------------------------------------------ UI / tab-switching pass */
async function verifyUiSwitching(modes, port) {
  const result = { query: '?deterministic=1&noauto=1 (UI visible)', status: 'skipped', checks: [], screenshots: {}, tabClicks: [], sequence: [], errors: null, environment: null };
  const { checks, add, skip } = makeChecks();
  // A single-mode verification against a WIP dist must exercise that same dist's UI
  // (all worlds live in one bundle); otherwise use the main root.
  const uiRoot = argv['root-ui'] ? path.resolve(root, argv['root-ui']) : modes.length === 1 ? rootFor(modes[0]) : mainRoot;
  result.root = path.relative(root, uiRoot).replaceAll('\\', '/') || '.';
  if (argv['no-ui']) { result.notes = ['--no-ui given']; return result; }
  let browser;
  try {
    browser = await launch({ root: uiRoot, httpPort: port, debugPort: port + 100, width: W, height: H });
    await browser.setViewport(W, H);
    await browser.goto('?deterministic=1&noauto=1', { settle: 600 });
    const mark = browser.mark();
    result.environment = { renderer: await browser.renderer(), viewport: `${W}x${H}` };
    const header = JSON.parse(await browser.evaluate(`JSON.stringify({
      brand: !!document.querySelector('.brand h1'),
      brandText: document.querySelector('.brand h1')?.textContent?.trim() ?? null,
      tabs: document.querySelectorAll('.mode-tab').length,
      tabTexts: Array.from(document.querySelectorAll('.mode-tab')).map(b=>b.textContent.trim()),
      captionTitle: document.querySelector('.mode-caption-title')?.textContent?.trim() ?? null,
      telemetryPill: document.querySelector('.telemetry .pill')?.textContent?.trim() ?? null,
      telemetryFields: document.querySelectorAll('.telemetry dl > div').length,
      transportButtons: Array.from(document.querySelectorAll('.transport button')).map(b=>b.textContent.trim()),
      toolButtons: document.querySelectorAll('.tools .tool').length,
      hint: document.querySelector('.hint')?.textContent?.trim() ?? null,
      modeId: window.__engine.getMode(),
    })`));
    result.header = header;
    const tabCount = header.tabs;
    result.singleModeHeader = tabCount === 0;
    add('header: KUNLUNMETA brand rendered', header.brand && /KUNLUNMETA/i.test(header.brandText ?? ''), `brand=${header.brandText}`);
    add('header: Loom caption rendered', /loom/i.test(header.captionTitle ?? ''), `caption=${header.captionTitle}`);
    add('telemetry panel present (state pill + >=3 fields)', !!header.telemetryPill && header.telemetryFields >= 3, `pill=${header.telemetryPill} fields=${header.telemetryFields}`);
    add('transport controls present', header.transportButtons.some((t) => /play|pause|resume/i.test(t)) && header.transportButtons.includes('Stop'), JSON.stringify(header.transportButtons));
    add('five tool trigger buttons', header.toolButtons === 5, `tools=${header.toolButtons}`);
    add('hint line present', typeof header.hint === 'string' && header.hint.length > 0, header.hint ?? '');
    if (tabCount === 0) {
      add('single-mode header: no mode tabs', true, '0 .mode-tab elements (Loom-only delivery)');
      add('single-mode view: engine mode is loom', header.modeId === 'loom', `modeId=${header.modeId}`);
    } else {
      add('mode tabs rendered', tabCount >= 1, `tabs=${JSON.stringify(header.tabTexts)}`);
      add('initial tab active is Loom (default mode)', /loom/i.test(header.tabTexts.find((t, i) => i === 0) ?? ''), JSON.stringify(header.tabTexts));
    }

    for (const mode of modes) {
      const profile = PROFILES[mode];
      let switched = false;
      let click = null;
      if (tabCount > 0) {
        click = await browser.evaluate(`(()=>{
          const tabs=Array.from(document.querySelectorAll('.mode-tab'));
          const target=tabs.find(b=>b.querySelector('.mode-name')?.textContent?.trim().toLowerCase()===${JSON.stringify(mode)});
          if(!target) return {clicked:false, labels:tabs.map(b=>b.textContent.trim())};
          target.click();
          return {clicked:true, label:target.textContent.trim()};
        })()`);
        switched = !!click.clicked && !!(await browser.waitFor(`window.__engine.getMode() === ${JSON.stringify(mode)}`, 5000));
      } else {
        switched = header.modeId === mode;
      }
      // advance the deterministic clock so any cross-fade completes and renders
      await batchTicks(browser, 0.7);
      const state = JSON.parse(await browser.evaluate(`JSON.stringify({
        status: window.__engine.getStatus(),
        activeTab: document.querySelector('.mode-tab.active')?.textContent?.trim() ?? null,
        caption: document.querySelector('.mode-caption-title')?.textContent?.trim() ?? null,
        canvases: document.querySelectorAll('canvas').length,
        tel: window.__engine.getModeTelemetry(${JSON.stringify(mode)}),
      })`));
      result.tabClicks.push({ mode, click, statusModeId: state.status.modeId, activeTab: state.activeTab, caption: state.caption, stub: isStub(state.tel) ? true : null });
      if (tabCount > 0) {
        add(`tab click switches to ${mode}`, switched && state.status.modeId === mode, `modeId=${state.status.modeId}`);
        add(`${mode} tab marked active`, (state.activeTab ?? '').toLowerCase().includes(profile.label.toLowerCase()), `active=${state.activeTab}`);
      } else {
        add(`single-mode view: ${mode} active`, switched && state.status.modeId === mode, `modeId=${state.status.modeId}`);
      }
      add(`${mode} still one canvas`, state.canvases === 1, `canvases=${state.canvases}`);

      const name = `switch-${mode}`;
      result.screenshots[name] = await shot(browser, path.join(shotsDir, `${name}.png`));
      result.screenshots[`${name}-1920`] = null; // filled below
      for (const [w, h, suffix] of [[1920, 1080, '1920'], [768, 1024, '768']]) {
        await browser.setViewport(w, h);
        await sleep(380);
        await batchTicks(browser, 0.1);
        const layout = JSON.parse(await browser.evaluate(`JSON.stringify({
          canvas: (()=>{const c=document.querySelector('canvas');return c?{w:c.clientWidth,h:c.clientHeight}:null})(),
          inner: {w: innerWidth, h: innerHeight},
          overflow: {scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight},
          canvases: document.querySelectorAll('canvas').length,
        })`));
        const shotFile = path.join(shotsDir, `${name}-${suffix}.png`);
        const saved = await shot(browser, shotFile);
        result.screenshots[`${name}-${suffix}`] = saved;
        add(`${mode} UI responsive ${w}x${h}: canvas+no overflow`, layout.canvases === 1 && !!layout.canvas && Math.abs(layout.canvas.w - layout.inner.w) <= 2 && layout.overflow.scrollW <= layout.inner.w + 2, JSON.stringify(layout));
        await browser.setViewport(W, H);
      }
    }

    // --- multi-mode state persistence (only meaningful when >=2 switchable modes exist)
    if (modes.includes('loom') && tabCount >= 2) {
      const clickTab = async (m) => {
        const click = await browser.evaluate(`(()=>{
          const tabs=Array.from(document.querySelectorAll('.mode-tab'));
          const target=tabs.find(b=>b.querySelector('.mode-name')?.textContent?.trim().toLowerCase()===${JSON.stringify(m)});
          if(!target) return {clicked:false, labels:tabs.map(b=>b.textContent.trim())};
          target.click();
          return {clicked:true, label:target.textContent.trim()};
        })()`);
        const ok = !!click.clicked && !!(await browser.waitFor(`window.__engine.getMode() === ${JSON.stringify(m)}`, 5000));
        await batchTicks(browser, 0.8);
        return { click, ok };
      };
      const seqModes = ['chips', 'westworld', 'loom'].filter((m) => modes.includes(m));
      if (seqModes.length < 3) result.notes = [...(result.notes ?? []), `sequence limited to ${JSON.stringify(seqModes)} because --modes excluded some worlds`];
      const first = await clickTab('loom');
      add('sequence: could re-enter Loom tab', first.ok, JSON.stringify(first.click));
      // deterministic accumulated Loom state: 12 events -> 12 picks (26 s virtual)
      await browser.evaluate(`(()=>{${JSON.stringify(EVENTS_12)}.forEach(e=>window.__engine.inject(e));return true})()`);
      await batchTicks(browser, 26);
      const woven = JSON.parse(await browser.evaluate(`JSON.stringify({
        mode: window.__engine.getMode(),
        tel: window.__engine.getModeTelemetry('loom'),
        status: window.__engine.getStatus(),
        canvases: document.querySelectorAll('canvas').length,
      })`));
      const wovenShot = await shot(browser, path.join(shotsDir, 'sequence-1-loom-woven.png'));
      result.screenshots['sequence-1-loom-woven'] = wovenShot;
      result.sequence.push({ step: 1, mode: 'loom', modeId: woven.mode, picks: woven.tel.picks, events: woven.status.events, screenshot: wovenShot });
      add('sequence: Loom accumulated 12 picks before switching', woven.tel.picks === 12, `picks=${woven.tel.picks}`);
      add('sequence: one canvas while weaving', woven.canvases === 1, `canvases=${woven.canvases}`);

      let step = 2;
      for (const m of seqModes) {
        const { ok } = await clickTab(m);
        const state = JSON.parse(await browser.evaluate(`JSON.stringify({
          modeId: window.__engine.getMode(),
          events: window.__engine.getStatus().events,
          canvases: document.querySelectorAll('canvas').length,
        })`));
        const file = await shot(browser, path.join(shotsDir, `sequence-${step}-${m}.png`));
        result.screenshots[`sequence-${step}-${m}`] = file;
        result.sequence.push({ step, mode: m, modeId: state.modeId, events: state.events, screenshot: file });
        add(`sequence: switch ${step} to ${m}`, ok && state.modeId === m, `modeId=${state.modeId}`);
        add(`sequence: ${m} keeps single canvas`, state.canvases === 1, `canvases=${state.canvases}`);
        step += 1;
      }
      // final click must be loom (last element of seqModes)
      const back = JSON.parse(await browser.evaluate(`JSON.stringify({
        modeId: window.__engine.getMode(),
        tel: window.__engine.getModeTelemetry('loom'),
        events: window.__engine.getStatus().events,
        hudPicks: window.__engine.getStatus().hud.fields.find(f=>f.label==='PICKS')?.value ?? null,
      })`));
      result.persistence = { picksBefore: woven.tel.picks, picksAfter: back.tel.picks, events: back.events, modeId: back.modeId, hudPicks: back.hudPicks };
      add('sequence: back on Loom after full round-trip', back.modeId === 'loom', `modeId=${back.modeId}`);
      add('sequence: Loom picks survived switching away and back', back.tel.picks === 12, `before=${woven.tel.picks} after=${back.tel.picks}`);
      add('sequence: Loom HUD PICKS still 12 after return', back.hudPicks === '12', `HUD PICKS=${back.hudPicks}`);
      add('sequence: engine event log unchanged by switching', back.events === 12, `events=${back.events}`);
    }

    // --- Chips -> Loom -> Chips persistence (archived experiment; only if explicitly requested)
    if (modes.includes('chips') && tabCount >= 2) {
      const clickTab = async (m) => {
        const click = await browser.evaluate(`(()=>{
          const tabs=Array.from(document.querySelectorAll('.mode-tab'));
          const target=tabs.find(b=>b.querySelector('.mode-name')?.textContent?.trim().toLowerCase()===${JSON.stringify(m)});
          if(!target) return {clicked:false};
          target.click();
          return {clicked:true};
        })()`);
        const ok = !!click.clicked && !!(await browser.waitFor(`window.__engine.getMode() === ${JSON.stringify(m)}`, 5000));
        await batchTicks(browser, 0.8);
        return ok;
      };
      const stateExpr = `JSON.stringify({tel: window.__engine.getModeTelemetry('chips'), status: window.__engine.getStatus()})`;
      await clickTab('chips');
      await browser.evaluate(`(()=>{${JSON.stringify(EVENTS_12)}.forEach(e=>window.__engine.inject(e));return true})()`);
      await batchTicks(browser, Number(argv['settle-chips'] || 20));
      const before = JSON.parse(await browser.evaluate(stateExpr));
      const beforeShot = await shot(browser, path.join(shotsDir, 'sequence-5-chips-settled.png'));
      result.screenshots['sequence-5-chips-settled'] = beforeShot;
      const chipsStub = isStub(before.tel);
      await clickTab('loom');
      await clickTab('chips');
      const after = JSON.parse(await browser.evaluate(stateExpr));
      const afterShot = await shot(browser, path.join(shotsDir, 'sequence-6-chips-return.png'));
      result.screenshots['sequence-6-chips-return'] = afterShot;
      result.chipsPersistence = {
        before: before.tel,
        after: after.tel,
        modeIdBefore: before.status.modeId,
        modeIdAfter: after.status.modeId,
        screenshotBefore: beforeShot,
        screenshotAfter: afterShot,
      };
      add('chips: switched away to Loom and back', after.status.modeId === 'chips', `modeId=${after.status.modeId}`);
      if (chipsStub) {
        skip('chips: accumulated table telemetry unchanged across switching', 'chips telemetry reports stub:true in this build — state persistence not meaningful yet');
      } else {
        add('chips: accumulated table telemetry unchanged across switching', JSON.stringify(before.tel) === JSON.stringify(after.tel), `before=${JSON.stringify(before.tel).slice(0, 220)} after=${JSON.stringify(after.tel).slice(0, 220)}`);
        add('chips: hand cards preserved across switching', JSON.stringify(before.tel.hand) === JSON.stringify(after.tel.hand) && after.tel.totalDealt === 12, `hand=${JSON.stringify(after.tel.hand)} totalDealt=${after.tel.totalDealt}`);
      }
    }

    if (tabCount < 2) {
      skip('multi-mode state persistence across tab switching', 'single-mode delivery: no mode tabs, switch-persistence not applicable; Loom accumulation is covered by the canvas pass and replay determinism proof');
    }

    const errors = browser.errorsSince(mark);
    result.errors = errors;
    add('UI pass: zero uncaught exceptions', errors.exceptions.length === 0, JSON.stringify(errors.exceptions.slice(0, 3)));
    add('UI pass: zero console errors', errors.consoleErrors.length === 0, JSON.stringify(errors.consoleErrors.slice(0, 3)));
    result.status = checks.every((c) => c.ok) ? 'pass' : 'fail';
  } catch (err) {
    checks.push({ id: 'ui pass completed', ok: false, detail: String(err?.stack || err).slice(0, 800) });
    result.status = 'fail';
  } finally {
    result.checks = checks;
    if (browser) await browser.close().catch(() => {});
  }
  return result;
}

/* ------------------------------------------------------------------ main */
const startedAt = new Date();
const report = {
  schema: 'kunlunmeta-v2-verification/1',
  generatedAt: startedAt.toISOString(),
  node: process.version,
  command: `node scripts/verify-v2.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  report: {
    scope: requestedModes.length === 1 && requestedModes[0] === 'loom' ? 'loom-final' : 'multi-mode',
    archivedModesNote: 'Chips and Westworld are archived experiments and not part of the final Loom-only delivery; passing snapshots for them live under review/v2/archive/.',
  },
  roots: Object.fromEntries(requestedModes.map((m) => [m, path.relative(root, rootFor(m)).replaceAll('\\', '/') || '.'])),
  fixture: { events: GENERIC_EVENTS, types: EVENTS_12.map((e) => e.type), tickDt: DT, viewport: `${W}x${H}` },
  modes: {},
  uiSwitching: null,
  summary: null,
  limitations: [],
};

let portCursor = basePort;
const buildHashes = {};
for (const mode of requestedModes) {
  const profile = PROFILES[mode];
  if (!profile) { report.modes[mode] = { mode, status: 'skipped', notes: ['unknown mode id'] }; continue; }
  buildHashes[mode] = hashTree(rootFor(mode));
  console.log(`[verify-v2] canvas pass: ${mode} (root=${report.roots[mode]}, build=${buildHashes[mode].treeSha256.slice(0, 12)}…)`);
  report.modes[mode] = await verifyModeCanvas(mode, profile, portCursor);
  portCursor += 2;
  const r = report.modes[mode];
  console.log(`[verify-v2]   -> ${r.status.toUpperCase()} (${r.checks.filter((c) => c.ok).length}/${r.checks.length} checks)`);
}
report.buildHashes = buildHashes;
if (!argv['no-ui']) {
  console.log('[verify-v2] UI pass: tab switching + responsive HUD');
  report.uiSwitching = await verifyUiSwitching(requestedModes, portCursor);
  portCursor += 2;
  console.log(`[verify-v2]   -> ${report.uiSwitching.status.toUpperCase()} (${report.uiSwitching.checks.filter((c) => c.ok).length}/${report.uiSwitching.checks.length} checks)`);
}

// cross-mode sanity: non-stub worlds must not render byte-identical idle frames
const idleHashes = Object.entries(report.modes)
  .filter(([, m]) => m.status !== 'skipped' && m.hashes?.idle)
  .map(([mode, m]) => ({ mode, hash: m.hashes.idle, stub: !!m.stub }));
const real = idleHashes.filter((h) => !h.stub);
const duplicate = [];
for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) if (real[i].hash === real[j].hash) duplicate.push([real[i].mode, real[j].mode]);
report.crossMode = {
  idleHashes,
  distinctRealWorlds: duplicate.length === 0,
  duplicates: duplicate,
  note: real.length < 2 ? 'fewer than two implemented worlds — distinctness not applicable yet' : undefined,
};

const allChecks = Object.values(report.modes).flatMap((m) => m.checks ?? []).concat(report.uiSwitching?.checks ?? []);
const failures = allChecks.filter((c) => !c.ok);
const statuses = Object.fromEntries(Object.entries(report.modes).map(([k, v]) => [k, v.status]));
report.summary = {
  statuses,
  ui: report.uiSwitching?.status ?? 'skipped',
  checks: allChecks.length,
  skipped: allChecks.filter((c) => c.skipped).length,
  failures: failures.length,
  failureIds: failures.map((f) => f.id),
  pass: failures.length === 0 && !Object.values(statuses).includes('fail'),
  partial: Object.values(statuses).includes('partial') || report.uiSwitching?.status === 'partial',
  finishedAt: new Date().toISOString(),
  durationSeconds: (Date.now() - startedAt.getTime()) / 1000,
};
if (report.summary.partial) report.limitations.push('One or more modes are still stubs — their mode-specific checks are explicitly skipped, not passed.');
if (EVENTS_12.length !== 12) report.limitations.push('fixture drift: expected 12 events');
report.audioNote = 'Audio beats are captured from AudioEngine.markBeat only when an AudioContext exists; beat audioTime/wallTime are wall-clock and therefore excluded from determinism claims.';

fs.mkdirSync(outRoot, { recursive: true });
const verificationFile = path.join(outRoot, 'verification.json');
fs.writeFileSync(verificationFile, JSON.stringify(report, null, 2));

console.log('\n=== verify-v2 summary ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${verificationFile}`);
const exitCode = report.summary.failures ? 1 : (argv.strict && report.summary.partial ? 1 : 0);
process.exit(exitCode);
