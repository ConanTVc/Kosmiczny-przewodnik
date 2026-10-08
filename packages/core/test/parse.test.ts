import { describe, expect, it } from 'vitest';
import { isTeleportListFiltered, parseTeleportList } from '../src/parse/teleports';
import { parseQuestLog, parseQuestTracker } from '../src/parse/questLog';
import { fixtureDocument, htmlDocument } from './helpers';

describe('parseTeleportList (fixtures/tp_list.html)', () => {
  const entries = parseTeleportList(fixtureDocument('tp_list.html'));
  const byId = new Map(entries.map((e) => [e.locId, e]));

  it('czyta wszystkie wiersze z ID lokacji z data-loc (nie travel_loc ani ulubionych)', () => {
    expect(entries).toHaveLength(35);
    expect(byId.has(108111)).toBe(false); // travel_loc_108111 / set_fav_loc
    expect(byId.get(1359)).toEqual({
      locId: 1359,
      name: 'Pałac Aniołów',
      reborn: 5,
      hasQuest: true,
      isCurrent: true,
      isFav: false,
    });
  });

  it('nazwa bez znacznika QUEST i bez końcowych spacji, ulubione, reborn', () => {
    expect(byId.get(991)).toMatchObject({ name: 'Planeta Liguira', hasQuest: true, isFav: true });
    expect(byId.get(985)).toMatchObject({ name: 'Centrum wszechświata', hasQuest: false });
    expect(byId.get(379)?.name).toBe('Alternatywny Pałac Wszechmogącego');
    expect(byId.get(27)).toMatchObject({ reborn: 0, isCurrent: false });
    expect(entries.filter((e) => e.isCurrent)).toHaveLength(1);
  });

  it('rozpoznaje przefiltrowaną listę (ukryte wiersze)', () => {
    expect(isTeleportListFiltered(fixtureDocument('tp_list.html'))).toBe(false);
    const filtered = htmlDocument(
      '<table><tbody id="tp_list"><tr class="option loc2_option" data-loc="1" data-reborn="0"><td>A</td></tr>' +
        '<tr class="option loc2_option" data-loc="2" data-reborn="0" style="display: none"><td>B</td></tr></tbody></table>',
    );
    expect(isTeleportListFiltered(filtered)).toBe(true);
  });

  it('pomija wiersze z błędnymi danymi zamiast się wywracać', () => {
    const doc = htmlDocument(
      '<table><tbody id="tp_list"><tr class="loc2_option" data-loc="abc"><td>X</td></tr><tr class="loc2_option" data-loc="5"></tr></tbody></table>',
    );
    expect(parseTeleportList(doc)).toEqual([]);
  });
});

describe('parseQuestLog (fixtures/qb_list.html)', () => {
  const entries = parseQuestLog(fixtureDocument('qb_list.html'));

  it('czyta wszystkie zadania z qid, lokacją i etapem', () => {
    expect(entries).toHaveLength(36);
    expect(entries[0]).toEqual({
      qid: 312677,
      name: 'Komnata Żywiołów',
      stage: 'Komnata Żywiołów',
      locId: 400,
      locName: 'Miasto Man',
      isMain: false,
      isTracked: true,
    });
  });

  it('zadanie główne: [ GŁÓWNE ], etap = nazwa bazowa', () => {
    const main = entries.filter((e) => e.isMain);
    expect(main).toEqual([
      expect.objectContaining({
        qid: 610128,
        name: 'Hakaishin II',
        stage: 'Hakaishin',
        locId: 1359,
      }),
    ]);
  });

  it('nieśledzone zadanie i końcowe spacje w nazwie', () => {
    expect(entries.find((e) => e.qid === 331781)).toMatchObject({
      name: 'Loteria Aldeara',
      isTracked: false,
    });
    expect(entries.find((e) => e.qid === 401809)?.name).toBe('Wyposażenie strażników');
  });

  it('„Rutyna” w dwóch lokacjach to dwa wpisy', () => {
    expect(entries.filter((e) => e.name === 'Rutyna').map((e) => e.locId)).toEqual([1338, 1358]);
  });
});

describe('parseQuestTracker', () => {
  it('czyta nazwę z <b> i lokację z data-loc, rozpoznaje nazwy skrócone przez grę', () => {
    const doc = htmlDocument(
      '<div id="quest_track_con"><div class="qtrack" data-loc="1359"><b>Hakaishin II</b> Zaczekać</div>' +
        '<div class="qtrack" data-loc="663"><b>Wędrowny Handla...</b> Wykonać zadanie</div>' +
        '<div class="qtrack"><b>Bez lokacji</b></div></div>',
    );
    expect(parseQuestTracker(doc)).toEqual([
      { name: 'Hakaishin II', truncated: false, locId: 1359 },
      { name: 'Wędrowny Handla...', truncated: true, locId: 663 },
    ]);
  });
});
