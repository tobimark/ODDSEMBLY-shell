/**
 * Single-mode screenshot / telemetry harness for mode development.
 *
 *   node scripts/shot-mode.mjs --mode=chips --name=idle
 *   node scripts/shot-mode.mjs --mode=chips --name=burst --events=12 --ticks=90
 *   node scripts/shot-mode.mjs --mode=chips --root=.tmp/dist-chips --query="?mode=chips&static=1&ui=0"
 *
 * Flags:
 *   --mode      loom|chips|westworld (default: from --query or loom)
 *   --root      dist directory to serve (default: dist)
 *   --query     full query string (default "?mode=<mode>&static=1&ui=0")
 *   --events    number of synthetic tool events injected before ticking
 *   --types     comma list override for event types
 *   --ticks     number of deterministic 1/60 s ticks after injection
 *   --dt        tick seconds (default 1/60)
 *   --out       output png path (default review/v2/wip/<mode>-<name>.png)
 *   --w, --h    viewport (default 1472x1008)
 *   --port      http port (default 4410)
 *   --json      print full telemetry JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const root = path.resolve(import.meta.dirname, '..');
const mode = argv.mode || 'loom';
const query = argv.query || `?mode=${mode}&static=1&ui=0`;
const events = Number(argv.events || 0);
const ticks = Number(argv.ticks || 0);
const dt = Number(argv.dt || 1 / 60);
const types = (argv.types || 'Read,Edit,Write,Bash,Search').split(',');
const out = path.resolve(argv.out || path.join(root, 'review', 'v2', 'wip', `${mode}-${argv.name || 'shot'}.png`));
const width = Number(argv.w || 1472);
const height = Number(argv.h || 1008);
const port = Number(argv.port || 4410);

const browser = await launch({ root: path.resolve(root, argv.root || 'dist'), httpPort: port, debugPort: port + 100 });
let code = 0;
try {
  await browser.setViewport(width, height);
  await browser.goto(query, { settle: 500 });
  const api = `window.__engine`;
  const modeFromPage = await browser.evaluate('window.__engine.getMode()');
  if (events > 0) {
    const batch = Array.from({ length: events }, (_, i) => ({
      id: i + 1,
      type: types[i % types.length],
      detail: `dev event ${i + 1} · ${types[i % types.length].toLowerCase()} step ${100 + i}`,
      at: i * 120,
    }));
    await browser.evaluate(`(()=>{${JSON.stringify(batch)}.forEach(e=>window.__engine.inject(e));return true;})()`);
  }
  if (ticks > 0) {
    let left = ticks;
    while (left > 0) {
      const chunk = Math.min(left, 400);
      await browser.evaluate(`(()=>{for(let i=0;i<${chunk};i++) ${api}.tick(${dt});return true;})()`);
      left -= chunk;
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await browser.screenshot(out);
  const telemetry = await browser.evaluate('JSON.stringify(window.__engine.getTelemetry())');
  const exceptions = browser.exceptions();
  console.log(JSON.stringify({
    shot: out,
    mode: modeFromPage,
    query,
    events,
    ticks,
    telemetry: JSON.parse(telemetry),
    exceptions: exceptions.length,
  }, null, 2));
  if (exceptions.length) code = 1;
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
