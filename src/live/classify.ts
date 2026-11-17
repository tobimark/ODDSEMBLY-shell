/**
 * Page-side name classifier.
 *
 * The bridge is authoritative (it classifies before sending). This table exists
 * for two narrow jobs: (a) legacy `{type, detail}` frames from an older bridge,
 * and (b) making the "unknown tool" rule explicit and testable on the client.
 *
 * Keep in sync with `TOOL_CLASS` in `scripts/opencode-loom-bridge.mjs`.
 */
import type { ToolName } from '../engine/core/types';

export const TOOL_CLASS: Record<string, ToolName> = {
  read: 'Read', view: 'Read', open: 'Read', cat: 'Read', readfile: 'Read', notebookread: 'Read',
  edit: 'Edit', multiedit: 'Edit', patch: 'Edit', applypatch: 'Edit', replace: 'Edit', notebookedit: 'Edit',
  write: 'Write', create: 'Write', writefile: 'Write', notebookwrite: 'Write',
  shell: 'Bash', bash: 'Bash', run: 'Bash', execute: 'Bash', terminal: 'Bash', cmd: 'Bash', pwsh: 'Bash', powershell: 'Bash',
  grep: 'Search', glob: 'Search', search: 'Search', find: 'Search', ripgrep: 'Search', rg: 'Search', ls: 'Search', list: 'Search',
  websearch: 'Search', webfetch: 'Search',
};

/** `Task`, `TodoWrite`, `Skill`, … deliberately return null: no faithful class. */
export function classifyTool(raw: string | null | undefined): ToolName | null {
  const key = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return TOOL_CLASS[key] ?? null;
}

export function isLiveCallStatus(v: unknown): v is 'running' | 'success' | 'failed' | 'aborted' {
  return v === 'running' || v === 'success' || v === 'failed' || v === 'aborted';
}
