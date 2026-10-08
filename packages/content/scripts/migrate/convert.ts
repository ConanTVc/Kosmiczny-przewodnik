import type { Chapter, Quest, Section, Step } from '../../src/schema';
import type { LocationMatch } from './locations';
import { dropRepeated, simplifyLines, simplifyNameNote, simplifyReward } from './notes';
import type { RawChapter, RawItem, RawQuest } from './parse';
import type { ChapterSource } from './sources';
import { cleanReward, foldName, normalizeCase, slugify, tidy, zeroProgress } from './text';

export interface ReportEntry {
  file: string;
  line: number;
  message: string;
  /** `review` trafia też do danych (pole review), `info` tylko do raportu. */
  level: 'review' | 'info';
}

export interface LocationUse {
  id: number;
  chapter: ChapterSource;
  /** Nazwa z solucji. */
  name: string;
  teleport?: false;
  review?: string;
}

export interface ConvertedChapter {
  chapter: Chapter;
  file: string;
  report: ReportEntry[];
  locations: LocationUse[];
  /** Do drugiego przebiegu: zadania z „Wykonać zadanie: X” jako pierwszym wymaganiem. */
  pendingRequires: { quest: Quest; sectionIndex: number; name: string; line: number }[];
}

const REQUIRES_RE = /^Wykonać zadanie:\s*(.+)$/i;
const NO_TP_RE = /^bez tp$/i;

/** Grupuje linie zadania w etapy: [tekst] → wymagania → nagrody. Tekst po nagrodzie zaczyna nowy etap. */
export function buildSteps(items: readonly RawItem[]): Step[] {
  const drafts: { req: string[]; rew: string[]; notes: string[] }[] = [];
  let cur: (typeof drafts)[number] | undefined;
  const start = () => {
    cur = { req: [], rew: [], notes: [] };
    drafts.push(cur);
    return cur;
  };
  for (const item of items) {
    if (item.kind === 'reward') {
      (cur ?? start()).rew.push(simplifyReward(cleanReward(tidy(item.text))));
    } else {
      const step = !cur || cur.rew.length > 0 ? start() : cur;
      if (item.kind === 'requirement') step.req.push(zeroProgress(tidy(item.text)));
      else step.notes.push(item.text);
    }
  }
  const seen: string[] = [];
  return drafts.flatMap((d) => {
    const note = dropRepeated(simplifyLines(d.notes), seen).join('\n').trim() || undefined;
    const req = d.req.filter(Boolean);
    const rew = d.rew.filter(Boolean);
    if (!req.length && !rew.length && !note) return [];
    return [{ requirements: req, rewards: rew, ...(note && { note }) }];
  });
}

function questName(raw: RawQuest): string {
  return normalizeCase(tidy(raw.name));
}

