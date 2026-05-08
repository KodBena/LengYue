# Intermission chart click → board navigation

- **Status:** Shipped on `frontend/intermission-chart-click`
  (branched off `origin/frontend/cards-tab-merge-pr1-per-board-forest`,
  which has PRs #141 and #142 merged into it), 2026-05-06. Two
  files touched (no new files); build green. Closes a
  long-standing entry in `docs/notes/frontend-backlog.md`.
- **Genre:** UX bug fix — the intermission chart had been a
  passive visualization since its introduction; clicking a data
  point did nothing. Per-player delta charts on the analysis tab
  navigate the board on click via
  `useChartNavigation::handlePlayerClick`; the user expects the
  same affordance on the intermission chart.
- **Date:** 2026-05-06.

## Branch hygiene preamble — important

PRs #141 (cards-tab-merge tab restructure) and #142 (cards-tab-
merge bug fixes) were both merged with `baseRefName =
frontend/cards-tab-merge-pr1-per-board-forest`, **not** main.
Cause: I'd set the `--base` to that branch when creating the
stacked PRs (a deliberate choice for review-ergonomics — the diff
shown to reviewers was the incremental change relative to the
prior PR), and GitHub didn't auto-retarget either dependent PR
when #140 merged into main. As a result, when #141 and #142 were
each merged, they merged into the PR 1 *branch*, which retained
its identity past #140's main-merge.

**Effect on `main`:** `main` had only PR 1's content. The PR 1
branch on origin retained its tip pointing at the (PR 1 + PR 2 +
PR 3) merged content.

This PR's branch base is the PR 1 branch's tip, so the merge of
this PR into main brings PR 2 and PR 3's content along with the
intermission-click fix. The PR description flags this; reviewers
should expect a large diff that's mostly already-reviewed PR 2 +
PR 3 content.

## Context

`docs/notes/frontend-backlog.md` carried this item:

> After spaced repetition when the game rewinds to initial position,
> when entering intermission, you can't click on the chart like on
> the PlayerPanel (actually, if PlayerPanel isn't reused, why is
> that? should it be?)

The user encountered this during their first manual exercise of
the cards-tab-merge UI and surfaced it as a fixable bug. The
PlayerPanel's click-to-navigate semantics is settled — per
`useChartNavigation`'s comment, "click navigates to the position
BEFORE the move (so the user sees the situation the player
faced)." The intermission chart wants the same.

## Mechanics

