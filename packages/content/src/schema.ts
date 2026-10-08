import { z } from 'zod';

/** Rasy w kolejności `GAME.char_data.race`. */
export const RACES = [
  'Goku',
  'Vegeta',
  'Gohan',
  'Trunks',
  'Broly',
  'Black',
  'Bardock',
  'Cumber',
] as const;

/** Reborny w kolejności `GAME.char_data.reborn`. */
export const REBORNS = ['Nonborn', 'Rborn', 'Gborn', 'Uborn', 'Sborn', 'Hborn', 'Mborn'] as const;

export const RaceSchema = z
  .number()
  .int()
  .min(0)
  .max(RACES.length - 1);
export const RebornSchema = z
  .number()
  .int()
  .min(0)
  .max(REBORNS.length - 1);

const Text = z.string().trim().min(1);
const Markdown = z.string().trim().min(1);

/** Fragment sluga: małe litery bez polskich znaków, cyfry i myślniki. */
export const SlugSegmentSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Dozwolone: małe litery a-z, cyfry i „-”');

/** Stabilny identyfikator zadania/poradnika, np. `hborn/equuleus/rutyna`. Raz nadany – nie zmieniamy. */
export const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    'Dozwolone: małe litery a-z, cyfry, „-” i „/”',
  );

export const SourceCreditSchema = z
  .object({
    /** Autor solucji/poradnika. Pusty = do uzupełnienia (build ostrzega). */
    author: z.string().trim(),
    /** Skąd pochodzi treść (link, forum), jeśli to nie własna praca. */
    source: Text.optional(),
  })
  .strict();

/** Uwagi do ręcznej weryfikacji (np. z migracji). Usuń po sprawdzeniu. */
const Review = z.array(Text).min(1).optional();

/* ───────────── Pliki źródłowe (packages/content/data) ───────────── */

export const LocationSchema = z
  .object({
    /** ID lokacji w grze (= `data-loc` w teleportacjach i dzienniku). */
    id: z.number().int().positive(),
    /** Nazwa jak w grze. */
    name: Text,
    reborn: RebornSchema.optional(),
    /** Brak = lokacja wspólna dla wszystkich ras. */
    races: z.array(RaceSchema).min(1).optional(),
    /** `false` = z tej lokacji nie da się teleportować, więc nigdy nie ma jej na liście teleportacji. */
    teleport: z.boolean().optional(),
    /** Inne zapisy nazwy spotykane w solucjach. */
    aliases: z.array(Text).min(1).optional(),
    notes: Markdown.optional(),
    review: Review,
  })
  .strict();

export const LocationsFileSchema = z
  .object({
    $schema: z.string().optional(),
    locations: z.array(LocationSchema),
  })
  .strict();

export const QuestKindSchema = z.enum(['main', 'side', 'daily', 'repeatable']);

export const StepSchema = z
  .object({
    /** Wymagania etapu (bez prefiksu „Wymagania:”, postęp wyzerowany: `0/200`). */
    requirements: z.array(Text),
    /** Nagrody za etap (bez prefiksu „Nagroda:”). */
    rewards: z.array(Text),
    /** Wskazówka do etapu (markdown). */
    note: Markdown.optional(),
  })
  .strict()
  .refine((s) => s.requirements.length + s.rewards.length > 0 || s.note !== undefined, {
    message: 'Pusty etap – brak wymagań, nagród i wskazówki',
  });

export const QuestSchema = z
  .object({
    slug: SlugSchema,
    name: Text,
    kind: QuestKindSchema,
    /** Inne nazwy tego zadania (np. jak wyświetla je dziennik gry). */
    aliases: z.array(Text).min(1).optional(),
    /**
     * Inne lokacje, do których zadanie przechodzi w trakcie („Idź do lokacji X”). Dziennik gry
     * pokazuje lokację, w której zadanie jest teraz, więc dopasowujemy też po nich.
     */
    alsoAt: z.array(z.number().int().positive()).min(1).optional(),
    /** Nadpisuje rasy rozdziału. */
    races: z.array(RaceSchema).min(1).optional(),
    /** Domyślnie = reborn rozdziału. */
    rebornMin: RebornSchema.optional(),
    rebornMax: RebornSchema.optional(),
    /**
     * Zadania, które trzeba ukończyć, żeby ukończyć to („Wykonać zadanie: X” w krokach). NIE blokują
     * wzięcia – w grze oba mogą być w dzienniku naraz.
     */
    requires: z.array(SlugSchema).min(1).optional(),
    /**
     * Wcześniejsza część tego samego zadania (zadanie przechodzi przez kilka lokacji). Ta część
     * zaczyna się dopiero po ukończeniu poprzedniej.
     */
    continues: SlugSchema.optional(),
    steps: z.array(StepSchema),
    tips: Markdown.optional(),
    /** Nadpisuje autora rozdziału. */
    sourceCredit: SourceCreditSchema.optional(),
    review: Review,
  })
  .strict()
  .refine(
    (q) => q.rebornMin === undefined || q.rebornMax === undefined || q.rebornMin <= q.rebornMax,
    {
      message: 'rebornMin nie może być większy niż rebornMax',
      path: ['rebornMax'],
    },
  );

