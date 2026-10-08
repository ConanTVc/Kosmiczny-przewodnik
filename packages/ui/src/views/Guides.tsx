import { normalizeQuestName } from '@kp/core';
import { useMemo, useState } from 'preact/hooks';
import { Markdown } from '../components/Markdown';
import { usePanel } from '../context';
import { markdownToText } from '../markdown';

export function GuidesView() {
  const { props } = usePanel();
  const guides = props.content.guides;
  const [query, setQuery] = useState('');
  const [openSlug, setOpenSlug] = useState<string | undefined>();

  const searchable = useMemo(
    () =>
      guides.map((g) => ({
        guide: g,
        text: normalizeQuestName(`${g.title} ${g.tags.join(' ')} ${markdownToText(g.body)}`),
      })),
    [guides],
  );

  const open = guides.find((g) => g.slug === openSlug);
  if (open) {
    return (
      <div class="kp-view">
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => setOpenSlug(undefined)}
        >
          ← Poradniki
        </button>
        <h2 class="kp-h">{open.title}</h2>
        <Markdown text={open.body} />
        <p class="kp-credit">Autor: {open.sourceCredit.author || 'do uzupełnienia'}</p>
      </div>
    );
  }

  const q = normalizeQuestName(query);
  const results = q ? searchable.filter((s) => s.text.includes(q)) : searchable;

  return (
    <div class="kp-view">
      <input
        type="search"
        class="kp-input"
        placeholder="Szukaj w poradnikach…"
        aria-label="Szukaj w poradnikach"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <ul class="kp-rows">
        {results.map(({ guide }) => (
          <li key={guide.slug}>
            <button type="button" class="kp-row" onClick={() => setOpenSlug(guide.slug)}>
              <span>{guide.title}</span>
              <span class="kp-muted">{guide.tags.join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
      {results.length === 0 && <p class="kp-empty">Nic nie znaleziono.</p>}
    </div>
  );
}
