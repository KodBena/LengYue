# Merged Delta Panel — Frontend Specification

- **Status:** Implemented 2026-05-13 (this session). Spec authored
  *after* implementation, as a historical artefact recording the
  precise semantics the panel converged on. Useful, relevant, but
  not load-bearing for future work — the SFC at
  `frontend/src/components/charts/MergedDeltaPanel.vue` is the
  authoritative source; this document captures the off-by-one
  surface that the original ad-hoc task description elided.
- **Genre:** Frontend chart-panel specification.
- **Date:** 2026-05-13.
- **Audience:** Future spec authors trying to brief a similar
  panel without re-rediscovering the parity-interleaving and
  before-move-vs-after-move asymmetries the hard way.
- **Companion code:** `frontend/src/components/charts/MergedDeltaPanel.vue`,
  with adjacent edits to `BaseChart.vue` and
  `AnalysisChartPanel.vue` for the x-formatter pass-through.

---

## What this panel is for

The two per-player delta panels (`PlayerPanel` instances for B
and W) each show one colour's move-quality deltas on a chart
indexed by that colour's local move number. Reading them side
by side asks the user to mentally interleave two timelines.
The merged panel renders both colours on a **single shared
chart** while preserving every navigation affordance the
per-player panels already provide (click → navigate to the
position before that move; hover → preview the position after
the move; resting thumbnail tracks the next-to-play colour).

The merged view is **additive** — it coexists with the two
per-player panels rather than replacing them. The per-player
panels remain because the merged view is denser and some
users will continue to prefer the simpler one-player-at-a-time
read.

## The vocabulary the panel uses

The panel and this spec navigate three distinct indexing spaces.
Conflating them is the off-by-one trap the spec exists to
prevent.

- **Ply index.** Absolute position in the game-tree path,
  0-indexed. `variationPath[0]` is the root (no move played);
  `variationPath[1]` is the position **after** the first move
  (black's `B0`); `variationPath[2]` is after `W0`; and so on.
  Each entry of `variationPath` is the position **resulting
  from** that ply.
- **Colour-local move index.** Per-player 0-indexed move
  count. `K = 0` is that colour's first move; `K = 1` is its
  second. `colorMoveToPly(K, color)` (`useTriangularHeatmap.ts`)
  is the canonical conversion: black `K` → ply `2K+1`; white
  `K` → ply `2K+2`. The +1 / +2 offset accounts for
  `variationPath[0]` being the root.
- **Chart x.** The chart's x-coordinate space, parity-
  interleaved: black `K` → chart x `= 2K`; white `K` → chart
  x `= 2K+1`. The chart's x-resolution is the number of
  plies; at any integer chart x exactly one of the two series
  has a data point (the other has no point at that x, only an
  ECharts piecewise-linear segment passing through).

The user-facing label space is the colour-local move number.
Chart x = 2K and chart x = 2K+1 both reduce to colour-local
move `K = Math.floor(x / 2)`; the visible axis label at chart
x suppresses odd values and renders `x / 2` for evens, so the
visible labels read `0, 1, 2, ...` at chart x positions
`0, 2, 4, ...` without every-other-tick duplicates.

## Inputs (props)

```ts
{
  blackSeries:    EnrichedSeries[];   // each entry's data is
  whiteSeries:    EnrichedSeries[];   // [colourLocalK, value|null][]
  boardId:        BoardId;
  variationPath:  NodeId[];           // root at [0], leaf at [len-1]
  selectionRange: [PlyIndex, PlyIndex];
}
```

The black and white series arrive *un-re-indexed* — their data
is keyed by colour-local move number, the same shape the
per-player panels consume. The panel does the parity-interleave
itself.

Notably absent: `activeIndex`. The panel computes its own
active marker from the board state, because the per-player
panels' `activeBlackIndex` / `activeWhiteIndex` use a
suppress-on-current-colour convention that the merged chart
doesn't want (see *Active marker*).

## Data transform

```ts
mergedSeries = [
  ...blackSeries.map(s => ({ ...s, data: s.data.map(([k, v]) => [2*k,     v]) })),
  ...whiteSeries.map(s => ({ ...s, data: s.data.map(([k, v]) => [2*k + 1, v]) })),
];
```

Each colour's data is re-indexed onto the parity-interleaved
chart x. Names and colours from the upstream `EnrichedSeries`
flow through verbatim — the merged chart inherits the black /
white colour conventions the per-player panels established.

## Active marker

The marker sits on the series of the colour whose turn it is
to make the **next** move, at the parity-interleaved x of
that upcoming move. Matches the per-player panels'
"marker on the not-just-played colour" convention.

```
let (nextColor, nextColorLocalIdx) = nextToPlay(currentNode);
activeMergedIndex =
  nextColor === 'B'
    ? 2 * nextColorLocalIdx
    : 2 * nextColorLocalIdx + 1;
```

Where `nextToPlay`:

- Walks `variationPath[0..plyIdx]` and tallies black/white
  move counts.
- `nextColor` = the opposite of the current node's move
  colour; at the root (no current move), defaults to `B`.
- `nextColorLocalIdx` = the count of the next-to-play
  colour's moves so far (= the 0-indexed colour-local index
  of their *upcoming* move).

