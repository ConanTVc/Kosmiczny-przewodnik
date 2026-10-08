import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildContent, validateContent, type BuiltContent, type ContentInput } from '@kp/content';

const repo = resolve(import.meta.dirname, '../../..');

export function fixtureDocument(name: string): Document {
  return new JSDOM(readFileSync(join(repo, 'fixtures', name), 'utf8')).window.document;
}

export function htmlDocument(html: string): Document {
  return new JSDOM(html).window.document;
}

/** Wiersze TSV z fixtures (bez komentarzy „#”). */
export function fixtureTsv(name: string): string[][] {
  return readFileSync(join(repo, 'fixtures', name), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));
}

function build(input: ContentInput): BuiltContent {
  const result = validateContent(input);
  const errors = result.issues.filter((i) => i.level === 'error');
  if (!result.content)
    throw new Error(errors.map((e) => `${e.file} ${e.path}: ${e.message}`).join('\n'));
  return buildContent(result.content);
}

let realContent: BuiltContent | undefined;

/** Prawdziwa treść z packages/content/data (walidacja + build jak w content:build). */
export function loadRealContent(): BuiltContent {
  if (realContent) return realContent;
  const data = join(repo, 'packages/content/data');
  const json = (p: string) => JSON.parse(readFileSync(join(data, p), 'utf8')) as unknown;
  const guides = json('guides/index.json') as { guides: { file: string }[] };
  realContent = build({
    locations: { file: 'locations.json', data: json('locations.json') },
    chapters: readdirSync(join(data, 'chapters'))
      .sort()
      .map((f) => ({ file: f, data: json(`chapters/${f}`) })),
    guides: { file: 'guides/index.json', data: guides },
    guideBodies: Object.fromEntries(
      guides.guides.map((g) => [g.file, readFileSync(join(data, 'guides', g.file), 'utf8')]),
    ),
  });
  return realContent;
}

export interface MiniQuest {
  name: string;
  kind?: 'main' | 'side' | 'daily' | 'repeatable';
  slug?: string;
  continues?: string;
  requires?: string[];
  alsoAt?: number[];
  aliases?: string[];
}

export interface MiniChapter {
  id: string;
  reborn: number;
  races?: number[];
  sections: { locId: number; quests: MiniQuest[] }[];
}

/** Mała treść testowa przepuszczona przez prawdziwą walidację i build. Slug: `rozdział/lokacja/nazwa`. */
export function miniContent(chapters: MiniChapter[], noTeleport: number[] = []): BuiltContent {
  const locIds = new Set<number>();
  for (const c of chapters) {
    for (const s of c.sections) {
      locIds.add(s.locId);
      for (const q of s.quests) q.alsoAt?.forEach((id) => locIds.add(id));
    }
  }
  const slugOf = (c: MiniChapter, locId: number, q: MiniQuest) =>
    q.slug ?? `${c.id}/${locId}/${q.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return build({
    locations: {
      file: 'locations.json',
      data: {
        locations: [...locIds].map((id) => ({
          id,
          name: `Lokacja ${id}`,
          ...(noTeleport.includes(id) && { teleport: false }),
        })),
      },
    },
    chapters: chapters.map((c) => ({
      file: `${c.id}.json`,
      data: {
        id: c.id,
        title: c.id,
        reborn: c.reborn,
        ...(c.races && { races: c.races }),
        sourceCredit: { author: 'Test' },
        sections: c.sections.map((s) => ({
          locId: s.locId,
          quests: s.quests.map((q) => ({
            slug: slugOf(c, s.locId, q),
            name: q.name,
            kind: q.kind ?? 'side',
            ...(q.alsoAt && { alsoAt: q.alsoAt }),
            ...(q.aliases && { aliases: q.aliases }),
            ...(q.requires && { requires: q.requires }),
            ...(q.continues && { continues: q.continues }),
            steps: [{ requirements: ['Zaczekać 00:01:00'], rewards: ['1 KK'] }],
          })),
        })),
      },
    })),
    guides: { file: 'guides/index.json', data: { guides: [] } },
    guideBodies: {},
  });
}
