/**
 * lib/mini-markdown.tsx
 *
 * A deliberately tiny Markdown renderer for `content/*.md` (no dependency).
 * Supports: # / ## / ### headings, > blockquotes, "- " bullet lists,
 * paragraphs, **bold**, *italic* and [text](url) links. Anything else is
 * shown as plain text. Output is built from React elements (never raw HTML),
 * so content cannot inject markup.
 */
import type { ReactNode } from "react";

/**
 * Converts inline Markdown (bold, italic, links) within one line to React nodes.
 *
 * @param text A single line or paragraph of text.
 * @returns React nodes for the line.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={m.index}>{m[2]}</em>);
    else out.push(<a key={m.index} href={m[4]}>{m[3]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renders a Markdown string as React elements.
 *
 * @param source The Markdown text.
 * @returns An array of block-level React elements.
 */
export function renderMarkdown(source: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      blocks.push(<Tag key={i}>{inline(line.replace(/^#+\s+/, ""))}</Tag>);
      i++;
    } else if (line.startsWith("> ")) {
      blocks.push(
        <div className="notice" key={i}>
          <p>{inline(line.slice(2))}</p>
        </div>,
      );
      i++;
    } else if (line.startsWith("- ")) {
      const items: ReactNode[] = [];
      const start = i;
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(<li key={i}>{inline(lines[i].slice(2))}</li>);
        i++;
      }
      blocks.push(<ul key={start}>{items}</ul>);
    } else {
      const start = i;
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|> |- )/.test(lines[i])) {
        parts.push(lines[i]);
        i++;
      }
      blocks.push(<p key={start}>{inline(parts.join(" "))}</p>);
    }
  }
  return blocks;
}
