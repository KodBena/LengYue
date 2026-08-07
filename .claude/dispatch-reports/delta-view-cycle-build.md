# Delta-panel three-mode view cycle (shared / black / white)

Commission (maintainer, ledger row 418, verbatim as dispatched): build a
three-mode cycle on the delta analysis panel — (1) shared, today's
overlaid view unchanged; (2) black-only; (3) white-only — cycling
shared → black → white → shared on a dedicated chrome affordance, to make
click-to-navigate unambiguous per colour. Hard constraint: the SPA's
click→navigate mapping ("the move you click is the position the player is
about to move; you're navigated to the position before that move") is
untouched everywhere; the per-colour modes change only which series a
click can hit.

Branch: `bork/feat/delta-view-cycle`, worktree
`.claude/worktrees/delta-view-cycle` (isolated from the main checkout —
main was never touched). Commit: `fa533652` — *"feat(frontend):
delta-panel three-mode view cycle (shared/black/white)"*.

Read end-to-end before implementing, per `frontend/CLAUDE.md` /
`frontend/tests/CLAUDE.md`'s ADR-0002 documentation-consumption corollary:
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`useAnalysisContext.ts`, `MergedDeltaPanel.vue` (the actual "shared delta
view" — the commission's "delta analysis panel" is this component, not
`DeltaDistributionPanel.vue`'s KDE chart, which has no click-to-navigate
at all), `AnalysisChartPanel.vue`, `BaseChart.vue`, `StabilityPanel.vue` /
`StabilityCrossCorrelationPanel.vue` (chrome-idiom survey), and
`store/schema.ts` / `store/migrations.ts` / `store/defaults.ts`.

## Which component is "the delta analysis panel"

`DeltaDistributionPanel.vue` (KDE chart) has no click handler at all —
out of scope. `MergedDeltaPanel.vue` ("Per-Player Performance (Moves)")
is the click-to-navigate delta chart the commission describes: black's
and white's deltas share one chart on a parity-interleaved x-axis
(black's K-th move at x=2K, white's at x=2K+1), and click dispatch
(`colorAt`) resolves a clicked x to a colour by parity, then to a node via
the *unchanged* `variationPath[colorMoveToPly(K, colour) - 1]` mapping.
The ambiguity the commission names: ECharts draws piecewise-linear
segments between a colour's sparse points, visually crossing x-values
that colour never played — a click near that crossing can look like one
colour and resolve to the other.

## Chrome idiom followed

Surveyed `StabilityPanel.vue` / `StabilityCrossCorrelationPanel.vue`:
both wrap their own `AnalysisChartPanel` (or a bespoke chart) in an OUTER
`.section` with its own `.header` row (title + `<select>` controls),
distinct from `AnalysisChartPanel`'s own header/chevron. `MergedDeltaPanel`
now follows the same shape — a new outer `.mode-chrome` /
`.mode-header` wrapping the unchanged `AnalysisChartPanel` — with a
`<button class="mode-cycle-button">` instead of a `<select>` (a select
doesn't fit "cycles on click"; a native `<button>` is keyboard-reachable
for free — Tab focus, Enter/Space activation, no extra ARIA wiring
needed). The button always shows the current mode's label ("Shared" /
"Black" / "White"), carries a colour-coded left border on Black/White
(mirrors `AnalysisChartPanel`'s existing `.marker-b`/`.marker-w`
preview-box convention) so the state reads at a glance, and a `title` +
`aria-label` spelling out the full semantics and what the next click does.

## Type design

`frontend/src/composables/analysis/useDeltaViewMode.ts` (new file):

- `export type DeltaViewMode = 'shared' | 'black' | 'white'` — a closed
  union (ADR-0000: mode as a type, not booleans), never widened.
- `DELTA_VIEW_MODE_CYCLE` — the fixed order array; `nextDeltaViewMode`
  advances one step, wrapping.
- `isColorVisibleInMode(mode, color)` — the yes/no rule both other
  functions key off.
- `seriesForMode(black, white, mode)` — **the** projection. In `'black'`
  mode, `white` maps to `[]`; in `'white'` mode, `black` maps to `[]`; in
  `'shared'` mode both inputs pass through **by reference** (not a copy).
- `useDeltaViewMode()` — a `WritableComputedRef` over
  `store.session.ui.deltaViewMode` (get/set, `?? 'shared'` fallback) plus
  `cycle()`, mirroring `useQeubo`'s `qeuboToolbarView` accessor pattern.

## The click-path change (proving wrong-colour hits are unrepresentable)

