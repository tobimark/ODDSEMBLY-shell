/**
 * ODDSEMBLY acceptance harness — real OpenCode → real Loom, no synthetic events.
 *
 * For each scenario it starts the OpenCode bridge, drives a real `opencode run`
 * turn (or the real HTTP API where precise control is needed), and observes the
 * live Loom page through CDP. Every assertion reads Loom's own telemetry, so a
 * passing run means the *visual engine* saw the real calls — not a mock.
 *
 * usage
 *   node scripts/opencode-acceptance.mjs                # all scenarios
 *   node scripts/opencode-acceptance.mjs min b c        # selected
 *   node scripts/opencode-acceptance.mjs --keep         # leave the page open
 *
 * Requires: dist/ built (`npm run build`), Edge installed, OpenCode service
 * reachable (default: ~/.config/opencode/service.json).
 */
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dir, '..');
const TMP = path.join(ROOT, '.tmp');
fs.mkdirSync(TMP, { recursive: true });

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OPENCODE = process.env.OPENCODE_BIN || 'D:\\npm\\node_modules\\@opencode\\cli\\bin\\opencode.exe';
const MODEL = process.env.OPENCODE_MODEL || 'opencode/deepseek-v4.1-flash-free';
const BRIDGE_PORT_BASE = 8787;
const WEB_PORT = 4178;
const CDP_PORT = 9337;
let BRIDGE_PORT = BRIDGE_PORT_BASE;

const children = new Set();

/** A free loopback port, so a leftover run can never answer for this one. */
function canBind(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function freePort(start) {
  for (let p = start; p < start + 25; p++) if (await canBind(p)) return p;
  throw new Error(`no free port near ${start}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const svc = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'opencode', 'service.json'), 'utf8')); }
  catch { return null; }
})();
if (!svc?.port || !svc?.password) throw new Error('OpenCode service.json missing — start `opencode serve` first');
const OC_BASE = `http://127.0.0.1:${svc.port}`;
const OC_AUTH = 'Basic ' + Buffer.from(`opencode:${svc.password}`).toString('base64');

/* ------------------------------------------------------------------ test rig */

const results = [];
let failures = 0;
function check(ok, label, detail = '') {
  if (ok) { console.log(`  ✓ ${label}`); results.push({ ok: true, label }); }
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    results.push({ ok: false, label, detail });
  }
}

async function ocApi(pathname, init = {}) {
  const res = await fetch(`${OC_BASE}${pathname}`, {
    ...init,
    headers: { Authorization: OC_AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${pathname} → ${res.status}`);
  return res.json().catch(() => null);
}

async function bridgeHealth() {
  const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
  return res.json();
}
async function bridgeLedger() {
  const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/ledger`);
  return res.json();
}

/** Real external CLI turn. Returns when the process exits. */
function runCli(prompt, { cwd = ROOT, timeoutMs = 240000, capture = false } = {}) {
  const env = {
    ...process.env,
    XDG_DATA_HOME: path.join(TMP, 'oc-data'),
    XDG_CONFIG_HOME: path.join(TMP, 'oc-config'),
    XDG_CACHE_HOME: path.join(TMP, 'oc-cache'),
    XDG_STATE_HOME: path.join(TMP, 'oc-state'),
    OPENCODE_PASSWORD: svc.password,
  };
  const child = spawn(OPENCODE, ['run', '--server', OC_BASE, '-m', MODEL, prompt], {
    cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  });
  let out = '';
  if (capture) {
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
  }
  children.add(child);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer); children.delete(child);
      resolve(capture ? { code, out: out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') } : code);
    });
    child.on('error', (err) => { clearTimeout(timer); children.delete(child); resolve(capture ? { code: `error: ${err.message}`, out } : `error: ${err.message}`); });
  });
}

async function newestSession() {
  const page = await ocApi('/api/session?limit=1&order=desc');
  return page?.data?.[0]?.id ?? null;
}

/** Wait until the bridge reports a running call of the given class. */
async function waitForRunning(cls, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ledger = await bridgeLedger();
    const running = ledger.calls.filter((c) => c.status === 'running' && (!cls || c.cls === cls));
    if (running.length) return running[running.length - 1];
    await sleep(200);
  }
  throw new Error(`no running ${cls ?? 'call'} within ${timeoutMs} ms`);
}

