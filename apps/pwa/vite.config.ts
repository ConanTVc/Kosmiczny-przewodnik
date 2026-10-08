import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Aplikacja leży na GitHub Pages pod `/Kosmiczny-przewodnik/app/` (workflow pages.yml). */
const PAGES_BASE = process.env['KP_PWA_BASE'] ?? '/Kosmiczny-przewodnik/app/';
const BG = '#11131a';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  // Treść solucji jest celowo wbudowana (offline od pierwszego uruchomienia).
  build: { chunkSizeWarningLimit: 2500 },
  plugins: [
    preact(),
    VitePWA({
      // Nowa wersja (np. nowe solucje) czeka na zgodę gracza – nie przeładowujemy mu ekranu.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Kosmiczny Przewodnik',
        short_name: 'Przewodnik',
        description: 'Solucje, poradniki i postęp zadań do gry Kosmiczni – także bez internetu.',
        lang: 'pl',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: BG,
        theme_color: BG,
        categories: ['games', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Treść solucji jest wbudowana w aplikację – plik JS jest duży.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
