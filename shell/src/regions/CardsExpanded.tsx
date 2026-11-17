/**
 * Expanded (full-panel) views of the four HUD cards — 1:1 with CrommaCode.
 *
 * Geometry reference: the user's captures of the original app
 * (`r3-tokenflow/userref/modal-{tools,rate,procs}.png`, 1320x1244-ish). The modal
 * is the game-view panel inset by ~2.1% on each side, white paper, 14 px radius,
 * header = amber square + title + close X, content = proportional table / chart.
 * All positions below are derived from those ratios applied to our panel
 * (x 265, y 100, w 730.5, h 743).
 */
import { UI_ICON_PATHS } from '../svg/uiIcons';
import type { DetailView, ProcessView, ToolCallView } from '../data/types';
import { compactCount, formatDuration, relativeTime } from '../data/format';

const FAMILY = "'Maple Mono CN', 'Microsoft YaHei UI', 'Microsoft YaHei', monospace";

const K = {
  paper: '#fffdfb',
  border: '#e6e0d7',
  ink: '#3b352d',
  label: '#8e867b',
  faint: '#b0aaa1',
  accent: '#e2a520',
  bar: '#f8ba3f',
  barSoft: '#fbda98',
  blue: '#3a81d7',
};

/** game-view panel → modal inset (measured 2.1% / 1.2% of the capture) */
const PANEL = { x: 265, y: 100, w: 730.5, h: 743 };
const M = { x: PANEL.x + 14, y: PANEL.y + 11, w: PANEL.w - 28, h: PANEL.h - 25 };

/** modal-local layout (px), derived from the capture ratios */
const L = {
  padX: 24,
  headY: 41,
  closeX: M.w - 26,
  rowsTop: 76,
  rowPitch: 30,
  colAgent: 24,
  colTime: 168,
  colTool: 268,
  dividerY: 361,
  sectionY: 386,
  sectionRowsY: 416,
  statsY: 80,
  chartTop: 108,
  chartBottom: M.h - 96,
  axisY: M.h - 58,
};

