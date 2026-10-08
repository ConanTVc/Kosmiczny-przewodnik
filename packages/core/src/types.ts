import type { Race, Reborn } from '@kp/content';

/* ───────────── Postać ───────────── */

/**
 * Klucz postaci: `s${server}:c${id}`, np. `s18:c3465`. Postać dodana ręcznie na telefonie
 * (bez ID z gry) ma `m` zamiast `c`: `s${server|0}:m${czas dodania}`.
 */
export type CharKey = `s${number}:c${number}` | `s${number}:m${number}`;

export function charKey(server: number, id: number): CharKey {
  return `s${server}:c${id}`;
}

/** Klucz dla postaci dodanej ręcznie; `server` nieznany = 0. */
export function manualCharKey(server: number | undefined, now: number): CharKey {
  return `s${server ?? 0}:m${now}`;
}

export interface CharacterInfo {
  key: CharKey;
  name: string;
  race: Race;
  reborn: Reborn;
  /** ID bieżącej lokacji (`char_data.loc`). */
  loc?: number;
}

/* ───────────── Dane z gry (wynik parserów) ───────────── */

export interface TeleportEntry {
  locId: number;
  name: string;
  reborn: number;
  /** Znacznik „QUEST” – w lokacji są niezrobione zadania. */
  hasQuest: boolean;
  isCurrent: boolean;
  isFav: boolean;
}

export interface QuestLogEntry {
  /** ID instancji zadania u postaci – NIE identyfikator treści. */
  qid: number;
  name: string;
  /** Etap (`.grey`); przy zadaniu głównym to nazwa bazowa, np. „Hakaishin” dla „Hakaishin II”. */
  stage: string;
  /** Lokacja, w której zadanie jest teraz. */
  locId: number;
  locName: string;
  isMain: boolean;
  /** Śledzone w panelu postępów (przycisk „Anuluj”). */
  isTracked: boolean;
}

export interface QuestTrackEntry {
  /** Nazwa z panelu – gra skraca długie nazwy do „...”. */
  name: string;
  truncated: boolean;
  locId: number;
}

/** Zadanie z `GAME.map_quests` – w trakcie albo do wzięcia na mapie lokacji (zrobionych tam nie ma). */
export interface MapQuest {
  /** `qb_id` = `data-qid` z dziennika. */
  qid: number;
  name: string;
  isMain: boolean;
  isDaily: boolean;
}

/** Zadania widoczne na mapie jednej lokacji w danej chwili. */
export interface MapScan {
  locId: number;
  at: number;
  quests: MapQuest[];
}

/** Jeden odczyt stanu gry. Brak `teleports`/`questLog`/`mapQuests` = tego nie odczytano. */
export interface Scan {
  /** Czas odczytu (ms od epoki). */
  at: number;
  lokalizatorActive: boolean;
  teleports?: TeleportEntry[];
  /** Lista teleportacji przefiltrowana („Szukaj”/„Reborn”) – z braku lokacji nic nie wnioskujemy. */
  teleportsPartial?: boolean;
  questLog?: QuestLogEntry[];
  /** Mapy odwiedzonych lokacji (`GAME.map_quests`) – najnowszy odczyt każdej lokacji. */
  mapQuests?: MapScan[];
}

/* ───────────── Statusy ───────────── */

export type QuestStatus = 'active' | 'done' | 'available' | 'locked' | 'unknown';
/** Statusy, które gracz może ustawić ręcznie. */
export type ManualStatus = 'active' | 'done' | 'available';
export type StatusSource = 'auto' | 'manual';

/**
 * Skąd wiemy: `manual` – gracz, `scan` – bieżący odczyt gry, `history` – zapamiętany wcześniejszy
 * odczyt, `content` – wynika z treści i postaci (reborn, kolejność fabuły, requires).
 */
export type StatusBasis = 'manual' | 'scan' | 'history' | 'content';

export interface QuestStatusResult {
  status: QuestStatus;
  source: StatusSource;
  basis: StatusBasis;
  /** Kiedy ustalono (ms). */
  at: number;
  /** false = przypuszczenie – UI pokazuje „?” i prosi gracza o potwierdzenie. */
  certain: boolean;
  /** Krótkie uzasadnienie dla gracza (po polsku). */
  reason: string;
}

/* ───────────── Postęp (zapisywany lokalnie i synchronizowany) ───────────── */

/** Wartość ze znacznikiem czasu – scalanie last-write-wins per pole. */
export interface Stamped<T> {
  v: T;
  at: number;
}

/** Status ustalony automatycznie ze skanu – zapamiętujemy tylko to, czego nie da się wyliczyć z treści. */
export interface AutoStatus {
  status: 'active' | 'done' | 'available';
  certain: boolean;
}

export interface QuestProgress {
  /** Ręczne ustawienie gracza; `v: null` = „przywróć auto” (też musi się zsynchronizować). */
  manual?: Stamped<ManualStatus | null>;
  auto?: Stamped<AutoStatus>;
  /** Ręcznie odhaczone kroki: numer etapu (od 0) → zrobiony. Scalane osobno dla każdego kroku. */
  steps?: Record<string, Stamped<boolean>>;
  /** Własne listy gracza, do których dodał zadanie (np. „Na później”). */
  lists?: Stamped<string[]>;
}

/** Wbudowana lista na zadania zostawione celowo (np. ostatni krok z expem na później). */
export const LATER_LIST = 'Na później';

export interface CharacterProgress {
  name: Stamped<string>;
  race: Stamped<Race>;
  reborn: Stamped<Reborn>;
  lastLoc: Stamped<number | null>;
  /** Ostatnio widziana w grze (ms) – scalanie: max. */
  lastSeen: number;
  /** Czas ostatniego skanu z lokalizatorem i pełnymi danymi. */
  lastScan: Stamped<number | null>;
  /** Czy śledzimy tę postać. */
  tracked: Stamped<boolean>;
  quests: Record<string, QuestProgress>;
}

export const PROGRESS_VERSION = 1;

export interface Progress {
  version: typeof PROGRESS_VERSION;
  /** Ustawienia (motyw, „zawsze śledź nowe postacie” …) – last-write-wins per klucz. */
  settings: Record<string, Stamped<unknown>>;
  characters: Record<string, CharacterProgress>;
}
