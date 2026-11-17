/**
 * ODDSEMBLY bridge — the single data source for the workbench UI.
 *
 *   browser (kunlun-shell)  --/api/*-->  this server (:8788)  --HTTP Basic+SSE-->  OpenCode (:19474)
 *
 * Routes (contract §2):
 *   GET  /api/health
 *   GET  /api/workbench
 *   GET  /api/events                 SSE, one full WorkbenchSnapshot per frame
 *   POST /api/prompt                 {text, sessionID?}
 *   POST /api/interrupt              {sessionID?} -> {interrupted}
 *   POST /api/session/select         {sessionID}
 *   POST /api/session/create         {title?}
 *   POST /api/permission/{id}/respond {decision:'once'|'always'|'reject'}
 *   GET  /api/gameview/events        SSE, {id,type,detail,at} (future Loom Game View)
 *
 * Hard rules: credentials never leave this process; no `opencode.db` access;
 * no fabricated numbers; browser SSE is coalesced to <= 10 Hz.
 */

import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

import { loadConfig, OpenCodeClient } from './opencode.mjs';
import { WorkbenchStore, bridgeError } from './store.mjs';
import * as M from './metrics.mjs';

const PORT = Number.parseInt(process.env.BRIDGE_PORT || '8788', 10);
const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PROJECT_DIR = path.resolve(process.env.BRIDGE_PROJECT_DIR || process.cwd());

/** Browser SSE fan-out cadence: 100 ms == 10 Hz hard ceiling. */
const BROADCAST_INTERVAL_MS = 100;
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_BODY_BYTES = 1_000_000;

const config = loadConfig();
const client = new OpenCodeClient(config, { timeoutMs: 8_000 });
const store = new WorkbenchStore({
  client,
  projectDir: PROJECT_DIR,
  log: (message) => console.log(`[bridge] ${message}`),
});

/** @type {Set<import('node:http').ServerResponse>} */
const snapshotClients = new Set();
/** @type {Set<import('node:http').ServerResponse>} */
const gameviewClients = new Set();

// ---------------------------------------------------------------------------
// OpenCode SSE wiring
// ---------------------------------------------------------------------------

client.startStream({
  onEvent: (event) => store.applyEvent(event),
  onState: (state, error) => {
    store.setStreamState(state);
    if (state === 'connected') {
      // Reconnect (or first connect): rebuild state from the REST facts.
      store.resync('sse-connected');
    } else if (state === 'reconnecting' && error) {
      // Keep health honest; the store's resync loop retries.
      if (error.kind === 'unauthorized') {
        store.health.opencode = 'unauthorized';
        store.health.error = 'OpenCode rejected the bridge credentials';
      }
    }
  },
});

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...CORS_HEADERS,
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req) {
  let size = 0;
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw bridgeError('request body too large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be a JSON object');
    }
    return parsed;
  } catch {
    throw bridgeError('invalid JSON body', 400);
  }
}

function openSse(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    ...CORS_HEADERS,
  });
  // Contract: browser reconnects after 1 s.
  res.write('retry: 1000\n\n');
  res.flushHeaders?.();
  req.on('close', () => {
    res.__sseClosed = true;
  });
}

