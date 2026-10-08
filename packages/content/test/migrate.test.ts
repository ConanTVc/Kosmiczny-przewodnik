import { describe, expect, it } from 'vitest';
import {
  buildSteps,
  linkContinuations,
  navLocations,
  type ConvertedChapter,
} from '../scripts/migrate/convert';
import { convertClanCosts } from '../scripts/migrate/guides';
import { LocationIndex, matchChapterLocations } from '../scripts/migrate/locations';
import {
  dropRepeated,
  extractNavTargets,
  simplifyLine,
  simplifyLines,
  simplifyNameNote,
} from '../scripts/migrate/notes';
import { parseSolution, splitNameNotes } from '../scripts/migrate/parse';
import {
  classifyLine,
  cleanReward,
  normalizeCase,
  slugify,
  tidy,
  zeroProgress,
} from '../scripts/migrate/text';

const lines = (s: string) => s.trim().split('\n');

describe('zeroProgress', () => {
  it.each([
    ['Osiągnąć poziom: 52/55', 'Osiągnąć poziom: 0/55'],
    ['Osiągnąć poziom: 1 250/1 200', 'Osiągnąć poziom: 0/1 200'],
    ['Oddaj PSK 38 125/14 000', 'Oddaj PSK 0/14 000'],
    ['Pokonaj: Żołnierz (Legendarny) 80 000/80 000', 'Pokonaj: Żołnierz (Legendarny) 0/80 000'],
    ['Wykonane instancje numer 1 2/2', 'Wykonane instancje numer 1 0/2'],
    ['Zapłacić: 1 037kk/250kk', 'Zapłacić: 0/250kk'],
    ['Zdobyte Niebieskie Senzu 3/x1 limit', 'Zdobyte Niebieskie Senzu 0/x1 limit'],
    ['Wykonaj akcję [klawisz H] 0 / 500', 'Wykonaj akcję [klawisz H] 0/ 500'],
    ['Zaczekać 00:01:00', 'Zaczekać 00:01:00'],
    ['Oddaj PSK 38 125/14 000', 'Oddaj PSK 0/14 000'],
  ])('%s → %s', (input, expected) => {
    expect(zeroProgress(input)).toBe(expected);
  });
});

describe('classifyLine', () => {
  it.each([
    ['Wymagania:Pokonać w pojedynku: Ojciec', 'requirement', 'Pokonać w pojedynku: Ojciec'],
    ['Nagroda:Podróż do Las', 'reward', 'Podróż do Las'],
    ['Nagorda: 50% bazowego PA', 'reward', '50% bazowego PA'],
    ['Wymagania: Nagroda: Technika: SSJ3', 'reward', 'Technika: SSJ3'],
    ['Pokonać w pojedynku: Plugawa istota', 'requirement', 'Pokonać w pojedynku: Plugawa istota'],
    [
      'Zdobądź przedmioty z wypraw klasy Mystic 0/20',
      'requirement',
      'Zdobądź przedmioty z wypraw klasy Mystic 0/20',
    ],
    [
      '(Płacę)Wymagania: Oddaj przedmiot Redukcja Doświadczenia x15',
      'requirement',
      '(Płacę) Oddaj przedmiot Redukcja Doświadczenia x15',
    ],
    ['Nagroda 750 ZENI', 'reward', '750 ZENI'],
    ['NagrodaSakwa z Kryształami x20', 'reward', 'Sakwa z Kryształami x20'],
    ['Diabelski Klejnot x500', 'reward', 'Diabelski Klejnot x500'],
    ['Idziemy do lokacji Dom', 'text', 'Idziemy do lokacji Dom'],
  ])('%s', (line, kind, text) => {
    expect(classifyLine(line)).toEqual({ kind, text });
  });
});

