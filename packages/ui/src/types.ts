import type { BuiltContent } from '@kp/content';
import type { ManualStatus, Progress, Scan } from '@kp/core';
import type { ComponentChildren } from 'preact';

export type TabId = 'here' | 'progress' | 'ahead' | 'search' | 'characters' | 'settings';

/** Stan synchronizacji – podaje go aplikacja (Prompt 5); brak = synchronizacja niedostępna. */
export interface SyncProps {
  code?: string;
  state: 'off' | 'synced' | 'syncing' | 'offline' | 'error';
  message?: string;
  onCreate?(): void;
  onConnect?(code: string): void;
  onDisconnect?(): void;
}

/**
 * Wszystko, czego panel potrzebuje. Panel nie wie, skąd dane pochodzą (gra, telefon,
 * synchronizacja) – dostaje treść, postęp i funkcje zwrotne.
 */
export interface PanelProps {
  content: BuiltContent;
  /** Wersja treści z manifestu – pokazywana w ustawieniach. */
  contentVersion?: string;
  progress: Progress;
  /** Klucz wybranej postaci (`s18:c3465`). */
  activeCharacter?: string;
  /** Bieżąca lokacja z gry; brak = ostatnia znana z postępu. */
  currentLoc?: number;
  /** Ostatni odczyt gry – statusy na żywo (userscript). */
  scan?: Scan;
  /** `panel` – wąski panel w grze, `app` – aplikacja na telefon (dolny pasek). */
  layout?: 'panel' | 'app';
  /** Dodatkowa treść nad zakładkami, np. kreator skanu w userscripcie. */
  header?: ComponentChildren;
  sync?: SyncProps;
  initialTab?: TabId;
  onSetManual(slug: string, status: ManualStatus | null): void;
  /** Odhaczenie kroku zadania (numer od 0); `total` – liczba kroków (wszystkie = zadanie zrobione). */
  onSetStep(slug: string, step: number, done: boolean, total: number): void;
  /** Własne listy gracza dla zadania (np. „Na później”). */
  onSetLists(slug: string, lists: string[]): void;
  onSelectCharacter(key: string): void;
  onSetTracked(key: string, tracked: boolean): void;
  onSetting(name: string, value: unknown): void;
  /** Import kopii zapasowej – dostaje już zwalidowany postęp. */
  onImport(progress: Progress): void;
  onClose?(): void;
}