In a review session, each user move is followed by the engine's
best-move response (`useReviewSession::processUserMove` calls
`applyGoMove` for the user's move, awaits the analysis packet,
then calls `applyGoMove` again for the engine's `moveInfos[0]`).
The active variation path therefore advances **2 plies per user
move** from `startingNodeId` (the leaf of the SGF's mainline
where the session begins).

For user move k (1-indexed, the k-th data point on the chart's
x-axis), the position the user faced when making it is at path
index `startIdx + 2(k-1)`, where `startIdx` is the index of
`startingNodeId` along the active variation path. Concretely:
k=1 → `startingNodeId` itself (no user moves played yet); k=2 →
the position after user move 1 + engine response 1; etc.

After `finishCard`'s `rewindToStart`, the board's currentNodeId
is at `startingNodeId`, but the active variation path still
walks down through the user's moves via the preserved
`activeChildIndex` pointers (`getActiveVariationPath`'s
walk-down + walk-up shape). So clicking a chart point
synthesises the right path index from path/startId/k and
`navigateTo` jumps to the corresponding NodeId.

## What changed

`frontend/src/components/ReviewSessionPanel.vue`:

- Imports `mutateBoard`, `store` from `../store`;
  `getActiveVariationPath` from `../engine/util`;
  `navigateTo` from `../engine/navigator`.
- New `handleIntermissionClick(idx: number)` function reads the
  active board's `startingNodeId` from
  `store.session.reviews[bId]`, computes the target path index,
  and calls `mutateBoard` + `navigateTo`. Defensive guards
  short-circuit on missing board / missing session row /
  startingNodeId not in path / target-index out of bounds.
- The intermission `<BaseChart>` gains
  `@index-click="handleIntermissionClick"`. `BaseChart` already
  emits `'index-click'` via its zr-on-click handler with
  `Math.round(data[0])`, so the chart-coordinate-to-move-index
  conversion happens at the BaseChart edge; this PR is purely
  the listener wiring.

`docs/notes/frontend-backlog.md`:

- The corresponding bullet is struck-through with a closure
  paragraph referencing this worklog. Per the file's
  established pattern (the contenteditable / useUserIORegistry
  closure entry above is the worked example).

## Why not reuse `AnalysisChartPanel`

The user's initial framing — "if PlayerPanel isn't reused, why is
that?" — is a fair design question. Three reasons reuse wasn't
chosen here:

1. **Thumbnail-on-hover overlay.** `AnalysisChartPanel` carries
   a 120-ish-px thumbnail preview that surfaces during hover. The
   intermission chart's container is 180px tall and
   panel-narrow; an overlay of that size would dominate the
   panel rather than augment it. PlayerPanel sits in a
   chart-rich dashboard with room to spread; the
   ReviewSessionPanel doesn't.

2. **Coordinate space mismatch.** PlayerPanel's chart x-axis is
   `ColorMoveIndex` (color-local move number); the conversion
   to PlyIndex routes through `colorMoveToPly`. The intermission
   chart's x-axis is "user move number" (1-indexed, sequential
   with no color discrimination). The 2-plies-per-user-move
   stride is different from the 2-plies-per-color-move stride,
   even though both arrive at the same shape arithmetically;
   threading "user move index" through `AnalysisChartPanel`'s
   `onIndexClick` would require either a per-caller adapter
   (which is what we do here) or an option to switch the
   chart's stride mode (which complicates the panel for a
   single new use site).

3. **Semantics asymmetry.** PlayerPanel's hover previews the
   position AFTER the move (the result); the intermission
   chart's similar hover preview would be useful but isn't
   essential and isn't part of the user's reported bug. Adding
   the AnalysisChartPanel hover preview without the rest of its
   ergonomics would be inconsistent.

The three reasons compose: AnalysisChartPanel optimises for the
analysis-tab dashboard's signal-rich, dashboard-wide context;
ReviewSessionPanel's intermission chart is summary-glance signal
with click-to-navigate. The simpler BaseChart-plus-listener
shape suffices.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- The handler's defensive guards are exhaustive: missing board /
  missing session row / startingNodeId not in active path /
  target index out of bounds all return early. The mutate-then-
  navigate pair is safe even when the board has navigated
  somewhere unrelated since intermission started — the user
  can't click into a position that doesn't exist.
- The chart's `zoomRange = [1, currentCard.numMoves]` constrains
  ECharts' click-coordinate translation to the per-card range,
  so `Math.round(data[0])` lands in `[1, numMoves]`. Combined
  with the `targetIdx >= path.length` guard, out-of-bounds
  clicks are safely no-ops.

Manual smoke (left as HMR-driven user verification on review):

- Complete or skip several cards on a deck. At intermission,
  click on the 3rd data point — board jumps to the position
  the user faced when making move 3.
- Click on data point 1 — board jumps to `startingNodeId`
  (same as Rewind to Start).
- Click on the last data point — board jumps to position
  before the last user move (path[startIdx + 2(N-1)]).
- Use the Rewind to Start button — same as clicking point 1.
- After clicking, "Follow Me" pondering re-issues at the new
  position (per App.vue's existing watcher on currentNodeId
  change).

## Forward notes

- **Hover preview for the intermission chart.** Not in scope
  here; the user reported only the click bug. If the user's
  workflow makes hover useful (preview the position after the
  user's move via thumbnail overlay), the addition is a
  ~10-line extension following the `handleIntermissionClick`
  shape. Filed under "future enhancement" rather than open
  bug.
- **Spec retrofit.** `card-tree-frontend-spec.md` and the
  cards-tab-merge plan don't mention the intermission chart's
  click semantics. A spec retrofit noting "intermission chart
  click navigates to position before user move k" would close
  the spec graph; held for the next spec-touch PR.
