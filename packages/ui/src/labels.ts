import { RACES, REBORNS, type QuestKind } from '@kp/content';
import type { QuestStatus } from '@kp/core';

export const STATUS_LABEL: Record<QuestStatus, string> = {
  active: 'W trakcie',
  done: 'Zrobione',
  available: 'Do zrobienia',
  locked: 'Przed tobą',
  unknown: 'Nie wiem',
};

export const KIND_LABEL: Record<QuestKind, string> = {
  main: 'Główne',
  side: 'Poboczne',
  daily: 'Codzienne',
  repeatable: 'Powtarzalne',
};

/** Litery rebornów jak w grze (Nonborn bez litery). */
export const REBORN_LETTER = ['N', 'R', 'G', 'U', 'S', 'H', 'M'] as const;

export const raceName = (race: number) => RACES[race] ?? `Rasa ${race}`;
export const rebornName = (reborn: number) => REBORNS[reborn] ?? `Reborn ${reborn}`;

export function formatDate(ms: number): string {
  if (!ms) return '–';
  return new Date(ms).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
