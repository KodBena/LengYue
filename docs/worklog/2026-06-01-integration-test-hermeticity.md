# Integration-test hermeticity — `withSetup` + the toGtp warn

- **Status:** Done 2026-06-01 (frontend). Follow-on to the CI gate (#326) —
  the gate is only as honest as the suite's hermeticity, and the now-visible
  CI stderr surfaced two warnings worth resolving.
- **Genre:** Test hardening. No production code touched.
- **Date:** 2026-06-01.

## What the warnings were

CI surfaced two stderr classes (both pre-existing, neither a #326
regression — CI just shows the stderr that local `test:run` scrolls past):

1. **`[Vue warn]: onUnmounted is called when there is no active component
   instance`** in `useAnalysisProjection.test.ts`. The composable's chain
   transits `useEnrichedData`, which does `onUnmounted(stopFlush)` + a
   `watch`. The test instantiated `useAnalysisProjection(boardId)` **bare**
   — no component instance — so `onUnmounted` was orphaned (Vue warns) and,
   the real bug, `stopFlush` never ran and the `watch` was created in no
   scope → **seven leaked flush-watchers per file**, firing on the shared
   store in later tests. Not failing today, but the latent non-hermeticity
   the failure-safe-teardown discipline exists to prevent.
2. **`[util.ts:toGtp] X-coordinate … out of GTP range`** — expected by
   design (the test is named "returns 'pass' with a console warning when x
   is out of range"), but it asserted only the return, not the warning, and
   let the warn print to stderr.

## Fix

- **`tests/integration/with-setup.ts`** — `withSetup(composable)` mounts a
  render-less host whose `setup` runs the composable (so lifecycle hooks +
  scoped effects have a context) and unmounts it via `onTestFinished` (so
  `onUnmounted` fires and the watchers are reclaimed on pass *and* fail).
  `effectScope` alone wouldn't do — `onUnmounted` needs a component
  instance. `useAnalysisProjection.test.ts`'s seven bare calls now wrap in
  `withSetup`. After this, the **whole suite shows 0 Vue lifecycle
  warnings** — `useAnalysisProjection` was the lone warning source (the only
  bare-call test whose chain registers `onUnmounted`); `withSetup` is the
  documented pattern for the rest as they grow lifecycle/watch coverage.
- **toGtp test** — `vi.spyOn(console, 'warn')` to *assert* the warning fires
  (verifying the test's own claim) and suppress the stderr; restored
  failure-safe via `onTestFinished` (no `restoreMocks` config, so a thrown
  assertion mustn't leak the silenced `console.warn` into later tests).
- **`tests/CLAUDE.md`** — documents `withSetup` (the bare-composable
  gotcha + when to use it) next to the failure-safe-teardown gotcha.

## Verification

`vue-tsc -b` clean; suite **769 passed / 3 skipped**; CI stderr census: **0**
lifecycle warnings, **0** toGtp range lines, **0** `[Vue warn]`. (The test
tree is in eslint's ignore set, so `eslint .` doesn't lint these files —
unchanged.)

## License

Public Domain (The Unlicense).
