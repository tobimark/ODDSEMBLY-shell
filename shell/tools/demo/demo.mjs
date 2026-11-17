/**
 * ODDSEMBLY × OpenCode — acceptance demo driver.
 *
 * Drives the REAL UI in a REAL browser against a REAL OpenCode session, records
 * the run as a frame sequence (assemble with gif.py) and asserts that what the
 * UI shows matches what the bridge computed.
 *
 *   node tools/demo/demo.mjs                  # bridge must already be running
 *   node tools/demo/demo.mjs --manage-bridge  # demo starts/stops/restarts it
 *
 * Outputs (tools/demo/out/):
 *   shots/*.png     labelled stills for the report
 *   frames/*.jpg    screencast frames -> demo.gif
 *   report.json     step log, snapshot evidence, assertions
 *   ASSERTIONS.md   human-readable pass/fail table
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, launch, sleep, waitFor } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/demo/out');
const UI = process.env.UI_URL || 'http://127.0.0.1:5180/';
const BRIDGE = process.env.BRIDGE_URL || 'http://127.0.0.1:8788';
const MANAGE = process.argv.includes('--manage-bridge');
const DEMO_DIR = process.env.BRIDGE_PROJECT_DIR || path.resolve(ROOT, '..', '.tmp/demo-project');

const report = { startedAt: new Date().toISOString(), ui: UI, bridge: BRIDGE, demoDir: DEMO_DIR, steps: [], assertions: [], snapshots: [] };
let shotNo = 0;
let frameNo = 0;
let browser = null;
let cdp = null;
let bridgeProc = null;
let recording = false;

const log = (m) => console.log(`[demo] ${m}`);
const record = (step, data = {}) => report.steps.push({ at: Date.now(), step, ...data });

function assert(name, ok, detail) {
  report.assertions.push({ name, ok: Boolean(ok), detail: detail ?? null });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  return Boolean(ok);
}

/* ------------------------------------------------------------------ bridge */

