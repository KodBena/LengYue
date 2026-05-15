# Match cursor independence from the user's view

- **Status:** Shipped 2026-05-16. Build green
  (`vue-tsc -b && vite build`); full frontend suite green at
  521 / 3 / 0 (passed / skipped / xfailed) at the arc's tip.
- **Genre:** Bug fix — same-day follow-on to the per-board
  multi-query model arc
  (`docs/worklog/2026-05-16-per-board-multi-query.md`).
  Different bug; analogous "two concepts conflated under one
  identifier" shape.
- **Date:** 2026-05-16.

## The bug

User-visible symptom: starting an engine-vs-engine match and
then navigating elsewhere in the tree caused the *next engine
move* to play from where the user had just navigated to,
rather than from the match's expected continuation. The user
described it as "the match is not bound to the starting node."

Underlying cause: `playEngineMatch` (in
`src/composables/board/usePlayFromPosition.ts`) held its
"current match position" in a local `let board = opts.startBoard`
variable. At the start of the match, `opts.startBoard` was the
Vue *reactive proxy* the store had at `store.boards[idx]` — so
`board` and the store's board were the same object. After the
first `applyGoMove`, the local `board` was reassigned to a fresh
`BoardState` object (from `applyGoMove`'s return value), and
`onMoveApplied` overwrote the store with that fresh object via
`updateBoardState`. From that point on, the local `board` was
identically the new object the store also held — and any
`mutateBoard` / `navigateTo` from a user navigation mutated
`board.currentNodeId` and `board.stones` in place. The next
loop iteration's `buildAnalyzeQuery(board, …)` read
`board.currentNodeId`, which was now the user's destination, not
the match's continuation.

The conflation: the local `board` variable was simultaneously
**the match's cursor** and **the user-visible cursor**. The
store's `currentNodeId` updates flowed into the match's loop
because the two pointers were the same memory.

## The fix

`playEngineMatch` now deep-clones `opts.startBoard` via
`JSON.parse(JSON.stringify(_))` at the top of the function. The
local `matchBoard` is a fully independent `BoardState`; the
store's mutations cannot reach it. `applyGoMove` operates on
`matchBoard`, returning the next match state; the cursor walks
forward in the match's own copy of the tree.

**Gotcha during implementation.** The first attempt used
`structuredClone(opts.startBoard)`, which the Web Platform spec
documents as the modern deep-clone primitive. It threw
`DataCloneError: Proxy object could not be cloned` at runtime
because `opts.startBoard` is a Vue 3 reactive `Proxy`, and
`Proxy` objects aren't in the structured-clone supported-types
list. `structuredClone(toRaw(opts.startBoard))` doesn't fix it
either — Vue's reactivity layer wraps nested objects lazily on
access, so the top-level `toRaw` strips one layer but inner
reads through the cloned target still hit proxies. The JSON
round-trip works because `JSON.stringify` reads every property
through the proxy's `[[Get]]` traps (which Vue forwards
transparently to the underlying data) and emits plain JSON;
`JSON.parse` reifies a fresh POJO graph. `BoardState` is a
pure POJO shape (primitives, `Record`s, arrays, `Point |
null`) — no Dates / Maps / Sets / functions / undefined-
fields-that-matter — so the round-trip is lossless. The
branded `BoardId` / `NodeId` types erase at runtime, so the
cast back to `BoardState` is honest.

The `onMoveApplied` callback's signature changed from
`(board: BoardState) => void` (the wholesale-store-overwrite
shape) to `(delta: MatchMoveApplied) => void`, where
`MatchMoveApplied` is the new interface

```ts
interface MatchMoveApplied {
  readonly previousPointer: NodeId;       // played FROM
  readonly newPointer:      NodeId;       // played TO
  readonly newNode:         GameNode | null;  // null on existing-child reuse
}
```

`usePlayMatch.start`'s `onMoveApplied` now does a surgical
`mutateBoard` that:

1. **Appends the new child** to the parent's `children` list and
   adds the new node to `draft.nodes` (the `newNode !== null`
   case), or **bumps `activeChildIndex`** on the parent (the
   existing-child-reuse case).
2. **Navigates the user's view to the new pointer ONLY IF**
   `draft.currentNodeId === previousPointer` — i.e., the user
   was sitting at the node the match just played from. Otherwise
   the user's `currentNodeId` is left alone.

The "re-track by navigating back" behaviour the spec asks for
falls out of (2) naturally: on the *next* match move,
`previousPointer` will be the node the user just navigated to
(the previous `newPointer`), so the conditional fires and the
user resumes tracking from there.

## User-visible behaviour after the fix

1. **Match runs without user navigation:** identical to before
   — the user's view follows each engine move.
2. **User navigates mid-match to a different node:** the user
   stays at their chosen position; the match continues from
   wherever it was, extending the tree as new children of its
   own cursor.
3. **User navigates back to the match's last move:** the user
   resumes tracking automatically; the next engine move pulls
   their view forward.
4. **User navigates to the new pointer the match just played:**
   no jump on this move (they're already there); subsequent
   moves track normally per case 3.

No wire-protocol change. No proxy-side change. No backend
change.

## Scope

Match-only fix (`playEngineMatch` + `usePlayMatch`). The
structurally-identical bug exists in `playEngineMoves` +
`usePlayFromPosition` (the single-engine self-play variant)
but `usePlayFromPosition` has no production UI wire today —
the only consumers of `playEngineMoves` are e2e test scenarios
that don't pass `onMoveApplied`. A separate arc can apply the
same pattern if/when the self-play affordance gets a UI wire.

The autonomous-SR research harness uses `queryEngineMove`
(one-shot) rather than `playEngineMoves` (looping), and the
one-shot path doesn't carry the local-cursor-vs-store-cursor
conflation. Unaffected.

## Verification

- `npm run build` (`vue-tsc -b && vite build`): green.
- `npm run test:run`: 521 / 3 / 0 (passed / skipped /
  xfailed). No test edits forced — the affected `onMoveApplied`
  signature on `playEngineMatch` has no test coverage today
  (the e2e tests use `playEngineMoves`, whose surface is
  unchanged).
- Manual smoke (queued for user testing): start a match → let
  it play one or two moves → navigate to a different node →
  observe that subsequent engine moves extend the match's
  variation in the tree without pulling the user away; navigate
  back to the match's leaf → observe the user resumes tracking
  from the next move.

## Rationale-archaeology

The conflation predates the umbrella — `playEngineMatch` was
present in the umbrella's first commit (`e5c857b initial`,
2026-04-26), inherited from the pre-umbrella `gogui` repo
whose history was deliberately not preserved per
`docs/playbooks/monorepo/monorepo-plan.md` §461-463. The
plausible reconstruction: when `playEngineMatch` was first
written, the match was assumed to be a "fire and watch"
operation that the user wouldn't navigate during; the local
`board` shape worked correctly under that assumption. As the
UI grew chart-navigation, keyboard-navigation, and other
mid-match navigation affordances, the assumption stopped
holding, and the conflation became a real bug. The same
diagnosis applies to the per-board single-slot pattern fixed
earlier today — both are "the original code worked when one
thing happened at a time; the bug surfaces under concurrent
operation."

The user spotted both bugs through actual use rather than
through reading the code — consistent with the project
author's note that they've been "consumed by working on the
project, not using it." Concurrent-UX bugs are particularly
prone to escaping code review; they need observed runtime
behaviour to surface.
