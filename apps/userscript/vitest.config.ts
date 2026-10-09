import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __KP_BUILD_TIME__: '0',
    __KP_PAGES__: JSON.stringify('https://example.invalid'),
    __KP_SYNC_URL__: JSON.stringify(''),
  },
  test: {
    name: '@kp/userscript',
    environment: 'jsdom',
    css: { include: [/.+/] },
  },
});
