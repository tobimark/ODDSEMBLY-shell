import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fetchFile } from '../data/client';
import type { FilePreviewData } from '../data/types';
import { Markdown } from './markdown';

/**
 * FilePreview — the centre-well file view.
 *
 * Fills the GameView well while the nav is on 文件 mode. The reference client
 * exposes a Source/Preview switch, refuses PDFs ("PDF preview isn't supported"),
 * and labels its text cut as `# lines · first 4 MB`; those three behaviours are
 * reproduced here. The surrounding geometry is the well's measured box, not a
 * re-measured file view (no reference frame exists for that state).
 */

const MONO = "'Maple Mono CN', ui-monospace, SFMono-Regular, Menlo, monospace";
const C = {
  ink: '#241f19',
  text: '#3f3a33',
  muted: '#8e867b',
  divider: '#eae8e4',
  paper: '#fbf9f5',
  segBg: '#f2ece3',
  segBorder: '#e5dfd5',
  accent: '#d09a35',
};
const HIDE_SCROLLBAR: CSSProperties = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

const MARKDOWN_EXT = new Set(['md', 'markdown', 'mdx']);

function extensionOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(i + 1).toLowerCase();
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/** Source view: left gutter of line numbers, one scrolling column of text. */
function SourceView({ text, wrap }: { text: string; wrap: boolean }) {
  const lines = useMemo(() => text.split('\n'), [text]);
  const gutter = Math.max(2, String(lines.length).length) * 8 + 14;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: '100%', fontFamily: MONO }}>
      <div
        style={{
          flex: '0 0 auto',
          width: gutter,
          paddingTop: 10,
          paddingBottom: 14,
          textAlign: 'right',
          fontSize: 11.5,
          lineHeight: '18px',
          color: '#c3bcb0',
          userSelect: 'none',
        }}
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          margin: 0,
          padding: '10px 14px 14px 8px',
          fontSize: 11.8,
          lineHeight: '18px',
          color: C.text,
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowWrap: wrap ? 'anywhere' : 'normal',
          fontFamily: MONO,
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function Notice({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 24,
        textAlign: 'center',
        fontFamily: MONO,
      }}
    >
      <div style={{ fontSize: 12.4, color: C.muted }}>{title}</div>
      {hint && <div style={{ fontSize: 10.6, color: '#b0a89c', maxWidth: 420, lineHeight: '15px' }}>{hint}</div>}
    </div>
  );
}

export function FilePreview({
  path,
  onClose,
  width,
  height,
}: {
  path: string;
  onClose: () => void;
  width: number;
  height: number;
}) {
  const [data, setData] = useState<FilePreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [wrap, setWrap] = useState(true);
  const seq = useRef(0);

  const markdown = MARKDOWN_EXT.has(extensionOf(path));

  useEffect(() => {
    const id = seq.current + 1;
    seq.current = id;
    setLoading(true);
    setError(null);
    setData(null);
    setShowSource(false);
    void fetchFile(path)
      .then((result) => {
        if (seq.current === id) setData(result);
      })
      .catch((err) => {
        if (seq.current === id) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (seq.current === id) setLoading(false);
      });
  }, [path]);

  const canToggle = markdown && data?.kind === 'text';
  const previewMode = canToggle && !showSource;

  const body = () => {
    if (loading) return <Notice title="读取文件…" />;
    if (error) return <Notice title="无法读取这个文件" hint={error} />;
    if (!data) return <Notice title="没有可显示的内容" />;
    if (data.kind === 'pdf') {
      return <Notice title="PDF 预览暂不支持 ·" hint="可以在终端或外部程序里打开它。" />;
    }
    if (data.kind === 'binary') {
      return <Notice title="无法预览二进制文件 ·" hint={`${formatBytes(data.size)}${data.mime ? ` · ${data.mime}` : ''}`} />;
    }
    if (data.kind === 'too-large') {
      return <Notice title="文件过大，无法预览 ·" hint={`${formatBytes(data.size)}，预览上限 ${formatBytes(8 * 1024 * 1024)}`} />;
    }
    if (data.kind === 'image') {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img
            alt={basename(path)}
            src={`data:${data.mime ?? 'application/octet-stream'};base64,${data.base64 ?? ''}`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', imageRendering: 'auto' }}
          />
        </div>
      );
    }
    if (previewMode) {
      return (
        <div style={{ padding: '14px 20px 24px', fontSize: 12.2, lineHeight: '20px', color: C.text, fontFamily: MONO }}>
          <Markdown text={data.text ?? ''} />
        </div>
      );
    }
    return <SourceView text={data.text ?? ''} wrap={wrap} />;
  };

  const toggleStyle = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? C.accent : C.segBorder}`,
    background: active ? '#fdf3dd' : C.segBg,
    color: active ? '#6d4f12' : C.text,
    borderRadius: 5,
    padding: '2px 8px',
    fontSize: 10.6,
    lineHeight: '15px',
    cursor: 'pointer',
    fontFamily: MONO,
  });

  return (
    <div
      data-testid="file-preview"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        background: C.paper,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
      }}
    >
      {/* header: path + source/preview + close */}
      <div
        style={{
          flex: '0 0 auto',
          height: 38,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <span style={{ fontSize: 11.8, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {basename(path)}
        </span>
        {path !== basename(path) && (
          <span style={{ fontSize: 10.2, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}>
            {path}
          </span>
        )}
        <span style={{ flex: '1 1 auto', minWidth: 0 }} />
        {canToggle && (
          <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
            <button type="button" data-testid="file-preview-toggle" onClick={() => setShowSource(true)} style={toggleStyle(showSource)}>
              Source
            </button>
            <button type="button" data-testid="file-preview-toggle" onClick={() => setShowSource(false)} style={toggleStyle(!showSource)}>
              Preview
            </button>
          </div>
        )}
        {data?.kind === 'text' && !canToggle && (
          <button type="button" onClick={() => setWrap((value) => !value)} style={toggleStyle(wrap)} title="切换自动换行">
            {wrap ? 'Wrap' : 'No wrap'}
          </button>
        )}
        <span style={{ fontSize: 10, color: C.muted, flex: '0 0 auto' }}>{data ? formatBytes(data.size) : ''}</span>
        <button
          type="button"
          data-testid="file-preview-close"
          aria-label="关闭文件"
          onClick={onClose}
          style={{
            flex: '0 0 auto',
            width: 20,
            height: 20,
            border: 'none',
            background: 'transparent',
            color: C.muted,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '20px',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <div className="hide-scrollbar" style={{ position: 'relative', flex: '1 1 auto', overflow: 'auto', ...HIDE_SCROLLBAR }}>
        {body()}
      </div>

      {data?.truncated && (
        <div
          style={{
            flex: '0 0 auto',
            height: 22,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            borderTop: `1px solid ${C.divider}`,
            fontSize: 10,
            color: C.muted,
          }}
        >
          {data.lines ?? 0} 行 · 仅显示前 4 MB
        </div>
      )}
    </div>
  );
}
