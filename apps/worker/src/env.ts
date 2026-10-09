/**
 * Minimalne typy środowiska Workera – tylko to, czego używamy (bez @cloudflare/workers-types).
 * Testy podstawiają tu SQLite z Node i proste liczniki.
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
}

/** Binding „Rate Limiting” Cloudflare (`ratelimits` w wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Like;
  /** Nowe kody – na IP. */
  RL_CREATE?: RateLimiter;
  /** Zapisy – na kod. */
  RL_WRITE?: RateLimiter;
  /** Zapisy – na IP (wiele kodów z jednego adresu). */
  RL_IP_WRITE?: RateLimiter;
  /** Wszystkie zapytania – na IP. */
  RL_READ?: RateLimiter;
  /** Dozwolone Origin, po przecinku; `*` w nazwie hosta albo porcie. Brak = domyślne. */
  ALLOWED_ORIGINS?: string;
}
