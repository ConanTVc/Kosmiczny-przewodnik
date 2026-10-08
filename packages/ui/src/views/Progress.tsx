import type { BuiltQuest } from '@kp/content';
import type { QuestStatus } from '@kp/core';
import { useMemo, useState } from 'preact/hooks';
import { QuestCard } from '../components/QuestCard';
import { usePanel } from '../context';
import { REBORN_LETTER, STATUS_LABEL } from '../labels';

type Filter = 'todo' | QuestStatus;

const FILTERS: [Filter, string][] = [
  ['todo', 'Wszystko do zrobienia'],
  ['available', STATUS_LABEL.available],
  ['active', STATUS_LABEL.active],
  ['done', STATUS_LABEL.done],
  ['locked', STATUS_LABEL.locked],
  ['unknown', STATUS_LABEL.unknown],
];

/** „Do zrobienia” w szerokim sensie: w trakcie, do wzięcia i niepewne – bez zrobionych i przyszłych. */
const matches = (filter: Filter, status: QuestStatus) =>
  filter === 'todo'
    ? status === 'active' || status === 'available' || status === 'unknown'
    : status === filter;

export function ProgressView() {
  const { character, chapters, relevant, statuses, unmatched, locName, openLocation } = usePanel();
  const [filter, setFilter] = useState<Filter>('todo');
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(chapters.filter((c) => c.reborn === character?.reborn.v).map((c) => c.id)),
  );

  const status = (q: BuiltQuest) => statuses[q.slug]?.status ?? 'unknown';
  const counts = useMemo(() => {
    const c = new Map<Filter, number>();
    for (const q of relevant) {
      for (const [f] of FILTERS) if (matches(f, status(q))) c.set(f, (c.get(f) ?? 0) + 1);
    }
    return c;
  }, [relevant, statuses]);

  if (!character) return <p class="kp-empty">Wybierz postać, żeby zobaczyć postęp.</p>;

  const byChapter = new Map<string, BuiltQuest[]>();
  for (const q of relevant) byChapter.set(q.chapter, [...(byChapter.get(q.chapter) ?? []), q]);

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div class="kp-view">
      {unmatched.length > 0 && (
        <details class="kp-note">
          <summary>
            {unmatched.length} {unmatched.length === 1 ? 'zadanie' : 'zadań'} z dziennika nie ma w
            solucjach
          </summary>
          <ul>
            {unmatched.map((e) => (
              <li key={e.qid}>
                {e.name} <span class="kp-muted">– {e.locName}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div class="kp-filters" role="tablist" aria-label="Filtr statusu">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            class={`kp-filter ${filter === f ? 'kp-filter-on' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label} <span class="kp-count">{counts.get(f) ?? 0}</span>
          </button>
        ))}
      </div>

      {chapters.map((chapter) => {
        const all = byChapter.get(chapter.id) ?? [];
        if (!all.length) return null;
        const done = all.filter((q) => status(q) === 'done').length;
        const shown = all.filter((q) => matches(filter, status(q)));
        const isOpen = open.has(chapter.id);
        return (
          <section key={chapter.id} class="kp-chapter">
            <button
              type="button"
              class="kp-chapter-head"
              aria-expanded={isOpen}
              onClick={() => toggle(chapter.id)}
            >
              <span class="kp-reborn">{REBORN_LETTER[chapter.reborn]}</span>
              <span class="kp-chapter-title">{chapter.title}</span>
              <span class="kp-muted">
                {done}/{all.length} · {shown.length} w filtrze
              </span>
            </button>
            {isOpen &&
              chapter.sections.map((section) => {
                const quests = shown.filter((q) => q.order === section.order);
                if (!quests.length) return null;
                return (
                  <div key={section.order} class="kp-section">
                    <button
                      type="button"
                      class="kp-section-head"
                      onClick={() => openLocation(section.locId)}
                    >
                      {section.order}. {locName(section.locId)}
                    </button>
                    {quests.map((q) => (
                      <QuestCard key={q.slug} quest={q} />
                    ))}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
