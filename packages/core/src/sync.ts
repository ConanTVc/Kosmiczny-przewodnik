/**
 * Wspólne zasady synchronizacji (klient i serwer): format kodu, wyliczanie zmian do wysłania,
 * obcinanie dat „z przyszłości” i limity rozmiaru. Czysta logika – bez sieci.
 */
import { stableStringify } from './merge';
import { emptyProgress } from './progress';
import type { CharacterProgress, Progress, Stamped } from './types';

/** Alfabet Crockforda: bez I, L, O, U – nie da się ich pomylić z 1, 0 ani V. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SYNC_CODE_PREFIX = 'KOSMO';
/** 28 znaków × 5 bitów = 140 bitów losowości – kodu nie da się zgadnąć. */
const CODE_CHARS = 28;
const GROUP = 4;

/** Limity jednego kodu synchronizacji – chronią serwer przed zaśmiecaniem. */
export const SYNC_LIMITS = {
  characters: 30,
  questsPerCharacter: 5000,
  settings: 50,
  /** Największe zapytanie z postępem (bajty JSON). */
  requestBytes: 256 * 1024,
  /** Ile czasu „w przód” może się spieszyć zegar urządzenia. */
  clockSkewMs: 5 * 60 * 1000,
} as const;

const format = (chars: string) =>
  `${SYNC_CODE_PREFIX}-${chars.match(new RegExp(`.{1,${GROUP}}`, 'g'))!.join('-')}`;

/** Nowy kod, np. `KOSMO-7K2M-…` (7 grup po 4 znaki). */
export function generateSyncCode(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(CODE_CHARS));
  // 256 jest wielokrotnością 32, więc reszta z dzielenia nie faworyzuje żadnego znaku.
  return format([...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join(''));
}

/**
 * Kod wpisany przez gracza → postać kanoniczna albo `undefined`. Toleruje małe litery, spacje,
 * brak myślników i pomyłki O/0, I/1, L/1.
 */
export function normalizeSyncCode(input: string): string | undefined {
  let chars = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (chars.startsWith('K0SM0')) chars = chars.slice(5); // „KOSMO” po zamianie O → 0
  if (chars.length !== CODE_CHARS || [...chars].some((c) => !ALPHABET.includes(c)))
    return undefined;
  return format(chars);
}

/**
 * To, co trzeba wysłać na serwer: z lokalnego postępu tylko ustawienia i zadania inne niż na
 * serwerze (postać nowa – w całości). `undefined` = nic się nie zmieniło.
 */
export function progressDelta(local: Progress, remote: Progress): Progress | undefined {
  const settings: Progress['settings'] = {};
  for (const [key, value] of Object.entries(local.settings))
    if (stableStringify(value) !== stableStringify(remote.settings[key])) settings[key] = value;

  const characters: Progress['characters'] = {};
  for (const [key, char] of Object.entries(local.characters)) {
    const other = remote.characters[key];
    if (!other) {
      characters[key] = char;
      continue;
    }
    const quests: CharacterProgress['quests'] = {};
    for (const [slug, q] of Object.entries(char.quests))
      if (stableStringify(q) !== stableStringify(other.quests[slug])) quests[slug] = q;
    const head = (c: CharacterProgress) => stableStringify({ ...c, quests: undefined });
    if (Object.keys(quests).length || head(char) !== head(other))
      characters[key] = { ...char, quests };
  }

  if (!Object.keys(settings).length && !Object.keys(characters).length) return undefined;
  return { ...emptyProgress(), settings, characters };
}

/** Rozmiar jednego zapytania przy wysyłce – mały, żeby serwer (limit CPU) scalał szybko. */
export const SYNC_CHUNK_BYTES = 64 * 1024;

/**
 * Dzieli zmiany na kawałki do ~`maxBytes`: postacie po kolei, a dużą postać (np. pierwsza
 * wysyłka) – na części z podzbiorem zadań. Serwer scala każdą część osobno, więc wynik jest ten sam.
 */
