# ODDSEMBLY bridge (`kunlun-shell/server/`)

The bridge is the **single data source** for the workbench UI. It reads OpenCode v2
facts over HTTP + SSE, normalises them into exactly one `WorkbenchSnapshot`
(`src/data/types.ts`), and forwards user commands. The browser never talks to
OpenCode and never sees credentials.

```
OpenCode managed service (:19474) ──HTTP Basic + SSE──▶ bridge (:8788) ──/api/* same-origin──▶ kunlun-shell
```

Zero npm dependencies, Node 22 ESM, no build step.

## Run

```powershell
# one terminal (from kunlun-shell/)
$env:BRIDGE_PROJECT_DIR = "D:\workspace\gamified-flow\.tmp\demo-project"   # optional
npm run bridge            # == node server/index.mjs  (or: node server/index.mjs)
# another terminal
npm run dev               # Vite :5180 proxies /api -> :8788
```

Startup prints the listening port, the OpenCode URL, whether credentials were found,
and the project directory. The password is **never** printed.

| Env var | Default | Meaning |
|---|---|---|
| `BRIDGE_PORT` | `8788` | HTTP port of the bridge |
| `BRIDGE_HOST` | `127.0.0.1` | bind address |
| `BRIDGE_PROJECT_DIR` | `process.cwd()` | project directory used for `location.directory` on new sessions, boot session selection, and shell/pty/permission scoping |
| `BRIDGE_MODEL` | `opencode/deepseek-v4.1-flash-free` | model given to **new** sessions (`provider/model`). Explicit so a free-tier account does not inherit a paid default and fail with `403 provider.auth`; set it to an empty string to defer to OpenCode, or pass `model` in the `POST /api/session/create` body |
| `OPENCODE_URL` | `service.json` | OpenCode base URL |
| `OPENCODE_PASSWORD` | `service.json` | OpenCode password (server-side only) |

Credentials are discovered from `%USERPROFILE%\.local\state\opencode\service.json`
(fallback `~/.config/opencode/service.json`), fields `url` / `password`. Auth is
HTTP Basic with username `opencode`.

## Routes (browser-visible)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | — | `HealthView`; only booleans/labels, never credentials |
| GET | `/api/workbench` | — | full `WorkbenchSnapshot` |
| GET | `/api/fs/list` | `?path=<relative>` | `{directory, path, entries:[{path,type}]}`; absolute paths and `..` are rejected |
| GET | `/api/fs/find` | `?query=<text>&limit=<n>` | workspace-wide filename search (files only) for the `@` picker |
| GET | `/api/events` | — | SSE, `retry: 1000`, one **full snapshot** per frame, `: heartbeat` every 10 s, coalesced to ≤10 Hz |
| POST | `/api/prompt` | `{text, sessionID?, files?}` | `{ok, sessionID, admitted}`; `files` are `PromptInput.FileAttachment` (`uri` must be `file:///…`) |
| POST | `/api/interrupt` | `{sessionID?}` | `{interrupted: boolean}` |
| POST | `/api/session/select` | `{sessionID}` | `{ok, activeSessionId}` + full re-sync |
| POST | `/api/session/create` | `{title?, model?}` | `{ok, sessionID, activeSessionId, directory}`; session is created with `location.directory = BRIDGE_PROJECT_DIR` |
| POST | `/api/session/model` | `{sessionID?, model:{providerID,id}}` | switch the real session model (`POST /api/session/{id}/model`) |
| PATCH | `/api/session` | `{sessionID?, title}` | rename the session (`PATCH /api/session/{id}`) |
| DELETE | `/api/session/{id}` | — | delete a session (and its child sessions); re-selects a survivor if it was active |
| GET | `/api/models` | — | real catalogue grouped by provider + the active session's current model |
| GET | `/api/agents` | — | selectable primary agents (hidden/subagent filtered) + current agent |
| POST | `/api/session/agent` | `{sessionID?, agent}` | switch the session's agent (`POST /api/session/{id}/agent`) |
| GET | `/api/commands` | — | commands the agent advertises (`init`/`review`/`goal`/MCP prompt commands) |
| POST | `/api/command` | `{sessionID?, name, text?, files?}` | run a command (`POST /api/session/{id}/command`, 204; turn streams via events) |
| POST | `/api/permission/{id}/respond` | `{decision:'once'\|'always'\|'reject'}` | `{ok, replied, sessionID, decision}` |
| GET | `/api/gameview/events` | — | SSE of `{id,type,detail,at}` (`type ∈ Read\|Edit\|Write\|Bash\|Search`), lossy projection for a future Loom Game View |

## Metric口径 (the only computation point — contract §3)

| Field | Rule | Source |
|---|---|---|
| `counts.agents` | sub-sessions of the active session (`parentID === active`) | `GET /api/session?parentID=` |
| `counts.tools` | distinct lower-cased raw tool names | tool-call set |
| `counts.calls` | distinct tool-call ids (`call_*`) | tool-call set |
| `counts.files` | distinct `path`/`filePath`/`file_path`/`notebookPath`/`notebook_path` values (`pattern`/`query` excluded), case/separator-normalised | tool inputs |
| `counts.edits` | calls whose normalised kind is `Write` or `Edit` (`edit`/`write`/`patch`/`multiedit`/`apply_patch` aliases) | tool-call set |
| `counts.think` / `counts.output` | cumulative `tokens.reasoning` / `tokens.output` | `Session.Info.tokens` / `usage.updated` |
| `toolCalls[]` | newest-first by `startedAt`; duration = `endedAt - startedAt`; `detail ≤ 160` chars; carries `messageID` (owning assistant message) + `output` (tool text, ≤ 1200 chars) | message `tool` parts + live events |
| `rate15s` | calls whose **start** lies in the trailing 15 000 ms (wall clock) | tool-call start times |
| `rateSeries` | 30 × 1 s buckets, oldest → newest | same |
| `tokPerSec` | output-token increments ÷ wall-clock Δ, EMA α=0.4, decays to 0 after 3 s idle | `step.ended.tokens.output` |
| `memoryMB` | **always `null`** — OpenCode exposes no per-process RSS (only a heap dump that pauses the server). Listed in `unavailable` | — |
| `contextUsed/contextLimit` | cumulative tokens vs active model `limit.context` (`GET /api/model`, cached 10 min) | model catalogue |
| `cost` | `Session.Info.cost` (0 for free models; `null` + `unavailable` if unknown) | session info |
| `tokensTotal` | `input + output + reasoning + cache.read + cache.write` | cumulative tokens |