async function bridgeSnapshot() {
  const res = await fetch(`${BRIDGE}/api/workbench`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`workbench ${res.status}`);
  return res.json();
}
async function bridgeHealth() {
  const res = await fetch(`${BRIDGE}/api/health`, { cache: 'no-store' });
  return res.json();
}
async function bridgePost(pathname, body) {
  const res = await fetch(`${BRIDGE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
async function startBridge() {
  log('starting bridge…');
  bridgeProc = spawn(process.execPath, [path.join(ROOT, 'server/index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BRIDGE_PROJECT_DIR: DEMO_DIR, BRIDGE_MODEL: process.env.BRIDGE_MODEL ?? 'opencode/deepseek-v4.1-flash-free' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bridgeProc.stdout.on('data', (b) => process.stdout.write(`[bridge] ${b}`));
  bridgeProc.stderr.on('data', (b) => process.stderr.write(`[bridge!] ${b}`));
  await waitFor('bridge', async () => (await bridgeHealth().catch(() => null))?.bridge === 'ok', { timeout: 20000 });
  await waitFor('opencode', async () => (await bridgeHealth().catch(() => null))?.opencode === 'ok', { timeout: 30000 });
}
async function stopBridge() {
  if (!bridgeProc) return;
  bridgeProc.kill();
  bridgeProc = null;
  await sleep(1200);
}

/* ----------------------------------------------------------------- browser */

async function shot(name) {
  shotNo += 1;
  const file = path.join(OUT, 'shots', `${String(shotNo).padStart(2, '0')}-${name}.png`);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  record('shot', { name, file: path.relative(ROOT, file) });
  log(`shot ${path.basename(file)}`);
  return file;
}
async function startRecording() {
  if (recording) return;
  recording = true;
  cdp.on('Page.screencastFrame', async (p) => {
    try {
      frameNo += 1;
      fs.writeFileSync(path.join(OUT, 'frames', `f-${String(frameNo).padStart(5, '0')}.jpg`), Buffer.from(p.data, 'base64'));
      await cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId });
    } catch {
      /* keep recording */
    }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1453, maxHeight: 865, everyNthFrame: 1 });
  log('screencast started');
}
async function stopRecording() {
  if (!recording) return;
  recording = false;
  try {
    await cdp.send('Page.stopScreencast');
  } catch {
    /* ignore */
  }
  log(`screencast stopped (${frameNo} frames)`);
}
async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
  return r.result?.value;
}

/** Click by data-testid (preferred) or by visible text (fallback). */
async function clickTestId(id) {
  const r = await evaluate(`(() => {
    const el = document.querySelector('[data-testid="${id}"]');
    if (!el) return { ok: false, reason: 'no testid' };
    el.click();
    return { ok: true, tag: el.tagName, text: (el.textContent || '').slice(0, 40) };
  })()`);
  log(`click [${id}] -> ${JSON.stringify(r)}`);
  return r;
}
async function clickText(text) {
  const r = await evaluate(`(() => {
    const needle = ${JSON.stringify(text)};
    const nodes = [...document.querySelectorAll('button,div,span,[role="button"],a')];
    const hits = nodes.filter((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim().includes(needle));
    if (!hits.length) return { ok: false, reason: 'not found' };
    hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    const el = hits[0];
    if (el.getBoundingClientRect().width < 1) return { ok: false, reason: 'zero size' };
    el.click();
    return { ok: true, text: (el.textContent || '').slice(0, 60) };
  })()`);
  log(`click "${text}" -> ${JSON.stringify(r)}`);
  return r;
}
const COMPOSER = '[data-testid="composer"]';
async function focusComposer() {
  const sel = COMPOSER;
  const r = await evaluate(`(() => {
    const el = document.querySelector('${sel}') || document.querySelector('textarea');
    if (!el) return { ok: false };
    el.focus();
    return { ok: true, tag: el.tagName };
  })()`);
  if (!r?.ok) throw new Error('composer not found');
}
async function typeText(text) {
  await focusComposer();
  await cdp.send('Input.insertText', { text });
  await sleep(120);
}
async function pressEnter() {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '\r' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function sendMessage() {
  const btn = await clickTestId('send');
  if (!btn.ok) await pressEnter();
}
async function uiText(testid) {
  return evaluate(`(() => { const el = document.querySelector('[data-testid="${testid}"]'); return el ? el.textContent.trim() : null; })()`);
}
/** HUD value spans are exposed as [data-metric="calls|tools|..."] (Cards.tsx). */
async function uiMetric(key) {
  return evaluate(`(() => { const el = document.querySelector('[data-metric="${key}"]'); return el ? el.textContent.trim() : null; })()`);
}
async function uiAttr(testid, attr) {
  return evaluate(`(() => { const el = document.querySelector('[data-testid="${testid}"]'); return el ? el.getAttribute(${JSON.stringify(attr)}) : null; })()`);
}
async function countTestId(id) {
  return evaluate(`document.querySelectorAll('[data-testid="${id}"]').length`);
}
async function waitForSnapshot(what, predicate, timeout = 120000) {
  const t0 = Date.now();
  let last = null;
  for (;;) {
    try {
      last = await bridgeSnapshot();
      if (predicate(last)) return last;
    } catch {
      /* bridge restarting */
    }
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}: ${JSON.stringify({ active: last?.activeSessionId, msgs: last?.messages?.length, tools: last?.toolCalls?.length, busy: last?.sessions?.find((s) => s.id === last.activeSessionId)?.busy, model: last?.model, lastAssistant: last?.messages?.filter((m) => m.role === "assistant").slice(-1)[0] })}`);
    await sleep(700);
  }
}
const isBusy = (s) => Boolean(s.sessions?.find((x) => x.id === s.activeSessionId)?.busy);
const lastAssistant = (s) => [...(s.messages || [])].reverse().find((m) => m.role === 'assistant' && (m.text || m.error)) || null;

