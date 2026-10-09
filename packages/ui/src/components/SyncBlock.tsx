import { useState } from 'preact/hooks';
import { formatDate } from '../labels';
import type { SyncProps } from '../types';
import { Qr } from './Qr';

const SYNC_STATE: Record<SyncProps['state'], string> = {
  off: 'Wyłączona',
  synced: 'Zsynchronizowano',
  syncing: 'Synchronizuję…',
  offline: 'Czeka na internet',
  error: 'Błąd synchronizacji',
};

/** Synchronizacja postępu kodem (bez kont): tworzenie, łączenie, QR dla telefonu, odłączanie. */
export function SyncBlock({ sync }: { sync?: SyncProps }) {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState<'disconnect' | 'forget'>();
  const [copied, setCopied] = useState(false);

  if (!sync)
    return <p class="kp-muted">Synchronizacja między komputerem a telefonem pojawi się wkrótce.</p>;

  const busy = sync.state === 'syncing';
  const status = (
    <p class={`kp-sync-state kp-sync-${sync.state}`} role="status">
      <span class="kp-sync-dot" aria-hidden="true" />
      {SYNC_STATE[sync.state]}
      {sync.lastSync && !busy && (
        <span class="kp-muted"> · ostatnio {formatDate(sync.lastSync)}</span>
      )}
    </p>
  );
  const message = sync.message && sync.state !== 'synced' && (
    <p class={sync.state === 'error' ? 'kp-error' : 'kp-muted'}>{sync.message}</p>
  );

  if (sync.code) {
    const copy = () => {
      navigator.clipboard?.writeText(sync.code!).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => {},
      );
    };
    return (
      <>
        {status}
        {message}
        <div class="kp-sync-code">
          <code class="kp-code">{sync.code}</code>
          <button type="button" class="kp-btn kp-btn-small kp-btn-ghost" onClick={copy}>
            {copied ? 'Skopiowano' : 'Kopiuj'}
          </button>
        </div>
        {sync.shareUrl && (
          <div class="kp-sync-share">
            <Qr text={sync.shareUrl} label="Kod QR do połączenia aplikacji na telefonie" />
            <p class="kp-muted">
              Na telefonie zeskanuj ten kod aparatem – otworzy się aplikacja i sama się połączy.
              Możesz też wpisać w niej kod ręcznie.
            </p>
          </div>
        )}
        <p class="kp-muted">
          Nie pokazuj kodu innym – kto go zna, widzi i może zmieniać Twój postęp.
        </p>
        <div class="kp-actions">
          {sync.onSyncNow && (
            <button
              type="button"
              class="kp-btn kp-btn-small"
              disabled={busy}
              onClick={() => sync.onSyncNow?.()}
            >
              Synchronizuj teraz
            </button>
          )}
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-ghost"
            onClick={() => setConfirm('disconnect')}
          >
            Odłącz to urządzenie
          </button>
          {sync.onForget && (
            <button
              type="button"
              class="kp-btn kp-btn-small kp-btn-ghost kp-btn-danger"
              onClick={() => setConfirm('forget')}
            >
              Usuń dane z serwera
            </button>
          )}
        </div>
        {confirm && (
          <div class="kp-confirm" role="alert">
            <p>
              {confirm === 'disconnect'
                ? 'To urządzenie przestanie się synchronizować. Postęp zostaje tutaj i na serwerze.'
                : 'Postęp zniknie z serwera, a wszystkie urządzenia z tym kodem przestaną się synchronizować. Postęp na tym urządzeniu zostaje.'}
            </p>
            <div class="kp-actions">
              <button
                type="button"
                class={`kp-btn kp-btn-small ${confirm === 'forget' ? 'kp-btn-danger-on' : 'kp-btn-on'}`}
                onClick={() => {
                  setConfirm(undefined);
                  if (confirm === 'forget') sync.onForget?.();
                  else sync.onDisconnect?.();
                }}
              >
                {confirm === 'forget' ? 'Usuń z serwera' : 'Odłącz'}
              </button>
              <button
                type="button"
                class="kp-btn kp-btn-small kp-btn-ghost"
                onClick={() => setConfirm(undefined)}
              >
                Anuluj
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {busy && status}
      {message}
      <p class="kp-muted">
        Kod synchronizacji łączy komputer i telefon – postęp z obu stron się scala, nic nie
        przepada. Bez konta i hasła.
      </p>
      <button type="button" class="kp-btn" disabled={busy} onClick={() => sync.onCreate?.()}>
        Utwórz kod synchronizacji
      </button>
      <form
        class="kp-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) sync.onConnect?.(code.trim());
        }}
      >
        <input
          class="kp-input"
          placeholder="Mam kod: KOSMO-…"
          aria-label="Kod synchronizacji"
          autoComplete="off"
          spellcheck={false}
          value={code}
          onInput={(e) => setCode((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="kp-btn kp-btn-small" disabled={busy}>
          Połącz
        </button>
      </form>
    </>
  );
}
