import type { BuiltChapter } from '@kp/content';
import { useState } from 'preact/hooks';
import { usePanel } from '../context';
import { REBORN_LETTER } from '../labels';

function SectionRows({
  chapter,
  from,
  limit,
}: {
  chapter: BuiltChapter;
  from: number;
  limit?: number;
}) {
  const { index, locName, openLocation } = usePanel();
  const sections = chapter.sections.filter((s) => s.order > from);
  const shown = limit ? sections.slice(0, limit) : sections;
  return (
    <ul class="kp-rows">
      {shown.map((s) => {
        const quests = s.quests
          .map((slug) => index.quests.get(slug))
          .filter((q) => q !== undefined);
        const side = quests.filter((q) => q.kind !== 'main').length;
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
      {limit !== undefined && sections.length > limit && (
        <li class="kp-muted">…i jeszcze {sections.length - limit} lokacji</li>
      )}
    </ul>
  );
}

/** Nadchodzące lokacje i zadania: dalsza część bieżącej fabuły i wyższe reborny. */
export function AheadView() {
  const { character, chapters, relevant, statuses } = usePanel();
  const [openChapter, setOpenChapter] = useState<string | undefined>();
  const [showAll, setShowAll] = useState(false);
  if (!character) return <p class="kp-empty">Wybierz postać, żeby zobaczyć, co przed nią.</p>;

  const reborn = character.reborn.v;
  /** Najdalsza lokacja fabuły głównej, do której postać doszła w rozdziale. */
  const reached = (chapter: BuiltChapter) => {
    let max = 0;
    for (const q of relevant) {
      if (q.chapter !== chapter.id || q.kind !== 'main') continue;
      const st = statuses[q.slug]?.status;
      if (st === 'active' || st === 'done') max = Math.max(max, q.order);
    }
    return max;
  };

  const current = chapters.filter((c) => c.reborn === reborn);
  const later = chapters.filter((c) => c.reborn > reborn);

  return (
    <div class="kp-view">
      {current.map((c) => {
        const from = reached(c);
        const left = c.sections.filter((s) => s.order > from).length;
        return (
          <section key={c.id} class="kp-block">
            <h2 class="kp-h">
              {c.title}: {left ? `jeszcze ${left} lokacji` : 'fabuła ukończona'}
            </h2>
            {from === 0 && (
              <p class="kp-muted">Nie wiem jeszcze, gdzie jesteś w fabule – zeskanuj grę.</p>
            )}
            {left > 0 && <SectionRows chapter={c} from={from} limit={showAll ? undefined : 12} />}
            {left > 12 && (
              <button
                type="button"
                class="kp-btn kp-btn-small kp-btn-ghost"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Pokaż mniej' : 'Pokaż wszystkie'}
              </button>
            )}
          </section>
        );
      })}
      {later.length > 0 && <h2 class="kp-h">Kolejne reborny</h2>}
      {later.map((c) => (
        <section key={c.id} class="kp-chapter">
          <button
            type="button"
            class="kp-chapter-head"
            aria-expanded={openChapter === c.id}
            onClick={() => setOpenChapter(openChapter === c.id ? undefined : c.id)}
          >
            <span class="kp-reborn">{REBORN_LETTER[c.reborn]}</span>
            <span class="kp-chapter-title">{c.title}</span>
            <span class="kp-muted">{c.sections.length} lokacji</span>
          </button>
          {openChapter === c.id && <SectionRows chapter={c} from={0} />}
        </section>
      ))}
      {!current.length && !later.length && <p class="kp-empty">Brak solucji dla tego rebornu.</p>}
    </div>
  );
}
