import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Icon } from '../svg/Icon';
import { FileIcon, FILE_ICON_EXT } from '../svg/fileIcons';
import { useNow, useWorkbench, useWorkbenchActions } from '../data/store';
import { compactCount, formatDuration } from '../data/format';
import {
  fetchFiles,
  fetchProjects,
  postAddProject,
  postRemoveProject,
  postSelectProject,
} from '../data/client';
import type { FileEntry, ProjectList } from '../data/types';

/**
 * Sidebar — pixel replica of the CrommaCode left rail.
 *
 * Every number below is a MEASURED value: native px from the 2906x1730 capture
 * divided by 2, then offset to be relative to the sidebar root (client-relative
 * y minus 49).  See docs/region-sidebar.md for the full element table.
 *
 * Text is the app's real font, 'Maple Mono CN' 400 (loaded by styles.css).
 * Text boxes are positioned by ORIGIN: `left`/`top` are the coordinates where
 * the glyph run starts (ascender line), not where its ink starts.  The offsets
 * were derived by rendering each string with the real TTF at 2x and measuring
 * the resulting ink, so baselines land within ~0.5 native px.
 *
 * Icons come from the app's own assets:
 *   - `../svg/Icon`      the 16x16 UI icon theme (uiIcons.ts) — outline icons
 *   - `../svg/fileIcons` the 16x16 colour file-type bitmaps recovered from the
 *                        reference frame (1 bitmap px == 1 logical px)
 * The only hand-drawn glyph left is the bee (no such asset exists).
 */

const INK = '#1a150f';
const MUTED = '#8e867b';
const PILL_TEXT = '#766f65';
const FILE_TEXT = '#59534a';
const CHEVRON = '#d2c9bc';

/** bee glyph — no matching asset in the icon table; traced from a 10x zoom. */
const BEE = (
  <svg viewBox="0 0 15 15" width={15} height={17.5} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
    <g fill="none" stroke="#dfddda" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.4 2.5 3.9 1.1" />
      <path d="M9.6 2.5 11.1 1.1" />
      <path d="M7.5 2.3c2.3 0 3.6 1.7 3.6 4.2 0 3-1.6 5.3-3.6 5.3S3.9 9.5 3.9 6.5c0-2.5 1.3-4.2 3.6-4.2Z" />
      <path d="M4.1 6.5c-1.6-.5-3-.1-3.3 1-.3 1.2 1 2.2 2.7 2.4" />
      <path d="M10.9 6.5c1.6-.5 3-.1 3.3 1 .3 1.2-1 2.2-2.7 2.4" />
      <path d="M4.5 8h6" />
      <path d="M5.1 10.4h4.8" />
    </g>
  </svg>
);

/* -------------------------------------------------------------- geometry */
/**
 * File rows: 56 native (28 logical) pitch, measured from the reference.
 *
 * The row BOXES are still the measured ones (icon 16x16 at x16/top+8, text at
 * x38/top+6, 210px clip); only the *contents* are now data-bound: the tree below
 * renders the real workspace through `GET /api/fs/list` instead of the nine
 * names that happened to be in the reference frame.
 */

/** Per-artwork icon offset, derived from the ink centres measured for the eight
 *  recovered bitmaps (`fileIcons.tsx` keeps every artwork ink top-aligned, while
 *  the app centres the INK on the 28px row: dy = 8 − inkCentre). */
const KIND_DY: Record<string, number> = {
  python: 0, // ink rows 1..14, centre 8
  json: 2, // ink rows 1..10, centre 6
  image: 0,
  svg: 0,
  video: 2,
  xlsx: 0,
  html: 1, // ink rows 1..12, centre 7
  md: 4, // ink rows 1..6, centre 4
};

/** Icon kind + vertical nudge for one file name (bitmap types only). */
function fileKind(name: string): { kind: string | undefined; dy: number } {
  const i = name.lastIndexOf('.');
  const kind = i < 0 ? undefined : FILE_ICON_EXT[name.slice(i + 1).toLowerCase()];
  return { kind, dy: kind ? KIND_DY[kind] ?? 0 : 0 };
}

/** Thin, invisible scrollbar (the sidebar must not grow an OS scrollbar). */
const HIDE_SCROLLBAR: CSSProperties = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

