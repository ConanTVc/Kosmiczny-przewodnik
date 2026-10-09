import { parseProgress, visibleCharacters } from '@kp/core';
import { useState } from 'preact/hooks';
import { SyncBlock } from '../components/SyncBlock';
import { usePanel } from '../context';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsView() {
  const { props, index } = usePanel();
  const theme = (props.progress.settings['theme']?.v as string | undefined) ?? 'dark';
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();

  const doImport = (text: string) => {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setMessage({ ok: false, text: 'To nie jest poprawny plik JSON.' });
      return;
    }
    const progress = parseProgress(data);
    if (!progress) {
      setMessage({
        ok: false,
        text: 'Plik nie wygląda na kopię postępu z Kosmicznego Przewodnika.',
      });
      return;
    }
    props.onImport(progress);
    setImportText('');
    setMessage({
      ok: true,
      text: `Zaimportowano – postacie: ${visibleCharacters(progress).length}. Postęp został scalony z obecnym.`,
    });
  };

  const json = () => JSON.stringify(props.progress, null, 2);

  return (
    <div class="kp-view">
      <section class="kp-block">
        <h2 class="kp-h">Wygląd</h2>
        <div class="kp-actions" role="radiogroup" aria-label="Motyw">
          {[
            ['dark', 'Ciemny'],
            ['light', 'Jasny'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              class={`kp-btn kp-btn-small ${theme === value ? 'kp-btn-on' : ''}`}
              onClick={() => props.onSetting('theme', value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {props.settingsExtra}

      <section class="kp-block">
        <h2 class="kp-h">Synchronizacja</h2>
        <SyncBlock sync={props.sync} />
      </section>

      <section class="kp-block">
        <h2 class="kp-h">Kopia zapasowa</h2>
        <div class="kp-actions">
          <button
            type="button"
            class="kp-btn kp-btn-small"
            onClick={() => download('kosmiczny-przewodnik-postep.json', json())}
          >
            Pobierz plik
          </button>
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(json()).then(
                () => setMessage({ ok: true, text: 'Skopiowano do schowka.' }),
                () => setMessage({ ok: false, text: 'Nie udało się skopiować.' }),
              );
            }}
          >
            Kopiuj
          </button>
        </div>
        <label class="kp-label">
          Import z pliku
          <input
            type="file"
            accept="application/json,.json"
            class="kp-file"
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) void file.text().then(doImport);
            }}
          />
        </label>
        <textarea
          class="kp-input kp-textarea"
          placeholder="…albo wklej skopiowany postęp"
          aria-label="Wklej postęp"
          value={importText}
          onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
        />
        <button
          type="button"
          class="kp-btn kp-btn-small"
          disabled={!importText.trim()}
          onClick={() => doImport(importText)}
        >
          Importuj
        </button>
        {message && <p class={message.ok ? 'kp-ok' : 'kp-error'}>{message.text}</p>}
      </section>

      <section class="kp-block kp-muted">
        <h2 class="kp-h">O przewodniku</h2>
        <p>
          Solucje: {index.content.chapters.length} rozdziałów, {index.content.quests.length} zadań,{' '}
          {index.content.guides.length} poradniki
          {props.contentVersion && ` · wersja treści ${props.contentVersion}`}.
        </p>
        <p>
          Przewodnik tylko czyta to, co gra pokazuje na ekranie – nigdy nic nie klika ani nie wysyła
          do gry.
        </p>
      </section>
    </div>
  );
}
