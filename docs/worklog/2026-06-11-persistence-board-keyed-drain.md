# Worklog — persistence-service board-keyed drain (2026-06-11)

> Work-status item `persistence-board-keyed-drain` (open/future,
> maintainer-signed for execution). Filed by the 2026-06-11 debt
> second-opinion review
> (`docs/notes/audit/audit-debt-second-opinion-2026-06-11.md` row 2;
> evidence in the appendix). Branch
> `bork/fix/persistence-board-keyed-drain`, PR #<filled on push>.
> Frontend sub-project.

## Context

`AnalysisPersistenceService` (`src/services/analysis-persistence-service.ts`)
holds three reactive Maps keyed on `BoardId`:

- `summaries` — the per-board server-side metadata the AnalysisControls UI
  renders ("Saved 2m ago, 142 analyses").
- `dirtyVersions` — a monotonic per-board counter the auto-save composable
  watches for rising-edge save triggers.
- `autoSaveErrors` — a per-board "auto-save paused on persistent error" slot.

`closeBoard`'s only persistence-service teardown was `discard(boardId)`, whose
local release cleared `this.summaries` only. The sibling Maps `dirtyVersions`
and `autoSaveErrors` had no per-board release verb that drained them, so they
survived board close until `forgetAll` at identity flip (`resetWorkspace`)
cleared all three.

**Failure shape (verbatim from the item):** a bounded leak — one `number` plus
one small POJO per board ever opened in a session — surviving until the next
`forgetAll`. No correctness or privacy issue: `BoardId` is UUID-fresh and never
reused, and the auto-save watcher is torn down at board close so a stranded
entry is never read. Because the leak is bounded and silent, and the test fake
mirrored the *missing* drain, no test caught it.

## Verb-shape decision (the work's first required choice)

The item names the fix as "a `forgetBoard(boardId)` draining all three, called
from closeBoard." Reading the service revealed `forgetBoard` **already existed**
but drained only `summaries` (its docstring: "the discard() above does both
halves; this method is for the rare case where only the cache release is wanted
… Currently no callers other than forgetAll(); kept narrow for symmetry with
the audit-ownership pattern"). So the choice was not "add a verb" but "which
shape leaves ONE obvious per-board release verb, not two near-synonyms."

Both call-site sets were read before deciding:

- `discard` callers: `closeBoard` (`store/index.ts`, fire-and-forget HTTP DELETE
  + local release) and `AnalysisControls.vue`'s "Discard saved bundle" button
  (via `useAnalysisPersistence`, user gesture on a still-open board). Both want
  the server-side DELETE.
- `forgetBoard` callers: none in production (only its own docstring referenced
  `forgetAll`).

`discard` (HTTP + release) and `forgetBoard` (release only) are genuinely
different operations — `discard` deletes the server row. So they are not
synonyms; the right shape is **`forgetBoard` is the per-board cache-release
primitive, `discard` subsumes it** (HTTP DELETE + `forgetBoard`). Chosen:

1. Extend `forgetBoard` to drain all three Maps. It becomes THE per-board
   release verb.
2. Point `discard`'s local release at `forgetBoard` instead of its inline
   `this.summaries.delete(boardId)`.

Because `closeBoard` already called `discard(boardId)`, the leak closes at the
existing call site with **no new call** in `closeBoard` — only its
resource-ownership comment updated to name the now-complete release and its
failure mode (no counts/censuses, per the comment convention).

## Out-of-frame hack audit and the two structural improvements it forced

Per the hack-rationalization-detector discipline (the change touches a slot with
multiple conceptual drain paths), an out-of-frame auditor reviewed the diff with
the justification as the object of suspicion. Verdict: **narrower-but-justified**
(not UNDISCHARGED-HACK — no general fix was argued down with a discipline-word;
the tells scanner found 0 co-occurrence tells in the justification). Two residual
findings were cheap and within reach, so they were taken rather than ledgered:

1. **Three hand-maintained drain lists → one source of truth.** The "these three
   Maps are the board-keyed set" fact lived independently in `forgetBoard`
   (3 deletes) and `forgetAll` (3 `.clear()`s). That is the exact drift class
   that produced this item — `forgetBoard` had drifted to one Map while
   `forgetAll` drained three. The fix restored symmetry by hand but reinstated
   nothing keeping them symmetric. **Taken:** `forgetAll` is now *defined as*
   `forgetBoard` over the union of all three Maps' keys, so the three-Map set is
   named in exactly one place (`forgetBoard`); a future fourth board-keyed Map
   added there is drained by `forgetAll` for free. The fake mirrors the same
   derivation (`forgetAllImpl` iterates `forgetBoardImpl`).

2. **No pin guarantees the fake's DRAIN matches production's drain.** The
   storage-error seam had a dedicated fidelity pin; the drain seam had none, so
   the closeBoard-cleanup tests asserted only that the *fake* drains three Maps
   (hand-shaped to pass) — the precise "tests pass because the fake was shaped to
   pass, not because production behaves that way" class this item and the
   `autosave-pause-unreachable` defect are instances of. **Taken:** a drain-
   fidelity pin in `analysis-persistence-fake-fidelity.test.ts` drives the REAL
   service's `discard` / `forgetBoard` and asserts all three Maps drain (observed
   through the public accessors), with a paired assertion that the fake
   reproduces the same observable post-state from the same inputs.

