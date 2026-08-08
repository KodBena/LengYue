# Review — Learn Path tree-integrity fix (commission ledger row 911)

Fresh-context, REFUTE-posture review. Artifact: branch
`worktree-agent-a406c0cf5d874f45f`, fix commit `53a1e9a9` (HEAD `84964328`),
built in `/home/bork/w/omega/.claude/worktrees/agent-a406c0cf5d874f45f`
(read from, never written to). Findings below were formed by independent
code trace + independent witness runs, BEFORE reading the builder's own
report (`.claude/dispatch-reports/learn-path-tree-integrity.md`), which was
read only afterward for comparison.

## Verdict: ACCEPT

## Merge and setup

Fetched the target branch directly from the read-only worktree's local ref
(`git fetch <path> worktree-agent-a406c0cf5d874f45f:refs/heads/scratch-review-a406`,
since it isn't pushed to `origin`) into a scratch worktree
(`/tmp/.../scratchpad/review-merge`) based on `origin/next` tip (`95e85b0d`).
`git merge --no-edit scratch-review-a406` fast-forwarded cleanly — no
conflicts, no merge commit needed (the branch was already rebased/merged
onto current `next`). No `git stash` used anywhere in this session; two
throwaway mutation copies were made with `cp -r` into the scratchpad for
the falsification runs, never touching the artifact or the shared tree.

## Witnesses run (memory-capped: `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
`VITEST_MAX_THREADS=2`, `VITEST_MAX_FORKS=2`)

- `npx vue-tsc --noEmit` on the merged result — **exit 0, no output. WITNESSED.**
- `npx vitest run --silent=true` (full suite) on the merged result —
  **154 files passed / 3 skipped (157); 1854 tests passed / 4 skipped
  (1858); 0 failed. WITNESSED.** Includes `tests/integration/render-count/
  TreeWidget.render-count.test.ts` and `TreeWidget-pass-node.test.ts`
  (render-count guards) among the passing files.
- `npx eslint src/composables/cards/useLearnPath.ts` — 0 errors. WITNESSED.
- Mutation-falsification #1 (defect (a), sibling-overwrite): in a scratch
  copy, removed the end-of-loop `parentState` refresh block (the `if
  (aborted) break; const liveBoard = …; parentState = { …, nodes:
  liveBoard.nodes };` tail). Result: `useLearnPath.test.ts`'s tree-integrity
  test ("grows a dense tree…") **goes red** — `findChildByMove` throws
  looking for D4, because only 3 of the 6 expected nodes survive (root, the
  user's pre-existing variation, and the last-processed root candidate) —
  the exact deletion shape the fix commit's own message describes.
  **WITNESSED.**
- Mutation-falsification #2 (MEDIUM, stale `rawKey`): in a second scratch
  copy, reverted `rawKey` to a single capture at `explore()`'s top (before
  the loop) instead of the per-step re-derivation inside `walk()`. Result:
  the "rawKey re-derived per query" test **goes red** — times out at
  vitest's 5s cap waiting on the (unfaked) real `KATAGO_ANALYSIS_TIMEOUT_MS`
  clock, reproducing "silently rides the 30s timeout" exactly.
  **WITNESSED.**

## Independent code trace (formed before reading the builder's report)

Traced `writeLiveBoard` → `updateBoardState` (`src/store/index.ts:666`):
confirmed it is a **whole-object replace** (`store.boards[index] =
newState`), never a merge. Traced `applyGoMove` (`src/logic.ts:252`):
confirmed it builds its returned `nodes` as a spread of **its input
state's own `nodes`** plus (at most) one new/reused child, and that its
existing-child-reuse branch reads `state.nodes[state.currentNodeId]`
(i.e., whatever `nodes` map the caller passed) for the children array —
so a stale `nodes` map both drops prior siblings' subtrees on write AND
can silently miscompute the reuse-vs-mint branch against a stale children
list.

Confirmed root cause (a) independently: before the fix, `walk()`'s
candidate loop called `applyGoMove(state, …)` for every sibling using the
SAME `state` captured once at the enclosing `walk()` invocation's entry.
Candidate 2's `applyGoMove` spreads from `state.nodes`, which predates
candidate 1's write (and everything candidate 1's own recursion grew) —
`writeLiveBoard`'s whole-map replace for candidate 2 then overwrites the
live board with a map missing candidate 1's subtree. This reproduces at
every level and cascades with depth, matching "the tree should end up
dense... instead nodes are deleted."