function writeSse(res, data) {
  if (!res || res.writableEnded || res.__sseClosed) return;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    res.__sseClosed = true;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleGetApiHealth(res) {
  sendJson(res, 200, store.getHealthView());
}

async function handleGetWorkbench(res) {
  sendJson(res, 200, store.snapshot());
}

function handleGetEvents(req, res) {
  openSse(req, res);
  snapshotClients.add(res);
  writeSse(res, store.snapshot());
  req.on('close', () => snapshotClients.delete(res));
}

function handleGetGameviewEvents(req, res) {
  openSse(req, res);
  gameviewClients.add(res);
  req.on('close', () => gameviewClients.delete(res));
}

async function handlePrompt(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const files = normalizeFiles(body.files);
  const result = await store.sendPrompt(body.text, sessionID, files);
  sendJson(res, 200, { ok: true, ...result });
}

/**
 * Validate `files` before it reaches OpenCode: at most 10 attachments, each an
 * object with a non-empty `uri`. Anything else is dropped rather than guessed.
 */
function normalizeFiles(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const files = raw
    .slice(0, 10)
    .filter((file) => file && typeof file === 'object' && typeof file.uri === 'string' && file.uri.trim())
    .map((file) => {
      const next = { uri: file.uri.trim().slice(0, 2_048) };
      if (typeof file.name === 'string' && file.name.trim()) next.name = file.name.trim().slice(0, 256);
      if (typeof file.description === 'string' && file.description.trim()) {
        next.description = file.description.trim().slice(0, 256);
      }
      return next;
    });
  return files.length > 0 ? files : null;
}

/** GET /api/fs/list?path=<relative> — one directory of the active workspace. */
async function handleFsList(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.searchParams.get('path') || '.';
  const result = await store.listFiles(path);
  sendJson(res, 200, { ok: true, ...result });
}

async function handleInterrupt(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const interrupted = await store.interrupt(sessionID);
  sendJson(res, 200, { interrupted });
}

async function handleSessionSelect(req, res) {
  const body = await readJsonBody(req);
  if (typeof body.sessionID !== 'string' || !body.sessionID) {
    throw bridgeError('sessionID is required', 400);
  }
  const activeSessionId = await store.selectSession(body.sessionID);
  sendJson(res, 200, { ok: true, activeSessionId });
}

async function handleSessionCreate(req, res) {
  const body = await readJsonBody(req);
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
  const sessionID = await store.createSession(title, body.model);
  sendJson(res, 200, { ok: true, sessionID, activeSessionId: sessionID, directory: PROJECT_DIR });
}

async function handlePermissionRespond(req, res, permissionID) {
  const body = await readJsonBody(req);
  const decision = body.decision;
  const message = typeof body.message === 'string' ? body.message : null;
  const result = await store.respondPermission(permissionID, decision, message);
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/fs/find?query=<text>&limit=<n> — workspace-wide file search. */
async function handleFsFind(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const query = url.searchParams.get('query') || '';
  const limit = Number.parseInt(url.searchParams.get('limit') || '8', 10);
  const result = await store.findFiles(query, limit);
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/projects — the curated project list + the active directory. */
async function handleProjects(req, res) {
  const result = await store.projectsView();
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/projects {path} — add an absolute directory and switch to it. */
async function handleProjectAdd(req, res) {
  const body = await readJsonBody(req);
  const result = await store.addProject(body.path);
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/project/select {path} — switch to a project (session in that dir). */
async function handleProjectSelect(req, res) {
  const body = await readJsonBody(req);
  const result = await store.selectProject(body.path);
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/projects/remove {path} — forget a project (not the directory). */
async function handleProjectRemove(req, res) {
  const body = await readJsonBody(req);
  const result = await store.removeProject(body.path);
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/file?path= — one file for the in-app preview. */
async function handleFile(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.searchParams.get('path') ?? '';
  const result = await store.readFile(path);
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/models — the real OpenCode catalogue, grouped by provider. */
async function handleModels(req, res) {
  const result = await store.modelsView();
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/agents — selectable primary agents + the session's current agent. */
async function handleAgents(req, res) {
  const result = await store.agentsView();
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/session/agent {sessionID?, agent} — switch the session's agent. */
async function handleSessionAgent(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const result = await store.selectAgent(sessionID, body.agent);
  sendJson(res, 200, { ok: true, ...result });
}

/** GET /api/commands — commands advertised by the agent for the `/` menu. */
async function handleCommands(req, res) {
  const result = await store.commandsView();
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/command {sessionID?, name, text?, files?} — run an agent command. */
async function handleCommand(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const files = normalizeFiles(body.files);
  const result = await store.sendCommand(body.name, body.text, sessionID, files);
  sendJson(res, 200, { ok: true, ...result });
}

/** POST /api/session/model {sessionID?, model:{providerID,id}} — switch model. */
async function handleSessionModel(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const result = await store.selectModel(sessionID, body.model);
  sendJson(res, 200, { ok: true, ...result });
}

/** PATCH /api/session {sessionID?, title} — rename a session. */
async function handleSessionRename(req, res) {
  const body = await readJsonBody(req);
  const sessionID = typeof body.sessionID === 'string' ? body.sessionID : undefined;
  const result = await store.renameSession(sessionID, body.title);
  sendJson(res, 200, { ok: true, ...result });
}

/** DELETE /api/session/{id} — delete a session (and its child sessions). */
async function handleSessionDelete(req, res, sessionID) {
  const result = await store.deleteSession(decodeURIComponent(sessionID));
  sendJson(res, 200, { ok: true, ...result });
}

const routes = [
  ['GET', /^\/api\/health$/, (req, res) => handleGetApiHealth(res)],
  ['GET', /^\/api\/workbench$/, (req, res) => handleGetWorkbench(res)],
  ['GET', /^\/api\/fs\/list$/, handleFsList],
  ['GET', /^\/api\/fs\/find$/, handleFsFind],
  ['GET', /^\/api\/models$/, handleModels],
  ['GET', /^\/api\/agents$/, handleAgents],
  ['GET', /^\/api\/file$/, handleFile],
  ['GET', /^\/api\/projects$/, handleProjects],
  ['POST', /^\/api\/projects$/, handleProjectAdd],
  ['POST', /^\/api\/project\/select$/, handleProjectSelect],
  ['POST', /^\/api\/projects\/remove$/, handleProjectRemove],
  ['GET', /^\/api\/commands$/, handleCommands],
  ['GET', /^\/api\/events$/, handleGetEvents],
  ['GET', /^\/api\/gameview\/events$/, handleGetGameviewEvents],
  ['POST', /^\/api\/prompt$/, handlePrompt],
  ['POST', /^\/api\/interrupt$/, handleInterrupt],
  ['POST', /^\/api\/session\/select$/, handleSessionSelect],
  ['POST', /^\/api\/session\/create$/, handleSessionCreate],
  ['POST', /^\/api\/session\/model$/, handleSessionModel],
  ['POST', /^\/api\/session\/agent$/, handleSessionAgent],
  ['POST', /^\/api\/command$/, handleCommand],
  ['PATCH', /^\/api\/session$/, handleSessionRename],
  ['DELETE', /^\/api\/session\/([^/]+)$/, (req, res, match) => handleSessionDelete(req, res, match[1])],
  ['POST', /^\/api\/permission\/([^/]+)\/respond$/, (req, res, match) => handlePermissionRespond(req, res, decodeURIComponent(match[1]))],
];

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (!match) continue;
      await handler(req, res, match);
      return;
    }
    sendError(res, 404, 'not found');
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = status >= 500 ? error?.message || 'internal error' : error?.message || 'bad request';
    // Never echo headers/credentials: messages come from our own code only.
    console.warn(`[bridge] ${method} ${pathname} -> ${status}: ${message}`);
    if (!res.headersSent) sendError(res, status, message);
    else res.end();
  }
});

// ---------------------------------------------------------------------------
// Browser fan-out: coalesce to <= 10 Hz, heartbeat, Game View stream
// ---------------------------------------------------------------------------

const broadcastTimer = setInterval(() => {
  if (!store.dirty && store.gameview.length === 0) return;

  let payload = null;
  if (snapshotClients.size > 0) {
    payload = store.snapshot();
    store.dirty = false;
  } else if (store.gameview.length > 0) {
    store.dirty = false;
  }

  if (payload) {
    for (const res of snapshotClients) writeSse(res, payload);
  }

  const gameviewEvents = store.takeGameview();
  if (gameviewEvents.length && gameviewClients.size) {
    for (const event of gameviewEvents) {
      for (const res of gameviewClients) writeSse(res, event);
    }
  }
}, BROADCAST_INTERVAL_MS);
broadcastTimer.unref?.();

const heartbeatTimer = setInterval(() => {
  for (const res of snapshotClients) writeSseComment(res);
  for (const res of gameviewClients) writeSseComment(res);
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();

function writeSseComment(res) {
  if (!res || res.writableEnded || res.__sseClosed) return;
  try {
    res.write(': heartbeat\n\n');
  } catch {
    res.__sseClosed = true;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`);
  console.log(
    `[bridge] OpenCode ${config.url} (credentials: ${config.hasPassword ? 'configured' : 'MISSING'})`,
  );
  console.log(`[bridge] project directory ${PROJECT_DIR}`);
  console.log(`[bridge] metrics unavailable: ${M.unavailableKeys({ contextLimit: null, cost: null }).join(', ')}`);

  store.start();
  // First full re-sync after the socket is up so /api/health answers immediately.
  store.resync('boot');
});

async function shutdown(signal) {
  console.log(`[bridge] ${signal} received, shutting down`);
  clearInterval(broadcastTimer);
  clearInterval(heartbeatTimer);
  for (const res of snapshotClients) res.end();
  for (const res of gameviewClients) res.end();
  snapshotClients.clear();
  gameviewClients.clear();
  await store.dispose();
  await client.stopStream();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server, store, client };
