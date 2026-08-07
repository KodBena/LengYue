# Fresh-context review: branch-stem analysis-range memory (f070e4fb)

WITNESSED. All findings below are directly observed by me, not the
builder's self-report; the builder's own report tail matches what I
independently reproduced.

## Diff vs ratified spec (§1 Candidate C, uncapped, migration)

- `deriveBranchRangeKey` (`frontend/src/composables/analysis/branch-range-key.ts`)
  matches Candidate C exactly: only nodes with `children.length > 1`
  contribute, as `${decisionNodeId}:${chosenChildId}`; single-child
  nodes contribute nothing. Sole factory, brand doc names its one
  dependency leg (`decisionSequence`, tree-positional/B2).
- Uncapped map is documented as commissioner-deliberate (ledger rows
  112/119) directly at `BoardState.analysisRanges`'s declaration site
  in `frontend/src/types/game.ts`, including the orphan-on-prune
  tradeoff — no LRU code exists anywhere in the diff.
- Migration 61→62 carries the legacy value under the board's CURRENT
  branch key, computed by an inlined (frozen-body) walk that mirrors
  `deriveBranchRangeKey` exactly; idempotent, no-op on absent/malformed
  input. Same commit archives 59→60 into `archived-migrations.ts`
  (header timestamp bumped 06-12→08-06), leaving exactly two live
  migrations (60→61, 61→62) — cadence followed precisely.
- `FILES.md`/`IDENTIFIERS.md` rows present and correct (`[B2]`
  tree-positional, correct factory/lifetime/cardinality prose).
- Section 2 (metric-experimentation ergonomics) is untouched — no
  `PaletteEditor.vue`, `AnalysisControls.vue`, or new expander files
  anywhere in the diff.

## Composition with current next (KDE range-slice fix, 4d87bd85)

Built a disposable `review-compose` branch in the worktree, merged
current `next` on top of the agent's branch. Clean auto-merge (only
`FILES.md` needed the merge driver; no textual conflicts). `useAnalysisContext.ts`'s
`deltaKdeSeries`/`mistakeGapHistogramSeries` read `projection.selectionRange`
unchanged — `useAnalysisTimeline`'s public `selectionRange`
`ComputedRef` interface is untouched by the branch-keying change, so the
KDE fix composes transparently: switching branches now correctly
re-slices via the same `selectionRange` the KDE fix already reacts to.

Gates on the composed tree (WITNESSED, run by me):
- `npm run build`: exit 0, clean.
- `npx eslint src`: exit 0, no output.
- `npm run test:run`: **1135 passed, 4 skipped (86 files)**, exit 0.

Gates on the agent's own branch alone: build/eslint/test:run all also
clean (reproduced independently, matches builder's report of 1116/1120
pre-KDE-merge).

## ADR-0021 witness check

Reverted the keying in a scratch edit (`branchKey` forced constant) and
reran `useAnalysisTimeline-branch-range-memory.test.ts`: the
branch-switch test goes **red for the right reason** —
`AssertionError: expected [1,3] to deeply equal [0,4]` (branch B
incorrectly inherits A's clamped range). Restored the file (diff clean
afterward, confirmed via `git diff --stat`). Migration test asserts the
carried value lands under the specific fork key `'fork:right'`, not a
generic key. Cursor-movement stability is asserted via deterministic
repeated calls in `branch-range-key.test.ts`, and the mainline-extension
regression guard is a separate, passing test.

## Verdict: ACCEPT

No nits worth blocking on. Recommended merge action: the plain branch
merge (`next` → this branch → `next`) suffices — my composed throwaway
merge produced no conflicts and no divergent gate results, so the
orchestrator does not need to reproduce it as a separate artifact.
