/**
 * API synchronizacji postępu. Kod synchronizacji = jedyny klucz dostępu (140 bitów losowości);
 * w bazie leży tylko jego hash. Serwer zawsze SCALA (mergeCharacter / last-write-wins), nigdy
 * nie nadpisuje – kto zna kod, może dopisać nowsze dane, ale nie wymaże cudzych zmian.
 *
 * Ochrona przed nadużyciami: limity zapytań (IP i kod), dzienny limit nowych kodów, limit
 * rozmiaru zapytania, walidacja schematem, obcinanie dat z przyszłości, limity liczby postaci
 * i zadań. Treści postępu nie logujemy.
 *
 *   POST   /v1/codes → { code }                       nowy kod
 *   GET    /v1/sync  → { progress, rev } + ETag        (If-None-Match → 304)
 *   POST   /v1/sync  { progress } → { progress, rev, base }   scala zmiany, zwraca scalone postacie
 *   DELETE /v1/sync  → 204                             usuwa dane kodu
 *   Kod w nagłówku: `Authorization: Bearer KOSMO-…` (nie w adresie – adresy trafiają do logów).
 */
import {
  checkSyncLimits,
  clampFutureStamps,
  emptyProgress,
  generateSyncCode,
  mergeCharacter,
  mergeProgress,
  normalizeSyncCode,
  parseProgress,
  SYNC_LIMITS,
  type CharacterProgress,
  type Progress,
} from '@kp/core';
import type { Env, RateLimiter } from './env';

/** Nowych kodów dziennie na cały serwer – zabezpieczenie darmowego limitu zapisów D1. */
export const MAX_NEW_CODES_PER_DAY = 2000;
/** Kody nieużywane dłużej są usuwane (cron). */
export const STALE_AFTER_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 4;

const DEFAULT_ORIGINS = [
  'https://kosmiczni.pl',
  'https://*.kosmiczni.pl',
  'http://kosmiczni.pl',
  'http://*.kosmiczni.pl',
  'https://conantvc.github.io',
  'http://localhost:*',
  'http://127.0.0.1:*',
];

function originAllowed(origin: string, env: Env): boolean {
  const patterns = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : DEFAULT_ORIGINS;
  return patterns.some((p) => {
    const re = new RegExp(
      `^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`,
      'i',
    );
    return re.test(origin);
  });
}

type Headers = Record<string, string>;

const json = (body: unknown, status: number, headers: Headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });

const error = (message: string, status: number, headers: Headers = {}) =>
  json({ error: message }, status, headers);

async function allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true; // awaria limitera nie może zablokować synchronizacji
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const codeId = (code: string) => sha256(`kp-sync:${code}`);

/** Początek bieżącej doby UTC (ms). */
const dayStart = (now: number) => now - (now % 86_400_000);

