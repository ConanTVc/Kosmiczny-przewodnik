import type { BuiltQuest } from '@kp/content';
import { LATER_LIST, questLists, type QuestStatus } from '@kp/core';
import { useMemo, useState } from 'preact/hooks';
import { QuestCard } from '../components/QuestCard';
import { usePanel } from '../context';
import { REBORN_LETTER, STATUS_LABEL } from '../labels';

type Filter = 'todo' | QuestStatus | 'lists';
type KindFilter = 'all' | 'main' | 'side' | 'recurring';

const FILTERS: [Filter, string][] = [
  ['todo', 'Do zrobienia'],
  ['available', STATUS_LABEL.available],
  ['active', STATUS_LABEL.active],
  ['done', STATUS_LABEL.done],
  ['locked', STATUS_LABEL.locked],
  ['unknown', STATUS_LABEL.unknown],
  ['lists', 'Moje listy'],
];

const KINDS: [KindFilter, string][] = [
  ['all', 'Fabuła'],
  ['main', 'Główne'],
  ['side', 'Poboczne'],
  ['recurring', 'Codzienne'],
];

const isRecurring = (q: BuiltQuest) => q.kind === 'daily' || q.kind === 'repeatable';
/** „Fabuła” = główne + poboczne. Codzienne nie liczą się do postępu – wracają co dzień. */
const kindMatches = (k: KindFilter, q: BuiltQuest) =>
  k === 'all' ? !isRecurring(q) : k === 'recurring' ? isRecurring(q) : q.kind === k;

export function ProgressView() {
  const { character, chapters, relevant, statuses, unmatched, locName, openLocation } = usePanel();
  const [filter, setFilter] = useState<Filter>('todo');
  const [kind, setKind] = useState<KindFilter>('all');
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(chapters.filter((c) => c.reborn === character?.reborn.v).map((c) => c.id)),
  );

  const status = (q: BuiltQuest) => statuses[q.slug]?.status ?? 'unknown';
  const listsOf = (q: BuiltQuest) => character?.quests[q.slug]?.lists?.v ?? [];
  const isLater = (q: BuiltQuest) => listsOf(q).includes(LATER_LIST);
  /** „Do zrobienia”: w trakcie, do wzięcia i niepewne – bez zrobionych, przyszłych i odłożonych. */
  const matches = (f: Filter, q: BuiltQuest) => {
    const s = status(q);
    if (f === 'lists') return listsOf(q).length > 0;
    if (f === 'todo')
      return (s === 'active' || s === 'available' || s === 'unknown') && !isLater(q);
    return s === f;
  };

  const inKind = relevant.filter((q) => kindMatches(kind, q));
  const counts = useMemo(() => {
    const c = new Map<Filter, number>();
    for (const q of inKind)
      for (const [f] of FILTERS) if (matches(f, q)) c.set(f, (c.get(f) ?? 0) + 1);
    return c;
  }, [inKind, statuses, character]);

  if (!character) return <p class="kp-empty">Wybierz postać, żeby zobaczyć postęp.</p>;

  const shown = inKind.filter((q) => matches(filter, q));
  const laterCount = inKind.filter((q) => isLater(q) && status(q) !== 'done').length;
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
      <div class="kp-filters" role="tablist" aria-label="Rodzaj zadań">
        {KINDS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            class={`kp-filter kp-filter-kind ${kind === k ? 'kp-filter-on' : ''}`}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="kp-filters" role="tablist" aria-label="Status">
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
      {kind === 'all' && (
        <p class="kp-muted">Główne i poboczne. Codzienne nie liczą się do postępu.</p>
      )}
      {filter === 'todo' && laterCount > 0 && (
        <p class="kp-muted">Bez {laterCount} zadań odłożonych „na później” – są w „Moje listy”.</p>
      )}

      {filter === 'lists' ? (
        <ListsView quests={shown} lists={questLists(character)} listsOf={listsOf} />
      ) : (
        chapters.map((chapter) => {
          const all = inKind.filter((q) => q.chapter === chapter.id);
          if (!all.length) return null;
          const done = all.filter((q) => status(q) === 'done').length;
          const inChapter = shown.filter((q) => q.chapter === chapter.id);
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
                  {done}/{all.length} · {inChapter.length} w filtrze
                </span>
              </button>
              {isOpen &&
                chapter.sections.map((section) => {
                  const quests = inChapter.filter((q) => q.order === section.order);
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
        })
      )}
    </div>
  );
}

function ListsView({
  quests,
  lists,
  listsOf,
}: {
  quests: BuiltQuest[];
  lists: string[];
  listsOf(q: BuiltQuest): string[];
}) {
  const groups = lists
    .map((name) => ({ name, items: quests.filter((q) => listsOf(q).includes(name)) }))
    .filter((g) => g.items.length);
  if (!groups.length) {
    return (
      <p class="kp-empty">
        Nie masz jeszcze zadań na listach. Rozwiń zadanie i kliknij „☆ Na później” albo „+ Lista”.
      </p>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.name} class="kp-chapter">
          <h2 class="kp-h">
            {g.name} <span class="kp-count">{g.items.length}</span>
          </h2>
          {g.items.map((q) => (
            <QuestCard key={q.slug} quest={q} showLocation />
          ))}
        </section>
      ))}
    </>
  );
}
