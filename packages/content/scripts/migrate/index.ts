/**
 * Migracja solucji i poradników z TXT do formatu JSON/Markdown w packages/content/data.
 * Oryginały w solucje/ i poradniki/ zostają nietknięte.
 *
 *   pnpm content:migrate            – tylko gdy data/ jest puste
 *   pnpm content:migrate --force    – nadpisuje wygenerowane pliki (ręczne zmiany w data/ przepadną!)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Location, LocationsFile, Reborn } from '../../src/schema';
import { formatIssue, validateContent } from '../../src/validate';
import { writeJsonSchemas } from '../json-schema';
import {
  convertChapter,
  orderQuestKeys,
  resolveRequires,
  type ConvertedChapter,
  type LocationUse,
} from './convert';
import { GUIDES } from './guides';
import {
  LocationIndex,
  matchChapterLocations,
  parseLocationList,
  parseTeleportReborns,
} from './locations';
import { parseSolution } from './parse';
import { writeReport } from './report';
import { FIXTURE_TELEPORTS, LOCATIONS_LIST, SOLUTIONS, splitChapters } from './sources';
import { foldName, normalizeCase, tidy } from './text';

z.config(z.locales.pl());

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '../..');
const repoDir = resolve(pkgDir, '../..');
const dataDir = join(pkgDir, 'data');
const force = process.argv.includes('--force');

const read = (rel: string) => readFileSync(join(repoDir, rel), 'utf8');
const writeJson = (path: string, data: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};

// Ochrona przed nadpisaniem ręcznych poprawek
const outputs = [
  join(dataDir, 'locations.json'),
  join(dataDir, 'guides', 'index.json'),
  ...SOLUTIONS.flatMap((s) => s.chapters.map((c) => join(dataDir, 'chapters', `${c.id}.json`))),
  ...GUIDES.filter((g) => g.source).map((g) => join(dataDir, 'guides', g.meta.file)),
];
const existing = outputs.filter((p) => existsSync(p));
if (existing.length && !force) {
  console.error(
    `Pliki już istnieją (${existing.length}), np. ${existing[0]}.\nUżyj --force, żeby nadpisać – ręczne zmiany w data/ przepadną.`,
  );
  process.exit(1);
}

// Lokacje z gry
const gameLocations = parseLocationList(read(LOCATIONS_LIST));
const index = new LocationIndex(gameLocations);
const fixtureReborns = parseTeleportReborns(read(FIXTURE_TELEPORTS));

// Solucje
const usedSlugs = new Set<string>();
const converted: ConvertedChapter[] = [];
for (const source of SOLUTIONS) {
  const overrides = new Map(Object.entries(source.overrides ?? {}).map(([k, v]) => [Number(k), v]));
  for (const part of splitChapters(source, read(source.file))) {
    const raw = parseSolution(part.lines, {
      firstLine: part.firstLine,
      overrides,
      isLocationName: (name) => index.isKnown(name),
    });
    const matches = matchChapterLocations(
      index,
      raw.sections.map((s) => s.name),
    );
    converted.push(
      convertChapter({ file: source.file, chapter: part.chapter }, raw, matches, usedSlugs),
    );
  }
}
resolveRequires(converted);
for (const c of converted) c.chapter = orderQuestKeys(c.chapter);

// locations.json: cała lista z gry + to, co wiemy z solucji i fixtures
const uses = new Map<number, LocationUse[]>();
for (const c of converted)
  for (const u of c.locations) uses.set(u.id, [...(uses.get(u.id) ?? []), u]);
const locationNotes: string[] = [];
const locations: Location[] = gameLocations.map(({ id, name }) => {
  const u = uses.get(id) ?? [];
  const minReborn = u.length ? (Math.min(...u.map((x) => x.chapter.reborn)) as Reborn) : undefined;
  const fixture = fixtureReborns.get(id) as Reborn | undefined;
  if (fixture !== undefined && minReborn !== undefined && fixture !== minReborn) {
    locationNotes.push(
      `Lokacja ${id} „${name}”: w grze reborn ${fixture}, pierwsze użycie w solucji – reborn ${minReborn}`,
    );
  }
  const reborn = fixture ?? minReborn;
  const aliases = [
    ...new Map(
      u
        .map((x) => normalizeCase(tidy(x.name)))
        .filter((a) => foldName(a) !== foldName(name))
        .map((a) => [foldName(a), a] as const),
    ).values(),
  ];
  const reviews = [...new Set(u.flatMap((x) => (x.review ? [x.review] : [])))];
  return {
    id,
    name,
    ...(reborn !== undefined && { reborn }),
    ...(u.some((x) => x.teleport === false) && { teleport: false }),
    ...(aliases.length > 0 && { aliases }),
    ...(reviews.length > 0 && { review: reviews }),
  };
});
const locationsFile: LocationsFile = { $schema: '../schema/locations.schema.json', locations };

// Zapis
writeJsonSchemas(join(pkgDir, 'schema'));
writeJson(join(dataDir, 'locations.json'), locationsFile);
for (const c of converted) writeJson(join(dataDir, 'chapters', `${c.chapter.id}.json`), c.chapter);
for (const g of GUIDES) {
  if (g.source && g.convert)
    writeFileSync(join(dataDir, 'guides', g.meta.file), g.convert(read(g.source)));
}
const guidesIndex = {
  $schema: '../../schema/guides.schema.json',
  guides: GUIDES.map((g) => g.meta),
};
writeJson(join(dataDir, 'guides', 'index.json'), guidesIndex);

// Walidacja wyniku
const guideBodies = Object.fromEntries(
  GUIDES.map((g) => {
    const p = join(dataDir, 'guides', g.meta.file);
    return [g.meta.file, existsSync(p) ? readFileSync(p, 'utf8') : undefined];
  }),
);
const result = validateContent({
  locations: { file: 'data/locations.json', data: locationsFile },
  chapters: converted.map((c) => ({ file: `data/chapters/${c.chapter.id}.json`, data: c.chapter })),
  guides: { file: 'data/guides/index.json', data: guidesIndex },
  guideBodies,
});
const errors = result.issues.filter((i) => i.level === 'error');

writeReport(join(pkgDir, 'MIGRACJA.md'), {
  converted,
  locations,
  locationNotes,
  issues: result.issues,
  guides: GUIDES,
});

for (const c of converted) {
  const quests = c.chapter.sections.flatMap((s) => s.quests);
  console.log(
    `${c.chapter.id.padEnd(9)} lokacje: ${String(c.chapter.sections.length).padStart(3)}  zadania: ${String(quests.length).padStart(4)}  do sprawdzenia: ${c.report.filter((r) => r.level === 'review').length}`,
  );
}
console.log(`\nRaport: packages/content/MIGRACJA.md`);
if (errors.length) {
  console.error(`\nBłędy walidacji (${errors.length}):`);
  for (const e of errors.slice(0, 30)) console.error(formatIssue(e));
  process.exit(1);
}
console.log(`Walidacja OK (ostrzeżenia: ${result.issues.length}).`);
