/**
 * Contract for the live adapter layer (`src/live/*`) — no browser, no Pixi.
 *
 *   classify.ts   raw OpenCode tool names → the five Loom classes, and the
 *                 explicit "no faithful class" rule for everything else.
 *   feedClient.ts one logical record per tool-call id, across reconnects:
 *                 a duplicate start is dropped, a repeated status is dropped,
 *                 legacy frames still work, gap messages surface.
 */
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const dataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

const classifyUrl = dataUrl(transpile(read('../src/live/classify.ts')));
const feedSource = read('../src/live/feedClient.ts')
  .replace(/'\.\/classify'/g, JSON.stringify(classifyUrl));
const { LiveFeed } = await import(dataUrl(transpile(feedSource)));
const { classifyTool } = await import(classifyUrl);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 5000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return;
    await sleep(25);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/* ------------------------------------------------------------------ classifier */

assert.equal(classifyTool('read'), 'Read');
assert.equal(classifyTool('shell'), 'Bash');
assert.equal(classifyTool('Grep'), 'Search');
assert.equal(classifyTool('glob'), 'Search');
assert.equal(classifyTool('edit'), 'Edit');
assert.equal(classifyTool('write'), 'Write');
assert.equal(classifyTool('apply_patch'), 'Edit', 'punctuation is normalised');
assert.equal(classifyTool('  Bash  '), 'Bash');
// No faithful Loom class — must stay null rather than be dressed up as another tool.
for (const raw of ['task', 'todowrite', 'todoread', 'skill', 'invalid', 'question', '']) {
  assert.equal(classifyTool(raw), null, `${raw || '<empty>'} must not be classified`);
}

/* --------------------------------------------------------------- ws test server */

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}
function frame(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  return Buffer.concat([header, payload]);
}

/** Minimal WS server; `script(connectionIndex, socket)` drives each client. */
async function wsServer(script) {
  const server = http.createServer((req, res) => res.end('ok'));
  let connection = 0;
  const sockets = new Set();
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
    );
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    void script(connection++, socket);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `ws://127.0.0.1:${port}`,
    close: () => { for (const s of sockets) { try { s.destroy(); } catch { /* noop */ } } server.close(); },
  };
}

/* --------------------------- dedupe across a reconnect (the "no replay" contract) */

{
  const call = (phase, extra = {}) => ({
    v: 1, kind: 'call', phase, callId: 'call_A', tool: 'read', cls: 'Read',
    detail: 'package.json', status: 'running', sessionID: 'ses_1', at: 1000, ...extra,
  });

  const srv = await wsServer(async (conn, socket) => {
    if (conn === 0) {
      socket.write(frame(call('start')));
      await sleep(40);
      socket.write(frame(call('start')));                    // duplicate start
      await sleep(40);
      socket.write(frame(call('status', { status: 'success' })));
      await sleep(40);
      socket.write(frame(call('status', { status: 'success' }))); // repeated status
      await sleep(60);
      socket.destroy();                                      // force reconnect
      return;
    }
    // After reconnect the upstream replays nothing, but be hostile: resend call_A
    // (already processed) plus one genuinely new call.
    socket.write(frame(call('start')));
    socket.write(frame(call('start', { callId: 'call_B', tool: 'shell', cls: 'Bash', status: 'running' })));
    await sleep(50);
    socket.write(frame({ v: 1, kind: 'link', state: 'gap', at: 2000, recovered: 1, missed: 'partial' }));
  });

  const calls = [];
  const links = [];
  const feed = new LiveFeed(srv.url, { onCall: (m) => calls.push(m), onLink: (l) => links.push(l) });
  feed.start();

  await waitFor(() => calls.filter((m) => m.phase === 'start').length === 2, 6000, 'two distinct starts');
  await waitFor(() => links.some((l) => l.state === 'reconnected'), 6000, 'reconnect notice');
  await waitFor(() => links.some((l) => l.state === 'gap'), 6000, 'gap notice');

  assert.equal(calls.filter((m) => m.callId === 'call_A' && m.phase === 'start').length, 1,
    'call_A start replayed after reconnect must be dropped');
  assert.equal(calls.filter((m) => m.phase === 'status' && m.callId === 'call_A').length, 1,
    'repeated status must be dropped');
  assert.equal(calls.filter((m) => m.callId === 'call_B' && m.phase === 'start').length, 1,
    'a genuinely new call after reconnect is delivered');
  assert.equal(calls[0].status, 'running', 'a call is not a success before its status arrives');
  const gap = links.find((l) => l.state === 'gap');
  assert.equal(gap.recovered, 1);
  assert.equal(gap.missed, 'partial');

  feed.stop();
  await sleep(50);
  assert.equal(links.filter((l) => l.state === 'closed').length, 1, 'stop() reports closed and stops retrying');
  srv.close();
  console.log('PASS: live feed dedupes by call id across a reconnect, drops repeated status, keeps new calls, reports gaps.');
}

/* ------------------------------------------------------------------ legacy frames */

{
  const srv = await wsServer(async (_conn, socket) => {
    socket.write(frame({ id: 3, type: 'Bash', detail: 'npm test' }));
    socket.write(frame({ id: 4, type: 'edit', detail: 'src/a.ts' }));
    socket.write(frame({ id: 5, type: 'task', detail: 'subagent' }));
  });
  const calls = [];
  const feed = new LiveFeed(srv.url, { onCall: (m) => calls.push(m), onLink: () => {} });
  feed.start();
  await waitFor(() => calls.length >= 3, 4000, 'legacy frames');
  assert.deepEqual(calls.map((c) => c.cls), ['Bash', 'Edit', null]);
  assert.equal(calls[2].tool, 'task', 'unmapped tools keep their raw name');
  feed.stop();
  srv.close();
  console.log('PASS: legacy {type} frames still classify, and an unmapped tool keeps its raw name.');
}

console.log('PASS: live adapter — classification, call-id dedupe, reconnect, gap, legacy compatibility.');