/** Jedna lokacja w kolejności fabuły rozdziału (numer = pozycja w tablicy). */
export const SectionSchema = z
  .object({
    locId: z.number().int().positive(),
    note: Markdown.optional(),
    quests: z.array(QuestSchema),
    review: Review,
  })
  .strict();

/** Rozdział = jedna solucja (np. Nonborn Goku, cały Hborn). */
export const ChapterSchema = z
  .object({
    $schema: z.string().optional(),
    id: SlugSegmentSchema,
    title: Text,
    reborn: RebornSchema,
    /** Brak = wspólny dla wszystkich ras (od Gborn w górę). */
    races: z.array(RaceSchema).min(1).optional(),
    sourceCredit: SourceCreditSchema,
    intro: Markdown.optional(),
    sections: z.array(SectionSchema).min(1),
  })
  .strict();

export const GuideMetaSchema = z
  .object({
    slug: SlugSchema,
    title: Text,
    tags: z.array(Text),
    sourceCredit: SourceCreditSchema,
    /** Plik markdown względem `data/guides/`. */
    file: z
      .string()
      .regex(/^[a-z0-9-]+\.md$/, 'Nazwa pliku: małe litery, cyfry, „-”, rozszerzenie .md'),
  })
  .strict();

export const GuidesIndexSchema = z
  .object({
    $schema: z.string().optional(),
    guides: z.array(GuideMetaSchema),
  })
  .strict();

/* ───────────── Format wynikowy (dist/content) – to czytają core, UI, userscript i PWA ───────────── */

export const BuiltLocationSchema = LocationSchema.omit({ review: true });

export const BuiltQuestSchema = z
  .object({
    slug: SlugSchema,
    name: Text,
    kind: QuestKindSchema,
    aliases: z.array(Text).optional(),
    locId: z.number().int().positive(),
    alsoAt: z.array(z.number().int().positive()).optional(),
    chapter: SlugSegmentSchema,
    /** Numer lokacji w rozdziale (od 1). */
    order: z.number().int().positive(),
    /**
     * Brak = wszystkie rasy. Zadania poboczne we wspólnych lokacjach Nonborna/Rborna (np. Głębia)
     * są dla wszystkich ras, chyba że inna rasa ma w tej lokacji własny opis tego zadania.
     */
    races: z.array(RaceSchema).optional(),
    rebornMin: RebornSchema,
    rebornMax: RebornSchema.optional(),
    requires: z.array(SlugSchema).optional(),
    continues: SlugSchema.optional(),
    steps: z.array(StepSchema),
    tips: Markdown.optional(),
    sourceCredit: SourceCreditSchema,
  })
  .strict();

export const BuiltChapterSchema = z
  .object({
    id: SlugSegmentSchema,
    title: Text,
    reborn: RebornSchema,
    races: z.array(RaceSchema).optional(),
    sourceCredit: SourceCreditSchema,
    intro: Markdown.optional(),
    sections: z.array(
      z
        .object({
          order: z.number().int().positive(),
          locId: z.number().int().positive(),
          note: Markdown.optional(),
          quests: z.array(SlugSchema),
        })
        .strict(),
    ),
  })
  .strict();

export const BuiltGuideSchema = z
  .object({
    slug: SlugSchema,
    title: Text,
    tags: z.array(Text),
    sourceCredit: SourceCreditSchema,
    body: Markdown,
  })
  .strict();

export const MANIFEST_SCHEMA_VERSION = 1;

export const ManifestSchema = z
  .object({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    /** Hash całej treści – zmienia się tylko, gdy zmieni się którykolwiek plik. */
    version: z.string().regex(/^[0-9a-f]{16}$/),
    files: z.record(
      z.string(),
      z
        .object({
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          bytes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export type Race = z.infer<typeof RaceSchema>;
export type Reborn = z.infer<typeof RebornSchema>;
export type SourceCredit = z.infer<typeof SourceCreditSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type LocationsFile = z.infer<typeof LocationsFileSchema>;
export type QuestKind = z.infer<typeof QuestKindSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Quest = z.infer<typeof QuestSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type GuideMeta = z.infer<typeof GuideMetaSchema>;
export type GuidesIndex = z.infer<typeof GuidesIndexSchema>;
export type BuiltLocation = z.infer<typeof BuiltLocationSchema>;
export type BuiltQuest = z.infer<typeof BuiltQuestSchema>;
export type BuiltChapter = z.infer<typeof BuiltChapterSchema>;
export type BuiltGuide = z.infer<typeof BuiltGuideSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
