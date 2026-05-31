# Worklog — BoardTab rugplot → canvas (2026-05-31)

`BoardTab` was the single most expensive component render in the combined-stress
profile (`long_heavy_after_refactor.json.gz`): **782 ms total, ~7.6 ms per
render** — 29% of all component-render time, well ahead of TreeWidget (542 ms)
and BoardDisplay (322 ms).

## Diagnosis

The analysis-depth rugplot was `v-for="slice in rugPlot"` → one
`<div class="meter-slice">` per path move, each carrying a per-slice
`:title="$t('boardTab.meterMove', { idx, visits: visits.toLocaleString() })"`.
For the ~340-move capture game that meant **~340 vnodes + ~340 i18n
interpolations + ~340 `toLocaleString()` calls on every render** — and because
the template read `rugPlot`, every 4 Hz colour update re-rendered the whole tab
(the 103 renders).

The meter is a fixed ~86×4 px strip: at 340 slices each is ~0.25 px (sub-pixel),
so the per-slice DOM granularity — and the per-slice tooltip — bought nothing.

## Fix

Render the meter on a `<canvas>`, drawn imperatively:

- The template now holds one static `<canvas ref="meterRef">`; the slice
  `v-for` and per-slice `:title` are gone.
- `drawMeter()` fills one `fillRect` per colour (transparent slices skipped, so
  the CSS background shows through unchanged). Backing store sized to
  `clientWidth × devicePixelRatio` for crispness; `clientWidth`/`Height` are
  cached from a `ResizeObserver` (no forced reflow on the hot path).
- Driven by `watch(rugPlot, drawMeter)` at the existing 4 Hz throttle —
  **entirely off Vue's render path.** Because the template no longer reads
  `rugPlot`, colour updates stop triggering tab re-renders, so `BoardTab` now
  re-renders only on label / active / review-state change (rare).
- The per-slice tooltip is dropped (maintainer's call — it was sub-pixel and
  unusable). The now-dead `boardTab.meterRoot` / `boardTab.meterMove` i18n keys
  removed from all four locale catalogs.

Same reasoning `HeatmapChart` uses for its canvas renderer over per-cell SVG:
many tiny cells in a fixed area with no per-cell layout/interaction is a canvas
job, not a DOM job.

## Expected

`BoardTab` render drops from ~7.6 ms to near-zero (label + close button + a
static canvas), the 4 Hz colour update becomes a sub-millisecond imperative
`fillRect` loop instead of a full tab re-render, and the render *count* falls
(rugPlot out of the template). ~700 ms of the combined-stress component-render
budget recovered. Build green.

## Validation (pending capture)

Isolated `BoardTab`-focused capture: confirm the `<BoardTab> render` UserTiming
mark's total time + count drop sharply, and no canvas-draw cost appears as a new
LongTask contributor.

License: Public Domain (The Unlicense).
