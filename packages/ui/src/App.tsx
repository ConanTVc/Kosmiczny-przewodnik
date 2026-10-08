import { computeStatuses, filterForCharacter, indexContent } from '@kp/core';
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { PanelContext, type PanelData } from './context';
import { REBORN_LETTER, raceName } from './labels';
import type { PanelProps, TabId } from './types';
import { AheadView } from './views/Ahead';
import { CharactersView } from './views/Characters';
import { GuidesView } from './views/Guides';
import { HereView } from './views/Here';
import { ProgressView } from './views/Progress';
import { SettingsView } from './views/Settings';

const TABS: [TabId, string][] = [
  ['here', 'Tutaj'],
  ['progress', 'Postęp'],
  ['ahead', 'Przed tobą'],
  ['guides', 'Poradniki'],
  ['characters', 'Postacie'],
  ['settings', 'Ustawienia'],
];

/** Błąd w panelu nie może zepsuć gry ani reszty panelu. */
class ErrorBoundary extends Component<{ children: ComponentChildren }, { error?: string }> {
  override state: { error?: string } = {};
  override componentDidCatch(error: unknown) {
    this.setState({ error: error instanceof Error ? error.message : String(error) });
  }
  override render() {
    if (this.state.error) {
      return (
        <div class="kp-empty">
          <p>Coś poszło nie tak w panelu przewodnika. Gra działa normalnie.</p>
          <p class="kp-muted">{this.state.error}</p>
          <button
            type="button"
            class="kp-btn kp-btn-small"
            onClick={() => this.setState({ error: undefined })}
          >
            Spróbuj ponownie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App(props: PanelProps) {
  const index = useMemo(() => indexContent(props.content), [props.content]);
  const key = props.activeCharacter;
  const progressChar = key ? props.progress.characters[key] : undefined;
  const race = progressChar?.race.v;
  const reborn = progressChar?.reborn.v;

  const view = useMemo(
    () =>
      race !== undefined && reborn !== undefined
        ? filterForCharacter(props.content, race, reborn)
        : undefined,
    [props.content, race, reborn],
  );
  const { statuses, unmatched } = useMemo(
    () =>
      race !== undefined && reborn !== undefined
        ? computeStatuses({
            index,
            character: { race, reborn },
            scan: props.scan,
            progress: progressChar,
            now: Date.now(),
          })
        : { statuses: {}, unmatched: [] },
    [index, race, reborn, props.scan, progressChar],
  );

  const [tab, setTab] = useState<TabId>(props.initialTab ?? 'here');
  const [viewLoc, setViewLoc] = useState<number | undefined>();
  // Gdy postać przejdzie do innej lokacji w grze, „Tutaj” znowu pokazuje bieżącą.
  useEffect(() => setViewLoc(undefined), [props.currentLoc, key]);

  const theme = (props.progress.settings['theme']?.v as string | undefined) ?? 'dark';
  const locId = viewLoc ?? props.currentLoc ?? progressChar?.lastLoc.v ?? undefined;

  const data: PanelData = {
    props,
    index,
    character: progressChar && key ? { ...progressChar, key } : undefined,
    statuses,
    unmatched,
    chapters: view?.chapters ?? props.content.chapters,
    relevant: view ? [...view.current, ...view.ahead] : [],
    locName: (id) => index.locations.get(id)?.name ?? `Lokacja ${id}`,
    openLocation: (id) => {
      setViewLoc(id);
      setTab('here');
    },
    goTo: setTab,
  };

  const layout = props.layout ?? 'panel';
  return (
    <PanelContext.Provider value={data}>
      <div class={`kp-app kp-layout-${layout}`} data-theme={theme}>
        <header class="kp-top">
          <div class="kp-brand">Kosmiczny Przewodnik</div>
          {progressChar && (
            <div
              class="kp-who"
              title={`${raceName(progressChar.race.v)}, ${progressChar.reborn.v}`}
            >
              {progressChar.name.v} · {raceName(progressChar.race.v)}{' '}
              {REBORN_LETTER[progressChar.reborn.v]}
            </div>
          )}
          {props.onClose && (
            <button
              type="button"
              class="kp-icon-btn"
              aria-label="Zamknij panel"
              onClick={props.onClose}
            >
              ×
            </button>
          )}
        </header>
        {props.header}
        <nav class="kp-tabs" aria-label="Zakładki">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              class={`kp-tab ${tab === id ? 'kp-tab-on' : ''}`}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <main class="kp-main">
          <ErrorBoundary>
            {tab === 'here' && <HereView locId={locId} onPick={setViewLoc} />}
            {tab === 'progress' && <ProgressView />}
            {tab === 'ahead' && <AheadView />}
            {tab === 'guides' && <GuidesView />}
            {tab === 'characters' && <CharactersView />}
            {tab === 'settings' && <SettingsView />}
          </ErrorBoundary>
        </main>
      </div>
    </PanelContext.Provider>
  );
}
