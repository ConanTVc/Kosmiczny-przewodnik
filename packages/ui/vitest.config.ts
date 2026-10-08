import { defineConfig } from 'vitest/config';

/** Testy panelu – osobno od vite.config.ts (tamten ma root w dev/). CSS potrzebny do `?inline`. */
export default defineConfig({
  test: {
    name: '@kp/ui',
    css: { include: [/.+/] },
  },
});
