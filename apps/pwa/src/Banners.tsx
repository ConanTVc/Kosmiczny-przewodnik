/** Elementy aplikacji na telefon wyświetlane w panelu (nagłówek i ustawienia). */
import { useState } from 'preact/hooks';

/** Pierwsze uruchomienie: synchronizacja jeszcze nie działa – gracz zaczyna bez niej. */
export function Welcome({ onStart }: { onStart(): void }) {
  return (
    <section class="kp-wizard kp-wizard-ask">
      <p>
        <strong>Witaj w Kosmicznym Przewodniku!</strong>
      </p>
      <p>
        Masz tu solucje, poradniki i swój postęp – także bez internetu. Na telefonie zaznaczasz
        postęp ręcznie. Synchronizacja z panelem w grze na komputerze pojawi się wkrótce: wpiszesz
        wtedy kod i postęp przejdzie tu sam.
      </p>
      <div class="kp-actions">
        <button type="button" class="kp-btn kp-btn-small kp-btn-on" onClick={onStart}>
          Używaj bez synchronizacji
        </button>
      </div>
    </section>
  );
}

/** Service worker pobrał nową wersję (np. nowe solucje) – czeka na zgodę gracza. */
export function UpdateBanner({ onUpdate, onLater }: { onUpdate(): void; onLater(): void }) {
  return (
    <section class="kp-wizard kp-wizard-ask" role="status">
      <p>Jest nowa wersja przewodnika (solucje i poprawki).</p>
      <div class="kp-actions">
        <button type="button" class="kp-btn kp-btn-small kp-btn-on" onClick={onUpdate}>
          Odśwież teraz
        </button>
        <button type="button" class="kp-btn kp-btn-small kp-btn-ghost" onClick={onLater}>
          Później
        </button>
      </div>
    </section>
  );
}

export function AppSettings({
  offlineReady,
  onCheckUpdate,
}: {
  offlineReady: boolean;
  onCheckUpdate?(): Promise<void>;
}) {
  const [checked, setChecked] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  return (
    <section class="kp-block">
      <h2 class="kp-h">Aplikacja</h2>
      <p class="kp-muted">
        {offlineReady
          ? 'Gotowa do pracy bez internetu.'
          : 'Działa bez internetu po pierwszym pełnym załadowaniu.'}{' '}
        Nowe solucje pobiorą się same, gdy będziesz online – wtedy na górze pojawi się pytanie o
        odświeżenie.
      </p>
      <p class="kp-muted">
        Instalacja: na Androidzie w Chrome menu ⋮ → „Zainstaluj aplikację”. Na iPhonie w Safari
        Udostępnij → „Do ekranu początkowego”.
      </p>
      {onCheckUpdate && (
        <div class="kp-actions">
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-ghost"
            disabled={checked === 'checking'}
            onClick={() => {
              setChecked('checking');
              onCheckUpdate().then(
                () => setChecked('done'),
                () => setChecked('error'),
              );
            }}
          >
            Sprawdź aktualizacje
          </button>
          {checked === 'done' && (
            <span class="kp-muted">Sprawdzone – nowsza wersja pokaże się na górze.</span>
          )}
          {checked === 'error' && <span class="kp-muted">Brak internetu – spróbuj później.</span>}
        </div>
      )}
    </section>
  );
}