The fix (`useLearnPath.ts`, `walk()`) introduces `let parentState = state`
before the loop and refreshes `parentState.nodes` (re-resolved by
`BoardId`, treating a missing board as abort — consistent with the
existing board-identity-safety discipline documented in the module header)
at the end of every iteration, after that candidate's write and any
recursion into it has settled. Traced every `state`-vs-`parentState`
reference inside the loop: `applyGoMove(parentState, …)`,
`move.color: parentState.turn` — both correctly switched;
`stones`/`captures`/`turn`/`koPoint`/`currentNodeId` are deliberately left
un-refreshed (correct: every candidate in the loop is an alternative move
from the SAME parent position, not an accumulation of a sibling's move —
refreshing those fields would corrupt the position each candidate is
evaluated against). No stale `state` reference survives inside the loop
after the refresh was introduced — confirmed by full read, not just diff
inspection.

Confirmed corollary (b) independently: `getPath` (`src/engine/
navigator.ts:22`) does `nodes[curr].parent` with no existence guard —
a `NodeId` no longer in the board's `nodes` map throws a `TypeError`
synchronously. `navigateTo` calls it twice; `App.vue`'s `handleNodeSelect`
(`mutateBoard(id, draft => navigateTo(draft, nodeId))`) has no try/catch
around this, so the throw propagates. Checked where it lands: Vue's
`onErrorCaptured` in `RootErrorBoundary.vue` catches it, logs via
`console.error`, pushes a system message (`pushSystemMessage('error', …)`),
and renders a full-screen "something broke, reload" overlay — this is
already a **loud** failure path (ADR-0002), just a maximally disruptive
one for what should be a single bad click. The fix does not add any new
handling to `navigateTo`/`handleNodeSelect`; it relies entirely on
eliminating the trigger (dropped nodes) via fixing (a). Since (a)'s fix
means the walk no longer deletes any `NodeId` it ever wrote, `getPath`
can no longer throw *for this reason*. This is a legitimate "fix the
corollary by fixing the cause" — confirmed no other code path in this
diff or nearby (`useBoardMoveRouting.ts`, `LearnPathModal.vue`) was found
gating or swallowing tree-node clicks, matching the builder's own
"investigation notes, ruled out" section (independently re-checked by
reading those files, not just trusting the claim).

## ADR assessment

**ADR-0000 (class vs. patch).** The fix restructures state-threading
inside `walk()`'s loop (rename `state`→`parentState` as a per-iteration
accumulator, refresh after every write) rather than bolting an `if`-guard
onto the existing stale read. Checked whether "compute-from-stale-snapshot
then whole-map write" is reachable anywhere else: grepped every
`applyGoMove(` call site in `src/` — `useReviewSession.ts`,
`usePlayFromPosition.ts`, `useBoardMoveRouting.ts`, `useEngineResponder.ts`,
`setup-wizard-demo-loader.ts` — all are single-move call sites, none loop
over sibling candidates from one captured parent state across `await`
boundaries. `walk()`'s candidate loop is the **only** site in the
codebase with this shape. Given that, the fix is a genuine restructure
that forecloses the class everywhere the class can currently occur — not
merely a guard on one symptom — though it does not extract a reusable
"accumulate-then-write" primitive other composables could reuse (none
currently need one).

**ADR-0002 (fail loudly).** `navigateTo`'s failure path was, and remains,
an uncaught throw that surfaces via the pre-existing global
`RootErrorBoundary` — genuinely loud (console + system message + a
blocking overlay), not silently swallowed anywhere in the chain. The fix
doesn't add new loudness to that path; it removes the trigger. Given the
existing infrastructure already satisfies "loud," this is acceptable —
but it is worth naming plainly (as the review brief asked): this is "no
longer reachable" for the walk's own bug, not "now instrumented better if
it recurs from a different cause." Any future code path that drops a
`NodeId` the tree still renders will hit the same disruptive full-page
overlay, unchanged by this fix. NIT, not a blocker.

