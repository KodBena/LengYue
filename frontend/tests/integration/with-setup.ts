/**
 * tests/integration/with-setup.ts
 *
 * Run a composable inside a real (headless) component instance, so its
 * lifecycle hooks (`onMounted` / `onUnmounted`) and instance-scoped
 * reactive effects have a context — then dispose the instance via
 * `onTestFinished` so `onUnmounted` fires (and the composable's scoped
 * `watch`/`computed` effects are reclaimed) on pass AND fail.
 *
 * Why this exists: a bare `const x = useComposable()` in a test runs the
 * composable with **no active component instance**, so
 *   (a) Vue warns "onUnmounted is called when there is no active component
 *       instance" — noise that buries real warnings in CI stderr; and
 *   (b) the composable's `onUnmounted` cleanup never runs and its `watch`es
 *       are created in no scope → they LEAK across tests, firing on the
 *       shared store in later cases. That non-hermeticity is exactly the
 *       failure-safe-teardown hazard this dir's CLAUDE.md names: register
 *       teardown at creation so it runs even when a test fails.
 *
 * `effectScope` alone is insufficient — `onUnmounted` attaches to a
 * component instance (`getCurrentInstance()`), which only a mounted
 * component provides. So this mounts a render-less host whose `setup` runs
 * the composable, and unmounts it on test finish.
 *
 * Usage:
 *   const projection = withSetup(() => useAnalysisProjection(boardId));
 *
 * License: Public Domain (The Unlicense)
 */
import { createApp, type App } from 'vue';
import { onTestFinished } from 'vitest';

export function withSetup<T>(composable: () => T): T {
  let result!: T;
  const app: App = createApp({
    setup() {
      result = composable();
      // Render nothing — the test reads the composable's return, not DOM.
      return () => null;
    },
  });
  // jsdom-backed mount; setup() runs synchronously here, populating `result`.
  app.mount(document.createElement('div'));
  // Failure-safe: unmount on test finish (pass OR fail) fires onUnmounted
  // and reclaims the instance's scoped effects, keeping the suite hermetic.
  onTestFinished(() => app.unmount());
  return result;
}
