/**
 * Build wrapper.
 *
 * This machine intermittently fails Vite's build with
 *   [vite:esbuild-transpile] remove C:\...\Temp\esbuild-…: Access is denied
 * because the OS temp directory refuses the delete (AV/file-index lock). Pointing
 * esbuild's temp at a workspace directory fixes it without touching the config.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tmp = path.resolve('.tmp', 'build-temp');
fs.mkdirSync(tmp, { recursive: true });

const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, TEMP: tmp, TMP: tmp },
});

process.exit(result.status ?? 1);
