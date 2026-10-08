import type {
  BuiltChapter,
  BuiltGuide,
  BuiltLocation,
  BuiltQuest,
  Chapter,
  Location,
  Quest,
} from './schema';
import type { ValidContent } from './validate';

export interface BuiltContent {
  locations: BuiltLocation[];
  chapters: BuiltChapter[];
  quests: BuiltQuest[];
  guides: BuiltGuide[];
}

function withoutReview({ review: _review, ...loc }: Location): BuiltLocation {
  return loc;
}

const nameKey = (locId: number, name: string) =>
  `${locId}|${name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl')}`;

/**
 * Część lokacji Nonborna/Rborna jest wspólna dla kilku ras (np. Pałac Wszechmogącego, Głębia).
 * Zwraca klucze (lokacja + nazwa) zadań pobocznych z takich lokacji, które opisała tylko jedna
 * rasa – te pokazujemy wszystkim rasom. Gdy kilka ras opisało to samo zadanie, każda zostaje przy
 * swoim opisie (bez dublowania).
 */
function sharedQuestsForAllRaces(chapters: readonly Chapter[]): Set<string> {
  const raceSets = new Map<number, Set<string>>();
  for (const ch of chapters) {
    if (!ch.races) continue;
    for (const s of ch.sections) {
      const set = raceSets.get(s.locId) ?? new Set<string>();
      set.add(JSON.stringify([...ch.races].sort()));
      raceSets.set(s.locId, set);
    }
  }
  const owners = new Map<string, Set<string>>();
  for (const ch of chapters) {
    if (!ch.races) continue;
    for (const s of ch.sections) {
      if ((raceSets.get(s.locId)?.size ?? 0) < 2) continue;
      for (const q of s.quests) {
        if (q.kind === 'main') continue;
        const key = nameKey(s.locId, q.name);
        owners.set(key, (owners.get(key) ?? new Set()).add(ch.id));
      }
    }
  }
  return new Set([...owners].filter(([, chs]) => chs.size === 1).map(([key]) => key));
}

/**
 * Spłaszcza zwalidowaną treść do formatu dla klientów: zadania dostają locId, rozdział, numer
 * lokacji oraz odziedziczone rasy, reborn i autora. Do wyniku trafiają tylko lokacje używane
 * w rozdziałach. Kolejność jest stabilna (jak w plikach źródłowych), więc build jest powtarzalny.
 */
export function buildContent(content: ValidContent): BuiltContent {
  const quests: BuiltQuest[] = [];
  const chapters: BuiltChapter[] = [];
  const usedLocIds = new Set<number>();
  const forAllRaces = sharedQuestsForAllRaces(content.chapters.map((c) => c.chapter));

  const raceFor = (q: Quest, chapter: Chapter, locId: number) => {
    if (q.races) return q.races;
    if (q.kind !== 'main' && forAllRaces.has(nameKey(locId, q.name))) return undefined;
    return chapter.races;
  };

  for (const { chapter } of content.chapters) {
    const sections: BuiltChapter['sections'] = chapter.sections.map((section, i) => {
      usedLocIds.add(section.locId);
      const order = i + 1;
      for (const q of section.quests) {
        q.alsoAt?.forEach((id) => usedLocIds.add(id));
        const races = raceFor(q, chapter, section.locId);
        quests.push({
          slug: q.slug,
          name: q.name,
          kind: q.kind,
          ...(q.aliases && { aliases: q.aliases }),
          locId: section.locId,
          ...(q.alsoAt && { alsoAt: q.alsoAt }),
          chapter: chapter.id,
          order,
          ...(races && { races }),
          rebornMin: q.rebornMin ?? chapter.reborn,
          ...(q.rebornMax !== undefined && { rebornMax: q.rebornMax }),
          ...(q.requires && { requires: q.requires }),
          steps: q.steps,
          ...(q.tips && { tips: q.tips }),
          sourceCredit: q.sourceCredit ?? chapter.sourceCredit,
        });
      }
      return {
        order,
        locId: section.locId,
        ...(section.note && { note: section.note }),
        quests: section.quests.map((q) => q.slug),
      };
    });
    chapters.push({
      id: chapter.id,
      title: chapter.title,
      reborn: chapter.reborn,
      ...(chapter.races && { races: chapter.races }),
      sourceCredit: chapter.sourceCredit,
      ...(chapter.intro && { intro: chapter.intro }),
      sections,
    });
  }

  const locations = content.locations.locations
    .filter((l) => usedLocIds.has(l.id))
    .map(withoutReview)
    .sort((a, b) => a.id - b.id);

  const guides: BuiltGuide[] = content.guides.guides.map((g) => ({
    slug: g.slug,
    title: g.title,
    tags: g.tags,
    sourceCredit: g.sourceCredit,
    body: (content.guideBodies[g.file] ?? '').trim(),
  }));

  return { locations, chapters, quests, guides };
}
