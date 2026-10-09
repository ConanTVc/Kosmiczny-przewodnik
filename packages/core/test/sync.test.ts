import { describe, expect, it } from 'vitest';
import { mergeProgress } from '../src/merge';
import {
  emptyProgress,
  linkCharacter,
  setManualStatus,
  setSetting,
  setStepDone,
  upsertCharacter,
  visibleCharacters,
} from '../src/progress';
import { parseProgress } from '../src/progress-schema';
import {
  checkSyncLimits,
  clampFutureStamps,
  generateSyncCode,
  normalizeSyncCode,
  progressDelta,
  splitDelta,
} from '../src/sync';
import type { CharKey, Progress } from '../src/types';

const char = (key: CharKey, name = 'Butcher', at = 1) =>
  upsertCharacter(emptyProgress(), { key, name, race: 7, reborn: 5, loc: 1359 }, at);

describe('kod synchronizacji', () => {
  it('140 bitów losowości w czytelnym formacie bez mylących znaków', () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^KOSMO(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    expect(new Set(Array.from({ length: 50 }, () => generateSyncCode())).size).toBe(50);
    // ten sam bajt zawsze ten sam znak (deterministycznie przy danym źródle losowości)
    expect(generateSyncCode((b) => b.fill(0))).toBe(`KOSMO-${'0000-'.repeat(6)}0000`);
  });

  it('toleruje literówki: małe litery, spacje, brak myślników, O/0 i I/L/1', () => {
    const code = generateSyncCode((b) => b.map((_, i) => i * 7));
    const typed = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    expect(normalizeSyncCode(typed)).toBe(code);
    expect(normalizeSyncCode(code.replace('KOSMO-', ''))).toBe(code);
    expect(normalizeSyncCode('KOSMO-ABCD')).toBeUndefined();
    expect(normalizeSyncCode(`KOSMO-${'UUUU-'.repeat(6)}UUUU`)).toBeUndefined(); // „U” nie ma w alfabecie
  });
});

describe('wysyłka tylko zmian', () => {
  it('nic się nie zmieniło → brak; nowe zadanie → tylko ono (z danymi postaci)', () => {
    const base = setManualStatus(char('s1:c1'), 's1:c1', 'a/1/x', 'done', 5);
    expect(progressDelta(base, base)).toBeUndefined();
    const local = setManualStatus(base, 's1:c1', 'a/1/y', 'active', 6);
    const delta = progressDelta(local, base)!;
    expect(Object.keys(delta.characters['s1:c1']!.quests)).toEqual(['a/1/y']);
    expect(delta.characters['s1:c1']!.name.v).toBe('Butcher');
    expect(parseProgress(delta)).toBeDefined();
    // nowa postać i nowe ustawienie – w całości
    const more = setSetting(mergeProgress(local, char('s1:c2', 'Druga')), 'theme', 'light', 7);
    const d2 = progressDelta(more, base)!;
    expect(Object.keys(d2.characters).sort()).toEqual(['s1:c1', 's1:c2']);
    expect(Object.keys(d2.settings)).toEqual(['theme']);
    // scalenie zmian z wersją serwera daje lokalny stan
    expect(mergeProgress(base, d2)).toEqual(mergeProgress(base, more));
  });

  it('duża postać dzielona na kawałki; scalone kawałki = całość', () => {
    let p = char('s1:c1');
    for (let i = 0; i < 400; i++)
      p = setStepDone(p, 's1:c1', `rozdzial/1/zadanie-${i}`, 2, true, 5, 10);
    p = mergeProgress(p, char('s1:c2', 'Druga'));
    const parts = splitDelta(p, 8 * 1024);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) {
      expect(JSON.stringify(part).length).toBeLessThan(9 * 1024);
      expect(parseProgress(part)).toBeDefined();
    }
    expect(parts.reduce((acc, part) => mergeProgress(acc, part), emptyProgress())).toEqual(p);
  });
});

describe('ochrona serwera', () => {
  it('daty z przyszłości obcinane do „teraz”, poprawne zostają', () => {
    const now = 1_000_000;
    let p: Progress = setManualStatus(
      char('s1:c1', 'X', 10),
      's1:c1',
      'a/1/x',
      'done',
      now + 10 ** 9,
    );
    p = setSetting(p, 'theme', 'dark', now * 9);
    const fixed = clampFutureStamps(p, now);
    expect(fixed.characters['s1:c1']!.quests['a/1/x']!.manual!.at).toBe(now);
    expect(fixed.settings['theme']!.at).toBe(now);
    expect(fixed.characters['s1:c1']!.name.at).toBe(10);
    expect(parseProgress(fixed)).toBeDefined();
  });

  it('limity liczby postaci', () => {
    let p = emptyProgress();
    for (let i = 0; i < 31; i++) p = mergeProgress(p, char(`s1:c${i}`));
    expect(checkSyncLimits(p)).toMatch(/Za dużo postaci/);
    expect(checkSyncLimits(char('s1:c1'))).toBeUndefined();
  });
});

describe('łączenie postaci z telefonu z postacią z gry', () => {
  it('postęp z ręcznej postaci trafia do postaci z gry, ręczna znika', () => {
    let p = mergeProgress(char('s21:c3465', 'Butcher', 5), char('s0:m100', 'Butcher (telefon)', 5));
    p = setManualStatus(p, 's0:m100', 'hborn/1359/a', 'done', 10);
    p = setManualStatus(p, 's21:c3465', 'hborn/1359/b', 'active', 11);
    p = setManualStatus(p, 's21:c3465', 'hborn/1359/a', 'active', 3); // starsze – przegrywa
    const linked = linkCharacter(p, 's0:m100', 's21:c3465', 20);
    expect(visibleCharacters(linked).map(([k]) => k)).toEqual(['s21:c3465']);
    const quests = linked.characters['s21:c3465']!.quests;
    expect(quests['hborn/1359/a']!.manual!.v).toBe('done');
    expect(quests['hborn/1359/b']!.manual!.v).toBe('active');
    expect(linkCharacter(p, 's0:m100', 's0:m100', 20)).toBe(p);
  });
});
