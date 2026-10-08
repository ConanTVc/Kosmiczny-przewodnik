import {
  applyScanResult,
  computeStatuses,
  indexContent,
  isRemoved,
  mergeProgress,
  removeCharacter,
  setManualStatus,
  setQuestLists,
  setSetting,
  setStepDone,
  setTracked,
  upsertCharacter,
  type CharacterInfo,
  type ContentIndex,
  type ManualStatus,
  type MapScan,
  type Progress,
  type QuestLogEntry,
  type Scan,
  type StatusOutput,
  type TeleportEntry,
} from '@kp/core';
import type { LoadedContent } from './content';
import { lokalizatorSeconds, type GameChange, type GameCharacter, type GameSnapshot } from './game';
import type { DomScanPart } from './observer';
import type { Kv } from '@kp/ui';

/** Odczyty jednej postaci w tej sesji. */
export interface CharacterScan {
  teleports?: { at: number; entries: TeleportEntry[]; partial: boolean };
  questLog?: { at: number; entries: QuestLogEntry[] };
  /** Mapy odwiedzonych lokacji – najnowsza na lokację. */
  maps: Map<number, MapScan>;
}

export type TrackChoice = 'yes' | 'no' | 'always';
/** Ustawienie: co robić z nową postacią. */
export type TrackNew = 'ask' | 'always' | 'never';

export interface ControllerInit {
  progress: Progress;
  loaded: LoadedContent;
  /** Lokacje widziane na pełnej liście teleportacji, per postać – do wykrywania filtra. */
  knownTeleports: Record<string, number[]>;
  now?: () => number;
}

const info = (c: GameCharacter): CharacterInfo => ({
  key: c.key,
  name: c.name,
  race: c.race,
  reborn: c.reborn,
  loc: c.loc,
});

/**
 * Stan skryptu: postęp, treść, odczyty gry. Każda zmiana kończy się wywołaniem `onChange`
 * (odświeżenie panelu) i zapisem postępu (z opóźnieniem).
 */
export class Controller {
  progress: Progress;
  loaded: LoadedContent;
  index: ContentIndex;
  game?: GameSnapshot;
  /** Postać wybrana w panelu (domyślnie ta z gry). */
  activeKey?: string;
  /** Nowa postać czekająca na odpowiedź „Śledzić?”. */
  pendingNew?: string;
  lastResult?: StatusOutput;
  readonly scans = new Map<string, CharacterScan>();
  knownTeleports: Record<string, number[]>;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;

  constructor(
    private readonly kv: Kv,
    init: ControllerInit,
    private readonly onChange: () => void,
  ) {
    this.progress = init.progress;
    this.loaded = init.loaded;
    this.index = indexContent(init.loaded.content);
    this.knownTeleports = init.knownTeleports;
    this.now = init.now ?? Date.now;
  }

  /** Postać zalogowana w grze (jeśli jest). */
  get gameCharacter(): GameCharacter | undefined {
    return this.game?.character;
  }

  get trackNew(): TrackNew {
    return (this.progress.settings['trackNew']?.v as TrackNew | undefined) ?? 'ask';
  }

  scanFor(key: string): CharacterScan {
    let scan = this.scans.get(key);
    if (!scan) {
      scan = { maps: new Map() };
      this.scans.set(key, scan);
    }
    return scan;
  }

  /** Zmiany odczytane z `GAME` (co 2 s). */
  onGame(snapshot: GameSnapshot | undefined, changes: Set<GameChange>): void {
    this.game = snapshot;
    const c = snapshot?.character;
    const now = this.now();
    if (c && changes.has('character')) {
      // Postać usunięta przez gracza wraca jak nowa (pytanie „Śledzić?”).
      const existing = this.progress.characters[c.key];
      if (existing && !isRemoved(existing)) {
        this.progress = upsertCharacter(this.progress, info(c), now);
      } else {
        this.progress = upsertCharacter(this.progress, info(c), now, this.trackNew === 'always');
        if (this.trackNew === 'ask') this.pendingNew = c.key;
      }
      this.activeKey = c.key;
    } else if (c && changes.has('location') && !isRemoved(this.progress.characters[c.key])) {
      this.progress = upsertCharacter(this.progress, info(c), now);
    }
    if (c && (changes.has('map') || changes.has('location') || changes.has('character'))) {
      this.scanFor(c.key).maps.set(c.loc, { locId: c.loc, at: now, quests: snapshot.mapQuests });
    }
    if (changes.size) {
      this.recompute();
      this.scheduleSave();
    }
    this.onChange();
  }

  /** Teleportacje / dziennik / panel postępów odczytane ze strony. */
  onDom(part: DomScanPart): void {
    const key = this.gameCharacter?.key;
    if (!key) return; // to, co widać na stronie, należy do postaci zalogowanej w grze
    const scan = this.scanFor(key);
    if (part.kind === 'teleports') {
      const known = new Set(this.knownTeleports[key] ?? []);
      const seen = new Set(part.entries.map((e) => e.locId));
      // Odkryte lokacje nie znikają z listy – jeśli którejś brakuje, lista jest przefiltrowana.
      const shrunk = [...known].some((id) => !seen.has(id));
      const partial = part.filtered || shrunk;
      if (!partial)
        this.knownTeleports = { ...this.knownTeleports, [key]: [...new Set([...known, ...seen])] };
      scan.teleports = { at: part.at, entries: part.entries, partial };
    } else if (part.kind === 'questLog') {
      scan.questLog = { at: part.at, entries: part.entries };
    } else {
      return; // panel postępów – na razie nie zmienia statusów
    }
    this.recompute();
    this.scheduleSave();
    this.onChange();
  }

