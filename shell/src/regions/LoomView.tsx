/**
 * The Loom Game View, mounted in the shell's centre well.
 *
 * The scene is the real engine from `../kunlun-loom` (aliased as `@loom`), not a
 * reduced copy: same mechanised loom, same event dial, same cloth. The only
 * integration points are (a) the container it lays out inside and (b) the tool
 * calls it is fed, which come from the shell's own snapshot — one workbench, one
 * source of truth, no second event pipeline.
 *
 * History is deliberately not replayed: a freshly opened shell shows an empty
 * loom, and only calls that arrive while it is open are woven.
 */
import { useEffect, useRef } from 'react';
import { VisualEngine, type ToolEvent } from '@loom/engine';
import { useWorkbench } from '../data/store';

export function LoomView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VisualEngine | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<ToolEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const seqRef = useRef(0);
  const snapshot = useWorkbench();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new VisualEngine('loom');
    engineRef.current = engine;
    // Debug handle, same convention as the standalone page’s window.__engine.
    (window as unknown as { __loomEngine?: VisualEngine }).__loomEngine = engine;
    let disposed = false;

    engine.init(host, { mode: 'loom' }).then(() => {
      if (disposed) return;
      readyRef.current = true;
      for (const event of pendingRef.current.splice(0)) engine.inject(event);
    }).catch((err) => {      // A failed renderer must not take the whole shell down with it.
      console.error('[loom] engine init failed', err);
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      engineRef.current = null;
      pendingRef.current.length = 0;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    const calls = snapshot.toolCalls;
    if (!calls?.length) return;

    // First snapshot is history: remember it, do not re-weave it.
    if (!seededRef.current) {
      seededRef.current = true;
      for (const call of calls) seenRef.current.add(call.id);
      return;
    }

    for (const call of calls) {
      if (seenRef.current.has(call.id)) continue;
      seenRef.current.add(call.id);
      if (call.status === 'aborted') continue;
      const event: ToolEvent = {
        id: ++seqRef.current,
        type: call.kind,
        detail: call.detail,
        at: call.startedAt,
      };
      if (readyRef.current) engineRef.current?.inject(event);
      else pendingRef.current.push(event);
    }
  }, [snapshot.toolCalls]);

  return (
    <div
      ref={hostRef}
      style={{ position: 'absolute', inset: 0 }}
      aria-label="Loom game view"
    />
  );
}
