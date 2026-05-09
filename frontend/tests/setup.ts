/**
 * tests/setup.ts
 *
 * Vitest setup file, loaded once before each test file (per the
 * `setupFiles` entry in `vite.config.ts`'s `test:` block).
 *
 * Most tests run under jsdom and don't need anything here. The
 * harness under `tests/e2e/` opts into `// @vitest-environment node`
 * to escape jsdom's broken WebSocket wrapper (the IDL `onopen` handler
 * never fires under jsdom + undici). Production code in the import
 * chain references `window.setTimeout` / `window.setInterval` and the
 * api-client touches `localStorage`; under node these are absent. The
 * conditionals below install minimal shims only when the host
 * environment lacks the API — under jsdom both checks are no-ops.
 *
 * License: Public Domain (The Unlicense)
 */

if (typeof globalThis.window === 'undefined') {
  // Production code uses `window.setTimeout` / `window.setInterval`
  // which work identically to bare `setTimeout` in node. Aliasing
  // `window` to `globalThis` makes those calls resolve against
  // node's globals without patching production code for a test
  // environment concern.
  (globalThis as { window?: unknown }).window = globalThis;
}

if (typeof globalThis.localStorage === 'undefined') {
  const _store: Record<string, string> = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => _store[k] ?? null,
    setItem: (k: string, v: string) => { _store[k] = v; },
    removeItem: (k: string) => { delete _store[k]; },
    clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
    get length() { return Object.keys(_store).length; },
    key: (i: number) => Object.keys(_store)[i] ?? null,
  };
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  // Production code uses rAF to coalesce ledger version-ref bumps
  // and to drive activity-decay / scoped-scroll animations. Under
  // node-env there's no display refresh to align to; setTimeout(0)
  // preserves the "defer to next tick" semantic that the production
  // code relies on, which is what the analysis-ledger flush actually
  // needs (the visual cadence is a no-op when there's no display).
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    cb: (ts: number) => void,
  ): number => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (
    id: number,
  ): void => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

export {};
