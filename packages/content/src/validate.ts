import type { z } from 'zod';
import {
  ChapterSchema,
  GuidesIndexSchema,
  LocationsFileSchema,
  type Chapter,
  type GuidesIndex,
  type LocationsFile,
} from './schema';

export interface RawFile {
  /** Ścieżka do wyświetlenia w błędach, np. `data/chapters/hborn.json`. */
  file: string;
  data: unknown;
}

export interface ContentInput {
  locations: RawFile;
  chapters: RawFile[];
  guides: RawFile;
  /** Treść markdown poradników: nazwa pliku z indeksu → treść (undefined = brak pliku). */
  guideBodies: Record<string, string | undefined>;
}

export interface Issue {
  level: 'error' | 'warning';
  file: string;
  /** Ścieżka w pliku, np. `sections[3].quests[0].steps[1].rewards`. Pusta = cały plik. */
  path: string;
  message: string;
}

export interface ValidContent {
  locations: LocationsFile;
  chapters: { file: string; chapter: Chapter }[];
  guides: GuidesIndex;
  guideBodies: Record<string, string>;
}

export interface ValidationResult {
  issues: Issue[];
  /** Ustawione tylko, gdy nie ma błędów (ostrzeżenia są dozwolone). */
  content?: ValidContent;
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

export function formatIssue(issue: Issue): string {
  const mark = issue.level === 'error' ? '✖' : '⚠';
  const where = issue.path ? `${issue.file} → ${issue.path}` : issue.file;
  return `${mark} ${where}: ${issue.message}`;
}

/** Uproszczona normalizacja nazwy – tylko do wykrywania duplikatów w treści. */
function nameKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl');
}

function parseWith<T>(schema: z.ZodType<T>, raw: RawFile, issues: Issue[]): T | undefined {
  const result = schema.safeParse(raw.data);
  if (result.success) return result.data;
  for (const i of result.error.issues) {
    issues.push({ level: 'error', file: raw.file, path: formatPath(i.path), message: i.message });
  }
  return undefined;
}

