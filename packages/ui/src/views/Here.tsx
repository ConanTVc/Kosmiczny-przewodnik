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
  const { character, index, chapters, relevant, statuses, locName, props } = usePanel();
  const [picking, setPicking] = useState(false);
  const relevantSlugs = useMemo(() => new Set(relevant.map((q) => q.slug)), [relevant]);

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
        <p class="kp-muted">Nie wiem, gdzie jest postać. Wejdź do gry albo wybierz lokację:</p>
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
  for (const q of quests) {
    const s = statuses[q.slug]?.status ?? 'unknown';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const isGameLoc = props.currentLoc === locId;

  return (
    <div class="kp-view">
      <header class="kp-loc-head">
        <div>
          <h2 class="kp-loc-name">{locName(locId)}</h2>
          <p class="kp-muted">
            {isGameLoc ? 'Tu jesteś' : 'Podgląd lokacji'}
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
          {quests.map((q) => {
            const st = statuses[q.slug]?.status;
            return (
              <QuestCard
                key={q.slug}
                quest={q}
                defaultOpen={st === 'active' || st === 'available'}
              />
            );
          })}
          {passing.length > 0 && (
            <>
              <h3 class="kp-subhead">Zadania, które tu przechodzą</h3>
              {passing.map((q) => (
                <QuestCard key={q.slug} quest={q} showLocation />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