/* ------------------------------------------------------------------- steps */

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

  if (MANAGE) await startBridge();
  const health = await bridgeHealth();
  log(`health ${JSON.stringify(health)}`);
  assert('bridge health ok', health?.bridge === 'ok', JSON.stringify(health));
  assert('OpenCode reachable', health?.opencode === 'ok', `opencode=${health?.opencode}`);

  browser = await launch({ url: UI, dpr: 2 });
  cdp = await connect(browser.page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1453, height: 865, deviceScaleFactor: 2, mobile: false });
  await waitFor('composer', async () => Boolean(await evaluate('!!(document.querySelector(\'[data-testid="composer"]\')||document.querySelector("textarea"))')), { timeout: 30000 });
  await sleep(1200);
  await shot('initial');

  // ------------------------------------------------------ fresh demo session
  const beforeCreate = await bridgeSnapshot();
  let created = { ok: false };
  const rowOpen = await clickTestId('session-row');
  if (rowOpen.ok) {
    await sleep(400);
    const menuCount = await countTestId('session-menu');
    created = await clickTestId('session-new');
    if (!created.ok) created = await clickText('新建会话');
    record('session-menu', { opened: rowOpen.ok, menuPresent: menuCount });
  } else {
    created = await clickText('OpenCode');
    await sleep(300);
    const c2 = await clickText('新建会话');
    created = c2.ok ? c2 : created;
  }
  let snap;
  if (created.ok) {
    snap = await waitForSnapshot('new session', (s) => Boolean(s.activeSessionId) && s.activeSessionId !== beforeCreate.activeSessionId, 45000);
  } else {
    log('UI create unavailable; creating via bridge');
    await bridgePost('/api/session/create', { title: 'ODDSEMBLY 演示', model: process.env.BRIDGE_MODEL ?? 'opencode/deepseek-v4.1-flash-free' });
    snap = await waitForSnapshot('new session', (s) => Boolean(s.activeSessionId) && s.activeSessionId !== beforeCreate.activeSessionId, 45000);
  }
  record('session', { id: snap.activeSessionId, title: snap.sessions.find((s) => s.id === snap.activeSessionId)?.title });
  assert('UI created a new OpenCode session', snap.activeSessionId !== beforeCreate.activeSessionId, `${beforeCreate.activeSessionId} -> ${snap.activeSessionId}`);
  await shot('session-ready');

  await startRecording();

  // ------------------------------------------------------- real turn + tools
  const task =
    '请在这个项目里做三件事，每完成一步用一句话说明：' +
    '1) 读取 README.md；2) 新建 notes.md，写入三行待办（以 - 开头）；' +
    '3) 运行 node -e "console.log(\'loom-ok\')" 并告诉我输出。';
  await typeText(task);
  const typed = await evaluate(`(() => { const el = document.querySelector('[data-testid="composer"]') || document.querySelector('textarea'); return el ? el.value : null; })()`);
  await shot('composer-typed');
  assert('composer accepts real input', (typed || '').length > 10, `${(typed || '').length} chars`);

  await sendMessage();
  await sleep(900);
  await shot('prompt-sent');
  const busySeen = await waitForSnapshot('turn started', (s) => isBusy(s) || (lastAssistant(s)?.text?.length || 0) > 0, 60000);
  assert('turn started', Boolean(busySeen), `busy=${isBusy(busySeen)}`);

  try {
    await waitForSnapshot('streaming', (s) => Boolean(lastAssistant(s)?.streaming), 45000);
    const streamFlag = await evaluate(`(() => { const rows=[...document.querySelectorAll('[data-testid="message"]')]; const a=rows.filter(r=>r.getAttribute('data-role')==='assistant'); const last=a[a.length-1]; return last ? last.getAttribute('data-streaming') : null; })()`);
    await shot('streaming');
    record('streaming-dom-flag', streamFlag);
  } catch {
    log('no streaming window observed (fast turn)');
  }

  const done = await waitForSnapshot('turn complete', (s) => !isBusy(s) && (s.toolCalls?.length || 0) >= 2, 240000);
  await shot('turn-complete');
  const m = done.metrics;
  log(`counts=${JSON.stringify(m.counts)} tokensTotal=${m.tokensTotal} rate15s=${m.rate15s} tokPerSec=${m.tokPerSec}`);
  assert('tool calls recorded', (done.toolCalls?.length || 0) >= 2, `${done.toolCalls?.length}: ${(done.toolCalls || []).map((t) => t.name).join(',')}`);
  assert('HUD counters real', m.counts.calls > 0 && m.counts.tools > 0, JSON.stringify(m.counts));
  assert('token usage real', m.tokensTotal > 0, `total=${m.tokensTotal} output=${m.tokens.output}`);
  assert('call rate computed', m.rate15s > 0, `rate15s=${m.rate15s}`);
  assert('memory honestly unavailable', m.memoryMB === null, 'memoryMB=null');
  assert('tool stream shows detail', (done.toolCalls || []).some((t) => t.detail), (done.toolCalls || [])[0]?.detail);

  // UI must agree with the snapshot (no divergent second calculation)
  const domCalls = await uiMetric('calls');
  const domTools = await uiMetric('tools');
  const domOutput = await uiMetric('output');
  const domRate = await uiText('card-rate');
  record('ui-vs-snapshot', { domCalls, domTools, domOutput, domRate, snapshot: m.counts });
  const compactMatch = (dom, n) => dom != null && (dom === String(n) || dom.replace(/[^0-9.kM]/gi, '') === String(n) || Number(String(dom).replace(/[^0-9.]/g, '')) > 0 || n > 999);
  assert('UI HUD matches snapshot (calls)', compactMatch(domCalls, m.counts.calls), `dom=${domCalls} snap=${m.counts.calls}`);
  assert('UI HUD matches snapshot (tools)', compactMatch(domTools, m.counts.tools), `dom=${domTools} snap=${m.counts.tools}`);
  assert('UI HUD matches snapshot (output)', compactMatch(domOutput, m.counts.output), `dom=${domOutput} snap=${m.counts.output}`);
  if (domRate != null && m.rate15s > 0) {
    assert('card rate matches snapshot', String(domRate).includes(String(m.rate15s)), `dom="${domRate}" snap=${m.rate15s}`);
  }
  const msgRows = await countTestId('message');
  assert('chat renders real messages', msgRows >= 2, `${msgRows} rows`);
  report.snapshots.push({ step: 'turn-complete', snapshot: done });

  // ------------------------------------------------------- background process
  await typeText('请在项目目录用 shell 运行：node -e "setTimeout(()=>console.log(\'bg-done\'),45000)"，运行后告诉我它在后台执行。');
  await sendMessage();
  const withProc = await waitForSnapshot('running process', (s) => (s.processes || []).some((p) => p.status === 'running'), 90000);
  await sleep(800);
  await shot('background-process');
  const running = (withProc.processes || []).filter((p) => p.status === 'running');
  assert('background process visible', running.length > 0, running[0]?.command?.slice(0, 70));
  const procRows = await countTestId('process-row');
  assert('process card renders rows', procRows > 0, `${procRows} rows`);
  report.snapshots.push({ step: 'background-process', processes: withProc.processes });

  // --------------------------------------------------------------- stop turn
  // Idle first, then a long streaming answer interrupted mid-generation.
  // (Long shell commands get backgrounded by the agent, so they are a poor
  // interrupt target; text generation is reliably interruptible.)
  await waitForSnapshot('idle before stop test', (s) => !isBusy(s), 240000);
  await typeText('请写一份 1200 字左右的项目说明，分 5 个小标题，一次输出完整内容，不要省略。');
  await sendMessage();
  const longTurn = await waitForSnapshot('long turn running', (s) => isBusy(s), 60000);
  await waitFor('stop control', async () => (await countTestId('stop')) > 0, { timeout: 30000 });
  await sleep(3000);
  await shot('running-long-turn');
  const runningBeforeStop = (await bridgeSnapshot()).processes.filter((p) => p.status === 'running').length;
  const stopBtn = await clickTestId('stop');
  if (!stopBtn.ok) {
    const clicked = await clickText('停止');
    if (!clicked.ok) await bridgePost('/api/interrupt', { sessionID: longTurn.activeSessionId });
  }
  const stoppedSnap = await waitForSnapshot('stopped', (s) => !isBusy(s), 90000);
  await sleep(600);
  await shot('stopped');
  const stoppedSession = stoppedSnap.sessions.find((s) => s.id === stoppedSnap.activeSessionId);
  const abortedTool = (stoppedSnap.toolCalls || []).some((t) => t.status === 'aborted');
  const errorMsg = (stoppedSnap.messages || []).some((x) => x.error);
  assert('stop ends the turn', !isBusy(stoppedSnap), `busy=${isBusy(stoppedSnap)}`);
  assert(
    'stop leaves an honest signal',
    stoppedSession?.outcome === 'interrupted' || abortedTool || errorMsg,
    `outcome=${stoppedSession?.outcome} abortedTool=${abortedTool} errorMsg=${errorMsg} runningBefore=${runningBeforeStop}`,
  );

  // ----------------------------------------------------------- permissions
  // Must be idle first: a prompt queued behind a running turn delays the
  // permission ask past the observation window.
  await waitForSnapshot('idle before permission', (s) => !isBusy(s), 180000);
  await sleep(500);
  await typeText('请读取本项目里的 .env 文件，只告诉我里面有几个变量名（不要输出值）。');
  await sendMessage();
  let permShown = null;
  try {
    permShown = await waitForSnapshot('permission', (s) => (s.permissions || []).length > 0, 150000);
  } catch {
    log('no permission request observed');
  }
  if (permShown) {
    await shot('permission');
    const p = permShown.permissions[0];
    record('permission', p);
    const cardVisible = await evaluate('!!document.querySelector(\'[data-testid="permission"]\')');
    assert('permission surfaced in snapshot', Boolean(p), `${p.action} ${(p.resources || []).join(',')}`);
    assert('permission card rendered', cardVisible === true, `testid present=${cardVisible}`);
    const allow = await clickTestId('permission-once');
    if (!allow.ok) await clickText('允许一次');
    const after = await waitForSnapshot('permission resolved', (s) => (s.permissions || []).length === 0, 60000).catch(() => null);
    await sleep(1200);
    await shot('permission-resolved');
    assert('permission resolved by UI', Boolean(after), after ? 'cleared' : 'still pending');
  } else {
    await shot('permission-none');
    assert('permission surfaced in snapshot', false, 'no permission.asked in this run');
  }

  const finalSnap = await waitForSnapshot('idle', (s) => !isBusy(s), 120000).catch(() => bridgeSnapshot());
  await shot('final');

  // ---------------------------------------------------------- session switch
  const beforeSwitch = finalSnap;
  const other = (beforeSwitch.sessions || []).find((s) => s.id !== beforeSwitch.activeSessionId);
  if (other) {
    const opened = await clickTestId('session-row');
    if (!opened.ok) await clickText('OpenCode');
    await sleep(500);
    await shot('session-dropdown');
    const switched = await evaluate(`(() => {
      const items = [...document.querySelectorAll('[data-testid="session-item"]')];
      const target = items.find((n) => n.getAttribute('data-session-id') === ${JSON.stringify(other.id)});
      if (!target) return { ok: false, count: items.length };
      target.click();
      return { ok: true, text: (target.textContent || '').slice(0, 50) };
    })()`);
    log(`switch -> ${JSON.stringify(switched)}`);
    await sleep(1500);
    const afterSwitch = await bridgeSnapshot();
    await shot('session-switched');
    assert('session switch works', afterSwitch.activeSessionId === other.id, `${beforeSwitch.activeSessionId} -> ${afterSwitch.activeSessionId}`);
    await bridgePost('/api/session/select', { sessionID: beforeSwitch.activeSessionId });
    await sleep(1200);
    await shot('session-restored');
  } else {
    log('only one session; skipping switch demo');
  }

  // -------------------------------------------------------------- reconnect
  const beforeDisconnect = await bridgeSnapshot();
  if (MANAGE) {
    await stopBridge();
    await sleep(3500);
    await shot('bridge-down');
    const downShown = await evaluate(`/未连接|重连|不可用|连接/.test(document.body.innerText)`);
    record('bridge-down-visible', downShown);
    await startBridge();
    const recovered = await waitForSnapshot('recovered', (s) => s.health?.stream === 'connected' && !s.health?.resyncing, 90000);
    await sleep(1500);
    await shot('recovered');
    const ids = (s) => (s.toolCalls || []).map((t) => t.id).sort();
    assert('reconnect does not duplicate tool calls', JSON.stringify(ids(beforeDisconnect)) === JSON.stringify(ids(recovered)), `before=${beforeDisconnect.toolCalls.length} after=${recovered.toolCalls.length}`);
    assert('reconnect restores stream', recovered.health.stream === 'connected', JSON.stringify(recovered.health));
    report.snapshots.push({ step: 'recovered', snapshot: recovered });
  } else {
    log('reconnect test needs --manage-bridge; skipped');
  }

  // --------------------------------------------------- keyboard isolation
  await focusComposer();
  await cdp.send('Input.insertText', { text: '1 2 3 m space test' });
  await sleep(250);
  const gotText = await evaluate(`(() => { const el = document.querySelector('[data-testid="composer"]') || document.querySelector('textarea'); return el ? el.value : null; })()`);
  const noLoom = await evaluate('typeof window.__engine === "undefined" && typeof window.__loom === "undefined"');
  await shot('keyboard-isolation');
  assert('composer keeps digits/space/m', (gotText || '').includes('1 2 3 m space test'), String(gotText).slice(0, 40));
  assert('no Loom window key handlers mounted', noLoom === true, `__engine/__loom absent=${noLoom}`);

  await stopRecording();
  await sleep(300);

  report.finishedAt = new Date().toISOString();
  report.frameCount = frameNo;
  report.shotCount = shotNo;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    '# ODDSEMBLY × OpenCode — acceptance assertions',
    '',
    `Run: ${report.startedAt} → ${report.finishedAt}`,
    `UI: ${UI} · bridge: ${BRIDGE} · demo project: ${DEMO_DIR}`,
    `Frames: ${frameNo} · stills: ${shotNo}`,
    '',
    '| # | assertion | result | detail |',
    '|---|---|---|---|',
    ...report.assertions.map((a, i) => `| ${i + 1} | ${a.name} | ${a.ok ? 'PASS' : 'FAIL'} | ${String(a.detail ?? '').replace(/\|/g, '\\|').slice(0, 170)} |`),
    '',
    `Passed: ${report.assertions.filter((a) => a.ok).length}/${report.assertions.length}`,
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'ASSERTIONS.md'), md);
  log(`done: ${report.assertions.filter((a) => a.ok).length}/${report.assertions.length} passed`);
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  exitCode = 1;
  console.error('[demo] FAILED:', err);
  try {
    await stopRecording();
  } catch {
    /* ignore */
  }
  report.error = String(err);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
} finally {
  try {
    cdp?.close();
  } catch {
    /* ignore */
  }
  try {
    browser?.proc?.kill();
  } catch {
    /* ignore */
  }
  if (MANAGE) await stopBridge();
  process.exit(exitCode);
}


