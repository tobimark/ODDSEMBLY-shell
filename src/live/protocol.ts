/**
 * Wire protocol between the OpenCode bridge (`scripts/opencode-loom-bridge.mjs`)
 * and the page. Deliberately free of any Loom concepts: another Game View can
 * consume the same stream.
 *
 * One logical record per OpenCode tool call id:
 *   phase 'start'     the call exists (it has NOT succeeded yet)
 *   phase 'detail'    arguments arrived / changed (display only)
 *   phase 'status'    the call resolved: success | failed | aborted
 *   phase 'recovered' rebuilt after a reconnect (never replayed as live)
 */
import type { ToolName } from '../engine/core/types';

export type LiveCallStatus = 'running' | 'success' | 'failed' | 'aborted';
export type LiveCallPhase = 'start' | 'detail' | 'status' | 'recovered';

export interface LiveCallMessage {
  kind: 'call';
  phase: LiveCallPhase;
  callId: string;
  tool: string;
  /** null = Loom has no faithful class for this tool; the page must not fake one */
  cls: ToolName | null;
  detail: string;
  status: LiveCallStatus;
  sessionID: string | null;
  at: number;
  recovered?: boolean;
  error?: string;
}

export type LiveLinkState = 'connected' | 'reconnecting' | 'reconnected' | 'gap' | 'closed';

export interface LiveLinkMessage {
  kind: 'link';
  state: LiveLinkState;
  at: number;
  server?: string;
  retryInMs?: number;
  /** calls rebuilt from the session log after a reconnect */
  recovered?: number;
  /** 'unknown' | 'partial' — what the gap cost us; never silently "complete" */
  missed?: string;
}

export interface LiveHelloMessage {
  kind: 'hello';
  mode: 'live';
  source: { server: string; session: string | null; bridgeVersion: number };
  counters: Record<string, unknown>;
}

export interface LiveLedgerMessage {
  kind: 'ledger';
  counters: Record<string, unknown>;
}

export type LiveMessage = LiveCallMessage | LiveLinkMessage | LiveHelloMessage | LiveLedgerMessage | { kind: 'ping' };

/** JSON-safe snapshot for React and QA harnesses. */
export interface LiveStatus {
  state: 'off' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
  url: string | null;
  server: string | null;
  /** real mode: synthetic triggers are refused so the stream stays truthful */
  realtime: boolean;
  calls: number;
  mapped: number;
  played: number;
  folded: number;
  recovered: number;
  unmapped: number;
  gaps: number;
  statuses: { running: number; success: number; failed: number; aborted: number };
  lastGap: { at: number; recovered: number; missed: string } | null;
  lastCall: { callId: string; tool: string; cls: ToolName | null; status: LiveCallStatus; error: string | null; at: number; detail: string } | null;
  unmappedTools: Record<string, number>;
}

export function emptyLiveStatus(): LiveStatus {
  return {
    state: 'off',
    url: null,
    server: null,
    realtime: false,
    calls: 0,
    mapped: 0,
    played: 0,
    folded: 0,
    recovered: 0,
    unmapped: 0,
    gaps: 0,
    statuses: { running: 0, success: 0, failed: 0, aborted: 0 },
    lastGap: null,
    lastCall: null,
    unmappedTools: {},
  };
}
