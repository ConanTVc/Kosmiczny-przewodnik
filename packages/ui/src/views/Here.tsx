import type { BuiltQuest } from '@kp/content';
import { useMemo, useState } from 'preact/hooks';
import { LocationPicker } from '../components/LocationPicker';
import { Markdown } from '../components/Markdown';
import { QuestCard } from '../components/QuestCard';
import { usePanel } from '../context';
import { REBORN_LETTER, STATUS_LABEL } from '../labels';

const KIND_ORDER: Record<BuiltQuest['kind'], number> = {
  main: 0,
  side: 1,
  daily: 2,
  repeatable: 3,
};
const byKind = (a: BuiltQuest, b: BuiltQuest) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order;

export function HereView({ locId, onPick }: { locId?: number; onPick(locId: number): void }) {
  const { character, index, chapters, relevant, statuses, locName, props, focusSlug } = usePanel();
  const [picking, setPicking] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const relevantSlugs = useMemo(() => new Set(relevant.map((q) => q.slug)), [relevant]);
  /** Zrobione na pewno (albo oznaczone ręcznie) chowamy; niepewne „Zrobione ?” zostają do potwierdzenia. */
  const isDone = (q: BuiltQuest) => {
    const r = statuses[q.slug];
    return r?.status === 'done' && (r.certain || r.source === 'manual') && q.slug !== focusSlug;
  };

  if (!character) {
    return (
      <div class="kp-empty">
        <p>Wybierz postać w grze albo w zakładce „Postacie”.</p>
      </div>
    );
  }

  const picker = <LocationPicker onPick={(id) => (onPick(id), setPicking(false))} />;
  if (locId === undefined) {
    return (
      <div class="kp-view">
        <p class="kp-muted">
          {props.layout === 'app'
            ? 'Wybierz lokację, w której jest postać:'
            : 'Nie wiem, gdzie jest postać. Wejdź do gry albo wybierz lokację:'}
        </p>
        {picker}
      </div>
    );
  }

  const sections = chapters.flatMap((c) =>
    c.sections.filter((s) => s.locId === locId).map((s) => ({ chapter: c, section: s })),
  );
  const quests = (index.byLoc.get(locId) ?? [])
    .filter((q) => relevantSlugs.has(q.slug))
    .sort(byKind);
  const passing = (index.byLocAny.get(locId) ?? [])
    .filter((q) => q.locId !== locId && relevantSlugs.has(q.slug))
    .sort(byKind);
  const location = index.locations.get(locId);
  const counts = new Map<string, number>();
  // Podsumowanie lokacji bez codziennych – nie liczą się do postępu.
  for (const q of quests) {
    if (q.kind === 'daily' || q.kind === 'repeatable') continue;
    const s = statuses[q.slug]?.status ?? 'unknown';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const isGameLoc = props.currentLoc === locId;
  const hiddenCount = [...quests, ...passing].filter(isDone).length;
  const shownQuests = showDone ? quests : quests.filter((q) => !isDone(q));
  const shownPassing = showDone ? passing : passing.filter((q) => !isDone(q));

  return (
    <div class="kp-view">
      <header class="kp-loc-head">
        <div>
          <h2 class="kp-loc-name">{locName(locId)}</h2>
          <p class="kp-muted">
            {isGameLoc
              ? 'Tu jesteś'
              : locId === character.lastLoc.v
                ? 'Ostatnia lokacja postaci'
                : 'Podgląd lokacji'}
            {location?.reborn !== undefined && ` · ${REBORN_LETTER[location.reborn]}`}
            {sections.map(
              ({ chapter, section }) => ` · ${chapter.title}, lokacja ${section.order}`,
            )}
          </p>
        </div>
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => setPicking(!picking)}
        >
          {picking ? 'Zamknij' : 'Inna lokacja'}
        </button>
      </header>
      {picking && picker}
      {location?.teleport === false && (
        <p class="kp-note">Z tej lokacji nie da się teleportować.</p>
      )}
      {sections.map(
        ({ section }) =>
          section.note && <Markdown key={section.order} text={section.note} class="kp-note" />,
      )}

      {quests.length === 0 && passing.length === 0 ? (
        <p class="kp-empty">Brak zadań w solucjach dla tej lokacji.</p>
      ) : (
        <>
          <p class="kp-summary">
            {[...counts]
              .map(([s, n]) => `${STATUS_LABEL[s as keyof typeof STATUS_LABEL]}: ${n}`)
              .join(' · ')}
          </p>
          {!showDone && quests.length > 0 && shownQuests.length === 0 && (
            <p class="kp-muted">Wszystko w tej lokacji zrobione.</p>
          )}
          {shownQuests.map((q) => {
            const st = statuses[q.slug]?.status;
            return (
              <QuestCard
                key={q.slug}
                quest={q}
                defaultOpen={st === 'active' || st === 'available'}
              />
            );
          })}
          {shownPassing.length > 0 && (
            <>
              <h3 class="kp-subhead">Zadania, które tu przechodzą</h3>
              {shownPassing.map((q) => (
                <QuestCard key={q.slug} quest={q} showLocation />
              ))}
            </>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              class="kp-btn kp-btn-small kp-btn-ghost kp-show-done"
              onClick={() => setShowDone(!showDone)}
            >
              {showDone ? 'Ukryj zrobione' : `Pokaż zrobione (${hiddenCount})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
