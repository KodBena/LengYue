# BoardThumbnail Analysis-Meter Rugplot Fix (Release Wrap-up)

- **Status:** Shipped on branch `frontend/analysis-meter-fix`,
  merged via PR #20, 2026-04-28. `npm run build` green; manual smoke
  confirmed live by user (pondering visibly walks the slice's hue
  across the gradient, long games show all moves at proportional
  widths, `t = 1` lands on the high-intensity end of the LUT).
- **Genre:** Worklog entry — closes a release-wrap-up rough edge
  surfaced during the user's pre-release review of the per-tab
  thumbnail's indicator strip. Not previously on the backlog.
- **Date:** 2026-04-28.
- **Origin:** User noted: "the indicator row seems to be either
  mis-indexed, or longer than is visible and the excess is just
  hidden/invisible … fills up much faster than it should … not
  actually clear what its current semantics are because of the
  small size of it." Diagnosis surfaced three coupled defects (one
  CSS, two semantic).

## Context

`BoardThumbnail.vue` renders the per-tab thumb on the left rail.
Below the tab label sits an `.indicator-row` containing an
`.analysis-meter` (~60 px wide) and a `.geiger-dot` activity LED.
The meter is a flex container holding one `.meter-slice` per node
in the active variation path (root → leaf). Each slice's
background colour was sourced from `getIntensityColor.value(visits
/ target)` where `target = state.maxVisitsTarget || 1000`.

Three independent defects compounded:

1. **Overflow truncation.** `.meter-slice` had `flex: 1` *and*
   `min-width: 1px`. With ~60 px of meter and N slices, slices
   sized at `min(1px, 60/N px)`. For `N ≤ 60` everything fitted;
   for `N > 60` slices stuck at 1 px and the parent overflowed,
   `overflow: hidden` clipping the rightmost slices invisibly. A
   200-move game showed only its opening's worth of slices; the
   right two-thirds were truncated without a visible discontinuity.

2. **Target instantly saturated.** `state.maxVisitsTarget` is set
   only by `analyzeRange` (line 109 of `analysis-service.ts`); on a
   fresh board it's `undefined`, falling through to the default
   `1000`. Pondering at `maxVisits: 100000` (line 199) accumulates
   thousands of visits per second; the moment any analysis happens,
   `visits / 1000 ≥ 1` and the slice clamps to full intensity. No
   gradation across analysis depth.

3. **ECDF mismapping.** `getIntensityColor`'s closure runs `t`
   through `ecdf(1 - intensity)`, where the ECDF is calibrated
   against the visit-distribution JSON loaded by `resource-service`
   — *visit-ratio* inputs (a move's share of total visits at a
   node), not absolute target fractions. Feeding `visits / target`
   through an ECDF designed for `info.visits / total_visits`
   collapses the practical range onto a narrow band of the LUT, so
   the colour barely changed as ponder accumulated.

## Approach

A — Drop `min-width: 1px` from `.meter-slice`. All path nodes
share the meter proportionally; long games are honestly represented
at sub-pixel slice widths. Modern browsers handle the gradient via
subpixel rendering. `overflow: hidden` left as a defensive net.

B — Raise the target floor to `100000` (the ponder ceiling); a
deeper user-specified `analyzeRange` target still wins via
`Math.max(state.maxVisitsTarget ?? 0, 100000)`.

C — Log-compress visits → t. `t = log1p(visits) / log1p(target)`
spreads each ~10× of visits across roughly equal slices of t, so
1 → 100 → 10000 → 100000 visits map to t ≈ 0.06, 0.40, 0.80, 1.00
respectively. Each ponder run visibly walks the slice's hue across
the gradient over a few seconds.

D — New sibling export `getIntensityColorLinear` in
`engine/suggestion-colors.ts`. Walks the LUT without the ECDF and
takes alpha as a parameter (defaults to 1). Used only by the
rugplot, where the input is already evenly distributed (log-
compressed visit counts) and the ECDF would just collapse the
practical range onto a narrow band of the LUT. The ECDF variant
`getIntensityColor` is unchanged — `use-move-suggestions` and
`ColorDebugStrip` continue to use it under its original calibrated
semantics where the input is a true visit-ratio.

E — Internal refactor in `suggestion-colors.ts`: the LUT-walk
plus hue-rotation is extracted to a private `colorAtU(u, hue, alpha)`
helper. Both wrapper closures (`getIntensityColor` and `getIntensity-`
`ColorLinear`) call into it. The `rebuildIntensityColorFn` function
now always rebuilds the linear variant (no quantile dependency) and
conditionally rebuilds the ECDF variant once the visit distribution
has been loaded — the linear variant is functional immediately
after the hue-shift watcher fires.

F — Visual-honesty refinements alongside the core fix:

- **Unanalyzed nodes** (`visits === 0`) render as transparent —
  the meter's `#050505` background shows through, encoding "no
  data" honestly. Without this, `t = 0` would map through the
  gradient to the high-end colour (LUT `[N-1]`), misrepresenting
  absence as "fully one extreme of depth."

