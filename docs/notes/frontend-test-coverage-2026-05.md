# Frontend Testing Arc — Retrospective

- **Status:** Closes the long-open "no test suite" rough edge
  (`docs/handoff-current.md` "Known gaps (frontend)", retired in
  this same arc).
- **Genre:** Per-arc closing reflection. Peer of
  `docs/notes/test-coverage-2026-05.md` (the backend testing arc's
  closing reflection, 2026-05-07) and
  `docs/notes/release-retrospective-2026-04.md` (v1.0.0 release
  retrospective). Specific where I can be specific.
- **Date:** 2026-05-08.
- **Audience:** Future contributors, future-self returning cold,
  future audit-LLMs trying to read why the tests are shaped the
  way they are.
- **Retires when:** never. This is a closure document for the
  arc; future test work authors its own follow-up notes.

## What this document is

A working contributor's assessment of the testing sweep that took
the frontend from `0 tests` to `100 tests across 10 files`,
distributed across five PRs (#178 Phase 0 bootstrap, #179 Phase 1
pure-logic expansion, #180 Phase 2 useAnalysisProjection +
useChartNavigation, #181 Phase 3 useReviewSession extension, #182
Phase 4 store mutators, plus this Phase 5 docs rollup PR).

The user opened the arc with the framing: *"the backend has done
its testing arc, I think now is the time for the front-end…
Personally I have no idea how to viably test frontend code
automatically (like unit testing, integration testing, no human
interaction required). That's part of why I didn't do it
immediately after the backend was done."* The DoD-of-#137 framing
made the first PR's job concrete (Vitest configured, one composable
covered, pattern documented); the rest of the arc spread coverage
across the natural seams the architecture already exposed.

