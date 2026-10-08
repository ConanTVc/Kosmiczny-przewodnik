import type { StatusOutput } from './status';
import {
  LATER_LIST,
  PROGRESS_VERSION,
  type AutoStatus,
  type CharacterInfo,
  type CharacterProgress,
  type ManualStatus,
  type Progress,
  type QuestProgress,
  type Scan,
  type Stamped,
} from './types';

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, settings: {}, characters: {} };
}

const stamp = <T>(v: T, at: number): Stamped<T> => ({ v, at });

/** Ustawia wartość tylko, gdy się zmieniła – stary znacznik czasu zostaje, synchronizacja się nie mnoży. */
function restamp<T>(current: Stamped<T> | undefined, v: T, at: number): Stamped<T> {
  return current && JSON.stringify(current.v) === JSON.stringify(v) ? current : stamp(v, at);
}

function updateCharacter(
  progress: Progress,
  key: string,
  update: (c: CharacterProgress) => CharacterProgress,
): Progress {
  const current = progress.characters[key];
  if (!current) return progress;
  return { ...progress, characters: { ...progress.characters, [key]: update(current) } };
}

/** Dodaje postać albo odświeża jej dane z gry (nazwa, rasa, reborn, lokacja). */
export function upsertCharacter(
  progress: Progress,
  info: CharacterInfo,
  now: number,
  tracked = true,
): Progress {
  const current = progress.characters[info.key];
  const next: CharacterProgress = {
    name: restamp(current?.name, info.name, now),
    race: restamp(current?.race, info.race, now),
    reborn: restamp(current?.reborn, info.reborn, now),
    lastLoc: restamp(current?.lastLoc, info.loc ?? current?.lastLoc.v ?? null, now),
    lastSeen: Math.max(current?.lastSeen ?? 0, now),
    lastScan: current?.lastScan ?? stamp(null, now),
    tracked: current?.tracked ?? stamp(tracked, now),
    quests: current?.quests ?? {},
  };
  return { ...progress, characters: { ...progress.characters, [info.key]: next } };
}

export function setTracked(
  progress: Progress,
  key: string,
  tracked: boolean,
  now: number,
): Progress {
  return updateCharacter(progress, key, (c) => ({
    ...c,
    tracked: restamp(c.tracked, tracked, now),
  }));
}

/** Ręczny status; `null` = „przywróć auto” (zapisane jako zmiana, żeby się zsynchronizowało). */
export function setManualStatus(
  progress: Progress,
  key: string,
  slug: string,
  status: ManualStatus | null,
  now: number,
): Progress {
  return updateCharacter(progress, key, (c) => ({
    ...c,
    quests: { ...c.quests, [slug]: { ...c.quests[slug], manual: stamp(status, now) } },
  }));
}

/**
 * Odhacza (albo odznacza) krok zadania. Gdy po odhaczeniu wszystkie kroki są zrobione, zadanie
 * zostaje oznaczone ręcznie jako zrobione – jak na liście kontrolnej.
 */
export function setStepDone(
  progress: Progress,
  key: string,
  slug: string,
  step: number,
  done: boolean,
  totalSteps: number,
  now: number,
): Progress {
  return updateCharacter(progress, key, (c) => {
    const prev = c.quests[slug] ?? {};
    const steps = { ...prev.steps, [String(step)]: stamp(done, now) };
    const allDone =
      totalSteps > 0 &&
      Array.from({ length: totalSteps }, (_, i) => steps[String(i)]?.v).every(Boolean);
    const quest: QuestProgress = {
      ...prev,
      steps,
      ...(done &&
        allDone &&
        prev.manual?.v !== 'done' && { manual: stamp<ManualStatus | null>('done', now) }),
    };
    return { ...c, quests: { ...c.quests, [slug]: quest } };
  });
}

/** Ustawia listy gracza dla zadania (np. „Na później”). Pusta tablica = zadanie na żadnej liście. */
export function setQuestLists(
  progress: Progress,
  key: string,
  slug: string,
  lists: string[],
  now: number,
): Progress {
  const clean = [...new Set(lists.map((l) => l.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  return updateCharacter(progress, key, (c) => ({
    ...c,
    quests: { ...c.quests, [slug]: { ...c.quests[slug], lists: stamp(clean, now) } },
  }));
}

/** Nazwy list używanych przez postać (zawsze z „Na później”). */
export function questLists(character: CharacterProgress | undefined): string[] {
  const names = new Set<string>([LATER_LIST]);
  for (const q of Object.values(character?.quests ?? {})) q.lists?.v.forEach((l) => names.add(l));
  return [...names].sort((a, b) =>
    a === LATER_LIST ? -1 : b === LATER_LIST ? 1 : a.localeCompare(b, 'pl'),
  );
}

export function setSetting(
  progress: Progress,
  name: string,
  value: unknown,
  now: number,
): Progress {
  return { ...progress, settings: { ...progress.settings, [name]: stamp(value, now) } };
}

/** Czy skan zawiera wszystko, czego potrzeba do pełnego wykrywania. */
export function isFullScan(scan: Scan): boolean {
  return (
    scan.lokalizatorActive &&
    scan.teleports !== undefined &&
    !scan.teleportsPartial &&
    scan.questLog !== undefined
  );
}

/**
 * Zapisuje do postępu statusy ustalone z bieżącego skanu (w trakcie / zrobione / do wzięcia).
 * Statusy wyliczalne z treści (zablokowane, nieznane) nie są zapisywane – wyliczy się je znowu.
 */
export function applyScanResult(
  progress: Progress,
  key: string,
  scan: Scan,
  result: StatusOutput,
): Progress {
  return updateCharacter(progress, key, (c) => {
    const quests: Record<string, QuestProgress> = { ...c.quests };
    for (const [slug, r] of Object.entries(result.statuses)) {
      if (r.basis !== 'scan' || r.status === 'locked' || r.status === 'unknown') continue;
      const v: AutoStatus = { status: r.status, certain: r.certain };
      const prev = quests[slug]?.auto;
      quests[slug] = { ...quests[slug], auto: restamp(prev, v, scan.at) };
    }
    return {
      ...c,
      quests,
      lastScan: isFullScan(scan) ? stamp(scan.at, scan.at) : c.lastScan,
    };
  });
}
