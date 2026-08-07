# KDE-recompute-on-range-change — independent review

Reviewer: fresh-context review agent, working from the spec
(`kde-recompute-diagnosis.md`), the diff, ADR-0021, `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md`, and my own command runs in the worktree
checkout at `.claude/worktrees/agent-a30ac81dd21a3f866` (branch
`worktree-agent-a30ac81dd21a3f866`, head `2255dc84`). I did not read the
builder's self-report (`kde-recompute-fix.md`) until after forming my
own conclusions from the diff and my own runs; I then diffed it against
what I'd observed (see "Fix report vs. observed" below).

## Scope / minimal-touch (WITNESSED)

`git show --stat 2255dc84` — the fix commit itself touches exactly three
files: `useAnalysisContext.ts`, the new integration test, and the
dispatch report. No drive-by edits.

The wider `git diff next...HEAD --stat` shows a much larger diff
(`package.json`, `package-lock.json`, `backend/requirements.txt`,
several dependabot bumps). This is **not** the fix agent's doing — see
the discrepancy section below; it's a consequence of `next...HEAD`
diffing against a stale merge-base, not scope creep in the fix commit.

`FILES.md`: no entry needed or added — the only new file is a test
file, and `frontend/CLAUDE.md`'s File-map discipline scopes to `src/`.
Correct call, confirmed by reading that section.

## Mapping soundness (WITNESSED, with one disclosed, non-blocking gap)

`colorMoveToPly` (`useTriangularHeatmap.ts:103-106`) is confirmed to be
the codebase's real, pre-existing (ColorMoveIndex, StoneColor)→PlyIndex
authority, already consumed by `MergedDeltaPanel`/`useChartNavigation`
for this identical series shape — not a function invented for this fix.
`mIdx` in `EnrichedSeries.data` comes straight from the KataGo packet's
`extra.{black,white}.deltas` keys (`enriched-accumulator.ts`), confirmed
colour-local, not array position, not ply — matching the fix's claim.

**Pass-containing games**: verified sound. `sgf-loader.ts` assigns
`node.move = {type:'pass', color, ...}` for a pass, which still
occupies its `variationPath`/ply slot, so `colorMoveToPly`'s
2m+1/2m+2 formula is unaffected. The new pass-game test
(`useAnalysisContext-range-recompute.test.ts:180-211`) exercises this
directly and passes.

**Handicap-start games**: `colorMoveToPly` hardcodes strict Black-first
alternation (`2m+1` for Black, `2m+2` for White). I confirmed via
`engine/util.ts`'s `getInitialStones` doc ("handicap stones in
`initialStones`, not `moves`... sending them in `moves` shifts
KataGo's turn-to-play") that a handicap game's *first actual move* can
legitimately be White, and `sgf-loader.ts` assigns `move.color` straight
from the SGF property with no alternation assumption — so
`colorMoveToPly` **is** unsound for that case (White's colour-local
index 0 would map to ply 2, not ply 1). This is exactly the risk named
in my brief and in the diagnosis.

This is **not a fix-introduced regression** — `colorMoveToPly` carried
this limitation before this fix, across its existing callers
(`MergedDeltaPanel`, `useChartNavigation`). More importantly, the fix's
own report (`kde-recompute-fix.md`, "The ply ↔ colour-local mapping"
section) **discloses this exact limitation explicitly and by name**,
argues it's a pre-existing, codebase-wide concern out of this fix's
minimal-touch scope (ADR-0004), and does not overclaim soundness it
hasn't verified. I consider this honest disclosure, not silent gap —
downgraded from a blocking finding to a nit. The new test suite has no
handicap-start case, which is a gap worth a follow-up ticket, but the
report doesn't pretend otherwise.

## Witness quality, ADR-0021 (WITNESSED)

Mentally-revert check performed for real, not just mentally: I swapped
`useAnalysisContext.ts` back to the pre-fix (`HEAD^`) version inside the
worktree via a scratch copy (restored immediately after, worktree left
clean — confirmed with `git status --porcelain`), and ran the new test
file against it:

```
Test Files  1 failed (1)
     Tests  3 failed (3)
```

All three failures are the right-reason failures — the assertions show
the full-series result bleeding into both selected ranges (e.g.
`expected [1,1,1,1] to deeply equal [1,1]`), i.e. the range read is
genuinely load-bearing for the test, not decorative. Green against the
actual fix (see gate run below). This satisfies ADR-0021: the witness
observes the reactive-subscription property itself (drives real
`setSelectionRange`, reads `.value` a second time on the same computed),
not a symptom.

