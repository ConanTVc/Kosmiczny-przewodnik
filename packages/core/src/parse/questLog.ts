import type { QuestLogEntry, QuestTrackEntry } from '../types';
import { isTruncatedName } from '../names';

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function toInt(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

/**
 * Dziennik zadań (`#qb_list tr[id^="quest_log_tr"]`). `qid` to ID instancji u postaci – nie
 * kluczujemy po nim treści. Wiersze bez nazwy albo lokacji są pomijane.
 */
export function parseQuestLog(root: ParentNode): QuestLogEntry[] {
  const entries: QuestLogEntry[] = [];
  for (const row of Array.from(root.querySelectorAll('#qb_list tr[id^="quest_log_tr"]'))) {
    const name = clean(row.querySelector('.qname')?.textContent);
    const loc = row.querySelector('[data-option="go_teleport"]');
    const locId = toInt(loc?.getAttribute('data-loc'));
    const qid =
      toInt(row.querySelector('[data-qid]')?.getAttribute('data-qid')) ??
      toInt(row.id.replace(/^quest_log_tr/, ''));
    if (!name || locId === undefined || qid === undefined) continue;
    entries.push({
      qid,
      name,
      stage: clean(row.querySelector('.grey')?.textContent),
      locId,
      locName: clean(loc?.textContent),
      isMain: Array.from(row.querySelectorAll('.qb_right')).some((el) =>
        /GŁÓWNE/i.test(el.textContent ?? ''),
      ),
      isTracked: row.querySelector('[data-option="cancel_track"]') !== null,
    });
  }
  return entries;
}

/**
 * Panel „Postępy zadań” (`#quest_track_con .qtrack`): tylko śledzone zadania; nazwa w `<b>`
 * (gra skraca długie do „...”), lokacja w `data-loc`. Źródło pomocnicze – główne to dziennik.
 */
export function parseQuestTracker(root: ParentNode): QuestTrackEntry[] {
  const entries: QuestTrackEntry[] = [];
  for (const el of Array.from(root.querySelectorAll('#quest_track_con .qtrack'))) {
    const name = clean(el.querySelector('b')?.textContent);
    const locId = toInt(el.getAttribute('data-loc'));
    if (!name || locId === undefined) continue;
    entries.push({ name, truncated: isTruncatedName(name), locId });
  }
  return entries;
}
