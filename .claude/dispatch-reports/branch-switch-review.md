# Branch-switch semantics — review (2026-08-06)

Target: worktree-agent-a370f2e60c6a75a16 @ 78529327. Diff: `frontend/src/engine/navigator.ts`, `frontend/src/types/game.ts`, `frontend/tests/unit/engine/navigator.test.ts` (3 files, +329/-65, no new files).

## Findings (all WITNESSED)

1. **Write-through choke point**: `navigateTo` is the sole `state.currentNodeId =` assignment site in `frontend/src` (grep-verified); write-through loop iterates `targetPath` (root→target, already computed for replay) after the assignment. All 14 call sites of `navigateTo` (App.vue, ReviewSessionPanel, useReviewSession, useSgfLoader, loadIntoBoard, useNavigation, chart nav, etc.) route through it — no residual path bypasses the write. Confirmed no bypass.
2. **Ancestor-fork coverage**: the loop writes `lastVisitedDescendant = targetNodeId` on *every* node in root→target, not just the nearest fork — so all forks above a deep move get updated, exceeding rather than merely meeting the spec.
3. **Persistence/SGF**: `CURRENT_SCHEMA_VERSION` stays 63 (correct — field is optional, undefined-safe on old blobs). `sgf-writer.ts` only serializes `node.properties` (the SGF property map), never iterates `GameNode` fields directly — `lastVisitedDescendant` cannot leak into export. Verified by reading the writer.
4. **Backward-compat claim**: inspected all pre-existing toggle/variation tests — every fixture toggles/varies only at a branch's immediate child (never deeper before switching), so "restore last-visited" degenerates to "land on immediate child" for them; they pass for the right reason, not because vetoed behavior survived.
5. **Fallback loudness**: `console.warn` on pruned-memory fallback matches ADR-0002 rung 4 ("this shouldn't happen, but the run can continue") — correct tier, not rung 5 silent-fallback (never-visited branches, the common case, get no warning, correctly).
6. **Gates, own run**: `npx eslint .` clean; `npm run build` clean (1.72s); `npm run test:run` → 102 passed/3 skipped files, 1306 passed/4 skipped tests — matches build report. `navigator.test.ts` alone: 33/33 pass.
7. **Merge**: `git merge-tree HEAD next` → 0 conflict markers against current `next` (7de45fcb, includes card-hash + cold-load-gate work). Clean.

No residuals found on any of the six spec clauses; no defects.

## Verdict: ACCEPT
