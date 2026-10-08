import type { BuiltContent, BuiltQuest } from '@kp/content';
import { markdownToText } from './markdown';

export type SearchKind = 'location' | 'quest' | 'reward' | 'requirement' | 'note' | 'guide';

export const SEARCH_KINDS: [SearchKind, string][] = [
  ['location', 'Lokacje'],
  ['quest', 'Zadania'],
  ['reward', 'Nagrody'],
  ['requirement', 'Wymagania'],
  ['note', 'Wskazówki'],
  ['guide', 'Poradniki'],
];

export interface SearchEntry {
  kind: SearchKind;
  /** Oryginalny tekst (do wyświetlenia). */
  text: string;
  /** Tekst do porównań – tej samej długości co `text`, więc pozycje trafień się zgadzają. */
  folded: string;
  quest?: BuiltQuest;
  step?: number;
  locId?: number;
  guideSlug?: string;
}

export interface SearchHit extends SearchEntry {
  /** Zakres najdłuższego dopasowanego słowa w `text` – do podświetlenia. */
  start: number;
  end: number;
}

const PL: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

/** Małe litery, bez polskich znaków; każdy znak zamieniany na jeden znak – długość bez zmian. */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const mapped = PL[lower] ?? lower;
    out += mapped.length === ch.length ? mapped : ch;
  }
  return out;
}

const entry = (e: Omit<SearchEntry, 'folded'>): SearchEntry => ({ ...e, folded: fold(e.text) });

/** Buduje indeks wyszukiwania (raz po wczytaniu treści). */
export function buildSearchIndex(content: BuiltContent): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const usedLocs = new Set(content.quests.flatMap((q) => [q.locId, ...(q.alsoAt ?? [])]));
  for (const l of content.locations) {
    if (usedLocs.has(l.id)) entries.push(entry({ kind: 'location', text: l.name, locId: l.id }));
  }
  for (const q of content.quests) {
    entries.push(entry({ kind: 'quest', text: q.name, quest: q, locId: q.locId }));
    q.steps.forEach((s, step) => {
      for (const r of s.requirements)
        entries.push(entry({ kind: 'requirement', text: r, quest: q, step, locId: q.locId }));
      for (const r of s.rewards)
        entries.push(entry({ kind: 'reward', text: r, quest: q, step, locId: q.locId }));
      if (s.note) {
        for (const line of s.note.split('\n')) {
          entries.push(
            entry({ kind: 'note', text: markdownToText(line), quest: q, step, locId: q.locId }),
          );
        }
      }
    });
    if (q.tips)
      entries.push(entry({ kind: 'note', text: markdownToText(q.tips), quest: q, locId: q.locId }));
  }
  for (const g of content.guides) {
    entries.push(entry({ kind: 'guide', text: g.title, guideSlug: g.slug }));
    for (const line of g.body.split('\n')) {
      const text = markdownToText(line);
      if (text) entries.push(entry({ kind: 'guide', text, guideSlug: g.slug }));
    }
  }
  return entries;
}

/**
 * Szuka wpisów zawierających wszystkie słowa zapytania (bez polskich znaków, bez wielkości
 * liter). `accept` zawęża wyniki (np. do zadań postaci).
 */
export function search(
  index: readonly SearchEntry[],
  query: string,
  accept: (e: SearchEntry) => boolean = () => true,
): SearchHit[] {
  const tokens = fold(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!tokens.length) return [];
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0]!;
  const hits: SearchHit[] = [];
  for (const e of index) {
    if (!tokens.every((t) => e.folded.includes(t)) || !accept(e)) continue;
    const start = e.folded.indexOf(longest);
    hits.push({ ...e, start, end: start + longest.length });
  }
  return hits;
}
