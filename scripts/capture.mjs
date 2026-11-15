/**
 * Headless capture via Edge DevTools Protocol.
 * usage: node scripts/capture.mjs static|anim|state
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.resolve(dir, '..', 'shots');
fs.mkdirSync(shots, { recursive: true });
const mode = process.argv[2] || 'static';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL_BASE = 'http://127.0.0.1:4178';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { const j = await r.json(); return j.webSocketDebuggerUrl; }
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('edge debugging endpoint not ready');
}

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.events = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        const list = this.events.get(msg.method) || []; list.push(msg.params); this.events.set(msg.method, list);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const server = await startServer(4178);
  const profile = path.resolve(dir, '..', '.tmp-edge-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
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

  try {
    const wsUrl = await getWs();
    const browser = await fetch(`http://127.0.0.1:${PORT}/json/list`).catch(() => null);
    const ws = new CDP(wsUrl);
    await ws.open();
    const { targetId } = await ws.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await ws.send('Target.attachToTarget', { targetId, flatten: true });
    const sess = (method, params) => ws.send(method, params); // flatten messages carry sessionId only when using Target.sendMessageToTarget; approximate

    // Flatten mode: attach returns sessionId; subsequent calls need sessionId field.
    const sendS = (method, params = {}) => {
      const id = ++ws.id;
      ws.ws.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => ws.pending.set(id, { resolve, reject }));
    };

    await sendS('Page.enable');
    await sendS('Runtime.enable');
    await sendS('Emulation.setDeviceMetricsOverride', { width: 1472, height: 1008, deviceScaleFactor: 1, mobile: false });

    const url = mode === 'static' ? `${URL_BASE}/?static=1` : mode === 'hero-art' ? `${URL_BASE}/?noauto=1&ui=0` : `${URL_BASE}/?noauto=1`;
    await sendS('Page.navigate', { url });
    await sleep(1200);
    await sendS('Runtime.evaluate', { expression: 'new Promise(r => { const t=setInterval(()=>{ if(window.__loom&&window.__loom.ready){clearInterval(t);r(1)} },100); setTimeout(()=>{clearInterval(t);r(0)},15000) })', awaitPromise: true });
    // let first paint settle
    await sleep(1200);

    const shoot = async (name) => {
      const res = await sendS('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const p = path.join(shots, name);
      fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
      console.log('saved', p);
    };

    if (mode === 'static') {
      // freeze exactly at idle state
      await sendS('Runtime.evaluate', { expression: 'window.__loom.pause()' });
      await sleep(300);
      await shoot('static.png');
      await shoot('static-idle.png');
    } else if (mode === 'hero' || mode === 'hero-art') {
      await sendS('Runtime.evaluate', { expression: 'window.__loom.play()' });
      await sleep(2400);
      const seq = ['Read', 'Edit', 'Write', 'Bash', 'Edit', 'Search'];
      for (const t of seq) {
        await sendS('Runtime.evaluate', { expression: `window.__loom.trigger(${JSON.stringify(t)})` });
        await sleep(260);
      }
      await sleep(500);
      await shoot(mode === 'hero' ? 'hero.png' : 'hero-art.png');
      await sendS('Runtime.evaluate', { expression: 'window.__loom.pause()' });
      await sleep(250);
      await shoot(mode === 'hero' ? 'hero-paused.png' : 'hero-art-paused.png');
    } else if (mode === 'record') {
      await sendS('Runtime.evaluate', { expression: 'window.__loom.play()' });
      await sleep(1200);
      const seq = ['Read', 'Edit', 'Write', 'Bash', 'Search', 'Edit', 'Bash', 'Read', 'Write', 'Edit'];
      for (let i = 0; i < 40; i++) {
        if (i < seq.length * 3 && i % 3 === 0) {
          await sendS('Runtime.evaluate', { expression: `window.__loom.trigger(${JSON.stringify(seq[Math.floor(i / 3) % seq.length])})` });
        }
        await sendS('Runtime.evaluate', { expression: 'window.__loom.tick(0.07)' });
        await sleep(40);
        await shoot(`record-${String(i).padStart(3, '0')}.png`);
      }
    } else {
      // animation capture: idle -> play -> burst -> pause
      await shoot('anim-000-idle.png');
      await sendS('Runtime.evaluate', { expression: 'window.__loom.play()' });
      await sleep(2000);
      const seq = ['Read', 'Edit', 'Write', 'Bash', 'Search', 'Edit', 'Bash', 'Write'];
      for (let i = 0; i < seq.length; i++) {
        await sendS('Runtime.evaluate', { expression: `window.__loom.trigger(${JSON.stringify(seq[i])})` });
        await sleep(140);
        await shoot(`anim-${String(i + 1).padStart(3, '0')}-${seq[i]}.png`);
      }
      await sleep(600);
      await shoot('anim-999-after.png');
      await sendS('Runtime.evaluate', { expression: 'window.__loom.pause()' });
      await sleep(200);
      await shoot('anim-998-paused.png');
    }

    // diagnostics
    const diag = await sendS('Runtime.evaluate', {
      expression: 'JSON.stringify({ state: window.__loom?.getStatus?.().state, events: window.__loom?.getStatus?.().events, canvas: (()=>{const c=document.querySelector("canvas"); return c?{w:c.width,h:c.height}:null})(), err: document.querySelector(".fatal")?.textContent || null })',
      returnByValue: true,
    });
    console.log('diag', diag.result?.value ?? diag.result);
    await ws.send('Browser.close').catch(() => {});
  } finally {
    edge.kill();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