Honesty rules: nothing is estimated. Optional values the bridge cannot source are
`null` **and** listed in `metrics.unavailable`. `unavailable` always contains
`memoryMB`; it also gains `contextLimit` or `cost` when those are unknown.

## Dedup, resync, session switching (contract §4)

- **Tool calls**: keyed by OpenCode `call_*` id. Full re-sync rebuilds the set from
  `GET /api/session/{id}/message` tool parts; live SSE events only fill unseen ids.
  SSE replay/reconnect cannot double count. Verified: restarting the bridge rebuilt
  the same 6 ids with 0 duplicates / 0 missing.
- **Tokens**: only cumulative values are assigned (`usage.updated`, `Session.Info.tokens`).
  `step.ended.tokens` never adds to totals; it only feeds the tok/s EMA delta.
- **Messages**: keyed by `msg_*` id; text deltas patch the streaming assistant message
  in place (never append a second message).
- **Session switching**: clears messages/tool calls/rate window/tok EMA/jobs/permissions
  and rebuilds from the new session, so metrics never leak between sessions.
- **Re-sync triggers**: bridge start, SSE (re)connect, session switch, ~15 s while idle,
  and debounced after lifecycle events (execution ended, permission asked/replied).
- **Boot selection**: no session is auto-created. The bridge selects the most recently
  updated session whose `location.directory === BRIDGE_PROJECT_DIR`; otherwise
  `activeSessionId: null` with empty arrays.

## Caps / truncation

`sessions ≤ 50`, `messages ≤ 120` (newest), `toolCalls ≤ 200` (newest first),
`processes ≤ 12`, message text ≤ 4000 chars, tool detail ≤ 160 chars.
Snapshots are always **replacements**; `version` increases monotonically, so a client
can drop stale frames (and a reconnect cannot accumulate).

## Processes (card ④)

Running shells from `GET /api/shell?location[directory]=<active dir>` (pid / command /
elapsed), jobs from `GET /api/experimental/job?sessionID=<active>` (shell / subagent /
image), and running PTYs. Shell lists are location-scoped; jobs are session-scoped.
Empty → the UI shows “没有后台进程”. Event-tracked shells (`shell.created`, `shell.exited`)
feed the same list between re-syncs.

## Permissions (contract §5)

`permission.asked` events and the pending lists (`GET /api/permission/request` +
`GET /api/session/{id}/permission`) populate `permissions[]` with
`{id, sessionID, action, resources, save, message, requestedAt}`.
`POST /api/permission/{id}/respond` resolves the owning session from the stored
permission and replies to `POST /api/session/{sessionID}/permission/{requestID}/reply`.
Verified end-to-end against a real `.env` read ask: `action:"read"`, `resources:[".env"]`.

## Files

| File | Role |
|---|---|
| `index.mjs` | HTTP server, routes, browser SSE fan-out (≤10 Hz + heartbeat), startup/shutdown |
| `opencode.mjs` | credential discovery, typed request helper (timeouts, sanitised errors), SSE subscriber with exponential backoff/reconnect |
| `store.mjs` | state, dedup, per-session windows, full re-sync, snapshot builder |
| `metrics.mjs` | pure metric functions (no I/O) — the single computation point |

## Honest gaps / limitations

- **`memoryMB` is not obtainable** from OpenCode v2.2.6 (no RSS surface). Always `null`.
- **PTY `startedAt`** is usually absent in `Pty` payloads → `startedAt/elapsedMs` may be `null`.
- **Shell pid** is often absent on `shell.created` events; a re-sync via `GET /api/shell`
  may fill it in, otherwise `pid: null` is reported.
- **Permission `requestedAt`** for asks that were already pending before the bridge
  started is the bridge's first-seen time (OpenCode's list carries no timestamp).
- `messages[]` mirrors OpenCode message types, including `idle` markers and tool-only
  assistant messages whose `text` is empty (content is represented in `toolCalls[]`).
- `contextUsed` is cumulative token usage, not a live context-window occupancy metric
  (OpenCode exposes no separate counter) — no percentage is fabricated.
- `/api/event` is volatile by contract; the bridge always re-syncs after a reconnect.
- The bridge is read/write through the HTTP API only; it never opens `opencode.db`.

| GET | `/api/file?path=` | — | one file for the preview: text (first 4 MiB, `truncated`), image (base64), or `pdf`/`binary`/`too-large` |
| GET | `/api/projects` | — | curated project list + the active directory |
| POST | `/api/projects` | `{path}` | add an absolute existing directory to the list (no switch) |
| POST | `/api/project/select` | `{path}` | switch to that directory's most recent session (creates one if none) |
| POST | `/api/projects/remove` | `{path}` | forget a project (disk and sessions untouched) |
