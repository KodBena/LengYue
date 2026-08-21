# Dispatch report — Learn Path tree-integrity fixes (commission ledger row 911)

Branch: `worktree-agent-a406c0cf5d874f45f`
Commit: `53a1e9a9`

## Worktree staleness disclosure

The worktree checkout (`/home/bork/w/omega/.claude/worktrees/agent-a406c0cf5d874f45f`)
was stale at session start: its HEAD (`3378806f`, "Merge pull request #444…
vite-8.0.16") was 223 commits behind `next`'s tip in the primary checkout
(`bd0c0bc8`, "docs: harvest learn-path-drives-engine review"). Fast-forwarded via
`git merge --ff-only bd0c0bc8` before reading any code — clean fast-forward,
no conflicts, no local changes lost (the only pre-existing local state was
an untracked `.claude/` directory, preserved). WITNESSED.

Read in full before diagnosing, per `frontend/CLAUDE.md`'s documentation
discipline: `CLAUDE.md` (umbrella), `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`src/composables/cards/useLearnPath.ts` (full header + body, 1090 lines),
`src/composables/cards/learn-path-progress.ts` (full).

## Commission — two witnessed defects, plus a MEDIUM finding in scope

1. Clicking explored variation nodes in the game tree does not navigate to them.
2. "VARIATIONS ARE ERADICATED" — the exploration deletes nodes from the tree
   instead of expanding it (the tree should end up dense: every explored
   position permanent and navigable, nothing ever removed).
3. (Also in scope, MEDIUM) `explore()` captured `rawKey` once at walk start
   while `analyzeActiveNode` derives fresh keys from live settings — a
   mid-walk model/settings change strands a wait on a stale key.

## Root cause — defect #2 (and, as a direct consequence, defect #1)

**Both witnessed defects share ONE root cause.** `writeLiveBoard` →
`updateBoardState` (`src/store/index.ts:666`) **replaces** a board's entire
`nodes` map on every write — never merges. `applyGoMove` builds its
returned `nodes` map as a spread of **its input state's own `nodes`** plus
one new child.

`walk()`'s per-node candidate loop (`useLearnPath.ts`, the `for (const
candidate of ranked)` block) computed every sibling candidate's
`applyGoMove` call from the SAME `state` parameter captured once at that
`walk()` invocation's entry — never updated as earlier siblings in the
same loop were written to the live board (including everything grown by
their own recursion). Concretely, with two candidates at a node (spine
rank 1, deviation rank 2):

1. Candidate 1 (spine) is applied, written live, and (if `shouldRecurse`)
   its ENTIRE subtree is grown recursively underneath it — potentially
   many nodes, all landing in the live board's `nodes` map.
2. Candidate 2 (deviation) is then computed via `applyGoMove(state, …)`
   using the SAME `state` from step 0 — whose `.nodes` snapshot predates
   everything grown in step 1. `writeLiveBoard` for candidate 2 therefore
   **overwrites the live board's entire `nodes` map with one that is
   missing candidate 1's whole subtree.**

This reproduces exactly at every level of the recursion (sibling-vs-sibling
at the SAME node, and parent-vs-uncle across levels), so a multi-candidate,
multi-level walk ends up deleting most of what it just grew — the deeper
the walk, the sparser the surviving tree, matching "nodes are DELETED...
instead of expanded."

**Defect #1 as a corollary.** `navigateTo`'s `getPath` helper
(`src/engine/navigator.ts`) does `nodes[curr].parent` with no existence
guard; a `NodeId` that TreeWidget rendered a moment ago but that a
subsequent sibling-overwrite has since deleted throws a `TypeError`
synchronously inside `handleNodeSelect` → `mutateBoard`'s callback — an
uncaught exception with no visible UI reaction, which reads exactly as
"clicking does not navigate." The tree-integrity test below exercises the
SAME production call path (`mutateBoard` + `navigateTo`, the composition
`App.vue`'s `handleNodeSelect` uses) on every surviving explored node and
confirms navigation now succeeds for all of them once the deletion is
fixed.

## Fix

`src/composables/cards/useLearnPath.ts`, `walk()`'s candidate loop: track a
mutable `parentState` (initialized to `state`), refreshed **after each
candidate settles** (its own write, plus any recursion into it) by
re-reading the live board's current `nodes` map (re-resolved by `BoardId`
per the existing board-identity-safety discipline — a missing board is
still treated as an abort, not a stale-nodes continuation). Only `nodes` is
refreshed; `stones`/`captures`/`turn`/`koPoint`/`currentNodeId` stay
`parentState`'s own throughout the loop, since every candidate in the loop
is an alternative move from the SAME parent position — never accumulating
a sibling's move. Every candidate's `applyGoMove` call now reads
`parentState` (the up-to-date accumulator) instead of the original,
increasingly-stale `state`.

## Fix — MEDIUM finding (stale `rawKey`)

`rawKey` is no longer captured once in `explore()`; it is re-derived
(`activeAnalysisKeys.value.rawKey`) at the top of every `walk()` step, so
a mid-walk model/palette/overrides change is picked up before the NEXT
`ledger.getRaw` read or `requestOnDemandAnalysis` call — the expected key
`waitForAnalysis` watches and the key the fired query will actually use
under LIVE settings can no longer drift apart mid-walk. `onDemandVisits`
(a deliberately once-per-walk value per the module header) was left
untouched — this fix is scoped to the key only, per the finding.

## Repro — WITNESSED red on current `next`, WITNESSED green after the fix

Both new tests were run against the reverted (pre-fix) source — restored
from `git show HEAD:frontend/src/composables/cards/useLearnPath.ts` into a
scratch copy, swapped in temporarily, tests run, then the fix restored —
never via `git stash` (banned this session).

- **Tree-integrity repro**
  (`tests/integration/useLearnPath.test.ts`, describe `"tree integrity
  (commission row 911, \"variations are eradicated\")"`): a board with one
  PRE-EXISTING user variation off root, then a depth-2/topK-2 walk into
  entirely fresh coordinates (so `applyGoMove`'s existing-child-reuse path
  — which the pre-existing acceptance fixture relies on and which masks
  this bug entirely — never fires). **RED on `next`**: only 3 of the
  expected 6 nodes survived (`root`, the user's pre-existing variation,
  and the LAST-processed root-level candidate; the entire first
  candidate's subtree — D4, C17, P9 — was gone). **GREEN after the fix**:
  all 6 nodes present, root has all 3 children, D4 has both its children,
  and every surviving node round-trips through `mutateBoard` +
  `navigateTo` (the same call path `App.vue`'s `handleNodeSelect` uses)
  without throwing, landing the cursor correctly. WITNESSED (both red and
  green terminal output captured during this session).
- **Stale-`rawKey` repro** (describe `"rawKey re-derived per query
  (fresh-context review MEDIUM)"`): a model change fired between two
  on-demand queries. **RED on `next`**: the test hit vitest's own 5s
  timeout waiting on the real `KATAGO_ANALYSIS_TIMEOUT_MS` (30s) —
  reproducing "silently rides the 30s timeout" exactly (the fake always
  records under the CURRENT live `rawKey` at fire time, like the real wire
  path would, so a stale expected key on the wait side never matches).
  **GREEN after the fix**: both queries settle deterministically via the
  microtask path, no timer needed. WITNESSED.

## Per-claim evidence status

- Root cause (defect #2, sibling-overwrite via `writeLiveBoard` replacing
  `nodes` from a stale `state` snapshot) — WITNESSED (red repro pinned the
  exact missing-node set predicted by the mechanism; green repro confirms
  the fix).
- Defect #1 (navigation) as a corollary of defect #2 — WITNESSED via the
  `mutateBoard`+`navigateTo` assertions in the tree-integrity test, run
  against the SAME production call path `App.vue` uses. Not separately
  re-witnessed against a case where nodes are NOT deleted but navigation
  still fails for some other reason — no such case was found during
  investigation (no capture-phase listener, modal-gating flag, or other
  guard was found blocking tree-node clicks; see "Investigation notes"
  below), so this report does not claim a second, independent defect #1
  mechanism exists.
- MEDIUM finding (stale `rawKey`) — WITNESSED (red repro via vitest
  timeout hitting the real 30s clock; green repro resolves without ever
  needing the timer).
- Ratified semantics preserved (spine never carded, deviations recursively
  descended, pending blue markers, batch-mint-only, real-time growth,
  on-demand engine analysis) — WITNESSED: the full pre-existing
  `useLearnPath.test.ts` suite (16 tests predating this session) passes
  unmodified in shape (only 2 new imports added: `mutateBoard`,
  `navigateTo`), and the fix touches only the candidate loop's `nodes`
  bookkeeping, not ranking, role assignment, recursion policy, marker
  registration, or the deferred-mint boundary.

## Investigation notes (defect #1, ruled out)

Before concluding defect #1 is a corollary of defect #2, checked the named
suspects per the commission:

- **LearnPathModal's open state/focus trap** — the modal backdrop is
  `position: fixed` full-viewport but only rendered `v-if="isOpen"`, and
  `close()` (footer button, backdrop `@mousedown.self`) is guarded against
  tearing down state mid-walk. No capture-phase listener; no lingering
  overlay found after close. Ruled out.
- **The walk's board-cursor ownership** — `writeLiveBoard` mutates via
  `updateBoardState` (whole-object replace), same mechanism `mutateBoard`
  itself competes with (`mutateBoard` mutates the reactive proxy IN
  PLACE — this asymmetry is exactly what makes the sibling-overwrite bug
  possible, but does not itself block a click from firing after the walk
  ends).
- **A guard in `useBoardMoveRouting` or tree click handling refusing
  navigation in learn-path mode** — read `useBoardMoveRouting.ts` in full;
  it gates board-mutation entry points on the REVIEW session state only,
  has no learn-path awareness at all. `TreeWidget`'s `select-node` emit →
  `App.vue`'s `handleNodeSelect` → `mutateBoard` + `navigateTo` has no
  learn-path-specific gate either. Ruled out as a SEPARATE mechanism; no
  guard of this shape was found.

## Constraints honored

- No scope reduction: ranking, spine/deviation roles, recursion depth,
  pre-mint markers, batch-mint-only, real-time growth, and on-demand
  analysis are all unchanged — verified by the pre-existing 16-test suite
  passing unmodified.
- No wall-clock sleeps introduced in tests (`microtaskYield` /
  `Promise.resolve()` throughout, as the existing suite already does).
- No `git stash` used; the red-repro-then-fix cycle used a scratch copy in
  the session scratchpad directory plus `git show HEAD:<path>` to obtain
  the pre-fix source temporarily.
- Live ports / live engines untouched — this is a pure unit/integration-test
  and source-file change; nothing in this session ran the dev server or
  touched 4173/5173/5174/8764/19080-19082.
- Minting semantics untouched — `confirmMint`, `buildSeedPayload`, and the
  existing-card dedup check were not modified.

## Gates

- `npx vue-tsc --noEmit` — exit 0, no output. WITNESSED.
- `npx vitest run` (full suite, memory-capped per session constraints:
  `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
  `VITEST_MAX_THREADS=2`, `VITEST_MAX_FORKS=2`) — 154 files passed, 3
  skipped (pre-existing, unrelated to this change); 1854 tests passed, 4
  skipped; 0 failed. WITNESSED.

## Deviations

None from the commissioned scope. `npm ci` was run once at session start
because the worktree had no `node_modules` — a setup step, not a scope
change (`package-lock.json` was not modified; no dependency versions
changed).

## Files touched

- `frontend/src/composables/cards/useLearnPath.ts` — the two production
  fixes (sibling-overwrite tree-integrity bug; stale-`rawKey` MEDIUM
  finding).
- `frontend/tests/integration/useLearnPath.test.ts` — two new `describe`
  blocks (tree-integrity repro; stale-`rawKey` repro), two new imports
  (`mutateBoard` from `../../src/store`, `navigateTo` from
  `../../src/engine/navigator`).
- `.claude/dispatch-reports/learn-path-tree-integrity.md` — this report.