The auditor also flagged a third, lower item: `discard` has a non-closeBoard
caller — `AnalysisControls.vue`'s "Discard saved bundle" button on a *still-open*
board. Before this change that path cleared only `summaries[boardId]`; now it
also clears `dirtyVersions[boardId]` and `autoSaveErrors[boardId]` for a board
that stays open. Traced through `useAutoSaveAnalyses`: the effect is benign-to-
correct — deleting the dirty counter re-syncs the policy's `lastScheduledVersion`
to 0 on the next observation with no spurious save (the composable's local
`lastScheduledVersion` map still holds the prior value, so `currentVersion (0)
<= seenVersion` short-circuits), and clearing the error un-pauses auto-save for a
bundle the user just deleted. The drain-fidelity test's `real discard() drains
all three` case exercises discard on a board that is never closed — i.e. it
pins exactly this still-open-board path, so the broadening is recorded rather
than latent.

## Files touched

- `src/services/analysis-persistence-service.ts` — `forgetBoard` drains all
  three Maps; `discard` delegates its local release to `forgetBoard`;
  `forgetAll` derived from `forgetBoard` over the keyset; docstrings updated.
- `src/store/index.ts` — `closeBoard` comment updated to name the now-complete
  release and its failure mode (no new call site).
- `tests/fakes/analysis-persistence-service.ts` — fake mirrors all three Maps,
  `discard`/`forgetBoard` drain via a shared `forgetBoardImpl`, `forgetAll`
  derived via `forgetAllImpl`, `summaryFor` reads a reactive summaries map
  (was a `vi.fn` returning `null`), `seedFakeSummary` test seam added.
- `tests/integration/store-mutators.test.ts` — new describe block: closeBoard
  drains all three for the closed board, leaves other boards intact,
  resetWorkspace/forgetAll behavior unchanged.
- `tests/integration/analysis-persistence-fake-fidelity.test.ts` — new describe
  block: the drain-fidelity pin (real service drains all three; fake matches).
- `frontend/docs/notes/board-scope.md` — teardown inventory row + dated note for
  the persistence-service board-keyed Maps; relationship to the parked
  `closeboard-class-b-teardown-shape` item stated.

## Boundary with `closeboard-class-b-teardown-shape` (parked, out of scope)

This fix is **shape-invariant** across that parked maintainer decision's
candidate teardown architectures: the per-board release verb is needed under all
of them; only its call site would move (today: `discard` at `closeBoard`). The
parked decision was not engaged, redesigned, or pre-empted. The board-scope note
states the relationship explicitly.

## Gates

- `npm run build` (`vue-tsc -b && vite build`) — pass (pre-existing chunk-size
  advisory only).
- `npx eslint .` — pass (exit 0).
- `npm run test:run` — pass (984 passed | 4 skipped).

## Deferrals

None. The two structural improvements the audit surfaced were taken in this PR
rather than deferred; the third (still-open-board discard broadening) was traced
benign-to-correct and is pinned by the drain-fidelity test.

License: Public Domain (The Unlicense).
