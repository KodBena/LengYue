# Worklog — review-paste-permissiveness-asymmetry: paste gate aligned with move gate (2026-06-11)

> Audit trail for work-status item `review-paste-permissiveness-asymmetry`;
> branch `bork/fix/review-paste-permissiveness`, PR (TBD). Verifies the
> asymmetry flagged in the 2026-05-27 worklog, aligns the paste handler's
> gate with the move handler's, and nets the predicate under a named shared
> function (ADR-0011 Rule 4).

## Verification at HEAD

Read `docs/worklog/2026-05-27-review-intermission-move-block.md` end to end
(ADR-0002 documentation consumption).

The 2026-05-27 fix tightened `handleBoardMove` to block during `LOADING` and
`ANALYZING`, and its "Asymmetry note" (§ "Asymmetry note (not fixed in this
PR)") named the remaining gap:

> `handlePastePv`'s gate (`if state === 'AWAITING_MOVE' return`) is strictly
> more permissive than the new move-handler gate — paste is allowed during
> LOADING and ANALYZING too.

At HEAD (`App.vue:349–369`, read in full):

```ts
function handlePastePv(pv: PvMove[]): void {
  if (reviewSession.state.value === 'AWAITING_MOVE') return;
  // ^ only gate — LOADING and ANALYZING fall through to applyGoMove
  …
}
```

`handleBoardMove` (`App.vue:300–305`) at the same HEAD blocks on
`LOADING || ANALYZING`. The asymmetry stands: paste can mutate the board
tree while `ANALYZING`'s in-flight wait reads that same tree to compute the
per-move grade, and while `LOADING` is still positioning the board from the
card SGF.

## The change

### Named shared guard — `isReviewTransientState`

Extracted a named pure predicate (ADR-0011 Rule 4 — quantify over the class,
not the instance):

```ts
// src/composables/review/useReviewSession.ts (exported)
export function isReviewTransientState(status: ReviewStatus): boolean {
  return status === 'LOADING' || status === 'ANALYZING';
}
```

The docstring names the races each state causes and the ADR-0011 Rule 4
rationale: a new board-mutation entry point needs one call to the guard, not
a copy of the literals.

### `handleBoardMove` — replaced inline check

The prior `if (state === 'LOADING' || state === 'ANALYZING')` is replaced by
`if (isReviewTransientState(reviewSession.state.value))`. The comment is
updated to name the shared guard and cross-reference `handlePastePv`.

### `handlePastePv` — aligned

Added `if (isReviewTransientState(reviewSession.state.value)) return;` between
the existing `AWAITING_MOVE` gate and the `!activeBoard.value || pv.length === 0`
guard. The docstring is updated: "Also blocked during LOADING and ANALYZING …
both use isReviewTransientState as the shared guard (ADR-0011 Rule 4). Other
review states (FINISHED / intermission) allow paste." The prior comment's claim
that "Other review states (intermission, finished) allow paste" is now accurate
for the full set of non-transient, non-AWAITING_MOVE states.

## Test

Added `tests/unit/composables/review-transient-state-guard.test.ts` — Tier-1
pure-function unit tests for `isReviewTransientState`:

- `returns true for LOADING` — paste (and clicks) must be blocked.
- `returns true for ANALYZING` — paste (and clicks) must be blocked.
- `returns false for IDLE` — free play allowed.
- `returns false for AWAITING_MOVE` — `handlePastePv` adds its own gate; the
  transient guard's responsibility ends here.
- `returns false for FINISHED` — intermission; exploration allowed.

The test header documents the asymmetry the guard closes, so a future reader
understands what "false negative" means in context.

## Red / green

- `npm run build` (vue-tsc -b + vite): clean, no new diagnostics.
- `npx eslint .`: exit 0.
- `npm run test:run`: **917 passed, 4 skipped, 0 failed**. The 5 new tests
  contribute to the 917; the 4 skipped and 3 skipped-files are pre-existing
  (e2e tests requiring a live stack).

No baseline delta noted — the prior run (pre-change) was **912 passed** from
the 2026-06-11 debt-clearing campaign context; the 5 new tests account for
the difference.

## Deferrals

- **`handlePastePv` not testable through the composable.** `handlePastePv`
  lives in `App.vue`'s `<script setup>` and is not exported; component-level
  tests are out of scope per `tests/CLAUDE.md`. The behavioral test of the
  *gate* is the predicate unit test above; the behavioral test of the *paste
  path end-to-end* (board not mutated during LOADING/ANALYZING) would require
  mounting App.vue. Filed as a component-test-tier gap, not a deferral within
  this item's scope. `not-filed: component-level paste-path test deferred per
  tests/CLAUDE.md posture (out-of-scope at present)`.

## Documentation audit

- Work-status store: `review-paste-permissiveness-asymmetry` stays
  **read-only** per campaign rule; the coordinator closes on ship.
- `frontend/FILES.md`: no new `src/` file; `tests/` files are not tracked.
  `useReviewSession.ts`'s FILES.md row description ("SR-session state
  machine: AWAITING_MOVE / INTERMISSION / FINISHED") does not need updating —
  the exported `isReviewTransientState` is a guard predicate, not a new state
  machine surface.
- `frontend/IDENTIFIERS.md`: no new branded identifier type.
- `FEATURES.md`: no user-facing capability change — pasting a PV during
  LOADING/ANALYZING was undefined/racing behaviour, not an advertised feature.
- Doc-graph: this worklog is a new structural node; doc-graph regenerated in
  the same commit (`node tools/doc-graph/generate.mjs`).

License: Public Domain (The Unlicense)
