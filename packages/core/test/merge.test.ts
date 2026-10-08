import { describe, expect, it } from 'vitest';
import { mergeProgress } from '../src/merge';
import {
  applyScanResult,
  emptyProgress,
  questLists,
  removeCharacter,
  setLastLoc,
  setManualStatus,
  setReborn,
  setQuestLists,
  setSetting,
  setStepDone,
  setTracked,
  upsertCharacter,
  visibleCharacters,
} from '../src/progress';
import { parseProgress } from '../src/progress-schema';
import { manualCharKey, type Progress } from '../src/types';

const KEY = 's21:c3465';
const base = () =>
  upsertCharacter(
    emptyProgress(),
    { key: KEY, name: 'Butcher', race: 7, reborn: 5, loc: 1359 },
    10,
  );

describe('mergeProgress', () => {
  it('last-write-wins osobno dla każdego pola postaci', () => {
    const pc = upsertCharacter(
      base(),
      { key: KEY, name: 'Butcher', race: 7, reborn: 6, loc: 1365 },
      50,
    );
    const phone = setTracked(base(), KEY, false, 40);
    const merged = mergeProgress(pc, phone);
    expect(merged.characters[KEY]).toMatchObject({
      reborn: { v: 6, at: 50 },
      lastLoc: { v: 1365, at: 50 },
      tracked: { v: false, at: 40 },
      lastSeen: 50,
    });
  });

  it('ręczne „zrobione” z telefonu nie przegrywa ze świeższym skanem z komputera', () => {
    const phone = setManualStatus(base(), KEY, 'hborn/1342/ostatni-rejs', 'done', 20);
    const pc = applyScanResult(
      base(),
      KEY,
      { at: 30, lokalizatorActive: true, questLog: [] },
      {
        statuses: {
          'hborn/1342/ostatni-rejs': {
            status: 'active',
            source: 'auto',
            basis: 'scan',
            at: 30,
            certain: true,
            reason: '',
          },
        },
        matched: [],
        unmatched: [],
        unmatchedMap: [],
      },
    );
    const merged = mergeProgress(phone, pc).characters[KEY]!.quests['hborn/1342/ostatni-rejs'];
    expect(merged).toEqual({
      manual: { v: 'done', at: 20 },
      auto: { v: { status: 'active', certain: true }, at: 30 },
    });
  });

  it('„przywróć auto” (nowsze null) wygrywa ze starszym ręcznym ustawieniem', () => {
    const a = setManualStatus(base(), KEY, 'q', 'done', 20);
    const b = setManualStatus(a, KEY, 'q', null, 25);
    expect(mergeProgress(a, b).characters[KEY]!.quests['q']!.manual).toEqual({ v: null, at: 25 });
  });

  it('konflikt w tej samej chwili rozstrzygany deterministycznie, niezależnie od kolejności', () => {
    const a = setManualStatus(base(), KEY, 'q', 'done', 20);
    const b = setManualStatus(base(), KEY, 'q', 'active', 20);
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
    expect(mergeProgress(a, b).characters[KEY]!.quests['q']!.manual!.v).toBe('done');
  });

  it('postacie i ustawienia z obu stron są zachowane', () => {
    const a = setSetting(base(), 'theme', 'dark', 5);
    const b = upsertCharacter(
      setSetting(emptyProgress(), 'trackNew', 'always', 6),
      { key: 's18:c1', name: 'Inna', race: 0, reborn: 2 },
      7,
    );
    const merged = mergeProgress(a, b);
    expect(Object.keys(merged.characters).sort()).toEqual(['s18:c1', KEY]);
    expect(Object.keys(merged.settings).sort()).toEqual(['theme', 'trackNew']);
  });

  it('jest przemienne, łączne i idempotentne (losowe postępy)', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const statuses = ['done', 'active', 'available', null] as const;
    const random = (): Progress => {
      let p = upsertCharacter(
        emptyProgress(),
        { key: KEY, name: `N${rnd(3)}`, race: 7, reborn: rnd(7) as 0, loc: rnd(5) + 1 },
        rnd(10),
      );
      for (let i = 0; i < 8; i++)
        p = setManualStatus(p, KEY, `q${rnd(4)}`, statuses[rnd(4)]!, rnd(10));
      if (rnd(2)) p = setSetting(p, 'theme', rnd(2) ? 'dark' : 'light', rnd(10));
      return p;
    };
    for (let i = 0; i < 200; i++) {
      const [a, b, c] = [random(), random(), random()];
      expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
      expect(mergeProgress(mergeProgress(a, b), c)).toEqual(mergeProgress(a, mergeProgress(b, c)));
      expect(mergeProgress(a, a)).toEqual(a);
    }
  });
});