/** Konwertuje rozdział. `usedSlugs` jest wspólny dla wszystkich rozdziałów (slugi muszą być unikalne). */
export function convertChapter(
  source: { file: string; chapter: ChapterSource },
  raw: RawChapter,
  matches: readonly LocationMatch[],
  usedSlugs: Set<string>,
): ConvertedChapter {
  const { file, chapter: cfg } = source;
  const report: ReportEntry[] = [];
  const locations: LocationUse[] = [];
  const pendingRequires: ConvertedChapter['pendingRequires'] = [];
  const add = (line: number, message: string, level: ReportEntry['level'] = 'review') =>
    report.push({ file, line, message, level });

  for (const w of raw.warnings) add(w.line, w.message);
  if (raw.intro.length)
    add(
      raw.intro[0]!.line,
      `Tekst przed pierwszą lokacją pominięty: „${raw.intro.map((i) => i.text).join(' / ')}”`,
      'info',
    );

  const uniqueSlug = (base: string) => {
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const sections: (Section & { _line: number })[] = [];
  raw.sections.forEach((rs, i) => {
    const match = matches[i]!;
    const locId = match.id!;

    // Notatki lokacji: tekst przed pierwszym zadaniem + komentarze z nagłówka
    const textLines = rs.items.map((it) =>
      it.kind === 'text'
        ? it.text
        : `${it.kind === 'reward' ? 'Nagroda' : 'Wymagania'}: ${it.text}`,
    );
    const noTp = textLines.some((t) => NO_TP_RE.test(t.trim()));
    const notes = [
      ...rs.nameNotes.map(simplifyNameNote).filter((n): n is string => !!n),
      ...simplifyLines(textLines.filter((t) => !NO_TP_RE.test(t.trim()))),
      ...(noTp ? ['Bez teleportu.'] : []),
    ];

    const certain =
      match.method === 'literówka' || match.candidates.length <= 1 || match.nearAnchor === true;
    if (match.review) {
      add(rs.line, `Lokacja „${rs.name}”: ${match.review}`, certain ? 'info' : 'review');
    }
    locations.push({
      id: locId,
      chapter: cfg,
      name: rs.name,
      ...(noTp && { teleport: false as const }),
      ...(match.review && !certain && { review: match.review }),
    });

    const batchRequires: { quest: Quest; name: string; line: number }[] = [];
    const quests: Quest[] = rs.quests.flatMap((rq): Quest[] => {
      const name = questName(rq);
      const steps = buildSteps(rq.items);
      if (!steps.length) {
        // Pusty nagłówek bez prefiksu to zwykle dopisek autora („Teleport - Niebiańska Kuźnia”) → notatka lokacji
        if (rq.bare) notes.push(...simplifyLines([rq.name]));
        add(
          rq.line,
          `Pominięto puste zadanie „${name}” (brak wymagań i nagród)${rq.bare ? ' – nazwa trafiła do notatki lokacji' : ''}`,
          'info',
        );
        return [];
      }
      const tips = [...new Set(rq.nameNotes.map(simplifyNameNote).filter((n): n is string => !!n))];
      for (const w of rq.warnings) add(rq.line, `Zadanie „${name}”: ${w}`);
      const quest: Quest = {
        slug: uniqueSlug(`${cfg.id}/${locId}/${slugify(name, 40)}`),
        name,
        kind: rq.kind,
        steps,
        ...(tips.length > 0 && { tips: tips.join('\n') }),
        ...(rq.warnings.length > 0 && { review: [...rq.warnings] }),
      };
      const firstReq = steps[0]?.requirements[0];
      const req = firstReq ? REQUIRES_RE.exec(firstReq) : null;
      if (req) batchRequires.push({ quest, name: req[1]!.trim(), line: rq.line });
      return [quest];
    });

    const prev = sections[sections.length - 1];
    const merge = prev !== undefined && prev.locId === locId;
    const sectionIndex = merge ? sections.length - 1 : sections.length;
    for (const b of batchRequires) pendingRequires.push({ ...b, sectionIndex });
    if (merge) {
      // Kolejna sekcja tej samej lokacji – łączymy; zadania o tej samej nazwie i rodzaju scalamy w etapy.
      for (const q of quests) {
        const same = prev.quests.find(
          (p) => p.kind === q.kind && foldName(p.name) === foldName(q.name),
        );
        if (same) {
          same.steps.push(...q.steps);
          usedSlugs.delete(q.slug);
          for (const r of pendingRequires) if (r.quest === q) r.quest = same;
        } else {
          prev.quests.push(q);
        }
      }
      const note = [prev.note, ...notes].filter(Boolean).join('\n');
      if (note) prev.note = note;
      return;
    }
    sections.push({
      locId,
      ...(notes.length > 0 && { note: notes.join('\n') }),
      quests,
      _line: rs.line,
    });
  });

  const chapter: Chapter = {
    $schema: '../../schema/chapter.schema.json',
    id: cfg.id,
    title: cfg.title,
    reborn: cfg.reborn,
    ...(cfg.races && { races: cfg.races }),
    sourceCredit: { author: cfg.author },
    sections: sections.map(({ _line, ...s }) => s),
  };
  return { chapter, file, report, locations, pendingRequires };
}

/**
 * Drugi przebieg: „Wykonać zadanie: X” jako pierwsze wymaganie → requires. Szukamy X kolejno:
 * w tej samej lokacji, wcześniej w rozdziale (najbliżej), dalej w rozdziale, w innych rozdziałach.
 */
export function resolveRequires(converted: ConvertedChapter[]): void {
  const key = (s: string) => foldName(normalizeCase(s)).replace(/[.\s]+$/, '');
  for (const conv of converted) {
    const sections = conv.chapter.sections;
    for (const p of conv.pendingRequires) {
      const target = key(p.name);
      const find = (quests: readonly Quest[]) =>
        quests.find((q) => q !== p.quest && key(q.name) === target);
      let found = find(sections[p.sectionIndex]?.quests ?? []);
      for (let i = p.sectionIndex - 1; !found && i >= 0; i--) found = find(sections[i]!.quests);
      for (let i = p.sectionIndex + 1; !found && i < sections.length; i++)
        found = find(sections[i]!.quests);
      for (const other of converted) {
        if (found || other === conv) continue;
        for (const s of other.chapter.sections) found ??= find(s.quests);
      }
      // W grze długie zadania dostają kolejne części z numerem („Hakaishin IV”) – w solucji jest sama nazwa.
      const base = target.replace(/\s+(?:[ivx]+|\d+)$/, '');
      const allQuests = sections.flatMap((s) => s.quests);
      const numberedPart = base !== target && allQuests.some((q) => key(q.name) === base);
      if (found) {
        p.quest.requires = [...new Set([...(p.quest.requires ?? []), found.slug])];
      } else if (numberedPart) {
        const main = allQuests.some((q) => q.kind === 'main' && key(q.name) === base);
        conv.report.push({
          file: conv.file,
          line: p.line,
          message: `Zadanie „${p.quest.name}” wymaga „${p.name}” – to kolejna część ${main ? 'fabuły głównej' : `zadania „${normalizeCase(p.name).replace(/\s+\S+$/, '')}”`} z numerem nadawanym w grze; requires nieustawione`,
          level: 'info',
        });
      } else {
        const msg = `Nie znaleziono zadania „${p.name}” (z „Wykonać zadanie”) – requires nieustawione`;
        p.quest.review = [...(p.quest.review ?? []), msg];
        conv.report.push({
          file: conv.file,
          line: p.line,
          message: `Zadanie „${p.quest.name}”: ${msg}`,
          level: 'review',
        });
      }
    }
  }
}

const QUEST_KEY_ORDER: (keyof Quest)[] = [
  'slug',
  'name',
  'kind',
  'aliases',
  'races',
  'rebornMin',
  'rebornMax',
  'requires',
  'steps',
  'tips',
  'sourceCredit',
  'review',
];

/** Stała kolejność kluczy w zadaniach – czytelniejszy JSON przy ręcznej edycji. */
export function orderQuestKeys(chapter: Chapter): Chapter {
  return {
    ...chapter,
    sections: chapter.sections.map((s) => ({
      ...s,
      quests: s.quests.map(
        (q) =>
          Object.fromEntries(
            QUEST_KEY_ORDER.filter((k) => q[k] !== undefined).map((k) => [k, q[k]]),
          ) as Quest,
      ),
    })),
  };
}
