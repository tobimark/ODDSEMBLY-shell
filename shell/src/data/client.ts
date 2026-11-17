/**
 * Bridge HTTP client. The browser only ever talks to the ODDSEMBLY bridge
 * (`/api/*`, same origin behind the Vite proxy) — never to OpenCode directly,
 * and never sees OpenCode credentials.
 */
import type {
  AgentCatalogue,
  CommandCatalogue,
  FileEntry,
  FilePreviewData,
  ModelCatalogue,
  ProjectList,
  WorkbenchSnapshot,
} from './types';

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      detail = parsed.error || parsed.message || detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function fetchSnapshot(): Promise<WorkbenchSnapshot> {
  return json<WorkbenchSnapshot>(await fetch('/api/workbench', { cache: 'no-store' }));
}

export async function postPrompt(
  text: string,
  sessionID?: string | null,
  files?: Array<{ uri: string; name?: string }> | null,
): Promise<void> {
  await json(
    await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        sessionID: sessionID ?? null,
        ...(files && files.length > 0 ? { files } : {}),
      }),
    }),
  );
}

/**
 * One directory of the active workspace, relative to the session directory.
 * Read-only query: it is not part of the snapshot, so the caller caches it.
 */
export async function fetchFiles(path = '.'): Promise<{ directory: string; path: string; entries: FileEntry[] }> {
  return json(
    await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`, { cache: 'no-store' }),
  );
}

/** Workspace-wide filename search (`GET /api/fs/find?query=`). */
export async function fetchFind(query: string, limit = 8): Promise<{ directory: string; query: string; entries: FileEntry[] }> {
  return json(
    await fetch(`/api/fs/find?query=${encodeURIComponent(query)}&limit=${limit}`, { cache: 'no-store' }),
  );
}

/** The real OpenCode model catalogue, grouped by provider. */
export async function fetchModels(): Promise<ModelCatalogue> {
  return json<ModelCatalogue>(await fetch('/api/models', { cache: 'no-store' }));
}

/** Selectable primary agents + the session's current agent. */
export async function fetchAgents(): Promise<AgentCatalogue> {
  return json<AgentCatalogue>(await fetch('/api/agents', { cache: 'no-store' }));
}

/** Commands the agent advertises for the `/` menu. */
export async function fetchCommands(): Promise<CommandCatalogue> {
  return json<CommandCatalogue>(await fetch('/api/commands', { cache: 'no-store' }));
}

/** One workspace file for the in-app preview. */
export async function fetchFile(path: string): Promise<FilePreviewData> {
  return json<FilePreviewData>(
    await fetch(`/api/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' }),
  );
}

/** The curated project list + the active directory. */
export async function fetchProjects(): Promise<ProjectList> {
  return json<ProjectList>(await fetch('/api/projects', { cache: 'no-store' }));
}

/** Add an absolute directory and switch to it. */
export async function postAddProject(path: string): Promise<ProjectList> {
  return json<ProjectList>(
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
}

/** Switch to a project (its most recent session, or a new one). */
export async function postSelectProject(path: string): Promise<{ sessionID: string; directory: string }> {
  return json(
    await fetch('/api/project/select', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
}

/** Forget a project; the directory on disk is untouched. */
export async function postRemoveProject(path: string): Promise<ProjectList> {
  return json<ProjectList>(
    await fetch('/api/projects/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
}

/** Run an agent command (the turn streams back through the normal snapshot). */
export async function postCommand(
  name: string,
  text: string,
  sessionID?: string | null,
  files?: Array<{ uri: string; name?: string }> | null,
): Promise<void> {
  await json(
    await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionID: sessionID ?? null,
        name,
        text,
        ...(files && files.length > 0 ? { files } : {}),
      }),
    }),
  );
}

/** Switch the agent used by the active (or given) session. */
export async function postSelectAgent(
  agent: string,
  sessionID?: string | null,
): Promise<void> {
  await json(
    await fetch('/api/session/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: sessionID ?? null, agent }),
    }),
  );
}

/** Switch the model of the active (or given) session. */
export async function postSelectModel(
  model: { providerID: string; id: string },
  sessionID?: string | null,
): Promise<void> {
  await json(
    await fetch('/api/session/model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: sessionID ?? null, model }),
    }),
  );
}

/** Rename the active (or given) session. */
export async function patchSessionTitle(
  title: string,
  sessionID?: string | null,
): Promise<void> {
  await json(
    await fetch('/api/session', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: sessionID ?? null, title }),
    }),
  );
}

/** Delete a session (OpenCode also deletes its child sessions). */
export async function deleteSession(sessionID: string): Promise<void> {
  await json(
    await fetch(`/api/session/${encodeURIComponent(sessionID)}`, { method: 'DELETE' }),
  );
}

export async function postInterrupt(sessionID?: string | null): Promise<{ interrupted: boolean }> {
  return json<{ interrupted: boolean }>(
    await fetch('/api/interrupt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: sessionID ?? null }),
    }),
  );
}

export async function postSelectSession(id: string): Promise<void> {
  await json(
    await fetch('/api/session/select', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: id }),
    }),
  );
}

export async function postCreateSession(
  title?: string,
  model?: { providerID: string; id: string } | null,
): Promise<{ sessionID: string }> {
  return json<{ sessionID: string }>(
    await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title ?? null,
        ...(model ? { model } : {}),
      }),
    }),
  );
}

export async function postPermission(
  requestID: string,
  decision: 'once' | 'always' | 'reject',
): Promise<void> {
  await json(
    await fetch(`/api/permission/${encodeURIComponent(requestID)}/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    }),
  );
}
