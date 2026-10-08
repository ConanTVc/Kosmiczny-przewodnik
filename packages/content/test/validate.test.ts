import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/build-content';
import { findCycle, formatIssue, validateContent, type ContentInput } from '../src/validate';

function quest(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    name: slug.split('/').pop(),
    kind: 'side',
    steps: [{ requirements: ['Pokonaj: Kukła (Normal) 0/200'], rewards: ['150 doświadczenia'] }],
    ...extra,
  };
}

function input(
  overrides: { chapter?: Record<string, unknown>; locations?: unknown[]; guides?: unknown[] } = {},
): ContentInput {
  return {
    locations: {
      file: 'data/locations.json',
      data: {
        locations: overrides.locations ?? [
          { id: 1338, name: 'Equuleus', reborn: 5 },
          { id: 1358, name: 'Pole złych smoków - Iluzja', reborn: 5 },
          { id: 7, name: 'Nieużywana' },
        ],
      },
    },
    chapters: [
      {
        file: 'data/chapters/hborn.json',
        data: {
          id: 'hborn',
          title: 'H-born',
          reborn: 5,
          sourceCredit: { author: 'Autor' },
          sections: [
            {
              locId: 1338,
              quests: [
                quest('hborn/equuleus/glowne', { kind: 'main', name: 'Hakaishin' }),
                quest('hborn/equuleus/rutyna'),
              ],
            },
            {
              locId: 1358,
              quests: [quest('hborn/pole/rutyna', { requires: ['hborn/equuleus/rutyna'] })],
            },
          ],
          ...overrides.chapter,
        },
      },
    ],
    guides: {
      file: 'data/guides/index.json',
      data: {
        guides: overrides.guides ?? [
          {
            slug: 'skrzynie',
            title: 'Skrzynie',
            tags: ['skrzynie'],
            sourceCredit: { author: '' },
            file: 'skrzynie.md',
          },
        ],
      },
    },
    guideBodies: { 'skrzynie.md': '# Skrzynie\n\nTreść.\n' },
  };
}

const errors = (r: ReturnType<typeof validateContent>) =>
  r.issues.filter((i) => i.level === 'error');

describe('validateContent', () => {
  it('przepuszcza poprawną treść (ostrzeżenia są dozwolone)', () => {
    const r = validateContent(input());
    expect(errors(r)).toEqual([]);
    expect(r.content).toBeDefined();
    expect(r.issues.map((i) => i.message)).toContain('Brak autora poradnika „Skrzynie”');
  });

  it('podaje plik i ścieżkę błędu schematu', () => {
    const bad = input({
      chapter: {
        sections: [
          {
            locId: 1338,
            quests: [quest('hborn/x', { steps: [{ requirements: [], rewards: 'zła' }] })],
          },
        ],
      },
    });
    const r = validateContent(bad);
    expect(r.content).toBeUndefined();
    const [first] = errors(r);
    expect(first?.file).toBe('data/chapters/hborn.json');
    expect(first?.path).toBe('sections[0].quests[0].steps[0].rewards');
    expect(formatIssue(first!)).toMatch(
      /^✖ data\/chapters\/hborn\.json → sections\[0\]\.quests\[0\]\.steps\[0\]\.rewards: /,
    );
  });

  it('wykrywa duplikat sluga, nieznaną lokację i nieznane requires', () => {
    const r = validateContent(
      input({
        chapter: {
          sections: [
            { locId: 1338, quests: [quest('hborn/a'), quest('hborn/a')] },
            { locId: 999, quests: [quest('hborn/b', { requires: ['hborn/nie-ma'] })] },
          ],
        },
      }),
    );
    const msgs = errors(r).map((i) => `${i.path}: ${i.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sections\[0\]\.quests\[1\]\.slug: Duplikat sluga „hborn\/a”/),
        expect.stringMatching(/^sections\[1\]\.locId: Nieznana lokacja 999/),
        expect.stringMatching(
          /^sections\[1\]\.quests\[0\]\.requires\[0\]: Nieznane zadanie „hborn\/nie-ma”/,
        ),
      ]),
    );
  });

  it('wykrywa cykl w requires', () => {
    const r = validateContent(
      input({
        chapter: {
          sections: [
            {
              locId: 1338,
              quests: [
                quest('hborn/a', { requires: ['hborn/b'] }),
                quest('hborn/b', { requires: ['hborn/a'] }),
              ],
            },
          ],
        },
      }),
    );
    expect(errors(r).map((i) => i.message)).toContain(
      'Cykl w requires: hborn/a → hborn/b → hborn/a',
    );
  });

  it('ostrzega o tej samej nazwie zadania w jednej lokacji i o rebornie lokacji', () => {
    const r = validateContent(
      input({
        chapter: {
          reborn: 4,
          sections: [
            {
              locId: 1338,
              quests: [quest('hborn/a', { name: 'Rutyna' }), quest('hborn/b', { name: 'RUTYNA ' })],
            },
          ],
        },
      }),
    );
    expect(errors(r)).toEqual([]);
    const warnings = r.issues.map((i) => i.message).join('\n');
    expect(warnings).toMatch(/Ta sama nazwa „RUTYNA” w tej samej lokacji/);
    expect(warnings).toMatch(/Lokacja 1338 ma reborn 5, wyższy niż rozdział \(4\)/);
  });

  it('zgłasza brak pliku poradnika i duplikat ID lokacji', () => {
    const bad = input({
      locations: [
        { id: 1338, name: 'A' },
        { id: 1338, name: 'B' },
        { id: 1358, name: 'C' },
      ],
    });
    bad.guideBodies = {};
    const msgs = errors(validateContent(bad)).map((i) => i.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Duplikat ID 1338/),
        'Brak pliku skrzynie.md',
      ]),
    );
  });
});

describe('buildContent', () => {
  it('spłaszcza zadania z dziedziczeniem z rozdziału i pomija nieużywane lokacje', () => {
    const r = validateContent(input({ chapter: { races: [0] } }));
    const built = buildContent(r.content!);
    expect(built.locations.map((l) => l.id)).toEqual([1338, 1358]);
    expect(built.quests).toHaveLength(3);
    expect(built.quests[2]).toMatchObject({
      slug: 'hborn/pole/rutyna',
      locId: 1358,
      chapter: 'hborn',
      order: 2,
      races: [0],
      rebornMin: 5,
      requires: ['hborn/equuleus/rutyna'],
      sourceCredit: { author: 'Autor' },
    });
    expect(built.chapters[0]?.sections[0]).toEqual({
      order: 1,
      locId: 1338,
      quests: ['hborn/equuleus/glowne', 'hborn/equuleus/rutyna'],
    });
    expect(built.guides[0]?.body).toBe('# Skrzynie\n\nTreść.');
  });
});

describe('findCycle', () => {
  it('zwraca undefined dla grafu bez cykli', () => {
    expect(
      findCycle(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', []],
        ]),
      ),
    ).toBeUndefined();
  });
});
