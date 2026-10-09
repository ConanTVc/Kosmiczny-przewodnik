/**
 * Klient synchronizacji postępu (userscript i telefon). Działa w tle: pobiera zmiany z serwera
 * (z ETag – bez zmian serwer odpowiada 304), scala je z lokalnym postępem i wysyła tylko to,
 * czego serwer jeszcze nie ma. Nic nie nadpisuje – zawsze scala (mergeProgress).
 */
import { mergeProgress } from './merge';
import { emptyProgress } from './progress';
import { parseProgress } from './progress-schema';
import { normalizeSyncCode, progressDelta, splitDelta } from './sync';
import type { Progress } from './types';

export type SyncState = 'off' | 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  code?: string;
  state: SyncState;
  message?: string;
  /** Ostatnia udana synchronizacja (ms). */
  lastSync?: number;
}

export interface SyncClientOptions {
  /** Adres serwera synchronizacji (Cloudflare Worker). */
  baseUrl: string;
  /** Bieżący postęp na tym urządzeniu. */
  getLocal(): Progress;
  /** Dane z serwera – aplikacja scala je z lokalnymi (mergeProgress), zapisuje i odświeża widok. */
  applyRemote(remote: Progress): void;
  loadCode(): Promise<string | undefined>;
  saveCode(code: string | undefined): Promise<void>;
  onStatus(status: SyncStatus): void;
  fetch?: typeof fetch;
  now?: () => number;
  /** Ile czekać po zmianie, zanim wyślemy (zbiera serię kliknięć w jedno zapytanie). */
  debounceMs?: number;
  /** Co ile sprawdzać, czy inne urządzenie czegoś nie zmieniło. */
  pollMs?: number;
}

type FailKind = 'offline' | 'limited' | 'gone' | 'error';

class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: FailKind,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;

