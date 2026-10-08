import type { BuiltChapter, BuiltQuest } from '@kp/content';
import type { CharacterProgress, ContentIndex, QuestLogEntry, QuestStatusResult } from '@kp/core';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { PanelProps, TabId } from './types';

export interface ActiveCharacter extends CharacterProgress {
  key: string;
}

/** Dane wyliczone raz w App i dostępne dla wszystkich widoków. */
export interface PanelData {
  props: PanelProps;
  index: ContentIndex;
  character?: ActiveCharacter;
  statuses: Record<string, QuestStatusResult>;
  unmatched: QuestLogEntry[];
  /** Rozdziały dla rasy postaci (albo wszystkie, gdy brak postaci). */
  chapters: BuiltChapter[];
  /** Zadania dotyczące postaci (teraz + przed tobą). */
  relevant: BuiltQuest[];
  locName(id: number): string;
  /** Otwiera lokację w zakładce „Tutaj”. */
  openLocation(locId: number): void;
  /** Otwiera lokację zadania w „Tutaj” z tym zadaniem rozwiniętym. */
  openQuest(slug: string): void;
  /** Zadanie do rozwinięcia i przewinięcia w „Tutaj”. */
  focusSlug?: string;
  goTo(tab: TabId): void;
}

export const PanelContext = createContext<PanelData | null>(null);

export function usePanel(): PanelData {
  const data = useContext(PanelContext);
  if (!data) throw new Error('Brak PanelContext');
  return data;
}
