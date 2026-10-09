import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  emptyProgress,
  mergeProgress,
  setManualStatus,
  SyncClient,
  upsertCharacter,
  visibleCharacters,
  type CharKey,
  type Progress,
  type SyncStatus,
} from '@kp/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, handle, MAX_NEW_CODES_PER_DAY, STALE_AFTER_MS } from '../src/app';
import type { D1Like, Env, RateLimiter } from '../src/env';

/** D1 na SQLite z Node – te same zapytania SQL co na Cloudflare. */
function sqliteD1(): D1Like {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0001_init.sql'), 'utf8'));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args: unknown[] = [];
      const s = {
        bind(...values: unknown[]) {
          args = values;
          return s;
        },
        first: async <T>() => (stmt.get(...(args as never[])) as T | undefined) ?? null,
        all: async <T>() => ({ results: stmt.all(...(args as never[])) as T[] }),
        run: async () => ({ meta: { changes: Number(stmt.run(...(args as never[])).changes) } }),
      };
      return s;
    },
  };
}

function limiter(max: number): RateLimiter & { reset(): void } {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= max };
    },
    reset: () => counts.clear(),
  };
}

const BASE = 'https://sync.test';
const ORIGIN = 'https://s21.kosmiczni.pl';
let clock = 1_800_000_000_000;

function setup(env: Partial<Env> = {}) {
  const full: Env = { DB: sqliteD1(), ...env };
  const call = (path: string, init: RequestInit & { code?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.has('Origin')) headers.set('Origin', ORIGIN);
    if (init.code) headers.set('Authorization', `Bearer ${init.code}`);
    return handle(new Request(`${BASE}${path}`, { ...init, headers }), full, clock);
  };
  const fetcher: typeof fetch = (input, init) =>
    handle(new Request(input as string, init), full, clock);
  return { env: full, call, fetcher };
}

