/**
 * Pamięć skryptu. Postęp i treść w IndexedDB strony (własna baza – nie zajmujemy miejsca grze
 * w localStorage), drobne ustawienia panelu w localStorage z prefiksem `kp:`. Każdy błąd
 * pamięci jest połykany – bez niej skrypt działa, tylko nie pamięta.
 */
const DB_NAME = 'kosmiczny-przewodnik';
const STORE = 'kv';
export const LOCAL_PREFIX = 'kp:';

export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function openIndexedDb(): Promise<Kv> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    get: async <T>(key: string) => (await request(store('readonly').get(key))) as T | undefined,
    set: async (key, value) => {
      await request(store('readwrite').put(value, key));
    },
  };
}

/** Zapas, gdy IndexedDB jest niedostępne (np. tryb prywatny). */
export function localKv(storage: Storage | null = globalThis.localStorage ?? null): Kv {
  return {
    get: async <T>(key: string) => {
      try {
        const raw = storage?.getItem(LOCAL_PREFIX + key);
        return raw === null || raw === undefined ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    },
    set: async (key, value) => {
      try {
        storage?.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
      } catch {
        // brak miejsca albo zablokowane – trudno
      }
    },
  };
}

export async function openKv(): Promise<Kv> {
  try {
    if (typeof indexedDB === 'undefined') return localKv();
    return await openIndexedDb();
  } catch {
    return localKv();
  }
}

/** Mały, synchroniczny zapis ustawień panelu (pozycja, stan) w localStorage. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_PREFIX + key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // trudno
  }
}