export function validateContent(input: ContentInput): ValidationResult {
  const issues: Issue[] = [];
  const error = (file: string, path: string, message: string) =>
    issues.push({ level: 'error', file, path, message });
  const warn = (file: string, path: string, message: string) =>
    issues.push({ level: 'warning', file, path, message });

  const locations = parseWith(LocationsFileSchema, input.locations, issues);
  const chapters = input.chapters.flatMap((raw) => {
    const chapter = parseWith(ChapterSchema, raw, issues);
    return chapter ? [{ file: raw.file, chapter }] : [];
  });
  const guides = parseWith(GuidesIndexSchema, input.guides, issues);
  if (!locations || !guides || chapters.length !== input.chapters.length) return { issues };

  // Lokacje
  const locById = new Map<number, number>();
  locations.locations.forEach((loc, i) => {
    const prev = locById.get(loc.id);
    if (prev !== undefined) {
      error(
        input.locations.file,
        `locations[${i}].id`,
        `Duplikat ID ${loc.id} (pierwsze wystąpienie: locations[${prev}])`,
      );
    } else {
      locById.set(loc.id, i);
    }
    if (loc.review)
      warn(
        input.locations.file,
        `locations[${i}].review`,
        `Do weryfikacji: ${loc.review.join('; ')}`,
      );
  });

  // Rozdziały i zadania
  const chapterIds = new Map<string, string>();
  const slugWhere = new Map<string, string>();
  const allRequires: { slug: string; requires: string[]; file: string; path: string }[] = [];

  for (const { file, chapter } of chapters) {
    const prevFile = chapterIds.get(chapter.id);
    if (prevFile)
      error(file, 'id', `Duplikat ID rozdziału „${chapter.id}” (również w ${prevFile})`);
    chapterIds.set(chapter.id, file);
    if (!chapter.sourceCredit.author) warn(file, 'sourceCredit.author', 'Brak autora solucji');

    const byLocAndName = new Map<string, string>();
    chapter.sections.forEach((section, si) => {
      const sPath = `sections[${si}]`;
      const loc = locById.get(section.locId);
      if (loc === undefined) {
        error(
          file,
          `${sPath}.locId`,
          `Nieznana lokacja ${section.locId} – brak w data/locations.json`,
        );
      } else {
        // Powrót do lokacji z wcześniejszego rebornu jest normalny; późniejszy reborn – nie.
        const reborn = locations.locations[loc]?.reborn;
        if (reborn !== undefined && reborn > chapter.reborn) {
          warn(
            file,
            `${sPath}.locId`,
            `Lokacja ${section.locId} ma reborn ${reborn}, wyższy niż rozdział (${chapter.reborn})`,
          );
        }
      }
      if (section.review)
        warn(file, `${sPath}.review`, `Do weryfikacji: ${section.review.join('; ')}`);

      section.quests.forEach((quest, qi) => {
        const qPath = `${sPath}.quests[${qi}]`;
        const where = `${file} → ${qPath}`;
        const prev = slugWhere.get(quest.slug);
        if (prev) error(file, `${qPath}.slug`, `Duplikat sluga „${quest.slug}” (również ${prev})`);
        slugWhere.set(quest.slug, where);

        if (quest.steps.length === 0) warn(file, qPath, `Zadanie „${quest.name}” nie ma etapów`);
        if (quest.review)
          warn(file, `${qPath}.review`, `Do weryfikacji: ${quest.review.join('; ')}`);
        if (quest.requires)
          allRequires.push({
            slug: quest.slug,
            requires: quest.requires,
            file,
            path: `${qPath}.requires`,
          });
        if (quest.continues)
          allRequires.push({
            slug: quest.slug,
            requires: [quest.continues],
            file,
            path: `${qPath}.continues`,
          });
        quest.alsoAt?.forEach((id, ai) => {
          if (!locById.has(id)) {
            error(
              file,
              `${qPath}.alsoAt[${ai}]`,
              `Nieznana lokacja ${id} – brak w data/locations.json`,
            );
          }
        });

        if (quest.kind !== 'main') {
          const key = `${section.locId}|${nameKey(quest.name)}`;
          const dup = byLocAndName.get(key);
          if (dup) {
            warn(
              file,
              `${qPath}.name`,
              `Ta sama nazwa „${quest.name}” w tej samej lokacji co ${dup} – auto-wykrywanie nie odróżni tych zadań`,
            );
          } else {
            byLocAndName.set(key, quest.slug);
          }
        }
      });
    });
  }

  // requires i continues: istnienie, brak cykli
  const graph = new Map<string, string[]>();
  for (const r of allRequires) {
    const single = r.path.endsWith('.continues');
    r.requires.forEach((dep, i) => {
      const path = single ? r.path : `${r.path}[${i}]`;
      if (dep === r.slug) error(r.file, path, 'Zadanie nie może wskazywać samego siebie');
      else if (!slugWhere.has(dep)) error(r.file, path, `Nieznane zadanie „${dep}”`);
    });
    graph.set(r.slug, [
      ...(graph.get(r.slug) ?? []),
      ...r.requires.filter((d) => d !== r.slug && slugWhere.has(d)),
    ]);
  }
  const cycle = findCycle(graph);
  if (cycle) {
    const first = allRequires.find((r) => r.slug === cycle[0]);
    error(first?.file ?? '?', first?.path ?? '', `Cykl w requires/continues: ${cycle.join(' → ')}`);
  }

  // Poradniki
  const guideSlugs = new Set<string>();
  const guideBodies: Record<string, string> = {};
  guides.guides.forEach((g, i) => {
    const gPath = `guides[${i}]`;
    if (guideSlugs.has(g.slug))
      error(input.guides.file, `${gPath}.slug`, `Duplikat sluga „${g.slug}”`);
    guideSlugs.add(g.slug);
    if (!g.sourceCredit.author)
      warn(input.guides.file, `${gPath}.sourceCredit.author`, `Brak autora poradnika „${g.title}”`);
    const body = input.guideBodies[g.file];
    if (body === undefined) error(input.guides.file, `${gPath}.file`, `Brak pliku ${g.file}`);
    else if (!body.trim()) error(input.guides.file, `${gPath}.file`, `Plik ${g.file} jest pusty`);
    else guideBodies[g.file] = body;
  });

  if (issues.some((i) => i.level === 'error')) return { issues };
  return { issues, content: { locations, chapters, guides, guideBodies } };
}

/** Zwraca pierwszy znaleziony cykl (lista slugów, pierwszy = ostatni) albo undefined. */
export function findCycle(graph: Map<string, string[]>): string[] | undefined {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | undefined => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') return [...stack.slice(stack.indexOf(next)), next];
      if (s === undefined) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 'done');
    return undefined;
  };
  for (const node of [...graph.keys()].sort()) {
    if (state.get(node) === undefined) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return undefined;
}
