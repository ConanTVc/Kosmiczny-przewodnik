/**
 * Obserwator strony: gdy gracz otworzy Teleportacje, Dziennik zadań albo gdy zmieni się panel
 * „Postępy zadań”, czytamy je parserami z core. Tylko obserwujemy – nic nie klikamy.
 */
import {
  isTeleportListFiltered,
  parseQuestLog,
  parseQuestTracker,
  parseTeleportList,
  type QuestLogEntry,
  type QuestTrackEntry,
  type TeleportEntry,
} from '@kp/core';

export type DomScanPart =
  | { kind: 'teleports'; at: number; entries: TeleportEntry[]; filtered: boolean }
  | { kind: 'questLog'; at: number; entries: QuestLogEntry[] }
  | { kind: 'tracker'; at: number; entries: QuestTrackEntry[] };

/** Tani odcisk elementu – parsujemy tylko, gdy treść faktycznie się zmieniła. */
function fingerprint(el: Element | null): string | undefined {
  if (!el) return undefined;
  return `${el.childElementCount}:${el.textContent?.length ?? 0}:${el.querySelectorAll('.hasq1, .current, [data-option="cancel_track"]').length}`;
}

export function observeGameDom(
  onScan: (part: DomScanPart) => void,
  root: Document = document,
  debounceMs = 400,
): () => void {
  const last: Record<string, string | undefined> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    try {
      const now = Date.now();
      const tp = root.getElementById('tp_list');
      const tpPrint = fingerprint(tp);
      if (tpPrint && tpPrint !== last['tp']) {
        last['tp'] = tpPrint;
        const entries = parseTeleportList(root);
        if (entries.length)
          onScan({ kind: 'teleports', at: now, entries, filtered: isTeleportListFiltered(root) });
      }
      const qb = root.getElementById('qb_list');
      const qbPrint = fingerprint(qb);
      if (qbPrint && qbPrint !== last['qb']) {
        last['qb'] = qbPrint;
        onScan({ kind: 'questLog', at: now, entries: parseQuestLog(root) });
      }
      const track = root.getElementById('quest_track_con');
      const trackPrint = fingerprint(track);
      if (trackPrint && trackPrint !== last['track']) {
        last['track'] = trackPrint;
        onScan({ kind: 'tracker', at: now, entries: parseQuestTracker(root) });
      }
      if (!tp) last['tp'] = undefined;
      if (!qb) last['qb'] = undefined;
    } catch {
      // Błąd parsera nie może dotknąć gry.
    }
  };

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(check, debounceMs);
  });
  observer.observe(root.body ?? root.documentElement, { childList: true, subtree: true });
  check();
  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}
