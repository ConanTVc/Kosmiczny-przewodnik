import { RaceSchema, RebornSchema } from '@kp/content';
import { z } from 'zod';
import { PROGRESS_VERSION, type Progress } from './types';

const stamped = <T extends z.ZodType>(value: T) =>
  z.object({ v: value, at: z.number().nonnegative() }).strict();

const QuestProgressSchema = z
  .object({
    manual: stamped(z.enum(['active', 'done', 'available']).nullable()).optional(),
    auto: stamped(
      z.object({ status: z.enum(['active', 'done', 'available']), certain: z.boolean() }).strict(),
    ).optional(),
    steps: z.record(z.string().regex(/^\d+$/), stamped(z.boolean())).optional(),
    lists: stamped(z.array(z.string().trim().min(1).max(40)).max(20)).optional(),
  })
  .strict();

const CharacterProgressSchema = z
  .object({
    name: stamped(z.string()),
    race: stamped(RaceSchema),
    reborn: stamped(RebornSchema),
    lastLoc: stamped(z.number().int().positive().nullable()),
    lastSeen: z.number().nonnegative(),
    lastScan: stamped(z.number().nonnegative().nullable()),
    tracked: stamped(z.boolean()),
    quests: z.record(z.string(), QuestProgressSchema),
  })
  .strict();

/** Schemat postępu – walidacja przy imporcie JSON i synchronizacji. */
export const ProgressSchema = z
  .object({
    version: z.literal(PROGRESS_VERSION),
    settings: z.record(z.string(), stamped(z.unknown())),
    characters: z.record(z.string().regex(/^s\d+:c\d+$/), CharacterProgressSchema),
  })
  .strict();

/** Czyta postęp z niezaufanego źródła (plik, sieć). Zwraca undefined, gdy dane są niepoprawne. */
export function parseProgress(data: unknown): Progress | undefined {
  const result = ProgressSchema.safeParse(data);
  return result.success ? (result.data as Progress) : undefined;
}
