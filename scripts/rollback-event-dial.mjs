/**
 * Restore the pre-dynamic-dial event instrument.
 *
 *   node scripts/rollback-event-dial.mjs --dry-run   # print the plan only
 *   node scripts/rollback-event-dial.mjs --yes       # execute
 *
 * The rollback restores the files changed by the dynamic-dial work from the
 * `pre-dynamic-dial` tag and deletes the files added by it. Unrelated working
 * tree changes (App.tsx / engine.ts fixes, review artefacts) are not touched.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const REV = 'pre-dynamic-dial';
const flags = new Set(process.argv.slice(2));
const dryRun = flags.has('--dry-run') || !flags.has('--yes');

const MODIFIED = [
  'src/engine/modes/loom/atelier/eventDial.ts',
  'src/engine/modes/loom/atelier/integration.ts',
  'src/engine/modes/loom/atelier/assembly.ts',
  'src/engine/modes/loom/scene.ts',
  'src/engine/modes/loom/index.ts',
  'scripts/review-precision.mjs',
  'package.json',
  'README.md',
];
const ADDED = [
  'src/engine/modes/loom/atelier/dialGeometry.ts',
  'src/engine/modes/loom/atelier/dialModel.ts',
  'src/engine/modes/loom/atelier/toolPalette.ts',
  'scripts/test-dial.mjs',
  'scripts/review-event-dial.mjs',
  'scripts/shot-dial-motion.mjs',
  'docs/EVENT_DIAL.md',
  'docs/ROLLBACK.md',
];

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const run = (args) => spawnSync('git', args, { cwd: root, stdio: 'inherit' });

const repo = git(['rev-parse', '--show-toplevel']);
if (repo.status !== 0) {
  console.error('not a git repository:', repo.stderr?.trim());
  process.exit(1);
}
const rev = git(['rev-parse', '--verify', `${REV}^{commit}`]);
if (rev.status !== 0) {
  console.error(`tag ${REV} not found. Restore the backup copy instead (see docs/ROLLBACK.md §4).`);
  process.exit(1);
}

console.log(`rollback plan (${dryRun ? 'DRY RUN' : 'EXECUTE'})`);
console.log(`  repo : ${repo.stdout.trim()}`);
console.log(`  rev  : ${REV} (${rev.stdout.trim().slice(0, 12)})`);
console.log('\nrestore from tag:');
for (const file of MODIFIED) console.log(`  git restore --source=${REV} -- ${file}`);
console.log('\ndelete added files:');
for (const file of ADDED) console.log(`  rm ${file}`);

if (dryRun) {
  console.log('\nNothing was changed. Re-run with --yes to execute. See docs/ROLLBACK.md.');
  process.exit(0);
}

let failures = 0;
for (const file of MODIFIED) {
  const result = run(['restore', `--source=${REV}`, '--', file]);
  if (result.status !== 0) { failures += 1; console.error(`FAILED restore ${file}`); }
}
for (const file of ADDED) {
  const abs = path.join(root, file);
  try {
    fs.rmSync(abs, { force: true });
    console.log(`removed ${file}`);
  } catch (err) {
    failures += 1;
    console.error(`FAILED remove ${file}: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} operation(s) failed; see docs/ROLLBACK.md §4 (backup copy).`);
  process.exit(1);
}
console.log('\nrestored. Verify with:');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run dev   # static instrument: no wheel rotation, tilted read-head window at 40°');