BaseChart's markPoint logic looks up `data.find(d => getX(d)
=== activeIdx)` per series. The series whose parity doesn't
match `activeMergedIndex` has no data point at that x, falls
back to an empty markPoint, and naturally renders no marker
— so the marker appears on exactly one series.

At the leaf of the active variation, the next-to-play
colour's upcoming move has no data point yet; the lookup
fails on both series and no marker draws. This is the same
behaviour the per-player panels exhibit at end-of-variation.

## Click

Click navigates the board to the position **before** the
clicked move — "the situation the player faced when choosing
this move." Mirrors `useChartNavigation::handlePlayerClick`'s
formula, generalised to the merged chart's dispatch:

```
color = colorAt(rawIdx, yClicked);   // x-parity decides
                                     //   even ⇒ 'B', odd ⇒ 'W'
                                     // null when the implied
                                     // colour-local index has
                                     // no non-null data point
                                     // (out of range)
K = colorLocalIndex(rawIdx, color);  // black: rawIdx / 2
                                     // white: (rawIdx - 1) / 2
turnIdx = colorMoveToPly(K, color) - 1;
nodeId  = variationPath[turnIdx];
if (nodeId) navigateTo(nodeId);
```

The `colorAt` signature carries a `yClicked` argument for
future extension to line-y-proximity dispatch on the
interpolated segments; today the parity-interleaved layout
disambiguates without it.

## Hover

Hover preview shows the position **after** the move at the
hovered chart x — the result of the move, complementing
click's before-move. Same `(color, K)` derivation as click;
the only difference is the missing `- 1`.

```
color = colorAt(rawIdx, yClicked);
K = colorLocalIndex(rawIdx, color);
nodeIdx = colorMoveToPly(K, color);
preview = thumbnail(variationPath[nodeIdx]);
```

## Rest preview (mouse leaves the panel)

The thumbnail's resting state must mirror what hovering at
`activeMergedIndex` would show — *not* the current board
node's thumbnail. This is the off-by-one trap the first draft
fell into: a click navigates the board to ply
`colorMoveToPly(K, color) - 1` (the pre-move position), but
the rest preview should land on `colorMoveToPly(K, color)`
(the post-move position) the same way hover does. Reading
the current board node here would lag the post-move thumbnail
by exactly one ply on both colours — the user-visible "1 ply
tardy" symptom.

```
x = activeMergedIndex;
color = x % 2 === 0 ? 'B' : 'W';
K = colorLocalIndex(x, color);
nodeIdx = colorMoveToPly(K, color);
preview = thumbnail(variationPath[nodeIdx]);
```

Equivalent to invoking the hover-handler logic at the
`activeMergedIndex`. The per-player panels follow the same
convention (`PlayerPanel::resetPreview` uses
`colorMoveToPly(activeIndex, playerColor)`); the merged
chart's resetPreview is the generalisation.

## Axis labels and tooltip

The chart's parity-interleaved x is internal vocabulary; the
user-facing label space is the per-colour move number. Two
formatters threaded into `BaseChart`:

```
formatXAxis(val: number): string
  // even integer x ⇒ (x / 2).toString()
  // odd integer x  ⇒ '' (suppressed)
  // visible labels: "0, 1, 2, ..." at chart x = 0, 2, 4, ...

