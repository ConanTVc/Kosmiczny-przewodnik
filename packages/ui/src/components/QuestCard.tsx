import type { BuiltQuest } from '@kp/content';
import { LATER_LIST, questLists, type ManualStatus, type QuestStatusResult } from '@kp/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { usePanel } from '../context';
import { KIND_LABEL, STATUS_LABEL } from '../labels';
import { Markdown } from './Markdown';

export function StatusChip({ result }: { result?: QuestStatusResult }) {
  const status = result?.status ?? 'unknown';
  const uncertain = result && !result.certain && status !== 'unknown';
  return (
    <span class={`kp-chip kp-chip-${status}`} title={result?.reason}>
      {STATUS_LABEL[status]}
      {uncertain && ' ?'}
      {result?.source === 'manual' && ' ✎'}
    </span>
  );
}

const MANUAL: [ManualStatus, string][] = [
  ['done', 'Zrobione'],
  ['active', 'W trakcie'],
  ['available', 'Do zrobienia'],
];

function ManualActions({ slug, result }: { slug: string; result?: QuestStatusResult }) {
  const { props } = usePanel();
  const manual = result?.source === 'manual' ? result.status : undefined;
  return (
    <div class="kp-actions" role="group" aria-label="Oznacz ręcznie">
      {MANUAL.map(([status, label]) => (
        <button
          key={status}
          type="button"
          class={`kp-btn kp-btn-small ${manual === status ? 'kp-btn-on' : ''}`}
          aria-pressed={manual === status}
          onClick={() => props.onSetManual(slug, status)}
        >
          {label}
        </button>
      ))}
      {manual && (
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => props.onSetManual(slug, null)}
        >
          Przywróć auto
        </button>
      )}
    </div>
  );
}

/** „Na później” i własne listy gracza. */
function ListActions({ slug }: { slug: string }) {
  const { props, character } = usePanel();
  const lists = character?.quests[slug]?.lists?.v ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const later = lists.includes(LATER_LIST);
  const datalistId = `kp-lists-${slug.replace(/[^a-z0-9]/g, '-')}`;
  const set = (next: string[]) => props.onSetLists(slug, next);

  return (
    <div class="kp-actions" role="group" aria-label="Moje listy">
      <button
        type="button"
        class={`kp-btn kp-btn-small ${later ? 'kp-btn-on' : 'kp-btn-ghost'}`}
        aria-pressed={later}
        title="Zadanie zostawione celowo – nie pokazuje się w „do zrobienia”"
        onClick={() => set(later ? lists.filter((l) => l !== LATER_LIST) : [...lists, LATER_LIST])}
      >
        {later ? '★' : '☆'} Na później
      </button>
      {lists
        .filter((l) => l !== LATER_LIST)
        .map((l) => (
          <button
            key={l}
            type="button"
            class="kp-btn kp-btn-small kp-btn-on"
            title={`Usuń z listy „${l}”`}
            onClick={() => set(lists.filter((x) => x !== l))}
          >
            {l} ×
          </button>
        ))}
      {adding ? (
        <form
          class="kp-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) set([...lists, name.trim()]);
            setName('');
            setAdding(false);
          }}
        >
          <input
            id={`${datalistId}-input`}
            class="kp-input kp-input-small"
            list={datalistId}
            maxLength={40}
            placeholder="Nazwa listy"
            aria-label="Nazwa listy"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <datalist id={datalistId}>
            {questLists(character).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <button type="submit" class="kp-btn kp-btn-small">
            Dodaj
          </button>
        </form>
      ) : (
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => setAdding(true)}
        >
          + Lista
        </button>
      )}
    </div>
  );
}

function QuestLink({ slug }: { slug: string }) {
  const { index, openQuest, locName } = usePanel();
  const q = index.quests.get(slug);
  if (!q) return <span>{slug}</span>;
  return (
    <button type="button" class="kp-link" onClick={() => openQuest(slug)}>
      {q.name} ({locName(q.locId)})
    </button>
  );
}

