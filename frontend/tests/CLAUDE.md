# CLAUDE.md — Frontend tests

You are working in `frontend/tests/`, the test tree for the Vue 3
+ TypeScript SPA. This note specializes the umbrella `CLAUDE.md`
and `frontend/CLAUDE.md` for test-authoring work.

The frontend's architectural posture (Components are renderers,
Composables hold logic, Services are the effectful boundary, a
single ACL at `src/services/backend-service.ts`) determines how
tests compose. The test tree mirrors the layering, not the file
layout.

## Reading documentation (ADR-0002 corollary)

The umbrella `CLAUDE.md` names ADR-0002 (fail loudly) as applying with
special force to documentation consumption: **the single gravest sin
against ADR-0002 is to fail to read a piece of documentation from
beginning to end, and then make any statement that references any part
within it, no matter how small.** Failing loudly means the user is
never in the dark about whether the collaborator has actually seen the
document. Documentation must never be consumed partially.

The local form for frontend test-authoring: this file, the umbrella
`CLAUDE.md`, `frontend/CLAUDE.md`, the existing fakes under
`tests/fakes/` when extending or mirroring them, the composable or
service under test in full, and any cited fixture or helper file are
read end to end before authoring — not skimmed for keywords, not
relied on through search-result fragments. If reading is deferred for
a budget reason, say so audibly — name what was read and what was
skipped — and ask the user how to proceed. Bluffing a citation is the
failure mode the umbrella section is shaped to prevent.

## Tier structure

Three tiers, each with a different boundary:

1. **Unit (`tests/unit/`).** Pure TypeScript, no DOM, no Vue
   reactivity, no fakes. Tests in this tier exercise one module
   against pre-loaded inputs and assert on its outputs.

   Examples:
   - `logic.test.ts` — `applyGoMove` over hand-built `BoardState`
     fixtures; placement, occupied-point rejection, suicide,
     capture, ko-point setting.
   - (Future) `tests/unit/engine/sgf-loader.test.ts`,
     `tests/unit/engine/navigator.test.ts`, kernel arithmetic
     in `tests/unit/engine/analysis/`.

2. **Integration (`tests/integration/`).** Drives a composable
   end-to-end against the real store, the real navigator, the
   real rules engine, the real i18n catalogs — and against
   spy-backed fakes (in `tests/fakes/`) for the proxy / backend
   / persistence service boundaries. Verifies orchestration logic
   without verifying network or proxy.

   Examples:
   - `useReviewSession.test.ts` — `endSession` reset, empty-queue
     `startSession` short-circuit, `processUserMove` timeout path
     with `vi.fn()`-mocked `waitForAnalysis`.
   - (Future) `useReviewSession` happy-path, `useAnalysisProjection`
     projection invariants, `useChartNavigation` selection state.

3. **Component / template tests.** Out of scope at present. The
   architectural shape (components are thin renderers; logic
   lives in composables) means component-level tests catch a
   small slice of bugs at high maintenance cost. Defer until
   the composable layer has broad coverage and the gap shows
   up empirically.

   **Narrow exception — render-count regression guards
   (`tests/integration/render-count/`).** These mount a component
   but assert nothing about its render *output*; they assert its
   render *frequency* — that the render function does not re-run on
   a high-frequency reactive event it should not subscribe to.
   That is the ADR-0010 render-locality invariant, statically
   undecidable and otherwise visible only under a profiler
   (ADR-0009). They are the preventive analog of ADR-0009's
   reactive net — a render-coupling regression fails CI here
   instead of surviving to a capture. See the harness section below.

The split between Tier 1 and Tier 2 is the same as the split
between pure logic and effect orchestration in the production
code. A unit test verifies arithmetic; an integration test
verifies the composable's wiring of pure logic to effects.

## Render-count regression harness (ADR-0010 / P4)

`tests/integration/render-count/` converts render-coupling — a
component whose entire render function re-runs on a per-nav /
per-packet read it should not hold — from a profile-only finding
into a CI-catchable one. Files:

- `render-count.ts` — `mountWithRenderCount(component, options)`.
  Wraps a counting shim around the component's compiled `render`
  option (a `<script setup>` SFC exposes one) on a shallow clone,
  so each render-function invocation increments a counter the test
  reads via `renderCount()`. The signal is the *render*, not the
  *patch*: it counts render-function executions, which is exactly
  what `v-memo` / element-extraction do NOT suppress and what
  render-coupling makes expensive. `onUpdated` or DOM-diff
  observation would measure the patch and miss the bug.
- `jsdom-stubs.ts` — `installRenderEnvStubs()` /
  `removeRenderEnvStubs()`. jsdom lacks the theme CSS custom
  properties `themeColor(…)` reads (it throws loudly per ADR-0002),
  `ResizeObserver`, and `Element.prototype.scrollTo`; the imperative-
  escape composables the green arc introduced need all three to
  mount. The stubs are no-ops / placeholders — render-count tests
  assert on render frequency, not on resolved colour or layout.
