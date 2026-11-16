import { useEffect, useRef, useState } from 'react';
import { LoomEngine } from './engine';
import type { EngineStatus, ToolName } from './engine/events/types';
import { fetchReplay, scheduleReplay } from './engine/events/replay';

const TOOLS: ToolName[] = ['Read', 'Edit', 'Write', 'Bash', 'Search'];

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LoomEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const engine = new LoomEngine();
    engineRef.current = engine;
    const unsub = engine.bus.subscribe(setStatus);
    const params = new URLSearchParams(location.search);
    const staticMode = params.has('static');
    const replayMode = params.has('replay');
    let disposed = false;
    let cancelReplay: (() => void) | undefined;
    engine.init(el, { autoplay: !staticMode && !params.has('noauto') && !replayMode, static: staticMode }).then(async () => {
      if (replayMode) {
        try {
          const replay = await fetchReplay();
          if (disposed) return;
          engine.play(false);
          cancelReplay = scheduleReplay(replay, (e) => engine.inject(e), () => engine.status);
        } catch (e) { console.error('replay failed', e); }
      }
    }).catch((err) => {
      console.error(err);
      setFatal(String(err));
    });
    (window as unknown as { __loom?: unknown }).__loom = {
      engine,
      trigger: (t: ToolName) => engine.trigger(t),
      play: () => engine.play(),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      stop: () => engine.stop(),
      setSpeed: (s: number) => engine.setSpeed(s),
      getStatus: () => engine.status,
      tick: (dt: number) => engine.manualTick(dt),
      getMechanism: () => engine.mechanism,
      setView: (detail: boolean) => engine.setView(detail),
      inject: (e: { id: number; type: ToolName; detail: string; at: number }) => engine.inject(e),
      ready: engine.ready,
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (engine.status.state === 'running') engine.pause();
        else if (engine.status.state === 'paused') engine.resume();
        else engine.play();
      }
      if (ev.key === 'm') { const v = !engine.status.muted; engine.setMuted(v); setMuted(v); }
      const idx = Number(ev.key);
      if (idx >= 1 && idx <= 5) engine.trigger(TOOLS[idx - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      disposed = true;
      cancelReplay?.();
      window.removeEventListener('keydown', onKey);
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const s = status;
  const stateLabel = s?.state ?? 'booting';
  const hideUi = new URLSearchParams(location.search).get('ui') === '0';

  return (
    <div className="app">
      <div className="stage" ref={stageRef} />
      {fatal && <div className="fatal">渲染初始化失败：{fatal}</div>}

      {!hideUi && (<header className="brand">
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
            <p>MECHANICAL ARTS / SERIES 01</p>
          </div>
        </div>
        <div className="brand-sub">Loom<span>把思考织成经纬</span></div>
      </header>)}

      {!hideUi && (<aside className="telemetry">
        <div className={`pill ${stateLabel}`}>
          <i /> {stateLabel.toUpperCase()}
        </div>
        <dl>
          <div><dt>RPM</dt><dd>{s?.rpm ?? 0}</dd></div>
          <div><dt>CALLS</dt><dd>{s?.events ?? 0}</dd></div>
          <div><dt>RATE / 15S</dt><dd>{s?.rate15s ?? 0}</dd></div>
        </dl>
      </aside>)}

      {!hideUi && (<footer className="console">
        <div className="transport">
          <span className="transport-label">{new URLSearchParams(location.search).has('replay') ? 'SESSION REPLAY' : 'LIVE WEAVE'}</span>
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
          <button className={muted ? 'on' : ''} onClick={() => { const v = !muted; setMuted(v); engineRef.current?.setMuted(v); }}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button className={detail ? 'on' : ''} onClick={() => { setDetail(!detail); engineRef.current?.setView(!detail); }}>{detail ? 'Full view' : 'Detail'}</button>
        </div>
        <div className="tools">
          {TOOLS.map((t, i) => (
            <button key={t} className={`tool tool-${t.toLowerCase()}`} onClick={() => engineRef.current?.trigger(t)} title={`Trigger ${t}  [${i + 1}]`}>
              <span>{t}</span>
              <b>{s?.counts?.[t] ?? 0}</b>
            </button>
          ))}
        </div>
        <div className="hint"><span>{s?.lastEvent ? `${s.lastEvent.type.toUpperCase()} / ${s.lastEvent.detail}` : '等待事件 · 每一次调用，织入一道纬线'}</span><span>SPACE 暂停 · 1–5 触发 · M 静音</span></div>
      </footer>)}
    </div>
  );
}