export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (origin && !originAllowed(origin, env)) return error('Niedozwolone źródło zapytania.', 403);
  const cors: Headers = origin
    ? {
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Expose-Headers': 'ETag, Retry-After',
      }
    : {};

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const tooMany = () =>
    error('Za dużo zapytań – spróbuj za minutę.', 429, { ...cors, 'Retry-After': '60' });

  try {
    if (!(await allowed(env.RL_READ, `ip:${ip}`))) return tooMany();
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;

    if (route === 'GET /')
      return json({ ok: true, name: 'Kosmiczny Przewodnik – synchronizacja' }, 200, cors);

    if (route === 'POST /v1/codes') {
      if (!(await allowed(env.RL_CREATE, `ip:${ip}`))) return tooMany();
      const today = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM sync_codes WHERE created_at >= ?',
      )
        .bind(dayStart(now))
        .first<{ n: number }>();
      if ((today?.n ?? 0) >= MAX_NEW_CODES_PER_DAY)
        return error('Dziś utworzono już bardzo dużo kodów – spróbuj jutro.', 503, cors);
      const code = generateSyncCode();
      await env.DB.prepare(
        "INSERT INTO sync_codes (id, rev, settings, created_at, updated_at) VALUES (?, 0, '{}', ?, ?)",
      )
        .bind(await codeId(code), now, now)
        .run();
      return json({ code }, 201, cors);
    }

    if (pathname !== '/v1/sync') return error('Nie ma takiej ścieżki.', 404, cors);

    const raw = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const code = normalizeSyncCode(raw);
    if (!code) return error('Brak albo nieprawidłowy kod synchronizacji.', 401, cors);
    const id = await codeId(code);

    if (request.method === 'GET') return await getSync(env, id, request, cors);

    if (request.method !== 'POST' && request.method !== 'DELETE')
      return error('Niedozwolona metoda.', 405, cors);
    if (
      !(await allowed(env.RL_WRITE, `code:${id}`)) ||
      !(await allowed(env.RL_IP_WRITE, `ip:${ip}`))
    )
      return tooMany();

    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM sync_chars WHERE code_id = ?').bind(id).run();
      const res = await env.DB.prepare('DELETE FROM sync_codes WHERE id = ?').bind(id).run();
      return res.meta.changes
        ? new Response(null, { status: 204, headers: cors })
        : error('Nie ma takiego kodu.', 404, cors);
    }
    return await postSync(env, id, request, cors, now);
  } catch {
    // bez szczegółów – nie zdradzamy wnętrza serwera i nie logujemy danych gracza
    return error('Błąd serwera – spróbuj ponownie za chwilę.', 500, cors);
  }
}

async function getSync(env: Env, id: string, request: Request, cors: Headers): Promise<Response> {
  const row = await env.DB.prepare('SELECT rev, settings FROM sync_codes WHERE id = ?')
    .bind(id)
    .first<{ rev: number; settings: string }>();
  if (!row) return error('Nie ma takiego kodu synchronizacji.', 404, cors);
  const etag = `"${row.rev}"`;
  if (request.headers.get('If-None-Match') === etag)
    return new Response(null, {
      status: 304,
      headers: { ...cors, ETag: etag, 'Cache-Control': 'no-store' },
    });
  const { results } = await env.DB.prepare(
    'SELECT char_key, doc FROM sync_chars WHERE code_id = ? ORDER BY char_key',
  )
    .bind(id)
    .all<{ char_key: string; doc: string }>();
  // Dokumenty są zapisane już zwalidowane – sklejamy JSON bez parsowania (oszczędza CPU).
  const characters = results.map((r) => `${JSON.stringify(r.char_key)}:${r.doc}`).join(',');
  const body = `{"progress":{"version":1,"settings":${row.settings},"characters":{${characters}}},"rev":${row.rev}}`;
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      ETag: etag,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(request: Request): Promise<string | undefined> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > SYNC_LIMITS.requestBytes) return undefined;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > SYNC_LIMITS.requestBytes) return undefined;
  return new TextDecoder().decode(buf);
}

