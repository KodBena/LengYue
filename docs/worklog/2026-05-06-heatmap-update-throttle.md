# Heatmap update throttle + canvas renderer + split paths

- **Status:** Shipped on `frontend/heatmap-update-throttle`,
  2026-05-06. One file touched
  (`src/components/charts/HeatmapChart.vue`); build green.
  Closes the Active Small-tier "Heatmap delta-update
  investigation" entry from `docs/TODO.md` and adds a parked
  follow-on (polymorphic chart renderer abstraction) under
  Future projects.
- **Genre:** Performance fix — main-thread saturation on
  fast-backend conditions (KataGo NN-cache hits, proxy
  replay-cache replays); the symptom was visible heatmap
  jankiness during streaming analysis.
- **Date:** 2026-05-06.

## Context

The TODO entry framed the symptom as "the entire chart
re-renders on every analysis-packet arrival, even though each
packet only refreshes a single ray." The investigation
confirmed the symptom but corrected the framing on details:

1. **Per-packet update size.** The proxy emits a sparse delta
   of changed `(s, t)` cells (typically half the triangle for
   that color, since when delta at turn T arrives every
   interval `[s, t]` containing T gets bumped — cf.
   `proxy/bsa.py:314-382` and `proxy/rxp/rxp.py:352-377`). Not
   "a single ray"; not "the whole matrix" either.
2. **Composable behavior.** `useTriangularHeatmap` correctly
   accumulates deltas via the ledger's `mergeTriangular`, but
   rebuilds the entire `HeatmapDatum[]` array on every
   recompute, not delta-aware.
3. **ECharts heatmap behavior.** Reading
   `node_modules/echarts/lib/chart/heatmap/HeatmapView.js`
   confirmed: `render()` calls `this.group.removeAll()` and
   then `_renderOnGridLike` walks the data array creating a
   fresh `graphic.Rect` for every cell. There is **no
   cell-level diff**. Every `setOption` destroys and recreates
   every Rect. Web-search corroboration: ECharts'
   `data-transition` diff is keyed on `name`, which heatmap
   cells don't have; `appendData` is broken for grid heatmaps
   (filed bug); issues #15269 and #8834 confirm the general
   "whole series re-renders on setOption" pattern as a known
   ECharts limitation.

