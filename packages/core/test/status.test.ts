import { describe, expect, it } from 'vitest';
import { filterForCharacter, indexContent } from '../src/content';
import { parseQuestLog } from '../src/parse/questLog';
import { parseTeleportList } from '../src/parse/teleports';
import { applyScanResult, emptyProgress, setManualStatus, upsertCharacter } from '../src/progress';
import { computeStatuses } from '../src/status';
import { parseMapQuests } from '../src/mapQuests';
import type { QuestLogEntry, Scan, TeleportEntry } from '../src/types';
import { fixtureDocument, loadRealContent, miniContent } from './helpers';

const tp = (locId: number, hasQuest = false): TeleportEntry => ({
  locId,
  name: `Lokacja ${locId}`,
  reborn: 0,
  hasQuest,
  isCurrent: false,
  isFav: false,
});
let qid = 1;
const log = (name: string, locId: number, isMain = false): QuestLogEntry => ({
  qid: qid++,
  name,
  stage: name,
  locId,
  locName: `Lokacja ${locId}`,
  isMain,
  isTracked: true,
});

/**
 * Gborn (reborn 2, wszystkie rasy): fabuła „Boskie obowiązki” przez lokacje 10 → 11 → 12 → 13,
 * zadanie „Kosmiczna Choroba” przechodzi 10 → 12, w 11 dwa zadania poboczne, w 13 jedno.
 * Nonborn Goku (reborn 0, rasa 0) i Uborn (reborn 3).
 */
const content = miniContent([
  {
    id: 'goku-n',
    reborn: 0,
    races: [0],
    sections: [{ locId: 1, quests: [{ name: 'Zguba', kind: 'main' }, { name: 'Niedowiarek' }] }],
  },
  {
    id: 'gborn',
    reborn: 2,
    sections: [
      {
        locId: 10,
        quests: [
          { name: 'Boskie obowiązki', kind: 'main' },
          { name: 'Kosmiczna Choroba', alsoAt: [12] },
        ],
      },
      {
        locId: 11,
        quests: [
          { name: 'Boskie obowiązki', kind: 'main', slug: 'gborn/11/glowne' },
          { name: 'Rutyna' },
          { name: 'Inwazja' },
        ],
      },
      {
        locId: 12,
        quests: [
          { name: 'Boskie obowiązki', kind: 'main', slug: 'gborn/12/glowne' },
          {
            name: 'Kosmiczna Choroba',
            slug: 'gborn/12/kc',
            continues: 'gborn/10/kosmiczna-choroba',
          },
          { name: 'Zbieractwo', requires: ['gborn/11/rutyna'] },
        ],
      },
      {
        locId: 13,
        quests: [
          { name: 'Boskie obowiązki', kind: 'main', slug: 'gborn/13/glowne' },
          { name: 'Rutyna', slug: 'gborn/13/rutyna' },
          { name: 'Wymiana', kind: 'daily' },
        ],
      },
    ],
  },
  {
    id: 'uborn',
    reborn: 3,
    sections: [{ locId: 20, quests: [{ name: 'Wymiar U', kind: 'main' }] }],
  },
]);
const index = indexContent(content);
const character = { race: 0 as const, reborn: 2 as const };
const scan = (s: Partial<Scan>): Scan => ({ at: 1000, lokalizatorActive: true, ...s });
const status = (out: ReturnType<typeof computeStatuses>, slug: string) => {
  const r = out.statuses[slug];
  return r && `${r.status}${r.certain ? '' : '?'}`;
};

describe('filterForCharacter', () => {
  it('pomija zadania innych ras, dzieli na „teraz” i „przed tobą”', () => {
    expect(filterForCharacter(content, 7, 2).current.some((q) => q.chapter === 'goku-n')).toBe(
      false,
    );
    const view = filterForCharacter(content, 0, 2);
    expect(view.current.map((q) => q.chapter)).toContain('goku-n');
    expect(view.ahead.map((q) => q.slug)).toEqual(['uborn/20/wymiar-u']);
  });
});

