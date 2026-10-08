import type { QuestKind } from '../../src/schema';
import { DONE_RE, classifyLine, type LineKind } from './text';

export interface RawItem {
  kind: LineKind;
  text: string;
  line: number;
}

export interface RawQuest {
  name: string;
  kind: QuestKind;
  line: number;
  /** Nagłówek bez prefiksu (sama nazwa nad „✓ Wykonane”). */
  bare: boolean;
  /** Komentarze autora wycięte z nazwy, np. „(To zadanie można wykonywać w nieskończoność)”. */
  nameNotes: string[];
  items: RawItem[];
  warnings: string[];
  /** Zadanie przeniesione z poprzedniej lokacji (sekcja zaczyna się od wymagań bez nagłówka). */
  continued?: boolean;
}

/** Wymuszona interpretacja linii. */
export type LineOverride = 'location' | 'quest' | 'requirement' | 'reward' | 'text' | 'drop';

export interface RawSection {
  name: string;
  line: number;
  /** Komentarze wycięte z nagłówka lokacji, np. „teleport po lewej stronie”, „1|6”, „S6000”. */
  nameNotes: string[];
  /** Tekst między nagłówkiem lokacji a pierwszym zadaniem. */
  items: RawItem[];
  quests: RawQuest[];
}

export interface RawChapter {
  intro: RawItem[];
  sections: RawSection[];
  warnings: { line: number; message: string }[];
}

export interface ParseOptions {
  /** Numer pierwszej linii (1-based) w pliku źródłowym – do komunikatów. */
  firstLine?: number;
  /** Wymuszona interpretacja pojedynczych linii (numer linii w pliku → rodzaj). */
  overrides?: ReadonlyMap<number, LineOverride>;
  /** Czy nazwa to znana lokacja z gry – do rozpoznania lokacji zapisanych jak zadanie. */
  isLocationName?: (name: string) => boolean;
}

const LOCATION_PREFIXED_RE = /^(?:\d+\s*\.\s*)?(?:Lokacja\s*:\s*)+(.+)$/i;
const LOCATION_NUMBERED_RE = /^\d{1,3}\s*\.\s*(\D.*)$/;
const LOCATION_GO_RE = /^(?:Udaj się(?: do)?|Udajemy się do lokacji)\s*:?\s*(.+)$/i;
/** Sam napis „Poboczne”/„Główne” nad listą zadań – to nie zadanie. */
const LABEL_ONLY_RE = /^(?:zadania\s+)?(?:poboczne|główne)$/i;

const QUEST_BRACKET_RE = /^\[([^\]]+)\]\s*»\s*(.*)$/;
const QUEST_PREFIX_RE =
  /^(Zadani[ea] główne|Główne|Poboczne|Ważne|Zadanie Codzienne|\(Zadanie Codzienne\))\s*(?:\(([^)]*)\))?\s*(?:>>|»|:|-)\s*(?:\(([^)]*)\)\s*:?\s*)?(.*)$/i;
const QUEST_STAR_RE = /^\*\s+(.+)$/;
/** „1- Sztuka Wzmacniania Treningu” – osiągnięcia w Siedzibie Mistrzów (Goku). */
const QUEST_DASH_RE = /^\d+\s*-\s+(\D.*)$/;

const DAILY_RE = /codzien|dzienne/i;
const DAILY_IN_NAME_SRC = String.raw`\s*(?:\[\s*codzienne\s*\]|\(\s*zadanie (?:codzienne|dzienne)\s*\))\s*`;
const DAILY_IN_NAME_RE = new RegExp(DAILY_IN_NAME_SRC, 'i');

function nextNonEmptyIndex(lines: readonly string[], from: number): number {
  for (let i = from; i < lines.length; i++) if (lines[i]!.trim()) return i;
  return -1;
}

/**
 * Wycina końcowe komentarze w nawiasach z nazwy. Dla lokacji także nawiasy kwadratowe
 * (`[1|6]` – portal, `[H70000]` – wymagany poziom); w nazwach zadań `[LV2]`/`[III]` zostają.
 */
export function splitNameNotes(
  raw: string,
  squareBrackets = false,
): { name: string; notes: string[] } {
  const notes: string[] = [];
  let name = raw.trim();
  const re = squareBrackets ? /^(.*\S)\s*[([]([^()[\]]*)[)\]]\s*$/ : /^(.*\S)\s*\(([^()]*)\)\s*$/;
  for (;;) {
    const m = re.exec(name);
    if (!m) break;
    notes.unshift(m[2]!.trim());
    name = m[1]!.trim();
  }
  return { name, notes: notes.filter(Boolean) };
}

function questKind(tag: string, name: string): QuestKind {
  if (/główne/i.test(tag)) return 'main';
  if (DAILY_RE.test(tag) || DAILY_IN_NAME_RE.test(name)) return 'daily';
  if (/bez końca/i.test(tag) || /nieskończoność/i.test(name)) return 'repeatable';
  return 'side';
}

function makeQuest(tag: string, rawName: string, line: number, bare: boolean): RawQuest {
  const kind = questKind(tag, rawName);
  const cleaned = rawName.replace(new RegExp(DAILY_IN_NAME_SRC, 'gi'), ' ').trim();
  const { name, notes } = splitNameNotes(cleaned);
  if (/^ważne$/i.test(tag)) notes.unshift('Ważne zadanie.');
  if (kind === 'repeatable' && !notes.some((n) => /nieskończoność/i.test(n)))
    notes.push('Zadanie można powtarzać.');
  return {
    name: name || '(bez nazwy)',
    kind,
    line,
    bare,
    nameNotes: notes,
    items: [],
    warnings: [],
  };
}

