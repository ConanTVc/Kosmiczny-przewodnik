import type { BuiltChapter, BuiltGuide, BuiltLocation, BuiltQuest, Location } from './schema';
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

/**
 * Spłaszcza zwalidowaną treść do formatu dla klientów: zadania dostają locId, rozdział, numer
 * lokacji oraz odziedziczone rasy, reborn i autora. Do wyniku trafiają tylko lokacje używane
 * w rozdziałach. Kolejność jest stabilna (jak w plikach źródłowych), więc build jest powtarzalny.
 */
export function buildContent(content: ValidContent): BuiltContent {
  const quests: BuiltQuest[] = [];
  const chapters: BuiltChapter[] = [];
  const usedLocIds = new Set<number>();

  for (const { chapter } of content.chapters) {
    const sections: BuiltChapter['sections'] = chapter.sections.map((section, i) => {
      usedLocIds.add(section.locId);
      const order = i + 1;
      for (const q of section.quests) {
        const races = q.races ?? chapter.races;
        quests.push({
          slug: q.slug,
          name: q.name,
          kind: q.kind,
          ...(q.aliases && { aliases: q.aliases }),
          locId: section.locId,
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
