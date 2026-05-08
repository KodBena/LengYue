# Board coordinate label band

- **Status:** Shipped on `frontend/board-label-band`, 2026-05-03.
  `npm run build` passes.
- **Genre:** Worklog entry — UX bug fix with a small structural
  reorganization.
- **Date:** 2026-05-03.

## Context

User-flagged at session open: edge-row stones occluded the
coordinate labels (A–T columns, 1–19 rows) in `BoardDisplay`. A
dispiriting first impression on a fresh load.

The geometry: `BOARD_PX = 600`, `pad = BOARD_PX / (size + 1)` =
30 viewBox-units at size=19, equal to one `cell`. Edge stones
(`stoneR = cell × 0.46` ≈ 13.8) extend `0.46 × pad` into the
cell-margin, leaving roughly `0.54 × pad ≈ 16.2` of clearance from
the SVG edge. The labels lived at `y = pad / 2 + 4` (centered in
the cell-margin band) at `font-size 11`, so the top label sat at
visual y ∈ [10, 22] vs. stone top at y = 16.2 — single-digit
overlap ~6 viewBox-units.

The y-axis labels were the binding constraint: `"19"` is
~14 viewBox-units wide centered at `x = pad / 2 = 15`, so its right
edge sat at x = 22 vs. an edge stone's left at x = 16.2 — about
12 viewBox-units of overlap on 2-digit row labels.

## Decision

Three options surfaced (label position alone, scale grid+stones
down via larger pad, dedicated label band outside the playing
area). The third was chosen for structural clarity — promoting
the implicit "labels live in the cell-margin" arrangement to an
explicit named outer ring keeps `pad` cleanly equal to `cell`
inside the playing area, and the band's value is self-checking
against the label font size.

ADR-0003's premature-abstraction caveat does not apply: the new
`LABEL_BAND` constant is a named geometry handle, not a
polymorphic seam.

## What changed

### `src/engine/constants.ts`

Four additions (all with comments justifying their value or
function):

- `LABEL_FONT_SIZE = 11` — promoted from the inline literal in
  BoardDisplay's template.
- `LABEL_BAND = 9` — outer-band viewBox-units. Widens the SVG
  viewBox so there's enough strip on each side of the playable
  area to position labels outside the stone-clearance zone. Tuned
  by hand to taste.
- `LABEL_INSET_RATIO = 0.65` — fraction along the available
  strip (between SVG edge and nearest stone) where the label
  sits. The user-facing tuning lever for label position; 0.5 is
  centered, lower hugs the edge, higher hugs the stone. Tuned by
  hand to taste.
- `TOTAL_PX = BOARD_PX + 2 × LABEL_BAND` — the new SVG viewBox
  dimension.

`BOARD_PX`'s comment refreshed: it's now the inner playable-area
dimension, not the SVG viewBox.

### `src/components/BoardDisplay.vue`

- viewBox grows from `BOARD_PX` to `TOTAL_PX`.
- Wood pattern dimensions grow with it (otherwise the pattern
  would tile and reveal a sliver of the next tile in the new
  outer ring).
- Playing area (grid, hoshi, stones, last-move marker) wrapped
  in `<g transform="translate(LABEL_BAND, LABEL_BAND)">`. The
  inner `pad` / `cell` / `stoneR` / `toSVG` formulas are
  unchanged — they remain inner-board-relative; the offset lives
  in the SVG transform.
- Coordinate labels relocated to viewBox-absolute coordinates,
  positioned via a new `labelOffset` computed:
  `LABEL_INSET_RATIO × (LABEL_BAND + pad - stoneR)`. This places
  the label inside the strip between the SVG edge and the
  nearest edge-row stone, with the named ratio choosing where
  in the strip (matching the convention in Lizzie / Sabaki /
  KaTrain, where labels visually balance against the stones
  rather than hugging the canvas edge). The formula is
  size-aware — at smaller boards the larger stones narrow the
  strip and the label drifts inward proportionally.
- Labels rendered on **all four sides** (top + bottom for x-axis,
  left + right for y-axis) per the Lizzie/Sabaki/KaTrain/KGS/OGS
  convention. Bottom and right labels mirror via
  `TOTAL_PX - labelOffset`. The previous convention (top + left
  only) left the bottom and right outer bands as unused empty
  wood; with all four sides labelled the band serves its purpose
  uniformly around the playing area.
