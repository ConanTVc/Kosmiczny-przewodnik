import { writeFileSync } from 'node:fs';
import type { Location } from '../../src/schema';
import type { Issue } from '../../src/validate';
import type { ConvertedChapter, ReportEntry } from './convert';
import type { GuideSource } from './guides';

interface ReportInput {
  converted: ConvertedChapter[];
  locations: Location[];
  locationNotes: string[];
  issues: Issue[];
  guides: GuideSource[];
  /** Liczba połączeń „dalsza część zadania” (requires między częściami o tej samej nazwie). */
  continuationLinks: number;
}

function entries(list: ReportEntry[]): string[] {
  return list
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((e) => `- **${e.file.replace(/^solucje\//, '')}, linia ${e.line}** – ${e.message}`);
}

export function writeReport(path: string, input: ReportInput): void {
  const { converted, locations } = input;
  const all = converted.flatMap((c) => c.report);
  const review = all.filter((e) => e.level === 'review');
  const info = all.filter((e) => e.level === 'info');

  const rows = converted.map((c) => {
    const quests = c.chapter.sections.flatMap((s) => s.quests);
    const count = (k: string) => quests.filter((q) => q.kind === k).length;
    const steps = quests.reduce((n, q) => n + q.steps.length, 0);
    const requires = quests.filter((q) => q.requires).length;
    const author = c.chapter.sourceCredit.author || '_(pusty)_';
    return `| ${c.chapter.title} | \`${c.chapter.id}.json\` | ${author} | ${c.chapter.sections.length} | ${quests.length} (${count('main')}/${count('side')}/${count('daily')}/${count('repeatable')}) | ${steps} | ${requires} | ${c.report.filter((r) => r.level === 'review').length} |`;
  });

  const used = locations.filter((l) => l.reborn !== undefined).length;
  const aliased = locations.filter((l) => l.aliases).length;
  const noTp = locations.filter((l) => l.teleport === false).length;
  const warnings = input.issues.filter((i) => i.level === 'warning');
  const warnGroups = new Map<string, number>();
  for (const w of warnings) {
    const key = w.message.startsWith('Brak autora')
      ? 'Brak autora (sourceCredit.author pusty)'
      : w.message.startsWith('Do weryfikacji')
        ? 'Pola review (opisane wyżej)'
        : w.message.startsWith('Ta sama nazwa')
          ? 'Ta sama nazwa zadania w jednej lokacji'
          : w.message.replace(/„[^”]*”|\d+/g, '…');
    warnGroups.set(key, (warnGroups.get(key) ?? 0) + 1);
  }
  const sameName = warnings
    .filter((w) => w.message.startsWith('Ta sama nazwa'))
    .map((w) => `- \`${w.file}\` → ${w.path}: ${w.message}`);

  const md = [
    '# Raport migracji solucji i poradników',
    '',
    'Wygenerowany przez `pnpm content:migrate`. Oryginały w `solucje/` i `poradniki/` są nietknięte.',
    '',
    '## Podsumowanie',
    '',
    '| Rozdział | Plik | Autor | Lokacje | Zadania (gł./pob./codz./powt.) | Etapy | requires | Do decyzji |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Lokacje: ${locations.length} z listy gry w \`data/locations.json\`, ${used} z rebornem (użyte w solucjach albo w fixtures), ${aliased} z aliasami nazw z solucji, ${noTp} oznaczonych „bez teleportu”.`,
    '',
    '## Co zrobiła migracja',
    '',
    '- Każdy rozdział to lokacje w kolejności fabuły (numeracja = kolejność), w każdej zadania główne i poboczne w jednolitym formacie.',
    '- Lokacje dopasowane do ID z `lista_wszystkich_lokacji.txt` po nazwie; przy powtarzających się nazwach wybrane ID najbliższe sąsiednim lokacjom w fabule.',
    '- Kolejne sekcje tej samej lokacji połączone; zadanie główne rozbite na kilka sekcji scalone w etapy.',
    '- Wymagania/nagrody zaraz po nagłówku lokacji (bez nazwy zadania) = kontynuacja poprzedniego zadania w nowej lokacji.',
    '- Usunięte „✓ Wykonane”, prefiksy „Wymagania:”/„Nagroda:”, postęp autora wyzerowany (`52/55` → `0/55`), prywatne liczby doświadczenia w nagrodach (`[ +2 395 …]`) usunięte.',
    '- Nazwy pisane WIELKIMI LITERAMI ujednolicone do stylu gry (liczby rzymskie i skróty zostają).',
    '- Luźny tekst uproszczony: nawigacja w trybie rozkazującym („Idź do lokacji…”), wybory jako „Wybór: … / Autor wybrał: …”, „Uwaga!!” sklejone z treścią, bonusy lokacji w jednej linii, bez powtórzeń.',
    '- Komentarze w nawiasach przy nazwach przeniesione do wskazówek (`tips`) albo notatek lokacji.',
    '- `requires` ustawione, gdy pierwszym wymaganiem jest „Wykonać zadanie: X”.',
    `- Zadania przechodzące przez kilka lokacji: lokacje z nawigacji („Idź do lokacji X”) zapisane w \`alsoAt\` (${input.converted.reduce((n, c) => n + c.chapter.sections.flatMap((s) => s.quests).filter((q) => q.alsoAt).length, 0)} zadań), a kolejne części tego samego zadania połączone przez \`requires\` (${input.continuationLinks} połączeń).`,
    '- Zadania poboczne we wspólnych lokacjach Nonborna/Rborna (np. Głębia) opisane tylko w jednej solucji są w buildzie widoczne dla wszystkich ras.',
    '',
    `## Wymaga Twojej decyzji (${review.length})`,
    '',
    '„linia” to numer linii w pliku TXT, „ID” to ID lokacji w grze. Te miejsca mają też pole `review` w danych – po sprawdzeniu usuń je.',
    '',
    ...(review.length ? entries(review) : ['Brak.']),
    '',
    `## Do szybkiego przejrzenia (${info.length + input.locationNotes.length})`,
    '',
    'Dopasowania przybliżone (literówki) i rzeczy informacyjne – prawdopodobnie poprawne.',
    '',
    ...entries(info),
    ...input.locationNotes.map((n) => `- ${n}`),
    '',
    '## Poradniki',
    '',
    ...input.guides.map(
      (g) =>
        `- **${g.meta.title}** → \`data/guides/${g.meta.file}\`${g.source ? ` (z \`${g.source}\`)` : ' (przepisane ręcznie ze zrzutów `poradniki/skrzynie/`)'}`,
    ),
    '',
    `## Ostrzeżenia walidacji (${warnings.length})`,
    '',
    ...[...warnGroups].map(([k, n]) => `- ${k}: ${n}`),
    '',
    ...(sameName.length
      ? [
          '### Ta sama nazwa zadania w jednej lokacji',
          '',
          'Auto-wykrywanie po (lokacja + nazwa) nie odróżni tych zadań:',
          '',
          ...sameName,
          '',
        ]
      : []),
  ];
  writeFileSync(
    path,
    `${md
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`,
  );
}