describe('normalizacja tekstu', () => {
  it('ujednolica nazwy WIELKIMI LITERAMI, zostawia liczby rzymskie i skróty', () => {
    expect(normalizeCase('PRAKTYKA I DĄŻENIE DO DOSKONAŁOŚCI')).toBe(
      'Praktyka i Dążenie do Doskonałości',
    );
    expect(normalizeCase('WYROK LOSU I')).toBe('Wyrok Losu I');
    expect(normalizeCase('WIELKI TURNIEJ II')).toBe('Wielki Turniej II');
    expect(normalizeCase('TRENING PVP Z SSJ')).toBe('Trening PvP z SSJ');
    expect(normalizeCase('Planeta we wszechświecie')).toBe('Planeta we wszechświecie');
  });

  it('tworzy slugi bez polskich znaków', () => {
    expect(slugify('Królewska Straż II')).toBe('krolewska-straz-ii');
    expect(slugify('Wymiana substancji [LV2]')).toBe('wymiana-substancji-lv2');
  });

  it('porządkuje zapis i czyści prywatne liczby z nagród', () => {
    expect(tidy('Zapłacić :  10/10 kk')).toBe('Zapłacić: 10/10 kk');
    expect(tidy('Osiągnąć poziom:235')).toBe('Osiągnąć poziom: 235');
    expect(tidy('Zaczekać 00:01:00')).toBe('Zaczekać 00:01:00');
    expect(cleanReward('300% doświadczenia do następnego poziomu [ +2 395 107 219]')).toBe(
      '300% doświadczenia do następnego poziomu',
    );
  });

  it('wycina komentarze z nazw', () => {
    expect(splitNameNotes('Loteria Aldeara (To zadanie można wykonywać w nieskończoność)')).toEqual(
      {
        name: 'Loteria Aldeara',
        notes: ['To zadanie można wykonywać w nieskończoność'],
      },
    );
    expect(splitNameNotes('Wymiana [III]').name).toBe('Wymiana [III]');
    expect(splitNameNotes('Laboratorium [1|6]', true)).toEqual({
      name: 'Laboratorium',
      notes: ['1|6'],
    });
  });
});

describe('parseSolution', () => {
  it('format Cumber: Lokacja / Zadanie Główne / Poboczne, bez „✓ Wykonane”', () => {
    const raw = parseSolution(
      lines(`
Lokacja: Planeta Sadal – Dziedziniec
Zadanie Główne: Dziwna Energia
✓ Wykonane
Wymagania: Zaczekać 00:01:00
Nagroda: Podróż do Las
Poboczne: Królewska Straż II
✓ Wykonane
Wymagania: Wykonać zadanie: Królewska straż
Nagroda: Technika: Kikoha
`),
    );
    expect(raw.sections).toHaveLength(1);
    expect(raw.sections[0]!.quests.map((q) => [q.name, q.kind, q.items.length])).toEqual([
      ['Dziwna Energia', 'main', 2],
      ['Królewska Straż II', 'side', 2],
    ]);
  });

  it('format Hborn: numerowane lokacje, zadania poboczne jako sama nazwa nad „✓ Wykonane”', () => {
    const raw = parseSolution(
      lines(`
5.CENTRUM PÓŁNOCY
Główne: Ultra Instynkt
✓ Wykonane
Wymagania:Wygrane walki na arenie 0/100
Nagroda:Podróż do Centrum wszechświata
CENTRUM INSTANCJI
✓ Wykonane
Wymagania:Wykonane instancje numer 1 0/20
Wymagania: Pokonać w pojedynku: Boski Omega Shenron
Nagoda: Paczka raty x5
✓ Wykonane
Wymagania: Wykonaj akcję [klawisz H] 0/100 000
`),
    );
    const [section] = raw.sections;
    expect(section!.name).toBe('CENTRUM PÓŁNOCY');
    expect(section!.quests.map((q) => q.name)).toEqual(['Ultra Instynkt', 'CENTRUM INSTANCJI']);
    // „✓ Wykonane” pod nagrodą to śmieć z kopiowania – zadanie trwa dalej
    expect(section!.quests[1]!.items.map((i) => i.kind)).toEqual([
      'requirement',
      'requirement',
      'reward',
      'requirement',
    ]);
  });

  it('wymagania tuż po nagłówku lokacji = kontynuacja poprzedniego zadania', () => {
    const raw = parseSolution(
      lines(`
Lokacja: Planeta Olbrzymów
Zadanie Główne: Poszukiwanie kul
✓ Wykonane
Nagroda: Podróż do Planeta Lud
Lokacja: Planeta Lud
Wymagania: Pokonać w pojedynku: Mut-Mot
Zadanie Główne: Poszukiwanie kul
✓ Wykonane
Nagroda: Podróż do Planeta ZX68
`),
    );
    const lud = raw.sections[1]!;
    expect(lud.quests).toHaveLength(1);
    expect(lud.quests[0]).toMatchObject({
      name: 'Poszukiwanie kul',
      kind: 'main',
      continued: true,
    });
    expect(lud.quests[0]!.items.map((i) => i.text)).toEqual([
      'Pokonać w pojedynku: Mut-Mot',
      'Podróż do Planeta ZX68',
    ]);
  });

  it('rozpoznaje lokację zapisaną jak zadanie i pomija samo „Poboczne”', () => {
    const raw = parseSolution(
      lines(`
1.KRESY
Główne: Ultra Instynkt
✓ Wykonane
Nagroda: 50KK
DOM - CZAS ZBIORÓW
✓ Wykonane
Główne: ŻYCIE RODZINNE
✓ Wykonane
Wymagania: Zaczekać 00:01:00
Poboczne
✓ Wykonane
WĘDROWNY HANDLARZ
✓ Wykonane
Wymagania: Oddaj przedmiot Legendarna Skrzynia 0/2000
`),
      { isLocationName: (n) => n === 'DOM - CZAS ZBIORÓW' },
    );
    expect(raw.sections.map((s) => s.name)).toEqual(['KRESY', 'DOM - CZAS ZBIORÓW']);
    expect(raw.sections[1]!.quests.map((q) => q.name)).toEqual([
      'ŻYCIE RODZINNE',
      'WĘDROWNY HANDLARZ',
    ]);
  });

  it('rozpoznaje zadania codzienne i powtarzalne', () => {
    const raw = parseSolution(
      lines(`
Lokacja: Pałac
Poboczne(Zadanie Codzienne): Zadanie PVM
Zdobyte punkty PvM 0/500
[Zadanie bez Końca]» Pierścień Czasu
✓ Wykonane
Nagroda: Pierścień Czasu Legendary x1
SCALACZE HIPER [CODZIENNE]
✓ Wykonane
Nagroda: Hiper scalacz
`),
    );
    expect(raw.sections[0]!.quests.map((q) => [q.name, q.kind])).toEqual([
      ['Zadanie PVM', 'daily'],
      ['Pierścień Czasu', 'repeatable'],
      ['SCALACZE HIPER', 'daily'],
    ]);
  });
});

