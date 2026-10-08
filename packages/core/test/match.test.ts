import { describe, expect, it } from 'vitest';
import { indexContent, isForRace } from '../src/content';
import { matchGameQuest, type MatchRule } from '../src/match';
import {
  isTruncatedName,
  nameBeforeDash,
  normalizeQuestName,
  questBaseName,
  sameQuestName,
} from '../src/names';
import { fixtureTsv, loadRealContent } from './helpers';

describe('normalizeQuestName', () => {
  it('usuwa końcowe spacje, ujednolica spacje i wielkość liter', () => {
    expect(normalizeQuestName('  Wyposażenie   strażników ')).toBe('wyposażenie strażników');
    expect(normalizeQuestName('Niedoszły kucharz.')).toBe('niedoszły kucharz');
  });

  it('dopiski [LVx]/[III] zostają częścią klucza w jednej formie', () => {
    expect(normalizeQuestName('Wymiana substancji [LV2]')).toBe('wymiana substancji [lv2]');
    expect(normalizeQuestName('Wymiana substancji [ lvl 2 ]')).toBe('wymiana substancji [lv2]');
    expect(normalizeQuestName('Wymiana [III]')).toBe('wymiana [iii]');
    expect(normalizeQuestName('Wymiana substancji [LV2]')).not.toBe(
      normalizeQuestName('Wymiana substancji [LV3]'),
    );
  });

  it('nazwa bazowa bez numeru części, nazwa przed myślnikiem, nazwy skrócone', () => {
    expect(questBaseName('Hakaishin II')).toBe('hakaishin');
    expect(questBaseName('Pamiątka 2')).toBe('pamiątka');
    expect(questBaseName('Wymiana [III]')).toBe('wymiana');
    expect(nameBeforeDash('Teleport - Hiper Kuźnia')).toBe('teleport');
    expect(isTruncatedName('Wędrowny Handla...')).toBe(true);
    expect(sameQuestName('Wędrowny Handla...', 'Wędrowny Handlarz III')).toBe(true);
    expect(sameQuestName('Rutyna', 'RUTYNA ')).toBe(true);
  });
});

/** Postać autora z serwera 21: Cumber (7) na Hborn (5). */
const CUMBER = 7;

describe('dopasowanie prawdziwego dziennika (fixtures/dziennik_s21.tsv) do prawdziwej treści', () => {
  const index = indexContent(loadRealContent());
  const applicable = (q: { races?: number[] }) => isForRace(q, CUMBER);
  const rows = fixtureTsv('dziennik_s21.tsv').map(([, locId, , name]) => ({
    name: name!,
    locId: Number(locId),
    isMain: /^Hakaishin/.test(name!),
  }));
  const results = rows.map((ref) => ({ ref, match: matchGameQuest(index, ref, applicable) }));

  it('paruje 135 ze 141 wpisów; brakujące to zadania, których nie ma w solucjach', () => {
    expect(rows).toHaveLength(141);
    expect(results.filter((r) => !r.match).map((r) => r.ref.name)).toEqual([
      'Poszukiwania',
      'Pierścień',
      'Prawda albo wyzwanie',
      'Wymiana substancji [LV1]',
      'Wymiana substancji [LV2]',
      'Wymiana substancji [LV3]',
    ]);
  });

  it('większość dopasowań jest pewna; niepewne tylko „po nazwie”', () => {
    const byRule: Partial<Record<MatchRule, number>> = {};
    for (const r of results) if (r.match) byRule[r.match.rule] = (byRule[r.match.rule] ?? 0) + 1;
    expect(byRule).toEqual({
      nazwa: 130,
      'numer-czesci': 1,
      'przed-myslnikiem': 1,
      'po-nazwie': 3,
    });
    expect(results.filter((r) => r.match && !r.match.certain).map((r) => r.ref.name)).toEqual([
      'Odmalowanie Pałacu',
      'Tajemnicza Jaskinia',
      'Praktyka',
    ]);
  });

  const find = (name: string, locId: number) =>
    results.find((r) => r.ref.name === name && r.ref.locId === locId)?.match;

  it('zadanie główne „Hakaishin II” → „Hakaishin” w Pałacu Aniołów', () => {
    expect(find('Hakaishin II', 1359)).toMatchObject({
      quest: { name: 'Hakaishin', kind: 'main', locId: 1359 },
      certain: true,
    });
  });

  it('„Rutyna” w 1338 i 1358 to dwa różne zadania', () => {
    expect(find('Rutyna', 1338)?.quest.slug).not.toBe(find('Rutyna', 1358)?.quest.slug);
  });

  it('zadanie przechodzące przez lokacje: pierwszeństwo ma część z tą lokacją jako główną', () => {
    expect(find('Kosmiczna Choroba', 150)?.quest).toMatchObject({ locId: 150, chapter: 'gborn' });
    expect(find('Poszukiwacz', 41)?.quest.alsoAt).toContain(41);
  });

  it('wspólne lokacje Nonborna: Cumber ma „Wielcy Przodkowie” z solucji Goku', () => {
    expect(find('Wielcy Przodkowie', 84)?.quest).toMatchObject({ chapter: 'goku-n' });
    expect(find('Wielcy Przodkowie', 84)?.quest.races).toBeUndefined();
  });

  it('„Teleport” ↔ „Teleport - Hiper Kuźnia”', () => {
    expect(find('Teleport', 991)).toMatchObject({
      rule: 'przed-myslnikiem',
      quest: { name: 'Teleport - Hiper Kuźnia' },
    });
  });

  it('panel postępów (nazwy skrócone przez grę) paruje się w całości', () => {
    const tracker = fixtureTsv('postepy_s21.tsv').map(([name, locId]) => ({
      name: name!,
      locId: Number(locId),
    }));
    const missing = tracker.filter((t) => !matchGameQuest(index, t, applicable));
    expect(tracker).toHaveLength(88);
    expect(missing).toEqual([]);
  });
});
