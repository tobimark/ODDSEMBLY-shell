#!/usr/bin/env node
/**
 * ODDSEMBLY · OpenCode → Loom live bridge
 * =======================================
 * Subscribes to a real OpenCode server's event stream (`GET /api/event`, SSE) and
 * republishes every tool call to the Loom page over the WebSocket protocol the
 * page already speaks. OpenCode is never modified, its database is never read,
 * and its password stays in this process — it is never sent to the browser.
 *
 * What it guarantees
 *   - one logical record per OpenCode tool call id (start → success/failure),
 *   - a truthful ledger: every call is counted even when the page is closed,
 *   - explicit handling of tool names Loom cannot classify (never disguised),
 *   - reconnect with backoff, gap reporting, and bounded resync of in-flight
 *     calls from the session message log,
 *   - no synthetic events unless `--allow-inject` is passed.
 *
 * usage
 *   node scripts/opencode-loom-bridge.mjs
 *   node scripts/opencode-loom-bridge.mjs --port=8787 --server=http://127.0.0.1:19474
 *   OPENCODE_PASSWORD=<pw> node scripts/opencode-loom-bridge.mjs --server=...
 *
 * page
 *   http://127.0.0.1:5173/?mode=loom&live=ws://127.0.0.1:8787
 *
 * The OpenCode side is read-only: GET /api/event, GET /api/session/{id}/message.
 * Loopback only; plain WebSocket, no auth — do not expose it.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRIDGE_VERSION = 1;
const MAX_CALLS_KEPT = 600;

/* ------------------------------------------------------------------ arguments */

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);

const HOST = argv.host || '127.0.0.1';
const PORT = Number(argv.port || 8787);
const ALLOW_INJECT = argv['allow-inject'] === 'true';
const ADMIN = argv.admin === 'true';
const LOG_RAW = argv['log-raw'] === 'true';

/* --------------------------------------------------------- OpenCode discovery */

function serviceFile() {
  return path.join(os.homedir(), '.config', 'opencode', 'service.json');
}

/** Endpoint + password resolution: flags win, then the OpenCode service file. */
function resolveEndpoint() {
  let service = {};
  try {
    service = JSON.parse(fs.readFileSync(serviceFile(), 'utf8'));
  } catch { /* no managed service */ }
  const server = argv.server || (service.port ? `http://127.0.0.1:${service.port}` : 'http://127.0.0.1:4096');
  const password = argv.password || process.env.OPENCODE_PASSWORD || service.password || '';
  return { server: server.replace(/\/+$/, ''), password, discovered: !!service.port };
}

let endpoint = resolveEndpoint();

/* ------------------------------------------------------------- tool taxonomy */

/**
 * OpenCode (v2.2.x) built-in tool names → the five Loom worlds.
 * Verified live: read, glob, shell. Others are the documented built-in set.
 *
 * Anything missing here is deliberately *unmapped*: the bridge records it with
 * its raw name and id and tells the page, rather than pretending it was a file
 * read or a shell command. `task` / `todowrite` are orchestration, not a Loom
 * material, so they stay unmapped by design.
 */
const TOOL_CLASS = {
  // Read — file/dir content in
  read: 'Read', view: 'Read', open: 'Read', cat: 'Read', readfile: 'Read', notebookread: 'Read',
  // Edit — existing content changed
  edit: 'Edit', multiedit: 'Edit', patch: 'Edit', applypatch: 'Edit', replace: 'Edit', notebookedit: 'Edit',
  // Write — new content
  write: 'Write', create: 'Write', writefile: 'Write', notebookwrite: 'Write',
  // Bash — a process runs
  shell: 'Bash', bash: 'Bash', run: 'Bash', execute: 'Bash', terminal: 'Bash', cmd: 'Bash', pwsh: 'Bash', powershell: 'Bash',
  // Search — lookup / retrieval
  grep: 'Search', glob: 'Search', search: 'Search', find: 'Search', ripgrep: 'Search', rg: 'Search', ls: 'Search', list: 'Search',
  websearch: 'Search', webfetch: 'Search',
};

function normalizeName(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
}