formatXTooltip(val: number): string
  // "Move ${Math.floor(val / 2)}"
  // header shows the per-colour move number for whichever
  // series the cursor is over; the per-series rows
  // (rendered below the header by BaseChart's existing
  // tooltip code) disambiguate the colour via series name.
```

The per-player panels use BaseChart's default header
("Move ${rawX}") — their raw x already equals the per-colour
move number, so no formatter is needed. The merged chart is
the only consumer of the new formatter props today; the props
default to undefined so existing panels render unchanged.

## Selection-range zoom

`selectionRange: [PlyIndex, PlyIndex]` is the global
analysis-range selection from the toolbar. The merged
chart's x is "chronological move index, 0-indexed from
root-excluded," which equals `ply - 1`:

```
zoomRange = [max(0, selectionRange[0] - 1),
             max(0, selectionRange[1] - 1)]
```

This places the visible axis on the first selected move (or
beyond) without leaving an empty pre-root margin.

## What this panel deliberately does *not* do

- **No y-proximity dispatch** between overlapping series.
  Parity-interleaved data makes x-parity unambiguous; the
  `yClicked` argument is preserved on `colorAt` for a future
  extension to line-y-proximity but is unused today.
- **No collapse-on-leaf marker**. If the user is at the leaf
  of the active variation, the next-to-play colour has no
  upcoming data point and no marker draws. This is consistent
  with the per-player panels' end-of-variation behaviour and
  is honest: there's nothing to mark.
- **No replacement of the per-player panels**. The merged
  chart is additive; the per-player panels remain mounted in
  `AnalysisDashboard` immediately above it.
- **No new chart click-event channel**. The existing
  zr-level click in `BaseChart` is reused; `BaseChart`'s
  emit now carries an optional second arg (the cursor's raw
  y-coordinate at click / hover time), which the merged
  chart's signature accepts but currently doesn't consult
  (reserved for the future line-y-proximity extension).

## How to brief a similar task

The original ad-hoc task description ("merge the two delta
graphs … same x-axis, same per-move click semantics") elided
five decisions the panel had to make. If you find yourself
briefing a similar task, name each of these *explicitly*:

1. **Indexing space of the merged x-axis.** "Parity-
   interleaved at ply granularity" vs "shared at colour-
   local granularity" are *different* charts. The first puts
   black at even x, white at odd x; the second puts both
   colours at the same x and stacks them. Pick one,
   defensibly. (Here: parity-interleaved, so the active
   marker can land on a single series without a special-case
   per-series-marker rewrite of `BaseChart`.)
2. **Click-and-hover ply asymmetry.** Click → position
   before the move. Hover → position after. Inherited from
   `PlayerPanel`; trivially overlookable when first writing
   a new dispatch path.
3. **Active marker position when the panel covers both
   colours.** "On the just-played colour" and "on the
   next-to-play colour" are different. The per-player panels
   use the latter (markers suppress on the panel matching
   the current move's colour); the merged chart inherits
   the same convention to stay symmetric with them.
4. **Rest preview ≠ current board thumbnail.** It's the
   hover preview at `activeMergedIndex`. Off-by-one trap:
   click leaves the board on the *pre-move* position and the
   rest preview wants the *post-move* position; reading
   `board.currentNodeId` lands you one ply tardy.
5. **User-facing label space vs chart-internal x.** Chart x
   = parity-interleaved (= ply); axis labels and tooltip
   header = per-colour move number. The label-space
   conversion is `Math.floor(x / 2)` with odd-x label
   suppression on the axis to avoid every-other-tick
   duplicates.

Each of those was a place the first implementation tripped
in a way the user noticed. Naming them at briefing time
turns each into a deliberate decision rather than a
forensic correction.

## License

Public Domain (The Unlicense).