type TreeRow =
  | { kind: 'entry'; entry: FileEntry; depth: number }
  | { kind: 'pending'; path: string; depth: number };

/* pill icon sizes: measured ink 28x28 / 24x28 / 28x25 native.  Sizes below
 * reproduce those boxes (15 / 14.5 / 15); 14.5 / 14 / 14 was tried and scored
 * worse because it also moves the ink inside the box.
 * Labels are data-bound (session age / cumulative tokens / tool calls); the
 * icon+size and the flex cell sizing are untouched. */
const PILLS: { icon: string; size: number }[] = [
  { icon: 'clock', size: 15 },
  { icon: 'bolt', size: 14.5 },
  { icon: 'bot', size: 15 },
];

const CHIPS: { left: number; icon: string; size: number; iconLeft: number; iconTop: number; label: string; textLeft: number }[] = [
  { left: 8, icon: 'chart-bar', size: 15, iconLeft: 14.5, iconTop: 8.5, label: '统计', textLeft: 32.5 },
  { left: 92.5, icon: 'bulb', size: 14.5, iconLeft: 14.75, iconTop: 8.25, label: '意见', textLeft: 32.5 },
  { left: 177.5, icon: 'settings', size: 15, iconLeft: 14, iconTop: 8.5, label: '设置', textLeft: 32 },
];

const abs = (left: number, top: number, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left,
  top,
  ...extra,
});

/**
 * a text run placed by its glyph-run origin (measured — see docs).
 *
 * `top` came from `ref ink top − PIL ink offset`, where PIL positions the
 * baseline with the *integer* FT ascent (round(2.04·fontSize) native) while
 * Chromium uses the exact hhea ascent (1.02·fontSize).  For every size used
 * here the integer ascent rounds up, so the raw origins sit ~0.2 logical px too
 * high; TOP_FIX compensates.
 */
const TOP_FIX = 0.2;

/**
 * The native renderer lays the same glyphs down with ~25% more ink coverage
 * than Chromium's grayscale AA (measured: mean luminance inside every glyph
 * box is 5..10 levels darker in the reference for *all* sidebar text).  A
 * hairline text-stroke reproduces that stem darkening.
 */
const EMBOLDEN = '0.28px currentColor';

const txt = (left: number, top: number, size: number, color: string, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left,
  top: top + TOP_FIX,
  fontSize: size,
  lineHeight: 'normal',
  color,
  whiteSpace: 'pre',
  fontFamily: "'Maple Mono CN', monospace",
  fontWeight: 400,
  WebkitTextStroke: EMBOLDEN,
  ...extra,
});

/* ------------------------------------------------------- data bindings --- */
/* The sidebar only swaps *strings* into already measured origins; the widths
 * below are the measured boxes, so every dynamic string is clipped by a pixel
 * budget first (Maple Mono CN: ASCII 0.6em, CJK 1.2em). */

/** Maple Mono CN advance in em: ASCII 0.6, CJK/full-width 1.2 (measured TTF). */
function advanceEm(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6);
  return wide ? 1.2 : 0.6;
}

function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += advanceEm(ch);
  return em * size;
}

/** End-truncate to a pixel budget (same `…` policy as format.ts#truncateEnd,
 *  but width-aware because real Windows paths may contain CJK). */
function clipToPx(text: string, maxPx: number, size: number): string {
  if (textWidth(text, size) <= maxPx) return text;
  let w = textWidth('…', size);
  let out = '';
  for (const ch of text) {
    const cw = advanceEm(ch) * size;
    if (w + cw > maxPx) break;
    out += ch;
    w += cw;
  }
  return out ? `${out}…` : '…';
}

