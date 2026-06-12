# Worklog — engine-move delta consumer residue (2026-06-12)

> Audit trail for work-status item `engine-move-delta-consumer-residue`;
> branch `bork/refactor/engine-move-delta-reconcile`. Closes the three
> residue items recorded by the hack-rationalization audit on PR #422
> (`not-filed:extract-engine-move-delta-reconcile-helper`,
> `not-filed:engine-move-merge-existing-child-fail-loud`,
> `not-filed:engine-move-existing-child-reuse-test-coverage`). That audit
> declared them deferred because fixing them required touching the shipped
> match consumer (`usePlayMatch.start`), out of scope for a twin fix
> (ADR-0004). This arc is scoped to that crossing.

## Background

PR #422 (`fix(frontend): close playEngineMoves cursor-conflation twin`)
fixed the cursor-aliasing bug in `usePlayFromPosition.start` by applying
the match's delta-emission contract to `playEngineMoves`. Its
out-of-frame hack-rationalization audit returned VERDICT: general, and
surfaced four findings beyond the verdict. Three were structural and
inherited from the already-shipped match twin:

1. **Duplicated consumer body** — the two `onMoveApplied` bodies
   (`usePlayMatch.start`, `usePlayFromPosition.start`) were ~35 lines
   of verbatim-duplicated merge-and-gate logic, differing only in the
   composable-name label used in error messages. Nothing prevented the
   two from silently diverging on the next edit to one.

2. **Silent swallow on existing-child-reuse** — the
   `if (childIdx !== -1) { … }` branch had no `else`, so a
   `newNode === null` delta with `newPointer` absent from
   `parent.children` would silently do nothing. Contradicts the file's
   surrounding ADR-0002 fail-loud posture.

3. **No test for the existing-child-reuse path** — the
   `isNewNode`/`activeChildIndex`-bump branch was verified only by
   reading; no test drove a board through the `newNode === null`
   discriminator path.

The fourth finding (per-call O(tree-size) clone) was flagged as a
known characteristic, not a defect — no action taken then or now.

## Step 1: byte-identity evidence

Before writing any code, the two consumer bodies were extracted verbatim
and diffed. After normalizing the composable-name label strings
(`usePlayMatch` → `LABEL`, `usePlayFromPosition` → `LABEL`) and aligning
the context-dependent string `mid-match` → `mid-run` and
`match's variation` → `loop's variation`, the diff produced only
**comment-reflowing** (different line-break positions in the two inline
comment blocks — identical logical content, different column wrap). No
semantic differences. This confirms byte-identity beyond trivial
identifier naming and satisfies the commission's pre-condition for
extraction.

Diff (normalized):

```
15,18c15,17
<               // Use `parent.children.length` (the index of the
<               // new entry) as the active-child index, which
<               // matches `applyGoMove`'s convention for fresh
<               // nodes.
---
>               // Use `parent.children.length` (the index of the new
>               // entry) as the active-child index, which matches
>               // `applyGoMove`'s convention for fresh nodes.
26,29c25,28
<               // Existing-child reuse: just bump activeChildIndex
<               // so subsequent active-variation walks descend into
<               // the loop's variation rather than whatever the
<               // user had selected.
---
>               // Existing-child reuse: just bump activeChildIndex so
>               // subsequent active-variation walks descend into the
>               // loop's variation rather than whatever the user had
>               // selected.
```

## Step 2: shared helper extraction

New file:
`frontend/src/composables/board/engine-move-delta-reconcile.ts` ([B3]).

**Helper:** `reconcileEngineMoveDelta(boardId, delta, label)` —
takes a `BoardId`, an `EngineDelta` (the structurally-compatible
union of `EngineMoveApplied` | `MatchMoveApplied`), and a caller
label string for error messages.

**Placement rationale:** the helper calls `store`, `mutateBoard`, and
`navigateTo` — all Go/game-tree-specific dependencies. It belongs in
`src/composables/board/` (the board-surface composables directory,
`[B3]`), alongside the two consumers it serves. A module-scope utility
in the same directory is the natural shape for a shared building-block
that is neither a composable itself nor a store primitive.

**Both consumers call the helper:**

- `usePlayMatch.start` → `onMoveApplied: (delta) => reconcileEngineMoveDelta(boardId, delta, 'usePlayMatch')`
- `usePlayFromPosition.start` → `onMoveApplied: (delta) => reconcileEngineMoveDelta(boardId, delta, 'usePlayFromPosition')`

The unused `mutateBoard` and `navigateTo` imports were removed from
`usePlayFromPosition.ts`; `store` is still used for
`store.boards.findIndex` and `store.boards[idx]` in both composables.

## Step 3: fail-loud else (ADR-0002)

The `if (childIdx !== -1) { … }` branch in the helper now has an
explicit `else` that throws a structured error:

