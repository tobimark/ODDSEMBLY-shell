/**
 * Browser inspector: collects console messages, page errors, failed requests and
 * lets you evaluate expressions against the live app. Zero deps (CDP).
 *
 *   node tools/demo/inspect.mjs                       # 6 s of diagnostics
 *   node tools/demo/inspect.mjs --wait 10000
 *   node tools/demo/inspect.mjs --eval "document.querySelector('textarea')?'yes':'no'"
 *   node tools/demo/inspect.mjs --eval-file checks.js
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, launch, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = arg('url', process.env.UI_URL || 'http://127.0.0.1:5180/');
const waitMs = Number(arg('wait', '6000'));
const expr = arg('eval', null);
const port = Number(arg('port', String(9500 + Math.floor(Math.random() * 200))));

const b = await launch({ url, port, dpr: 1 });
let code = 0;
try {
  const cdp = await connect(b.page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');

  const lines = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    lines.push(`console.${p.type}: ${text}`);
  });
  cdp.on('Runtime.exceptionThrown', (p) => lines.push(`EXCEPTION: ${p.exceptionDetails?.text} ${p.exceptionDetails?.exception?.description || ''}`));
  cdp.on('Log.entryAdded', (p) => lines.push(`${p.entry.level}: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ''}`));
  cdp.on('Network.loadingFailed', (p) => lines.push(`network FAIL: ${p.type} ${p.errorText} ${p.blockedReason || ''}`));
  cdp.on('Network.responseReceived', (p) => {
    if (p.response.status >= 400) lines.push(`http ${p.response.status}: ${p.response.url}`);
  });

  await sleep(waitMs);

  if (expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) lines.push(`eval EXCEPTION: ${r.exceptionDetails.text}`);
    else console.log('EVAL:', JSON.stringify(r.result?.value, null, 2));
  }

  const problems = lines.filter(
    (l) => /^(console\.(error|warning))|EXCEPTION|^(error|warning):|network FAIL|^http [45]/.test(l),
  );
  console.log(`\n--- ${lines.length} events, ${problems.length} problems ---`);
  for (const l of problems.slice(0, 60)) console.log(l);
  if (problems.length === 0) console.log('(no console errors / failed requests detected)');
  cdp.close();
} catch (err) {
  console.error('inspect failed:', err);
  code = 1;
} finally {
  try {
    execSync(`taskkill /PID ${b.proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* gone */
  }
  process.exit(code);
}
