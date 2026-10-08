import { normalizeQuestName } from '@kp/core';
import { useMemo, useState } from 'preact/hooks';
import { usePanel } from '../context';
import { REBORN_LETTER } from '../labels';

/** Wyszukiwarka lokacji z rozdziałów postaci – na telefonie, gdzie nie ma gry. */
export function LocationPicker({ onPick }: { onPick(locId: number): void }) {
  const { chapters, locName } = usePanel();
  const [query, setQuery] = useState('');

  const locations = useMemo(() => {
    const seen = new Map<number, { id: number; reborn: number; order: number; chapter: string }>();
    for (const c of chapters) {
      for (const s of c.sections) {
        if (!seen.has(s.locId))
          seen.set(s.locId, { id: s.locId, reborn: c.reborn, order: s.order, chapter: c.title });
      }
    }
    return [...seen.values()];
  }, [chapters]);

  const q = normalizeQuestName(query);
  const results =
    q.length < 2
      ? []
      : locations.filter((l) => normalizeQuestName(locName(l.id)).includes(q)).slice(0, 25);

  return (
    <div class="kp-picker">
      <input
        type="search"
        class="kp-input"
        placeholder="Szukaj lokacji…"
        aria-label="Szukaj lokacji"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      {results.length > 0 && (
        <ul class="kp-picker-list">
          {results.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                class="kp-picker-item"
                onClick={() => {
                  onPick(l.id);
                  setQuery('');
                }}
              >
                <span>{locName(l.id)}</span>
                <span class="kp-muted">
                  {REBORN_LETTER[l.reborn]} · {l.chapter} · {l.order}.
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && results.length === 0 && <p class="kp-muted">Nie znaleziono lokacji.</p>}
    </div>
  );
}
