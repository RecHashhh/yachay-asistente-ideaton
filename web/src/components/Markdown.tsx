import { Fragment, type ReactNode } from 'react';

/**
 * Markdown mínimo (párrafos, listas, **negrita**) pensado para streaming:
 * cada palabra lleva una clave estable según su posición, así React solo monta las palabras nuevas
 * y solo esas ejecutan la animación de entrada (efecto "aparecer" como Claude).
 */
export function Markdown({ text, animate }: { text: string; animate: boolean }) {
  let offset = 0;
  // Títulos "### Sección" de los documentos: bloque propio en negrita (no se muestran los #).
  const blocks = text.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t#]*$/gm, (_, h: string) => `\n\n**${h.replace(/\*\*/g, '')}**\n\n`).trim().split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((block, bi) => {
        const start = offset;
        offset += block.length + 2;
        const lines = block.split('\n');
        // Tabla: todas las líneas empiezan con "|" (horarios, puntajes, costos de los documentos oficiales).
        if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|'))) {
          const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
          const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map(cells);
          const [head, ...body] = rows;
          return (
            <div key={bi} className="md-table" role="region" aria-label="Tabla" tabIndex={0}>
              <table>
                <thead><tr>{head!.map((c, i) => <th key={i} scope="col">{inline(c, start + i, false)}</th>)}</tr></thead>
                <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, start + ri * 50 + ci, animate)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
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
    const words = txt.split(/(\s+)/).map((w, i) => (
      /\S/.test(w) ? <span key={`${base + pos}-${i}`} className={animate ? 'w' : undefined}>{w}</span> : <Fragment key={`${base + pos}-${i}`}>{w}</Fragment>
    ));
    out.push(bold ? <strong key={base + pos}>{words}</strong> : <Fragment key={base + pos}>{words}</Fragment>);
    pos += part.length;
  }
  return out;
}