`MergedDeltaPanel.vue` now computes `effectiveBlackSeries` /
`effectiveWhiteSeries` via `seriesForMode(blackSeries.value,
whiteSeries.value, mode.value)`, and **both** the chart-series build
(`mergedSeries`) and the click-dispatch function (`colorAt`) read
*exclusively* through these two computeds — never `blackSeries` /
`whiteSeries` directly:

```ts
// colorAt — before: always scanned blackSeries.value / whiteSeries.value
// colorAt — after:
const series = candidate === 'B' ? effectiveBlackSeries.value : effectiveWhiteSeries.value;
for (const s of series) {
  const pt = s.data.find(([j]) => j === k);
  if (pt && pt[1] != null) return candidate;
}
return null;
```

In `'black'` mode, `effectiveWhiteSeries.value` is `[]` — the loop over it
finds nothing structurally, not because a mode check rejected the
candidate after the fact. This is filtering the **hit-testable series**
(per ADR-0000 / the dispatch brief), not post-filtering the navigation
result. The mistake-finder scatter overlay gets the same treatment (a
hidden colour's dots are excluded, so no dot renders with no click
semantics behind it). In `'shared'` mode `effectiveBlack/WhiteSeries`
are `blackSeries.value` / `whiteSeries.value` by reference — `mergedSeries`
and `colorAt`'s behaviour is byte-for-byte unchanged from before this
feature (this is also the shared-mode regression-lock test's actual
assertion, see below).

The click→node mapping itself (`colorMoveToPly(K, colour) - 1`, hover
shows the post-move position, click navigates to the pre-move position)
is **untouched** — grep confirms no other line in the click/hover/preview
functions changed.

## Persistence

Follows the `qeuboToolbarView` idiom exactly (`session.ui`, optional
field, `?? default` read-site fallback, `defaults.ts` seed, migration
backfill, `RegistryEditor.vue` dropdown entry):

- `UISession.deltaViewMode?: DeltaViewMode` — `store/schema.ts`.
- `defaultSessionUI.deltaViewMode = 'shared'` — `store/defaults.ts`.
- Migration 63 → 64 backfills `session.ui.deltaViewMode` to `'shared'`
  for pre-existing blobs (`CURRENT_SCHEMA_VERSION` bumped 63 → 64).
  Per the file's rolling-archive discipline (keep exactly the latest two
  migrations active), migration 61 → 62 was moved verbatim into
  `archived-migrations.ts` to make room; both files' scope comments were
  updated to match.
