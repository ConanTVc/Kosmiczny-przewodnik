/**
 * Treść: wbudowana w skrypt (działa od razu, także offline) + aktualizacja w tle z GitHub Pages.
 * Pobrana treść jest sprawdzana (sha256 z manifestu i schematy) i zapisywana w pamięci – przy
 * błędzie zostaje dotychczasowa wersja.
 */
import {
  BuiltChapterSchema,
  BuiltGuideSchema,
  BuiltLocationSchema,
  BuiltQuestSchema,
  ManifestSchema,
  type BuiltContent,
} from '@kp/content';
import { z } from 'zod';
import chapters from '../../../packages/content/dist/content/chapters.json';
import guides from '../../../packages/content/dist/content/guides.json';
import locations from '../../../packages/content/dist/content/locations.json';
import manifest from '../../../packages/content/dist/content/manifest.json';
import quests from '../../../packages/content/dist/content/quests.json';
import type { Kv } from '@kp/ui';

export interface LoadedContent {
  content: BuiltContent;
  version: string;
  source: 'wbudowana' | 'zapisana' | 'z sieci';
  /** Kiedy ta wersja trafiła do skryptu (build albo pobranie), ms. */
  fetchedAt: number;
}

export const EMBEDDED: LoadedContent = {
  content: { locations, chapters, quests, guides } as unknown as BuiltContent,
  version: manifest.version,
  source: 'wbudowana',
  fetchedAt: __KP_BUILD_TIME__,
};

const CONTENT_KEY = 'content';
const FILES = ['locations', 'chapters', 'quests', 'guides'] as const;
const SCHEMAS = {
  locations: z.array(BuiltLocationSchema),
  chapters: z.array(BuiltChapterSchema),
  quests: z.array(BuiltQuestSchema),
  guides: z.array(BuiltGuideSchema),
};

/** Zapisana treść, jeśli jest nowsza niż wbudowana w ten skrypt. */
export async function loadCachedContent(kv: Kv): Promise<LoadedContent> {
  try {
    const cached = await kv.get<LoadedContent>(CONTENT_KEY);
    if (cached?.content && cached.fetchedAt > EMBEDDED.fetchedAt)
      return { ...cached, source: 'zapisana' };
  } catch {
    // zostaje wbudowana
  }
  return EMBEDDED;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sprawdza GitHub Pages. Zwraca nowszą, zweryfikowaną treść albo `undefined` (ta sama wersja,
 * brak sieci, blokada strony, uszkodzone pliki – wtedy zostajemy przy obecnej).
 */
export async function fetchRemoteContent(
  current: LoadedContent,
  kv: Kv,
  base = `${__KP_PAGES__}/content`,
  fetcher?: typeof fetch,
): Promise<LoadedContent | undefined> {
  try {
    const get = fetcher ?? fetch;
    const res = await get(`${base}/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const remote = ManifestSchema.parse(await res.json());
    if (remote.version === current.version) return undefined;
    const content: Record<string, unknown> = {};
    for (const name of FILES) {
      const meta = remote.files[`${name}.json`];
      if (!meta) return undefined;
      const file = await get(`${base}/${name}.json`, { cache: 'no-store' });
      if (!file.ok) return undefined;
      const text = await file.text();
      if ((await sha256(text)) !== meta.sha256) return undefined;
      const parsed = SCHEMAS[name].safeParse(JSON.parse(text));
      if (!parsed.success) return undefined;
      content[name] = parsed.data;
    }
    const loaded: LoadedContent = {
      content: content as unknown as BuiltContent,
      version: remote.version,
      source: 'z sieci',
      fetchedAt: Date.now(),
    };
    await kv.set(CONTENT_KEY, loaded);
    return loaded;
  } catch {
    return undefined;
  }
}
