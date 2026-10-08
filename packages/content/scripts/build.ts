/**
 * Walidacja treści i build do dist/content (GitHub Pages):
 *   locations.json, chapters.json, quests.json, guides.json + manifest.json (wersja i sha256).
 * Build jest powtarzalny: te same dane → te same pliki i ta sama wersja.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildContent } from '../src/build-content';
import {
  BuiltChapterSchema,
  BuiltGuideSchema,
  BuiltLocationSchema,
  BuiltQuestSchema,
  GuidesIndexSchema,
  MANIFEST_SCHEMA_VERSION,
  type Manifest,
} from '../src/schema';
import { formatIssue, validateContent, type RawFile } from '../src/validate';
import { writeJsonSchemas } from './json-schema';

z.config(z.locales.pl());

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(pkgDir, 'data');
const distDir = join(pkgDir, 'dist', 'content');

function readJson(rel: string): RawFile {
  const path = join(dataDir, rel);
  const file = `data/${rel}`;
  try {
    return { file, data: JSON.parse(readFileSync(path, 'utf8')) as unknown };
  } catch (e) {
    console.error(
      `✖ ${file}: ${e instanceof SyntaxError ? `błędny JSON – ${e.message}` : String(e)}`,
    );
    process.exit(1);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

// Wczytanie
const chapterFiles = readdirSync(join(dataDir, 'chapters'))
  .filter((f) => f.endsWith('.json'))
  .sort();
const guidesRaw = readJson('guides/index.json');
const guideFiles =
  GuidesIndexSchema.safeParse(guidesRaw.data).data?.guides.map((g) => g.file) ?? [];
const guideBodies = Object.fromEntries(
  guideFiles.map((f) => {
    const p = join(dataDir, 'guides', f);
    return [f, existsSync(p) ? readFileSync(p, 'utf8') : undefined];
  }),
);

// Walidacja
const result = validateContent({
  locations: readJson('locations.json'),
  chapters: chapterFiles.map((f) => readJson(`chapters/${f}`)),
  guides: guidesRaw,
  guideBodies,
});
const errors = result.issues.filter((i) => i.level === 'error');
const warnings = result.issues.filter((i) => i.level === 'warning');
for (const w of warnings) console.warn(formatIssue(w));
if (errors.length || !result.content) {
  for (const e of errors) console.error(formatIssue(e));
  console.error(`\nBuild przerwany: ${errors.length} błędów, ${warnings.length} ostrzeżeń.`);
  process.exit(1);
}

// Build – rozdziały w kolejności rebornu, potem id
result.content.chapters.sort(
  (a, b) => a.chapter.reborn - b.chapter.reborn || a.chapter.id.localeCompare(b.chapter.id),
);
const built = buildContent(result.content);

// Kontrola wyniku schematami klienta (te same, którymi klienci sprawdzą pobraną treść)
const check = <T>(name: string, schema: z.ZodType<T>, items: unknown[]) => {
  items.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (!r.success) throw new Error(`${name}[${i}]: ${z.prettifyError(r.error)}`);
  });
};
check('locations', BuiltLocationSchema, built.locations);
check('chapters', BuiltChapterSchema, built.chapters);
check('quests', BuiltQuestSchema, built.quests);
check('guides', BuiltGuideSchema, built.guides);

// Zapis + manifest
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
const files: Manifest['files'] = {};
for (const [name, data] of Object.entries(built)) {
  const fileName = `${name}.json`;
  const text = JSON.stringify(data);
  writeFileSync(join(distDir, fileName), text);
  files[fileName] = { sha256: sha256(text), bytes: Buffer.byteLength(text, 'utf8') };
}
const version = sha256(
  Object.keys(files)
    .sort()
    .map((f) => `${f}:${files[f]!.sha256}`)
    .join('\n'),
).slice(0, 16);
const manifest: Manifest = { schemaVersion: MANIFEST_SCHEMA_VERSION, version, files };
writeFileSync(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeJsonSchemas(join(pkgDir, 'schema'));

// Podsumowanie
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\nTreść zbudowana → packages/content/dist/content (wersja ${version})`);
for (const [f, meta] of Object.entries(files))
  console.log(`  ${f.padEnd(15)} ${kb(meta.bytes).padStart(7)}`);
console.log(
  `  ${built.chapters.length} rozdziałów, ${built.quests.length} zadań, ${built.locations.length} lokacji, ${built.guides.length} poradników; ostrzeżenia: ${warnings.length}`,
);