**ADR-0012 (compositional hygiene).** The fix composes with
`writeLiveBoard`/`updateBoardState`'s documented whole-map-replace
semantics rather than fighting them: it does not attempt a merge-write
primitive (which would diverge from every other call site's contract);
instead it ensures the value being replaced is always built by spreading
from the **freshest available** `nodes` immediately before that specific
write. Read-latest-then-replace-whole is the correct adaptation to a
replace-only primitive, not a workaround.

**ADR-0013 / durable-843 (no silent de-scoping).** Diffed the fix commit
for new scope-restriction language (`scope`, `restrict`, `out of`, `not
built`, `v1 only`, `deferred`, `de-scop`) — none found. The change is a
pure bug fix; ranking, spine/deviation roles, recursion policy, pre-mint
markers, batch-mint-only, and on-demand analysis are all untouched
(confirmed by reading the whole file, not just the diff hunks) and the
full pre-existing 16-test suite in `useLearnPath.test.ts` passes
unmodified in shape.

**`frontend/CLAUDE.md` / `tests/CLAUDE.md`.** Both read in full. New tests
use `microtaskYield`/`Promise.resolve()`, never a wall-clock delay (the
standing no-fixed-delay rule). Fakes are wired through the existing
`vi.mock` + `tests/fakes/` pattern already established in the file; no
new fake surface added beyond what's already there. No SFC/component
touched by this diff, so ADR-0007's 250-line SFC cap doesn't apply;
`useLearnPath.ts` (now 1141 lines) is a composable, which this doc does
not cap numerically — noted, not flagged, since it predates this diff and
the diff's net addition (57 lines, mostly explanatory comments) isn't
what pushed it past any stated threshold.

## Probes into the class edges (all WITNESSED, via the full-suite run)

- **Deep recursion with interleaved sibling writes**: the new
  tree-integrity test is exactly this shape — depth 2, topK 2, root's
  spine (D4) recurses a full extra level (C17 spine, P9 deviation) before
  root's second candidate (Q16) is processed. Passes; mutation-falsified
  red as above.
- **Cancellation mid-recursion**: pre-existing test "closing the ANCHOR
  board mid-walk aborts cleanly without resurrecting it" (board-identity
  safety describe block) passes on the merged result — confirms no
  partial eradication path was reopened by this diff.
- **Pre-existing user variation surviving a full walk over the same
  region**: directly asserted in the new tree-integrity test (`K10` played
  before `explore()` runs, asserted present and navigable afterward).
  Passes.

## Per-claim status

- (a) stale-snapshot sibling-overwrite root cause and fix — **WITNESSED**
  (independent trace + independent mutation-falsification).
- (b) `navigateTo`/`getPath` uncaught-throw corollary and its resolution
  as a downstream effect of (a) — **WITNESSED** (independent trace of the
  call chain and its landing in `RootErrorBoundary`; the new test's
  `mutateBoard`+`navigateTo` assertions pass on the merged result and go
  red under mutation #1).
- (c) MEDIUM `rawKey` re-derivation — **WITNESSED** (independent trace +
  independent mutation-falsification).
- Ratified semantics (spine never carded, pending markers, no minting
  during walk, deferred batch mint) unchanged — **WITNESSED** (full
  16-preexisting-test suite passes unmodified in shape; full 1854-test
  suite green).
- UNEXERCISED: nothing. Every claim in the commission and the root-cause
  writeup had a corresponding witness run in this review.

## Scope restrictions

None found, introduced, or extracted by this fix. No `.claude/led`
ledger access was available/used in this review (fresh-context review
scope, per the dispatch); nothing in the diff itself narrows the
commission.

## Resources used

None beyond the standard toolchain (`git`, `vue-tsc`, `vitest`, `eslint`).
`node_modules` for the scratch merge worktree was symlinked from the
existing base checkout's install (`/home/bork/w/omega/frontend/
node_modules`) rather than reinstalled, to stay within the session's time
budget; `package-lock.json` diff between the two trees was checked first
(one unrelated `@tauri-apps/api` dependency present in the base checkout
but not on this branch — irrelevant to `useLearnPath.ts`/the test file
and to every witness run performed).

## Note on an unrelated mid-review report

Mid-review the user pasted a Vite HMR overlay error
(`Failed to resolve import "@tauri-apps/api/core"` from
`useProxyUpstreamSetting.ts`) from what appears to be a live dev server
against the base checkout, then immediately said "wrong prompt." Confirmed
`useProxyUpstreamSetting.ts` does not exist anywhere in the merged
artifact under review, and this fix commit touches no dependency, no
Tauri code, and no dev-server config — so even if it had been in scope,
it is unrelated to this review's artifact. Not investigated further
per the user's own retraction, and no live port was touched by this
review session in any case.
