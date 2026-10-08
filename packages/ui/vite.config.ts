import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

/** Strona podglądowa panelu z prawdziwą treścią (`pnpm --filter @kp/ui dev`). */
export default defineConfig({
  root: resolve(import.meta.dirname, 'dev'),
  base: './',
  plugins: [preact()],
  server: { fs: { allow: [resolve(import.meta.dirname, '../..')] } },
  build: { outDir: resolve(import.meta.dirname, 'dist-preview'), emptyOutDir: true },
});
