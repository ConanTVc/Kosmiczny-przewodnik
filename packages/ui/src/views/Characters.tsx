import { RACES, REBORNS } from '@kp/content';
import { visibleCharacters } from '@kp/core';
import { useState } from 'preact/hooks';
import { usePanel } from '../context';
import { REBORN_LETTER, formatDate, raceName } from '../labels';
import type { NewCharacter } from '../types';

const selectValue = (e: Event) => Number((e.currentTarget as HTMLSelectElement).value);

function RebornOptions() {
  return (
    <>
      {REBORNS.map((name, i) => (
        <option key={name} value={i}>
          {REBORN_LETTER[i]} – {name}
        </option>
      ))}
    </>
  );
}

/** Ręczne dodanie postaci – na telefonie, bez gry. */
function AddCharacter({ onAdd, onCancel }: { onAdd(c: NewCharacter): void; onCancel?(): void }) {
  const [name, setName] = useState('');
  const [race, setRace] = useState(0);
  const [reborn, setReborn] = useState(0);
  const [server, setServer] = useState('');
  return (
    <form
      class="kp-block kp-form"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        const s = Number.parseInt(server, 10);
        onAdd({ name: trimmed, race, reborn, server: s > 0 ? s : undefined });
      }}
    >
      <h2 class="kp-h">Dodaj postać</h2>
      <label class="kp-label">
        Nazwa postaci
        <input
          class="kp-input"
          required
          maxLength={40}
          autoComplete="off"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="kp-form-row">
        <label class="kp-label">
          Rasa
          <select class="kp-input" value={race} onChange={(e) => setRace(selectValue(e))}>
            {RACES.map((r, i) => (
              <option key={r} value={i}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label class="kp-label">
          Reborn
          <select class="kp-input" value={reborn} onChange={(e) => setReborn(selectValue(e))}>
            <RebornOptions />
          </select>
        </label>
        <label class="kp-label">
          Serwer (opcjonalnie)
          <input
            class="kp-input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={server}
            onInput={(e) => setServer((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <div class="kp-actions">
        <button type="submit" class="kp-btn kp-btn-on">
          Dodaj postać
        </button>
        {onCancel && (
          <button type="button" class="kp-btn kp-btn-ghost" onClick={onCancel}>
            Anuluj
          </button>
        )}
      </div>
    </form>
  );
}

export function CharactersView() {
  const { props, goTo } = usePanel();
  const [adding, setAdding] = useState(false);
  /** Postać, przy której gracz kliknął „Usuń” – czeka na potwierdzenie. */
  const [confirmRemove, setConfirmRemove] = useState<string>();
  /** Ręczna postać, którą gracz łączy z postacią z gry (wybór docelowej). */
  const [linking, setLinking] = useState<{ from: string; to: string }>();
  const entries = visibleCharacters(props.progress).sort(([, a], [, b]) => b.lastSeen - a.lastSeen);
  const gameChars = entries.filter(([k]) => k.split(':')[1]?.startsWith('c'));
  const add =
    props.onAddCharacter &&
    ((c: NewCharacter) => {
      props.onAddCharacter?.(c);
      setAdding(false);
      goTo('here');
    });

  if (!entries.length) {
    return add ? (
      <div class="kp-view">
        <p class="kp-muted">
          Dodaj postać, której postęp chcesz śledzić. Dane zostają na tym telefonie – nic nie jest
          wysyłane do gry.
        </p>
        <AddCharacter onAdd={add} />
      </div>
    ) : (
      <p class="kp-empty">
        Nie ma jeszcze żadnej postaci. Wejdź do gry z włączonym skryptem albo połącz się kodem
        synchronizacji.
      </p>
    );
  }

  return (
    <div class="kp-view">
      <ul class="kp-rows">
        {entries.map(([key, c]) => {
          const active = key === props.activeCharacter;
          const [server, id] = key.split(':');
          const manual = id?.startsWith('m');
          return (
            <li
              key={key}
              class={`kp-char ${active ? 'kp-char-on' : ''} ${c.tracked.v ? '' : 'kp-char-off'}`}
            >
              <div class="kp-char-main">
                <strong>{c.name.v}</strong>
                <span class="kp-muted">
                  {raceName(c.race.v)} · {REBORN_LETTER[c.reborn.v]}
                  {server !== 's0' && ` · serwer ${server?.slice(1)}`}
                  {manual ? ' · dodana ręcznie' : ` · widziana ${formatDate(c.lastSeen)}`}
                </span>
              </div>
              <div class="kp-actions">
                {props.onSetReborn && (
                  <select
                    class="kp-input kp-input-small"
                    aria-label={`Reborn postaci ${c.name.v}`}
                    value={c.reborn.v}
                    onChange={(e) => props.onSetReborn?.(key, selectValue(e))}
                  >
                    <RebornOptions />
                  </select>
                )}
                {!active && c.tracked.v && (
                  <button
                    type="button"
                    class="kp-btn kp-btn-small"
                    onClick={() => props.onSelectCharacter(key)}
                  >
                    Wybierz
                  </button>
                )}
                {active && <span class="kp-chip kp-chip-active">Wybrana</span>}
                <button
                  type="button"
                  class="kp-btn kp-btn-small kp-btn-ghost"
                  onClick={() => props.onSetTracked(key, !c.tracked.v)}
                >
                  {c.tracked.v ? 'Nie śledź' : 'Śledź'}
                </button>
                {manual && props.onLinkCharacter && gameChars.length > 0 && !linking && (
                  <button
                    type="button"
                    class="kp-btn kp-btn-small kp-btn-ghost"
                    onClick={() => setLinking({ from: key, to: gameChars[0]![0] })}
                  >
                    Połącz z postacią z gry
                  </button>
                )}
                {props.onRemoveCharacter && confirmRemove !== key && (
                  <button
                    type="button"
                    class="kp-btn kp-btn-small kp-btn-ghost kp-btn-danger"
                    onClick={() => setConfirmRemove(key)}
                  >
                    Usuń
                  </button>
                )}
              </div>
              {linking?.from === key && (
                <div
                  class="kp-confirm kp-confirm-neutral"
                  role="group"
                  aria-label="Połącz z postacią z gry"
                >
                  <p>
                    To ta sama postać co w grze? Postęp z <strong>{c.name.v}</strong> przejdzie do
                    wybranej postaci, a ta dodana ręcznie zniknie.
                  </p>
                  <select
                    class="kp-input"
                    aria-label="Postać z gry"
                    value={linking.to}
                    onChange={(e) =>
                      setLinking({ from: key, to: (e.currentTarget as HTMLSelectElement).value })
                    }
                  >
                    {gameChars.map(([k, g]) => (
                      <option key={k} value={k}>
                        {g.name.v} · {raceName(g.race.v)} {REBORN_LETTER[g.reborn.v]} · serwer{' '}
                        {k.split(':')[0]?.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div class="kp-actions">
                    <button
                      type="button"
                      class="kp-btn kp-btn-small kp-btn-on"
                      onClick={() => {
                        props.onLinkCharacter?.(key, linking.to);
                        setLinking(undefined);
                      }}
                    >
                      Połącz
                    </button>
                    <button
                      type="button"
                      class="kp-btn kp-btn-small kp-btn-ghost"
                      onClick={() => setLinking(undefined)}
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
              {confirmRemove === key && (
                <div class="kp-confirm" role="alert">
                  <p>
                    Usunąć <strong>{c.name.v}</strong> i cały jej postęp? Tego nie da się cofnąć.
                    {!manual &&
                      ' Gdy znowu wejdziesz nią do gry, przewodnik zapyta, czy ją śledzić.'}
                  </p>
                  <div class="kp-actions">
                    <button
                      type="button"
                      class="kp-btn kp-btn-small kp-btn-danger-on"
                      onClick={() => {
                        setConfirmRemove(undefined);
                        props.onRemoveCharacter?.(key);
                      }}
                    >
                      Usuń postać
                    </button>
                    <button
                      type="button"
                      class="kp-btn kp-btn-small kp-btn-ghost"
                      onClick={() => setConfirmRemove(undefined)}
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {add &&
        (adding ? (
          <AddCharacter onAdd={add} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" class="kp-btn kp-btn-ghost" onClick={() => setAdding(true)}>
            + Dodaj postać
          </button>
        ))}
    </div>
  );
}
