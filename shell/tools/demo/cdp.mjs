/**
 * Minimal Chrome DevTools Protocol driver — zero dependencies.
 *
 * Node 22 ships a global WebSocket and fetch, so the ODDSEMBLY acceptance demo
 * can drive the real UI in a real browser without Puppeteer/Playwright:
 *
 *   launch()  -> spawns headless Edge with remote debugging
 *   connect() -> speaks CDP over the page target's WebSocket
 *   Page.captureScreenshot  -> stills
 *   Page.startScreencast    -> the demo recording (real frames, real session)
 *
 * Nothing here mocks the app: every frame is the product rendering data that
 * came from a live OpenCode session.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

export function findBrowser() {
  const exe = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Chromium browser found (set EDGE_PATH)');
  return exe;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, { timeout = 30000, interval = 200 } = {}) {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* keep waiting */
    }
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${what}`);
    await sleep(interval);
  }
}

export async function launch({ port = 9333, url, width = 1453, height = 865, dpr = 2, profile }) {
  const exe = findBrowser();
  // Keep the throwaway profile OUTSIDE the Vite root: browsers rewrite their own
  // files constantly, and a profile inside the watched tree makes Vite reload the
  // page mid-probe (which leaves CDP `Runtime.evaluate` forever pending).
  const userDataDir = profile || path.join(os.tmpdir(), 'kunlun-cdp', `profile-${port}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--enable-lcd-text',
      '--force-color-profile=srgb',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${dpr}`,
      '--autoplay-policy=no-user-gesture-required',
      url,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );

  const version = await waitFor('CDP /json/version', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok ? res.json() : null;
  });
  const page = await waitFor('page target', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = await res.json();
    return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
  });

  return { proc, port, version, page, userDataDir };
}

/** CDP session over the page's WebSocket. */
export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const handlers = new Map();

    const onMessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code})`));
        else res(msg.result);
        return;
      }
      if (msg.method && handlers.has(msg.method)) {
        for (const h of handlers.get(msg.method)) h(msg.params);
      }
    };

    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      });

    const on = (method, fn) => {
      if (!handlers.has(method)) handlers.set(method, new Set());
      handlers.get(method).add(fn);
      return () => handlers.get(method)?.delete(fn);
    };

    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', (e) => reject(new Error(`CDP socket error: ${e.message || e.type}`)));
    ws.addEventListener('open', () => {
      resolve({
        send,
        on,
        close: () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
      });
    });
  });
}

export { sleep, waitFor };