/** Rozpoznaje nagłówek zadania z jawnym prefiksem. */
export function matchQuestHeader(text: string): { tag: string; name: string } | undefined {
  const b = QUEST_BRACKET_RE.exec(text);
  if (b) return { tag: b[1]!, name: b[2]! };
  const p = QUEST_PREFIX_RE.exec(text);
  if (p) return { tag: [p[1], p[2], p[3]].filter(Boolean).join(' '), name: p[4]! };
  const s = QUEST_STAR_RE.exec(text);
  if (s) return { tag: '', name: s[1]! };
  const d = QUEST_DASH_RE.exec(text);
  if (d) return { tag: '', name: d[1]! };
  return undefined;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('pl') === b.toLocaleLowerCase('pl');

/** Parsuje solucję w formacie kopii dziennika gry. */
export function parseSolution(lines: readonly string[], options: ParseOptions = {}): RawChapter {
  const { firstLine = 1, overrides = new Map(), isLocationName = () => false } = options;
  const chapter: RawChapter = { intro: [], sections: [], warnings: [] };
  let section: RawSection | undefined;
  let quest: RawQuest | undefined;
  /** Ostatnie zadanie w rozdziale – do kontynuacji w kolejnej lokacji. */
  let lastQuest: RawQuest | undefined;
  const warn = (line: number, message: string) => chapter.warnings.push({ line, message });

  const openSection = (rawName: string, line: number) => {
    const { name, notes } = splitNameNotes(rawName, true);
    section = { name, line, nameNotes: notes, items: [], quests: [] };
    chapter.sections.push(section);
    quest = undefined;
  };
  const openQuest = (q: RawQuest) => {
    if (!section) {
      warn(q.line, `Zadanie „${q.name}” przed pierwszą lokacją – pominięte`);
      quest = undefined;
      return;
    }
    // Ten sam nagłówek drugi raz w tej lokacji (np. po kontynuacji) – to samo zadanie
    const existing = section.quests.find((x) => x.kind === q.kind && sameName(x.name, q.name));
    quest = existing ?? q;
    if (!existing) section.quests.push(q);
    lastQuest = quest;
  };
  /** Linia po „✓ Wykonane” pod linią `idx` zaczyna kolejne zadanie (a nie wymagania). */
  const questFollowsDone = (idx: number) => {
    const done = nextNonEmptyIndex(lines, idx + 1);
    const after = done < 0 ? -1 : nextNonEmptyIndex(lines, done + 1);
    if (after < 0) return false;
    const t = lines[after]!.trim();
    const afterNext = nextNonEmptyIndex(lines, after + 1);
    return (
      !!matchQuestHeader(t) ||
      (classifyLine(t).kind === 'text' && afterNext >= 0 && DONE_RE.test(lines[afterNext]!))
    );
  };

  lines.forEach((rawLine, idx) => {
    const line = firstLine + idx;
    const text = rawLine.trim();
    if (!text || DONE_RE.test(text)) return;
    const nextIdx = nextNonEmptyIndex(lines, idx + 1);
    const nextIsDone = nextIdx >= 0 && DONE_RE.test(lines[nextIdx]!);
    const cls = classifyLine(text);
    const forced = overrides.get(line);

    if (forced === 'drop') return;
    if (forced === 'location') return openSection(text, line);
    if (forced === 'quest') return openQuest(makeQuest('', text, line, true));

    if (!forced) {
      // Nagłówek lokacji
      const prefixed = LOCATION_PREFIXED_RE.exec(text);
      if (prefixed) return openSection(prefixed[1]!, line);
      const numbered = LOCATION_NUMBERED_RE.exec(text);
      if (numbered && cls.kind === 'text' && !nextIsDone && !matchQuestHeader(numbered[1]!)) {
        return openSection(numbered[1]!, line);
      }
      const go = LOCATION_GO_RE.exec(text);
      if (go && nextIsDone) return openSection(go[1]!, line);
      // Hborn: nazwa lokacji nad „✓ Wykonane”, a pod nią od razu kolejne zadanie
      if (
        nextIsDone &&
        cls.kind === 'text' &&
        isLocationName(splitNameNotes(text, true).name) &&
        questFollowsDone(idx)
      ) {
        return openSection(text, line);
      }

      if (LABEL_ONLY_RE.test(text)) return;
      // Nagłówek zadania. „✓ Wykonane” pod linią wymagań/nagrody to śmieć z kopiowania – pomijamy.
      const header = matchQuestHeader(text);
      if (header) return openQuest(makeQuest(header.tag, header.name, line, false));
      if (nextIsDone && cls.kind === 'text') return openQuest(makeQuest('', text, line, true));
    }

    const kind = forced ?? cls.kind;
    const item: RawItem = { kind, text: forced ? text : cls.text, line };

    // Powtórzona nazwa zadania pod nagłówkiem
    if (kind === 'text' && quest && sameName(item.text, quest.name)) return;
    // Nagroda urwana przecinkiem i dokończona w następnej linii
    const prev = quest?.items[quest.items.length - 1];
    if (kind !== 'requirement' && prev?.kind === 'reward' && prev.text.endsWith(',')) {
      prev.text = `${prev.text} ${item.text}`;
      return;
    }

    if (quest) {
      quest.items.push(item);
    } else if (section && kind !== 'text' && lastQuest) {
      // Wymagania/nagrody zaraz po nagłówku lokacji = to samo zadanie kontynuowane w nowej lokacji
      const cont: RawQuest = {
        ...lastQuest,
        line,
        nameNotes: [],
        items: [item],
        warnings: [],
        continued: true,
      };
      section.quests.push(cont);
      quest = cont;
      lastQuest = cont;
    } else if (section) {
      section.items.push(item);
    } else {
      chapter.intro.push(item);
    }
  });

  return chapter;
}
