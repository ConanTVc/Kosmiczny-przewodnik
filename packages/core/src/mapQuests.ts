import type { MapQuest } from './types';

/**
 * Czyta `GAME.map_quests` (pozycja na mapie → lista zadań). Kopiuje WYŁĄCZNIE pola z białej listy
 * – `qb_id`, `rtype`, `main`, `name` – i pomija błędne wpisy, zamiast się wywracać.
 * `main: 1` = główne, `main: 0` = poboczne, `main: 0` + `rtype: 1` = codzienne.
 */
export function parseMapQuests(raw: unknown): MapQuest[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: MapQuest[] = [];
  const seen = new Set<number>();
  for (const list of Object.values(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const { qb_id, rtype, main, name } = item as Record<string, unknown>;
      const qid = Number(qb_id);
      if (!Number.isInteger(qid) || qid <= 0 || typeof name !== 'string' || !name.trim()) continue;
      if (seen.has(qid)) continue;
      seen.add(qid);
      const isMain = Number(main) === 1;
      out.push({ qid, name: name.trim(), isMain, isDaily: !isMain && Number(rtype) === 1 });
    }
  }
  return out;
}