function classify(raw) {
  return TOOL_CLASS[normalizeName(raw)] ?? null;
}

/** Short, display-only description; the readout never shows more than this. */
function describeInput(input) {
  if (typeof input === 'string') return input.slice(0, 120);
  if (!input || typeof input !== 'object') return '';
  const pick = ['command', 'filePath', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt'];
  for (const k of pick) {
    const v = input[k];
    if (typeof v === 'string' && v.length) {
      const extra = input.offset ?? input.limit ?? input.line ?? input.start;
      return (extra != null && k !== 'command' ? `${v} · ${extra}` : v).slice(0, 120);
    }
  }
  try { return JSON.stringify(input).slice(0, 100); } catch { return ''; }
}

/* ------------------------------------------------------------------- runtime */

const stats = {
  startedAt: new Date().toISOString(),
  bridgeVersion: BRIDGE_VERSION,
  source: endpoint.server,
  connected: false,
  connects: 0,
  reconnects: 0,
  gaps: 0,
  received: 0,
  duplicates: 0,
  recovered: 0,
  unmapped: 0,
  clients: 0,
  lastEventAt: null,
};

/** callId → { callId, tool, cls, detail, status, sessionID, at, startedAt, endedAt, recovered, error } */
const calls = new Map();
/** newest first, bounded */
const order = [];
const byType = { Read: 0, Edit: 0, Write: 0, Bash: 0, Search: 0 };
const unmappedNames = new Map();

function remember(call) {
  calls.set(call.callId, call);
  order.push(call.callId);
  while (order.length > MAX_CALLS_KEPT) {
    const drop = order.shift();
    if (drop && calls.has(drop)) calls.delete(drop);
  }
}

function counts() {
  let succeeded = 0, failed = 0, aborted = 0, running = 0, started = 0;
  for (const c of calls.values()) {
    started += 1;
    if (c.status === 'success') succeeded += 1;
    else if (c.status === 'failed') failed += 1;
    else if (c.status === 'aborted') aborted += 1;
    else running += 1;
  }
  return { started, succeeded, failed, aborted, running, byType: { ...byType } };
}

/* ------------------------------------------------------------------ ws + http */

const clients = new Set();

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

function broadcast(msg) {
  const data = frame(JSON.stringify({ v: BRIDGE_VERSION, ...msg }));
  for (const socket of clients) {
    try { socket.write(data); } catch { clients.delete(socket); }
  }
}

function helloMessage() {
  return {
    kind: 'hello',
    mode: 'live',
    source: { server: endpoint.server, session: activeSessionID, bridgeVersion: BRIDGE_VERSION },
    counters: { ...counts(), unmapped: stats.unmapped, received: stats.received },
  };
}

let activeSessionID = null;

/* ---------------------------------------------------------------- SSE client */

let sseAbort = null;
let backoffMs = 400;
let stopped = false;

function apiHeaders() {
  const h = { Accept: 'application/json' };
  if (endpoint.password) {
    h.Authorization = 'Basic ' + Buffer.from(`opencode:${endpoint.password}`).toString('base64');
  }
  return h;
}

async function api(pathname) {
  const res = await fetch(`${endpoint.server}${pathname}`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`${pathname} → ${res.status}`);
  return res.json();
}

/** Parse one SSE stream; resolves when the stream ends. */
async function consumeSse() {
  sseAbort = new AbortController();
  const res = await fetch(`${endpoint.server}/api/event`, {
    headers: { ...apiHeaders(), Accept: 'text/event-stream' },
    signal: sseAbort.signal,
  });
  if (!res.ok || !res.body) throw new Error(`event stream → ${res.status}`);

  stats.connected = true;
  stats.connects += 1;
  const wasReconnect = stats.connects > 1;
  if (wasReconnect) stats.reconnects += 1;
  log(`event stream ${wasReconnect ? 're-established' : 'connected'} · ${endpoint.server}`);
  broadcast({ kind: 'link', state: wasReconnect ? 'reconnected' : 'connected', at: Date.now(), server: endpoint.server });
  if (wasReconnect) {
    // Events produced while we were away are unrecoverable from a volatile SSE
    // stream; resync whatever in-flight calls still exist and mark the gap.
    void resync(wasReconnect);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (!line || line.startsWith(':')) continue; // heartbeat / comment
      if (!line.startsWith('data:')) continue;
      const body = line.slice(5).trim();
      if (!body) continue;
      try { handleEvent(JSON.parse(body)); } catch { /* malformed frame */ }
    }
  }
}

