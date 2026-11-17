/**
 * Scripted demo feed — MOCK data, not an agent.
 *
 * Posts a curated tool-call session to a bridge started with `--allow-inject`,
 * so the page renders it through the exact same live path as real OpenCode calls.
 * The point is to show the whole arc: empty loom → cloth grows → burst folds →
 * light pulses → a full bolt resets to a new one.
 *
 *   node scripts/mock-demo.mjs --url=http://127.0.0.1:8790 --interval=700 --loop
 */
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  return [k, v];
}));
const BASE = args.get('url') ?? 'http://127.0.0.1:8790';
const INTERVAL = Number(args.get('interval') ?? 700);
const LOOP = args.has('loop');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One plausible working session: reads, shells, an edit, then a burst. */
const SCRIPT = [
  { type: 'Read', detail: 'src/loom/scene.ts', gap: 2 },
  { type: 'Bash', detail: 'npm test', gap: 2 },
  { type: 'Bash', detail: 'npm run build', gap: 2 },
  { type: 'Edit', detail: 'src/loom/scene.ts · +18 −4', gap: 2 },
  { type: 'Write', detail: 'docs/LOOM_VISUAL.md · +96', gap: 2 },
  { type: 'Search', detail: 'takeUp', gap: 2 },
  { type: 'Read', detail: 'src/loom/textile.ts', gap: 2 },
  // A burst: the agent fires a dozen shells in one step.
  ...Array.from({ length: 12 }, (_, i) => ({ type: 'Bash', detail: `npm run check -- ${i + 1}`, gap: 0.25 })),
  // Back to a normal cadence.
  { type: 'Read', detail: 'src/loom/atelier/conduit.ts', gap: 1.5 },
  { type: 'Edit', detail: 'src/loom/atelier/textile.ts · +32 −12', gap: 1.5 },
  { type: 'Bash', detail: 'node scripts/test-dial.mjs', gap: 1.5 },
  { type: 'Write', detail: 'shots/demo.md', gap: 1.5 },
  { type: 'Read', detail: 'README.md', gap: 1.5 },
  { type: 'Search', detail: 'WEAVE.fell', gap: 1.5 },
  // Fill the bolt to the reset, so the demo also shows the new-cloth cycle.
  ...Array.from({ length: 46 }, (_, i) => ({
    type: ['Read', 'Bash', 'Edit', 'Write', 'Search'][i % 5],
    detail: `pass ${i + 1}`,
    gap: 0.9,
  })),
];

let sent = 0;
async function post(step) {
  const res = await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: step.type, detail: step.detail }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  sent += 1;
  process.stdout.write(`\r  mock ${String(sent).padStart(3)} · ${step.type.padEnd(6)} ${step.detail.slice(0, 34).padEnd(34)}`);
}

async function main() {
  do {
    for (const step of SCRIPT) {
      await post(step);
      await sleep(INTERVAL * step.gap);
    }
    if (LOOP) {
      console.log('\n  cycle complete — restarting so the loom weaves a new bolt');
      await sleep(2500);
    }
  } while (LOOP);
  console.log(`\n  sent ${sent} mock calls`);
}

main().catch((err) => { console.error(err); process.exit(1); });
