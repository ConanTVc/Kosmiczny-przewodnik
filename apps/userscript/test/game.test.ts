import { afterEach, describe, expect, it, vi } from 'vitest';
import { lokalizatorSeconds, readGame, watchGame, type GameChange } from '../src/game';

type G = Record<string, unknown>;
const g = globalThis as unknown as { GAME?: unknown };

/** GAME „na podsłuchu”: zapisuje każde odczytane pole, każde wywołanie i każdą próbę zapisu. */
function spyGame(data: G) {
  const reads: string[] = [];
  const writes: string[] = [];
  const wrap = (obj: G, path: string): G =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') reads.push(`${path}${prop}`);
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value))
          return wrap(value as G, `${path}${String(prop)}.`);
        if (Array.isArray(value))
          return value.map((v, i) =>
            v && typeof v === 'object' ? wrap(v as G, `${path}${String(prop)}[${i}].`) : v,
          );
        return value;
      },
      set(_t, prop) {
        writes.push(String(prop));
        return false;
      },
    });
  g.GAME = wrap(data, 'GAME.');
  return { reads, writes };
}

const fullGame = (): G => ({
  server: 21,
  getTime: () => 1000,
  login: 'TAJNY_LOGIN',
  captcha: 'xyz',
  sitekey: 'abc',
  pid: 99,
  char_id: 3465,
  char_data: {
    id: 3465,
    name: 'Butcher',
    race: 7,
    reborn: 5,
    loc: 1360,
    bonus18: 1000 + 86_000,
    email: 'tajny@example.com',
    gold: 123,
  },
  map_quests: {
    '15_18': [{ qb_id: 629351, rtype: 0, main: 0, name: 'Pomoc Bogini Isztar', secret: 1 }],
    '16_10': [{ qb_id: 853801, rtype: 0, main: 1, name: 'Black' }],
  },
  quest_action: 0,
});

afterEach(() => {
  delete g.GAME;
  vi.useRealTimers();
});

describe('adapter gry – biała lista', () => {
  it('czyta wyłącznie dozwolone pola i niczego nie zapisuje', () => {
    const spy = spyGame(fullGame());
    readGame();
    const allowed = [
      /^GAME\.server$/,
      /^GAME\.getTime$/,
      /^GAME\.char_id$/,
      /^GAME\.char_data$/,
      /^GAME\.char_data\.(id|name|race|reborn|loc|bonus18)$/,
      /^GAME\.map_quests$/,
      /^GAME\.map_quests\.\d+_\d+$/,
      /^GAME\.map_quests\.\d+_\d+\[\d+\]\.(qb_id|rtype|main|name)$/,
    ];
    const forbidden = spy.reads.filter(
      (r) =>
        !allowed.some((re) => re.test(r)) &&
        !/\.(length|constructor|toJSON)$/.test(r) &&
        !/Symbol/.test(r),
    );
    expect(forbidden).toEqual([]);
    expect(
      spy.reads.some((r) => /login|captcha|sitekey|pid|email|gold|quest_action|secret/.test(r)),
    ).toBe(false);
    expect(spy.writes).toEqual([]);
  });

  it('zwraca kopię danych postaci, lokalizatora i mapy', () => {
    spyGame(fullGame());
    const snap = readGame()!;
    expect(snap.character).toEqual({
      key: 's21:c3465',
      id: 3465,
      name: 'Butcher',
      race: 7,
      reborn: 5,
      loc: 1360,
      bonus18: 87_000,
    });
    expect(lokalizatorSeconds(snap)).toBe(86_000);
    expect(snap.mapQuests.map((q) => [q.qid, q.isMain])).toEqual([
      [629351, false],
      [853801, true],
    ]);
  });

  it('postać niewybrana → brak postaci; błąd gry → undefined zamiast wyjątku', () => {
    spyGame({ ...fullGame(), char_data: undefined });
    expect(readGame()?.character).toBeUndefined();
    // ekran wyboru postaci: char_id = 0 (albo brak), nawet gdy zostały stare char_data
    spyGame({ ...fullGame(), char_id: 0 });
    expect(readGame()?.character).toBeUndefined();
    spyGame({ ...fullGame(), char_id: undefined });
    expect(readGame()?.character).toBeUndefined();
    g.GAME = new Proxy(
      {},
      {
        get() {
          throw new Error('gra się sypie');
        },
      },
    );
    expect(() => readGame()).not.toThrow();
    expect(readGame()).toBeUndefined();
    delete g.GAME;
    expect(readGame()).toBeUndefined();
  });

  it('watchGame zgłasza zmiany postaci, lokacji, lokalizatora i mapy', () => {
    vi.useFakeTimers();
    const data = fullGame();
    g.GAME = data;
    const calls: Set<GameChange>[] = [];
    const stop = watchGame((_s, changes) => calls.push(changes), 2000);
    expect([...calls[0]!]).toEqual(
      expect.arrayContaining(['character', 'location', 'lokalizator', 'map']),
    );
    (data['char_data'] as G)['loc'] = 1361;
    vi.advanceTimersByTime(2000);
    expect([...calls[1]!]).toEqual(['location']);
    data['getTime'] = () => 1_000_000;
    vi.advanceTimersByTime(2000);
    expect([...calls[2]!]).toEqual(['lokalizator']);
    vi.advanceTimersByTime(2000);
    expect(calls[3]!.size).toBe(0);
    stop();
  });
});
