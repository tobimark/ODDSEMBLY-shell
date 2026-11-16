/**
 * Capture the exact deterministic state used by review/event-dial/04-hold-s01.png
 * at 2× for region annotation (same tick sequence as review-event-dial.mjs).
 *
 * Usage: npm run build && node scripts/shot-dial-annotate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launch } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review', 'event-dial', 'annotation');
fs.mkdirSync(out, { recursive: true });

const b = await launch({ root: path.join(root, 'dist'), httpPort: 4633, debugPort: 4733, width: 1472, height: 1008 });
try {
  await b.setViewport(1472, 1008, 2);
  await b.goto('?mode=loom&static=1&ui=0');
  const tick = async (seconds) => {
    const frames = Math.max(1, Math.round(seconds * 60));
    await b.evaluate(`(()=>{for(let i=0;i<${frames};i++)window.__engine.tick(1/60)})()`);
  };
  await b.evaluate(`window.__engine.inject({id:100,type:'Read',detail:'src/modes/loom/scene.ts · burst 1',at:0})`);
  await tick(0.05);
  await tick(0.11);
  await tick(0.5);
  const dial = await b.evaluate('window.__engine.getModeTelemetry().dial');
  assert.equal(dial.type, 'Read');
  assert.equal(dial.count, 1);
  assert.equal(dial.slot, 1);
  assert.equal(dial.angleDeg, 30);
  assert.equal(dial.phase, 'holding');
  await b.screenshot(path.join(out, 'base-2x.png'));
  fs.writeFileSync(path.join(out, 'base-telemetry.json'), JSON.stringify({ viewport: [1472, 1008], dpr: 2, dial }, null, 2));
  console.log('saved base-2x.png  dial=', JSON.stringify(dial));
} finally {
  await b.close();
}