describe('buildSteps', () => {
  it('dzieli na etapy: tekst po nagrodzie zaczyna nowy etap, postęp wyzerowany', () => {
    const item = (kind: 'requirement' | 'reward' | 'text', text: string) => ({
      kind,
      text,
      line: 0,
    });
    const steps = buildSteps([
      item('requirement', 'Osiągnąć poziom: 5/5'),
      item('reward', '200 doświadczenia'),
      item('text', 'Idziemy na prawo do Lokacji Wyspa – Sektor Centralny'),
      item('requirement', 'Oddaj przedmiot Deski 3/3'),
      item('reward', '2 000 doświadczenia [ +123 456]'),
      item('text', 'Wracamy do lokacji Wyspa – Sektor Zachodni'),
      item('reward', '1 siły'),
    ]);
    expect(steps).toEqual([
      { requirements: ['Osiągnąć poziom: 0/5'], rewards: ['200 doświadczenia'] },
      {
        requirements: ['Oddaj przedmiot Deski 0/3'],
        rewards: ['2 000 doświadczenia'],
        note: 'Idź na prawo do lokacji Wyspa – Sektor Centralny.',
      },
      { requirements: [], rewards: ['1 siły'], note: 'Wróć do lokacji Wyspa – Sektor Zachodni.' },
    ]);
  });
});

