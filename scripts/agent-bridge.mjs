/**
 * Zero-dependency real-agent event bridge for the KunlunMeta Visual Engine.
 *
 * Visual pages connect with `?feed=ws://127.0.0.1:8765` and receive every tool
 * call as a JSON event `{id, type, detail, at}` — the exact same ToolEvent shape
 * the built-in simulator and the deterministic replays use, so all visual modes
 * work unchanged with a real coding agent.
 *
 * Event sources (any combination):
 *   --tail <file.jsonl>   follow a JSONL trace (Claude Code / Codex hooks, bee logs…)
 *   HTTP POST /event      {"type":"Edit","detail":"src/app.ts · 12-18"}
 *   --demo                replay public/replay/agent-session.json on a loop
 *
 * Read-only protocol notes: this server is a development tool. It listens on
 * loopback by default and speaks plain WebSocket (no auth); do not expose it.
 *
 * usage:
 *   node scripts/agent-bridge.mjs --port=8765 --demo
 *   node scripts/agent-bridge.mjs --tail=C:\path\to\trace.jsonl
 *   curl -X POST localhost:8765/event -d "{\"type\":\"Bash\",\"detail\":\"npm test\"}"
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const PORT = Number(argv.port || 8765);
const HOST = argv.host || '127.0.0.1';
const TAIL = argv.tail ? path.resolve(argv.tail) : null;
const DEMO = argv.demo === 'true' || argv.demo === true;
const REPLAY = path.resolve(argv.replay || path.join(import.meta.dirname, '..', 'public', 'replay', 'agent-session.json'));

const TOOL_ALIASES = {
  read: 'Read', view: 'Read', cat: 'Read', open: 'Read', notebookread: 'Read', readfile: 'Read',
  edit: 'Edit', multiedit: 'Edit', patch: 'Edit', applypatch: 'Edit', noteboothedit: 'Edit', replace: 'Edit',
  write: 'Write', create: 'Write', writefile: 'Write', notebootwrite: 'Write',
  bash: 'Bash', shell: 'Bash', run: 'Bash', execute: 'Bash', terminal: 'Bash', cmd: 'Bash',
  grep: 'Search', glob: 'Search', search: 'Search', find: 'Search', ripgrep: 'Search', rg: 'Search', ls: 'Search',
};

function normalizeTool(raw) {
  const key = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
  return TOOL_ALIASES[key] || null;
}

function detailOf(input) {
  if (typeof input === 'string') return input.slice(0, 120);
  if (!input || typeof input !== 'object') return '';
  const candidates = [input.file_path, input.path, input.notebook_path, input.pattern, input.command, input.query, input.url];
  const v = candidates.find((x) => typeof x === 'string' && x.length);
  if (v) {
    const extra = input.offset ?? input.limit ?? input.line_number;
    return extra ? `${v} · ${extra}` : v;
  }
  return JSON.stringify(input).slice(0, 100);
}

let seq = 0;
const clients = new Set();
const recent = [];
const stats = { received: 0, broadcast: 0, clients: 0, startedAt: new Date().toISOString(), source: TAIL ? `tail:${TAIL}` : DEMO ? 'demo' : 'http' };

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

function broadcast(event) {
  stats.broadcast += 1;
  const data = frame(JSON.stringify(event));
  for (const socket of clients) {
    try { socket.write(data); } catch { clients.delete(socket); }
  }
}

function emit(rawType, detail, extra = {}) {
  const type = normalizeTool(rawType);
  if (!type) return null;
  seq += 1;
  const event = { id: extra.id ?? seq, type, detail: String(detail || type).slice(0, 160), at: Date.now(), raw: extra.raw ?? undefined };
  recent.unshift(event);
  if (recent.length > 40) recent.pop();
  stats.received += 1;
  broadcast(event);
  console.log(`[event] ${String(event.id).padStart(4, '0')} ${type.padEnd(6)} ${event.detail}`);
  return event;
}

/* --------------------------------------------------------------- http + ws */

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  if (req.url === '/health') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...stats, clients: clients.size, seq, recent: recent.slice(0, 6) }));
    return;
  }
  if (req.url === '/events' && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const timer = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => clearInterval(timer));
    return;
  }
  if (req.url === '/event' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const type = data.type ?? data.tool ?? data.tool_name;
        const detail = data.detail ?? detailOf(data.input ?? data.tool_input ?? data);
        const ev = emit(type, detail, { id: data.id, raw: data });
        res.writeHead(ev ? 202 : 422, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ev ?? { error: `unknown tool type: ${type}` }));
      } catch (e) {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  res.writeHead(404, cors).end('KunlunMeta agent bridge: /health /events /event  (connect pages with ?feed=ws://host:port)');
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
  console.log(`[ws] page connected (${clients.size} client(s))`);
  socket.on('data', (buf) => {
    // tolerate ping/close; ignore client text frames
    if (buf[0] === 0x88) { clients.delete(socket); socket.end(); }
    else if (buf[0] === 0x89) { const pong = Buffer.from([0x8a, buf[1] & 0x7f]); socket.write(pong); }
  });
  socket.on('close', () => { clients.delete(socket); console.log(`[ws] page disconnected (${clients.size})`); });
  socket.on('error', () => clients.delete(socket));
});

/* ------------------------------------------------------------------ sources */

function startTail() {
  let offset = 0;
  try { offset = fs.statSync(TAIL).size; } catch { offset = 0; }
  console.log(`[tail] following ${TAIL} from byte ${offset}`);
  setInterval(() => {
    let size = 0;
    try { size = fs.statSync(TAIL).size; } catch { return; }
    if (size <= offset) { if (size < offset) offset = size; return; }
    const fd = fs.openSync(TAIL, 'r');
    const length = size - offset;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, offset);
    fs.closeSync(fd);
    offset = size;
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        const type = j.type ?? j.tool ?? j.tool_name ?? j.last_tool_name;
        const detail = j.detail ?? detailOf(j.tool_input ?? j.input ?? j);
        emit(type, detail, { id: j.id, raw: j });
      } catch { /* partial line or non-JSON */ }
    }
  }, 300);
}

async function startDemo() {
  const data = JSON.parse(fs.readFileSync(REPLAY, 'utf8'));
  console.log(`[demo] replaying ${data.events.length} canonical events every 8s (${REPLAY})`);
  for (let cycle = 0; cycle < 1e9; cycle++) {
    for (const e of data.events) {
      await new Promise((r) => setTimeout(r, e.at * 0.55 + 250));
      emit(e.type, e.detail);
    }
    await new Promise((r) => setTimeout(r, 2600));
  }
}

server.listen(PORT, HOST, () => {
  console.log(`KunlunMeta agent bridge listening on ws://${HOST}:${PORT}`);
  console.log(`open the demo with: http://127.0.0.1:5173/?mode=loom&feed=ws://${HOST}:${PORT}`);
  if (TAIL) startTail();
  if (DEMO) void startDemo();
});