describe('computeStatuses', () => {
  it('bez lokalizatora nie wnioskuje „zrobione” z braku QUEST', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ lokalizatorActive: false, teleports: [tp(11), tp(13)] }),
    });
    expect(status(out, 'gborn/11/rutyna')).toBe('unknown?');
    expect(status(out, 'gborn/13/rutyna')).toBe('unknown?');
  });

  it('z lokalizatorem: lokacja bez QUEST → zrobione, z QUEST i jednym zadaniem → do wzięcia (pewne)', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ teleports: [tp(10), tp(11), tp(12), tp(13, true)], questLog: [] }),
    });
    expect(status(out, 'gborn/11/rutyna')).toBe('done');
    expect(status(out, 'gborn/11/inwazja')).toBe('done');
    // W 13 jest też zadanie codzienne – znacznik QUEST może być od niego, więc niepewne.
    expect(status(out, 'gborn/13/rutyna')).toBe('available?');
    expect(status(out, 'gborn/13/wymiana')).toBe('unknown?');
  });

  it('dziennik: „w trakcie”, fabuła główna przed – zrobiona, dalej – przed tobą', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({
        teleports: [tp(10), tp(11, true), tp(12, true)],
        questLog: [log('Boskie obowiązki II', 12, true), log('Rutyna', 11)],
      }),
    });
    expect(status(out, 'gborn/12/glowne')).toBe('active');
    expect(status(out, 'gborn/10/boskie-obowi-zki')).toBe('done');
    expect(status(out, 'gborn/11/glowne')).toBe('done');
    expect(status(out, 'gborn/13/glowne')).toBe('locked');
    expect(status(out, 'gborn/11/rutyna')).toBe('active');
    // W 11 jest aktywna „Rutyna”, więc QUEST może być od niej – „Inwazja” niepewna.
    expect(status(out, 'gborn/11/inwazja')).toBe('available?');
    // Lokacji 13 nie ma na liście, a fabuła tam jeszcze nie doszła → nieodkryta.
    expect(status(out, 'gborn/13/rutyna')).toBe('locked');
  });

  it('„Rutyna” w dwóch lokacjach to dwa zadania', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ questLog: [log('Rutyna', 13)] }),
    });
    expect(status(out, 'gborn/13/rutyna')).toBe('active');
    expect(status(out, 'gborn/11/rutyna')).toBe('unknown?');
  });

  it('dalsza część zadania w trakcie → wcześniejsza zrobiona; wcześniejsza w trakcie → dalsza zablokowana', () => {
    const later = computeStatuses({
      index,
      character,
      scan: scan({ questLog: [log('Kosmiczna Choroba', 12)] }),
    });
    expect(status(later, 'gborn/12/kc')).toBe('active');
    expect(status(later, 'gborn/10/kosmiczna-choroba')).toBe('done');

    const earlier = computeStatuses({
      index,
      character,
      scan: scan({ questLog: [log('Kosmiczna Choroba', 10)] }),
    });
    expect(status(earlier, 'gborn/10/kosmiczna-choroba')).toBe('active');
    expect(status(earlier, 'gborn/12/kc')).toBe('locked');
  });

  it('„Wykonać zadanie” (requires) nie blokuje – oba zadania mogą być naraz w trakcie', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ questLog: [log('Zbieractwo', 12), log('Rutyna', 11)] }),
    });
    expect(status(out, 'gborn/12/zbieractwo')).toBe('active');
    expect(status(out, 'gborn/11/rutyna')).toBe('active');
  });

  it('zadania z dziennika bez odpowiednika w treści trafiają do unmatched', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ questLog: [log('Pierścień', 298)] }),
    });
    expect(out.unmatched.map((e) => e.name)).toEqual(['Pierścień']);
  });

  it('reborn: wcześniejsza fabuła główna zrobiona, wyższy reborn zablokowany', () => {
    const out = computeStatuses({ index, character, now: 5 });
    expect(status(out, 'goku-n/1/zguba')).toBe('done');
    expect(status(out, 'goku-n/1/niedowiarek')).toBe('unknown?');
    expect(status(out, 'uborn/20/wymiar-u')).toBe('locked');
  });

  it('przefiltrowana lista teleportacji – z braku lokacji nic nie wnioskujemy', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({ teleports: [tp(10)], teleportsPartial: true }),
    });
    expect(status(out, 'gborn/13/rutyna')).toBe('unknown?');
  });

  it('ręczne ustawienie wygrywa z auto; „przywróć auto” (null) wraca do wykrywania', () => {
    const key = 's21:c1';
    let progress = upsertCharacter(
      emptyProgress(),
      { key, name: 'Butcher', race: 0, reborn: 2 },
      1,
    );
    progress = setManualStatus(progress, key, 'gborn/11/rutyna', 'done', 2);
    const s = scan({ questLog: [log('Rutyna', 11)] });
    const manual = computeStatuses({
      index,
      character,
      scan: s,
      progress: progress.characters[key],
    });
    expect(manual.statuses['gborn/11/rutyna']).toMatchObject({
      status: 'done',
      source: 'manual',
      at: 2,
    });

    progress = setManualStatus(progress, key, 'gborn/11/rutyna', null, 3);
    const auto = computeStatuses({ index, character, scan: s, progress: progress.characters[key] });
    expect(auto.statuses['gborn/11/rutyna']).toMatchObject({ status: 'active', source: 'auto' });
  });

  it('pamięta wcześniejsze skany; zadanie, które zniknęło z dziennika → pewnie zrobione', () => {
    const key = 's21:c1';
    let progress = upsertCharacter(emptyProgress(), { key, name: 'B', race: 0, reborn: 2 }, 1);
    const first = scan({ at: 100, questLog: [log('Inwazja', 11)] });
    progress = applyScanResult(
      progress,
      key,
      first,
      computeStatuses({ index, character, scan: first }),
    );

    const phone = computeStatuses({
      index,
      character,
      progress: progress.characters[key],
      now: 200,
    });
    expect(phone.statuses['gborn/11/inwazja']).toMatchObject({
      status: 'active',
      basis: 'history',
      at: 100,
    });

    const second = scan({ at: 300, questLog: [] });
    const later = computeStatuses({
      index,
      character,
      scan: second,
      progress: progress.characters[key],
    });
    expect(status(later, 'gborn/11/inwazja')).toBe('done?');
  });
});