describe('upraszczanie tekstu', () => {
  it.each([
    ['Udajemy się Do Lokacji STERBURTA', 'Idź do lokacji Sterburta.'],
    [
      'Teraz idziemy na południe do lokacji południe planety',
      'Teraz idź na południe do lokacji południe planety.',
    ],
    [
      'Mamy Wybór [Opowiem Policji] lub [To nie Moja Sprawa]',
      'Wybór: [Opowiem Policji] lub [To nie Moja Sprawa]',
    ],
    ['Wybrałem [Opowiem Policji]', 'Autor wybrał: [Opowiem Policji]'],
    ['Wbrałem: Złóż ofiarę', 'Autor wybrał: Złóż ofiarę'],
    ['(Trening)', 'Wariant: Trening'],
    ['Limit czasu: 00:05:00', 'Limit czasu: 00:05:00'],
  ])('%s', (input, expected) => {
    expect(simplifyLine(input)).toBe(expected);
  });

  it('skleja etykiety z treścią, łączy bonusy i usuwa powtórzenia', () => {
    expect(
      simplifyLines([
        'Uwaga!!',
        'Brak możliwości powrotu',
        'Bonusy lokacji',
        '30 % do doświadczenia',
        '5 % do szansy na moc',
        'Bez zmian',
        'Bez zmian',
      ]),
    ).toEqual([
      '**Uwaga:** Brak możliwości powrotu',
      '**Bonusy lokacji:** 30% do doświadczenia; 5% do szansy na moc',
      'Bez zmian',
    ]);
  });

  it('usuwa ostrzeżenia powtórzone w kolejnych etapach, ale nie nawigację', () => {
    const seen: string[] = [];
    expect(
      dropRepeated(
        ['**Uwaga:** Brak możliwości powrotu, aż do ukończenia zadania', 'Wróć do lokacji Ura.'],
        seen,
      ),
    ).toHaveLength(2);
    expect(
      dropRepeated(
        ['Brak możliwości powrotu, aż do ukończenia zadania', 'Wróć do lokacji Ura.'],
        seen,
      ),
    ).toEqual(['Wróć do lokacji Ura.']);
  });

  it('upraszcza komentarze z nazw', () => {
    expect(simplifyNameNote('fajny troll hehe')).toBeNull();
    expect(simplifyNameNote('1|6')).toBe('Portal [1|6].');
    expect(simplifyNameNote('S10 000')).toBe('Wymagany poziom: S10 000.');
  });
});

describe('dopasowanie lokacji', () => {
  const index = new LocationIndex([
    { id: 35, name: 'Dom' },
    { id: 688, name: 'Dom' },
    { id: 689, name: 'Plaża' },
    { id: 690, name: 'Pole' },
    { id: 991, name: 'Planeta Liguira' },
    { id: 1350, name: 'Okolice Zamku Królewskiego - Iluzja' },
  ]);

  it('przy powtórzonej nazwie wybiera ID najbliższe sąsiadom w fabule', () => {
    const m = matchChapterLocations(index, ['Plaża', 'Dom', 'Pole']);
    expect(m.map((x) => x.id)).toEqual([689, 688, 690]);
    expect(m[1]!.review).toBeUndefined();
  });

  it('dopasowuje wariant bez „Planeta” i literówki', () => {
    const m = matchChapterLocations(index, ['LIGUIRA', 'OKOLICE ZAMKU KRÓLEWESKIEGO - ILUZJA']);
    expect(m.map((x) => [x.id, x.method])).toEqual([
      [991, 'wariant'],
      [1350, 'literówka'],
    ]);
  });

  it('zgłasza brak dopasowania', () => {
    const [m] = matchChapterLocations(index, ['Zupełnie Nieznana']);
    expect(m!.id).toBeUndefined();
    expect(m!.review).toMatch(/Nie znaleziono/);
  });

  // Lokacje dodawano do gry po kolei: rozdział nie wraca do lokacji, których jeszcze nie było.
  const history = new LocationIndex([
    { id: 35, name: 'Dom' },
    { id: 54, name: 'Rajska Sala Treningowa' },
    { id: 215, name: 'Rajska Sala Treningowa' },
    { id: 395, name: 'Czwarty Krąg Piekła' },
    { id: 397, name: 'Sierociniec' },
    { id: 670, name: 'Rufa' },
    { id: 671, name: 'Dziób statku' },
    { id: 688, name: 'Dom' },
  ]);

  it('przy powrocie odrzuca lokacje z ID wyższym niż rozdział (Uborn → Dom 35, nie 688)', () => {
    const m = matchChapterLocations(history, ['Sierociniec', 'Dom', 'Czwarty Krąg Piekła']);
    expect(m[1]).toMatchObject({ id: 35 });
    expect(m[1]!.review).toBeUndefined();
  });

  it('przy powrocie wybiera lokację znaną z wcześniejszych rozdziałów (Sborn → Rajska Sala 54)', () => {
    const m = matchChapterLocations(
      history,
      ['Rufa', 'Rajska Sala Treningowa', 'Dziób statku'],
      new Set([54]),
    );
    expect(m[1]).toMatchObject({ id: 54 });
    expect(m[1]!.review).toBeUndefined();
  });

  it('bez wiedzy o wcześniejszych rozdziałach zostawia powrót do sprawdzenia', () => {
    const m = matchChapterLocations(history, ['Rufa', 'Rajska Sala Treningowa', 'Dziób statku']);
    expect(m[1]!.review).toMatch(/Kilka lokacji/);
  });
});