async function runSseLoop() {
  while (!stopped) {
    try {
      await consumeSse();
      log('event stream closed by server');
    } catch (err) {
      if (stopped) return;
      log(`event stream error: ${err.message}`);
    }
    stats.connected = false;
    broadcast({ kind: 'link', state: 'reconnecting', at: Date.now(), server: endpoint.server, retryInMs: backoffMs });
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(8000, Math.round(backoffMs * 1.7));
  }
}

/** Bounded recovery: calls that were in flight when the link dropped. */
async function resync(afterReconnect) {
  const inflight = [...calls.values()].filter((c) => c.status === 'running' && c.sessionID);
  const sessions = [...new Set(inflight.map((c) => c.sessionID))].slice(0, 5);
  let recovered = 0;
  if (!sessions.length) {
    broadcast({ kind: 'link', state: 'gap', at: Date.now(), recovered: 0, missed: 'unknown' });
    return;
  }
  for (const sid of sessions) {
    try {
      const page = await api(`/api/session/${sid}/message?order=desc&limit=6`);
      const parts = new Map();
      for (const message of page.data ?? []) {
        for (const part of message.content ?? []) {
          if (part?.type === 'tool' && part.id) parts.set(part.id, part);
        }
      }

      // 1) Calls we never saw start: record them, flagged as recovered.
      for (const [id, part] of parts) {
        if (calls.has(id)) continue;
        const status = part.state?.status === 'completed' ? 'success'
          : part.state?.status === 'error' ? 'failed' : 'running';
        emitCall({
          callId: id, tool: part.name, cls: classify(part.name), detail: describeInput(part.state?.input),
          status, sessionID: sid, at: part.time?.created ?? Date.now(), recovered: true,
        });
        recovered += 1;
        stats.recovered += 1;
      }

      // 2) Calls we thought were still running: settle the ones that finished
      //    while we were disconnected, and say so when nothing can be recovered.
      for (const c of inflight.filter((x) => x.sessionID === sid)) {
        const part = parts.get(c.callId);
        const state = part?.state?.status;
        if (state === 'completed') {
          finish(c.callId, 'success', Date.now(), null, true);
        } else if (state === 'error') {
          const aborted = part.state?.error?.type === 'aborted';
          finish(c.callId, aborted ? 'aborted' : 'failed', Date.now(), part.state?.error?.message ?? 'error', true);
        } else if (!part) {
          // The server no longer knows this call: report the gap, never invent success.
          c.status = 'aborted';
          c.error = 'unrecoverable after reconnect';
          c.endedAt = Date.now();
          broadcast({ kind: 'call', phase: 'status', callId: c.callId, status: 'aborted', at: Date.now(), reason: 'unrecoverable' });
        }
        // state 'running' / 'streaming' → it is genuinely still running; the
        // normal event stream will settle it.
      }
    } catch { /* one session failing must not abort recovery */ }
  }
  if (afterReconnect) stats.gaps += 1;
  broadcast({ kind: 'link', state: 'gap', at: Date.now(), recovered, missed: recovered ? 'partial' : 'unknown' });
  log(`resync after reconnect: recovered ${recovered} call(s) from ${sessions.length} session(s)`);
}

/* ----------------------------------------------------------- event handling */

