import type {
  BuiltChapter,
  BuiltContent,
  BuiltLocation,
  BuiltQuest,
  Race,
  Reborn,
} from '@kp/content';
import { questBaseName } from './names';

/** Treść z indeksami do szybkiego wyszukiwania – budowana raz po wczytaniu treści. */
export interface ContentIndex {
  content: BuiltContent;
  quests: Map<string, BuiltQuest>;
  /** Główna lokacja zadania → zadania. */
  byLoc: Map<number, BuiltQuest[]>;
  /** Główna lokacja albo `alsoAt` → zadania. */
  byLocAny: Map<number, BuiltQuest[]>;
  /** Nazwa bez numeru części → zadania (cała treść). */
  byBaseName: Map<string, BuiltQuest[]>;
  locations: Map<number, BuiltLocation>;
  chapters: Map<string, BuiltChapter>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexContent(content: BuiltContent): ContentIndex {
  const index: ContentIndex = {
    content,
    quests: new Map(),
    byLoc: new Map(),
    byLocAny: new Map(),
    byBaseName: new Map(),
    locations: new Map(content.locations.map((l) => [l.id, l])),
    chapters: new Map(content.chapters.map((c) => [c.id, c])),
  };
  for (const q of content.quests) {
    index.quests.set(q.slug, q);
    push(index.byLoc, q.locId, q);
    for (const id of new Set([q.locId, ...(q.alsoAt ?? [])])) push(index.byLocAny, id, q);
    push(index.byBaseName, questBaseName(q.name), q);
  }
  return index;
}

export function isForRace(item: { races?: number[] }, race: Race): boolean {
  return !item.races || item.races.includes(race);
}

export function isForReborn(q: BuiltQuest, reborn: Reborn): boolean {
  return q.rebornMin <= reborn && (q.rebornMax === undefined || reborn <= q.rebornMax);
}

export interface CharacterView {
  /** Zadania, które dotyczą postaci teraz (rasa i reborn się zgadzają). */
  current: BuiltQuest[];
  /** Zadania z wyższych rebornów – „przed tobą”. */
  ahead: BuiltQuest[];
  /** Rozdziały dla tej rasy (wspólne + własne Nonborn/Rborn), w kolejności rebornu. */
  chapters: BuiltChapter[];
}

/** Co dotyczy postaci teraz i co jest przed nią. Zadania innych ras są pomijane. */
export function filterForCharacter(
  content: BuiltContent,
  race: Race,
  reborn: Reborn,
): CharacterView {
  const current: BuiltQuest[] = [];
  const ahead: BuiltQuest[] = [];
  for (const q of content.quests) {
    if (!isForRace(q, race)) continue;
    if (q.rebornMin > reborn) ahead.push(q);
    else if (isForReborn(q, reborn)) current.push(q);
  }
  const chapters = content.chapters.filter((c) => isForRace(c, race));
  return { current, ahead, chapters };
}
