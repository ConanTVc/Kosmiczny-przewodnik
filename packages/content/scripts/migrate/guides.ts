import type { GuideMeta } from '../../src/schema';
import { simplifyLine } from './notes';
import { BOM_RE, DONE_RE, classifyLine, tidy } from './text';

export interface GuideSource {
  meta: GuideMeta;
  /** Plik źródłowy do konwersji; brak = plik markdown pisany ręcznie (np. odczytany ze zrzutów). */
  source?: string;
  convert?: (text: string) => string;
}

function lines(text: string): string[] {
  return text
    .replace(BOM_RE, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());
}

/** „Koszt struktur klanowych”: grupy struktur → tabele poziomów. */
export function convertClanCosts(text: string): string {
  const out: string[] = [];
  let table: 'full' | 'short' | null = null;
  for (const l of lines(text).slice(1)) {
    if (!l) continue;
    const full = /^LvL\s*(\d+)\s*:\s*Koszt\s*([\d ]+)\s*KP,\s*Suma:\s*([\d ]+)\s*KP$/i.exec(l);
    const short = /^LvL\s*(\d+)\s*-\s*([\d ]+)\s*KP$/i.exec(l);
    const total = /^Całość:\s*([\d ]+)\s*KP$/i.exec(l);
    if (full) {
      if (table !== 'full') out.push('', '| Poziom | Koszt | Suma |', '| --- | --- | --- |');
      table = 'full';
      out.push(`| ${full[1]} | ${full[2]!.trim()} KP | ${full[3]!.trim()} KP |`);
    } else if (short) {
      if (table !== 'short') out.push('', '| Poziom | Koszt |', '| --- | --- |');
      table = 'short';
      out.push(`| ${short[1]} | ${short[2]!.trim()} KP |`);
    } else if (total) {
      out.push('', `**Razem:** ${total[1]!.trim()} KP`);
      table = null;
    } else {
      out.push('', `## ${l.replace(/:$/, '')}`);
      table = null;
    }
  }
  return `${out.join('\n').trim()}\n`;
}

const REBORN_HEADER_RE = /^(?:#+\s*)?(Non|R|G|U|S|H|M)[- ]?born$/i;
const REBORN_TITLES: Record<string, string> = {
  non: 'Nonborn',
  r: 'Rborn',
  g: 'Gborn',
  u: 'Uborn',
  s: 'Sborn',
  h: 'Hborn',
  m: 'Mborn',
};

/** „Zadania codzienne”: reborn → lokacja → zadanie z listą wymagań i nagród. */
export function convertDailyQuests(text: string): string {
  const src = lines(text);
  const out: string[] = [];
  const next = (i: number) => src.slice(i + 1).find((l) => l) ?? '';
  let afterLocation = false;

  src.forEach((l, i) => {
    if (!l || DONE_RE.test(l)) return;
    const reborn = REBORN_HEADER_RE.exec(l);
    if (reborn) {
      out.push('', `## ${REBORN_TITLES[reborn[1]!.toLowerCase()]}`);
      afterLocation = false;
      return;
    }
    const loc =
      /^Lokacja\s*:\s*(.+)$/i.exec(l) ?? (DONE_RE.test(next(i)) ? /^\*\*(.+)\*\*$/.exec(l) : null);
    if (loc) {
      out.push('', `### ${tidy(loc[1]!).replace(/\s*->\s*/g, ' → ')}`);
      afterLocation = true;
      return;
    }
    const cls = classifyLine(l);
    const star = /^\*\s+(.+)$/.exec(l);
    const bareQuest =
      cls.kind === 'text' &&
      (DONE_RE.test(next(i)) || (afterLocation && classifyLine(next(i)).kind !== 'text'));
    if (star || bareQuest) {
      out.push('', `#### ${tidy(star ? star[1]! : l)}`, '');
      afterLocation = false;
      return;
    }
    afterLocation = false;
    if (!cls.text) return;
    if (cls.kind === 'reward') {
      const za = /^Za\s+([\d\s]+)\s+Nagroda/i.exec(l);
      out.push(`- **Nagroda${za ? ` za ${za[1]!.trim()}` : ''}:** ${tidy(cls.text)}`);
    } else if (cls.kind === 'requirement') {
      out.push(`- ${tidy(cls.text)}`);
    } else {
      const simple = simplifyLine(cls.text);
      if (simple) out.push(`- ${simple}`);
    }
  });
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export const GUIDES: GuideSource[] = [
  {
    meta: {
      slug: 'koszty-struktur-klanowych',
      title: 'Koszty struktur klanowych',
      tags: ['klan', 'struktury', 'KP'],
      sourceCredit: { author: '' },
      file: 'koszty-struktur-klanowych.md',
    },
    source: 'poradniki/Koszty Struktur klanowych.txt',
    convert: convertClanCosts,
  },
  {
    meta: {
      slug: 'zadania-codzienne',
      title: 'Zadania codzienne',
      tags: ['codzienne', 'zadania'],
      sourceCredit: { author: '' },
      file: 'zadania-codzienne.md',
    },
    source: 'poradniki/zadania codzienne/Zadania Codzienne.txt',
    convert: convertDailyQuests,
  },
  {
    meta: {
      slug: 'skrzynie',
      title: 'Tajemne Skrzynie – zawartość',
      tags: ['skrzynie', 'przedmioty', 'Tajemna Skrzynia'],
      sourceCredit: { author: '' },
      file: 'skrzynie.md',
    },
  },
];