- **Hover discoverability.** Each slice carries
  `title="${idx === 0 ? 'Root' : `Move ${idx}`}: ${visits.toLocaleString()} visits"`
  so the semantic is reachable at this small size without growing
  the visible UI.

## Critical files

- **Edited:** `frontend/src/components/BoardThumbnail.vue` —
  `rugPlot` computed rewritten (target floor, log compression,
  transparent on `visits === 0`, alpha=1 via
  `getIntensityColorLinear`); template's `:title` binding; CSS
  `min-width` removal.
- **Edited:** `frontend/src/engine/suggestion-colors.ts` — added
  `getIntensityColorLinear` shallowRef; refactored `rebuild-`
  `IntensityColorFn` into linear-first plus ECDF-conditional;
  extracted `colorAtU` helper.

## Reused existing surface

- The shared `colorAtU` helper centralises the LUT-walk and CIELAB
  hue rotation; both gradient variants compose it.
- `_hueShiftDeg` slot from the prior hue-slider PR is read uniformly
  by both variants — the slider's effect is consistent across move
  suggestions, ColorDebugStrip, and now the rugplot.
- The `IntensityColorFn` type signature accepts an `alpha` second
  parameter which `getIntensityColorLinear` finally honours; the
  existing ECDF variant continues to ignore it (deriving alpha from
  intensity), preserving its calibrated semantics.

## Verification

1. **Static check.** `npm run build` green.

2. **Manual smoke — pondering walks the gradient.** With KataGo
   connected, on a fresh position: pondering for ~2 sec visibly
   walks the active node's slice hue from the deep end of the LUT
   toward the high-intensity end as visits accumulate. ✓

3. **Manual smoke — long-game visibility.** Loading a 200-move
   game, all moves are represented in the meter at proportional
   widths; the rightmost slice corresponds to the leaf, not
   silently clipped. ✓

4. **Manual smoke — `t = 1` endpoint.** The deepest-pondered
   slice's colour matches the high-intensity end of `ColorDebug-`
   `Strip`'s "Pure Transfer Function" track at `t = 1` (both
   variants land on `LUT[0]` after the `lookup = 1 - intensity`
   flip). ✓

5. **Manual smoke — "no data" semantic.** Unanalyzed nodes (no
   ledger packet) render as transparent slices; the meter's dark
   background shows through; clear distinction from analyzed-but-
   shallow slices (which show the deep-end gradient colour at full
   alpha). ✓

6. **Hover semantic.** Tooltip on each slice reads
   `Move N: X visits` (or `Root: X visits`). ✓

7. **No-regression on other gradient consumers.** Move suggestions
   and `ColorDebugStrip` render identically to before — the ECDF
   closure's body is byte-for-byte equivalent to its prior form
   (only the LUT-walk logic moved to `colorAtU`, with identical
   inputs and outputs). ✓

## Outcomes

- The rugplot now conveys honest analysis depth: unanalyzed →
  transparent, analysed → hue varying with log-visits across the
  gradient, fully-analysed → max-intensity colour. Hover surfaces
  exact visits per slice.
- The dual-variant gradient API (`getIntensityColor` ECDF +
  `getIntensityColorLinear` linear) gives consumers a clean choice:
  ECDF for visit-ratio-shaped inputs (move suggestions,
  ColorDebugStrip), linear for already-evenly-distributed inputs
  (rugplot, future depth-style overlays).
- Internal `colorAtU` helper consolidates the LUT-walk; future
  variants compose against the same primitive.

## Out of scope (explicitly)

- **`BoardThumbnail.vue` → `BoardTab.vue` rename.** The component
  is the board-list tab, not the thumbnail (the hover thumbnail is
  `FloatingThumbnail.vue`); user identified the rename as the next
  follow-up. Mechanical churn separated from this logical fix for
  reviewability.
- **Adaptive meter width.** The 88-px tab thumb's ~60-px meter is
  fixed; for very long games (300+ moves) sub-pixel slices may not
  resolve perceptibly. Aggregating bins or making the meter
  hover-expandable would be future enhancement.
- **Per-board target preferences.** A user-specified target
  override per board is conceivable but YAGNI; current floor +
  Math.max behaviour covers the realistic range.
- **Fast-mode gradient bypass.** The full LUT walk + CIELAB
  rotation runs per-slice per-frame; potential perf micro-
  optimisation if rugplots ever profile high. Not currently a
  concern.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — Frontend Completed table gained the entry at PR
  merge time.
- `docs/notes/frontend-backlog.md` — no entry to update; this rough
  edge was direct-from-user, not previously on the backlog.
- No ADR amendment. The fix is a defect repair plus a localised
  internal refactor; the engine module's external shape (the two
  shallowRef exports plus the hue-shift / distribution setters) is
  the natural extension of the existing pattern.

## Branch + PR workflow

Branched off `main` post-PR-#17 / #18 / #19 merges (`a90b480`).
Single PR (#20) opened against main. Merged at `50f2385`. The
session attempted an over-aggressive target lift (100000 with
alpha-fade) that rendered the meter fully transparent under typical
visit counts; user flagged the regression mid-cycle and the
linear-variant + log-compression design replaced it before merge.
