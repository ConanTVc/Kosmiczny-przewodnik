/**
 * Mały parser Markdown → drzewo. Obsługuje to, czego używa treść: nagłówki, akapity
 * (pojedynczy enter = nowa linia), listy, tabele, **pogrubienie**, *kursywa*, `kod`, linki http(s).
 * Wynik renderuje Preact jako zwykły tekst – surowy HTML z treści nigdy nie trafia na stronę.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'br' };

export type Block =
  | { t: 'h'; level: 2 | 3 | 4; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

const SAFE_URL_RE = /^https?:\/\/[^\s]+$/i;

/** Tekst inline: kolejność ma znaczenie – kod, link, pogrubienie, kursywa. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'code', v: m[1] });
    else if (m[2] !== undefined) {
      const href = m[3]!;
      // Tylko http(s) – „javascript:” i inne schematy zostają zwykłym tekstem.
      out.push(
        SAFE_URL_RE.test(href) ? { t: 'a', href, c: parseInline(m[2]) } : { t: 'text', v: m[0] },
      );
    } else if (m[4] !== undefined) out.push({ t: 'b', c: parseInline(m[4]) });
    else if (m[5] !== undefined) out.push({ t: 'i', c: parseInline(m[5]) });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

function withBreaks(lines: string[]): Inline[] {
  return lines.flatMap((line, i) => [
    ...(i ? [{ t: 'br' } as const] : []),
    ...parseInline(line.trim()),
  ]);
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: withBreaks(para) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(4, Math.max(2, heading[1]!.length)) as 2 | 3 | 4;
      blocks.push({ t: 'h', level, c: parseInline(heading[2]!) });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flush();
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*[-*]\s+/, '')));
        i++;
      }
      i--;
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (trimmed.startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(trimmed);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(cells(lines[i]!));
        i++;
      }
      i--;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Zwykły tekst (do wyszukiwania i podglądu). */
export function markdownToText(src: string): string {
  return src
    .replace(/[#*`|]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