async function newCode(call: ReturnType<typeof setup>['call']): Promise<string> {
  const res = await call('/v1/codes', { method: 'POST' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

const char = (key: CharKey, name: string, at = 1) =>
  upsertCharacter(emptyProgress(), { key, name, race: 7, reborn: 5, loc: 1359 }, at);

const post = (call: ReturnType<typeof setup>['call'], code: string, progress: Progress) =>
  call('/v1/sync', { method: 'POST', code, body: JSON.stringify({ progress }) });

afterEach(() => vi.useRealTimers());

describe('serwer synchronizacji – API', () => {
  it('nowy kod, zapis, odczyt z ETag i 304, usunięcie', async () => {
    const { call, env } = setup();
    const code = await newCode(call);
    expect(code).toMatch(/^KOSMO(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    // w bazie jest tylko hash kodu
    const row = await env.DB.prepare('SELECT id FROM sync_codes').first<{ id: string }>();
    expect(row?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.id).not.toContain(code);

    const p = setManualStatus(
      char('s21:c1', 'Wojownik'),
      's21:c1',
      'hborn/1359/hakaishin',
      'done',
      5,
    );
    const saved = await post(call, code, p);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ rev: 1, base: 0 });

    const got = await call('/v1/sync', { code });
    expect(got.headers.get('ETag')).toBe('"1"');
    expect(got.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const body = (await got.json()) as { progress: Progress };
    expect(body.progress.characters['s21:c1']?.quests['hborn/1359/hakaishin']?.manual?.v).toBe(
      'done',
    );

    const same = await call('/v1/sync', { code, headers: { 'If-None-Match': '"1"' } });
    expect(same.status).toBe(304);

    // kod wpisany „po ludzku” (małe litery, bez myślników) też działa
    const sloppy = code.toLowerCase().replace(/-/g, ' ');
    expect((await call('/v1/sync', { code: sloppy })).status).toBe(200);

    expect((await call('/v1/sync', { method: 'DELETE', code })).status).toBe(204);
    expect((await call('/v1/sync', { code })).status).toBe(404);
  });

  it('serwer scala, nie nadpisuje: starsze dane nie kasują nowszych', async () => {
    const { call } = setup();
    const code = await newCode(call);
    const newer = setManualStatus(char('s21:c1', 'Wojownik'), 's21:c1', 'a/1/x', 'done', 50);
    await post(call, code, newer);
    // „śmieszek” z kodem wysyła starszą wersję albo pustą postać – nic nie ginie
    await post(
      call,
      code,
      setManualStatus(char('s21:c1', 'Wojownik'), 's21:c1', 'a/1/x', 'active', 10),
    );
    await post(call, code, char('s21:c1', 'Wojownik'));
    const body = (await (await call('/v1/sync', { code })).json()) as { progress: Progress };
    expect(body.progress.characters['s21:c1']?.quests['a/1/x']?.manual?.v).toBe('done');
  });

  it('daty z przyszłości są obcinane – nie da się „wygrać” scalania na zawsze', async () => {
    const { call } = setup();
    const code = await newCode(call);
    const future = setManualStatus(
      char('s21:c1', 'X'),
      's21:c1',
      'a/1/x',
      'done',
      clock + 10 * 365 * 86_400_000,
    );
    const res = await post(call, code, future);
    const body = (await res.json()) as { progress: Progress };
    expect(body.progress.characters['s21:c1']?.quests['a/1/x']?.manual?.at).toBe(clock);
    // późniejsza, uczciwa zmiana wygrywa
    clock += 1000;
    await post(
      call,
      code,
      setManualStatus(char('s21:c1', 'X'), 's21:c1', 'a/1/x', 'active', clock),
    );
    const after = (await (await call('/v1/sync', { code })).json()) as { progress: Progress };
    expect(after.progress.characters['s21:c1']?.quests['a/1/x']?.manual?.v).toBe('active');
  });

  it('odrzuca śmieci: zły kod, niepoprawne dane, za duże zapytanie, obce źródło', async () => {
    const { call } = setup();
    const code = await newCode(call);
    expect((await call('/v1/sync', { code: 'KOSMO-NIE-TAK' })).status).toBe(401);
    expect((await call('/v1/sync', {})).status).toBe(401);
    // poprawny format, ale nieistniejący kod
    expect((await call('/v1/sync', { code: `KOSMO-${'0000-'.repeat(6)}0000` })).status).toBe(404);
    expect((await call('/v1/sync', { method: 'POST', code, body: '{zly json' })).status).toBe(400);
    const bad = { progress: { version: 1, settings: {}, characters: { 's1:c1': { name: 1 } } } };
    expect(
      (await call('/v1/sync', { method: 'POST', code, body: JSON.stringify(bad) })).status,
    ).toBe(400);
    const huge = JSON.stringify({ progress: emptyProgress(), junk: 'x'.repeat(300 * 1024) });
    expect((await call('/v1/sync', { method: 'POST', code, body: huge })).status).toBe(413);
    const evil = await call('/v1/sync', { code, headers: { Origin: 'https://zly.example' } });
    expect(evil.status).toBe(403);
    expect((await call('/v1/nie-ma')).status).toBe(404);
  });

  it('limity: liczba postaci na kod', async () => {
    const { call } = setup();
    const code = await newCode(call);
    let p = emptyProgress();
    for (let i = 0; i < 31; i++) p = mergeProgress(p, char(`s1:c${i}`, `P${i}`));
    expect((await post(call, code, p)).status).toBe(400);
    let ok = emptyProgress();
    for (let i = 0; i < 30; i++) ok = mergeProgress(ok, char(`s1:c${i}`, `P${i}`));
    expect((await post(call, code, ok)).status).toBe(200);
    expect((await post(call, code, char('s1:c99', 'Nadmiar'))).status).toBe(400);
  });

  it('limity zapytań: spam tworzenia kodów i zapisów dostaje 429', async () => {
    const { call } = setup({ RL_CREATE: limiter(3), RL_WRITE: limiter(5) });
    for (let i = 0; i < 3; i++) await newCode(call);
    const blocked = await call('/v1/codes', { method: 'POST' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');

    const { call: call2 } = setup({ RL_WRITE: limiter(5) });
    const code = await newCode(call2);
    const statuses = [];
    for (let i = 0; i < 7; i++)
      statuses.push((await post(call2, code, char('s1:c1', 'X', i))).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('dzienny limit nowych kodów na cały serwer', async () => {
    const { call, env } = setup();
    for (let i = 0; i < MAX_NEW_CODES_PER_DAY; i++)
      await env.DB.prepare('INSERT INTO sync_codes (id, created_at, updated_at) VALUES (?, ?, ?)')
        .bind(`x${i}`, clock, clock)
        .run();
    expect((await call('/v1/codes', { method: 'POST' })).status).toBe(503);
  });

  it('cron usuwa kody nieużywane ponad rok', async () => {
    const { call, env } = setup();
    const code = await newCode(call);
    await post(call, code, char('s1:c1', 'X'));
    await cleanup(env, clock + STALE_AFTER_MS + 1);
    expect((await call('/v1/sync', { code })).status).toBe(404);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_chars').first()).toEqual({ n: 0 });
  });

  it('preflight CORS dla gry i aplikacji', async () => {
    const { call } = setup();
    const res = await call('/v1/sync', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    const pwa = await call('/v1/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'https://conantvc.github.io' },
    });
    expect(pwa.headers.get('Access-Control-Allow-Origin')).toBe('https://conantvc.github.io');
  });
});

/** Urządzenie z lokalnym postępem i klientem synchronizacji (jak userscript albo telefon). */
function device(fetcher: typeof fetch, initial: Progress) {
  const d = {
    progress: initial,
    code: undefined as string | undefined,
    status: { state: 'off' } as SyncStatus,
    client: undefined as unknown as SyncClient,
  };
  d.client = new SyncClient({
    baseUrl: BASE,
    fetch: fetcher,
    getLocal: () => d.progress,
    applyRemote: (remote) => {
      d.progress = mergeProgress(d.progress, remote);
    },
    loadCode: async () => d.code,
    saveCode: async (code) => {
      d.code = code;
    },
    onStatus: (s) => {
      d.status = s;
    },
    now: () => clock,
  });
  return d;
}

describe('synchronizacja PC ↔ telefon przez serwer', () => {
  it('PC tworzy kod, telefon się łączy – postęp z obu stron się łączy, nic nie ginie', async () => {
    vi.useFakeTimers();
    const { fetcher } = setup();
    let pcProgress = setManualStatus(
      char('s21:c1', 'Wojownik'),
      's21:c1',
      'hborn/1359/hakaishin',
      'done',
      10,
    );
    const pc = device(fetcher, pcProgress);
    expect(await pc.client.create()).toBe(true);
    expect(pc.status.state).toBe('synced');
    expect(pc.code).toMatch(/^KOSMO-/);

    // telefon ma już ręcznie dodaną postać – nie przepadnie po połączeniu
    const phone = device(fetcher, char('s0:m5', 'Na telefonie'));
    expect(await phone.client.connect(pc.code!.toLowerCase())).toBe(true);
    expect(phone.status.state).toBe('synced');
    expect(
      visibleCharacters(phone.progress)
        .map(([k]) => k)
        .sort(),
    ).toEqual(['s0:m5', 's21:c1']);

    // zmiana na telefonie → PC widzi ją po synchronizacji
    phone.progress = setManualStatus(phone.progress, 's21:c1', 'hborn/1359/inne', 'active', 20);
    phone.client.notifyChange();
    await vi.advanceTimersByTimeAsync(2500); // po 2 s wysyła
    await phone.client.syncNow(); // poczekaj, aż wysyłka się skończy
    await pc.client.syncNow();
    expect(pc.progress.characters['s21:c1']?.quests['hborn/1359/inne']?.manual?.v).toBe('active');
    expect(visibleCharacters(pc.progress).length).toBe(2);
    pcProgress = pc.progress;
    expect(pcProgress.characters['s21:c1']?.quests['hborn/1359/hakaishin']?.manual?.v).toBe('done');
    pc.client.stop();
    phone.client.stop();
  });

  it('zły kod przy łączeniu – czytelny błąd, nic nie zapisane', async () => {
    const { fetcher } = setup();
    const phone = device(fetcher, emptyProgress());
    expect(await phone.client.connect('to nie kod')).toBe(false);
    expect(phone.status).toMatchObject({ state: 'error' });
    expect(await phone.client.connect(`KOSMO-${'ZZZZ-'.repeat(6)}ZZZZ`)).toBe(false);
    expect(phone.status.message).toMatch(/Nie ma takiego kodu/);
    expect(phone.code).toBeUndefined();
  });

  it('brak internetu → „offline” i ponowienie później; usunięty kod → błąd bez ponawiania', async () => {
    vi.useFakeTimers();
    const { fetcher, call } = setup();
    let online = false;
    const flaky: typeof fetch = (input, init) =>
      online ? fetcher(input, init) : Promise.reject(new TypeError('offline'));
    const code = await newCode(call);
    const d = device(flaky, char('s1:c1', 'X'));
    d.code = code;
    await d.client.start();
    expect(d.status.state).toBe('offline');
    online = true;
    await vi.advanceTimersByTimeAsync(31_000); // ponowienie po 30 s
    await vi.waitFor(() => expect(d.status.state).toBe('synced'));

    await call('/v1/sync', { method: 'DELETE', code });
    await d.client.syncNow();
    expect(d.status.state).toBe('error');
    expect(d.status.message).toMatch(/Kodu nie ma już/);
    d.client.stop();
  });

  it('wysyła tylko zmiany – po synchronizacji kolejny cykl to samo 304', async () => {
    const { env } = setup();
    let calls: string[] = [];
    const spy: typeof fetch = async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${new URL(input as string).pathname}`);
      return handle(new Request(input as string, init), env, clock);
    };
    const d = device(spy, char('s1:c1', 'X'));
    await d.client.create();
    calls = [];
    await d.client.syncNow();
    expect(calls).toEqual(['GET /v1/sync']); // nic nowego – tylko 304
    d.client.stop();
  });
});
