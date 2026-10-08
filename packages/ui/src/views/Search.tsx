import { useEffect, useMemo, useState } from 'preact/hooks';
import { Markdown } from '../components/Markdown';
import { usePanel } from '../context';
import { REBORN_LETTER } from '../labels';
import { SEARCH_KINDS, buildSearchIndex, search, type SearchHit, type SearchKind } from '../search';

const PAGE = 15;

function Highlight({ hit }: { hit: SearchHit }) {
  return (
    <>
      {hit.text.slice(0, hit.start)}
      <mark>{hit.text.slice(hit.start, hit.end)}</mark>
      {hit.text.slice(hit.end)}
    </>
  );
}

/** Wyszukiwarka: lokacje, zadania, nagrody, wymagania, wskazówki i poradniki. */
export function SearchView() {
  const { props, character, relevant, chapters, locName, openLocation, openQuest, index } =
    usePanel();
  const searchIndex = useMemo(() => buildSearchIndex(props.content), [props.content]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<SearchKind | 'all'>('all');
  const [mine, setMine] = useState(true);
  const [shown, setShown] = useState<Partial<Record<SearchKind, number>>>({});
  const [guideSlug, setGuideSlug] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setShown({}), [debounced, kind, mine]);

  const scope = useMemo(() => {
    const slugs = new Set(relevant.map((q) => q.slug));
    const locs = new Set(chapters.flatMap((c) => c.sections.map((s) => s.locId)));
    return { slugs, locs };
  }, [relevant, chapters]);

  const hits = useMemo(
    () =>
      search(searchIndex, debounced, (e) => {
        if (kind !== 'all' && e.kind !== kind) return false;
        if (!mine || !character) return true;
        if (e.quest) return scope.slugs.has(e.quest.slug);
        if (e.kind === 'location') return scope.locs.has(e.locId!);
        return true;
      }),
    [searchIndex, debounced, kind, mine, character, scope],
  );

  const guide = props.content.guides.find((g) => g.slug === guideSlug);
  if (guide) {
    return (
      <div class="kp-view">
        <button
          type="button"
          class="kp-btn kp-btn-small kp-btn-ghost"
          onClick={() => setGuideSlug(undefined)}
        >
          ← Wróć
        </button>
        <h2 class="kp-h">{guide.title}</h2>
        <Markdown text={guide.body} />
        <p class="kp-credit">Autor: {guide.sourceCredit.author || 'do uzupełnienia'}</p>
      </div>
    );
  }

  const where = (h: SearchHit) => {
    const q = h.quest;
    if (h.kind === 'location' && h.locId !== undefined) {
      const at = chapters.flatMap((c) =>
        c.sections.filter((s) => s.locId === h.locId).map((s) => `${c.title} ${s.order}.`),
      );
      return at.length ? [...new Set(at)].slice(0, 3).join(', ') : undefined;
    }
    if (!q) return undefined;
    const chapter = index.chapters.get(q.chapter);
    const step = h.step !== undefined ? ` · krok ${h.step + 1}` : '';
    return `${q.name}${step} · ${locName(q.locId)} (${chapter ? REBORN_LETTER[chapter.reborn] : ''} ${q.order}.)`;
  };
  const open = (h: SearchHit) => {
    if (h.guideSlug) setGuideSlug(h.guideSlug);
    else if (h.quest) openQuest(h.quest.slug);
    else if (h.locId !== undefined) openLocation(h.locId);
  };

  const groups = SEARCH_KINDS.map(([k, label]) => ({
    k,
    label,
    items: hits.filter((h) => h.kind === k),
  })).filter((g) => g.items.length);

  return (
    <div class="kp-view">
      <input
        id="kp-search"
        type="search"
        class="kp-input"
        placeholder="Szukaj: lokacji, zadania, przedmiotu, nagrody…"
        aria-label="Szukaj"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="kp-filters" role="tablist" aria-label="Rodzaj wyników">
        {([['all', 'Wszystko'], ...SEARCH_KINDS] as [SearchKind | 'all', string][]).map(
          ([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              class={`kp-filter ${kind === k ? 'kp-filter-on' : ''}`}
              onClick={() => setKind(k)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {character && (
        <label class="kp-check">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine((e.target as HTMLInputElement).checked)}
          />
          Tylko to, co dotyczy {character.name.v}
        </label>
      )}

      {debounced.trim().length < 2 ? (
        <>
          <p class="kp-muted">
            Wpisz co najmniej 2 litery – np. „czerwone senzu”, „szczyt marsa”, „skrzynia IX”.
            Polskie znaki nie są potrzebne.
          </p>
          <h2 class="kp-h">Poradniki</h2>
          <ul class="kp-rows">
            {props.content.guides.map((g) => (
              <li key={g.slug}>
                <button type="button" class="kp-row" onClick={() => setGuideSlug(g.slug)}>
                  <span>{g.title}</span>
                  <span class="kp-muted">{g.tags.join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : hits.length === 0 ? (
        <p class="kp-empty">
          Nic nie znaleziono
          {mine && character ? ' – spróbuj odznaczyć „Tylko to, co dotyczy…”' : ''}.
        </p>
      ) : (
        groups.map(({ k, label, items }) => {
          const limit = shown[k] ?? PAGE;
          return (
            <section key={k} class="kp-block">
              <h2 class="kp-h">
                {label} <span class="kp-count">{items.length}</span>
              </h2>
              <ul class="kp-rows">
                {items.slice(0, limit).map((h, i) => (
                  <li key={i}>
                    <button type="button" class="kp-row kp-hit" onClick={() => open(h)}>
                      <span class="kp-hit-text">
                        <Highlight hit={h} />
                      </span>
                      {where(h) && <span class="kp-muted">{where(h)}</span>}
                      {h.kind === 'guide' &&
                        h.guideSlug &&
                        h.text !==
                          props.content.guides.find((g) => g.slug === h.guideSlug)?.title && (
                          <span class="kp-muted">
                            {props.content.guides.find((g) => g.slug === h.guideSlug)?.title}
                          </span>
                        )}
                    </button>
                  </li>
                ))}
              </ul>
              {items.length > limit && (
                <button
                  type="button"
                  class="kp-btn kp-btn-small kp-btn-ghost"
                  onClick={() => setShown({ ...shown, [k]: limit + PAGE * 2 })}
                >
                  Pokaż więcej ({items.length - limit})
                </button>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
