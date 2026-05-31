# Worklog — HorizontalTimelineVisualizer data track → canvas (2026-05-31)

After the BoardTab canvas fix, `HorizontalTimelineVisualizer` was the #2
component render in the combined-stress profile (`after_rug_fix.json.gz`:
304 ms over 95 renders, **3.21 ms/render** — the same expensive-per-render
shape BoardTab had).

## Diagnosis

Same anti-pattern. The data track was an `<svg>` with, per render:

- one `<linearGradient>` per segment, each holding **one `<stop>` per turn**
  (the `maxStops` cap was deliberately removed earlier so every turn contributes
  a stop), and
- one `<rect>` per segment.

For a ~340-turn game that's ~340 `<stop>` nodes + per-segment gradients/rects
rebuilt on every render, and the template read `processedSegments`, so every
analysis-driven data update re-rendered the whole component.

The slider, handles, and grid lines are cheap fixed chrome — only the data
track scales with turn count.

## Fix

Canvas for the data track only; the interactive chrome stays DOM.

- The `<svg>` data track → one `<canvas ref="dataCanvas">`. `drawTrack()`
  paints each segment as a single `fillRect` — a flat colour (aggregate mode)
  or a horizontal `createLinearGradient` whose stops reproduce the prior
  per-turn SVG stops (transparent turns clear through to the CSS background,
  unchanged).
- Driven by `watch(processedSegments, drawTrack)` — off the render path.
  `processedSegments` is no longer read in the template, so analysis updates
  redraw the canvas without re-rendering the component; it now renders only on
  `modelValue` (slider) change, which is cheap (no per-turn elements).
- Backing store sized to `clientWidth × devicePixelRatio`, cached from a
  `ResizeObserver` (no forced reflow on the draw path).
- **Interaction preserved**: the per-rect `@mousedown` segment-select moves to
  one canvas `onDataMouseDown` (maps cursor x → turn index → segment via the
  existing `getIndexFromEvent`). The slider/handle drag handlers and grid lines
  are untouched (DOM). The per-segment `:hover { filter: brightness }` is
  dropped — a minor affordance not worth a mousemove redraw loop.

Same canvas-over-per-element reasoning as BoardTab and HeatmapChart.

## Expected

`HorizontalTimelineVisualizer` render drops from ~3.21 ms toward near-zero;
analysis-driven data updates become a sub-millisecond `fillRect` loop instead of
a full re-render with ~340 SVG nodes. ~300 ms of the combined-stress
component-render budget recovered. Build green; the only 2 suite failures are
the pre-existing `useAutoSaveAnalyses` fake-timer flakes.

## Validation (pending capture)

Confirm the `<HorizontalTimelineVisualizer> render` mark's total + count drop,
and that the segment-click still selects a range in the running app.

License: Public Domain (The Unlicense).
