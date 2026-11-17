/**
 * Capture the replica at exactly the same raster as the reference frame:
 * 1453x865 CSS px at devicePixelRatio 2  ->  2906x1730 PNG.
 *
 * usage: node tools/shoot.mjs [url] [outfile]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://127.0.0.1:5180/?static=1';
const out = path.resolve(root, process.argv[3] || 'shots/shell.png');

const CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) throw new Error('no chromium browser found');

fs.mkdirSync(path.dirname(out), { recursive: true });
const profile = path.join(root, '.tmp-edge-profile');
fs.rmSync(profile, { recursive: true, force: true });

const args = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  // The reference was rasterised by GPUI with ClearType subpixel AA. Enabling
  // LCD text in Chromium reproduces that fringing closely enough to measure
  // better across every text-heavy region (A/B on the same code: title 1.34->1.10,
  // sidebar 2.27->2.00, chrome 1.34->1.23). Set SHOOT_LCD=0 to fall back to
  // greyscale AA if a future change makes LCD lose again.
  process.env.SHOOT_LCD === '0' ? '--disable-lcd-text' : '--enable-lcd-text',
  '--force-device-scale-factor=2',
  '--window-size=1453,865',
  '--force-color-profile=srgb',
  `--user-data-dir=${profile}`,
  '--virtual-time-budget=9000',
  '--run-all-compositor-stages-before-draw',
  `--screenshot=${out}`,
  url,
];

// A blank/near-blank capture happens when the shot races an HMR reload, so retry
// once when the PNG is suspiciously small for a 2906x1730 frame.
function shoot(n = 0) {
  fs.rmSync(out, { force: true });
  const child = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore'] });
  child.on('exit', (code) => {
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    if (size < 120000) {
      if (n < 2) {
        console.warn(`capture looked blank (${size} bytes), retrying ${n + 1}/2`);
        setTimeout(() => shoot(n + 1), 1200);
        return;
      }
      console.error('screenshot failed, exit', code);
      process.exit(1);
    }
    console.log(`wrote ${out} (${size} bytes)`);
  });
}
shoot();
