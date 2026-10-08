import type { Race, Reborn } from '../../src/schema';
import type { LineOverride } from './parse';
import { BOM_RE } from './text';

export interface ChapterSource {
  id: string;
  title: string;
  reborn: Reborn;
  /** Brak = wspólny dla wszystkich ras (od Gborn w górę). */
  races?: Race[];
  author: string;
  /** Linia, od której zaczyna się ten rozdział w pliku (sama linia jest pomijana). */
  startsAt?: RegExp;
}

export interface SolutionSource {
  /** Ścieżka względem katalogu głównego repo. */
  file: string;
  /** Linie metadanych do pominięcia (podpisy, odsyłacze). */
  skip: RegExp[];
  chapters: ChapterSource[];
  /** Ręczna interpretacja linii, których reguły nie rozpoznają (numer linii w pliku). */
  overrides?: Record<number, LineOverride>;
}

/** Nonborn i Rborn są osobne dla każdej rasy, od Gborn fabuła jest wspólna. */
export const SOLUTIONS: SolutionSource[] = [
  {
    file: 'solucje/Goku.txt',
    skip: [/^\{\\rtf1\}/, /^N-Born$/i, /^Solucja Goku by/i, /^Dalsza część dostępna w solucji/i],
    chapters: [
      { id: 'goku-n', title: 'Nonborn – Goku', reborn: 0, races: [0], author: 'BaronCorbin' },
      {
        id: 'goku-r',
        title: 'Rborn – Goku',
        reborn: 1,
        races: [0],
        author: 'BaronCorbin',
        startsAt: /^Solucja R-Born$/i,
      },
    ],
  },
  {
    file: 'solucje/Cumber.txt',
    skip: [/^Solucja Cumber by/i],
    overrides: { 25: 'reward', 191: 'quest' },
    chapters: [
      { id: 'cumber-n', title: 'Nonborn – Cumber', reborn: 0, races: [7], author: 'Naruto' },
      {
        id: 'cumber-r',
        title: 'Rborn – Cumber',
        reborn: 1,
        races: [7],
        author: 'Naruto',
        startsAt: /^R-born Cumber/i,
      },
    ],
  },
  {
    file: 'solucje/Gborn.txt',
    skip: [],
    chapters: [{ id: 'gborn', title: 'Gborn', reborn: 2, author: '' }],
  },
  {
    file: 'solucje/Uborn.txt',
    skip: [],
    chapters: [{ id: 'uborn', title: 'Uborn', reborn: 3, author: '' }],
    overrides: { 939: 'location' },
  },
  {
    file: 'solucje/Sborn.txt',
    skip: [],
    chapters: [{ id: 'sborn', title: 'Sborn', reborn: 4, author: '' }],
  },
  {
    file: 'solucje/Hborn.txt',
    skip: [],
    chapters: [{ id: 'hborn', title: 'Hborn', reborn: 5, author: '' }],
  },
  {
    file: 'solucje/Mborn.txt',
    skip: [],
    chapters: [{ id: 'mborn', title: 'Mborn', reborn: 6, author: '' }],
  },
];

export const LOCATIONS_LIST = 'solucje/lista_wszystkich_lokacji.txt';
export const FIXTURE_TELEPORTS = 'fixtures/tp_list.html';

export interface SourceText {
  chapter: ChapterSource;
  /** Linie rozdziału (bez pominiętych – zastąpione pustymi, żeby zachować numerację). */
  lines: string[];
  /** Numer pierwszej linii w pliku (1-based). */
  firstLine: number;
}

/** Dzieli plik na rozdziały wg `startsAt` i czyści metadane. Numery linii zostają jak w pliku. */
export function splitChapters(source: SolutionSource, text: string): SourceText[] {
  const all = text.replace(BOM_RE, '').replace(/\r\n?/g, '\n').split('\n');
  const cleaned = all.map((l) => (source.skip.some((re) => re.test(l.trim())) ? '' : l));
  const result: SourceText[] = [];
  let start = 0;
  source.chapters.forEach((chapter, i) => {
    const nextStart = source.chapters[i + 1]?.startsAt;
    let end = cleaned.length;
    if (nextStart) {
      const found = cleaned.findIndex((l, idx) => idx >= start && nextStart.test(l.trim()));
      if (found < 0)
        throw new Error(
          `${source.file}: nie znaleziono początku rozdziału ${source.chapters[i + 1]!.id}`,
        );
      end = found;
    }
    const lines = cleaned.slice(start, end);
    if (chapter.startsAt) lines[0] = '';
    result.push({ chapter, lines, firstLine: start + 1 });
    start = end;
  });
  return result;
}