async function postSync(
  env: Env,
  id: string,
  request: Request,
  cors: Headers,
  now: number,
): Promise<Response> {
  const text = await readBody(request);
  if (text === undefined) return error('Za duże zapytanie.', 413, cors);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return error('Niepoprawny JSON.', 400, cors);
  }
  const parsed = parseProgress((body as { progress?: unknown } | null)?.progress);
  if (!parsed) return error('Niepoprawne dane postępu.', 400, cors);
  const incoming = clampFutureStamps(parsed, now);
  const limit = checkSyncLimits(incoming);
  if (limit) return error(limit, 400, cors);

  const exists = await env.DB.prepare('SELECT 1 AS ok FROM sync_codes WHERE id = ?')
    .bind(id)
    .first();
  if (!exists) return error('Nie ma takiego kodu synchronizacji.', 404, cors);

  // 1. Postacie – każda osobno, z kontrolą wersji (równoległe zapisy nie gubią zmian).
  const merged: Record<string, CharacterProgress> = {};
  let written = false;
  for (const [key, char] of Object.entries(incoming.characters)) {
    const result = await mergeStoredCharacter(env, id, key, char, now);
    if (typeof result === 'string')
      return error(result, result.startsWith('Za dużo') ? 400 : 503, cors);
    merged[key] = result.doc;
    written ||= result.written;
  }

  // 2. Ustawienia + numer wersji kodu (ETag).
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await env.DB.prepare('SELECT rev, settings FROM sync_codes WHERE id = ?')
      .bind(id)
      .first<{ rev: number; settings: string }>();
    if (!row) return error('Nie ma takiego kodu synchronizacji.', 404, cors);
    const stored = {
      ...emptyProgress(),
      settings: JSON.parse(row.settings) as Progress['settings'],
    };
    const settings = mergeProgress(stored, {
      ...emptyProgress(),
      settings: incoming.settings,
    }).settings;
    if (Object.keys(settings).length > SYNC_LIMITS.settings)
      return error('Za dużo ustawień.', 400, cors);
    const settingsJson = JSON.stringify(settings);
    const changed = written || settingsJson !== row.settings;
    let rev = row.rev;
    if (changed) {
      const res = await env.DB.prepare(
        'UPDATE sync_codes SET settings = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?',
      )
        .bind(settingsJson, now, id, row.rev)
        .run();
      if (!res.meta.changes) continue; // ktoś zapisał w międzyczasie – jeszcze raz
      rev = row.rev + 1;
    }
    return json(
      { progress: { ...emptyProgress(), settings, characters: merged }, rev, base: row.rev },
      200,
      cors,
    );
  }
  return error('Serwer jest zajęty – spróbuj ponownie.', 503, cors);
}

async function mergeStoredCharacter(
  env: Env,
  id: string,
  key: string,
  incoming: CharacterProgress,
  now: number,
): Promise<{ doc: CharacterProgress; written: boolean } | string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await env.DB.prepare(
      'SELECT doc, rev FROM sync_chars WHERE code_id = ? AND char_key = ?',
    )
      .bind(id, key)
      .first<{ doc: string; rev: number }>();
    if (!row) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_chars WHERE code_id = ?')
        .bind(id)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= SYNC_LIMITS.characters)
        return `Za dużo postaci (limit ${SYNC_LIMITS.characters}).`;
      const res = await env.DB.prepare(
        'INSERT INTO sync_chars (code_id, char_key, doc, rev, updated_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT (code_id, char_key) DO NOTHING',
      )
        .bind(id, key, JSON.stringify(incoming), now)
        .run();
      if (res.meta.changes) return { doc: incoming, written: true };
      continue;
    }
    const doc = mergeCharacter(JSON.parse(row.doc) as CharacterProgress, incoming);
    if (Object.keys(doc.quests).length > SYNC_LIMITS.questsPerCharacter) return 'Za dużo zadań.';
    const text = JSON.stringify(doc);
    if (text === row.doc) return { doc, written: false }; // nic nowego – bez zapisu
    const res = await env.DB.prepare(
      'UPDATE sync_chars SET doc = ?, rev = rev + 1, updated_at = ? WHERE code_id = ? AND char_key = ? AND rev = ?',
    )
      .bind(text, now, id, key, row.rev)
      .run();
    if (res.meta.changes) return { doc, written: true };
  }
  return 'Serwer jest zajęty – spróbuj ponownie.';
}

/** Cron: usuwa kody nieużywane ponad STALE_AFTER_MS. */
export async function cleanup(env: Env, now = Date.now()): Promise<void> {
  const before = now - STALE_AFTER_MS;
  await env.DB.prepare(
    'DELETE FROM sync_chars WHERE code_id IN (SELECT id FROM sync_codes WHERE updated_at < ?)',
  )
    .bind(before)
    .run();
  await env.DB.prepare('DELETE FROM sync_codes WHERE updated_at < ?').bind(before).run();
}