/** Last path segment of the workspace directory (`D:\a\b` -> `b`). */
function dirBasename(dir: string | null): string | null {
  if (!dir) return null;
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/** Badge 1 (`1分` style): active session age, at most 3 glyphs. */
function ageLabel(createdAt: number | null, now: number): string {
  if (createdAt == null) return '—';
  const min = Math.floor(Math.max(0, now - createdAt) / 60000);
  if (min < 60) return `${min}分`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天`;
  return `${Math.min(99, Math.floor(days / 30))}月`;
}

/** Badge counters: `compactCount` bounded to the pill's ~5-glyph text room. */
function compactBadge(n: number): string {
  const s = compactCount(n);
  if ([...s].length <= 5) return s;
  return Number.isFinite(n) && n > 0 ? `${Math.round(n / 1e12)}T` : '0';
}

export function Sidebar(): ReactElement {
  const snapshot = useWorkbench();
  const actions = useWorkbenchActions();
  // 30 s tick is enough for a minute-resolution badge; avoids 1 Hz churn here.
  const now = useNow(30_000);
  const projectName = dirBasename(snapshot.projectDirectory) ?? 'test';
  const projectPath = snapshot.projectDirectory ?? 'C:\\Program Files\\Po';
  const session = snapshot.sessions.find((s) => s.id === snapshot.activeSessionId) ?? null;

  /* ------------------------------------------------------------ file tree */
  /* One directory per request (`GET /api/fs/list?path=`), cached by relative
   * path; expanding a folder fetches it once. `.` is the workspace root. */
  const [tree, setTree] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [rootLoading, setRootLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const loadDir = useCallback(async (path: string) => {
    try {
      const result = await fetchFiles(path);
      setTree((prev) => ({ ...prev, [path]: result.entries }));
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setTree({});
    setExpanded(new Set());
    setTreeError(null);
    setRootLoading(true);
    void loadDir('.').finally(() => setRootLoading(false));
  }, [snapshot.projectDirectory, loadDir]);

  const toggleDir = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      if (!tree[path]) void loadDir(path);
    },
    [tree, loadDir],
  );

  /** Open the file in the centre well (文件 mode); `@` insertion is the picker's job. */
  const openFile = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent('kunlun:open-file', { detail: { path } }));
  }, []);

  const rows = useMemo<TreeRow[]>(() => {
    const out: TreeRow[] = [];
    const walk = (path: string, depth: number) => {
      const entries = tree[path];
      if (!entries) {
        out.push({ kind: 'pending', path, depth });
        return;
      }
      for (const entry of entries) {
        out.push({ kind: 'entry', entry, depth });
        if (entry.type === 'directory' && expanded.has(entry.path)) walk(entry.path, depth + 1);
        if (out.length >= 400) return;
      }
    };
    walk('.', 0);
    return out;
  }, [tree, expanded]);

  /* -------------------------------------------------------------- projects */
  /* The list is the curated one from `.state/projects.json` — never OpenCode's
   * 22 discovered directories. The active project is shown by the row above. */
  const [projects, setProjects] = useState<ProjectList | null>(null);
  const [projectMenu, setProjectMenu] = useState(false);
  const [projectAdd, setProjectAdd] = useState(false);
  const [projectDraft, setProjectDraft] = useState('');
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState<string | null>(null);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch {
      setProjects(null);
    }
  }, []);

  useEffect(() => {
    void reloadProjects();
  }, [reloadProjects, snapshot.projectDirectory]);

  const switchProject = useCallback(
    async (path: string) => {
      setProjectBusy(path);
      setProjectError(null);
      try {
        await postSelectProject(path);
        setProjectMenu(false);
        window.dispatchEvent(new CustomEvent('kunlun:project-changed'));
        await reloadProjects();
      } catch (err) {
        setProjectError(err instanceof Error ? err.message : String(err));
      } finally {
        setProjectBusy(null);
      }
    },
    [reloadProjects],
  );

  const addProject = useCallback(async () => {
    const target = projectDraft.trim();
    if (!target) return;
    setProjectBusy('__add__');
    setProjectError(null);
    try {
      const list = await postAddProject(target);
      setProjects(list);
      setProjectAdd(false);
      setProjectDraft('');
      // Adding only puts it in the list; the user picks when to switch.
      setProjectMenu(true);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectBusy(null);
    }
  }, [projectDraft]);

  const forgetProject = useCallback(async (path: string) => {
    try {
      setProjects(await postRemoveProject(path));
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err));
    }
  }, []);


  const pillLabels = [
    ageLabel(session?.createdAt ?? null, now),
    compactBadge(snapshot.metrics.tokensTotal),
    compactBadge(snapshot.metrics.counts.calls),
  ];
  const pillTitles = [
    session
      ? `会话时长 ${formatDuration(now - session.createdAt)}`
      : '会话时长：无活动会话',
    `累计 tokens ${snapshot.metrics.tokensTotal}`,
    `工具调用数 ${snapshot.metrics.counts.calls}`,
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 49,
        width: 265,
        height: 802.5,
        background: '#f6f1ea',
        borderRight: '1px solid #eae8e4',
        overflow: 'hidden',
        fontFamily: "'Maple Mono CN', monospace",
      }}
    >
      {/* ------------------------------------------------ 「项目」 header */}
      <div style={txt(15.5, 9.5, 13, MUTED)}>项目</div>
      <div style={abs(209.75, 11.83)}>
        <Icon name="chevron-down" size={13.75} color={CHEVRON} />
      </div>
      <div style={abs(231.5, 10.375)}>
        <Icon name="folder-plus" size={16} color={MUTED} />
      </div>

      {/* project interactions: chevron/row open the list, folder-plus adds */}
      <button
        type="button"
        data-testid="project-menu-button"
        aria-label="项目列表"
        aria-expanded={projectMenu}
        onClick={() => {
          setProjectMenu((value) => !value);
          setProjectAdd(false);
          setProjectError(null);
        }}
        style={{ position: 'absolute', left: 203, top: 5, width: 26, height: 26, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', zIndex: 22 }}
      />
      <button
        type="button"
        data-testid="project-add-button"
        aria-label="添加项目"
        title="添加项目（绝对路径）"
        onClick={() => {
          setProjectAdd(true);
          setProjectMenu(false);
          setProjectError(null);
        }}
        style={{ position: 'absolute', left: 226, top: 4, width: 26, height: 26, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', zIndex: 22 }}
      />

      {/* ---------------------------------------------------- project row */}
      <div style={abs(15.5, 48.875)}>
        <Icon name="folder" size={16} color={MUTED} />
      </div>
      <div style={txt(37.5, 47, 15, INK)}>{clipToPx(projectName, 176, 15)}</div>
      <div style={abs(232, 49)}>
        <Icon name="plus" size={16} color={MUTED} />
      </div>

      {/* the row (name) switches project; the + creates a session here */}
      <button
        type="button"
        data-testid="project-row"
        aria-label="切换项目"
        aria-expanded={projectMenu}
        onClick={() => {
          setProjectMenu((value) => !value);
          setProjectAdd(false);
          setProjectError(null);
        }}
        style={{ position: 'absolute', left: 8, top: 43, width: 216, height: 28, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', zIndex: 22 }}
      />
      <button
        type="button"
        data-testid="project-new-session"
        aria-label="在当前项目新建会话"
        title="在当前项目新建会话"
        onClick={() => void actions.createSession()}
        style={{ position: 'absolute', left: 226, top: 44, width: 24, height: 26, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', zIndex: 22 }}
      />

      {/* --------------------------------------------------- project card */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: 75,
          width: 248,
          height: 96,
          background: '#fffdfb',
          border: '1px solid #edebe8',
          borderRadius: 10,
        }}
      >
        {/* path row: 45° "/" hatch.  Measured along both axes: 22 native period
            (9 dark #e8e8e6 + 11 light #f6f6f4 + 2 edge px) => 7.78 logical px
            perpendicular.  Phase: dark bands are centred on (x+y) ≡ 6 (mod 22)
            native, which in this box's local u/v is t ≡ 1.414 (mod 7.78), hence
            the split stop positions below. */}
        <div
          style={{
            position: 'absolute',
            left: 4,
            top: 4,
            width: 238,
            height: 28,
            borderRadius: 4,
            backgroundImage:
              'repeating-linear-gradient(135deg, #e8e8e6 0 3.36px, #f6f6f4 3.36px 7.6px, #e8e8e6 7.6px 7.78px)',
            overflow: 'hidden',
          }}
        >
          {/* white chip that carries the dark project glyph */}
          <div
            style={{
              position: 'absolute',
              left: 7.5,
              top: 3.5,
              width: 20,
              height: 20,
              background: '#fffdfb',
              borderRadius: 4.5,
              boxShadow: '0 0 2px rgba(26,21,15,0.06)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 5.5,
                top: 4.5,
                width: 10,
                height: 12,
                border: `2.5px solid ${INK}`,
                borderRadius: 1.5,
              }}
            />
          </div>

          {/* path text — the app truncates it with a right-hand fade mask */}
          <div
            style={{
              position: 'absolute',
              left: 33.5,
              top: 4,
              width: 172,
              height: 20,
              overflow: 'hidden',
              WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 147px, rgba(0,0,0,0) 165.5px)',
              maskImage: 'linear-gradient(to right, #000 0, #000 147px, rgba(0,0,0,0) 165.5px)',
            }}
          >
            <div style={txt(0.44, 0, 15, '#141414', { letterSpacing: '-0.06px', WebkitTextStroke: '0.45px currentColor' })}>{clipToPx(projectPath, 171, 15)}</div>
          </div>

          {/* project index */}
          <div style={txt(214, 5.5, 13.5, '#4f4f4e')}>01</div>
        </div>

        {/* metric pills — the icon and the label are nudged apart from the plain
            flex-centre position because the app centres each artwork's INK, not
            its 16x16 box (measured ink boxes in docs/region-sidebar.md §4).  The
            nudges must stay on the children: moving the pill itself would drag
            its border and fill along with it. */}
        <div style={{ position: 'absolute', left: 4, top: 38, width: 238, height: 20, display: 'flex', gap: 4.5 }}>
          {PILLS.map(({ icon, size }, i) => (
            <div
              key={i}
              title={pillTitles[i]}
              style={{
                flex: 1,
                height: 20,
                background: '#fffdfb',
                border: '1px solid #edebe8',
                borderRadius: 4,
                boxShadow: '0 1px 2px rgba(26,21,15,0.055)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4.5,
              }}
            >
              <Icon
                name={icon}
                size={size}
                color={MUTED}
                style={{ transform: `translateX(${[1, 0.5, 0][i]}px)` }}
              />
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 'normal',
                  color: PILL_TEXT,
                  whiteSpace: 'pre',
                  fontFamily: "'Maple Mono CN', monospace",
                  WebkitTextStroke: EMBOLDEN,
                  transform: `translateX(${[-0.5, -0.5, -1.5][i]}px)`,
                }}
              >
                {pillLabels[i]}
              </div>
            </div>
          ))}
        </div>

        {/* dashed rule between the metrics and the bee row: 2 logical px on /
            3 off, starting 4 logical px inside the content box */}
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: 64,
            width: 227,
            height: 1,
            backgroundImage: 'linear-gradient(to right, #dfddda 0 2px, transparent 2px 5px)',
            backgroundSize: '5px 1px',
          }}
        />

        {/* six bee slots — measured pitch 38.2, first centre at client x 36 */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={abs(19.5 + 38.2 * i, 72.5)}>
            {BEE}
          </div>
        ))}
      </div>

      {/* chrome notch: a 9x9 chrome-coloured circle centred on the card's right
          edge at client y 189.25 — measured native x 516..525, y 383..400 (the
          visible part is the left half; the right half merges into the sidebar
          background).  Looks like the card's drag/hover affordance. */}
      <div
        style={{
          position: 'absolute',
          left: 251.5,
          top: 184.75,
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: '#f6f1ea',
        }}
      />

      {/* -------------------------------------- divider + 「文件」 header */}
      <div style={{ position: 'absolute', left: 16, top: 181, width: 231.5, height: 1, background: '#e5e0d9' }} />
      <div style={txt(16, 197, 13, MUTED)}>文件</div>
      <div style={abs(209.75, 199.33)}>
        <Icon name="chevron-down" size={13.75} color={CHEVRON} />
      </div>
      <div style={abs(232, 198)}>
        <Icon name="search" size={16} color={MUTED} />
      </div>

      {/* -------------------------------------------------------- file rows */}
      <div
        className="hide-scrollbar"
        data-testid="file-tree"
        style={{
          position: 'absolute',
          left: 0,
          top: 222,
          width: 265,
          height: 492,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...HIDE_SCROLLBAR,
        }}
      >
        {rootLoading && rows.length === 0 && <div style={txt(38, 8, 13, MUTED)}>读取文件…</div>}
        {!rootLoading && !treeError && rows.length === 0 && <div style={txt(38, 8, 13, MUTED)}>工作区为空</div>}
        {treeError && (
          <div
            title={treeError}
            style={txt(16, 8, 12, '#b4553f', { width: 232, overflow: 'hidden' })}
          >
            无法读取：{clipToPx(treeError, 208, 12)}
          </div>
        )}

        {rows.map((row, i) => {
          if (row.kind === 'pending') {
            return (
              <div key={`pending:${row.path}`} style={{ position: 'relative', height: 28 }}>
                <div style={txt(38 + row.depth * 14, 6, 13, '#b0a89c')}>读取中…</div>
              </div>
            );
          }

          const { entry, depth } = row;
          const isDir = entry.type === 'directory';
          const name = entry.path.split(/[\\/]/).filter(Boolean).pop() ?? entry.path;
          const isOpen = expanded.has(entry.path);
          const iconLeft = 16 + depth * 14;
          const textLeft = 38 + depth * 14;
          const width = Math.max(60, 210 - depth * 14);
          const { kind, dy } = isDir ? { kind: undefined, dy: 0 } : fileKind(name);
          const hasBitmap = kind != null;

          return (
            <div
              key={entry.path}
              onClick={() => (isDir ? toggleDir(entry.path) : openFile(entry.path))}
              style={{ position: 'relative', height: 28, cursor: 'pointer' }}
              onMouseEnter={() => setHovered(entry.path)}
              onMouseLeave={() => setHovered((h) => (h === entry.path ? null : h))}
            >
              {/* hover wash (the reference has no hover state; this is the
                  minimum affordance an interactive row needs) */}
              <div
                data-testid={isDir ? 'tree-dir' : 'tree-file'}
                data-path={entry.path}
                title={entry.path}
                style={{
                  position: 'absolute',
                  left: 8,
                  right: 9,
                  top: 2,
                  height: 24,
                  borderRadius: 5,
                  background: hovered === entry.path ? '#efe8dd' : 'transparent',
                  pointerEvents: 'none',
                }}
              />

              {isDir ? (
                <div style={abs(iconLeft, 8)}>
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={13} color={CHEVRON} />
                </div>
              ) : (
                <div style={abs(iconLeft, 8 + dy)}>
                  {hasBitmap ? <FileIcon name={name} size={16} /> : <Icon name="file" size={16} color={MUTED} />}
                </div>
              )}

              <div
                style={txt(textLeft, 6, 15, isDir ? INK : FILE_TEXT, {
                  width,
                  overflow: 'hidden',
                  letterSpacing: /[\u3000-\u9fff\uff00-\uffef]/.test(name) ? '-0.15px' : '-0.085px',
                })}
              >
                {clipToPx(name, width - 2, 15)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------ bottom chips */}
      {CHIPS.map(({ left, icon, size, iconLeft, iconTop, label, textLeft }) => (
        <div
          key={label}
          style={{ position: 'absolute', left, top: 721, width: 78.5, height: 32, background: '#f2ece3', borderRadius: 5 }}
        >
          <div style={abs(iconLeft, iconTop)}>
            <Icon name={icon} size={size} color={MUTED} />
          </div>
          <div style={txt(textLeft, 7, 13, PILL_TEXT)}>{label}</div>
        </div>
      ))}

      {/* ------------------------------------------------- project list menu */}
      {projectMenu && (
        <>
          <div
            data-testid="project-menu-backdrop"
            onMouseDown={() => setProjectMenu(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'transparent' }}
          />
          <div
            data-testid="project-menu"
            role="menu"
            aria-label="项目列表"
            className="hide-scrollbar"
            style={{
              position: 'absolute',
              left: 8,
              top: 30,
              width: 248,
              maxHeight: 344,
              overflowY: 'auto',
              ...HIDE_SCROLLBAR,
              background: '#fffdfb',
              border: '1px solid #e5dfd5',
              borderRadius: 10,
              boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
              zIndex: 46,
              padding: '4px 0 2px',
              fontFamily: "'Maple Mono CN', monospace",
            }}
          >
            <div style={{ padding: '2px 10px 4px', fontSize: 9.6, color: MUTED, letterSpacing: 0.3 }}>
              已添加的项目 · 点击切换
            </div>

            {(projects?.projects.length ?? 0) === 0 && (
              <div style={{ padding: '4px 10px 8px', fontSize: 10.4, color: MUTED, lineHeight: '15px' }}>
                还没有添加项目。点右上角的文件夹图标，填一个绝对路径。
              </div>
            )}

            {projects?.projects.map((project) => {
              const busy = projectBusy === project.path;
              return (
                <div key={project.path} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="project-item"
                    data-path={project.path}
                    disabled={busy || !project.exists}
                    onClick={() => void switchProject(project.path)}
                    style={{
                      display: 'block',
                      width: '100%',
                      border: 'none',
                      textAlign: 'left',
                      background: project.current ? '#faf5ec' : 'transparent',
                      padding: '6px 26px 7px 10px',
                      cursor: project.exists ? 'pointer' : 'default',
                      opacity: project.exists ? 1 : 0.55,
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 11.8, color: INK }}>
                      <span style={{ fontWeight: project.current ? 600 : 400 }}>{project.name}</span>
                      {project.current && <span style={{ fontSize: 8.8, color: '#b4813a' }}>当前</span>}
                      {!project.exists && <span style={{ fontSize: 8.8, color: '#b4553f' }}>目录不存在</span>}
                      {busy && <span style={{ fontSize: 8.8, color: MUTED }}>切换中…</span>}
                    </div>
                    <div
                      style={{
                        fontSize: 9.4,
                        color: MUTED,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 1,
                      }}
                    >
                      {project.path}
                    </div>
                  </button>
                  <button
                    type="button"
                    data-testid="project-remove"
                    aria-label="从列表移除"
                    title="从列表移除（不会删除目录）"
                    onClick={() => void forgetProject(project.path)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: 8,
                      width: 18,
                      height: 18,
                      border: 'none',
                      background: 'transparent',
                      color: MUTED,
                      cursor: 'pointer',
                      fontSize: 12,
                      lineHeight: '18px',
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {projectError && projectMenu && (
              <div style={{ padding: '4px 10px 6px', fontSize: 9.8, color: '#b4553f', lineHeight: '14px' }}>{projectError}</div>
            )}
          </div>
        </>
      )}

      {/* -------------------------------------------------- add project form */}
      {projectAdd && (
        <>
          <div
            data-testid="project-add-backdrop"
            onMouseDown={() => setProjectAdd(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'transparent' }}
          />
          <div
            data-testid="project-add-dialog"
            style={{
              position: 'absolute',
              left: 8,
              top: 30,
              width: 248,
              background: '#fffdfb',
              border: '1px solid #e5dfd5',
              borderRadius: 10,
              boxShadow: '0 10px 24px rgba(70,60,45,0.16)',
              zIndex: 46,
              padding: '8px 10px 10px',
              fontFamily: "'Maple Mono CN', monospace",
            }}
          >
            <div style={{ fontSize: 10.6, color: INK, marginBottom: 6 }}>添加项目目录</div>
            <input
              data-testid="project-path-input"
              autoFocus
              value={projectDraft}
              onChange={(event) => setProjectDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addProject();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setProjectAdd(false);
                }
              }}
              placeholder="D:\path\to\project"
              spellCheck={false}
              style={{
                width: '100%',
                height: 26,
                boxSizing: 'border-box',
                border: '1px solid #e5dfd5',
                borderRadius: 6,
                background: '#fffdfb',
                padding: '0 8px',
                fontFamily: 'inherit',
                fontSize: 11,
                color: INK,
                outline: 'none',
              }}
            />
            {projectError && (
              <div style={{ marginTop: 5, fontSize: 9.8, color: '#b4553f', lineHeight: '14px' }}>{projectError}</div>
            )}
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
              <button
                type="button"
                data-testid="project-add-confirm"
                disabled={projectBusy === '__add__'}
                onClick={() => void addProject()}
                style={{
                  border: '1px solid #e5dfd5',
                  borderRadius: 6,
                  background: projectBusy === '__add__' ? '#f2ece3' : '#fdf3dd',
                  color: '#6d4f12',
                  fontSize: 10.4,
                  lineHeight: '18px',
                  padding: '2px 9px',
                  cursor: projectBusy === '__add__' ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {projectBusy === '__add__' ? '添加中…' : '添加'}
              </button>
              <span style={{ fontSize: 9, color: MUTED }}>只支持已存在的目录</span>
            </div>
          </div>
        </>
      )}

      {/* ----------------------------------------------------- login button */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: 759,
          width: 248,
          height: 28,
          background: '#fffdfb',
          border: '1px solid #dedbd9',
          borderRadius: 8,
          boxShadow: '0 2px 4px rgba(26,21,15,0.07)',
        }}
      >
        <div style={txt(104.5, 3, 15, INK)}>登录</div>
      </div>
    </div>
  );
}
