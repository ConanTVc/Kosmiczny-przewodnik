/**
 * Kosmiczny Przewodnik – skrypt do gry Kosmiczni.
 * Tylko czyta: dane z białej listy `GAME` (adapter w game.ts) i to, co gra pokazuje na stronie
 * (observer.ts). Nigdy nic nie klika, nie wysyła do serwera gry i nie zmienia `GAME`.
 * Jedyna ingerencja w stronę to własny panel. Każdy błąd jest połykany – gra działa dalej.
 */
import { emptyProgress, isRemoved, parseProgress } from '@kp/core';
import { mount, openKv, type PanelProps } from '@kp/ui';
import { EMBEDDED, fetchRemoteContent, loadCachedContent } from './content';
import { Controller } from './controller';
import { watchGame } from './game';
import { observeGameDom } from './observer';
import { createPanelShell, type PanelShell } from './panel';
import { Wizard } from './Wizard';

function PanelSettings({ shell }: { shell: PanelShell }) {
  const ui = shell.ui;
  return (
    <section class="kp-block">
      <h2 class="kp-h">Panel w grze</h2>
      <div class="kp-actions" role="radiogroup" aria-label="Strona ekranu">
        {(
          [
            ['left', 'Po lewej'],
            ['right', 'Po prawej'],
          ] as const
        ).map(([side, label]) => (
          <button
            key={side}
            type="button"
            role="radio"
            aria-checked={ui.side === side}
            class={`kp-btn kp-btn-small ${ui.side === side ? 'kp-btn-on' : ''}`}
            onClick={() => shell.setUi({ side })}
          >
            {label}
          </button>
        ))}
      </div>
      <p class="kp-muted">
        Schowaj: klik w belkę „Kosmiczny Przewodnik” albo ×. Pokaż: zakładka ⋮ w rogu ekranu. Skrót:
        Alt+K. Szerokość zmienisz, przeciągając krawędź panelu.
      </p>
    </section>
  );
}

async function start(): Promise<void> {
  if (document.getElementById('kp-panel-host')) return; // już działa (np. dwa menedżery skryptów)

  const kv = await openKv();
  const progress = parseProgress(await kv.get('progress')) ?? emptyProgress();
  const loaded = await loadCachedContent(kv);
  const knownTeleports = (await kv.get<Record<string, number[]>>('knownTeleports')) ?? {};

  let render = () => {};
  const shell = createPanelShell(() => render());
  const controller = new Controller(kv, { progress, loaded, knownTeleports }, () => render());

  const props = (): PanelProps => {
    const c = controller;
    const gameChar = c.gameCharacter;
    const active = c.activeKey ?? gameChar?.key;
    const isGameChar = !!gameChar && active === gameChar.key;
    const stored = gameChar ? c.progress.characters[gameChar.key] : undefined;
    const tracked = !!stored?.tracked.v;
    return {
      content: c.loaded.content,
      contentVersion: `${c.loaded.version} (${c.loaded.source})`,
      progress: c.progress,
      activeCharacter: active,
      currentLoc: isGameChar ? gameChar.loc : undefined,
      scan: isGameChar && active ? c.buildScan(active) : undefined,
      layout: 'panel',
      header: (
        <Wizard
          game={c.game}
          tracked={tracked}
          pendingNew={!!gameChar && c.pendingNew === gameChar.key}
          scan={gameChar ? c.scans.get(gameChar.key) : undefined}
          result={c.lastResult}
          removed={isRemoved(stored)}
          onRestore={() => c.restoreGameCharacter()}
          lastFullScan={stored?.lastScan.v}
          collapsed={shell.ui.wizardCollapsed}
          onToggle={() => shell.setUi({ wizardCollapsed: !shell.ui.wizardCollapsed })}
          onTrack={(choice) => c.answerTrack(choice)}
        />
      ),
      settingsExtra: <PanelSettings shell={shell} />,
      onSetManual: (slug, status) => c.setManual(slug, status),
      onSetStep: (slug, step, done, total) => c.setStep(slug, step, done, total),
      onSetLists: (slug, lists) => c.setLists(slug, lists),
      onSelectCharacter: (key) => c.selectCharacter(key),
      onSetTracked: (key, value) => c.setCharacterTracked(key, value),
      onSetting: (name, value) => c.setSetting(name, value),
      onImport: (imported) => c.importProgress(imported),
      onClose: () => shell.setUi({ open: false }),
      onCollapse: () => shell.setUi({ open: false }),
      onRemoveCharacter: (key) => c.removeCharacter(key),
    };
  };

  const handle = mount(shell.host, props());
  render = () => {
    try {
      handle.update(props());
    } catch {
      // błąd panelu nie może dotknąć gry
    }
  };

  watchGame((snapshot, changes) => {
    // Bez wybranej postaci (ekran logowania / wyboru postaci) panelu nie widać wcale.
    shell.setPresent(!!snapshot?.character);
    controller.onGame(snapshot, changes);
  });
  observeGameDom((part) => controller.onDom(part));
  window.addEventListener('pagehide', () => void controller.saveNow());

  // Nowsza treść z GitHub Pages – w tle; bez sieci zostaje obecna.
  if (!import.meta.env.DEV) {
    void fetchRemoteContent(loaded.version === EMBEDDED.version ? EMBEDDED : loaded, kv).then(
      (next) => next && controller.setContent(next),
    );
  }
}

function boot() {
  start().catch((error: unknown) => {
    console.warn('[Kosmiczny Przewodnik] nie udało się uruchomić:', error);
  });
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
