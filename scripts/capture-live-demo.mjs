/**
 * Capture a real OpenCode session for the same-run demo video.
 *
 * Records two independent, authentic surfaces on one clock:
 *   · the real CLI's stdout/stderr, line by line, with arrival timestamps;
 *   · the real Loom page, frame by frame, through the Chrome DevTools screencast.
 *
 * `scripts/compose-live-demo.py` then fuses them into `shots/opencode-loom-live.mp4`.
 * Nothing here is injected into the Loom: the page only ever sees the bridge.
 *
 * usage: node scripts/capture-live-demo.mjs
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
const FRAMES = path.join(TMP, 'screencast');
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OPENCODE = process.env.OPENCODE_BIN || 'D:\\npm\\node_modules\\@opencode\\cli\\bin\\opencode.exe';
const MODEL = process.env.OPENCODE_MODEL || 'opencode/deepseek-v4.1-flash-free';
const CDP_PORT = 9337;
const WEB_PORT = 4178;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const svc = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'opencode', 'service.json'), 'utf8'));
const OC_BASE = `http://127.0.0.1:${svc.port}`;

async function freePort(start) {
  const canBind = (p) => new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(p, '127.0.0.1');
  });
  for (let p = start; p < start + 20; p++) if (await canBind(p)) return p;
  throw new Error('no free port');
}

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        const fn = this.handlers.get(msg.method);
        if (fn) fn(msg.params);
      }
    };
  }
  on(method, fn) { this.handlers.set(method, fn); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

/* ------------------------------------------------------------------- capture */

const transcript = [];
let clock = null;
function push(kind, text) {
  const t = Date.now();
  if (clock === null) clock = t;
  for (const line of String(text).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').split(/\r?\n/)) {
    const clean = line.replace(/[\x00-\x08\x0b-\x1f]/g, '').trimEnd();
    if (!clean) continue;
    transcript.push({ t: t - clock, kind, text: clean });
  }
}

async function main() {
  setContent();
  const bridgePort = await freePort(8787);
  const server = await startServer(WEB_PORT);
  const bridgeLog = fs.openSync(path.join(TMP, 'demo-bridge.log'), 'a');
  const bridge = spawn(process.execPath, [path.join(ROOT, 'scripts', 'opencode-loom-bridge.mjs'),
    `--port=${bridgePort}`, `--server=${OC_BASE}`], {
    cwd: ROOT, env: { ...process.env, OPENCODE_PASSWORD: svc.password }, stdio: ['ignore', bridgeLog, bridgeLog],
  });

  const profile = fs.mkdtempSync(path.join(TMP, 'edge-demo-'));
  const edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--window-size=1472,1008',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-features=Translate,MediaRouter', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  if (!wsUrl) throw new Error('headless Edge did not start');

  const cdp = new CDP(wsUrl);
  await cdp.open();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const sendS = (m, p = {}) => cdp.send(m, p, sessionId);

  const frames = [];
  cdp.on('Page.screencastFrame', async (p) => {
    const file = `f-${String(frames.length).padStart(5, '0')}.jpg`;
    try { fs.writeFileSync(path.join(FRAMES, file), Buffer.from(p.data, 'base64')); } catch { /* disk */ }
    const t = Date.now();
    if (clock === null) clock = t;
    frames.push({ t: t - clock, file });
    try { await sendS('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch { /* closed */ }
  });

  await sendS('Page.enable');
  await sendS('Runtime.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: 1472, height: 1008, deviceScaleFactor: 1, mobile: false });
  await sendS('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/?mode=loom&live=ws://127.0.0.1:${bridgePort}&noauto=1` });
  await sendS('Runtime.evaluate', {
    expression: 'new Promise(r => { const t=setInterval(()=>{ if(window.__loom&&window.__loom.live){clearInterval(t);r(1)} },100); setTimeout(()=>{clearInterval(t);r(0)},20000) })',
    awaitPromise: true,
  });
  await sleep(1500);

  // the run's clock starts here, so transcript and frames share one origin
  clock = Date.now();
  push('banner', 'ODDSEMBLY · OpenCode → Loom');
  push('dim', `server ${OC_BASE}`);
  push('dim', 'real tool calls only — no synthetic events');
  await sendS('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1472, maxHeight: 1008, everyNthFrame: 1 });

  const turn = async (label, prompt) => {
    push('banner', '');
    push('banner', `=== ${label} ===`);
    const child = spawn(OPENCODE, ['run', '--server', OC_BASE, '-m', MODEL, prompt], {
      cwd: ROOT,
      env: {
        ...process.env,
        XDG_DATA_HOME: path.join(TMP, 'oc-data'),
        XDG_CONFIG_HOME: path.join(TMP, 'oc-config'),
        XDG_CACHE_HOME: path.join(TMP, 'oc-cache'),
        XDG_STATE_HOME: path.join(TMP, 'oc-state'),
        OPENCODE_PASSWORD: svc.password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => push('out', d));
    child.stderr.on('data', (d) => push('err', d));
    const code = await new Promise((r) => child.on('close', r));
    push('dim', `exit ${code}`);
    await sleep(3200);
  };

  await turn('A · READ / BASH / BASH / EDIT', [
    'Do exactly these four steps in this order, one tool call each, nothing else:',
    '1. read the file .tmp/live-scratch.md',
    '2. shell: Write-Output loom-first',
    '3. shell: Write-Output loom-second',
    '4. edit .tmp/live-scratch.md, replacing the exact text "seed line" with "seed line woven"',
    'Then reply with the single word ok.',
  ].join('\n'));

  await turn('B · SAME TOOL ×2', [
    'Do exactly these two steps in this order, one tool call each, nothing else:',
    '1. read .tmp/same-a.txt',
    '2. read .tmp/same-b.txt',
    'Then reply with the single word ok.',
  ].join('\n'));

  await turn('C · BURST · 10 SHELL CALLS', [
    'Use the shell tool 10 times in a single step — one call per command, do not batch them:',
    'Write-Output loom-1, Write-Output loom-2, Write-Output loom-3, Write-Output loom-4, Write-Output loom-5,',
    'Write-Output loom-6, Write-Output loom-7, Write-Output loom-8, Write-Output loom-9, Write-Output loom-10.',
    'Then reply with the single word ok.',
  ].join('\n'));

  await sleep(4500);
  try { await sendS('Page.stopScreencast'); } catch { /* closed */ }

  const session = { startedAt: clock, transcript, frames };
  fs.writeFileSync(path.join(TMP, 'demo-session.json'), JSON.stringify(session));
  console.log(`captured ${transcript.length} transcript lines, ${frames.length} frames, ${(Date.now() - clock) / 1000}s`);

  try { cdp.ws.close(); } catch { /* noop */ }
  try { edge.kill(); } catch { /* noop */ }
  try { bridge.kill(); } catch { /* noop */ }
  server.close();
  fs.closeSync(bridgeLog);
}

function setContent() {
  const dirTmp = path.join(TMP);
  fs.mkdirSync(dirTmp, { recursive: true });
  fs.writeFileSync(path.join(dirTmp, 'live-scratch.md'), 'seed line');
  fs.writeFileSync(path.join(dirTmp, 'same-a.txt'), 'alpha');
  fs.writeFileSync(path.join(dirTmp, 'same-b.txt'), 'beta');
}

main().catch((err) => { console.error(err); process.exit(1); });