export function splitDelta(delta: Progress, maxBytes = SYNC_CHUNK_BYTES): Progress[] {
  const pieces: [string, CharacterProgress][] = [];
  for (const [key, char] of Object.entries(delta.characters)) {
    if (JSON.stringify(char).length <= maxBytes) {
      pieces.push([key, char]);
      continue;
    }
    const budget = maxBytes - JSON.stringify({ ...char, quests: {} }).length;
    let quests: CharacterProgress['quests'] = {};
    let size = 0;
    for (const [slug, q] of Object.entries(char.quests)) {
      const qSize = JSON.stringify(q).length + slug.length + 4;
      if (size && size + qSize > budget) {
        pieces.push([key, { ...char, quests }]);
        quests = {};
        size = 0;
      }
      quests[slug] = q;
      size += qSize;
    }
    pieces.push([key, { ...char, quests }]);
  }

  const parts: Progress[] = [];
  let current: Progress = { ...emptyProgress(), settings: delta.settings };
  let size = JSON.stringify(current).length;
  for (const [key, char] of pieces) {
    const charSize = JSON.stringify(char).length + key.length + 4;
    if (
      (Object.keys(current.characters).length && size + charSize > maxBytes) ||
      current.characters[key]
    ) {
      parts.push(current);
      current = emptyProgress();
      size = JSON.stringify(current).length;
    }
    current = { ...current, characters: { ...current.characters, [key]: char } };
    size += charSize;
  }
  parts.push(current);
  return parts;
}

/**
 * Daty z przyszłości (zły zegar albo próba „wygrania” scalania na zawsze) obcina do `now`.
 * Zwraca kopię.
 */
export function clampFutureStamps(
  progress: Progress,
  now: number,
  skewMs = SYNC_LIMITS.clockSkewMs,
): Progress {
  const max = now + skewMs;
  const fix = <T>(s: Stamped<T>): Stamped<T> => (s.at > max ? { v: s.v, at: now } : s);
  const fixOpt = <T>(s: Stamped<T> | undefined) => s && fix(s);
  const settings = Object.fromEntries(
    Object.entries(progress.settings).map(([k, v]) => [k, fix(v)]),
  );
  const characters: Progress['characters'] = {};
  for (const [key, c] of Object.entries(progress.characters)) {
    const quests: CharacterProgress['quests'] = {};
    for (const [slug, q] of Object.entries(c.quests)) {
      const steps =
        q.steps && Object.fromEntries(Object.entries(q.steps).map(([i, s]) => [i, fix(s)]));
      quests[slug] = {
        ...(q.manual && { manual: fix(q.manual) }),
        ...(q.auto && { auto: fix(q.auto) }),
        ...(steps && { steps }),
        ...(q.lists && { lists: fix(q.lists) }),
      };
    }
    const removed = fixOpt(c.removed);
    characters[key] = {
      name: fix(c.name),
      race: fix(c.race),
      reborn: fix(c.reborn),
      lastLoc: fix(c.lastLoc),
      lastSeen: Math.min(c.lastSeen, max),
      lastScan: fix(c.lastScan),
      tracked: fix(c.tracked),
      ...(removed && { removed }),
      quests,
    };
  }
  return { ...progress, settings, characters };
}

/** Sprawdza limity; zwraca opis problemu albo `undefined`. */
export function checkSyncLimits(progress: Progress): string | undefined {
  if (Object.keys(progress.characters).length > SYNC_LIMITS.characters)
    return `Za dużo postaci (limit ${SYNC_LIMITS.characters})`;
  if (Object.keys(progress.settings).length > SYNC_LIMITS.settings) return 'Za dużo ustawień';
  for (const c of Object.values(progress.characters))
    if (Object.keys(c.quests).length > SYNC_LIMITS.questsPerCharacter) return 'Za dużo zadań';
  return undefined;
}