- `RegistryEditor.vue`'s `PATH_ENUMS['deltaViewMode'] = ['shared',
  'black', 'white']` — so the Settings → Session (UI) registry editor
  renders a dropdown, not a free-text field (visible live in the
  screenshot below).

## Test list

1. **`tests/unit/composables/useDeltaViewMode.test.ts`** (Tier 1, pure,
   no DOM) — WITNESSED, `npx vitest run` green:
   - the cycle is exactly `[shared, black, white]`, cycles
     `shared → black → white → shared` and no further (asserts the 4th
     step returns to `black`, ruling out a longer/shorter cycle);
   - every mode has a non-empty label;
   - `isColorVisibleInMode` truth table for all three modes × both
     colours;
   - **the hit-test-payload property**: `seriesForMode(black, white,
     'black').white` is `[]` (not a filtered copy) and a simulated
     click-dispatch scan over it finds no datum — the same property the
     dispatch brief asks for ("what a click CAN hit"), asserted directly
     on the function `colorAt` and `mergedSeries` both consume, rather
     than reconstructed from a mounted chart's pixels;
   - symmetric case for `'white'` mode hiding black;
   - **shared-mode regression lock**: `seriesForMode(black, white,
     'shared')` returns both inputs **by reference** (`toBe`, not
     `toEqual`) — the strongest available guarantee that shared mode's
     series config is unchanged, for arrays of any shape (empty, single,
     multi-series).
2. **`tests/integration/useDeltaViewMode-persistence.test.ts`** (Tier 3,
   real store, no fakes needed — mirrors `useForestNavigation.test.ts`'s
   bare-composable shape since `useDeltaViewMode` registers no lifecycle
   hooks) — WITNESSED, green:
   - defaults to `'shared'` on a fresh `resetWorkspace()`;
   - `cycle()` writes through to `store.session.ui.deltaViewMode`, not a
     local-only ref;
   - full wrap `shared → black → white → shared`;
   - a direct store write is visible through the accessor (round trip);
   - a second `useDeltaViewMode()` call (the panel-remount case) observes
     the same persisted value;
   - `resetWorkspace()` restores the default, discarding a prior
     session's choice.
3. **`tests/unit/store/migrations.test.ts`**, new `describe('63 → 64: …
   ledger row 418')` block — WITNESSED, green: backfills `'shared'` when
   absent; idempotent for a pre-existing valid value (`'black'` and
   `'white'` both checked); repairs a malformed value; no-ops when
   `session.ui` is absent; and a full `migrate()` walk from v63 to
   `CURRENT_SCHEMA_VERSION` with the field backfilled.
4. **`tests/integration/migration-store-roundtrip.test.ts`** (pre-existing
   file, unmodified) — WITNESSED, still green: the new migration backfills
   the field so it never becomes an unexplained `payloadOnly` /
   `EXPECTED_DEFAULTS_ONLY_PATHS` entry (the exact class of bug this test
   exists to catch, per its own header).

No component-mount / chart-mount test was added — `frontend/tests/
CLAUDE.md`'s Tier-3 posture explicitly defers component/render tests
("catch a small slice of bugs at high maintenance cost… defer until the
composable layer has broad coverage") and `seriesForMode`'s direct
Tier-1 coverage already observes the exact property the commission's test
list names (what a click CAN hit), without the fragility of asserting on
ECharts' internal option object under jsdom.

## Gates (full suite, this worktree)

```
$ npx eslint .
(no output — clean)

$ npm run build
> vue-tsc -b && vite build
✓ 1096 modules transformed.
dist/index.html                     0.84 kB
dist/assets/index-*.css           119.53 kB
dist/assets/index-*.js          2,942.10 kB
✓ built in 1.95s

$ npm run test:run
 Test Files  108 passed | 3 skipped (111)
      Tests  1356 passed | 4 skipped (1360)
```

All three gates re-run as the LAST action before writing this report
(post live-verification, post scratch-script cleanup) — WITNESSED clean.
The 3 skipped files / 4 skipped tests are pre-existing (unrelated to this
change; not touched).

## Live verification (mandatory section)

Built `npm run build` in this worktree; served `dist` via `vite preview
--port 4200 --strictPort` (a free port ≥ 4200, never touching 4173 / 5173
/ 5174 / 8764's owning *processes* — the app's own backend calls to 8764
are the SPA's normal same-origin-equivalent API traffic, identical to
what a human loading this build would generate, not a change to that
port's process). Drove it with `playwright-core` + `/usr/bin/chromium`,
headless, viewport 3840×2160, against the real, already-running local
backend (13 real boards were present in the workspace — this world's own
data, not a fixture).

**Analysis data / live-engine path — UNEXERCISED.** The KataGo engine
showed `Engine: Offline` in the Analysis tab; no board had prior recorded
delta-analysis packets, so `blackSeries` / `whiteSeries` were both `[]`
for every board tried. Concrete blocker: no live KataGo engine process
was reachable read-only in this sandboxed session, and starting one was
out of scope (not a port named in the dispatch, but also not something I
judged safe to spin up unprompted against a shared, already-populated
workspace). Per the dispatch's own fallback instruction, verified
everything renderable without engine data instead — which is everything
except literal delta *values* on the plotted lines, since the property
under test (which series is present/hit-testable) is visible in the
chart's **legend entries** regardless of whether those series carry
points.

**Mode control + series-visibility cycling — WITNESSED**, screenshots at
`.claude/dispatch-reports/delta-view-cycle-assets/`:

| # | File | What it shows |
|---|------|----------------|
| 1 | `02-mode-shared.png` | Shared mode: button reads "Shared", legend shows **both** "Black Delta" and "White Delta". |
| 2 | `03-mode-black.png` | After one click: button reads "Black" (blue-accented left border), legend shows **only** "Black Delta" — White Delta legend entry is absent, not greyed out. |
| 3 | `04-mode-white.png` | After a second click: button reads "White" (dark-red-accented border), legend shows **only** "White Delta". |
| 4 | `05-mode-back-to-shared.png` | Third click wraps back to "Shared"; legend shows both entries again — confirms the cycle order is exactly shared→black→white→shared and shared mode's series set is restored, not left stale. |
| 5 | `06-mode-after-reload.png` | A separate, deterministic persistence run: forced the mode to "Black", confirmed the backend PUT carrying `"deltaViewMode":"black"` in its request body, reloaded the page cold, and the button still read "Black" with only "Black Delta" in the legend — `session.ui.deltaViewMode` survives a real reload against the real backend. |

Keyboard reachability — WITNESSED: `modeButton.focus()` moved
`document.activeElement` to the button (confirmed via
`el === document.activeElement`); pressing `Enter` while focused advanced
the mode exactly as a click would (observed via the button's own text
changing, confirmed with a `MutationObserver`-based wait, not a guess).

Settings registry wiring — WITNESSED (visible in an earlier full-page
screenshot taken during this session): the Session (UI) registry editor
under Settings renders `deltaViewMode` as a `shared`/`black`/`white`
dropdown (not free text), confirming `RegistryEditor.vue`'s `PATH_ENUMS`
entry resolves correctly against the live store.

**Zero-wall-clock-waits proof for the synchronization primitives used to
prove correctness** (button state, dispatch resolution, persistence) —
grep over the actually-committed test files:

```
$ grep -rn "waitForTimeout\|setTimeout(.*resolve\|new Promise(resolve => setTimeout\|sleep(" \
    tests/unit/composables/useDeltaViewMode.test.ts \
    tests/integration/useDeltaViewMode-persistence.test.ts \
    tests/unit/store/migrations.test.ts
NONE FOUND (clean)
```

Full disclosure on the throwaway Playwright driver script used only to
produce the five PNGs above (not committed — deleted after the run, never
part of the deliverable): mode transitions and keyboard activation were
synchronized on real conditions (a `MutationObserver` on the button's own
text, `page.waitForRequest` matching a PUT whose *body* contains
`"deltaViewMode":"white"` / `"black"` — not just any PUT to the endpoint,
since SyncService's debounced save coalesces rapid mutations and matching
on the URL alone was observed to catch a stale in-flight write from an
earlier click in the same burst). The **screenshots only** additionally
used one fixed, named, documented wait
(`BASE_CHART_REDRAW_THROTTLE_MS = 250`, `src/lib/timing.ts` — BaseChart's
own trailing-throttle interval for its ECharts `setOption` redraw) plus a
400ms margin, purely so the PNG captures the settled canvas paint after
the Vue-level condition (button text) had already been confirmed by the
MutationObserver; this wait is not the correctness witness for any claim
in this report — the deterministic, zero-wait `seriesForMode` unit tests
are — it exists only to make an inspectable image legible, and is named
here rather than silently used.

## Files touched

- `frontend/src/composables/analysis/useDeltaViewMode.ts` (new) — mode
  type, cycle order, `seriesForMode`, `useDeltaViewMode()`.
- `frontend/src/components/charts/MergedDeltaPanel.vue` — header chrome +
  cycle button; `mergedSeries` / `colorAt` / mistakes filter read through
  `effectiveBlack/WhiteSeries`.
- `frontend/src/store/schema.ts` — `UISession.deltaViewMode?` field.
- `frontend/src/store/defaults.ts` — `deltaViewMode: 'shared'` seed.
- `frontend/src/store/migrations.ts` — migration 63 → 64;
  `CURRENT_SCHEMA_VERSION` 63 → 64; rolling-archive move of 61 → 62 out.
- `frontend/src/store/archived-migrations.ts` — receives 61 → 62 verbatim;
  scope-comment update.
- `frontend/src/components/editors/RegistryEditor.vue` —
  `PATH_ENUMS['deltaViewMode']`.
- `frontend/FILES.md` — new-file entry + `MergedDeltaPanel.vue`'s
  description updated.
- `frontend/tests/unit/composables/useDeltaViewMode.test.ts` (new).
- `frontend/tests/integration/useDeltaViewMode-persistence.test.ts` (new).
- `frontend/tests/unit/store/migrations.test.ts` — new `63 → 64` describe
  block.

## Known deviation, disclosed

`MergedDeltaPanel.vue` is now 464 lines (was 335 before this change),
against ADR-0007's ~250-line SFC target — already over budget
pre-existing (it was the second-largest chart panel in the tree before
this commission; `BaseChart.vue` at 642 lines is the only larger one, and
is shared infrastructure). Nearly all of the growth here is documentation
comment (the click-path/ADR-0000 rationale) plus the new template/style
block for the header chrome; no new *logic* branch was added outside
`useDeltaViewMode.ts`. Extracting the click-dispatch functions
(`colorAt`, `handleClick`, `handleHover`, `resetPreview`,
`colorLocalIndex`) into their own composable would bring the file back
under budget, but is a real refactor of code the hard semantic constraint
explicitly forbids "fixing" or reinterpreting — judged out of scope for
this commission's risk/effort budget and left as a named follow-up rather
than attempted opportunistically.