/* --------------------------------------------------------------------- CDP */

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('Edge debugging endpoint never became ready');
}

/* ---------------------------------------------------------------- snapshots */

const SNAPSHOT_EXPR = `(() => {
  const api = window.__loom;
  const eng = window.__engine;
  const status = eng.getStatus();
  const tel = eng.getModeTelemetry('loom');
  return JSON.stringify({
    live: api.live(),
    counts: status.counts,
    events: status.events,
    state: status.state,
    mech: { picks: tel.picks, queued: tel.queued, folded: tel.folded, active: tel.active, stage: tel.stage, pickSeconds: tel.pickSeconds },
    dial: tel.dial,
    hud: status.hud,
    lastEvent: status.lastEvent,
  });
})()`;

async function snapshot(sendS) {
  const res = await sendS('Runtime.evaluate', { expression: SNAPSHOT_EXPR, returnByValue: true });
  return JSON.parse(res.result.value);
}

async function sampleFor(sendS, ms, every = 120) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    out.push({ t: Date.now(), ...(await snapshot(sendS)) });
    await sleep(every);
  }
  return out;
}

/* ----------------------------------------------------------------- scenarios */

const scratch = path.join(TMP, 'live-scratch.md');
function resetScratch(text = 'seed line\n') { fs.writeFileSync(scratch, text); }