- `*.render-count.test.ts` — one per guarded component
  (`TreeWidget`, `BoardTab`). Each drives N synthetic nav / packet
  events through the *production* path (`mutateBoard(id,
  navigateNext)` for nav, `ledger.record(...)` for packets),
  awaits `nextTick()` after each, and asserts `renderCount()` stays
  at the meaningful bound (`0` for "this event must not re-render
  it"). A paired positive-control test changes a value the render
  *does* read (a tree-structure / chrome-state change) and asserts
  `renderCount() ≥ 1`, so a dead counter cannot pass silently.

**Authoring a new guard.** Pick the high-frequency event the
component must NOT re-render on and the structural event it must.
Watch out for legitimate re-render causes that ride the same event
(TreeWidget's `ensureVisible` expands the tree the first time a node
is visited — a real structure-visibility change); control for them
by warming that state before resetting the counter. Verify the guard
is live by temporarily injecting the coupling (a template read of the
high-frequency value) and confirming the test goes red — a
render-count test that cannot fail is worse than none.

## The fake pattern

Every effectful service singleton in `src/services/` (and the
async-control composables it depends on transitively, like
`wait-for-analysis`) gets a fake substitute in `tests/fakes/`.
The fakes are vi-spy-bearing objects exposing the subset of the
real surface that a test subject in this tree exercises — not
the full real interface, only what's actually called.

Existing fakes:

- `fakeBackendService` — satisfies the `BackendService` surface
  used by `useReviewSession` (`submitReview`). Spy-bearing;
  `resetFakeBackendService()` clears recorded calls and
  configured return values.
- `fakeAnalysisService` — satisfies the `AnalysisService`
  surface used by `useReviewSession` and the store's
  resource-ownership cleanup paths (`analyzeRange`,
  `stopBoardAnalysis`, `stopAllBoardAnalyses`,
  `restartActiveAnalyses`).
- `fakeAnalysisPersistenceService` — satisfies the
  `AnalysisPersistenceService` surface used by the store's
  `closeBoard` / `resetWorkspace` cleanup paths (`discard`,
  `forgetAll`, `refreshSummaries`, `summaryFor`, `save`,
  `restore`).

A new test that needs a fake's method that doesn't exist yet
adds it to the fake's object literal and to the corresponding
`reset…` function. Keep the fake's surface strictly to what's
actually exercised.

### Wiring a fake into a test

The test file registers the mock via `vi.mock(...)` at module
top, with a dynamic-import factory pulling the fake from
`tests/fakes/`. Vitest hoists the `vi.mock` call above the
module-level imports, so the fake is in place when the
production module under test loads its service singleton:

```ts
vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { useReviewSession } from '../../src/composables/useReviewSession';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';

beforeEach(() => {
  resetFakeBackendService();
  resetWorkspace();
});
```

### Partially mocking a module

When the unit under test does an `instanceof` check against a
class from a module, the class must come from the **real**
module — a freshly-defined fake class fails the check. Use
`vi.importActual` to spread the real exports and then override
just the function being faked:

```ts
vi.mock('../../src/composables/wait-for-analysis', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/composables/wait-for-analysis')
  >('../../src/composables/wait-for-analysis');
  return {
    ...actual,
    waitForAnalysis: vi.fn(),
  };
});
```

This is the load-bearing pattern for `useReviewSession`'s
`processUserMove` — its catch block does
`err instanceof AnalysisWaitError`, and the error-class import
must be the real one for the check to pass.

## Common gotchas

**Resetting the store between tests.** `resetWorkspace()` from
`src/store` clears boards, the active board index, the profile,
and the per-board reviews map. Call it in `beforeEach` for
test isolation. The store's resource-ownership cleanup (which
fires `analysisService.stopAllBoardAnalyses`,
`analysisPersistenceService.forgetAll`, etc.) is absorbed by
the mocked services without touching the real network.

**Async settling.** Use `flushPromises()` from `@vue/test-utils`
when an action triggers async work that the assertion needs to
observe. Vue's reactivity is microtask-batched; a state-change
assertion immediately after an async call may run before the
microtask queue drains.

**i18n catalogs.** The real `vue-i18n` instance is loaded with
bundled JSON catalogs at module import time and works in
jsdom without setup. `pushSystemMessage` calls
`i18n.global.t(key, params)` directly; tests asserting against
system-message text should pin the key behaviour, not the exact
translated string.

**Reactive state on the global store.** The store is a single
reactive object, not a per-test instance. Tests that mutate it
must reset in `beforeEach`. Composables called from tests
return refs/computeds; access via `.value` for the current
snapshot.

**Module-scope state in composables.** `useReviewSession`'s
`pendingAnalysisAborts` Map is module-scope (one per app, not
per composable instance). It persists across tests within the
same file unless explicitly cleared. The exported
`abortAllReviews()` clears every entry; `abortBoardReview(id)`
clears one.

**Failure-safe teardown.** A test that creates a resource needing
cleanup — a composable handle, a mounted watcher, a registered
listener — must tear it down in a way that runs even when the test
*fails*. End-of-body cleanup (`const h = useX(); … ; h.stop();` as the
last statement) is skipped the moment an earlier assertion throws,
leaking the resource into the next test. That cascade is **its own
bug**, not a side-effect of the triggering failure: a leaked failure
*falsifies* the suite's diagnostic signal — one real failure
metastasises into several false ones that point away from the cause,
strictly worse than a single honest red. Register teardown at creation
with `onTestFinished(() => h.stop())` (or an `afterEach`), which runs
on pass *and* fail. Worked example: the 2026-06-01 `useAutoSaveAnalyses`
diagnosis, where a stale-timing failure in one test skipped its
end-of-body `stop()` and silently broke the next, masking the real
cause — the fix added a `mountAutoSave()` helper that wraps the
composable with `onTestFinished` teardown.

## Run modes

- `npm test` — Vitest watch mode. Use during local development.
- `npm run test:run` — one-shot. The form suitable for the
  build pipeline (and for a `--watch=false` CI invocation).
- `npm run test:coverage` — one-shot with v8 coverage report.
  Report lands in `coverage/`.

The local build (`npm run build`, `vue-tsc -b && vite build`)
does not gate on the test suite — tests are a strict-add safety
net at Phase 0. **CI does, as of 2026-06-01**
(`.github/workflows/frontend-ci.yml`): `npm run test:run` runs
alongside build + `eslint .` on every frontend PR, so a failing
test (or a render-count regression guard) blocks merge.

License: Public Domain (The Unlicense)