export class SyncClient {
  status: SyncStatus = { state: 'off' };
  private code: string | undefined;
  private etag: string | undefined;
  private rev: number | undefined;
  /** Stan serwera, jaki ostatnio znamy – z nim porównujemy lokalny postęp. */
  private remote: Progress | undefined;
  private running: Promise<void> | undefined;
  private again = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly o: SyncClientOptions) {}

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    try {
      this.o.onStatus(status);
    } catch {
      // widok nie może zepsuć synchronizacji
    }
  }

  private resetRemote(): void {
    this.etag = undefined;
    this.rev = undefined;
    this.remote = undefined;
    this.failures = 0;
  }

  private clearTimers(): void {
    clearTimeout(this.timer);
    clearTimeout(this.debounceTimer);
  }

  /** Wczytuje zapisany kod i od razu synchronizuje. */
  async start(): Promise<void> {
    const saved = await this.o.loadCode().catch(() => undefined);
    const code = saved ? normalizeSyncCode(saved) : undefined;
    if (!code) {
      this.setStatus({ state: 'off' });
      return;
    }
    this.code = code;
    await this.syncNow();
  }

  stop(): void {
    this.clearTimers();
    this.code = undefined;
  }

  /** Nowy kod – postęp z tego urządzenia trafia na serwer. */
  async create(): Promise<boolean> {
    this.setStatus({ state: 'syncing', message: 'Tworzę kod…' });
    try {
      const res = await this.request('POST', '/v1/codes', {});
      const code = normalizeSyncCode(String(((await res.json()) as { code?: unknown }).code ?? ''));
      if (!code) throw new SyncError('Serwer zwrócił niepoprawny kod', 'error');
      this.code = code;
      this.resetRemote();
      await this.o.saveCode(code);
      await this.syncNow();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /** Łączy z istniejącym kodem. Postęp z obu stron jest scalany – nic nie ginie. */
  async connect(input: string): Promise<boolean> {
    const code = normalizeSyncCode(input);
    if (!code) {
      this.setStatus({
        ...this.status,
        state: 'error',
        message: 'To nie wygląda na kod synchronizacji (KOSMO-…).',
      });
      return false;
    }
    const previous = this.code;
    this.clearTimers();
    this.code = code;
    this.resetRemote();
    this.setStatus({ code, state: 'syncing', message: 'Łączę…' });
    try {
      await this.pull(); // sprawdza, czy kod istnieje, zanim go zapiszemy
    } catch (error) {
      if (error instanceof SyncError && error.kind !== 'offline' && error.kind !== 'limited') {
        this.code = previous;
        this.resetRemote();
        this.setStatus({
          ...(previous && { code: previous }),
          state: 'error',
          message:
            error.kind === 'gone'
              ? 'Nie ma takiego kodu – sprawdź, czy dobrze przepisany.'
              : error.message,
        });
        if (previous) this.schedule(RETRY_BASE_MS);
        return false;
      }
      // brak sieci – kod zapamiętujemy, połączymy się, gdy wróci internet
    }
    await this.o.saveCode(code);
    await this.syncNow();
    return true;
  }

  /** To urządzenie przestaje się synchronizować (dane na serwerze zostają). */
  async disconnect(): Promise<void> {
    this.clearTimers();
    this.code = undefined;
    this.resetRemote();
    await this.o.saveCode(undefined).catch(() => {});
    this.setStatus({ state: 'off' });
  }

  /** Usuwa dane z serwera i odłącza to urządzenie. Inne urządzenia z tym kodem też stracą sync. */
  async forgetRemote(): Promise<boolean> {
    if (!this.code) return false;
    try {
      await this.request('DELETE', '/v1/sync');
    } catch (error) {
      if (!(error instanceof SyncError && error.kind === 'gone')) {
        this.fail(error);
        return false;
      }
    }
    await this.disconnect();
    return true;
  }

  /** Lokalny postęp się zmienił – wyślemy po chwili (seria zmian = jedno zapytanie). */
  notifyChange(): void {
    if (!this.code) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.syncNow(), this.o.debounceMs ?? 2000);
  }

  /** Synchronizuje teraz (np. po powrocie do aplikacji albo internetu). */
  syncNow(): Promise<void> {
    if (!this.code) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.cycle();
      } while (this.again && this.code);
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async cycle(): Promise<void> {
    const code = this.code;
    if (!code) return;
    clearTimeout(this.timer);
    this.setStatus({ code, state: 'syncing', lastSync: this.status.lastSync });
    try {
      await this.pull();
      const delta = progressDelta(this.o.getLocal(), this.remote ?? emptyProgress());
      if (delta) for (const part of splitDelta(delta)) await this.push(part);
      this.failures = 0;
      this.setStatus({ code, state: 'synced', lastSync: this.now() });
      this.schedule(this.o.pollMs ?? 120_000);
    } catch (error) {
      this.fail(error);
    }
  }

  private async pull(): Promise<void> {
    const res = await this.request(
      'GET',
      '/v1/sync',
      undefined,
      this.etag ? { 'If-None-Match': this.etag } : {},
    );
    if (res.status === 304) return;
    const body = (await res.json()) as { progress?: unknown; rev?: unknown };
    const remote = parseProgress(body.progress);
    if (!remote) throw new SyncError('Serwer zwrócił niepoprawne dane', 'error');
    this.remote = remote;
    this.rev = typeof body.rev === 'number' ? body.rev : undefined;
    this.etag = res.headers.get('ETag') ?? undefined;
    this.o.applyRemote(remote);
  }

  private async push(part: Progress): Promise<void> {
    const res = await this.request('POST', '/v1/sync', { progress: part });
    const body = (await res.json()) as { progress?: unknown; rev?: unknown; base?: unknown };
    const merged = parseProgress(body.progress);
    if (!merged) throw new SyncError('Serwer zwrócił niepoprawne dane', 'error');
    this.remote = mergeProgress(this.remote ?? emptyProgress(), merged);
    // ETag zostaje aktualny tylko, gdy nikt inny nie zmienił danych między naszymi zapytaniami.
    if (this.rev !== undefined && body.base === this.rev && typeof body.rev === 'number') {
      this.rev = body.rev;
      this.etag = `"${body.rev}"`;
    } else {
      this.rev = undefined;
      this.etag = undefined;
    }
    this.o.applyRemote(merged);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const doFetch = this.o.fetch ?? globalThis.fetch;
    let res: Response;
    try {
      res = await doFetch.call(globalThis, `${this.o.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          ...(this.code && path !== '/v1/codes' && { Authorization: `Bearer ${this.code}` }),
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SyncError('Brak internetu – zsynchronizuję później.', 'offline');
    }
    if (res.ok || res.status === 304) return res;
    let message: string | undefined;
    try {
      message = ((await res.json()) as { error?: string }).error;
    } catch {
      // bez treści
    }
    if (res.status === 401 || res.status === 404)
      throw new SyncError(message ?? 'Nie ma takiego kodu synchronizacji.', 'gone');
    if (res.status === 429) {
      const seconds = Number(res.headers.get('Retry-After'));
      throw new SyncError(
        'Za dużo zapytań – spróbuję za chwilę.',
        'limited',
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000,
      );
    }
    if (res.status >= 500)
      throw new SyncError('Serwer synchronizacji ma problem – spróbuję później.', 'offline');
    throw new SyncError(message ?? `Błąd synchronizacji (${res.status}).`, 'error');
  }

  private fail(error: unknown): void {
    const e =
      error instanceof SyncError
        ? error
        : new SyncError('Nieoczekiwany błąd synchronizacji.', 'error');
    const base = { ...(this.code && { code: this.code }), lastSync: this.status.lastSync };
    if (e.kind === 'gone') {
      // kod usunięty z serwera – nie ponawiamy, gracz łączy się od nowa
      this.clearTimers();
      this.setStatus({
        ...base,
        state: 'error',
        message: 'Kodu nie ma już na serwerze – utwórz nowy albo połącz się ponownie.',
      });
      return;
    }
    this.failures += 1;
    const backoff = Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_MAX_MS);
    const delay = e.kind === 'error' ? RETRY_MAX_MS : (e.retryAfterMs ?? backoff);
    this.setStatus({
      ...base,
      state: e.kind === 'error' ? 'error' : 'offline',
      message: e.message,
    });
    this.schedule(delay);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    if (this.code) this.timer = setTimeout(() => void this.syncNow(), ms);
  }
}
