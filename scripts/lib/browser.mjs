/** Minimal CDP browser harness shared by every capture / verification script.
 * Launches headless Edge, connects over DevTools, and exposes evaluate/screenshot. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../serve.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p?.reject(new Error(JSON.stringify(m.error))) : p?.resolve(m.result);
      } else this.events.push(m);
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.root] dist directory to serve
 * @param {number} [opts.httpPort]
 * @param {number} [opts.debugPort]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {boolean} [opts.swiftshader] force software ANGLE (deterministic CI)
 */
export async function launch(opts = {}) {
  const {
    root = path.resolve(import.meta.dirname, '..', 'dist'),
    httpPort = 4178,
    debugPort = 9337,
    width = 1472,
    height = 1008,
    swiftshader = false,
  } = opts;
  const tmpRoot = path.resolve(import.meta.dirname, '..', '..', '.tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(tmpRoot, 'edge-'));
  const server = await startServer(httpPort, root);
  const args = [
    '--autoplay-policy=no-user-gesture-required',
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...(swiftshader ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []),
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  const edge = spawn(EDGE, args, { stdio: 'ignore', windowsHide: true });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { endpoint = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(); break; } catch { await sleep(150); }
  }
  if (!endpoint) throw new Error('Browser failed to start');
  const cdp = new CDP(endpoint.webSocketDebuggerUrl);
  await cdp.open();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p = {}) => cdp.send(m, p, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  try { await send('Log.enable'); } catch { /* Log domain is optional */ }
  const setViewport = async (w = width, h = height, dsf = 1) =>
    send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: false });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result?.value;
  };

  const api = {
    cdp, send, endpoint, evaluate, setViewport,
    sleep,
    async goto(query, { ready = 'engine', settle = 400 } = {}) {
      await send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/${query}` });
      await sleep(500);
      const readyExpr = ready === 'engine'
        ? 'new Promise(r=>{const t=setInterval(()=>{if(window.__engine){clearInterval(t);r(1)}},60);setTimeout(()=>{clearInterval(t);r(0)},20000)})'
        : 'new Promise(r=>{const t=setInterval(()=>{if(window.__loom){clearInterval(t);r(1)}},60);setTimeout(()=>{clearInterval(t);r(0)},20000)})';
      float: {
        const has = await evaluate(readyExpr);
        if (!has) throw new Error('page did not expose engine');
      }
      await evaluate('window.__engine ? window.__engine.ready.then(()=>window.__engine.readyWithReplay?.(true)) : window.__loom.ready');
      await sleep(settle);
    },
    async screenshot(file, { clip } = {}) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    /** Current length of the retained CDP event buffer (usage: errors since a mark). */
    mark() { return cdp.events.length; },
    /** Poll an in-page expression until truthy; resolves null after timeout. */
    async waitFor(expression, timeoutMs = 8000, intervalMs = 80) {
      const value = await evaluate(`new Promise((resolve)=>{const started=Date.now();const t=setInterval(()=>{let v=null;try{v=(${expression})}catch(e){clearInterval(t);resolve({__error:String(e&&e.message||e)});return}if(v){clearInterval(t);resolve(v)}else if(Date.now()-started>${timeoutMs}){clearInterval(t);resolve(null)}},${intervalMs})})`);
      if (value && typeof value === 'object' && '__error' in value) throw new Error('waitFor failed: ' + value.__error);
      return value;
    },
    /** Summarised uncaught exceptions, console errors and log errors since a mark. */
    errorsSince(mark = 0) {
      const slice = cdp.events.slice(mark);
      const exceptions = slice
        .filter((e) => e.method === 'Runtime.exceptionThrown')
        .map((e) => {
          const d = e.params?.exceptionDetails ?? {};
          return { text: d.text, description: d.exception?.description?.slice(0, 400), url: d.url, line: d.lineNumber };
        });
      const consoleErrors = slice
        .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
        .map((e) => (e.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 400));
      const logErrors = slice
        .filter((e) => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
        .map((e) => ({ source: e.params.entry.source, text: (e.params.entry.text ?? '').slice(0, 400), url: e.params.entry.url }));
      return { exceptions, consoleErrors, logErrors, total: exceptions.length + consoleErrors.length + logErrors.length };
    },
    /** Renderer string reported by WebGL (recording evidence / environment pinning). */
    async renderer() {
      return evaluate(`(()=>{const c=document.querySelector('canvas');if(!c)return null;const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()`);
    },
    async close() {
      try { await send('Browser.close'); } catch { /* noop */ }
      try { cdp.ws.close(); } catch { /* noop */ }
      edge.kill();
      server.close();
    },
    exceptions() { return cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown'); },
  };
  await setViewport();
  return api;
}

/** sha256 of a file (used for pixel-determinism checks). */
export async function fileHash(file) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Compare two PNG files byte-wise and report equal/size deltas. */
export async function comparePng(a, b) {
  const { createHash } = await import('node:crypto');
  const A = fs.readFileSync(a); const B = fs.readFileSync(b);
  const ha = createHash('sha256').update(A).digest('hex');
  const hb = createHash('sha256').update(B).digest('hex');
  return { equal: ha === hb, hashA: ha, hashB: hb, sizeA: A.length, sizeB: B.length };
}
