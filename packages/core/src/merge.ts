import {
  PROGRESS_VERSION,
  type CharacterProgress,
  type Progress,
  type QuestProgress,
  type Stamped,
} from './types';

/** JSON z posortowanymi kluczami – do deterministycznego rozstrzygania remisów. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Last-write-wins: nowszy znacznik czasu wygrywa; przy remisie wygrywa „większa” wartość
 * (porównanie JSON) – dzięki temu scalanie jest przemienne, łączne i deterministyczne.
 */
export function lww<T>(
  a: Stamped<T> | undefined,
  b: Stamped<T> | undefined,
): Stamped<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return stableStringify(a.v) >= stableStringify(b.v) ? a : b;
}

function lwwRequired<T>(a: Stamped<T>, b: Stamped<T>): Stamped<T> {
  return lww(a, b)!;
}

const sortedKeys = (a: object, b: object) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

function mergeQuest(a: QuestProgress | undefined, b: QuestProgress | undefined): QuestProgress {
  const manual = lww(a?.manual, b?.manual);
  const auto = lww(a?.auto, b?.auto);
  const lists = lww(a?.lists, b?.lists);
  let steps: QuestProgress['steps'];
  if (a?.steps || b?.steps) {
    steps = {};
    for (const i of sortedKeys(a?.steps ?? {}, b?.steps ?? {}))
      steps[i] = lww(a?.steps?.[i], b?.steps?.[i])!;
  }
  return {
    ...(manual && { manual }),
    ...(auto && { auto }),
    ...(steps && { steps }),
    ...(lists && { lists }),
  };
}

function mergeCharacter(a: CharacterProgress, b: CharacterProgress): CharacterProgress {
  const removed = lww(a.removed, b.removed);
  const quests: Record<string, QuestProgress> = {};
  for (const slug of sortedKeys(a.quests, b.quests))
    quests[slug] = mergeQuest(a.quests[slug], b.quests[slug]);
  return {
    name: lwwRequired(a.name, b.name),
    race: lwwRequired(a.race, b.race),
    reborn: lwwRequired(a.reborn, b.reborn),
    lastLoc: lwwRequired(a.lastLoc, b.lastLoc),
    lastSeen: Math.max(a.lastSeen, b.lastSeen),
    lastScan: lwwRequired(a.lastScan, b.lastScan),
    tracked: lwwRequired(a.tracked, b.tracked),
    ...(removed && { removed }),
    quests,
  };
}

/**
 * Scala dwa postępy (np. telefon i komputer). Last-write-wins osobno dla każdego pola i każdego
 * zadania – ręczne ustawienie i status ze skanu to osobne pola, więc świeży skan nie nadpisze
 * ręcznego „zrobione”. Wynik nie zależy od kolejności argumentów.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const settings: Progress['settings'] = {};
  for (const key of sortedKeys(a.settings, b.settings))
    settings[key] = lww(a.settings[key], b.settings[key])!;
  const characters: Progress['characters'] = {};
  for (const key of sortedKeys(a.characters, b.characters)) {
    const ca = a.characters[key];
    const cb = b.characters[key];
    characters[key] = ca && cb ? mergeCharacter(ca, cb) : (ca ?? cb)!;
  }
  return { version: PROGRESS_VERSION, settings, characters };
}
