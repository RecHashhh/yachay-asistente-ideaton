import { Fragment, type ReactNode } from 'react';

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;

/** Renderizador Markdown pequeño y seguro, compatible con texto que llega por streaming. */
export function Markdown({ text, animate }: { text: string; animate: boolean }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const at = (n: number) => lines[n] ?? '';
  const blocks: ReactNode[] = [];
  let i = 0;
  let sourceOffset = 0;

  while (i < lines.length) {
    const line = at(i);
    const start = sourceOffset;
    if (!line.trim()) { sourceOffset += line.length + 1; i++; continue; }

    const fence = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (fence) {
      const marker = fence[1]?.[0];
      const code: string[] = [];
      sourceOffset += line.length + 1;
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(at(i))) {
        code.push(at(i)); sourceOffset += at(i).length + 1; i++;
      }
      if (i < lines.length) { sourceOffset += at(i).length + 1; i++; }
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(<Tag key={start}>{inline(heading[2] ?? '', start + line.indexOf(heading[2] ?? ''), animate)}</Tag>);
      sourceOffset += line.length + 1; i++; continue;
    }

    if (i + 1 < lines.length && isTableSeparator(at(i + 1)) && line.includes('|')) {
      const rows = [splitRow(line)];
      sourceOffset += line.length + 1; i += 2; sourceOffset += at(i - 1).length + 1;
      while (i < lines.length && at(i).includes('|') && at(i).trim()) {
        rows.push(splitRow(at(i))); sourceOffset += at(i).length + 1; i++;
      }
      const headers = rows.shift() ?? [];
      blocks.push(<div className="md-table-wrap" key={start}><table><thead><tr>{headers.map((cell, ci) => <th key={ci}>{inline(cell, start, animate)}</th>)}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci}>{inline(row[ci] ?? '', start, animate)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const listMatch = line.match(/^\s{0,3}([-*+] |\d+[.)] )/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1] ?? '');
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = at(i).match(/^\s{0,3}([-*+] |\d+[.)] )(.*)$/);
        if (!item || /^\d/.test(item[1] ?? '') !== ordered) break;
        items.push(<li key={i}>{inline(item[2] ?? '', sourceOffset + at(i).indexOf(item[2] ?? ''), animate)}</li>);
        sourceOffset += at(i).length + 1; i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={start}>{items}</Tag>);
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quote: ReactNode[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(at(i))) {
        const body = at(i).replace(/^\s{0,3}> ?/, '');
        quote.push(<p key={i}>{inline(body, sourceOffset, animate)}</p>);
        sourceOffset += at(i).length + 1; i++;
      }
      blocks.push(<blockquote key={start}>{quote}</blockquote>);
      continue;
    }

    const paragraph = [line];
    sourceOffset += line.length + 1; i++;
    while (i < lines.length && at(i).trim() && !isBlockStart(lines, i)) {
      paragraph.push(at(i)); sourceOffset += at(i).length + 1; i++;
    }
    blocks.push(<p key={start}>{inline(paragraph.join('\n'), start, animate)}</p>);
  }
  return <div className="md">{blocks}</div>;
}

function isBlockStart(lines: string[], i: number) {
  const at = (n: number) => lines[n] ?? '';
  return /^\s{0,3}(#{1,6}\s|```|~~~|>|[-*+] |\d+[.)] )/.test(at(i)) ||
    (i + 1 < lines.length && at(i).includes('|') && isTableSeparator(at(i + 1)));
}
function isTableSeparator(line: string) { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line); }
function splitRow(line: string) { return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()); }

function inline(s: string, base: number, animate: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let cursor = 0;
  for (const match of s.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) out.push(...inlineText(s.slice(cursor, start), base + cursor, animate));
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6] ?? '';
    const children = match[4] !== undefined ? value : inlineText(value, base + start, animate);
    const node = match[1] !== undefined || match[2] !== undefined ? <strong>{children}</strong>
      : match[3] !== undefined ? <del>{children}</del>
        : match[4] !== undefined ? <code>{value}</code> : <em>{children}</em>;
    out.push(<Fragment key={base + start}>{node}</Fragment>);
    cursor = start + match[0].length;
  }
  if (cursor < s.length) out.push(...inlineText(s.slice(cursor), base + cursor, animate));
  return out;
}

function inlineText(text: string, base: number, animate: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) appendWords(nodes, text.slice(cursor, start), base + cursor, animate);
    const label = match[1];
    const rawUrl = match[2] ?? match[3];
    if (!rawUrl) continue;
    const visibleUrl = label ? rawUrl : trimUrlPunctuation(rawUrl);
    const href = safeHref(visibleUrl);
    if (href) nodes.push(<a key={base + start} href={href} target="_blank" rel="noopener noreferrer">{label ?? visibleUrl}</a>);
    else appendWords(nodes, match[0], base + start, animate);
    if (!label) appendWords(nodes, rawUrl.slice(visibleUrl.length), base + start + visibleUrl.length, animate);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) appendWords(nodes, text.slice(cursor), base + cursor, animate);
  return nodes;
}
function appendWords(nodes: ReactNode[], value: string, base: number, animate: boolean) {
  let offset = 0;
  for (const [index, piece] of value.split(/(\s+)/).entries()) {
    nodes.push(/\S/.test(piece) ? <span key={`${base + offset}-${index}`} className={animate ? 'w' : undefined}>{piece}</span> : <Fragment key={`${base + offset}-${index}`}>{piece}</Fragment>);
    offset += piece.length;
  }
}
function safeHref(value: string): string | undefined {
  const href = /^www\./i.test(value) ? `https://${value}` : value;
  try { const url = new URL(href); return url.protocol === 'http:' || url.protocol === 'https:' ? href : undefined; }
  catch { return undefined; }
}
function trimUrlPunctuation(value: string): string {
  let url = value.replace(/[.,!?;:]+$/, '');
  for (const [open = '', close = ''] of [['(', ')'], ['[', ']'], ['{', '}']])
    while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
  return url;
}