describe('statusy na fixtures z gry (tp_list + qb_list, Hborn)', () => {
  const real = indexContent(loadRealContent());
  const out = computeStatuses({
    index: real,
    character: { race: 0, reborn: 5 },
    scan: {
      at: 1,
      lokalizatorActive: true,
      teleports: parseTeleportList(fixtureDocument('tp_list.html')),
      questLog: parseQuestLog(fixtureDocument('qb_list.html')),
    },
  });

  it('zadanie główne w trakcie w Pałacu Aniołów, wcześniejsza fabuła Hborn zrobiona', () => {
    expect(out.statuses['hborn/1359/hakaishin']).toMatchObject({ status: 'active', certain: true });
    expect(out.statuses['hborn/985/ultra-instynkt']?.status).toBe('done');
  });

  it('Centrum wszechświata (bez QUEST, lokalizator aktywny) – zadania poboczne zrobione', () => {
    const side = real.content.quests.filter((q) => q.locId === 985 && q.kind === 'side');
    expect(side.length).toBeGreaterThan(0);
    for (const q of side) expect(out.statuses[q.slug]?.status).toBe('done');
  });

  it('wszystkie zadania z dziennika są dopasowane albo w unmatched', () => {
    expect(out.matched.length + out.unmatched.length).toBe(36);
    // Tych zadań nie ma w solucjach (Szczyt Marsa, Planeta Bogów – Wschód, Hiper Kuźnia).
    expect(out.unmatched.map((e) => e.name)).toEqual([
      'Wymiana substancji [LV2]',
      'Wymiana substancji [LV3]',
      'Wymiana [III]',
      'Opaska Hiper',
    ]);
  });
});

describe('mapa lokacji (GAME.map_quests)', () => {
  it('parseMapQuests kopiuje tylko qb_id, rtype, main, name i pomija błędne wpisy', () => {
    const raw = {
      '16_10': [{ qb_id: 853801, rtype: 0, main: 1, name: 'Black', sekret: 'x' }],
      '5_6': [
        { qb_id: 853802, rtype: 0, main: 0, name: 'Organizacja ' },
        { qb_id: 'zle', name: 'X' },
      ],
      '7_7': [{ qb_id: 9, rtype: 1, main: 0, name: 'Codzienne' }],
      '1_1': 'nie tablica',
    };
    expect(parseMapQuests(raw)).toEqual([
      { qid: 853801, name: 'Black', isMain: true, isDaily: false },
      { qid: 853802, name: 'Organizacja', isMain: false, isDaily: false },
      { qid: 9, name: 'Codzienne', isMain: false, isDaily: true },
    ]);
    expect(parseMapQuests(undefined)).toEqual([]);
  });

  it('na mapie, a nie w dzienniku → do wzięcia; nie ma na mapie → pewnie zrobione; qb_id z dziennika → w trakcie', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({
        lokalizatorActive: false,
        questLog: [{ ...log('Inwazja', 11), qid: 500 }],
        mapQuests: [
          {
            locId: 11,
            at: 900,
            quests: [
              { qid: 500, name: 'Inwazja', isMain: false, isDaily: false },
              { qid: 501, name: 'Rutyna', isMain: false, isDaily: false },
              { qid: 502, name: 'Nieznane na mapie', isMain: false, isDaily: false },
            ],
          },
        ],
      }),
    });
    expect(status(out, 'gborn/11/inwazja')).toBe('active');
    expect(status(out, 'gborn/11/rutyna')).toBe('available');
    expect(status(out, 'gborn/11/glowne')).toBe('done?');
    expect(out.unmatchedMap.map((u) => u.quest.name)).toEqual(['Nieznane na mapie']);
  });

  it('bez dziennika zadanie z mapy jest niepewne (może być w trakcie)', () => {
    const out = computeStatuses({
      index,
      character,
      scan: scan({
        mapQuests: [
          {
            locId: 11,
            at: 900,
            quests: [{ qid: 501, name: 'Rutyna', isMain: false, isDaily: false }],
          },
        ],
      }),
    });
    expect(status(out, 'gborn/11/rutyna')).toBe('available?');
  });
});
