# BaseChart init-retry timer leak — fix

**Spec:** `.claude/dispatch-reports/design-hydration-telemetry.md` §hypothesis-survey,
H1 (HIGH confidence). Read in full, alongside `frontend/CLAUDE.md` and
`frontend/tests/CLAUDE.md`, before making this change.

## Bug

`frontend/src/components/charts/BaseChart.vue`'s `initChart` scheduled its
zero-height retry with a bare `setTimeout(initChart, CHART_INIT_RETRY_MS)`
(old line 523) and never captured the returned id. `onUnmounted` (old lines
600-614) released `markerTimer`, `dataThrottle`, and the `ResizeObserver`,
but had no handle to clear this one. A chart unmounted while a retry was
pending (`TabWidget`'s lazy unmount switching Analysis tabs, or `App.vue`'s
`:key`-driven board remount) left a closure that reschedules itself forever:
Vue nulls the template ref on unmount, so the zero-height branch is taken
again on every fire, and the retry never satisfies `chartRef.value` and
never calls `echarts.init` for that mount — the reported "won't hydrate"
symptom.

The sibling `HeatmapChart.vue` already has the correct shape: `initTimeout`
captured at `HeatmapChart.vue:205`, cleared in `onUnmounted` at
`HeatmapChart.vue:264`.

**Scope check (BaseChart, whole file, same class of bug):** read the file
end to end. `markerTimer` and `dataThrottle` are both already
captured/cleared correctly (`onUnmounted`, existing code). The only other
external-resource registration is the `ResizeObserver`, which is already
released (`resizeObserver.unobserve` + `.disconnect()`). The init-retry
timer was the sole uncaptured resource in the file.

## Fix

`frontend/src/components/charts/BaseChart.vue`:

- Added `let initTimeout: number | null = null;` next to `resizeObserver`'s
  declaration, with a comment naming the resource, the failure mode, and
  the HeatmapChart precedent (per `frontend/CLAUDE.md`'s
  resource-ownership-at-mutation-sites checklist, step 4).
- `initChart`'s retry now does `initTimeout = window.setTimeout(initChart, CHART_INIT_RETRY_MS)`.
- `onUnmounted` now does `if (initTimeout) clearTimeout(initTimeout);`,
  ordered alongside the existing `markerTimer`/`dataThrottle` releases.

Same shape as `HeatmapChart.vue`'s existing fix, applied to `BaseChart.vue`.

## Test (ADR-0021)

The new test file is `frontend/tests/integration/BaseChart-init-retry-leak.test.ts`.
The claim under test is negative ("no timer fires after unmount"), converted
to a positive tripwire per Rule 2: mounts `BaseChart` under jsdom's default
`clientHeight === 0` (which drives `initChart` into the zero-height retry
branch with no stubbing needed), confirms one timer is pending
(`vi.getTimerCount() === 1`), unmounts, then advances fake time past
`CHART_INIT_RETRY_MS` and asserts a spy on `setTimeout` was **not** called
again and no timer remains pending. The spy is the tripwire: a leaked retry
takes the zero-height branch again after unmount (`chartRef.value` is
nulled by Vue on unmount) and calls `setTimeout` to reschedule itself —
that rescheduling call is exactly what the spy would observe.

Mounting conventions (mocked `echarts.init`, `installRenderEnvStubs`/
`removeRenderEnvStubs`, `flushPromises` after mount) follow
`tests/integration/BaseChart-collapsed-gate.test.ts`, the existing BaseChart
integration-test prior art.

**Red/green verified directly** (ADR-0021 discipline — a guard that cannot
fail is worse than none): with the fix stashed out (`git stash`), the test
fails —

```
AssertionError: expected "setTimeout" to not be called at all, but actually been called 1 times
  1st setTimeout call: [ [Function initChart], 100 ]
```

— confirming the tripwire fires on the pre-fix leak. `git stash pop`
restored the fix; the suite is green with it applied (see Gates below).

## Gates (WITNESSED)

Run from `frontend/` in this worktree, 2026-08-06.

- **Build** (`npm run build`, `vue-tsc -b && vite build`): exit 0.
  ```
  ✓ 1080 modules transformed.
  ✓ built in 2.87s
  ```
- **Lint** (`npx eslint .`, the CI form): exit 0, no output (clean).
- **Tests** (`npm run test:run`): exit 0.
  ```
  Test Files  82 passed | 3 skipped (85)
       Tests  1102 passed | 4 skipped (1106)
  ```

## Scope note

Per ADR-0004/umbrella scope discipline, this dispatch stayed inside
`BaseChart.vue` and its own test file — H2 (ancestor-visibility/RO
composition gap), H3 (background-tab timer throttling), and the flight-
recorder telemetry proposal in the cited report are out of scope for this
fix and untouched.

License: Public Domain (The Unlicense)
