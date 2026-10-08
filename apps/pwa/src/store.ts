/**
 * Postęp na telefonie: wszystko ręcznie (bez gry), zapis w pamięci przeglądarki z małym
 * opóźnieniem. Wybrana postać jest zapamiętywana tylko na tym urządzeniu.
 */
import {
  manualCharKey,
  mergeProgress,
  setLastLoc,
  setManualStatus,
  setQuestLists,
  setReborn,
  setSetting,
  setStepDone,
  setTracked,
  upsertCharacter,
  type ManualStatus,
  type Progress,
} from '@kp/core';
import type { Kv, NewCharacter } from '@kp/ui';

const SAVE_DELAY_MS = 400;
export const PROGRESS_KEY = 'progress';
export const ACTIVE_KEY = 'activeCharacter';

export class PhoneStore {
  progress: Progress;
  activeKey: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly kv: Kv,
    init: { progress: Progress; activeKey?: string },
    private readonly onChange: () => void,
    private readonly now: () => number = Date.now,
  ) {
    this.progress = init.progress;
    this.activeKey =
      init.activeKey && this.progress.characters[init.activeKey]?.tracked.v
        ? init.activeKey
        : this.firstTracked();
  }

  /** Ostatnio używana śledzona postać. */
  private firstTracked(): string | undefined {
    return Object.entries(this.progress.characters)
      .filter(([, c]) => c.tracked.v)
      .sort(([, a], [, b]) => b.lastSeen - a.lastSeen)[0]?.[0];
  }

  private commit(next: Progress): void {
    this.progress = next;
    this.onChange();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), SAVE_DELAY_MS);
  }

  setManual(slug: string, status: ManualStatus | null): void {
    if (this.activeKey)
      this.commit(setManualStatus(this.progress, this.activeKey, slug, status, this.now()));
  }

  setStep(slug: string, step: number, done: boolean, total: number): void {
    if (this.activeKey)
      this.commit(setStepDone(this.progress, this.activeKey, slug, step, done, total, this.now()));
  }

  setLists(slug: string, lists: string[]): void {
    if (this.activeKey)
      this.commit(setQuestLists(this.progress, this.activeKey, slug, lists, this.now()));
  }

  select(key: string): void {
    this.activeKey = key;
    void this.kv.set(ACTIVE_KEY, key).catch(() => {});
    this.onChange();
  }

  setTracked(key: string, tracked: boolean): void {
    this.progress = setTracked(this.progress, key, tracked, this.now());
    if (!tracked && key === this.activeKey) this.activeKey = this.firstTracked();
    this.commit(this.progress);
  }

  setSetting(name: string, value: unknown): void {
    this.commit(setSetting(this.progress, name, value, this.now()));
  }

  importProgress(imported: Progress): void {
    this.progress = mergeProgress(this.progress, imported);
    this.activeKey ??= this.firstTracked();
    this.commit(this.progress);
  }

  addCharacter(c: NewCharacter): void {
    let now = this.now();
    let key = manualCharKey(c.server, now);
    while (this.progress.characters[key]) key = manualCharKey(c.server, ++now);
    this.commit(
      upsertCharacter(this.progress, { key, name: c.name, race: c.race, reborn: c.reborn }, now),
    );
    this.select(key);
  }

  setReborn(key: string, reborn: number): void {
    this.commit(setReborn(this.progress, key, reborn, this.now()));
  }

  /** Lokacja wybrana w „Tutaj” – przy następnym otwarciu aplikacja wraca do niej. */
  pickLocation(locId: number): void {
    if (this.activeKey) this.commit(setLastLoc(this.progress, this.activeKey, locId, this.now()));
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.saveTimer);
    try {
      await this.kv.set(PROGRESS_KEY, this.progress);
    } catch {
      // zapis się nie udał – spróbujemy przy następnej zmianie
    }
  }
}