I am the LLM contributor (Claude Opus 4.7) who carried out the
work. The user signed off on the autonomous staging ("push + open
PR per phase, continue immediately on a new branch") — the same
pattern the backend arc used. Most decisions below were made in
the working seat under that license.

## The starting state

Zero tests. The strict typecheck (`vue-tsc -b`) was the only
correctness gate, and it remains load-bearing — branded IDs,
discriminated unions with exhaustiveness `never`-defaults, and the
OpenAPI-generated wire types catch the wire-shape and signature
class. What it could not police was **behaviour**: lifecycle
transitions, async settling, abort cleanup, the resource-ownership
invariants the audit codified, the arithmetic decisions in the Go
rules engine.

Frontend testing has a reputation for being harder than backend
testing — heavy DOM coupling, fragile snapshots, animation timing.
The reputation is fair in general but doesn't apply here in
proportion to its severity. The architectural separation already
in place — Components are renderers, Composables hold logic,
Services are the effectful boundary, a single ACL at
`src/services/backend-service.ts` — is a testability investment
already made; the arc cashed it in.

## The five phases as shipped

### Phase 0 — Bootstrap (PR #178)

Vitest + jsdom + `@vue/test-utils` + `@vitest/coverage-v8` added to
devDeps; `vite.config.ts` picked up a `test:` block (jsdom env,
explicit imports rather than globals); `npm run test`,
`npm run test:run`, `npm run test:coverage` scripts wired.

The directory shape mirrors `backend/tests/` —
`tests/unit/` for pure logic, `tests/fakes/` for spy-backed service
substitutes, `tests/integration/` for composable integration —
plus `tests/CLAUDE.md` as the contributor doc.

One test per tier shipped as the pattern proof:

- **Tier 1**: `tests/unit/logic.test.ts` exercising `applyGoMove`
  (placement, capture, ko, suicide).
- **Tier 2**: three vi-spy-backed fakes
  (`fakeBackendService`, `fakeAnalysisService`,
  `fakeAnalysisPersistenceService`) covering the effect surfaces
  `useReviewSession` exercises directly or transitively through
  the store.
- **Tier 3**: `tests/integration/useReviewSession.test.ts`
  pinning `endSession` reset, empty-queue `startSession`
  short-circuit, and the `processUserMove` timeout path. The
  timeout path uses `vi.importActual` to preserve
  `AnalysisWaitError` for the `instanceof` check, and verifies
  resource-ownership audit O5 at the integration level.

### Phase 1 — Tier-1 expansion (PR #179)

Five new files, 64 tests:

- `tests/unit/engine/rules.test.ts` — direct `validateMove` (10).
- `tests/unit/engine/sgf-loader.test.ts` — `loadSgf` round-trip
  through Sabaki's parser (10).
- `tests/unit/engine/navigator.test.ts` — `navigateTo` plus
  sequential primitives, including LCA-crossing branch
  transitions and capture-restoration on backwards navigation
  (12).
- `tests/unit/engine/util.test.ts` — coordinate conversions, GTP
  conventions, board-property helpers, RFC4122 v4 UUID,
  `resolveGameName` four-rung ladder (22).
- `tests/unit/services/analysis-config.test.ts` — `hashConfig`
  purity (5).

The pure-logic tier is the highest-ROI test surface in the
codebase. The Go rules engine is type-system-opaque — placement,
capture, and ko are arithmetic-style decisions vue-tsc cannot
police. The SGF loader bridges Sabaki's parser to our internal
shape; bugs there silently produce wrong board projections that
propagate into every navigation thereafter. The navigator's
LCA-based traversal is the load-bearing surface beneath every UI
navigation action.

### Phase 2 — useAnalysisProjection + useChartNavigation (PR #180)

Issue #137's other named composables. Two new files, 16 tests:

- `tests/integration/useChartNavigation.test.ts` — main click
  navigates AT the turn, player click navigates BEFORE the move
  (the deliberate click/hover asymmetry pinned), hover handlers
  surface the right `showMarker` flag, integration with
  `useVariationPath` reflects branch-switch updates.
- `tests/integration/useAnalysisProjection.test.ts` —
  `activeMainIndex` matches path index after navigation;
  `activeBlackIndex` / `activeWhiteIndex` follow the "null when
  this colour just moved, else cumulative count" contract across
  the root + each ply of a 4-move mainline.

`useThumbnailCache` is mocked because its real implementation
renders SVG via the board renderer. `mainSeries` and the
`useAnalysisTimeline` pass-throughs are deferred — they depend on
`useEnrichedData` / `useKernelSeries` state machinery whose own
integration tests slot into a future arc.

### Phase 3 — useReviewSession extension (PR #181)

Six new tests in the existing `useReviewSession.test.ts`:

- **Happy path (3 tests)**: non-final move records the analysis
  delta and applies the engine's best-move follow-through; the
  documented `delta=0.5` fallback when `extra.<color>.deltas` is
  absent; final move fires `submitReview` and transitions to
  `FINISHED`.
- **Abort cleanup (3 tests)**: `nextCard` (which calls `loadCard`
  internally), `closeBoard`, and `resetWorkspace` each fire
  `AbortController.abort()` on the in-flight wait.

Phase 0 had pinned the timeout-side cleanup (O5) end-to-end
because it was the easiest abort entry-point to observe; Phase 3
extended to the other three abort triggers.

A small `abortableMock()` helper installs an abort listener and
exposes a flag when the abort fires. The assertion is
`expect(wait.aborted()).toBe(true)` — pins the *behaviour*
(controller fired) without coupling to processUserMove's catch-
branch implementation detail.

A new `makeAnalysisPacket` factory shapes `KataAnalysisResponse`
fixtures cleanly across the success-path tests.

### Phase 4 — store mutators (PR #182)

`closeBoard` and `resetWorkspace` are the post-resource-ownership-
audit worked examples named in `frontend/CLAUDE.md`'s §"Resource
ownership at mutation sites". One new file, five tests:

- **closeBoard cleanup chain**: every spy / fake records the
  closing BoardId — `analysisService.stopBoardAnalysis` (O1),
  `ledger.purgeBoard` (paired across closeBoard / resetWorkspace),
  `analysisPersistenceService.discard` (O13), per-board
  dictionary deletes (O2, O3), `purgeBoardThumbnails` (O4),
  `removeBoardCardTree` (O12). Board removed from
  `store.boards`.
- **closeBoard last-board branch**: closing the only board spawns
  a fresh blank instead of leaving `store.boards` empty.
- **closeBoard activeBoardIndex adjustment**: closing before the
  cursor decrements the cursor.
- **resetWorkspace cleanup chain**: O7, O8, O9, O10
  (privacy-relevant), O12 (privacy-relevant), O13 all fire
  exactly once; `store.boards` becomes `[fresh]`,
  `session.reviews` emptied.
- **resetWorkspace store.engine preservation**: the documented
  invariant (local-machine WS URL isn't user-keyed) pinned —
  `engine.status` survives the reset.

The audit pairs are silent-failure prone — a missed cleanup leaks
the resource until the next workspace mutation. Two pairs are
privacy-relevant (O10 card-thumbnail cache, O12 per-board
card-tree state — both keyed by raw CardIds that collide across
users). Pinning these at the integration level is the natural
test-suite responsibility; the strict typecheck cannot police "did
closeBoard call X".

### Phase 5 — Documentation rollup (this PR)

Testing posture documented in `frontend/CLAUDE.md` and
`frontend/tests/CLAUDE.md` (Phase 0 work). The "no test suite"
gap retired from `docs/handoff-current.md`'s "Known gaps
(frontend)" section. `docs/TODO.md` updated to mark the testing
arc complete. This retro authored.

## What worked

**The fakes pattern.** Three small files
(`tests/fakes/backend-service.ts`,
`tests/fakes/analysis-service.ts`,
`tests/fakes/analysis-persistence-service.ts`) covered every
service-tier dependency the integration tests touched. New tests
import the existing fakes; the fakes' surfaces grow only when the
underlying production interface gains a method the tests
exercise. The cost-per-test is low; the cost-per-fake is paid
once.

The frontend's fakes have less ceremony than the backend's Port
fakes — there's no `Protocol` typing to mirror. The implicit
contract is the production singleton's surface; consumers via
`vi.mock` substitution see the fake at the module-import boundary.
Acceptable: the structural-match check happens at usage sites
(test files), not at fake construction. A future Port-style
abstraction on the frontend would let the fakes carry typed
interfaces, but the current shape is honest about the lack of
that abstraction.

**`vi.importActual` for partial mocks.** The
`wait-for-analysis` mock pattern — preserve the real
`AnalysisWaitError` class, replace just the `waitForAnalysis`
function — is the load-bearing pattern for testing classes that
flow through `instanceof` checks. Without it, the mocked class
fails the check, the rejection routes through the unexpected-
error throw branch, and the test fails for the wrong reason.
This is the most subtle Vitest lesson the arc surfaces; the
contributor doc names it explicitly.

**One PR per phase.** Five PRs is more bookkeeping than one big
PR, but each PR's diff was reviewable in one sitting. Phase 1
alone added 64 tests across five files; squashed with the
bootstrap PR's 9 tests, the diff would have been ~1500 lines of
tests + bootstrap config in one review. Stacked PRs gave the
reviewer the option to merge the foundation early and let the
expansion phases land later — the same shape backend's arc used.

**Pinning the resource-ownership audit at the integration
level.** Phase 4 is the most quietly important phase. The audit
pairs (O1-O13) were authored at the time of the audit; the
inline-comment convention names what each pair covers. Until
Phase 4, the only enforcement was code review. Now every cleanup
call has a test that records its call shape against the closing
BoardId. A future regression — accidentally dropping a cleanup
call during a refactor — surfaces as a test failure at exactly
the audit-pair the missed call was supposed to cover.

## What was hard, and what to know

**The vi.mock + dynamic-import pattern.** vi.mock hoists the call
to the top of the file; the factory runs lazily on first import
of the mocked module. For fakes that need to be referenced from
the factory and the test body, the cleanest pattern is to pass
the fake's module path through dynamic `import()` inside the
factory:

```ts
vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { fakeBackendService } from '../fakes/backend-service';
// ... use fakeBackendService in test bodies
```

The fake module is imported twice — once by the factory (returns
a Promise), once at the top of the test file (synchronous). Both
paths resolve to the same module instance, so the test body and
the production-side import see the same vi.fn() references. This
is the load-bearing pattern; tests that pre-construct the fake at
the top of the file before vi.mock break under hoisting.

**The composable's public surface vs. internal helpers.** A
first-pass Phase 3 test invoked
`composable.loadCard(0)` to trigger the abort-on-card-transition
path. `loadCard` is intentionally not surfaced on the public
return; the test had to be reshaped to use `nextCard` against a
two-card queue, which calls `loadCard(currentIndex + 1)`
internally. Lesson: tests should use the public composable
surface unless the test is specifically pinning module-scope
state (in which case it imports the named export directly, e.g.
`abortBoardReview` / `abortAllReviews`).

**resetWorkspace fires every cleanup spy once, including in
beforeEach.** Phase 4's first test failed because every cleanup
spy reported "called 1 time" before the test body ran — the
resetWorkspace in beforeEach (the standard test isolation
pattern) had already fired everything. The fix is a double-reset
shape: resetWorkspace once to clear inherited state, then mock
spy resets to establish the per-test baseline. Documented in
the test file's beforeEach with a comment.

**SGF coordinate y-flip.** Sabaki's SGF parser emits coordinates
where row letters increase top-down (a=0, b=1, …); our internal
coordinate system places y=0 at the bottom (matching
`BoardDisplay.toSVG`'s y-flip). The conversion is `y = (size-1) -
(charCode - 97)`. Setting up SGF fixtures for the rules and
loader tests — particularly the corner-capture fixtures with
specific coordinate constraints — required holding both
conventions in mind simultaneously. The util.test.ts assertions
pin both conventions explicitly so a future refactor that
breaks one direction surfaces immediately.

## What's left (honestly)

**Composable coverage breadth.** The arc covered the four
composables issue #137 named explicitly (`useReviewSession`,
`useAnalysisProjection`, `useChartNavigation`, plus the implicit
coverage of `useVariationPath` via the chart-nav tests) and the
two store mutators. The `src/composables/` tree has ~30 more
composables; future arcs would extend coverage to:

- **Auth surface**: `useAuth` (sign-in flow, identity rotation).
- **Card-tree composables**: `useCardTreeData` /
  `useCardTreeHydration` / `useCardTreeProjection` — the SR
  card-tree view. Heavier dependencies on the backend service;
  fakes would need to grow.
- **Tab-flow orchestration**: `useDirtyBoardGuard`, `useMinting`,
  `useSgfLoader`, `useForestNavigation`, `useNavigation`. The
  glue that wires the database / cards / SR / forest tabs.
- **Engine kernels**: `src/engine/analysis/kernels.ts` directly.
  Pure-logic tier; should be Tier-1 unit tests.

**Component / template tests.** Out of scope at Phase 0 and
remains so. The architectural shape (components are thin
renderers; logic lives in composables) means component tests
catch a small slice of bugs at high maintenance cost. If the
component layer ever picks up logic it shouldn't (a sign of
architectural drift), tests would surface there too — but the
discipline is to push the logic back to a composable, not write
the component test.

**E2E tests.** Out of scope. The integration tier covers the
behaviour class for which E2E would otherwise be the only test
shape; full-stack E2E would primarily catch the cross-boundary
class (frontend ⇌ backend ⇌ proxy) which the strict typecheck +
ACL + dispatch ledger already police at authoring time.

**CI integration.** The build pipeline (`npm run build`) does
not yet gate on the test suite. Wiring `npm run test:run` into
the PR pipeline is the natural follow-up. The frontend repo's
GitHub Actions setup is umbrella-level; a follow-up PR would
add the workflow.

**No production bugs surfaced.** The backend testing arc
surfaced four production bugs (`StatsRepository` cross-tenant
leak, two `LineageRepository` SQL bugs, the `resources` route
404-mapping). The frontend arc surfaced none. Two readings,
both honest:

  1. The frontend has heavier compile-time enforcement than the
     backend did pre-arc — branded IDs, discriminated unions
     with exhaustiveness `never`-defaults, OpenAPI-generated
     wire types. Many bugs surface as type errors at
     `vue-tsc -b` time and never make it into a tested code
     path.
  2. The targets in this arc were the most heavily-exercised
     modules — `applyGoMove`, the navigator, `useReviewSession`.
     A future arc that extends to the less-exercised composables
     (the tab-flow orchestration set above) is more likely to
     surface latent issues.

The first reading is the load-bearing one. The architectural
discipline that makes the frontend testable also makes its bugs
fewer at the typecheck-passable layer; tests are a strict-add
safety net rather than a crutch.

## On the LLM contributor seat

A few observations from inside the work, paralleling the backend
retro's same-titled section:

  - **The compose-of-fakes-and-real pattern is the load-bearing
    integration shape.** Fake the proxy / backend / persistence
    boundaries; let the store, the navigator, the SGF loader,
    the rules engine, and the i18n catalogs run for real. The
    composable under test sees its real dependency graph minus
    the network. This shape preserves the highest-fidelity
    behaviour-coverage while keeping the test deterministic.

  - **The contributor doc earns its keep.**
    `frontend/tests/CLAUDE.md` was authored at Phase 0 when the
    patterns were still being discovered; Phases 1-4 each
    extended it implicitly (a new pattern surfaced, the doc
    picked up a paragraph). The result is a contributor doc
    that's been validated against four expansion phases and
    surfaces the gotchas (vi.mock hoisting, partial-module
    mocks via `vi.importActual`, the public-surface-only test
    discipline) at the moment a new contributor is most likely
    to hit them.

  - **The backend testing arc retro's "honest sweep" framing
    composed forward.** The user's Phase 0 framing — "I have no
    idea how to viably test frontend code automatically" —
    invited a strategic response (yes, here's why, here's the
    shape). The retro for that arc set the precedent: name the
    framing, name the deliverable, name the explicit out-of-
    scope. Phase 0's PR body did the same; subsequent phases
    inherited the structure. The discipline is portable across
    arcs.

  - **One PR per phase, autonomous staging.** "Push + open PR
    per phase, continue immediately on a new branch" is the
    same pattern that worked for the backend arc. Stacking the
    PRs with explicit `--base` means each PR's diff is its own
    phase's work; the reviewer can merge the foundation early
    or late, and the stack rebases naturally.

## Closing

The "no test suite" rough edge is retired. The frontend ships
100 tests across three tiers (`tests/unit/` for pure logic,
`tests/fakes/` for service substitutes, `tests/integration/` for
composable + store integration), zero production bugs surfaced,
and the testing posture is documented in `frontend/CLAUDE.md`
and `frontend/tests/CLAUDE.md` for the next contributor.

The strict-typecheck stays load-bearing for the wire-shape and
signature class. Tests cover the behaviour class. The two
together replace what was previously single-author iterative
review.

License: Public Domain (The Unlicense)
