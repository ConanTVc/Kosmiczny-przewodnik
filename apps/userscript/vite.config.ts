import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string;
};
/**
 * Wersja skryptu = wersja pakietu + czas budowania (UTC, RRRRMMDDGGMM). Tampermonkey aktualizuje
 * skrypt tylko na wyższą wersję – dzięki temu każde wdrożenie na Pages trafia do graczy samo.
 */
const BUILD_STAMP = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const VERSION = `${pkg.version}.${BUILD_STAMP}`;
/** Adres GitHub Pages projektu (Prompt 7) – stąd aktualizacje skryptu i treści. */
const PAGES = 'https://conantvc.github.io/Kosmiczny-przewodnik';

export default defineConfig({
  define: {
    __KP_BUILD_TIME__: JSON.stringify(Date.now()),
    __KP_PAGES__: JSON.stringify(PAGES),
    __KP_SYNC_URL__: JSON.stringify(process.env['KP_SYNC_URL'] ?? ''),
  },
  plugins: [
    preact(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'Kosmiczny Przewodnik',
        namespace: 'https://github.com/ConanTVc/Kosmiczny-przewodnik',
        description:
          'Solucje, poradniki i tracker zadań do gry Kosmiczni. Tylko czyta to, co gra pokazuje – nic nie klika.',
        version: VERSION,
        match: ['*://kosmiczni.pl/*', '*://*.kosmiczni.pl/*'],
        grant: 'none',
        'run-at': 'document-idle',
        noframes: true,
        updateURL: `${PAGES}/kosmiczny-przewodnik.meta.js`,
        downloadURL: `${PAGES}/kosmiczny-przewodnik.user.js`,
      },
      build: { fileName: 'kosmiczny-przewodnik.user.js', metaFileName: true },
    }),
  ],
});
