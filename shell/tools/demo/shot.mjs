/**
 * CDP screenshot helper (the `--screenshot=` flag hangs while the app holds an
 * SSE connection open, so we drive the browser instead).
 *
 *   node tools/demo/shot.mjs out.png [--url URL] [--wait 4000] [--width 1453] [--height 865] [--dpr 2]
 *
 * Writes a real PNG of the running app, then tears the browser down.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, launch, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const out = path.resolve(process.argv[2] || path.join(ROOT, 'tools/demo/out/shot.png'));
const url = arg('url', process.env.UI_URL || 'http://127.0.0.1:5180/');
const waitMs = Number(arg('wait', '4500'));
const width = Number(arg('width', '1453'));
const height = Number(arg('height', '865'));
const dpr = Number(arg('dpr', '2'));
const port = Number(arg('port', String(9400 + Math.floor(Math.random() * 200))));

const b = await launch({ url, port, width, height, dpr });
let code = 0;
try {
  const cdp = await connect(b.page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  await sleep(waitMs);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`wrote ${path.relative(ROOT, out)} (${fs.statSync(out).size} bytes)`);
  cdp.close();
} catch (err) {
  console.error('shot failed:', err);
  code = 1;
} finally {
  try {
    execSync(`taskkill /PID ${b.proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
  process.exit(code);
}