const scenarios = {
  /* The brief's minimal sequence, produced by four real tool calls. */
  async min(sendS) {
    resetScratch('seed line\n');
    const base = await snapshot(sendS);
    const prompt = [
      'Do exactly these four steps in this order, one tool call each, with no extra exploration:',
      '1. read the file .tmp/live-scratch.md',
      '2. shell: Write-Output loom-first',
      '3. shell: Write-Output loom-second',
      '4. edit .tmp/live-scratch.md, replacing the exact text "seed line" with "seed line\\\\nwoven"',
      'Then reply with the single word ok.',
    ].join('\n');
    const code = await runCli(prompt);
    const settle = await sampleFor(sendS, 9000);
    const end = settle[settle.length - 1];
    const ledger = await bridgeLedger();
    const calls = ledger.calls.filter((c) => !base.live.lastCall || c.at >= base.live.lastCall.at);
    const mapped = calls.map((c) => c.cls).filter(Boolean);
    console.log(`  cli exit ${code}; observed sequence: ${mapped.join(' → ')}`);

    check(mapped.includes('Read') && mapped.includes('Bash') && mapped.includes('Edit'),
      'Read / Bash / Edit all observed from real calls', mapped.join(','));
    const iRead = mapped.indexOf('Read');
    const b1 = mapped.indexOf('Bash', iRead + 1);
    const b2 = b1 >= 0 ? mapped.indexOf('Bash', b1 + 1) : -1;
    const iEdit = b2 >= 0 ? mapped.indexOf('Edit', b2 + 1) : -1;
    check(iRead >= 0 && b1 > iRead && b2 === b1 + 1 && iEdit > b2,
      'the two shell calls are adjacent (so the dial must aggregate them)', mapped.join(' → '));

    const readToBash = end.dial.ordinal;
    // One slot per tool *group*: adjacent repeats of the same tool are the ×N case.
    const groups = mapped.reduce((n, c, i) => (i === 0 || c !== mapped[i - 1] ? n + 1 : n), 0);
    check(end.dial.ordinal - base.dial.ordinal === groups,
      'dial advanced exactly once per tool group', `ordinal +${end.dial.ordinal - base.dial.ordinal} for ${groups} group(s)`);

    check(end.counts.Read >= 1 && end.counts.Bash >= 2 && end.counts.Edit >= 1,
      'per-type counters contain every real call', JSON.stringify(end.counts));
    check(end.mech.queued === 0 && end.mech.active === null, 'mechanism settled (no perpetual weaving)',
      `queued ${end.mech.queued} active ${end.mech.active}`);
    check(end.live.statuses.failed === base.live.statuses.failed
      && end.live.statuses.aborted === base.live.statuses.aborted, 'no call was reported failed/aborted',
    JSON.stringify(end.live.statuses));
    check(end.mech.picks - base.mech.picks + (end.mech.folded - base.mech.folded) === mapped.length,
      'every real call is either woven or folded (none lost)',
      `picks ${end.mech.picks - base.mech.picks} folded ${end.mech.folded - base.mech.folded} of ${mapped.length}`);
    check(readToBash > 0 && end.dial.angleDeg === end.dial.ordinal * 30,
      'dial angle = ordinal × 30°', `${end.dial.angleDeg}° / ${end.dial.ordinal}`);
    return { calls: ledger.calls, end };
  },

  /* Two calls of the same tool: ×2 in place, no extra slot, no lost count. */
  async same(sendS) {
    fs.writeFileSync(path.join(TMP, 'same-a.txt'), 'alpha\n');
    fs.writeFileSync(path.join(TMP, 'same-b.txt'), 'beta\n');
    const base = await snapshot(sendS);
    const prompt = [
      'Do exactly these two steps in this order, one tool call each, nothing else:',
      '1. read .tmp/same-a.txt',
      '2. read .tmp/same-b.txt',
      'Then reply with the single word ok.',
    ].join('\n');
    // Sample *while* the turn runs: the readout card expires 2 s after the last
    // event, so the ×N peak has to be caught live.
    const pending = runCli(prompt);
    const samples = await sampleFor(sendS, 20000);
    const code = await pending;
    const end = samples[samples.length - 1] ?? await snapshot(sendS);
    const ledger = await bridgeLedger();
    const calls = ledger.calls.filter((c) => c.cls && c.at > (base.live.lastCall?.at ?? 0));
    const readCalls = calls.filter((c) => c.cls === 'Read');
    const peak = samples.reduce((best, s) => (s.dial.type === 'Read' && s.dial.count > (best?.dial.count ?? 0) ? s : best), null);
    console.log(`  cli exit ${code}; reads observed: ${readCalls.length}; peak readout: ${peak?.dial.type ?? 'none'} ×${peak?.dial.count ?? 0}`);

    check(readCalls.length >= 2, 'two real Read calls recorded', String(readCalls.length));
    check(end.counts.Read - base.counts.Read === readCalls.length, 'counter is exact (no aggregation loss)',
      `${end.counts.Read - base.counts.Read} vs ${readCalls.length}`);
    check(peak?.dial.type === 'Read' && peak?.dial.count === readCalls.length, 'readout shows Read ×N',
      `${peak?.dial.type} ×${peak?.dial.count}`);
    const groupsBefore = base.dial.ordinal;
    check(end.dial.ordinal - groupsBefore === 1, 'the dial did not add a second slot for the same tool',
      `ordinal ${base.dial.ordinal} → ${end.dial.ordinal}`);
    check(end.dial.angleDeg - base.dial.angleDeg === 30, 'ring advanced exactly 30°', `${end.dial.angleDeg - base.dial.angleDeg}°`);
    return { end };
  },

  /* 10–20 real calls back-to-back: bounded queue, no long tail, nothing lost. */
  async burst(sendS) {
    const base = await snapshot(sendS);
    const cmds = Array.from({ length: 18 }, (_, i) => `Write-Output loom-${i + 1}`).join(', ');
    const prompt = [
      'Use the shell tool 18 times in a single step — one call per command, do not batch commands together:',
      cmds + '.',
      'Then reply with the single word ok.',
    ].join('\n');
    const t0 = Date.now();
    const pending = runCli(prompt);
    const during = await sampleFor(sendS, 20000);
    const code = await pending;
    const after = await sampleFor(sendS, 9000);
    const samples = [...during, ...after];
    const end = samples[samples.length - 1];
    const ledger = await bridgeLedger();
    const calls = ledger.calls.filter((c) => c.cls && c.at > (base.live.lastCall?.at ?? 0));
    const shellCalls = calls.filter((c) => c.cls === 'Bash');
    const mapped = calls.length;
    const maxQueued = Math.max(...samples.map((s) => s.mech.queued));
    const maxFolded = Math.max(...samples.map((s) => s.mech.folded));
    console.log(`  cli exit ${code}; real calls ${mapped} (shell ${shellCalls.length}); max queue ${maxQueued}; folded ${maxFolded}; sampled ${samples.length}`);

    check(mapped >= 10, 'a real high-frequency burst arrived', String(mapped));
    check(maxQueued <= 5, 'mechanical queue never exceeded its bound', `max ${maxQueued}`);
    check(maxFolded > 0, 'overflow was coalesced visually (explicit rule)', `folded ${maxFolded}`);
    check(end.counts.Bash - base.counts.Bash === shellCalls.length, 'every burst call is counted',
      `${end.counts.Bash - base.counts.Bash} vs ${shellCalls.length}`);
    check(end.mech.queued === 0 && end.mech.active === null, 'loom is idle at the end (no endless weaving)',
      `queued ${end.mech.queued} active ${end.mech.active}`);
    check(end.mech.picks - base.mech.picks + (end.mech.folded - base.mech.folded) === mapped,
      'picks + folded == real calls', `picks ${end.mech.picks - base.mech.picks} folded ${end.mech.folded - base.mech.folded}`);
    const lastCallAt = Math.max(...calls.map((c) => c.at));
    const settled = samples.find((s) => s.mech.queued === 0 && s.mech.active === null && s.t > lastCallAt);
    const tail = settled ? settled.t - lastCallAt : null;
    check(tail !== null && tail < 8000, 'visual catch-up finished promptly after the last call',
      tail === null ? 'never settled in the window' : `${Math.round(tail)} ms`);
    console.log(`  elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return { end, mapped };
  },

  /* A failing tool and an interrupted one: status must stay truthful. */
  async fail(sendS) {
    const base = await snapshot(sendS);
    const code = await runCli('Use the read tool to read the file .tmp/definitely-missing-file.txt, then reply with the single word done.');
    await sampleFor(sendS, 3000);
    const afterFail = await snapshot(sendS);
    const failedDelta = afterFail.live.statuses.failed - base.live.statuses.failed;
    check(failedDelta >= 1, 'the failing call is recorded as failed', `failed +${failedDelta}`);
    check(afterFail.live.statuses.success - base.live.statuses.success === 0,
      'a failed call is never counted as a success',
      `success +${afterFail.live.statuses.success - base.live.statuses.success}`);
    check(afterFail.live.lastCall?.status === 'failed', 'readout reports the failure',
      String(afterFail.live.lastCall?.status));

    // Interrupt a genuinely long-running tool call.
    const before = await snapshot(sendS);
    const pending = runCli('Use the shell tool to run exactly: Start-Sleep -Seconds 25 ; Write-Output done. Then reply ok.');
    const running = await waitForRunning('Bash', 90000);
    const sid = running.sessionID ?? await newestSession();
    const res = await ocApi(`/api/session/${sid}/interrupt`, { method: 'POST', body: JSON.stringify({}) });
    console.log(`  interrupt ${sid} → ${JSON.stringify(res)}`);
    await pending;
    await sampleFor(sendS, 4000);
    const afterInt = await snapshot(sendS);
    const aborted = afterInt.live.statuses.aborted - before.live.statuses.aborted;
    check(aborted >= 1, 'the interrupted call is recorded as aborted', `aborted +${aborted}`);
    check(afterInt.live.statuses.success - before.live.statuses.success === 0,
      'an interrupted call is not reported as success',
      `success +${afterInt.live.statuses.success - before.live.statuses.success}`);
    check(afterInt.mech.queued === 0 && afterInt.mech.active === null, 'mechanism returns to rest after the interruption');
    return { end: afterInt };
  },

  /* A real unmapped tool (`task` = subagent): recorded and named, never disguised. */
  async unmapped(sendS) {
    const base = await snapshot(sendS);
    const prompts = [
      'Call the task tool once with subagent_type explore and a short prompt to list files. Then reply with ok.',
      'You must call the task tool now: subagent_type "explore", prompt "list the files in kunlun-loom/scripts". Do not answer before the tool call. Then reply ok.',
    ];
    let ledger = null;
    let unknown = [];
    let lastOut = '';
    for (const prompt of prompts) {
      const pending = runCli(prompt, { capture: true });
      const sampling = sampleFor(sendS, 40000);
      const { code, out } = await pending;
      await sampling;
      lastOut = out;
      ledger = await bridgeLedger();
      unknown = ledger.calls.filter((c) => !c.cls && c.at > (base.live.lastCall?.at ?? 0));
      if (unknown.some((c) => c.tool === 'task')) break;
      console.log(`  attempt produced no task call (exit ${code}); retrying with a stricter prompt`);
    }
    const end = await snapshot(sendS);
    const taskCalls = unknown.filter((c) => c.tool === 'task');
    console.log(`  unmapped calls: ${unknown.map((c) => c.tool).join(', ') || 'none'}`);
    if (!taskCalls.length) console.log(`  last CLI output:\n${lastOut.split('\n').slice(-6).join('\n')}`);

    if (!taskCalls.length && /usage limit|quota|Model unavailable/i.test(lastOut)) {
      console.log('  SKIP: the OpenCode account cannot run a model right now (free-tier quota);');
      console.log('        the unmapped path is covered by scripts/test-live-link.mjs.');
      return { end, skipped: true };
    }

    check(taskCalls.length >= 1, 'a real `task` call was recorded as unmapped', unknown.map((c) => c.tool).join(','));
    check(end.live.unmapped - base.live.unmapped >= taskCalls.length, 'the page reports it as unmapped',
      `${end.live.unmapped - base.live.unmapped}`);
    check(!('task' in end.counts), 'no fake Loom class was invented for it', JSON.stringify(end.counts));
    check(end.live.unmappedTools.task >= 1, 'its raw name is preserved in the page snapshot',
      JSON.stringify(end.live.unmappedTools));
    check(taskCalls.every((c) => c.cls === null), 'the ledger keeps cls = null for it');
    check(taskCalls.every((c) => typeof c.callId === 'string' && c.callId.length > 0),
      'unmapped calls stay traceable by call id');
    return { end };
  },

  /* Drop the upstream stream mid-call: reconnect, no replay, explicit gap. */
  async reconnect(sendS) {
    const base = await snapshot(sendS);
    const before = await bridgeLedger();
    const pending = runCli('Use the shell tool to run exactly: Start-Sleep -Seconds 18 ; Write-Output done. Then reply ok.');
    await waitForRunning('Bash', 90000);
    const drop = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/admin/drop`, { method: 'POST' });
    console.log('  dropped SSE:', drop.status);
    await sleep(600);
    const during = await snapshot(sendS);
    check(during.live.state === 'reconnecting' || during.live.state === 'connected',
      'page reports the link state during the drop', during.live.state);
    // wait for the stream to come back
    let reconnected = false;
    for (let i = 0; i < 100; i++) {
      const s = await snapshot(sendS);
      if (s.live.gaps > base.live.gaps && s.live.state === 'connected') { reconnected = true; break; }
      await sleep(300);
    }
    check(reconnected, 'bridge detected the gap and reconnected', `gaps ${during.live.gaps}`);
    const sid = await newestSession();
    await ocApi(`/api/session/${sid}/interrupt`, { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    await pending;
    await sampleFor(sendS, 4000);
    const end = await snapshot(sendS);
    const after = await bridgeLedger();
    const idsBefore = new Set(before.calls.map((c) => c.callId));
    const duplicated = after.calls.filter((c) => idsBefore.has(c.callId)).length;
    check(duplicated === 0 || after.calls.filter((c) => idsBefore.has(c.callId)).length === idsBefore.size,
      'already-processed calls are not replayed as new ones');
    check(end.live.calls >= base.live.calls, 'calls continue to arrive after reconnecting');
    const gap = end.live.lastGap;
    check(!!gap, 'the gap is reported instead of pretending a complete replay',
      gap ? `recovered ${gap.recovered}, missed ${gap.missed}` : 'none');
    check(end.mech.queued === 0 && end.mech.active === null, 'mechanism settles after recovery');
    return { end };
  },
};

/* ---------------------------------------------------------------------- main */

const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const selected = argv.filter((a) => !a.startsWith('--'));
const names = selected.length ? selected : ['min', 'same', 'burst', 'fail', 'reconnect'];

const server = await startServer(WEB_PORT);
BRIDGE_PORT = await freePort(BRIDGE_PORT_BASE);

console.log('ODDSEMBLY · OpenCode → Loom acceptance');
console.log(`  OpenCode service : ${OC_BASE}`);
console.log(`  bridge           : ws://127.0.0.1:${BRIDGE_PORT}`);
console.log(`  page             : http://127.0.0.1:${WEB_PORT}/?mode=loom&live=ws://127.0.0.1:${BRIDGE_PORT}`);
console.log(`  scenarios        : ${names.join(', ')}\n`);

const bridgeLog = path.join(TMP, 'live-bridge.log');
const logFd = fs.openSync(bridgeLog, 'a');
const bridge = spawn(process.execPath, [path.join(ROOT, 'scripts', 'opencode-loom-bridge.mjs'),
  `--port=${BRIDGE_PORT}`, `--server=${OC_BASE}`, '--admin'], {
  cwd: ROOT,
  env: { ...process.env, OPENCODE_PASSWORD: svc.password },
  stdio: ['ignore', logFd, logFd],
});
children.add(bridge);
await sleep(1200);
const health = await bridgeHealth().catch(() => null);
if (!health) { console.error('bridge did not start; see', bridgeLog); process.exit(1); }
// Guard against a stale bridge answering on the chosen port.
const age = Date.now() - Date.parse(health.startedAt ?? 0);
if (!Number.isFinite(age) || age > 20000) {
  console.error(`refusing to use a stale bridge (started ${age} ms ago) on port ${BRIDGE_PORT}`);
  process.exit(1);
}

const profile = fs.mkdtempSync(path.join(TMP, 'edge-live-'));
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--window-size=1472,1008',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--disable-features=Translate,MediaRouter',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  const wsUrl = await waitForCdp();
  ws = new CDP(wsUrl);
  await ws.open();
  const { targetId } = await ws.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await ws.send('Target.attachToTarget', { targetId, flatten: true });
  const sendS = (method, params = {}) => ws.send(method, params, sessionId);

  await sendS('Page.enable');
  await sendS('Runtime.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: 1472, height: 1008, deviceScaleFactor: 1, mobile: false });
  const url = `http://127.0.0.1:${WEB_PORT}/?mode=loom&live=ws://127.0.0.1:${BRIDGE_PORT}&ui=0&noauto=1`;
  await sendS('Page.navigate', { url });
  await sendS('Runtime.evaluate', {
    expression: 'new Promise(r => { const t=setInterval(()=>{ if(window.__loom&&window.__loom.live){clearInterval(t);r(1)} },100); setTimeout(()=>{clearInterval(t);r(0)},20000) })',
    awaitPromise: true,
  });
  await sleep(1500);
  const boot = await snapshot(sendS);
  console.log(`page ready · live ${boot.live.state} · realtime ${boot.live.realtime}\n`);
  if (boot.live.state !== 'connected') throw new Error('page did not connect to the bridge');

  for (const name of names) {
    const fn = scenarios[name];
    if (!fn) { console.log(`unknown scenario ${name}`); continue; }
    console.log(`\n=== scenario: ${name} ===`);
    const before = failures;
    try { await fn(sendS); }
    catch (err) { failures += 1; console.log(`  ✗ scenario crashed: ${err.message}`); }
    const after = await snapshot(sendS);
    fs.writeFileSync(path.join(TMP, `accept-${name}.json`), JSON.stringify({ scenario: name, after, ok: failures === before }, null, 2));
    try {
      const shot = await sendS('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'shots', `live-${name}.png`), Buffer.from(shot.data, 'base64'));
    } catch { /* screenshot optional */ }
  }

  const final = await snapshot(sendS);
  const ledger = await bridgeLedger();
  fs.writeFileSync(path.join(TMP, 'accept-final.json'), JSON.stringify({ final, ledger, results }, null, 2));

  console.log('\n=== ledger (bridge, authoritative) ===');
  console.log(JSON.stringify({
    counters: ledger.counters,
    unmappedTools: ledger.unmappedTools,
    last: ledger.calls.slice(-6).map((c) => `${c.cls ?? 'UNMAPPED:' + c.tool} ${c.status} ${c.callId}`),
  }, null, 2));

  if (KEEP) {
    console.log('\n--keep: page left open, Ctrl-C to exit');
    await new Promise(() => {});
  }
} finally {
  for (const child of children) { try { child.kill(); } catch { /* noop */ } }
  try { ws?.ws?.close(); } catch { /* noop */ }
  try { edge.kill(); } catch { /* noop */ }
  try { bridge.kill(); } catch { /* noop */ }
  server.close();
  fs.closeSync(logFd);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} · ${results.length} checks`);
process.exit(failures === 0 ? 0 : 1);