```
throw new Error(
  `${label}: existing-child reuse signalled (newNode===null) but newPointer ` +
  `${newPointer} not found in parent ${previousPointer}'s children on board ` +
  `${boardId} — delta is internally inconsistent`,
);
```

The throw is unreachable under normal operation — `applyGoMove` only
returns in-tree pointers, so `newNode === null` always implies
`newPointer ∈ parent.children`. The explicit throw surfaces any future
breakage (a future `applyGoMove` variant, a synthetic test fixture with
bad data, an upstream caller misusing the helper) loudly at the
violation site rather than letting the board silently diverge (ADR-0002
Rule 1). The helper's JSDoc documents the branch and the unreachability
reasoning.

## Step 4: existing-child-reuse test coverage

New test file:
`frontend/tests/integration/engine-move-delta-reconcile.test.ts` (tier 3).

Tests the shared helper directly (rather than through the composable
wrappers) so the existing-child-reuse fixture can be constructed
precisely without a WS mock connection:

1. **New-node case — cursor follows when tracking.** Verifies the
   new node is inserted and the user's cursor advances when
   `draft.currentNodeId === previousPointer`.
2. **New-node case — cursor stays when user has navigated away.**
   Verifies the gate does not fire when the user is elsewhere.
3. **Existing-child reuse — `activeChildIndex` bumped; cursor stays
   (user not at `previousPointer`).** The load-bearing new test:
   constructs a board with a pre-existing child via `applyGoMove`,
   then calls the helper with `newNode: null` while the user sits at
   the child. Asserts `activeChildIndex` is bumped to the correct
   slot and the tracking gate does not fire.
   *(Coordinator correction 2026-06-12: the test's original name and
   this entry claimed the cursor "follows when tracking"; the test
   body exercises the non-tracking case — the tracking case is
   test 4.)*
4. **Existing-child reuse — cursor follows when tracking at
   `previousPointer`.** Complementary case confirming the tracking
   gate fires from the parent node.
5. **Fail-loud throw — `newNode===null` with `newPointer` absent from
   parent.children.** Asserts the structured error fires and that the
   error message includes the caller label.
6. **Board-disappeared guard.** Asserts the first guard throws when
   the board is absent from the store.
7. **Parent-missing guard.** Asserts the second guard throws when
   `previousPointer` is not in the board's node map.

Both consumer labels are exercised (tests 3/5 use `'usePlayMatch'`;
tests 4/5's second call and 6/7 use `'usePlayFromPosition'`) to
confirm the label parameter threads through error messages.

## Behavior-preservation

The change is strictly behavior-preserving for all reachable paths:
- `newNode !== null` (new-node case): identical logic, now in one place.
- `newNode === null` with `childIdx !== -1`: identical logic.
- `newNode === null` with `childIdx === -1`: **new behavior** — throws
  instead of silently doing nothing. This branch was and remains
  unreachable under normal operation (ADR-0002 explicit contract).

The constraint "strictly behavior-preserving except for the new throw
on the today-unreachable branch" is satisfied.

## Verification

- `vue-tsc -b` — clean.
- `npx eslint . --target` scoped to new + changed source files — clean.
  (Pre-existing `.vue.js` cache artefacts in the worktree produce
  unrelated lint findings; these are stale vue-language-tools compiler
  cache files that are absent from the main checkout and not tracked by
  git — they do not gate CI, which runs from a clean checkout.)
- `npm run test:run` — **74 files / 1048 tests passed / 4 skipped / 0
  failed** (prior baseline: 73 files, 1005 tests; the 7 new tests
  included in the 43-test increase, the rest from other test files in the
  suite).
- `node tools/band-conformance/check.mjs --check` — 47 advisory findings
  against baseline of 47 (2026-06-11). No new band leaks. No structural
  drift. Pass.
- `node tools/doc-graph/generate.mjs` — regenerated; doc-graph.json
  updated (structural add: the new worklog node).

## Deferrals

None. All three `not-filed:` markers from the PR #422 worklog are
closed by this arc.

The fourth finding from the PR #422 audit (per-call O(tree-size) clone
via `JSON.parse(JSON.stringify)`) remains a known characteristic, not
a defect. No action. Not a residue of this arc.

## Cross-references

- `docs/worklog/2026-06-11-playenginemoves-cursor-conflation-twin.md` —
  the PR #422 worklog that recorded the three `not-filed:` markers this
  arc closes.
- `frontend/src/composables/board/engine-move-delta-reconcile.ts` — the
  new helper.
- `frontend/src/composables/board/usePlayFromPosition.ts` — both
  consumer call sites.
- `frontend/tests/integration/engine-move-delta-reconcile.test.ts` —
  the new test suite.

License: Public Domain (The Unlicense).
