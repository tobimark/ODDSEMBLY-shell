import { useEffect, useRef, useState } from 'react';
import { VisualEngine, modeMetas, TOOL_NAMES } from './engine';
import type { EngineOptions, EngineStatus, ModeId, ToolName } from './engine';

const TOOLS: readonly ToolName[] = TOOL_NAMES;

/** Call status markers. A call is only "succeeded" once OpenCode says so. */
function statusMark(status: 'running' | 'success' | 'failed' | 'aborted'): string {
  if (status === 'success') return '✓';
  if (status === 'failed') return '✕';
  if (status === 'aborted') return '⊘';
  return '…';
}

/** A scripted feed is labelled MOCK so a demo is never mistaken for a real agent. */
const DEMO_SOURCE = new URLSearchParams(location.search).has('mock') ? 'MOCK' : 'LIVE';

function readOptions(): EngineOptions {  const params = new URLSearchParams(location.search);
  const rawMode = params.get('mode');
  const valid: ModeId[] = ['loom'];
  const mode = valid.includes(rawMode as ModeId) ? (rawMode as ModeId) : 'loom';
  return {
    mode,
    static: params.has('static'),
    deterministic: params.has('deterministic') || params.has('static'),
    replay: params.has('replay'),
    replayUrl: params.get('session') ?? undefined,
    autoplay: !params.has('static') && !params.has('noauto') && !params.has('replay'),
    reducedMotion: params.get('motion') === 'off',
    // `?live=` is the real-agent entry point; `?feed=` is kept for older links.
    feed: params.get('live') ?? params.get('feed') ?? undefined,
  };
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VisualEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [speed, setSpeed] = useState(1);
  const [detail, setDetail] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const opts = readOptions();
    const engine = new VisualEngine(opts.mode);
    engineRef.current = engine;
    const unsub = engine.bus.subscribe(setStatus);
    let disposed = false;

    engine.init(el, opts).catch((err) => {
      // StrictMode/HMR unmounts the first mount while its async init is still
      // running; that rejected init is not a page failure and must not paint the
      // fatal banner over the remounted engine.
      if (disposed) return;
      console.error(err);
      setFatal(String(err));
    });

    const boot = async () => {
      await engine.ready;
      if (disposed) return;
      engine.bindKeyboard();
    };
    void boot();

    const w = window as unknown as Record<string, unknown>;
    const api = {
      engine,
      ready: engine.ready,
      replayReady: engine.replayReady,
      tick: (dt = 1 / 60) => engine.tick(dt),
      steps: (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) engine.tick(dt); },
      inject: (e: { id: number; type: ToolName; detail: string; at?: number }) =>
        engine.inject({ ...e, at: e.at ?? performance.now() }),
      trigger: (t: ToolName) => engine.trigger(t),
      play: (simulate = true) => engine.play(simulate),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      stop: () => engine.stop(),
      reset: () => engine.resetAll(),
      setMode: (m: ModeId) => engine.setMode(m),
      getMode: () => engine.activeModeId,
      getModeInstance: (m?: ModeId) => engine.modeInstance(m),
      setSpeed: (s: number) => engine.setSpeed(s),
      setMuted: (m: boolean) => engine.setMuted(m),
      setZoom: (z: number) => engine.setZoom(z),
      setReducedMotion: (r: boolean) => engine.setReducedMotion(r),
      getStatus: () => engine.status,
      getTelemetry: () => engine.telemetrySnapshot(),
      getModeTelemetry: (m?: ModeId) => engine.modeTelemetry(m),
      getLive: () => engine.liveSnapshot(),
      startReplay: (o?: { url?: string; deterministic?: boolean }) => engine.startReplay(o),
      audio: engine.audio,
      readyWithReplay: async () => { await engine.ready; await engine.replayReady; return true; },
    };
    w.__engine = api;
    // Legacy Loom-only bridge kept for the existing review/verification scripts.
    w.__loom = {
      engine,
      ready: engine.ready,
      trigger: (t: ToolName) => engine.trigger(t),
      play: (simulate = true) => engine.play(simulate),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      stop: () => engine.stop(),
      setSpeed: (s: number) => engine.setSpeed(s),
      getStatus: () => engine.status,
      tick: (dt: number) => engine.tick(dt),
      getMechanism: () => engine.modeTelemetry('loom'),
      setView: (d: boolean) => engine.setZoom(d ? 1.65 : 1),
      inject: (e: { id: number; type: ToolName; detail: string; at?: number }) =>
        engine.inject({ ...e, at: e.at ?? performance.now() }),
      setMuted: (m: boolean) => engine.setMuted(m),
      /** real-agent link snapshot (also mirrored on window.__engine.getLive) */
      live: () => engine.liveSnapshot(),
    };



    return () => {
      disposed = true;
      unsub();
      engine.destroy();
      engineRef.current = null;
      delete w.__engine;
      delete w.__loom;
    };
  }, []);

  const s = status;
  const hideUi = new URLSearchParams(location.search).get('ui') === '0';
  const stateLabel = s?.state ?? 'booting';
  const meta = modeMetas().find((m) => m.id === s?.modeId) ?? modeMetas()[0];
  const hud = s?.hud ?? { transport: 'STANDBY', stage: 'IDLE', fields: [], caption: '', hint: '' };
  const replay = s?.replay;
  const live = s?.live ?? null;
  const liveOn = !!live?.realtime;
  const liveHint = live
    ? `${DEMO_SOURCE} · ${live.state.toUpperCase()} · 调用 ${live.calls}`
      + (live.folded ? ` · 合并 ${live.folded}` : '')
      + (live.recovered ? ` · 恢复 ${live.recovered}` : '')
      + (live.unmapped ? ` · 未识别 ${live.unmapped}` : '')
      + (live.gaps ? ` · 断线 ${live.gaps}` : '')
    : '';
  const liveLine = live?.lastCall
    ? `${(live.lastCall.cls ?? live.lastCall.tool).toUpperCase()} / ${live.lastCall.detail || live.lastCall.tool} · ${statusMark(live.lastCall.status)}`
    : null;

  const setMode = (m: ModeId) => {
    engineRef.current?.setMode(m);
    try {
      const url = new URL(location.href);
      url.searchParams.set('mode', m);
      history.replaceState(null, '', url);
    } catch { /* ignore */ }
  };
  const toggleDetail = () => {
    const next = !detail;
    setDetail(next);
    engineRef.current?.setZoom(next ? 1.6 : 1);
  };

  return (
    <div className="app">
      <div className="stage" ref={stageRef} />
      {fatal && <div className="fatal">渲染初始化失败：{fatal}</div>}

      {!hideUi && (
        <header className="brand">
          <div className="brand-mark">
            <span className="brand-glyph" aria-hidden="true">
              <svg viewBox="0 0 28 28" width="26" height="26">
                <circle cx="14" cy="14" r="11.2" fill="none" stroke="#171C60" strokeWidth="1.2" />
                <circle cx="14" cy="14" r="6.4" fill="none" stroke="#171C60" strokeWidth="0.8" opacity="0.55" />
                <path d="M14 2.6v22.8M2.6 14h22.8M6 6l16 16M22 6L6 22" stroke="#171C60" strokeWidth="0.7" opacity="0.35" />
                <circle cx="14" cy="14" r="2.2" fill="#33CBCC" />
              </svg>
            </span>
            <div>
              <h1>KUNLUNMETA</h1>
              <p>AGENT VISUAL ENGINE / SERIES 01</p>
            </div>
          </div>

          {modeMetas().length > 1 ? (
            <nav className="mode-nav" aria-label="visual modes">
              {modeMetas().map((m) => (
                <button
                  key={m.id}
                  className={`mode-tab ${s?.modeId === m.id ? 'active' : ''}`}
                  onClick={() => setMode(m.id)}
                  title={m.tagline}
                >
                  <span className="mode-index">{m.index}</span>
                  <span className="mode-name">{m.title}</span>
                </button>
              ))}
            </nav>
          ) : (
            <div className="mode-plaque" aria-label="current exhibition">
              <span className="mode-index">01</span>
              <span className="mode-name">LOOM</span>
              <span className="mode-plaque-note">EXHIBITION 01 · 112 ENDS</span>
            </div>
          )}

          <div className="mode-caption">
            <span className="mode-caption-title">{meta.title}</span>
            <span className="mode-caption-sub">{meta.subtitle}</span>
          </div>

          <aside className="telemetry">
            <div className={`pill ${stateLabel}`}><i />{stateLabel.toUpperCase()}</div>
            <dl>
              {hud.fields.slice(0, 4).map((f) => (
                <div key={f.label} className={`tone-${f.tone ?? 'ink'}`}>
                  <dt>{f.label}</dt><dd>{f.value}</dd>
                </div>
              ))}
              <div><dt>MODE</dt><dd>{hud.stage}</dd></div>
            </dl>
          </aside>
        </header>
      )}

      {!hideUi && (
        <footer className="console">
          <div className="transport">
            <span className="transport-label">
              {replay ? 'SESSION REPLAY' : hud.transport}
            </span>
            {s?.state === 'running'
              ? <button onClick={() => engineRef.current?.pause()}>Pause</button>
              : s?.state === 'paused'
                ? <button onClick={() => engineRef.current?.resume()}>Resume</button>
                : <button onClick={() => engineRef.current?.play()}>Play</button>}
            <button onClick={() => engineRef.current?.stop()}>Stop</button>
            <div className="speed">
              {[0.5, 1, 2].map((v) => (
                <button key={v} className={speed === v ? 'on' : ''} onClick={() => { setSpeed(v); engineRef.current?.setSpeed(v); }}>{v}×</button>
              ))}
            </div>
            <button className={s?.muted ? 'on' : ''} onClick={() => engineRef.current?.setMuted(!s?.muted)}>
              {s?.muted ? 'Sound off' : 'Sound on'}
            </button>
            <button className={detail ? 'on' : ''} onClick={toggleDetail}>{detail ? 'Full view' : 'Detail'}</button>
            {replay && (
              <span className="replay-meter">
                REPLAY {String(replay.cursor).padStart(2, '0')}/{String(replay.total).padStart(2, '0')}{replay.done ? ' · DONE' : ''}
              </span>
            )}
          </div>
          <div className="tools">
            {TOOLS.map((t, i) => (
              <button
                key={t}
                className={`tool tool-${t.toLowerCase()} ${s?.lastEvent?.type === t ? 'pulse' : ''}`}
                onClick={() => engineRef.current?.trigger(t)}
                disabled={liveOn}
                title={liveOn ? 'real agent mode — synthetic triggers are disabled' : `Trigger ${t}  [${i + 1}]`}
              >
                <span>{t}</span><b>{s?.counts?.[t] ?? 0}</b>
              </button>
            ))}
          </div>
          <div className="hint">
            <span>
              {liveLine
                ? liveLine
                : s?.lastEvent
                  ? `${s.lastEvent.type.toUpperCase()} / ${s.lastEvent.detail}`
                  : hud.caption}
            </span>
            <span>{liveOn ? liveHint : (hud.hint || 'SPACE 暂停 · 1–5 触发 · M 静音 · [ ] 切换世界')}</span>
          </div>
        </footer>
      )}
    </div>
  );
}
