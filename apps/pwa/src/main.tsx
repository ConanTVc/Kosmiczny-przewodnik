/**
 * Kosmiczny Przewodnik na telefon. Bez dostępu do gry: postęp zaznaczany ręcznie (później
 * także z synchronizacji), treść wbudowana, działa offline dzięki service workerowi.
 */
import { emptyProgress, parseProgress, visibleCharacters } from '@kp/core';
import { mount, openKv, readLocal, writeLocal, type PanelProps } from '@kp/ui';
import { registerSW } from 'virtual:pwa-register';
import { AppSettings, UpdateBanner, Welcome } from './Banners';
import { CONTENT, CONTENT_VERSION } from './content';
import { ACTIVE_KEY, PROGRESS_KEY, PhoneStore } from './store';

/** Jak często (gdy aplikacja jest otwarta) pytamy o nową wersję. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const APP_KEY = 'app';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) return;
  host.replaceChildren();

  const kv = await openKv();
  const progress = parseProgress(await kv.get(PROGRESS_KEY)) ?? emptyProgress();
  const activeKey = await kv.get<string>(ACTIVE_KEY);

  let render = () => {};
  const store = new PhoneStore(kv, { progress, activeKey }, () => render());
  const app = readLocal(APP_KEY, { welcomed: false });
  let needRefresh = false;
  // Strona już obsługiwana przez service workera = wszystko jest w pamięci podręcznej.
  let offlineReady = !!navigator.serviceWorker?.controller;
  let registration: ServiceWorkerRegistration | undefined;

  const updateSW = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      render();
    },
    onOfflineReady() {
      offlineReady = true;
      render();
    },
    onRegisterError(error: unknown) {
      console.warn('[Kosmiczny Przewodnik] tryb offline niedostępny:', error);
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (reg) setInterval(() => void reg.update().catch(() => {}), UPDATE_CHECK_MS);
    },
  });

  const props = (): PanelProps => ({
    content: CONTENT,
    contentVersion: CONTENT_VERSION,
    progress: store.progress,
    activeCharacter: store.activeKey,
    layout: 'app',
    initialTab: visibleCharacters(store.progress).length ? 'here' : 'characters',
    header: (
      <>
        {needRefresh && (
          <UpdateBanner
            onUpdate={() => void updateSW(true)}
            onLater={() => {
              needRefresh = false;
              render();
            }}
          />
        )}
        {!app.welcomed && (
          <Welcome
            onStart={() => {
              app.welcomed = true;
              writeLocal(APP_KEY, app);
              render();
            }}
          />
        )}
      </>
    ),
    settingsExtra: (
      <AppSettings
        offlineReady={offlineReady}
        onCheckUpdate={
          registration ? () => registration!.update().then(() => undefined) : undefined
        }
      />
    ),
    onSetManual: (slug, status) => store.setManual(slug, status),
    onSetStep: (slug, step, done, total) => store.setStep(slug, step, done, total),
    onSetLists: (slug, lists) => store.setLists(slug, lists),
    onSelectCharacter: (key) => store.select(key),
    onSetTracked: (key, tracked) => store.setTracked(key, tracked),
    onSetting: (name, value) => store.setSetting(name, value),
    onImport: (imported) => store.importProgress(imported),
    onAddCharacter: (c) => store.addCharacter(c),
    onSetReborn: (key, reborn) => store.setReborn(key, reborn),
    onRemoveCharacter: (key) => store.removeCharacter(key),
    onPickLocation: (locId) => store.pickLocation(locId),
  });

  const handle = mount(host, props());
  render = () => handle.update(props());

  // Telefon potrafi zabić kartę bez ostrzeżenia – zapisujemy przy schowaniu aplikacji.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.saveNow();
    else void registration?.update().catch(() => {});
  });
  window.addEventListener('pagehide', () => void store.saveNow());
}

start().catch((error: unknown) => {
  console.error('[Kosmiczny Przewodnik]', error);
  const host = document.getElementById('app');
  if (host)
    host.innerHTML =
      '<p class="boot">Nie udało się uruchomić przewodnika. Odśwież stronę – Twój postęp jest zapisany.</p>';
});
