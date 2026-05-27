# Review-intermission move-block — single-file fix

- **Status:** Branch `frontend/fix-review-intermission-move-block`;
  awaiting user end-to-end test before PR open.
- **Genre:** Bug fix. Single-function edit in `src/App.vue`.
- **Date:** 2026-05-27.

## Symptom

During an SR review session's intermission phase
(`status === 'FINISHED'`, displayed as "Intermission" per
`BoardTab.vue`'s status mapping), clicking the board to play a
move did nothing — like the board was locked. Per the project's
pedagogy (umbrella `handoff-current.md`, "What this product is"
§ "Heredity tracking offloads branching problems"), intermission
is exactly when the user should be able to play branches off the
just-evaluated position to explore alternatives. The move-block
contradicted that.

## Root cause

`src/App.vue::handleBoardMove` gated as:

```ts
if (reviewSession.state.value !== 'IDLE') {
  if (reviewSession.state.value === 'AWAITING_MOVE') {
    reviewSession.processUserMove(x, y);
  }
  return;  // silent block for every non-IDLE / non-AWAITING_MOVE state
}
```

The early-return swallowed clicks during `LOADING`, `ANALYZING`,
AND `FINISHED`. The first two are correctly blocked (transient
SR states); `FINISHED` should fall through to free play. The
sibling `handlePastePv` already documents the intended split
(`docs/notes` paste handler comment) — "Other review states
(intermission, finished) allow paste — those are study phases
where exploration is the point" — but the move handler missed
the same allowance.

## Fix

Refactored `handleBoardMove` into three explicit branches:

1. **`AWAITING_MOVE`** → route to `reviewSession.processUserMove`
   (preserves N-move discipline + grading).
2. **`LOADING` / `ANALYZING`** → silent block (transient states
   where free play would race the SR lifecycle: LOADING's
   positioning, or ANALYZING's read of the just-played position
   for the grade).
3. **`IDLE` / `FINISHED`** → fall through to `applyGoMove` +
   `updateBoardState`. Intermission gets free play, matching the
   paste handler's posture.

Inline comments name each branch's rationale and cross-reference
the paste handler so the two stay aligned through future edits.

## Multi-tasking preservation

No multi-tasking surface touched. `handleBoardMove` is the
active-board click handler; the change doesn't reach the packet
receive path, ledger, or per-board state. Background-board
analyses, range queries, and the activity indicator are
unaffected.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged from pre-fix baseline; the existing
  `useReviewSession.test.ts` integration test covers the
  composable's state machine, which is unchanged).

User-side validation remains the gate:

1. Start an SR review, play the requested N moves until the
   session reaches FINISHED (the "Intermission" status in the
   sidebar's BoardTab and `ReviewSessionPanel`).
2. Click on the board to play moves — should now create
   branches off the position the SR rewound to (the card's
   starting position; `useReviewSession::finishCard` calls
   `rewindToStart()` after submitting the review).
3. Cross-checks:
   - During `AWAITING_MOVE` (user is supposed to play their
     N-th move), clicks should still route through
     `processUserMove` — grading should fire as before.
   - During `LOADING` (briefly visible when next-card is
     clicked), clicks should still no-op silently.
   - During `ANALYZING` (after user plays mid-sequence, while
     the engine grades), clicks should still no-op silently.
   - Outside any review (IDLE), free play works as always.

## Asymmetry note (not fixed in this PR)

`handlePastePv`'s gate (`if state === 'AWAITING_MOVE' return`)
is strictly more permissive than the new move-handler gate —
paste is allowed during LOADING and ANALYZING too. By the same
reasoning that blocks free-play moves during those states
(racing the SR lifecycle), paste should also block. The paste
handler's comment treats this as deliberate, so leaving it
alone here — but flagging in case the author wants paste
tightened in a follow-up.

License: Public Domain (The Unlicense)
