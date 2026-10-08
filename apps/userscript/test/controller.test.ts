import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyProgress, parseQuestLog, parseTeleportList } from '@kp/core';
import { describe, expect, it, vi } from 'vitest';
import { EMBEDDED, fetchRemoteContent } from '../src/content';
import { Controller } from '../src/controller';
import type { GameChange, GameSnapshot } from '../src/game';
import { observeGameDom, type DomScanPart } from '../src/observer';
import { localKv, type Kv } from '@kp/ui';

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../../fixtures', name), 'utf8');

function memoryKv(): Kv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => void data.set(key, value),
  };
}

const snapshot = (
  over: Partial<NonNullable<GameSnapshot['character']>> = {},
  mapQuests: GameSnapshot['mapQuests'] = [],
): GameSnapshot => ({
  server: 18,
  time: 1000,
  character: {
    key: 's18:c100',
    id: 100,
    name: 'Testowa',
    race: 0,
    reborn: 5,
    loc: 1359,
    bonus18: 90_000,
    ...over,
  },
  mapQuests,
});
const all = new Set<GameChange>(['character', 'location', 'lokalizator', 'map']);
const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function setup() {
  const kv = memoryKv();
  const onChange = vi.fn();
  let now = 1000;
  const c = new Controller(
    kv,
    { progress: emptyProgress(), loaded: EMBEDDED, knownTeleports: {}, now: () => now++ },
    onChange,
  );
  return { c, kv, onChange };
}

const teleports = (filtered = false): DomScanPart => ({
  kind: 'teleports',
  at: 2000,
  entries: parseTeleportList(doc(fixture('tp_list.html'))),
  filtered,
});
const questLog = (): DomScanPart => ({
  kind: 'questLog',
  at: 2001,
  entries: parseQuestLog(doc(fixture('qb_list.html'))),
});

describe('Controller', () => {
  it('nowa postać: pyta „Śledzić?”; do odpowiedzi nic nie zapisuje', () => {
    const { c } = setup();
    c.onGame(snapshot(), all);
    expect(c.pendingNew).toBe('s18:c100');
    expect(c.progress.characters['s18:c100']?.tracked.v).toBe(false);
    c.onDom(teleports());
    c.onDom(questLog());
    expect(c.lastResult?.statuses['hborn/1359/hakaishin']?.status).toBe('active');
    expect(Object.keys(c.progress.characters['s18:c100']!.quests)).toEqual([]);
  });

  it('„Tak” – postać śledzona, ustalenia ze skanu trafiają do postępu', () => {
    const { c } = setup();
    c.onGame(snapshot(), all);
    c.onDom(teleports());
    c.onDom(questLog());
    c.answerTrack('yes');
    const quests = c.progress.characters['s18:c100']!.quests;
    expect(quests['hborn/1359/hakaishin']?.auto?.v).toEqual({ status: 'active', certain: true });
    expect(Object.keys(quests).length).toBeGreaterThan(100);
  });

  it('„Zawsze śledź nowe” – kolejne postacie śledzone bez pytania', () => {
    const { c } = setup();
    c.onGame(snapshot(), all);
    c.answerTrack('always');
    c.onGame(snapshot({ key: 's18:c200', id: 200, name: 'Druga' }), all);
    expect(c.pendingNew).toBeUndefined();
    expect(c.progress.characters['s18:c200']?.tracked.v).toBe(true);
  });

  it('lista teleportacji, z której zniknęły znane lokacje, jest uznana za przefiltrowaną', () => {
    const { c } = setup();
    c.onGame(snapshot(), all);
    c.onDom(teleports());
    expect(c.scans.get('s18:c100')?.teleports?.partial).toBe(false);
    const part = teleports();
    if (part.kind === 'teleports') part.entries = part.entries.slice(0, 5);
    c.onDom(part);
    expect(c.scans.get('s18:c100')?.teleports?.partial).toBe(true);
    expect(c.buildScan('s18:c100')?.teleportsPartial).toBe(true);
  });

  it('mapa lokacji: zadanie na mapie, a nie w dzienniku → do wzięcia', () => {
    const { c } = setup();
    c.onGame(
      snapshot({ loc: 1360 }, [
        { qid: 1, name: 'Pomoc Bogini Isztar', isMain: false, isDaily: false },
      ]),
      all,
    );
    c.onDom({ kind: 'questLog', at: 2001, entries: [] });
    expect(c.lastResult?.statuses['hborn/1360/pomoc-bogini-isztar']?.status).toBe('available');
  });

  it('zapisuje postęp z opóźnieniem', async () => {
    vi.useFakeTimers();
    const { c, kv } = setup();
    c.onGame(snapshot(), all);
    c.answerTrack('yes');
    expect(kv.data.has('progress')).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(kv.data.get('progress')).toBeDefined();
    vi.useRealTimers();
  });
});

describe('observeGameDom', () => {
  it('odczytuje Teleportacje i Dziennik zadań, gdy pojawią się na stronie', async () => {
    document.body.innerHTML = '<div id="gra"></div>';
    const parts: DomScanPart[] = [];
    const stop = observeGameDom((p) => parts.push(p), document, 10);
    document.getElementById('gra')!.innerHTML = fixture('tp_list.html') + fixture('qb_list.html');
    await new Promise((r) => setTimeout(r, 50));
    expect(parts.map((p) => [p.kind, p.entries.length])).toEqual([
      ['teleports', 35],
      ['questLog', 36],
    ]);
    // Ta sama treść drugi raz – bez ponownego parsowania
    document.getElementById('gra')!.append(document.createElement('span'));
    await new Promise((r) => setTimeout(r, 50));
    expect(parts).toHaveLength(2);
    stop();
  });
});

describe('treść z sieci', () => {
  const ok = (body: unknown) =>
    ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

  it('ta sama wersja albo błąd sieci → zostaje obecna treść', async () => {
    const kv = memoryKv();
    const same = vi.fn(async () => ok({ schemaVersion: 1, version: EMBEDDED.version, files: {} }));
    expect(
      await fetchRemoteContent(EMBEDDED, kv, 'https://x', same as unknown as typeof fetch),
    ).toBeUndefined();
    const broken = vi.fn(async () => {
      throw new Error('blokada CSP');
    });
    expect(
      await fetchRemoteContent(EMBEDDED, kv, 'https://x', broken as unknown as typeof fetch),
    ).toBeUndefined();
    expect(kv.data.size).toBe(0);
  });

  it('plik niezgodny z sha256 z manifestu jest odrzucany', async () => {
    const kv = memoryKv();
    const files = Object.fromEntries(
      ['locations', 'chapters', 'quests', 'guides'].map((n) => [
        `${n}.json`,
        { sha256: 'a'.repeat(64), bytes: 2 },
      ]),
    );
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('manifest.json')
        ? ok({ schemaVersion: 1, version: '0123456789abcdef', files })
        : ok([]),
    );
    expect(
      await fetchRemoteContent(EMBEDDED, kv, 'https://x', fetcher as unknown as typeof fetch),
    ).toBeUndefined();
  });

  it('localKv działa także bez localStorage', async () => {
    const kv = localKv(null);
    await kv.set('a', 1);
    expect(await kv.get('a')).toBeUndefined();
  });
});
