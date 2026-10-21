import { Fragment, type ReactNode } from 'react';

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;

/**
 * Markdown mínimo (párrafos, listas, **negrita** y enlaces) pensado para streaming:
 * cada palabra lleva una clave estable según su posición, así React solo monta las palabras nuevas
 * y solo esas ejecutan la animación de entrada (efecto "aparecer" como Claude).
 */
export function Markdown({ text, animate }: { text: string; animate: boolean }) {
  let offset = 0;
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((block, bi) => {
        const start = offset;
        offset += block.length + 2;
        const lines = block.split('\n');
        const ul = lines.every((l) => /^\s*[-*] /.test(l));
        const ol = lines.every((l) => /^\s*\d+\. /.test(l));
        if (ul || ol) {
          let lo = start;
          const items = lines.map((l, li) => {
            const body = l.replace(/^\s*([-*]|\d+\.) /, '');
            const node = <li key={li}>{inline(body, lo, animate)}</li>;
            lo += l.length + 1;
            return node;
          });
          return ol ? <ol key={bi}>{items}</ol> : <ul key={bi}>{items}</ul>;
        }
        return <p key={bi}>{inline(block, start, animate)}</p>;
      })}
    </div>
  );
}

function inline(s: string, base: number, animate: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const part of s.split(/(\*\*[^*]+\*\*?)/)) {
    if (!part) continue;
    const bold = part.startsWith('**');
    const txt = bold ? part.replace(/\*\*/g, '') : part;
    const nodes = inlineText(txt, base + pos, animate);
    out.push(bold ? <strong key={base + pos}>{nodes}</strong> : <Fragment key={base + pos}>{nodes}</Fragment>);
    pos += part.length;
  }
  return out;
}

function inlineText(text: string, base: number, animate: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let offset = 0;

  const appendText = (value: string) => {
    let localOffset = 0;
    for (const [index, piece] of value.split(/(\s+)/).entries()) {
      const key = `${base + offset + localOffset}-${index}`;
      nodes.push(/\S/.test(piece)
        ? <span key={key} className={animate ? 'w' : undefined}>{piece}</span>
        : <Fragment key={key}>{piece}</Fragment>);
      localOffset += piece.length;
    }
  };

  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      const value = text.slice(cursor, start);
      appendText(value);
      offset += value.length;
    }

    const markdownLabel = match[1];
    const markdownUrl = match[2];
    const rawUrl = markdownUrl ?? match[3];
    if (!rawUrl) continue;

    if (markdownLabel) {
      const href = safeHref(rawUrl);
      if (href) nodes.push(<a key={`${base + offset}`} href={href} target="_blank" rel="noopener noreferrer">{markdownLabel}</a>);
      else appendText(match[0]);
      offset += match[0].length;
    } else {
      const visibleUrl = trimUrlPunctuation(rawUrl);
      const href = safeHref(visibleUrl);
      if (href) nodes.push(<a key={`${base + offset}`} href={href} target="_blank" rel="noopener noreferrer">{visibleUrl}</a>);
      else appendText(rawUrl);
      offset += visibleUrl.length;

      const trailing = rawUrl.slice(visibleUrl.length);
      if (trailing) {
        appendText(trailing);
        offset += trailing.length;
      }
    }
    cursor = start + match[0].length;
  }

  if (cursor < text.length) appendText(text.slice(cursor));
  return nodes;
}

function safeHref(value: string): string | undefined {
  const href = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : undefined;
  } catch {
    return undefined;
  }
}

function trimUrlPunctuation(value: string): string {
  let url = value.replace(/[.,!?;:]+$/, '');
  const pairs: [string, string][] = [['(', ')'], ['[', ']'], ['{', '}']];
  for (const [open, close] of pairs) {
    while (url.endsWith(close) && url.split(close).length > url.split(open).length) {
      url = url.slice(0, -1);
    }
  }
  return url;
}
