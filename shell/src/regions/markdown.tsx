/**
 * Minimal markdown renderer for assistant messages.
 *
 * The panel is 384 px wide inside a frozen 412 px frame, so this deliberately
 * supports only what a coding agent actually emits — fenced code, inline code,
 * bold/italic, headings, lists, blockquotes and rules — and renders everything
 * else as pre-wrapped text. No HTML is ever injected: the whole tree is React
 * elements built from strings, so model output cannot introduce markup.
 *
 * Incomplete syntax (an unterminated fence while a message is still streaming)
 * renders as code to the end of the text instead of flickering back to prose.
 */
import type { CSSProperties, ReactNode } from 'react';

const MONO = "'Maple Mono CN', 'Cromma Sans', monospace";

const C = {
  body: '#3b352d',
  muted: '#8a8176',
  codeBg: '#f7f2ea',
  codeBorder: '#ece3d5',
  codeInk: '#46403a',
  inlineBg: '#f4eee4',
  quote: '#8a6a2f',
} as const;

const P: CSSProperties = { margin: '0 0 6px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' };

/** Inline spans: `code`, **bold**, *italic*. Unterminated markers stay literal. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;
    if (token.startsWith('`')) {
      out.push(
        <code
          key={key}
          style={{
            fontFamily: MONO,
            fontSize: 12,
            lineHeight: '17px',
            background: C.inlineBg,
            border: `1px solid ${C.codeBorder}`,
            borderRadius: 3,
            padding: '0 3px',
            color: C.codeInk,
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={key} style={{ fontWeight: 600, color: '#2f2a23' }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <em key={key} style={{ fontStyle: 'italic' }}>
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; lang: string; lines: string[] }
  | { kind: 'hr' };

function parse(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const pushPara = (line: string) => {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.kind === 'p') prev.lines.push(line);
    else blocks.push({ kind: 'p', lines: [line] });
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // closing fence
      blocks.push({ kind: 'code', lang, lines: body });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', lines: quote });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    pushPara(line);
    i += 1;
  }
  return blocks;
}

function renderBlock(block: Block, index: number, caret = false): ReactNode {
  const key = `b${index}`;
  const caretNode = caret ? (
    <span key="caret" style={{ color: '#d09a35', marginLeft: 1 }}>
      ▍
    </span>
  ) : null;
  switch (block.kind) {
    case 'code':
      return (
        <pre
          key={key}
          style={{
            margin: '4px 0 8px',
            padding: '6px 8px',
            background: C.codeBg,
            border: `1px solid ${C.codeBorder}`,
            borderRadius: 5,
            fontFamily: MONO,
            fontSize: 11.6,
            lineHeight: '16px',
            color: C.codeInk,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            maxWidth: '100%',
          }}
        >
          {block.lines.join('\n')}
          {caretNode}
        </pre>
      );
    case 'h': {
      const size = block.level <= 2 ? 13.6 : block.level === 3 ? 13.2 : 12.9;
      return (
        <div
          key={key}
          style={{ margin: '8px 0 4px', fontFamily: MONO, fontSize: size, fontWeight: 600, lineHeight: '19px', color: '#2f2a23' }}
        >
          {inline(block.text, key)}
        </div>
      );
    }
    case 'ul':
      return (
        <div key={key} style={{ margin: '2px 0 6px' }}>
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, ...P, margin: '0 0 2px' }}>
              <span style={{ flex: 'none', color: C.muted }}>·</span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{inline(item, `${key}-${i}`)}</span>
            </div>
          ))}
        </div>
      );
    case 'ol':
      return (
        <div key={key} style={{ margin: '2px 0 6px' }}>
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, ...P, margin: '0 0 2px' }}>
              <span style={{ flex: 'none', color: C.muted, minWidth: 14 }}>{i + 1}.</span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{inline(item, `${key}-${i}`)}</span>
            </div>
          ))}
        </div>
      );
    case 'quote':
      return (
        <div
          key={key}
          style={{
            margin: '4px 0 8px',
            paddingLeft: 8,
            borderLeft: `2px solid ${C.codeBorder}`,
            color: C.quote,
            ...P,
          }}
        >
          {inline(block.lines.join('\n'), key)}
        </div>
      );
    case 'hr':
      return <div key={key} style={{ height: 1, background: C.codeBorder, margin: '8px 0' }} />;
    default:
      return (
        <div key={key} style={P}>
          {inline(block.lines.join('\n'), key)}
          {caretNode}
        </div>
      );
  }
}

export function Markdown({ text, caret = false }: { text: string; caret?: boolean }) {
  const blocks = parse(text);
  return <>{blocks.map((block, index) => renderBlock(block, index, caret && index === blocks.length - 1))}</>;
}