The pass-game test is real, not decorative — it exercises the same
range-filter logic on a game whose SGF genuinely contains a `W[]` pass
node (verified: `path` length 11, `board.nodes[path[2]].move` asserted
as a pass) and would fail if pass-handling in `colorMoveToPly` were
wrong.

## Gates — run myself (WITNESSED)

```
npx vue-tsc -b        → clean, no output
npx eslint .           → clean, no output
npm run test:run       → Test Files  82 passed | 3 skipped (85)
                          Tests       1104 passed | 4 skipped (1108)
```

All three match the builder's self-report in `kde-recompute-fix.md`
exactly (mine were independent runs, not a copy of theirs).

## Test-count discrepancy (RESOLVED, exact accounting)

Builder self-reported 1104/4-skipped on the worktree; the main
checkout on `next` (95e85b0d) reports 1114/4-skipped, 82 files
passed/3 skipped in both cases (file totals equal — 85 either way).

I ran both suites myself:
- `next` (main checkout, `95e85b0d`): `82 passed | 3 skipped (85)` files,
  `1114 passed | 4 skipped (1118)` tests.
- Worktree (`2255dc84`): `82 passed | 3 skipped (85)` files,
  `1104 passed | 4 skipped (1108)` tests.

`git diff --name-status <merge-base 52b1df91> next -- frontend/tests`
shows exactly one file added on `next` since the worktree's merge-base:
`frontend/tests/integration/sync-session-version.test.ts` (397 lines,
absent from the worktree branch). Run in isolation on `next`:
`Tests 13 passed (13)`.

The worktree branch adds exactly one file `next` lacks:
`useAnalysisContext-range-recompute.test.ts`. Run in isolation:
`Tests 3 passed (3)`.

**13 − 3 = 10**, exactly the reported gap (1114 − 1104 = 10). No tests
were lost by this branch; the worktree simply forked from `next` before
`sync-session-version.test.ts` landed, and gained 3 of its own. I also
checked the coordinator's alternative hypothesis (vite-version-gated
test collection): the worktree's own `package.json`/lockfile actually
resolve `vite@8.2.0` (inherited from a dependabot merge already in its
ancestry before the fix commit), while the main checkout's `next` runs
`vite@8.0.8` — the *opposite* correlation the hypothesis would predict
if a newer vite were gating tests in — and the file-level accounting
above already closes the gap exactly with no remainder, so no
version-gating mechanism needs to be invoked.

Separately: the wider `next...HEAD` diff includes unrelated dependency
bumps (`echarts`, `vite`, `undici`, `postcss`, `pydantic-settings`) that
are reachable from the worktree branch and from two other
`worktree-agent-*` branches, but **not** from `origin/next` or local
`next` (`git show-ref` / `git branch --contains` confirm this). This
means the worktree was forked from a divergent lineage that had already
merged several dependabot PRs `next` itself does not currently contain
(next instead contains different perf work: tabstrip virtualization,
sync-service session versioning). This is a pre-existing property of
how the worktree was set up, not something the fix commit did — the fix
commit's own diff (`2255dc84` alone) touches only the 3 files listed
above.

## Fix report vs. observed (WITNESSED)

Checked `kde-recompute-fix.md`'s every claim against my own independent
runs: file list, gate outputs (vue-tsc/eslint/test:run counts), the
handicap-limitation disclosure, and the FILES.md non-entry rationale.
No discrepancy found — the report is accurate to what I observed
independently.

## Findings, ranked

1. **(Nit, non-blocking)** `colorMoveToPly` — and therefore this fix —
   is unsound for handicap-start games (White-first). Disclosed
   candidly in the fix report and reasoned as out-of-scope for a
   minimal-touch fix reusing a pre-existing, already-shared authority.
   Recommend a follow-up ticket to fix `colorMoveToPly` itself
   (codebase-wide, not local to this fix) rather than reopening this
   change.
2. **(Informational)** The worktree's base diverges from current `next`
   by a set of dependabot-only commits not reachable from `next`
   (pre-existing worktree setup artifact, not caused by the fix commit).
   Doesn't affect correctness of the fix; flagging so it doesn't
   surprise whoever merges.

Neither finding above is blocking.

## Verdict

**ACCEPT.**
