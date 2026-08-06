# Build report: analysis move-range memory (design §1, Candidate C)

Implements `design/design-analysis-ux.md` §1 as adjudicated by the commissioner
(ledger rows 112/119) — branch-stem-keyed analysis-chart selection range,
with the LRU-eviction amendment (uncapped map). Section 2 of the design
(metric-experimentation ergonomics) is out of scope; not touched.

## Files touched

- `frontend/src/composables/analysis/branch-range-key.ts` (new) — sole
  factory `deriveBranchRangeKey` + the `BranchRangeKey` brand and its
  dependency-set doc comment (decision-node-choice legs only).
- `frontend/src/types/game.ts` — `BoardState.analysisRange?: [PlyIndex,
  PlyIndex]` reshaped to `BoardState.analysisRanges?:
  Partial<Record<BranchRangeKey, [PlyIndex, PlyIndex]>>`; doc comment
  documents the uncapped-map adjudication in place (no LRU implemented).
  Type-only import of `BranchRangeKey` from the composable (mirrors the
  `types/engine.ts` precedent of a type-only import from outside `types/`;
  `RawKey`/`EnrichedKey` precedent keeps the brand in `types/ids.ts` with
  the factory elsewhere in `state/` — the difference here is
  `BranchRangeKey`'s brand+factory were both directed to
  `branch-range-key.ts` by the task).
- `frontend/src/composables/analysis/useAnalysisTimeline.ts` — `stored`
  keys into `analysisRanges` via a new `branchKey` computed
  (`deriveBranchRangeKey(variationPath.value, board.value?.nodes)`);
  `setSelectionRange` writes the keyed entry (lazily initialising the
  map); the length-only watch becomes a `(branchKey, length)` tuple
  watch. The existing seed/clamp body needed no branching logic change —
  because `stored` is now keyed, "no prior value under this key" already
  covers both "fresh mainline" and "never-visited branch"; "prior value
  present" already covers both "same branch, forward play" and
  "returning to a previously-set branch." Watching the pair (not length
  alone) is load-bearing: a branch switch to a same-length sibling must
  still reseed, and plain length-watch would miss it.
- `frontend/src/store/migrations.ts` — new migration 61 → 62 (bumped
  `CURRENT_SCHEMA_VERSION` 61 → 62): converts `boards[*].analysisRange`
  into a single `analysisRanges` entry keyed by the branch stem computed
  from the board's CURRENT active-variation path at migration time
  (carry-over, commissioner-adjudicated, not a drop). The active-path
  walk + branch-key derivation are INLINED (not imported from
  `getActiveVariationPath`/`deriveBranchRangeKey`) so the migration body
  stays frozen and self-contained per the append-only invariant.
  Same-commit archive: migration 59 → 60 moved into
  `archived-migrations.ts` (rolling-archive cadence — active file now
  holds 60→61 and 61→62 as the two style anchors).
- `frontend/src/store/archived-migrations.ts` — 59 → 60 body appended
  verbatim (cut-and-paste, unedited); header's scope line updated
  (58→59 → 59→60, 58 → 59 entries).
- `frontend/tests/unit/composables/analysis/branch-range-key.test.ts`
  (new) — Tier-1 unit tests for `deriveBranchRangeKey`.
- `frontend/tests/integration/useAnalysisTimeline-branch-range-memory.test.ts`
  (new) — Tier-3 integration tests driving `useAnalysisTimeline` against
  a forked SGF fixture via `mutateBoard`/`navigateTo`.
- `frontend/tests/unit/store/migrations.test.ts` — new `describe('61 → 62
  …')` block.
- `frontend/FILES.md` — new row for `branch-range-key.ts`;
  `useAnalysisTimeline.ts`'s summary line retagged.
- `frontend/IDENTIFIERS.md` — new `BranchRangeKey` row (band: [B2]
  tree-positional) under "Ephemeral & discriminated string brands."

## Key decisions as implemented

- **Branch-stem identity (Candidate C).** `BranchRangeKey` = `|`-joined
  `${decisionNodeId}:${chosenChildId}` legs, one per node along the
  active `RootToLeafPath` with `children.length > 1`. A single-child
  node contributes nothing — extending the mainline never changes the
  key. This is exactly the design's recommended candidate; A and B were
  rejected in the design doc itself (churn on every ply / every cursor
  move) and not reconsidered here.
- **Uncapped map (adjudication amendment).** No LRU eviction implemented
  anywhere. Documented at `BoardState.analysisRanges`'s declaration site
  as the commissioner's deliberate override of the design's proposed
  32-entry cap (ledger rows 112/119) — growth bounded in practice by
  branches a human visits; a pruned variation's orphaned entry is an
  accepted bounded leak under the same adjudication, not swept.
- **Carry-over migration (not drop).** The commissioner's adjudication
  (same rows) chose "range survives the upgrade" over "range resets
  once" — migration 61 → 62 converts the legacy single slot into an
  entry keyed by the board's current branch stem at migration time (the
  only key computable from a frozen blob), matching the design's named
  choice exactly.

## Test names

- `tests/unit/composables/analysis/branch-range-key.test.ts` —
  `deriveBranchRangeKey`: empty-path, single-child-contributes-nothing
  (+ mainline-extension no-op), fork-changes-key (both branches),
  shared-prefix-diverges-only-after-fork, deterministic-across-repeated-
  calls (cursor-movement-stability proxy), deep-fork, multi-fork-
  ordered-accumulation.
- `tests/integration/useAnalysisTimeline-branch-range-memory.test.ts` —
  "a range set on branch A is unaffected by visiting branch B and is
  restored exactly on return to A" (defect-foreclosing: fails if keying
  is reverted to the single-slot shape — asserted via a real
  `navigateTo`-driven branch switch, not a synthetic key check);
  "extending the mainline (no fork revisited) preserves the prior range,
  clamped (regression guard)".
- `tests/unit/store/migrations.test.ts` — `describe('61 → 62: …')`:
  mainline-only carry-over (empty branch key), forked-board carry-over
  (keyed by the fork leg), no-op-when-absent, idempotent-when-already-
  migrated, no-op-when-boards-absent/non-array, end-to-end walk from v61.

## Gates (WITNESSED — actual tails)

`cd frontend && npm run build`:
```
> gogui@0.0.0 build
> vue-tsc -b && vite build

vite v8.2.0 building client environment for production...
✓ 1081 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.84 kB │ gzip:     0.51 kB
dist/assets/index-BENFIVgm.css    116.12 kB │ gzip:    16.55 kB
dist/assets/index-CdWvJ5L3.js   2,921.72 kB │ gzip: 1,032.64 kB
✓ built in 1.86s
```
(pre-existing chunk-size warning, unrelated to this change)

`npx eslint .`: no output, exit 0.

`npm run test:run`:
```
> gogui@0.0.0 test:run
> vitest run

 Test Files  83 passed | 3 skipped (86)
      Tests  1116 passed | 4 skipped (1120)
```
(the 3 skipped files / 4 skipped tests are pre-existing, unrelated to
this change)

## Not touched

Design §2 (metric-experimentation ergonomics / `PaletteEditor.vue` /
`AnalysisParametersExpander.vue`) — explicitly out of scope per the
commission.

License: Public Domain (The Unlicense)
