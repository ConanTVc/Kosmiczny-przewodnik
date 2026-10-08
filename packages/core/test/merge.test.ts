import { describe, expect, it } from 'vitest';
import { mergeProgress } from '../src/merge';
import {
  applyScanResult,
  emptyProgress,
  setManualStatus,
  setSetting,
  setTracked,
  upsertCharacter,
} from '../src/progress';
import { parseProgress } from '../src/progress-schema';
import type { Progress } from '../src/types';

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
