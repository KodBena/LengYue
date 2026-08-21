# Branch-switch semantics — build report (2026-08-06)

Fixes the maintainer veto on `navigateToggleMainLine`: a branch switch
must restore the actual last node the cursor occupied in the target
branch, must fire from anywhere in the current line (not only from a
fork's immediate child), and toggle/next/prev-variation must share
exactly the same restore behavior through one shared primitive.

## Files touched

- `frontend/src/types/game.ts` — `GameNode.lastVisitedDescendant?: NodeId`
- `frontend/src/engine/navigator.ts` — write-through + shared primitives
  + rewritten `navigateVariation` / `navigateToggleMainLine`
- `frontend/tests/unit/engine/navigator.test.ts` — new
  `describe('branch-switch semantics — restore the actual last node …')`

## The one-home decision (ADR-0012 P1) + rejected alternative

**Chosen:** `lastVisitedDescendant?: NodeId` on `GameNode` itself,
optional, omitted at construction (mirrors `delta?`). For a node that
is a fork's child (a branch root), this is the last node the cursor
actually stood on within its own subtree — inclusive of itself.

**Rejected: a per-board `Map<NodeId, NodeId>` (branch head -> last
node), analogous to `useNavigation.ts`'s existing `mainLineToggleMemory`.**
Rejected because (a) it would need its own lifetime/cleanup wiring
(closeBoard teardown, workspace-reset teardown — the exact ceremony
`mainLineToggleMemory` already carries) for a fact that is naturally
per-node and already persists with the node; (b) it would need a
separate persistence decision (module-scope Maps don't survive
reload) whereas a `GameNode` field rides the board's existing
save/hydrate path for free; (c) `activeChildIndex` — the sibling fact
this one complements — already lives on `GameNode`, so co-locating
keeps "which child" and "how deep" in one place instead of splitting
a single navigational concept across two storage mechanisms.

**Persistence:** survives reload. The field is optional and undefined
on any node predating this change or never visited, which is exactly
the correct "never visited, fall back to head" reading — so **no
schema migration was needed**; `CURRENT_SCHEMA_VERSION` stays at 63.

**Validity invariant, foreclosed at both write and read:**
- *Write*: `navigateTo` sets `lastVisitedDescendant = targetNodeId` on
  every node in the already-computed root→target path (reusing
  `targetPath`, no extra walk) — by construction every write is a
  node genuinely inside its own subtree.
- *Read*: `resolveBranchTarget` re-validates before trusting a
  remembered id — checks it still exists in `state.nodes` and is
  still a descendant of the branch head via `isWithinSubtree` — and
  falls back loudly (`console.warn` naming the fork and the dangling
  id) to the branch head otherwise. No mutation site in this codebase
  currently deletes/prunes nodes, so the read-side check is the sole
  enforcement today; it's the correct foreclosure point regardless
  (defends future pruning too).

## Fork-selection rule

The nearest ancestor fork of the cursor — self, then walking `parent`
— extracted into `findNearestFork` and shared by both
`navigateVariation` and `navigateToggleMainLine`. This was already
`navigateToggleMainLine`'s established convention (2026-08-06 review
fix for the cursor-on-fork case); `navigateVariation` is generalized
to the same convention rather than inventing a second one — this is
what "switch from anywhere" required.

## Single shared primitive

`switchToBranch(state, fork, targetIdx)` → resolves the target child's
remembered node via `resolveBranchTarget`, then `navigateTo`s there.
Both primitives compute `fork` + `targetIdx` by their own selection
rule (toggle: two-value memory with wrap-on-first-use, unchanged from
before; variation: `activeChildIndex ± direction`, clamped — the
pre-existing convention) and then call the same `switchToBranch`, so
the restore behavior cannot drift between them. `mainLineToggleMemory`
(the toggle's own "came from" history) is untouched by
`navigateVariation` — it's a distinct, toggle-specific fact from
`lastVisitedDescendant`, which every navigation writes through
regardless of which primitive moved the cursor.

## Tests (red-then-green, ADR-0021)

All in `tests/unit/engine/navigator.test.ts`, new
`describe('branch-switch semantics …')`:

1. `(1) navigating deep into branch A, switching away from mid-line …`
2. `(2) a never-visited branch defaults to its own head node`
3. `(3) a pruned remembered node falls back loudly to the branch head …`
4. `$name restores the exact last-visited node when switching back into
   a branch` — `it.each` over `toggle`, `next-then-prev-variation`,
   `prev-then-next-variation`
5. `(5) navigateVariation switches from an arbitrary depth …`

Pre-existing toggle/variation tests were kept unmodified — all still
pass unchanged (the fallback-to-head behavior for never-visited
branches is byte-identical to the old always-immediate-child
behavior for every fixture those tests use), so nothing needed
deletion.

## Gate tails

- `npm run build` → `vue-tsc -b && vite build` — clean, built in 1.89s.
- `npx eslint .` — clean, no output.
- `npm run test:run` — `Test Files 102 passed | 3 skipped (105)`,
  `Tests 1306 passed | 4 skipped (1310)`.

No FILES.md/IDENTIFIERS.md rows: no new module, no new branded
identifier type (`lastVisitedDescendant` is a plain `NodeId` field).
