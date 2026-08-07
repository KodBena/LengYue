# KDE-recompute-on-range-change — fix

Fix agent's report against the diagnosis at
`.claude/dispatch-reports/kde-recompute-diagnosis.md` (read in full
before implementing, alongside `frontend/CLAUDE.md` and
`frontend/tests/CLAUDE.md`, both read end to end per the ADR-0002
documentation-consumption corollary they each state).

## Files touched

- `frontend/src/composables/analysis/useAnalysisContext.ts` — the fix.
  Replaced the rangeless `valuesFromSeries` helper with
  `valuesFromSeriesInRange(series, color, range)` (range is a required
  parameter — no rangeless "give me samples" surface left behind, per
  the diagnosis's type-driven suggestion) and a sibling
  `mistakeInRange(marker, range)` predicate. Both `deltaKdeSeries` and
  `mistakeGapHistogramSeries` now read `projection.selectionRange.value`
  inside their `computed` bodies, which is the actual fix — the
  reactive dependency was simply never established before.
- `frontend/tests/integration/useAnalysisContext-range-recompute.test.ts`
  (new) — the red-then-green witness. No `FILES.md` entry needed: the
  discipline in `frontend/CLAUDE.md`'s "File map" section scopes to
  `src/`, and this is a test file.

No other files were touched. `useMistakeFinder.ts` was read in full but
not modified — its `ply`/`colorLocalIdx` fields already carry the
colour-local-index data the fix needs; the range filter is applied at
the `useAnalysisContext.ts` consumption site instead, keeping the touch
surface to the one file the diagnosis named.

## The ply ↔ colour-local mapping

**`EnrichedSeries.data` entries (`[k, v]`) and `MistakeMarker.colorLocalIdx`
are colour-local move indices — NOT array position and NOT `PlyIndex`.**
Read in full: `enriched-accumulator.ts`'s "Delta arbitration" doc and
`EnrichedAccumulator.applyNode`/`applyDeltas` — `blackDeltas`/`whiteDeltas`
are materialised arrays indexed directly by `mIdx`, the numeric key the
proxy's `packet.extra.{black,white}.deltas` object carries per move,
independent of the accumulating node's own path position. There is no
ply carried on the entry itself.

The mapping used is **`colorMoveToPly`**
(`frontend/src/composables/analysis/useTriangularHeatmap.ts:103-106`),
which already exists in this codebase as — per its own doc comment —
"the single authority that establishes the PlyIndex invariant from a
(ColorMoveIndex, StoneColor) pair," and is already the mapping
`MergedDeltaPanel.vue` and `useChartNavigation.ts` use for this exact
series shape (colour-local delta/mistake data plotted or navigated
against `variationPath`). Reusing it, rather than inlining a fresh
`2*i+parity` guess, is the "typed carrier beats an inferred parity"
call from the brief: `colorMoveToPly` is the codebase's one construction
site for this invariant (`types/game.ts`'s `PlyIndex`/`ColorMoveIndex`
doc names it as such), so a second inline formula would be an
unreviewed duplicate of it, not a more sound derivation. `range` is
treated as inclusive at both ends (`ply >= start && ply <= end`),
matching `AnalysisTimelinePanel.vue`'s displayed `turnsRange`.

This mapping is anchored on strict per-ply colour alternation (as
`colorMoveToPly`'s own doc states: "Black's m-th colour-local move lives
at ply 2m+1; White's at ply 2m+2"), which holds for any path where every
`PlyIndex` slot is a genuine turn — including passes, which still
consume a turn slot (`GameNode.move = { type: 'pass', color, x: 0, y: 0 }`,
still occupies a `variationPath` position) and so do not perturb the
formula; verified directly in the pass-containing-game test below. It
would NOT hold for a path whose root seeds handicap stones outside
`variationPath` (White would move first with no preceding Black ply),
but `colorMoveToPly` already carries that same limitation everywhere
else it's used in this codebase (`MergedDeltaPanel`, `useChartNavigation`,
`useTriangularHeatmap`'s own callers) — extending it to a
handicap-aware form is a pre-existing, codebase-wide concern well
outside this fix's minimal-touch scope, not something introduced or
newly assumed here.

## Test names

`frontend/tests/integration/useAnalysisContext-range-recompute.test.ts`:

- `useAnalysisContext.deltaKdeSeries — recomputes on selection-range change`
  - `tracks setSelectionRange: distinct ranges over the same enriched data yield distinct KDE samples`
  - `covers a pass-containing game: a pass still consumes its turn slot, so colorMoveToPly holds unchanged`
- `useAnalysisContext.mistakeGapHistogramSeries — recomputes on selection-range change`
  - `tracks setSelectionRange: the same defect class closes over the mistake-gap histogram too`

Each drives the real `setSelectionRange` mutation (store-backed
`BoardState.analysisRange`, the same path the range-slider UI uses) via
`ctx.setSelectionRange(...)` and reads `ctx.deltaKdeSeries.value` /
`ctx.mistakeGapHistogramSeries.value` afterward — the reactive-
subscription property itself, not just slicing arithmetic. Confirmed
red against the pre-fix `useAnalysisContext.ts` (via `git stash` of
just that file, WITNESSED — all 3 tests failed, each showing the
full-series result bleeding into both ranges) and green against the
fix.

## Verification gates (WITNESSED)

**`npx vue-tsc -b`** — clean, no output:

```
(no output, exit 0)
```

**`npx eslint .`** — clean, no output:

```
(no output, exit 0)
```

**`npm run test:run`** — full suite, exits cleanly:

```
 RUN  v4.1.5 /home/bork/w/omega/.claude/worktrees/agent-a30ac81dd21a3f866/frontend


 Test Files  82 passed | 3 skipped (85)
      Tests  1104 passed | 4 skipped (1108)
   Start at  13:22:18
   Duration  50.61s (transform 5.86s, setup 1.13s, import 21.57s, tests 5.71s, environment 95.24s)
```

License: Public Domain (The Unlicense)
