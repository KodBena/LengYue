/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {host:'0.0.0.0'},
  resolve: {
    alias: {
      // Alias Node's internal buffer to the npm package
      buffer: 'buffer/',
    }
  },
  define: {
    // Provide a global window reference for Sabaki
    global: 'globalThis',
  },
  // Vitest configuration. The `<reference types="vitest/config" />`
  // directive at the top of this file widens the typings on
  // `defineConfig` so the `test` field type-checks. Tests live under
  // `tests/`; the tree mirrors `backend/tests/` (unit / integration /
  // fakes) so contributors moving between subprojects find the same
  // shape.
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    css: false,
  }
});
