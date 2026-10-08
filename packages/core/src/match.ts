import type { BuiltQuest } from '@kp/content';
import type { ContentIndex } from './content';
import {
  isTruncatedName,
  nameBeforeDash,
  normalizeQuestName,
  questBaseName,
  sameQuestName,
} from './names';

/**
 * Reguła, po której dopasowano wpis z gry do treści (kolejność jak w CLAUDE.md):
 * nazwa → numer części / nazwa przed „ - ” → zadanie główne po lokacji → nazwa unikalna w treści.
 */
export type MatchRule =
  'nazwa' | 'numer-czesci' | 'przed-myslnikiem' | 'glowne-po-lokacji' | 'po-nazwie';

export interface MatchResult {
  quest: BuiltQuest;
  rule: MatchRule;
  /** false = przypuszczenie (dopasowanie po nazwie albo kilka kandydatów) – gracz potwierdza. */
  certain: boolean;
}

export interface GameQuestRef {
  name: string;
  locId: number;
  isMain?: boolean;
  /** Etap z dziennika – przy zadaniu głównym to nazwa bazowa („Hakaishin” dla „Hakaishin II”). */
  stage?: string;
}

/**
 * Wybiera najlepszego kandydata: najpierw zadania dla rasy postaci, potem z główną lokacją taką jak
 * w grze (nie tylko `alsoAt`), potem tego samego rodzaju (główne/poboczne). Gdy nadal zostaje
 * kilku – bierzemy pierwszego, ale dopasowanie jest niepewne.
 */
function pick(
  candidates: BuiltQuest[],
  ref: GameQuestRef,
  applicable: (q: BuiltQuest) => boolean,
): { quest: BuiltQuest; unique: boolean } | undefined {
  let pool = [...new Set(candidates)];
  const narrow = (pred: (q: BuiltQuest) => boolean) => {
    const narrowed = pool.filter(pred);
    if (narrowed.length) pool = narrowed;
  };
  narrow(applicable);
  narrow((q) => q.locId === ref.locId);
  if (ref.isMain !== undefined) narrow((q) => (q.kind === 'main') === ref.isMain);
  const quest = pool[0];
  return quest && { quest, unique: pool.length === 1 };
}

const allNames = (q: BuiltQuest) => [q.name, ...(q.aliases ?? [])];

/** Dopasowuje zadanie z dziennika (albo panelu postępów) do treści. */
export function matchGameQuest(
  index: ContentIndex,
  ref: GameQuestRef,
  applicable: (q: BuiltQuest) => boolean = () => true,
): MatchResult | undefined {
  const here = index.byLocAny.get(ref.locId) ?? [];
  const truncated = isTruncatedName(ref.name);
  const result = (rule: MatchRule, found: ReturnType<typeof pick>, alwaysUncertain = false) =>
    found && { quest: found.quest, rule, certain: found.unique && !alwaysUncertain };

  // 1. ta sama lokacja (główna albo alsoAt) + nazwa
  const byName = here.filter((q) => allNames(q).some((n) => sameQuestName(ref.name, n)));
  if (byName.length) return result('nazwa', pick(byName, ref, applicable));

  if (!truncated) {
    // 2. bez numeru części („Hakaishin II” ↔ „Hakaishin”), także etap z dziennika
    const bases = new Set([
      questBaseName(ref.name),
      ...(ref.stage ? [questBaseName(ref.stage)] : []),
    ]);
    const byBase = here.filter((q) => allNames(q).some((n) => bases.has(questBaseName(n))));
    if (byBase.length) return result('numer-czesci', pick(byBase, ref, applicable));
    // 2b. nazwa z gry = część nazwy z solucji przed „ - ”
    const game = normalizeQuestName(ref.name);
    const byDash = here.filter((q) => allNames(q).some((n) => nameBeforeDash(n) === game));
    if (byDash.length) return result('przed-myslnikiem', pick(byDash, ref, applicable));
  }

  // 3. zadanie główne – po lokacji
  if (ref.isMain) {
    const mains = (index.byLoc.get(ref.locId) ?? here).filter((q) => q.kind === 'main');
    if (mains.length) return result('glowne-po-lokacji', pick(mains, ref, applicable));
  }

  // 4. nazwa jednoznaczna w całej treści (inna lokacja) – zawsze niepewne
  const everywhere = truncated
    ? [...index.quests.values()].filter((q) => allNames(q).some((n) => sameQuestName(ref.name, n)))
    : (index.byBaseName.get(questBaseName(ref.name)) ?? []);
  const candidates = everywhere.filter(applicable);
  if (candidates.length === 1)
    return result('po-nazwie', { quest: candidates[0]!, unique: true }, true);

  return undefined;
}