function Icon({ name, size, color }: { name: string; size: number; color: string }) {
  const path = UI_ICON_PATHS[name] ?? UI_ICON_PATHS['file-text'] ?? '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{ display: 'block', color }}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <div style={{ position: 'absolute', left: L.padX, top: L.headY - 11, width: 5, height: 5, background: K.accent }} />
      <div
        style={{
          position: 'absolute',
          left: L.padX + 12,
          top: L.headY - 20,
          fontFamily: FAMILY,
          fontSize: 14,
          lineHeight: '20px',
          color: K.label,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </div>
      <button
        type="button"
        onClick={onClose}
        title="收起"
        style={{
          position: 'absolute',
          left: L.closeX - 8,
          top: L.headY - 18,
          width: 20,
          height: 20,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: K.faint,
          cursor: 'pointer',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="close" size={13} color={K.faint} />
      </button>
    </>
  );
}

const cell: React.CSSProperties = {
  position: 'absolute',
  fontFamily: FAMILY,
  fontSize: 10.5,
  lineHeight: '14px',
  whiteSpace: 'nowrap',
  color: K.label,
};

/* ------------------------------------------------------- 工具流 expanded --- */

function ToolsExpanded({ calls, detail, now }: { calls: ToolCallView[]; detail: DetailView; now: number }) {
  const rows = calls.slice(0, 10);
  return (
    <>
      {rows.map((c, i) => {
        const y = L.rowsTop + i * L.rowPitch;
        return (
          <div key={c.id}>
            <div style={{ ...cell, left: L.colAgent, top: y, color: K.faint, fontSize: 9 }}>●</div>
            <div style={{ ...cell, left: L.colAgent + 12, top: y, color: K.label }}>main</div>
            <div style={{ ...cell, left: L.colTime, top: y }}>{relativeTime(c.startedAt, now)}</div>
            <div style={{ ...cell, left: L.colTool, top: y, color: K.ink }}>{toolLabel(c.name)}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: L.padX, right: L.padX, top: L.dividerY, height: 1, background: '#ece6dd' }} />
      <div style={{ position: 'absolute', left: L.padX, top: L.sectionY, width: 4, height: 4, background: K.accent }} />
      <div style={{ position: 'absolute', left: L.padX + 11, top: L.sectionY - 4, fontFamily: FAMILY, fontSize: 11.5, color: K.label }}>
        工具 × 时间
      </div>
      {detail.toolCounts.slice(0, 8).map((t, i) => {
        const y = L.sectionRowsY + i * L.rowPitch;
        return (
          <div key={t.name}>
            <div style={{ ...cell, left: L.padX, top: y, color: K.ink }}>{toolLabel(t.name)}</div>
            <div style={{ ...cell, left: L.colTime, top: y, color: K.ink }}>{t.count}</div>
          </div>
        );
      })}
    </>
  );
}

/** OpenCode tool name -> the label the original card shows (capitalised). */
function toolLabel(name: string): string {
  if (!name) return 'tool';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/* ----------------------------------------------------- 调用率 expanded --- */

function RateExpanded({ detail, now }: { detail: DetailView; now: number }) {
  const series = detail.rateHistory.length ? detail.rateHistory : [0];
  const peak = Math.max(1, ...series);
  const chartH = L.chartBottom - L.chartTop;
  const minutes = Math.max(1, Math.round(detail.sessionMs / 60000));
  const totalCalls = detail.toolCounts.reduce((a, t) => a + t.count, 0);
  const barW = Math.max(6, Math.min(16, (M.w - L.padX * 2) / series.length - 6));
  return (
    <>
      <div style={{ ...cell, left: L.padX, top: L.statsY, fontSize: 11, color: K.label }}>
        峰值 {detail.peak15s} / 15 秒
      </div>
      <div style={{ ...cell, left: 150, top: L.statsY, fontSize: 11, color: K.label }}>
        均值 {detail.mean15s} / 15 秒
      </div>
      <div style={{ ...cell, left: 300, top: L.statsY, fontSize: 11, color: K.label }}>
        {minutes} 分钟 {totalCalls}
      </div>
      <div style={{ ...cell, left: 430, top: L.statsY, fontSize: 11, color: K.label }}>本局 {totalCalls}</div>

      <div style={{ position: 'absolute', left: L.padX, top: L.chartTop - 14, fontFamily: FAMILY, fontSize: 9, color: K.faint }}>
        {peak}
      </div>
      <div style={{ position: 'absolute', left: L.padX, top: L.chartBottom - 12, fontFamily: FAMILY, fontSize: 9, color: K.faint }}>
        0
      </div>
      {series.map((v, i) => {
        const h = Math.round((v / peak) * chartH);
        const x = L.padX + 14 + i * (M.w - L.padX * 2 - 14) / series.length;
        if (h <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: L.chartBottom - h,
              width: barW,
              height: h,
              background: v === peak ? K.bar : K.barSoft,
              borderRadius: 1,
              transition: 'height 320ms cubic-bezier(0.22,0.61,0.36,1), top 320ms cubic-bezier(0.22,0.61,0.36,1)',
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: L.padX,
          right: L.padX,
          top: L.chartBottom,
          height: 1,
          backgroundImage: 'repeating-linear-gradient(90deg, #cdc6bc 0 3px, rgba(0,0,0,0) 3px 6px)',
        }}
      />
      <div style={{ ...cell, left: L.padX, top: L.axisY, fontSize: 10 }}>{minutes} 分钟前</div>
      <div style={{ ...cell, right: L.padX, top: L.axisY, fontSize: 10 }}>现在</div>
    </>
  );
}

/* --------------------------------------------------- Token 流速 expanded --- */

function TokenExpanded({ series, detail }: { series: number[]; detail: DetailView }) {
  const n = series.length || 1;
  const max = Math.max(1, ...series);
  const top = L.chartTop;
  const bottom = L.chartBottom;
  const w = M.w - L.padX * 2;
  const pts = series
    .map((v, i) => `${(L.padX + (i / Math.max(1, n - 1)) * w).toFixed(1)},${(bottom - (v / max) * (bottom - top)).toFixed(1)}`)
    .join(' ');
  return (
    <>
      <div style={{ ...cell, left: L.padX, top: L.statsY, fontSize: 11 }}>峰值 {compactCount(detail.tokPeak)} tok/s</div>
      <div style={{ ...cell, left: 190, top: L.statsY, fontSize: 11 }}>均值 {compactCount(detail.tokMean)} tok/s</div>
      <svg width={M.w} height={M.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        <polyline points={pts} fill="none" stroke={K.blue} strokeOpacity={0.9} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ ...cell, left: L.padX, top: L.axisY, fontSize: 10 }}>30 秒前</div>
      <div style={{ ...cell, right: L.padX, top: L.axisY, fontSize: 10 }}>现在</div>
    </>
  );
}

/* --------------------------------------------------- 后台进程 expanded --- */

function ProcsExpanded({ processes, now }: { processes: ProcessView[]; now: number }) {
  if (processes.length === 0) {
    return (
      <div style={{ position: 'absolute', left: L.padX, top: L.rowsTop, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="terminal" size={14} color={K.faint} />
        <span style={{ fontFamily: FAMILY, fontSize: 10.5, color: K.label }}>没有后台进程</span>
      </div>
    );
  }
  return (
    <>
      {processes.slice(0, 12).map((p, i) => {
        const y = L.rowsTop + i * L.rowPitch;
        return (
          <div key={p.id}>
            <div style={{ ...cell, left: L.padX, top: y, color: K.ink, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.command || p.title}
            </div>
            <div style={{ ...cell, left: 430, top: y }}>{p.status}</div>
            <div style={{ ...cell, left: 530, top: y }}>{p.startedAt != null ? relativeTime(p.startedAt, now) : '—'}</div>
            <div style={{ ...cell, left: 610, top: y }}>{p.elapsedMs != null ? formatDuration(p.elapsedMs) : '—'}</div>
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------- shell --- */

export type ExpandedCardKind = 'tools' | 'rate' | 'token' | 'processes';

export function CardsExpanded({
  kind,
  title,
  snapshot,
  now,
  onClose,
}: {
  kind: ExpandedCardKind;
  title: string;
  snapshot: {
    toolCalls: ToolCallView[];
    processes: ProcessView[];
    detail: DetailView;
    metrics: { tokSeries: number[] };
  };
  now: number;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="card-expanded"
      style={{
        position: 'absolute',
        left: M.x,
        top: M.y,
        width: M.w,
        height: M.h,
        background: K.paper,
        border: `1px solid ${K.border}`,
        borderRadius: 14,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <Header title={title} onClose={onClose} />
        {kind === 'tools' && <ToolsExpanded calls={snapshot.toolCalls} detail={snapshot.detail} now={now} />}
        {kind === 'rate' && <RateExpanded detail={snapshot.detail} now={now} />}
        {kind === 'token' && <TokenExpanded series={snapshot.metrics.tokSeries} detail={snapshot.detail} />}
        {kind === 'processes' && <ProcsExpanded processes={snapshot.processes} now={now} />}
      </div>
    </div>
  );
}