  /** Połączony odczyt postaci do wyliczenia statusów. */
  buildScan(key: string): Scan | undefined {
    const s = this.scans.get(key);
    if (!s) return undefined;
    const maps = [...s.maps.values()];
    const at = Math.max(0, s.teleports?.at ?? 0, s.questLog?.at ?? 0, ...maps.map((m) => m.at));
    const game = this.gameCharacter?.key === key ? this.game : undefined;
    return {
      at,
      lokalizatorActive: lokalizatorSeconds(game) > 0,
      ...(s.teleports && { teleports: s.teleports.entries, teleportsPartial: s.teleports.partial }),
      ...(s.questLog && { questLog: s.questLog.entries }),
      ...(maps.length > 0 && { mapQuests: maps }),
    };
  }

  /** Wylicza statusy postaci z gry i – jeśli jest śledzona – zapisuje ustalenia ze skanu. */
  recompute(): void {
    const key = this.gameCharacter?.key;
    const char = key ? this.progress.characters[key] : undefined;
    const scan = key ? this.buildScan(key) : undefined;
    if (!key || !char || !scan) return;
    const result = computeStatuses({
      index: this.index,
      character: { race: char.race.v, reborn: char.reborn.v },
      scan,
      progress: char,
    });
    this.lastResult = result;
    if (char.tracked.v && key !== this.pendingNew) {
      this.progress = applyScanResult(this.progress, key, scan, result);
    }
  }

  answerTrack(choice: TrackChoice): void {
    const key = this.pendingNew;
    if (!key) return;
    const now = this.now();
    this.progress = setTracked(this.progress, key, choice !== 'no', now);
    if (choice === 'always') this.progress = setSetting(this.progress, 'trackNew', 'always', now);
    this.pendingNew = undefined;
    this.recompute();
    this.commit();
  }

  setContent(loaded: LoadedContent): void {
    this.loaded = loaded;
    this.index = indexContent(loaded.content);
    this.recompute();
    this.onChange();
  }

  /* ───── Funkcje zwrotne panelu ───── */

  private get editKey(): string | undefined {
    return this.activeKey ?? this.gameCharacter?.key;
  }

  private commit(): void {
    this.scheduleSave();
    this.onChange();
  }

  setManual(slug: string, status: ManualStatus | null): void {
    if (!this.editKey) return;
    this.progress = setManualStatus(this.progress, this.editKey, slug, status, this.now());
    this.commit();
  }

  setStep(slug: string, step: number, done: boolean, total: number): void {
    if (!this.editKey) return;
    this.progress = setStepDone(this.progress, this.editKey, slug, step, done, total, this.now());
    this.commit();
  }

  setLists(slug: string, lists: string[]): void {
    if (!this.editKey) return;
    this.progress = setQuestLists(this.progress, this.editKey, slug, lists, this.now());
    this.commit();
  }

  selectCharacter(key: string): void {
    this.activeKey = key;
    this.onChange();
  }

  setCharacterTracked(key: string, tracked: boolean): void {
    this.progress = setTracked(this.progress, key, tracked, this.now());
    if (key === this.pendingNew) this.pendingNew = undefined;
    this.recompute();
    this.commit();
  }

  /** Usuwa postać razem z postępem (zostaje tylko znacznik dla synchronizacji). */
  removeCharacter(key: string): void {
    this.progress = removeCharacter(this.progress, key, this.now());
    if (this.activeKey === key) this.activeKey = undefined;
    if (this.pendingNew === key) this.pendingNew = undefined;
    this.scans.delete(key);
    this.knownTeleports = Object.fromEntries(
      Object.entries(this.knownTeleports).filter(([k]) => k !== key),
    );
    if (this.gameCharacter?.key === key) this.lastResult = undefined;
    this.commit();
  }

  /** Postać z gry, usunięta wcześniej z przewodnika – śledź ją znowu (od zera). */
  restoreGameCharacter(): void {
    const c = this.gameCharacter;
    if (!c) return;
    this.progress = upsertCharacter(this.progress, info(c), this.now(), true);
    this.activeKey = c.key;
    this.recompute();
    this.commit();
  }

  setSetting(name: string, value: unknown): void {
    this.progress = setSetting(this.progress, name, value, this.now());
    this.commit();
  }

  importProgress(imported: Progress): void {
    this.progress = mergeProgress(this.progress, imported);
    this.recompute();
    this.commit();
  }

  /* ───── Zapis ───── */

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 500);
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.saveTimer);
    try {
      await this.kv.set('progress', this.progress);
      await this.kv.set('knownTeleports', this.knownTeleports);
    } catch {
      // zapis się nie udał – spróbujemy przy następnej zmianie
    }
  }
}
