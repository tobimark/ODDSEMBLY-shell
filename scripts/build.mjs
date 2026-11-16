import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const temp = path.join(root, '.tmp', 'build');
fs.mkdirSync(temp, { recursive: true });
// Keep esbuild's temporary files in the project; Windows can lock the shared Temp directory.
const env = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };
for (const [bin, args] of [['typescript/bin/tsc', ['-b']], ['vite/bin/vite.js', ['build']]]) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', bin), ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