- `dominant-baseline="middle"` on the label group, replacing the
  legacy `+4` baseline-correction magic offset (consistent with
  the `markerLabels` text in `engine/board-renderer.ts`).
- Inline `font-size="11"` replaced with `:font-size="LABEL_FONT_SIZE"`.
- `onBoardClick` subtracts `LABEL_BAND` from the cursor coords
  before resolving column/row.

### `src/components/BoardHeatmapOverlay.vue`, `src/components/MoveSuggestions.vue`

Necessary propagation: both are absolutely-positioned overlay
SVGs stacked on `BoardDisplay` to share its coordinate system. If
their viewBox stayed at `BOARD_PX` while BoardDisplay grew, they
would misalign with the underlying grid by ~6% at the corners
(ownership cells and PV stones drifting off their points). Both
overlays now use `viewBox = TOTAL_PX × TOTAL_PX` and wrap their
content in the same `<g transform>` so their inner pad/cell/cx/cy
formulas don't change.

### `src/engine/board-renderer.ts`

Untouched. The stateless thumbnail renderer (used by
`useThumbnailCache` and `useCardThumbnail`) renders to its own
SVG instances that don't compose with BoardDisplay's coordinate
system, and it doesn't render coordinate labels.

## Net visual effect

Inner board scales to ~97% of its previous displayed size
(`600 / 618`), leaving the new ~1.5% outer ring on each side for
the coordinate labels. At size 19 with `LABEL_BAND = 9` and
`LABEL_INSET_RATIO = 0.65`, the label center sits ~16 viewBox-units
from the SVG edge — roughly midway across the strip from edge to
nearest stone, biased slightly toward the stones. At smaller boards
(13×13, 9×9) the larger stones narrow the strip and the labels drift
inward proportionally; the ratio holds across sizes.

## Literal discipline

In line with the user's ask before this work began — maintain the
literal-substrate posture established by the 2026-05-02 color
theming arc, but as a "prevent doing the same thing twice" move,
not a "while we're here" sweep:

- **Promoted to named constants:** `LABEL_BAND`, `LABEL_FONT_SIZE`,
  `LABEL_INSET_RATIO`, `TOTAL_PX` (all in the equation being
  reorganized; `LABEL_INSET_RATIO` is also the user-facing tuning
  lever, so its scalar form makes it adjustable by hand without
  arithmetic).
- **Eliminated:** `+4` baseline magic offset (replaced with
  `dominant-baseline="middle"`); inline `font-size="11"` literal.
- **Untouched (out of scope):** stone radius factor `0.46`,
  last-move marker factor `0.4`, hoshi radius `2.5`, grid stroke
  `0.8`, grid opacity `0.3`, drop-shadow values, the suggestion-
  overlay font-size factors, the heatmap overlay's `12px` defaults.
  These are not part of the equation this PR rearranged and are
  left for a future targeted literals audit.

## What's not done

- **Bottom + right labels.** Convention here is top + left only.
  The viewBox is now symmetric on all four sides, so adding
  bottom and right labels later is one block of `<text>`
  elements per side; no further geometry change.
- **Geometry consolidation across the three SVG sites.** The
  duplication of `pad = BOARD_PX / (size + 1)` /
  `cell = (BOARD_PX - 2 × pad) / (size - 1)` across BoardDisplay,
  BoardHeatmapOverlay, and MoveSuggestions is pre-existing; this
  PR preserves it, just propagates `LABEL_BAND` consistently.
  Promoting to a `useBoardGeometry(size)` composable is a
  separate refactor question.

## Verification

- `npm run build` passes; `vue-tsc -b` clean, `vite build` clean.
- No browser-side visual verification this session — hand off to
  HMR per the established cadence.
- The wrapping pattern (`<g transform="translate(LABEL_BAND,
  LABEL_BAND)">` around the playing area) keeps inner geometry
  unchanged, so existing pad/cell/stoneR/toSvg formulas are
  bit-identical to pre-PR behavior. Visual regression risk is
  bounded to the viewBox + transform mechanics themselves.

## License

Public Domain (The Unlicense).
