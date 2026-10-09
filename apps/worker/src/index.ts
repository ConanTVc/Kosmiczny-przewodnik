/** Wejście Cloudflare Workera: zapytania HTTP i codzienne sprzątanie. */
import { cleanup, handle } from './app';
import type { Env } from './env';

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
  scheduled: async (_event: unknown, env: Env): Promise<void> => {
    await cleanup(env);
  },
};
