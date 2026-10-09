/**
 * Kosmiczny Przewodnik na telefon. Bez dostępu do gry: postęp zaznaczany ręcznie (później
 * także z synchronizacji), treść wbudowana, działa offline dzięki service workerowi.
 */
import {
  emptyProgress,
  parseProgress,
  SyncClient,
  visibleCharacters,
  type Progress,
  type SyncStatus,
} from '@kp/core';
import { mount, openKv, readLocal, syncPanelProps, writeLocal, type PanelProps } from '@kp/ui';
import { registerSW } from 'virtual:pwa-register';
import { AppSettings, UpdateBanner, Welcome } from './Banners';
import { CONTENT, CONTENT_VERSION } from './content';
import { ACTIVE_KEY, PROGRESS_KEY, PhoneStore } from './store';

/** Jak często (gdy aplikacja jest otwarta) pytamy o nową wersję. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const APP_KEY = 'app';
const SYNC_KEY = 'syncCode';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) return;
  host.replaceChildren();

  const kv = await openKv();
  const progress = parseProgress(await kv.get(PROGRESS_KEY)) ?? emptyProgress();
  const activeKey = await kv.get<string>(ACTIVE_KEY);

  let render = () => {};
  // Synchronizacja z komputerem – w tle; wysyła tylko zmiany, nigdy nie nadpisuje.
  let sync: SyncClient | undefined;
  let syncStatus: SyncStatus = { state: 'off' };
  let lastSynced: Progress | undefined;
  let applyingRemote = false;
  const store = new PhoneStore(kv, { progress, activeKey }, () => {
    render();
    if (sync && !applyingRemote && store.progress !== lastSynced) {
      lastSynced = store.progress;
      sync.notifyChange();
    }
  });
  if (__KP_SYNC_URL__) {
    sync = new SyncClient({
      baseUrl: __KP_SYNC_URL__,
      getLocal: () => store.progress,
      applyRemote: (remote) => {
        applyingRemote = true;
        try {
          store.importProgress(remote);
        } finally {
          applyingRemote = false;
          lastSynced = store.progress;
        }
      },
      loadCode: () => kv.get<string>(SYNC_KEY),
      saveCode: (code) => kv.set(SYNC_KEY, code ?? null),
      onStatus: (status) => {
        syncStatus = status;
        render();
      },
    });
  }
  const app = readLocal(APP_KEY, { welcomed: false });
  const welcome = () => {
    app.welcomed = true;
    writeLocal(APP_KEY, app);
    render();
  };
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
        {!app.welcomed && !syncStatus.code && (
          <Welcome
            onStart={welcome}
            onConnect={
              sync &&
              ((code) => {
                void sync!.connect(code).then((ok) => ok && welcome());
              })
            }
          />
        )}
        {!app.welcomed && syncStatus.state === 'error' && syncStatus.message && (
          <p class="kp-error kp-wizard">{syncStatus.message}</p>
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
    onLinkCharacter: (from, to) => store.linkCharacter(from, to),
    sync: sync && syncPanelProps(sync, syncStatus),
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

  if (sync) {
    const client = sync;
    void client.start().then(() => {
      // Link z kodu QR na komputerze: …/app/#kod=KOSMO-… → łączymy i czyścimy adres.
      const fromLink = /(?:^#|&)kod=([^&]+)/.exec(location.hash)?.[1];
      if (fromLink) {
        history.replaceState(null, '', location.pathname + location.search);
        void client.connect(decodeURIComponent(fromLink)).then((ok) => ok && welcome());
      }
    });
    window.addEventListener('online', () => void client.syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void client.syncNow();
    });
  }
}

start().catch((error: unknown) => {
  console.error('[Kosmiczny Przewodnik]', error);
  const host = document.getElementById('app');
  if (host)
    host.innerHTML =
      '<p class="boot">Nie udało się uruchomić przewodnika. Odśwież stronę – Twój postęp jest zapisany.</p>';
});
