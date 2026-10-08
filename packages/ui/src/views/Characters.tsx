import { usePanel } from '../context';
import { REBORN_LETTER, formatDate, raceName } from '../labels';

export function CharactersView() {
  const { props } = usePanel();
  const entries = Object.entries(props.progress.characters).sort(
    ([, a], [, b]) => b.lastSeen - a.lastSeen,
  );

  if (!entries.length) {
    return (
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
          const [server] = key.split(':');
          return (
            <li
              key={key}
              class={`kp-char ${active ? 'kp-char-on' : ''} ${c.tracked.v ? '' : 'kp-char-off'}`}
            >
              <div class="kp-char-main">
                <strong>{c.name.v}</strong>
                <span class="kp-muted">
                  {raceName(c.race.v)} · {REBORN_LETTER[c.reborn.v]} · serwer {server?.slice(1)} ·
                  widziana {formatDate(c.lastSeen)}
                </span>
              </div>
              <div class="kp-actions">
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
