import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { parseMarkdown, type Block, type Inline } from '../markdown';

function renderInline(nodes: Inline[]): ComponentChildren {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={i} />;
      case 'b':
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case 'i':
        return <em key={i}>{renderInline(n.c)}</em>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'a':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {renderInline(n.c)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, i: number) {
  switch (b.t) {
    case 'h': {
      const Tag = `h${b.level + 1}` as 'h3' | 'h4' | 'h5';
      return <Tag key={i}>{renderInline(b.c)}</Tag>;
    }
    case 'p':
      return <p key={i}>{renderInline(b.c)}</p>;
    case 'ul':
      return (
        <ul key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div key={i} class="kp-table-wrap">
          <table>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j}>{renderInline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((c, k) => (
                    <td key={k}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Markdown z treści – renderowany jako elementy Preacta, bez surowego HTML. */
export function Markdown({ text, class: cls }: { text: string; class?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div class={`kp-md ${cls ?? ''}`}>{blocks.map(renderBlock)}</div>;
}