describe('poradniki', () => {
  it('koszty struktur → tabele markdown', () => {
    const md = convertClanCosts(
      'Koszt struktur klanowych\nFortece\nLvL 1: Koszt 50 KP, Suma: 50 KP\nSala Ognia:\nLvL 1 - 3 KP\nCałość: 3 KP\n',
    );
    expect(md).toBe(
      '## Fortece\n\n| Poziom | Koszt | Suma |\n| --- | --- | --- |\n| 1 | 50 KP | 50 KP |\n\n## Sala Ognia\n\n| Poziom | Koszt |\n| --- | --- |\n| 1 | 3 KP |\n\n**Razem:** 3 KP\n',
    );
  });
});

describe('zadania przechodzące przez kilka lokacji', () => {
  it('wyciąga lokacje z poleceń nawigacji', () => {
    expect(
      extractNavTargets(
        [
          'Idź na południe do lokacji Mroczny Las – Południe.',
          'Idź do lokacji Siedziba Doktora, a następnie do lokacji Główna Sala.',
          'Wróć na Planetę Ura.',
          'Udaj się do: Krater',
          'Kontynuacja na Planeta Papri',
          'Po odnalezieniu kamienia wróć do Genialnego Żółwia.',
          'Wybór: [Tak] lub [Nie]',
        ].join('\n'),
      ),
    ).toEqual([
      'Mroczny Las – Południe',
      'Siedziba Doktora',
      'Główna Sala',
      'Planetę Ura',
      'Krater',
      'Planeta Papri',
      'Genialnego Żółwia',
    ]);
  });

  it('zamienia nazwy na ID przez resolver i pomija lokację samego zadania', () => {
    const ids: Record<string, number> = { Szpital: 41, 'Góra Gromów': 29 };
    const steps = [
      {
        requirements: [],
        rewards: [],
        note: 'Idź do lokacji Góra Gromów.\nIdź do lokacji Szpital.\nWróć.',
      },
    ];
    expect(navLocations(steps, 29, (name) => ids[name])).toEqual([41]);
  });

  it('łączy kolejne części zadania pobocznego przez requires (sąsiednia sekcja albo nawigacja)', () => {
    const q = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
      slug,
      name,
      kind: 'side' as const,
      steps: [],
      ...extra,
    });
    const chapter = {
      id: 'gborn',
      title: 'Gborn',
      reborn: 2,
      sourceCredit: { author: '' },
      sections: [
        {
          locId: 147,
          quests: [q('g/147/kc', 'Kosmiczna Choroba', { alsoAt: [149] }), q('g/147/a', 'Arena')],
        },
        { locId: 148, quests: [] },
        { locId: 149, quests: [q('g/149/kc', 'Kosmiczna Choroba')] },
        { locId: 150, quests: [q('g/150/a', 'Arena')] },
      ],
    };
    const conv = {
      chapter,
      file: 'x',
      report: [],
      locations: [],
      pendingRequires: [],
    } as unknown as ConvertedChapter;
    expect(linkContinuations([conv])).toBe(1);
    expect(chapter.sections[2]!.quests[0]).toMatchObject({ requires: ['g/147/kc'] });
    // „Arena” w odległych lokacjach bez nawigacji to różne zadania
    expect(chapter.sections[3]!.quests[0]).not.toHaveProperty('requires');
  });
});