describe('postęp', () => {
  it('ponowne odświeżenie tych samych danych nie zmienia znaczników czasu', () => {
    const again = upsertCharacter(
      base(),
      { key: KEY, name: 'Butcher', race: 7, reborn: 5, loc: 1359 },
      99,
    );
    expect(again.characters[KEY]).toMatchObject({
      name: { at: 10 },
      reborn: { at: 10 },
      lastLoc: { at: 10 },
      lastSeen: 99,
    });
  });

  it('zapisuje ze skanu tylko ustalenia ze skanu i tylko gdy się zmieniły', () => {
    const result = {
      statuses: {
        a: {
          status: 'done' as const,
          source: 'auto' as const,
          basis: 'scan' as const,
          at: 30,
          certain: true,
          reason: '',
        },
        b: {
          status: 'locked' as const,
          source: 'auto' as const,
          basis: 'scan' as const,
          at: 30,
          certain: true,
          reason: '',
        },
        c: {
          status: 'done' as const,
          source: 'auto' as const,
          basis: 'content' as const,
          at: 30,
          certain: true,
          reason: '',
        },
      },
      matched: [],
      unmatched: [],
      unmatchedMap: [],
    };
    const once = applyScanResult(
      base(),
      KEY,
      { at: 30, lokalizatorActive: true, teleports: [], questLog: [] },
      result,
    );
    expect(Object.keys(once.characters[KEY]!.quests)).toEqual(['a']);
    expect(once.characters[KEY]!.lastScan).toEqual({ v: 30, at: 30 });
    const twice = applyScanResult(
      once,
      KEY,
      { at: 60, lokalizatorActive: true, questLog: [] },
      result,
    );
    expect(twice.characters[KEY]!.quests['a']!.auto!.at).toBe(30);
  });

  it('parseProgress przyjmuje poprawny postęp i odrzuca uszkodzony', () => {
    const p = setManualStatus(base(), KEY, 'q', 'done', 20);
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseProgress({ version: 1, settings: {}, characters: { zly: {} } })).toBeUndefined();
    expect(parseProgress('nie JSON')).toBeUndefined();
  });
});