For a typical Go game (200–300 ply) the triangle holds 5k–22k
cells. With the SVG renderer (the file's previous default),
each redraw pushed 5k–22k DOM mutations. RAF-coalescing at the
ledger layer capped this at 60 Hz, but 60 Hz × 22k mutations is
already over budget on slower hardware.

## What changed

`src/components/charts/HeatmapChart.vue` only. Three
independent mitigations:

### 1. Trailing-edge throttle (Fix 1)

A `THROTTLE_MS = 250` window bounds chart redraws to ≤ 4 Hz.
`scheduleUpdate(mode)` collapses changes within the window
into a single fire; `pendingMode` is promoted to the
most-thorough mode requested during the window
(`full > data > axes`), so a sequence of (axes, then data)
collapses correctly. Always renders the latest data because
`flushUpdate` reads props at fire time, not at schedule time.

The first packet after a quiet period fires effectively
immediately (`wait = max(0, 250 - elapsed)` evaluates to 0
when `elapsed > 250`). Subsequent packets within the window
just promote `pendingMode`. The trailing-edge fire reads the
latest props.

The stability heatmap is summary information that changes
slowly even under packet flood; 4 Hz is plenty. Empirically
chosen as the crossover where redraw work drops ~15× while
still feeling responsive.

### 2. Canvas renderer (Fix 2)

`echarts.init(..., { renderer: 'canvas' })` replaces
`{ renderer: 'svg' }`. The previous SVG-renderer comment
("Use SVG renderer for Firefox stability") had no recorded
provenance — no worklog, no commit message, no dispatch — so
the file's claim was load-bearing on a comment whose origin
was lost. Canvas is substantially faster for thousands of
small Rects and is the default for the rest of the chart
surface (`BaseChart.vue` doesn't pass a renderer option, so
ECharts defaults to canvas there too).

If a Firefox-specific regression surfaces, the revert is one
line and the rest of the module is renderer-agnostic. Worth
re-testing if the original Firefox issue resurfaces;
documented inline.

### 3. Split update paths (Fix 3)

Three apply functions instead of one:

- `applyFull()` — full setOption with categories rebuilt.
  Initial render and `maxMoveIndex` change take this path.
- `applyData()` — sends only `series[0].data` and
  `visualMap.{min,max}`. Skips tooltip-formatter and axis
  rebuild.
- `applyAxes()` — sends only `xAxis.{min,max}` and
  `yAxis.{min,max}`. Cheapest path; no series revalidation.

ECharts still calls `removeAll()` inside the heatmap renderer
regardless of which path is taken — the per-cell redraw cost
is unchanged. The win is in option-merge validation cost,
which is small but free given the split exists. The split
also makes the render footprint auditable; future
contributors can tell at a glance which path a change should
take.

All three setOption calls add `lazyUpdate: true`, which
defers ECharts' actual paint to the next animation frame. In
this codebase nothing calls setOption synchronously twice in
the same tick, so the option is harmless when not needed and
useful if that pattern emerges.

### Watcher topology

Single `watch(() => [data, maxMoveIndex, minVal, maxVal,
zoomRange], ...)` becomes three:

- `watch(() => props.maxMoveIndex, () => scheduleUpdate('full'))`
- `watch(() => [props.data, props.minVal, props.maxVal], () => scheduleUpdate('data'))`
- `watch(() => props.zoomRange, () => scheduleUpdate('axes'))`

When multiple props change in the same Vue reactive flush, all
three watchers fire and `scheduleUpdate` promotes
`pendingMode` to the most-thorough mode; only the first call
schedules the timer, so coalescing is automatic.

### Cleanup

`onUnmounted` clears `pendingTimer` before disposing the chart
instance — the throttle's late-firing callback closes over
`chartInstance`, so the cleanup ordering matters. Mirrors the
`markerTimer` cleanup pattern in `BaseChart.vue`.

## Why not Fix D (custom canvas renderer)

Considered: replacing the heatmap chart entirely with a
hand-rolled canvas component that owns the dirty-cell diff.
Would solve the structural problem (no library can give us
incremental heatmap rendering for free — confirmed against
SciChart.js commercial-license, LightningChart commercial,
Plotly.js bundle weight, D3+canvas as basically "Fix D with
data-join helpers"). But Fix 1+2+3 should bring the user-
visible jankiness under control without the rewrite, so
defer.

The polymorphic-renderer TODO entry parks this as an option:
once a `ChartRenderer` Port exists, swapping a single chart
to canvas-from-scratch is independent of the rest of the
chart surface.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- HMR observation: with the dev server running, opening a
  board with cached analysis paints the heatmap immediately
  via `applyFull()` on first render; subsequent panel
  resizes / zoom interactions take the lighter `applyAxes`
  path. Streaming analysis updates flow through the
  `applyData` path bounded at 4 Hz.
- The chart-instance click → cell-click event still routes
  through `params.data.cell` (canvas renderer doesn't change
  the event payload shape).
- The tooltip formatter runs at hover time (lazy), so the
  thumbnail-cache lookups remain correct.

Manual cross-browser testing (Firefox specifically, given the
removed comment) is left as a follow-on observation; the
claim being defended is that the SVG-renderer rationale was
unrecorded, not that Firefox is fine. If the original issue
resurfaces we'll know empirically.

## Forward notes

- The Active Small-tier TODO entry "Heatmap delta-update
  investigation — **priority**" closes via the established
  "moved to Completed" stub; the Frontend Completed table
  receives a one-line synopsis with cross-reference to this
  worklog.
- A new Future-projects entry "Polymorphic chart renderer
  abstraction" is added under `docs/TODO.md`. The user has
  expressed interest in trying alternative renderers
  (custom canvas, Plotly, SciChart, etc.); this entry parks
  the abstraction work without committing to it.
- The proxy keep-alive Phase 1 multi-subscriber non-regression
  test (`docs/dispatch/frontend-to-proxy-keep-alive-middleware.md`)
  no longer has the heatmap as a precondition. Whether that
  test exposes other backpressure issues is a separate
  question.
- The `magic-literal:` comment on `THROTTLE_MS` follows the
  established convention; tunable, no codebase-wide impact if
  retuned.