function handleEvent(ev) {
  if (!ev || typeof ev.type !== 'string') return;
  const data = ev.data ?? {};
  const at = typeof ev.created === 'number' ? ev.created : Date.now();
  stats.received += 1;
  stats.lastEventAt = at;
  if (data.sessionID) activeSessionID = data.sessionID;

  switch (ev.type) {
    case 'session.tool.input.started': {
      // First sighting of a call. The page may start weaving here (the call
      // has not succeeded yet — status stays "running" until we know).
      if (!data.id) return;
      if (calls.has(data.id)) { stats.duplicates += 1; return; }
      emitCall({
        callId: data.id, tool: data.name, cls: classify(data.name), detail: '',
        status: 'running', sessionID: data.sessionID, at, recovered: false,
      });
      return;
    }
    case 'session.tool.input.ended': {
      const call = calls.get(data.id);
      if (!call) return;
      const text = typeof data.text === 'string' ? data.text : '';
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* streamed args may be partial */ }
      if (parsed) call.input = parsed;
      const detail = describeInput(parsed);
      if (detail && detail !== call.detail) {
        call.detail = detail;
        broadcast({ kind: 'call', phase: 'detail', callId: call.callId, detail, at });
      }
      return;
    }
    case 'session.tool.called': {
      const known = calls.get(data.id);
      if (!known) {
        if (!data.id) return;
        emitCall({
          callId: data.id, tool: data.name ?? 'unknown', cls: classify(data.name), detail: describeInput(data.input),
          status: 'running', sessionID: data.sessionID, at, recovered: false,
        });
      } else if (data.input) {
        known.input = data.input;
        const detail = describeInput(data.input);
        if (detail && detail !== known.detail) {
          known.detail = detail;
          broadcast({ kind: 'call', phase: 'detail', callId: known.callId, detail, at });
        }
      }
      return;
    }
    case 'session.tool.success': {
      finish(data.id, 'success', at, null);
      return;
    }
    case 'session.tool.failed': {
      const kind = data.error?.type;
      finish(data.id, kind === 'aborted' ? 'aborted' : 'failed', at, data.error?.message ?? kind ?? 'tool failed');
      return;
    }
    case 'session.execution.interrupted': {
      // Safety net: a tool whose failure frame we never saw cannot stay "running".
      for (const c of calls.values()) {
        if (c.status === 'running' && (!data.sessionID || c.sessionID === data.sessionID)) {
          finish(c.callId, 'aborted', at, `execution interrupted (${data.reason ?? 'unknown'})`);
        }
      }
      return;
    }
    case 'session.execution.failed': {
      for (const c of calls.values()) {
        if (c.status === 'running' && c.sessionID === data.sessionID) {
          finish(c.callId, 'failed', at, data.error?.message ?? 'turn failed');
        }
      }
      return;
    }
    default:
      return;
  }
}

function finish(callId, status, at, error, recovered = false) {
  if (!callId) return;
  const call = calls.get(callId);
  if (!call) return;
  if (call.status === status) return; // idempotent (duplicate frames are real)
  call.status = status;
  call.endedAt = at;
  if (error) call.error = error;
  broadcast({
    kind: 'call', phase: 'status', callId, status, at,
    ...(error ? { error } : {}),
    ...(recovered ? { recovered: true } : {}),
    ...(call.cls ? {} : { unmapped: call.tool }),
  });
  log(`  ${status.toUpperCase().padEnd(8)} ${(call.cls ?? `UNMAPPED:${call.tool}`).padEnd(8)} ${call.callId}${recovered ? ' (recovered)' : ''}${error ? ' · ' + error : ''}`);
}

function emitCall({ callId, tool, cls, detail, status, sessionID, at, recovered }) {
  if (!callId) return;
  const call = {
    callId,
    tool: String(tool ?? 'unknown'),
    cls,
    detail: detail || '',
    status,
    sessionID: sessionID ?? null,
    at,
    startedAt: at,
    endedAt: null,
    recovered: !!recovered,
    error: null,
  };
  remember(call);
  if (cls) byType[cls] += 1;
  else { stats.unmapped += 1; unmappedNames.set(call.tool, (unmappedNames.get(call.tool) ?? 0) + 1); }

  broadcast({
    kind: 'call',
    phase: recovered ? 'recovered' : 'start',
    callId,
    tool: call.tool,
    cls,
    detail: call.detail,
    status,
    sessionID: call.sessionID,
    at,
    recovered: call.recovered,
  });
  log(`${recovered ? 'RECOVER' : 'START  '}  ${(cls ?? `UNMAPPED:${call.tool}`).padEnd(8)} ${callId}${call.detail ? ' · ' + call.detail : ''}`);
}

