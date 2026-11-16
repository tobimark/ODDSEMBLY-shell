/**
 * Motion flipbook for the event dial: one 180 ms index step captured at 60 fps
 * under a 2× viewport, cropped to the read head. Produces frames + a contact
 * sheet (if Pillow is available) for visual review.
 *
 * Usage: npm run build && node scripts/shot-dial-motion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review', 'event-dial', 'motion');
fs.mkdirSync(out, { recursive: true });

const b = await launch({ root: path.join(root, 'dist'), httpPort: 4631, debugPort: 4731, width: 1472, height: 1008 });
const clip = { x: 30, y: 40, width: 460, height: 400, scale: 1 };
const frames = [];
try {
  await b.setViewport(1472, 1008, 2);
  await b.goto('?mode=loom&static=1&ui=0');
  const tick = async (n) => b.evaluate(`(()=>{for(let i=0;i<${n};i++)window.__engine.tick(1/60)})()`);
  const shot = async (name) => {
    await b.screenshot(path.join(out, name), { clip });
    frames.push(name);
  };

  // settle a Read card first
  await b.evaluate(`window.__engine.inject({id:1,type:'Read',detail:'src/main.ts · 120 lines',at:0})`);
  await tick(40);
  await shot('f00-hold-read.png');

  // then a Bash card: the 105 ms arm + 180 ms index step start here
  await b.evaluate(`window.__engine.inject({id:2,type:'Bash',detail:'npm test · 12/12 pass',at:0})`);
  let elapsed = 0;
  for (let i = 0; i < 12; i++) {
    // first two samples sit inside the 105 ms display delay
    await tick(i === 0 ? 3 : 2);
    elapsed += (i === 0 ? 3 : 2) * (1000 / 60);
    const t = await b.evaluate('window.__engine.getModeTelemetry().dial');
    await shot(`f${String(i + 1).padStart(2, '0')}-${String(Math.round(elapsed)).padStart(3, '0')}ms.png`);
    frames[frames.length - 1] = frames[frames.length - 1];
    console.log(`t≈${String(Math.round(elapsed)).padStart(3)} ms  phase=${t.phase}  angle=${t.angleDeg.toFixed(1)}°  slot=${t.slot}`);
  }
  const final = await b.evaluate('window.__engine.getModeTelemetry().dial');
  console.log('final', JSON.stringify(final));
} finally {
  await b.close();
}
fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ clip, frames }, null, 2));
console.log('saved', frames.length, 'frames under review/event-dial/motion/');
