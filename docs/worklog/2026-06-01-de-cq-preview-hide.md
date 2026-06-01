# De-CQ the analysis-panel preview-hide (remove per-style-flush container-query recompute)

- **Status:** Done 2026-06-01 (frontend).
- **Genre:** Render-performance hygiene (forced style+layout reduction); ADR-0009 measured.
- **Date:** 2026-06-01.
- **Touches:** `frontend/src/components/charts/AnalysisChartPanel.vue`.

## The item

`docs/notes/deferred-items.md` "Analysis-panel container-query recompute under
chart redraw" (surfaced 2026-05-31). `.linear-content` declared
`container-type: inline-size` to drive `@container (max-width: 379px) {
.preview-box { display: none } }` — hide the 140px thumbnail when the panel is
too narrow. But ECharts' canvas text rendering forces a synchronous style flush
per redraw, and a container query re-evaluates on every flush, so the recompute
scaled with (forced flushes × visible panels) — a per-nav style-recalc tax with
charts visible. A Firefox capture logged it as **907 `UpdateContainerQueryStyles`
/ ~186 ms**.

## The fix

Replace the container query with a `ResizeObserver`-toggled `.narrow` class
(ADR-0010 imperative-escape: `ResizeObserver`-cached geometry, released in
`onUnmounted`; idempotent boolean toggle so a non-threshold-crossing resize
re-renders nothing). The observer fires only on **actual width changes**, not
per style flush. Same responsive behaviour; the 379px threshold is preserved
(`PREVIEW_HIDE_BELOW_PX`). No semantic/visual change.

Dropping `container-type` also drops its implied layout/size containment —
analysed as safe here (chart-area + preview-box are fixed-size canvas content,
nothing inside reflows in a way containment would scope) and **confirmed** by the
measurement below (layout went down, not up).

## Measurement (ADR-0009)

The Firefox `UpdateContainerQueryStyles` marker has **no Chrome-named event**
(confirmed: zero "container" events in a Chrome trace) — so the recompute is not
directly countable in Chrome. But the container query was *forcing extra
synchronous style+layout passes*, which **is** countable as
`Blink.ForcedStyleAndLayout.UpdateTime`.

Method: headless Chromium via `scripts/perf-capture.mjs nav-range --visits 1000
--model b10`, **15 runs before / 15 after**, cold cache each (the scenario's
`clearCache()` sends `clear_cache` and is awaited per run — warm cache shortens
receive latency and inflates packet/redraw counts non-comparably). Normalised to
per-chart-render to control for the timing-dependent redraw count
(`BaseChartRender` 408→420 median, comparable). Counts-not-wall-clock: the count
leads; durations are the noisy proxy.

| metric (median of 15) | before | after | Δ |
|---|---|---|---|
| `ForcedStyleAndLayout` count | 417 | 336 | **−19.4%** |
| forced flushes / chart-render | 1.027 | 0.811 | **−21.0%** |
| `Layout` duration | 129.5 ms | 120.0 ms | −7.3% |
| `recalcStyle` / `UpdateLayoutTree` duration | 74.5 / 111.4 | 75.0 / 111.0 | flat |
| `recalcStyle` / `UpdateLayoutTree` / `Layout` count | 221 / 221 / 211 | 218 / 218 / 207 | ~−1.5% |

**Read:** the container query forced ~1-in-5 extra synchronous style+layout
invocations per redraw; removing it eliminates them — a clean, stable **count**
reduction. The wall-clock translation is modest (`Layout` −7%, recalc/tree time
flat: the removed forced passes were largely cheap no-op flushes), and there is
**no regression** (layout count *and* time fell, so the containment removal was
safe). Honest framing: ~19% fewer forced reflows for a few-% layout-time gain,
zero semantic change.

## Reproduce

```
cd frontend
for i in $(seq 1 N); do node scripts/perf-capture.mjs nav-range --visits 1000 --model b10; done
# parse each trace for Blink.ForcedStyleAndLayout / recalcStyle / UpdateLayoutTree
# / Layout counts+durations + <BaseChart> render count; normalise per-render.
```

(Headless is the right mode here — the metric is style/layout, not paint, and
headless drops vsync/compositor jitter for reproducible counts.)

## Verification

`vue-tsc -b` clean · `eslint .` clean · charts render unchanged across all 30
capture runs (`<BaseChart> render` present every run).

## License

Public Domain (The Unlicense).
