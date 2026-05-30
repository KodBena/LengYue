# Worklog — throttle the BaseChart series redraw to ~4 Hz (2026-05-30)

The RB-2 lever (analysis-panel chart-update coalescing) from
`docs/notes/perf-audit-range-query-nav-2026-05-29.md`, taken on the
streaming-data side. Kept despite a nuanced result — see Validation.

## The coupling

The analysis panels (ScoreLead / MergedDelta / Stability) re-map their
`series` prop on every analysis packet. BaseChart's
`watch(() => props.series, updateOptions)` therefore fires per packet,
calling `chartInstance.setOption(...)` — the expensive ECharts option-merge.
The existing ref-equality dirty-check in `updateOptions` doesn't help: the
data genuinely changes each packet (new refs), so it never short-circuits. At
~24 packets/s, each of the two line charts ran ~24 setOptions/s; the cost
landed in the flush frame (measured as ~3.6 ms `AnalysisChartPanel` patch ×
748 ≈ 2.7 s in capture post_N).

## What shipped

- **`src/lib/timing.ts`**: `BASE_CHART_REDRAW_THROTTLE_MS = 250`, the sixth
  sibling in the catalog's 4 Hz per-packet-churn family.
- **`src/components/charts/BaseChart.vue`**: the series watch now schedules
  `updateOptions` through a trailing+leading `setTimeout` throttle instead of
  calling it directly. `updateOptions` reads the latest props at execution
  time, so the coalesced redraw always reflects the newest data. **Only the
  streaming data path is throttled** — the zoom watch still calls
  `updateOptions` directly (user-driven, debounced upstream via
  `TIMELINE_SELECTION_DEBOUNCE_MS`); legend / marker / initial draw untouched.

## Why 4 Hz and not a frame (the prior revert)

An earlier rAF (~60 Hz) coalesce of this same path was prototyped and reverted
this arc as "count-inert": packets arrive sub-frame-rate (~24/s < 60 Hz), so
coalescing to a frame merges nothing. A 250 ms window is *coarser* than the
packet rate, so it merges ~6 packets per redraw — count-provable where the
rAF attempt wasn't.

## Validation (count-based, ADR-0009)

Identical-load range-fetch captures (post_N → O; ScoreLeadPanel render
374 = 374, BaseChart 748 = 748 — same packet count, no confound):

| | before (post_N) | after (O) |
|---|---|---|
| `setOption` calls (≈ heavy redraws) | ~748 | 103 |
| `AnalysisChartPanel` patch (per-patch) | 3.624 ms | 0.358 ms |
| `ScoreLeadPanel` patch (per-patch) | 4.708 ms | 0.790 ms |

**7.3× fewer ECharts redraws**; the `setOption` cost left the per-packet path
and now lives in ~6.8 `scheduleDataUpdate` setTimeouts/s (≈4 Hz per chart).
**~2.2 s of CPU work removed** from a ~15 s capture (~14%).

**The honest caveat — it's a battery win, not a (demonstrated) latency win.**
The LongTask count did **not** move (10 → 10). A single `setOption` (~3.6 ms)
was always sub-LongTask; the >50 ms blocks come from elsewhere (~1/s,
native/engine-heavy — ECharts paint / packet bursts / GC, TBD). So the charts
are **not** the frame-level bottleneck — confirmed even with this 5× larger
cut than the rAF attempt. Kept anyway because:

- it removes the single largest per-packet CPU cost (battery — the mission's
  downstream goal), and
- de-saturating the main thread during streaming should help
  *nav-during-streaming* responsiveness (the primary goal), which a no-nav
  capture can't measure — to be confirmed with an autonav capture.

The cost is slightly chunkier line-chart refinement (4 Hz vs ~24 Hz), judged
acceptable (user-confirmed).

`npm run build` (`vue-tsc -b && vite build`) green.

## What's left

The residual ~1/s, 50–157 ms LongTasks are the real frame-level lever, and are
independent of the charts. Next: identify their source (the function profile
under a zoomed LongTask is native-dominated — needs a focused dig).

License: Public Domain (The Unlicense).
