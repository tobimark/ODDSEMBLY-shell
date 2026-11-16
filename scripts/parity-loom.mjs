/**
 * Loom visual-parity check: renders the same deterministic pick sequence on the
 * pre-refactor baseline build (.tmp/dist-baseline) and the new multi-mode build,
 * then compares screenshots byte-for-byte. This is the guard that the Phase-2
 * architecture refactor did not alter Astra's Loom visuals.
 *
 * usage: node scripts/parity-loom.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, comparePng, fileHash, sleep } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'review', 'v2', 'parity');
fs.mkdirSync(out, { recursive: true });

const EVENTS = [
  { id: 1, type: 'Read', detail: 'src/engine/loom/warpField.ts · 262 lines' },
  { id: 2, type: 'Edit', detail: 'src/engine/loom/heddleReed.ts · 12 - 38' },
  { id: 3, type: 'Write', detail: 'src/engine/loom/particles.ts · +64 lines' },
  { id: 4, type: 'Read', detail: 'src/engine/layout.ts · 52 lines' },
  { id: 5, type: 'Bash', detail: 'npm run build · exit 0 · 3.4 s' },
  { id: 6, type: 'Search', detail: 'grep "heddle" src · 14 matches' },
  { id: 7, type: 'Edit', detail: 'src/engine/loom/scene.ts · 44 - 61' },
  { id: 8, type: 'Write', detail: 'src/engine/anim/spring.ts · +38 lines' },
  { id: 9, type: 'Bash', detail: 'node scripts/capture.mjs · 4 shots' },
  { id: 10, type: 'Edit', detail: 'src/styles.css · 88 - 104' },
  { id: 11, type: 'Search', detail: 'grep "spring" src · 22 matches' },
  { id: 12, type: 'Write', detail: 'README.md · +96 lines' },
];

// virtual times of interest (seconds), screenshot names
const MARKS = [
  { t: 0.0, name: 'idle' },
  { t: 0.4, name: 'shed' },
  { t: 1.0, name: 'pick' },
  { t: 1.4, name: 'beat' },
  { t: 2.1, name: 'takeup' },
  { t: 10.0, name: 'mid' },
  { t: 20.0, name: 'after' },
];

/** explicit deterministic driver (avoids clever string templating above) */
async function runSequence(kind, rootDir, portBase) {
  const browser = await launch({ root: rootDir, httpPort: portBase, debugPort: portBase + 100 });
  const result = { kind, screenshots: {}, telemetry: null };
  try {
    const query = kind === 'v2' ? '?mode=loom&static=1&ui=0' : '?static=1&ui=0';
    await browser.goto(query, { ready: kind === 'v2' ? 'engine' : 'loom', settle: 600 });
    const inject = (e) => (kind === 'v2' ? 'window.__engine' : 'window.__loom') + `.inject(${JSON.stringify(e)})`;
    const api = kind === 'v2' ? 'window.__engine' : 'window.__loom';

    for (const m of MARKS) {
      if (m.t === 0) {
        await browser.screenshot(path.join(out, `${kind}-${m.name}.png`));
        result.screenshots[m.name] = await fileHash(path.join(out, `${kind}-${m.name}.png`));
        continue;
      }
      const prev = MARKS[MARKS.indexOf(m) - 1].t;
      let steps = Math.round((m.t - prev) * 10);
      if (m.name === 'shed') {
        for (const e of EVENTS) await browser.evaluate(inject(e));
      }
      // batch the deterministic ticks in one page-side loop (one CDP roundtrip each mark)
      while (steps > 0) {
        const chunk = Math.min(steps, 400);
        await browser.evaluate(`(()=>{for(let i=0;i<${chunk};i++) ${api}.tick(0.1);})()`);
        steps -= chunk;
      }
      await browser.screenshot(path.join(out, `${kind}-${m.name}.png`));
      result.screenshots[m.name] = await fileHash(path.join(out, `${kind}-${m.name}.png`));
    }
    const telemetryExpr = kind === 'v2'
      ? 'JSON.stringify(window.__engine.getModeTelemetry("loom"))'
      : 'JSON.stringify(window.__loom.getMechanism())';
    result.telemetry = JSON.parse(await browser.evaluate(telemetryExpr));
    result.exceptions = browser.exceptions().length;
  } finally {
    await browser.close();
  }
  return result;
}

const baseline = await runSequence('baseline', path.join(root, '.tmp', 'dist-baseline'), 4310);
const v2 = await runSequence('v2', path.join(root, 'dist'), 4320);

const rows = [];
for (const m of MARKS) {
  const a = path.join(out, `baseline-${m.name}.png`);
  const b = path.join(out, `v2-${m.name}.png`);
  const cmp = await comparePng(a, b);
  rows.push({ mark: m.name, equal: cmp.equal, baseline: cmp.hashA.slice(0, 12), v2: cmp.hashB.slice(0, 12), bytes: `${cmp.sizeA}/${cmp.sizeB}` });
}
const report = {
  checkedAt: new Date().toISOString(),
  method: 'headless Edge + SwiftShader, ?static=1, 12 queued events, 1/60 s manual ticks',
  rows,
  pickCounts: { baseline: baseline.telemetry?.picks ?? null, v2: v2.telemetry?.picks ?? null },
  stages: { baseline: baseline.telemetry?.stage ?? null, v2: v2.telemetry?.stage ?? null },
  exceptions: { baseline: baseline.exceptions, v2: v2.exceptions },
  pass: rows.every((r) => r.equal) && (baseline.telemetry?.picks === v2.telemetry?.picks),
};
fs.writeFileSync(path.join(out, 'parity-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
