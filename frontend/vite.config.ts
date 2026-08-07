/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Tauri sets this env var when it invokes `beforeDevCommand` /
// `beforeBuildCommand` (see `src-tauri/tauri.conf.json`). Used below to
// keep the dev server's port matching `tauri.conf.json`'s `build.devUrl`
// (`http://localhost:5173`) and to stop Vite from watching the Rust
// build's own output directory.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [vue()],
  // clearScreen: false — Tauri's own CLI output interleaves with Vite's
  // dev-server logs in the same terminal; Vite clearing the screen would
  // hide Tauri/Rust compiler output that arrived just before it.
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    // strictPort: fail rather than silently move to another port when
    // running under Tauri — `tauri.conf.json`'s `build.devUrl` is a
    // fixed URL the desktop shell navigates to, not a pattern it
    // searches for.
    strictPort: isTauri,
    watch: {
      // Never trigger a Vite HMR reload for changes under the Rust
      // project (its own `target/` build output churns constantly).
      ignored: ['**/src-tauri/**'],
    },
  },
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
