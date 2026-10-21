import { Fragment, type ReactNode } from 'react';

/** Markdown para streaming; conserva la numeración original y las líneas continuadas. */
export function Markdown({ text, animate }: { text: string; animate: boolean }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const offsets: number[] = [];
  let pos = 0;
  for (const line of lines) { offsets.push(pos); pos += line.length + 1; }
  const nodes: ReactNode[] = [];
  const item = (line: string) => /^\s*(?:(\d+)[.)]|([-*•]))\s+(.+)$/.exec(line);
  const heading = (line: string) => /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  const table = (line: string) => line.trim().startsWith('|');
  let i = 0;
  while (i < lines.length) {
    if (!lines[i]!.trim()) { i++; continue; }
    const start = i;
    const key = offsets[start]!;
    const title = heading(lines[i]!);
    if (title) {
      nodes.push(title[1]!.length <= 2
        ? <h2 key={key}>{inline(title[2]!, key, animate)}</h2>
        : <h3 key={key}>{inline(title[2]!, key, animate)}</h3>);
      i++; continue;
    }
    if (table(lines[i]!)) {
      const rows: string[][] = [];
      while (i < lines.length && table(lines[i]!)) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      if (head) nodes.push(<div key={key} className="md-table" role="region" aria-label="Tabla / Table" tabIndex={0}>
        <table><thead><tr>{head.map((c, ci) => <th key={ci} scope="col">{inline(c, key + ci, false)}</th>)}</tr></thead>
          <tbody>{body.map((row, ri) => <tr key={ri}>{row.map((c, ci) => <td key={ci}>{inline(c, key + ri * 50 + ci, animate)}</td>)}</tr>)}</tbody></table>
      </div>);
      continue;
    }
    const first = item(lines[i]!);
    if (first) {
      const ordered = !!first[1];
      const children: ReactNode[] = [];
      while (i < lines.length) {
        const match = item(lines[i]!);
        if (!match || !!match[1] !== ordered) break;
        const at = offsets[i]!;
        let body = match[3]!;
        const value = ordered ? Number(match[1]) : undefined;
        i++;
        // Las líneas de un PDF pueden continuar sin repetir el marcador.
        while (i < lines.length && lines[i]!.trim() && !item(lines[i]!) && !heading(lines[i]!) && !table(lines[i]!)) {
          body += ' ' + lines[i]!.trim();
          i++;
        }
        children.push(<li key={at} value={value}>{inline(body, at, animate)}</li>);
        let next = i;
        while (next < lines.length && !lines[next]!.trim()) next++;
        const following = next < lines.length ? item(lines[next]!) : null;
        if (!following || !!following[1] !== ordered) break;
        i = next;
      }
      nodes.push(ordered ? <ol key={key} start={Number(first[1])}>{children}</ol> : <ul key={key}>{children}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !heading(lines[i]!) && !table(lines[i]!) && !item(lines[i]!)) {
      paragraph.push(lines[i]!); i++;
    }
    const body = paragraph.join(' ');
    nodes.push(<p key={key} className={/^\*\*[^*]+\*\*$/.test(body) ? 'md-heading' : undefined}>{inline(body, key, animate)}</p>);
  }
  return <div className="md">{nodes}</div>;
}

function inline(s: string, base: number, animate: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const part of s.split(/(\*\*[^*]+\*\*?)/)) {
    if (!part) continue;
    const bold = part.startsWith('**');
    const txt = bold ? part.replace(/\*\*/g, '') : part;
    const words = txt.split(/(\s+)/).map((w, i) => (
      /\S/.test(w) ? <span key={`${base + pos}-${i}`} className={animate ? 'w' : undefined}>{w}</span> : <Fragment key={`${base + pos}-${i}`}>{w}</Fragment>
    ));
    out.push(bold ? <strong key={base + pos}>{words}</strong> : <Fragment key={base + pos}>{words}</Fragment>);
    pos += part.length;
  }
  return out;
}
