import { parseProgress, emptyProgress } from '@kp/core';
import type { Kv } from '@kp/ui';
import { describe, expect, it, vi } from 'vitest';
import { ACTIVE_KEY, PROGRESS_KEY, PhoneStore } from '../src/store';

function memoryKv(): Kv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
  };
}

describe('postęp na telefonie', () => {
  it('dodana ręcznie postać zostaje wybrana; zmiany zapisują się w pamięci', async () => {
    const kv = memoryKv();
    const onChange = vi.fn();
    let t = 1_700_000_000_000;
    const store = new PhoneStore(kv, { progress: emptyProgress() }, onChange, () => t++);
    expect(store.activeKey).toBeUndefined();

    store.addCharacter({ name: 'Telefon', race: 7, reborn: 5, server: 21 });
    const key = store.activeKey!;
    expect(key).toMatch(/^s21:m\d+$/);
    expect(kv.data.get(ACTIVE_KEY)).toBe(key);

    store.pickLocation(1359);
    store.setManual('hborn/1359/hakaishin', 'done');
    store.setReborn(key, 6);
    expect(onChange).toHaveBeenCalled();
    await store.saveNow();

    const saved = parseProgress(kv.data.get(PROGRESS_KEY));
    expect(saved?.characters[key]).toMatchObject({
      name: { v: 'Telefon' },
      reborn: { v: 6 },
      lastLoc: { v: 1359 },
      quests: { 'hborn/1359/hakaishin': { manual: { v: 'done' } } },
    });
  });

  it('po ponownym otwarciu wraca do zapamiętanej postaci, a bez niej do ostatnio używanej', () => {
    const kv = memoryKv();
    let t = 1;
    const a = new PhoneStore(
      kv,
      { progress: emptyProgress() },
      () => {},
      () => t++,
    );
    a.addCharacter({ name: 'Pierwsza', race: 0, reborn: 0 });
    const first = a.activeKey!;
    a.addCharacter({ name: 'Druga', race: 1, reborn: 2 });
    const second = a.activeKey!;
    expect(new PhoneStore(kv, { progress: a.progress, activeKey: first }, () => {}).activeKey).toBe(
      first,
    );
    expect(new PhoneStore(kv, { progress: a.progress }, () => {}).activeKey).toBe(second);
    // przestajemy śledzić wybraną → wybrana jest inna śledzona
    a.setTracked(second, false);
    expect(a.activeKey).toBe(first);
  });

  it('dwie postacie dodane w tej samej milisekundzie dostają różne klucze', () => {
    const store = new PhoneStore(
      memoryKv(),
      { progress: emptyProgress() },
      () => {},
      () => 5,
    );
    store.addCharacter({ name: 'A', race: 0, reborn: 0 });
    store.addCharacter({ name: 'B', race: 0, reborn: 0 });
    expect(Object.keys(store.progress.characters)).toEqual(['s0:m5', 's0:m6']);
  });

  it('usunięcie wybranej postaci przełącza na inną; usunięta nie wraca po ponownym otwarciu', () => {
    const kv = memoryKv();
    let t = 1;
    const store = new PhoneStore(
      kv,
      { progress: emptyProgress() },
      () => {},
      () => t++,
    );
    store.addCharacter({ name: 'Pierwsza', race: 0, reborn: 0 });
    const first = store.activeKey!;
    store.addCharacter({ name: 'Druga', race: 0, reborn: 0 });
    const second = store.activeKey!;
    store.removeCharacter(second);
    expect(store.activeKey).toBe(first);
    expect(
      new PhoneStore(kv, { progress: store.progress, activeKey: second }, () => {}).activeKey,
    ).toBe(first);
  });
});
