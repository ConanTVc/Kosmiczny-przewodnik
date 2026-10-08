/**
 * Adapter gry – JEDYNY moduł, który dotyka obiektu `GAME`.
 *
 * Czyta wyłącznie pola z białej listy (CLAUDE.md): `GAME.server`, `GAME.getTime()`,
 * `GAME.char_data.{id, name, race, reborn, loc, bonus18}` i `GAME.map_quests` (tylko
 * `{qb_id, rtype, main, name}`). Kopiuje je do własnego obiektu – nigdy nie przegląda innych pól,
 * niczego nie zapisuje do `GAME` i nie wywołuje innych funkcji gry. Każdy błąd jest połykany:
 * skrypt nie może zepsuć gry.
 */
import { charKey, parseMapQuests, type CharKey, type MapQuest } from '@kp/core';
import type { Race, Reborn } from '@kp/content';

declare const GAME: unknown;

export interface GameCharacter {
  key: CharKey;
  id: number;
  name: string;
  race: Race;
  reborn: Reborn;
  loc: number;
  /** Koniec lokalizatora (czas gry, sekundy). */
  bonus18: number;
}

export interface GameSnapshot {
  server: number;
  /** Czas gry (`GAME.getTime()`), sekundy. */
  time: number;
  /** Brak = postać nie jest wybrana. */
  character?: GameCharacter;
  /** Zadania na mapie bieżącej lokacji. */
  mapQuests: MapQuest[];
}

type Raw = Record<string, unknown>;

function gameObject(): Raw | undefined {
  try {
    if (typeof GAME !== 'undefined' && GAME && typeof GAME === 'object') return GAME as Raw;
  } catch {
    // GAME jeszcze nie istnieje
  }
  const fromWindow = (globalThis as unknown as { GAME?: unknown }).GAME;
  return fromWindow && typeof fromWindow === 'object' ? (fromWindow as Raw) : undefined;
}

const int = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN);

/** Jeden odczyt gry. `undefined`, gdy gra się jeszcze nie wczytała albo coś poszło nie tak. */
export function readGame(): GameSnapshot | undefined {
  try {
    const game = gameObject();
    if (!game) return undefined;
    const server = int(game['server']);
    const getTime = game['getTime'];
    const time = typeof getTime === 'function' ? int((getTime as () => unknown).call(game)) : NaN;
    if (!Number.isFinite(server) || !Number.isFinite(time)) return undefined;

    let character: GameCharacter | undefined;
    const cd = game['char_data'];
    if (cd && typeof cd === 'object') {
      const c = cd as Raw;
      const id = int(c['id']);
      const race = int(c['race']);
      const reborn = int(c['reborn']);
      const loc = int(c['loc']);
      if (
        [id, race, reborn, loc].every(Number.isInteger) &&
        race >= 0 &&
        race <= 7 &&
        reborn >= 0 &&
        reborn <= 6
      ) {
        character = {
          key: charKey(server, id),
          id,
          name: typeof c['name'] === 'string' ? c['name'] : `Postać ${id}`,
          race: race as Race,
          reborn: reborn as Reborn,
          loc,
          bonus18: int(c['bonus18']) || 0,
        };
      }
    }
    return {
      server,
      time,
      character,
      mapQuests: character ? parseMapQuests(game['map_quests']) : [],
    };
  } catch {
    return undefined;
  }
}

/** Sekundy lokalizatora, które zostały (0 = nieaktywny). */
export function lokalizatorSeconds(snapshot: GameSnapshot | undefined): number {
  const c = snapshot?.character;
  if (!c) return 0;
  return Math.max(0, c.bonus18 - snapshot.time);
}

export type GameChange = 'character' | 'location' | 'lokalizator' | 'map';

/**
 * Co 2 s czyta grę i zgłasza, co się zmieniło. Zwraca funkcję zatrzymującą. Zmiana
 * „lokalizator” to włączenie/wyłączenie, nie każda sekunda odliczania.
 */
export function watchGame(
  onChange: (snapshot: GameSnapshot | undefined, changes: Set<GameChange>) => void,
  intervalMs = 2000,
): () => void {
  let prev: GameSnapshot | undefined;
  let first = true;
  const tick = () => {
    try {
      const next = readGame();
      const changes = new Set<GameChange>();
      const a = prev?.character;
      const b = next?.character;
      if (
        first ||
        a?.key !== b?.key ||
        a?.name !== b?.name ||
        a?.race !== b?.race ||
        a?.reborn !== b?.reborn
      ) {
        changes.add('character');
      }
      if (a?.loc !== b?.loc) changes.add('location');
      if (lokalizatorSeconds(prev) > 0 !== lokalizatorSeconds(next) > 0) changes.add('lokalizator');
      if (JSON.stringify(prev?.mapQuests ?? []) !== JSON.stringify(next?.mapQuests ?? []))
        changes.add('map');
      first = false;
      prev = next;
      onChange(next, changes);
    } catch {
      // nic – następna próba za chwilę
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