describe('kroki i własne listy', () => {
  it('kroki po kolei: odhaczenie kroku 7 zaznacza 1–6, odznaczenie kroku 2 zdejmuje kolejne', () => {
    const slug = 'hborn/1359/hakaishin';
    let p = setStepDone(base(), KEY, slug, 6, true, 10, 10);
    const steps = () =>
      Object.entries(p.characters[KEY]!.quests[slug]!.steps!)
        .filter(([, s]) => s.v)
        .map(([i]) => Number(i));
    expect(steps()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    p = setStepDone(p, KEY, slug, 7, true, 10, 11);
    expect(steps()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Kroki 1–7 już były odhaczone – nie dostają nowego znacznika czasu.
    expect(p.characters[KEY]!.quests[slug]!.steps!['0']!.at).toBe(10);
    p = setStepDone(p, KEY, slug, 1, false, 10, 12);
    expect(steps()).toEqual([0]);
  });

  it('odznaczenie kroku w zrobionym zadaniu zmienia je na „w trakcie”', () => {
    let p = setStepDone(base(), KEY, 'q', 2, true, 3, 10);
    expect(p.characters[KEY]!.quests['q']!.manual?.v).toBe('done');
    p = setStepDone(p, KEY, 'q', 2, false, 3, 11);
    expect(p.characters[KEY]!.quests['q']!.manual).toEqual({ v: 'active', at: 11 });
  });

  it('odhaczenie wszystkich kroków oznacza zadanie jako zrobione; bez ostatniego – nie', () => {
    let p = setStepDone(base(), KEY, 'hborn/1048/duchy-ognia', 0, true, 3, 10);
    p = setStepDone(p, KEY, 'hborn/1048/duchy-ognia', 1, true, 3, 11);
    expect(p.characters[KEY]!.quests['hborn/1048/duchy-ognia']!.manual).toBeUndefined();
    p = setStepDone(p, KEY, 'hborn/1048/duchy-ognia', 2, true, 3, 12);
    expect(p.characters[KEY]!.quests['hborn/1048/duchy-ognia']!.manual).toEqual({
      v: 'done',
      at: 12,
    });
  });

  it('listy: bez duplikatów, posortowane, „Na później” zawsze dostępna', () => {
    const p = setQuestLists(base(), KEY, 'q', ['Exp', ' Na później ', 'Exp'], 5);
    expect(p.characters[KEY]!.quests['q']!.lists).toEqual({ v: ['Exp', 'Na później'], at: 5 });
    expect(questLists(p.characters[KEY])).toEqual(['Na później', 'Exp']);
    expect(questLists(undefined)).toEqual(['Na później']);
  });

  it('kroki scalane osobno z dwóch urządzeń, listy last-write-wins', () => {
    // Telefon: odhaczone do kroku 4. Komputer: krok 1, a później odznaczony krok 4.
    const phone = setQuestLists(setStepDone(base(), KEY, 'q', 3, true, 5, 20), KEY, 'q', [], 25);
    const pc = setQuestLists(
      setStepDone(setStepDone(base(), KEY, 'q', 0, true, 5, 10), KEY, 'q', 3, false, 5, 30),
      KEY,
      'q',
      ['Na później'],
      30,
    );
    const merged = mergeProgress(pc, phone).characters[KEY]!.quests['q']!;
    expect(merged.steps).toEqual({
      '0': { v: true, at: 20 },
      '1': { v: true, at: 20 },
      '2': { v: true, at: 20 },
      '3': { v: false, at: 30 },
      '4': { v: false, at: 30 },
    });
    expect(merged.lists).toEqual({ v: ['Na później'], at: 30 });
    expect(mergeProgress(pc, phone)).toEqual(mergeProgress(phone, pc));
    expect(parseProgress(JSON.parse(JSON.stringify(mergeProgress(pc, phone))))).toBeDefined();
  });
});

describe('postać dodana ręcznie (telefon)', () => {
  it('klucz z „m”, schemat go przyjmuje; lokacja i reborn ustawiane ręcznie', () => {
    const key = manualCharKey(undefined, 1700000000000);
    expect(key).toBe('s0:m1700000000000');
    let p = upsertCharacter(emptyProgress(), { key, name: 'Telefon', race: 7, reborn: 4 }, 1);
    p = setLastLoc(p, key, 1359, 2);
    p = setReborn(p, key, 5, 3);
    expect(p.characters[key]).toMatchObject({
      lastLoc: { v: 1359, at: 2 },
      reborn: { v: 5, at: 3 },
    });
    // ta sama wartość nie zmienia znacznika czasu
    expect(setLastLoc(p, key, 1359, 9).characters[key]!.lastLoc.at).toBe(2);
    expect(parseProgress(p)).toBeDefined();
    expect(parseProgress({ ...p, characters: { 's1:x5': p.characters[key] } })).toBeUndefined();
  });
});

describe('usuwanie postaci', () => {
  it('usunięta znika z listy i traci postęp; starsza kopia z innego urządzenia jej nie przywraca', () => {
    const phone = setManualStatus(base(), KEY, 'hborn/1359/hakaishin', 'done', 20);
    const removed = removeCharacter(phone, KEY, 30);
    expect(visibleCharacters(removed)).toEqual([]);
    expect(removed.characters[KEY]!.quests).toEqual({});
    expect(parseProgress(removed)).toBeDefined();
    const merged = mergeProgress(removed, phone);
    expect(visibleCharacters(merged)).toEqual([]);
    expect(mergeProgress(phone, removed)).toEqual(merged);
  });

  it('postać dodana znowu (np. weszła do gry) wraca jak nowa, bez starego postępu', () => {
    const removed = removeCharacter(
      setManualStatus(base(), KEY, 'hborn/1359/hakaishin', 'done', 20),
      KEY,
      30,
    );
    const again = upsertCharacter(
      removed,
      { key: KEY, name: 'Butcher', race: 7, reborn: 6, loc: 1400 },
      40,
      false,
    );
    expect(visibleCharacters(again).map(([k]) => k)).toEqual([KEY]);
    expect(again.characters[KEY]).toMatchObject({
      removed: { v: false, at: 40 },
      tracked: { v: false, at: 40 },
      reborn: { v: 6 },
      quests: {},
    });
    // ponowne dodanie jest nowsze niż usunięcie – wygrywa przy scalaniu
    expect(visibleCharacters(mergeProgress(removed, again)).length).toBe(1);
  });
});
