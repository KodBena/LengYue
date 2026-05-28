# Worklog — Perf RB-1: decouple App.vue from engine metrics (2026-05-29)

The first regime-B fix from `docs/notes/perf-audit-range-query-nav-2026-05-29.md`.
Stops App.vue re-rendering the whole tree on every engine-metric tick during
a live range query. Same shape as Arc 2 (App-decouple), but for the streaming
engine metrics rather than the move cursor.

## Change

App.vue's template read `engineControls.status.value` /
`engineControls.metrics.value` to pass to `<Toolbar>`. During a range query
those metrics tick continuously (~25/s), so App's render fn re-ran and
re-patched the whole tree on every tick. The fix moves those reads into the
leaf that displays them.

- **`frontend/src/components/chrome/Toolbar.vue`** — self-sources `metrics` /
  `isConnected` via `useEngineControls()` (store-backed computeds, safe to
  call again); drops the `engineStatus` / `metrics` props and the now-unused
  `EngineStatus` / `EngineMetrics` type import; `watchdogClasses` reads the
  composable's `metrics`.
- **`frontend/src/App.vue`** — drops `:engine-status` / `:metrics` on the
  `<Toolbar>` binding. App now reads `engineControls` only for the stable
  `toggle` handler — no metric reads, so no metric-driven re-render.

## ADR-0004 note

`useEngineControls` exposes `status` / `metrics` as
`computed(() => store.engine.status/metrics)` — store-backed, no local state
— so calling it from `Toolbar` returns the same store-derived refs (no
divergence). `Toolbar` already read `store.engine` directly for `info` /
`pingPendingSince` / `selectedModel`, so self-sourcing status/metrics matches
its existing shape.

## Measurement (ADR-0009)

Before/after profile pair, same scenario (navigate while a range query
streams, Analysis tab open). ~31 s, ~1700 keydowns each.

- `~/perf-profiles/capture-during-range-query.json.gz` (before)
- `~/perf-profiles/capture-during-range-query-rb1.json.gz` (after)

| Marker | Before | After | Δ |
|---|---|---|---|
| RootErrorBoundary render+patch (App whole-tree) | 531 / ~1047 ms | **0** | eliminated |
| Toolbar render+patch | 672 / ~666 ms | 628 / ~584 ms | persists (genuine metric display, now isolated) |
| AnalysisChartPanel patch | 956 / 2466 ms | 882 / 2447 ms | unchanged (RB-2) |
| ScoreLead + MergedDelta patch | ~2091 ms | ~2147 ms | unchanged (RB-2) |
| RefreshObserver (frame) p50 | 47.06 ms | 44.94 ms | −4.5% |
| Perform microtasks p50 | 4.14 ms | 3.36 ms | −19% |

**App re-rendered the whole tree 531× during the range query before; 0 after**
(no board/tab switch in this capture). The metric-driven coupling is gone.

### Honest framing of the residual

The frame budget improvement is modest (−4.5% on `RefreshObserver` p50; the
median frame is still ~45 ms) because RB-1 cleared only ~1 s of the ~15 s
busy time. The regime-B frame cost is dominated by **RB-2** (analysis-panel
chart re-renders, ~4.5 s — ECharts `setOption` per packet) and **RB-3**
(synchronous/unchunked packet receive path, ~2.35 s, 73 ms blocks), both
untouched here. RB-1 removed real architectural waste (the whole-tree
re-render during analysis); the perceived sluggishness needs RB-2 + RB-3.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped (no regressions).

## Not in scope

- **RB-2** — analysis-panel chart-update coalescing (the dominant ~4.5 s) →
  the analysis-panel refactor (this profile is its before-anchor too).
- **RB-3** — packet-receive-path chunking (~2.35 s, the 73 ms blocks) → its
  own arc, medium risk.

License: Public Domain (The Unlicense).
