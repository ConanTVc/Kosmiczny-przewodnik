import type { BuiltQuest } from '@kp/content';
import type { ManualStatus, QuestStatusResult } from '@kp/core';
import { useState } from 'preact/hooks';
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

function QuestLink({ slug }: { slug: string }) {
  const { index, openLocation, locName } = usePanel();
  const q = index.quests.get(slug);
  if (!q) return <span>{slug}</span>;
  return (
    <button type="button" class="kp-link" onClick={() => openLocation(q.locId)}>
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
  const { statuses, locName, openLocation } = usePanel();
  const result = statuses[quest.slug];
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article class={`kp-quest kp-st-${result?.status ?? 'unknown'}`}>
      <button
        type="button"
        class="kp-quest-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class={`kp-kind kp-kind-${quest.kind}`}>{KIND_LABEL[quest.kind]}</span>
        <span class="kp-quest-name">{quest.name}</span>
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
            {quest.steps.map((step, i) => (
              <li key={i} class="kp-step">
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
              </li>
            ))}
          </ol>
          {quest.tips && <Markdown text={quest.tips} class="kp-tips" />}
          <ManualActions slug={quest.slug} result={result} />
          <p class="kp-credit">Solucja: {quest.sourceCredit.author || 'autor do uzupełnienia'}</p>
        </div>
      )}
    </article>
  );
}