/* --------------------------------------------------------------------- http */

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
  const url = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }

  if (url === '/health') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      bridge: BRIDGE_VERSION,
      startedAt: stats.startedAt,
      source: endpoint.server,
      discovered: endpoint.discovered,
      connected: stats.connected,
      sessionID: activeSessionID,
      clients: clients.size,
      counters: { ...counts(), unmapped: stats.unmapped, received: stats.received, reconnects: stats.reconnects, gaps: stats.gaps, recovered: stats.recovered, duplicates: stats.duplicates },
      unmappedTools: Object.fromEntries(unmappedNames),
      lastEventAt: stats.lastEventAt,
      allowInject: ALLOW_INJECT,
    }, null, 2));
    return;
  }

  if (url === '/ledger') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      counters: { ...counts(), unmapped: stats.unmapped, received: stats.received },
      unmappedTools: Object.fromEntries(unmappedNames),
      calls: order.map((id) => calls.get(id)).filter(Boolean),
    }, null, 2));
    return;
  }

  if (url === '/stream') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const timer = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => clearInterval(timer));
    return;
  }

  // Synthetic input is a test-only escape hatch. Off by default so a live
  // session can never be polluted by a stray POST or a demo keyboard press.
  if (url === '/event' && req.method === 'POST') {
    if (!ALLOW_INJECT) {
      res.writeHead(403, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'synthetic events are disabled; start the bridge with --allow-inject to test' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const callId = data.callId ?? `synthetic_${crypto.randomUUID()}`;
        emitCall({
          callId, tool: data.tool ?? data.type ?? 'synthetic', cls: classify(data.tool ?? data.type),
          detail: data.detail ?? '', status: 'running', sessionID: 'synthetic', at: Date.now(), recovered: false,
        });
        res.writeHead(202, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, callId }));
      } catch (err) {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  if (url === '/admin/drop' && ADMIN) {
    // Chaos hook for the reconnect scenario: sever the upstream SSE only.
    try { sseAbort?.abort(); } catch { /* already closed */ }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, dropped: 'sse' }));
    return;
  }

  res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
  res.end('ODDSEMBLY OpenCode bridge: /health /ledger /stream  (pages connect with ?live=ws://host:port)');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  );
  clients.add(socket);
  stats.clients = clients.size;
  log(`page connected (${clients.size} client(s))`);
  try { socket.write(frame(JSON.stringify(helloMessage()))); } catch { /* peer vanished */ }
  socket.on('data', (buf) => {
    if (buf[0] === 0x88) { clients.delete(socket); socket.end(); }
    else if (buf[0] === 0x89) { try { socket.write(Buffer.from([0x8a, buf[1] & 0x7f])); } catch { /* noop */ } }
  });
  socket.on('close', () => { clients.delete(socket); stats.clients = clients.size; log(`page disconnected (${clients.size})`); });
  socket.on('error', () => { clients.delete(socket); stats.clients = clients.size; });
});

/* ------------------------------------------------------------------- output */

const started = Date.now();
function log(msg) {
  const t = ((Date.now() - started) / 1000).toFixed(1).padStart(6);
  console.log(`[${t}s] ${msg}`);
}

/* --------------------------------------------------------------------- boot */

server.listen(PORT, HOST, () => {
  log(`ODDSEMBLY bridge v${BRIDGE_VERSION} on ws://${HOST}:${PORT}`);
  log(`OpenCode source: ${endpoint.server}${endpoint.discovered ? ' (from service.json)' : ''}`);
  log(`page: http://127.0.0.1:5173/?mode=loom&live=ws://${HOST}:${PORT}`);
  if (!endpoint.password) log('warning: no OpenCode password found (use --password or OPENCODE_PASSWORD)');
  if (ALLOW_INJECT) log('synthetic injection ENABLED (test mode)');
  void runSseLoop();
});

function shutdown(signal) {
  log(`${signal} → closing`);
  stopped = true;
  try { sseAbort?.abort(); } catch { /* noop */ }
  for (const s of clients) { try { s.end(); } catch { /* noop */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

void LOG_RAW;