export function QuestCard({
  quest,
  defaultOpen = false,
  showLocation = false,
}: {
  quest: BuiltQuest;
  defaultOpen?: boolean;
  showLocation?: boolean;
}) {
  const { statuses, locName, openLocation, props, character, focusSlug } = usePanel();
  const result = statuses[quest.slug];
  const focused = focusSlug === quest.slug;
  const [open, setOpen] = useState(defaultOpen || focused);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    ref.current?.scrollIntoView?.({ block: 'start' });
  }, [focused]);

  const progress = character?.quests[quest.slug];
  const doneByStatus = result?.status === 'done';
  const stepDone = (i: number) => progress?.steps?.[String(i)]?.v ?? doneByStatus;
  const checked = quest.steps.filter((_, i) => stepDone(i)).length;
  const later = progress?.lists?.v.includes(LATER_LIST);

  return (
    <article
      ref={ref}
      class={`kp-quest kp-st-${result?.status ?? 'unknown'} ${focused ? 'kp-quest-focus' : ''}`}
    >
      <button
        type="button"
        class="kp-quest-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class={`kp-kind kp-kind-${quest.kind}`}>{KIND_LABEL[quest.kind]}</span>
        <span class="kp-quest-name">
          {quest.name}
          {later && <span class="kp-later"> ★ na później</span>}
        </span>
        {checked > 0 && checked < quest.steps.length && (
          <span class="kp-muted kp-steps-count">
            {checked}/{quest.steps.length}
          </span>
        )}
        <StatusChip result={result} />
      </button>
      {open && (
        <div class="kp-quest-body">
          {showLocation && (
            <button type="button" class="kp-link" onClick={() => openLocation(quest.locId)}>
              Lokacja: {locName(quest.locId)}
            </button>
          )}
          {result && result.status !== 'unknown' && (
            <p class="kp-reason">
              {result.reason}
              {!result.certain && ' – nie mam pewności, oznacz sam.'}
            </p>
          )}
          {quest.continues && (
            <p class="kp-meta">
              Dalszy ciąg zadania: <QuestLink slug={quest.continues} />
            </p>
          )}
          {quest.requires && (
            <p class="kp-meta">
              Po drodze trzeba ukończyć:{' '}
              {quest.requires.map((s, i) => (
                <span key={s}>
                  {i > 0 && ', '}
                  <QuestLink slug={s} />
                </span>
              ))}
            </p>
          )}
          {quest.alsoAt && (
            <p class="kp-meta">
              Przechodzi też przez:{' '}
              {quest.alsoAt.map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <button type="button" class="kp-link" onClick={() => openLocation(id)}>
                    {locName(id)}
                  </button>
                </span>
              ))}
            </p>
          )}
          <ol class="kp-steps">
            {quest.steps.map((step, i) => {
              const done = stepDone(i);
              const id = `kp-step-${quest.slug.replace(/[^a-z0-9]/g, '-')}-${i}`;
              return (
                <li key={i} class={`kp-step ${done ? 'kp-step-done' : ''}`}>
                  <div class="kp-step-row">
                    {character && (
                      <input
                        id={id}
                        type="checkbox"
                        class="kp-step-check"
                        checked={done}
                        aria-label={`Krok ${i + 1} zrobiony`}
                        onChange={(e) =>
                          props.onSetStep(
                            quest.slug,
                            i,
                            (e.target as HTMLInputElement).checked,
                            quest.steps.length,
                          )
                        }
                      />
                    )}
                    <div class="kp-step-body">
                      {step.note && <Markdown text={step.note} class="kp-step-note" />}
                      {step.requirements.length > 0 && (
                        <ul class="kp-req">
                          {step.requirements.map((r, j) => (
                            <li key={j}>{r}</li>
                          ))}
                        </ul>
                      )}
                      {step.rewards.length > 0 && (
                        <p class="kp-rew">
                          <span class="kp-rew-label">Nagroda:</span> {step.rewards.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {quest.tips && <Markdown text={quest.tips} class="kp-tips" />}
          {character && <ManualActions slug={quest.slug} result={result} />}
          {character && <ListActions slug={quest.slug} />}
          <p class="kp-credit">Solucja: {quest.sourceCredit.author || 'autor do uzupełnienia'}</p>
        </div>
      )}
    </article>
  );
}
