/**
 * tests/setup.ts
 *
 * Vitest setup file, loaded once before each test file (per the
 * `setupFiles` entry in `vite.config.ts`'s `test:` block).
 *
 * Currently a no-op placeholder. Reserved for future cross-suite
 * concerns:
 *
 *   - jsdom polyfills the test environment doesn't ship with
 *     (e.g. ResizeObserver, matchMedia stubs if SFC tests start
 *     mounting components that read them).
 *   - Global beforeEach/afterEach hooks if a per-suite cleanup
 *     pattern emerges that the individual test files shouldn't
 *     each have to repeat.
 *
 * Per-test setup that's specific to a single suite belongs in the
 * suite's own `beforeEach`, not here. This file is the place for
 * concerns that genuinely span every test file.
 *
 * License: Public Domain (The Unlicense)
 */

export {};
