# Perf Fix #2 — `boardsById` O(1) board lookup (Bug A primary)

- **Status:** Branch `frontend/perf-fix2-boards-by-id-lookup`;
  awaiting user end-to-end test before PR open.
- **Genre:** Store-level derived computed + composable rewrite.
  Two-file change: `src/store/index.ts` gains a `boardsById`
  computed export; `src/composables/board/useVariationPath.ts`
  switches to it.
- **Date:** 2026-05-27.
- **Diagnostic substrate:**
  `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
  primary cause. Second of four sequenced perf-arc PRs.

## Context

The audit named `useVariationPath` as Bug A's worst offender:

> Each `BoardTab` in the `v-for` over `store.boards` mounts a
> `useVariationPath` computed. The computed reads
> `boardsVersion.value` AND calls
> `store.boards.find(b => b.id === boardId)`. The `find()` walks
> the reactive boards array, registering reactive deps on every
> entry — so mutating ANY board re-runs all N `useVariationPath`
> computeds, each doing an O(N) find. 10 boards = 100 walks per
> nav step.

The downstream consumers (`rugPlot`, `useEnrichedData`) were
already protected by the per-instance fingerprint short-circuit,
so the cost was contained to the per-tab computed itself; but
the O(N²) reactivity work per nav step is the largest single
structural cost in Bug A and the natural lead fix.

## Design — derived computed, not hand-maintained dictionary

The audit named two possible shapes — "Adding `boardsById:
Record<BoardId, Board>` or a `findBoardById(id)` accessor" — and
flagged the staleness-bug concern for the hand-maintained
dictionary case (the dictionary must be kept in sync at every
mutation point that bumps `boardsVersion`: `mutateBoard`,
`addBoard`, `closeBoard`, `updateBoardState`, `updateFromRemote`,
`resetWorkspace`).

Chose the **derived computed** shape instead — sidesteps the
discipline entirely because no mutation site has to know
`boardsById` exists. The computed re-derives whenever
`store.boards` is read by its iteration body and a tracked dep
fires. Cost analysis:

| Trigger | Old | New |
|---------|-----|-----|
| One nav step (`mutateBoard` on one board) | O(N²) — N consumers each walk O(N) `find` | O(N) — boardsById re-derives (O(N)) + N consumers each O(1) lookup |
| `addBoard` / `closeBoard` / etc. | O(N²) | O(N) |

The O(N) per mutation is the same shape the consumers already
incur (waking N watchers); the win is per-consumer constant-time
work.

## Shape of the change

### `boardsById` computed export in `src/store/index.ts`

Added alongside `activeBoard` and `activeBoardSize` — same export
sibling pattern. Iterates `store.boards` once into a plain
`Record<BoardId, BoardState>`, returning a fresh object on each
invalidation. The inner BoardState references are the same
reactive proxies held in `store.boards`, so deep reads on the
looked-up board (e.g., `board.nodes`, `board.activeNodeId`)
register the usual fine-grained deps — no reactivity loss.

JSDoc on the export explains the O(1) replacement intent, names
the six mutation sites the discipline would otherwise have to
police, and cites the audit doc as the diagnostic substrate.

### `useVariationPath.ts` rewrite

The computed body now reads `boardsById.value[boardId]` instead
of `store.boards.find(b => b.id === boardId)`. The
`void boardsVersion.value` "primary subscription" is dropped —
the `boardsById` invalidation already fires on every mutation
that bumps `boardsVersion`, so the explicit read is redundant.
Imports trimmed accordingly (drop `store` and `boardsVersion`,
add `boardsById`).

Inline comment names the diagnostic substrate and the
why-it's-safe-to-drop-boardsVersion reasoning so a future
reader doesn't reintroduce the explicit subscription.

## Multi-tasking preservation

Verified SAFE in the audit doc's per-fix evaluation. The change
is a pure read-path perf improvement — no mutation surface, no
new state, no lifecycle dependencies. `BoardTab`'s `rugPlot`
runs `useVariationPath` for every board's `state.id` (including
background boards), so the faster lookup helps background-board
reactivity work too. The CONDITION the audit named for the
hand-maintained dictionary case doesn't apply to the derived
computed — there's no sync invariant for the implementation
to break.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics,
  `vite build` produces `dist/`.
- `npm run test:run` — 654 frontend tests pass, 3 skipped
  (unchanged from pre-fix baseline).

User-side validation remains the gate: open the SPA, open
several boards (≥ 5), hold ArrowDown / spin scroll-wheel on
the active board, confirm fast-nav feels smoother than after
Fix #1 alone. Cross-check: opening / closing / switching
boards still works; the BoardTab's rug-plot still renders;
the variation path display in the chart cluster still updates
on nav. Multi-tasking — range / ponder query on a background
board continues running, activity indicator continues updating
on board switch.

## What stays

The `boardsById` substrate is now available to any other
consumer that needs O(1) board lookup by id — e.g., a future
unified action surface that dispatches against a chosen board
without iterating. The export's JSDoc names the design
rationale so a future maintainer who's tempted to convert it
into a hand-maintained reactive Map (for per-key fine-grained
reactivity) finds the reasoning for the current shape.

## What follows

Fix #1 (rAF-coalesce keydown) and Fix #2 together address the
bulk of user-perceived nav jank: Fix #1 caps keyboard nav at
vsync rate with rAF back-pressure; Fix #2 drops per-step work
from O(N²) to O(N). Fix #3 (PV hover packet-watch guard) and
Fix #4 (global → per-board watchers) are the remaining
sequenced fixes — independent of #1 and #2 in the safety
analysis, sequenced for bisectability per the user's
preference.

License: Public Domain (The Unlicense)
