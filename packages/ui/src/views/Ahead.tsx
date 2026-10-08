import type { BuiltChapter } from '@kp/content';
import { useEffect, useState } from 'preact/hooks';
import { QuestCard } from '../components/QuestCard';
import { usePanel } from '../context';
import { REBORN_LETTER } from '../labels';

const PAGE = 8;

/**
 * „Przed tobą”: wybrany rozdział od miejsca, do którego doszła postać (albo od początku) –
 * jako lista lokacji albo fabuła główna krok po kroku do przewijania.
 */
export function AheadView() {
  const { character, chapters, relevant, statuses, index, locName, openLocation } = usePanel();
  const reborn = character?.reborn.v ?? 0;
  const defaultChapter = (chapters.find((c) => c.reborn === reborn) ?? chapters[0])?.id;
  const [chapterId, setChapterId] = useState(defaultChapter);
  const [mode, setMode] = useState<'story' | 'locations'>('story');
  const [fromStart, setFromStart] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [chapterId, mode, fromStart]);
  useEffect(() => setChapterId(defaultChapter), [character?.key]);

  if (!character) return <p class="kp-empty">Wybierz postać, żeby zobaczyć, co przed nią.</p>;
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) return <p class="kp-empty">Brak solucji dla tej postaci.</p>;

  /** Najdalsza lokacja fabuły głównej, do której postać doszła w rozdziale. */
  const reached = (c: BuiltChapter) => {
    let max = 0;
    for (const q of relevant) {
      if (q.chapter !== c.id || q.kind !== 'main') continue;
      const st = statuses[q.slug]?.status;
      if (st === 'active' || st === 'done') max = Math.max(max, q.order);
    }
    return max;
  };
  const position = reached(chapter);
  const mains = relevant.filter((q) => q.chapter === chapter.id && q.kind === 'main');
  const done = mains.length > 0 && mains.every((q) => statuses[q.slug]?.status === 'done');
  // Od bieżącej lokacji fabuły (ona też się liczy – tam jest aktywne zadanie główne).
  const from = fromStart ? 0 : Math.max(0, position - 1);
  const sections = chapter.sections.filter((s) => s.order > from);
  const visible = sections.slice(0, limit);

  return (
    <div class="kp-view">
      <div class="kp-toolbar">
        <label class="kp-label kp-grow">
          Rozdział
          <select
            id="kp-ahead-chapter"
            class="kp-input"
            value={chapterId}
            onChange={(e) => setChapterId((e.target as HTMLSelectElement).value)}
          >
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {REBORN_LETTER[c.reborn]} · {c.title}
                {c.reborn === reborn ? ' (teraz)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div class="kp-filters" role="tablist" aria-label="Widok">
        {(
          [
            ['story', 'Fabuła krok po kroku'],
            ['locations', 'Lista lokacji'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            class={`kp-filter ${mode === m ? 'kp-filter-on' : ''}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
        <label class="kp-check">
          <input
            type="checkbox"
            checked={fromStart}
            onChange={(e) => setFromStart((e.target as HTMLInputElement).checked)}
          />
          od początku
        </label>
      </div>
      <p class="kp-muted">
        {position === 0
          ? chapter.reborn > reborn
            ? 'Ten rozdział jest jeszcze przed tobą.'
            : 'Nie wiem, gdzie jesteś w tej fabule – zeskanuj grę albo zaznacz zadania główne.'
          : done
            ? 'Fabuła tego rozdziału ukończona.'
            : `Jesteś przy lokacji ${position} z ${chapter.sections.length}: ${locName(chapter.sections[position - 1]!.locId)}.`}
      </p>

      {mode === 'locations' ? (
        <ul class="kp-rows">
          {visible.map((s) => {
            const side = s.quests.filter((slug) => index.quests.get(slug)?.kind !== 'main').length;
            return (
              <li key={s.order}>
                <button type="button" class="kp-row" onClick={() => openLocation(s.locId)}>
                  <span>
                    {s.order}. {locName(s.locId)}
                  </span>
                  <span class="kp-muted">{side ? `${side} pobocznych` : 'fabuła'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        visible.map((s) => {
          const mains = s.quests
            .map((slug) => index.quests.get(slug))
            .filter((q) => q !== undefined && q.kind === 'main');
          const side = s.quests.length - mains.length;
          return (
            <section key={s.order} class="kp-section kp-story">
              <div class="kp-story-head">
                <button type="button" class="kp-section-head" onClick={() => openLocation(s.locId)}>
                  {s.order}. {locName(s.locId)}
                </button>
                {side > 0 && (
                  <button
                    type="button"
                    class="kp-link kp-muted"
                    onClick={() => openLocation(s.locId)}
                  >
                    + {side} pobocznych
                  </button>
                )}
              </div>
              {mains.map((q) => (
                <QuestCard
                  key={q!.slug}
                  quest={q!}
                  defaultOpen={statuses[q!.slug]?.status !== 'done'}
                />
              ))}
              {mains.length === 0 && <p class="kp-muted">Bez zadania głównego w tej lokacji.</p>}
            </section>
          );
        })
      )}
      {sections.length > limit && (
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => setLimit(limit + PAGE)}
        >
          Pokaż kolejne lokacje ({sections.length - limit})
        </button>
      )}
    </div>
  );
}
