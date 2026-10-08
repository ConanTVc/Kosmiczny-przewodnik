/**
 * Treść solucji wbudowana w aplikację – działa od pierwszego uruchomienia, także offline.
 * Nowe solucje przychodzą z nową wersją aplikacji (service worker pyta, czy odświeżyć).
 */
import type { BuiltContent } from '@kp/content';
import chapters from '../../../packages/content/dist/content/chapters.json';
import guides from '../../../packages/content/dist/content/guides.json';
import locations from '../../../packages/content/dist/content/locations.json';
import manifest from '../../../packages/content/dist/content/manifest.json';
import quests from '../../../packages/content/dist/content/quests.json';

export const CONTENT = { locations, chapters, quests, guides } as unknown as BuiltContent;
export const CONTENT_VERSION = manifest.version;
