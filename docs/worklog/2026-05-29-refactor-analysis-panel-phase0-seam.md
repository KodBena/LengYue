# Worklog — Analysis-Panel Refactor, Phase 0: projection seam (2026-05-29)

Phase 0 of the analysis-panel refactor. Decouples the analysis-tab
orchestrator (`AnalysisDashboard`) from the per-update re-render by moving
the projection + derived state behind a `provide`/`inject` seam. Structural
basis: the render-coupling postmortem's Recommendation 2
(`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`).

## Change

- **New `src/composables/analysis/useAnalysisContext.ts`** — the per-board
  bundle: `useAnalysisProjection` + the dashboard-level derived state
  (`mistakes`, the two distribution series, `useChartNavigation`,
  `engineConnected`). Exposes a typed `provide`/`inject` seam with a
  **fail-loud `injectAnalysisContext()`** (ADR-0002).
- **`AnalysisDashboard.vue` → thin provider.** Calls
  `provideAnalysisContext(boardId)`, keeps the `warmPath` watcher, and lays
  out prop-less panels. It reads **no high-frequency reactive value** in its
  own render, so an analysis packet (or a navigation) no longer re-renders
  the whole subtree.
- **Six panels migrated props → inject** (`AnalysisTimelinePanel`,
  `ScoreLeadPanel`, `MergedDeltaPanel`, `MultiresolutionIntervalPanel`,
  `StabilityPanel`, `StabilityCrossCorrelationPanel`). The two inline
  `DistributionChart` instances were extracted into **`DeltaDistributionPanel`**
  + **`MistakeGapPanel`** (clean registry entries for the later tab phases).
  `StabilityPanel`'s local `store.boards.find` active-index folded into the
  shared `activeMainIndex`.

Behavior-preserving; the panels read the same values, sourced from the
context instead of props.

## Measurement (ADR-0009)

Before/after pair, regime B (navigate while a range query streams).

- before: `~/perf-profiles/capture-during-range-query-rb1.json.gz` (post-RB-1,
  the correct pre-Phase-0 baseline — 30.56 s, 1774 keydowns)
- after:  `~/perf-profiles/capture-during-range-query-phase0.json.gz` (30.99 s,
  1801 keydowns)

> **Baseline correction.** An earlier draft of this table compared against
> `capture-during-range-query.json.gz` — the *original, pre-RB-1* profile —
> which conflated RB-1's Toolbar-decouple win with Phase 0 and produced
> inflated frame/microtask deltas (the discarded −12% / −25% figures). The
> table below is the corrected pre-Phase-0 (`-rb1`) comparison.

| Marker | rb1 (pre-Phase-0) | phase0 | Δ |
|---|---|---|---|
| **AnalysisDashboard render + patch** | 405× / ~3983 ms | **0** | orchestrator re-render eliminated |
| AnalysisChartPanel patch | 1764× / 2520 ms | 1841× / 2541 ms | ~unchanged |
| DistributionChart (direct child) | 264× / 34 ms | — | extracted into wrapper panels |
| DeltaDistributionPanel (new) render+patch | — | 148× / ~1678 ms | encloses the KDE `setOption` |
| MistakeGapPanel (new) render+patch | — | 148× / ~1142 ms | encloses the histogram `setOption` |
| RefreshObserver (frame) p50 | 44.94 ms | 41.55 ms | −7.5% |
| Perform microtasks p50 | 3.36 ms | 3.12 ms | −7% |
| Total CPU (GeckoMain) | 12870 ms | 13995 ms | +8.7% (packet-count — see note) |

**Result:** the `AnalysisDashboard` orchestrator's per-update re-render is
eliminated (405 → 0 markers, ~4.0 s of orchestrator work removed) —
render-coupling instance #3 dissolved, and the container is
immune-by-construction for the tab phases. Per-event costs dropped modestly
(frame p50 −7.5%, microtask-flush p50 −7%).

**The +8.7% total-CPU is scenario, not regression.** The phase0 capture
streamed ~11% more analysis packets than the rb1 capture: Toolbar render
markers +12.7%, microtask-flush count 932 → 1032 (+10.7%), while keydowns were
flat (+1.5%). Per-event costs are flat-to-down, so the higher total CPU tracks
the higher packet count, not Phase 0 — and mechanically it cannot be Phase 0,
since the per-packet render counts are flat once divided by the packet delta.
The captures were not packet-count-matched; a matched recapture (deferred)
would isolate it cleanly, but the per-event deltas already settle it.

**Where the KDE/histogram cost went.** Before Phase 0, the two
`DistributionChart` instances were direct children of `AnalysisDashboard`, so
their synchronous `'pre'`-watcher `setOption` was attributed to the
*dashboard's* patch. Phase 0 extracts them into `DeltaDistributionPanel` /
`MistakeGapPanel`, so that pre-existing per-packet `setOption` (~12 ms
KDE-with-uncertainty, ~8 ms histogram) now surfaces as the wrapper panels'
patches (~1678 / ~1142 ms over the capture). It was re-attributed, not
increased.

**Honest scope of the win:** the *visible panels' own per-packet re-renders
are unchanged* (the `AnalysisChartPanel` count is flat) — they still
`setOption` on their packet-driven data. A follow-up capture with the
cross-correlations panel open (`~/perf-profiles/cc.json.gz`) confirmed (a) the
regime-B per-frame cost is ~78 % of wall-clock spent in
`requestAnimationFrame` chart-redraw callbacks — ~780 ms/s, *identical* across
rb1 / phase0 / cc — and (b) the cross-correlations panel itself is cheap (total
CPU flat-to-lower with it open; its own markers sum ~602 ms). Reducing the
per-frame redraw cost is the **coalescing arc** (gate chart redraws on actual
data-change + a frame budget) and the tab phases (fewer mounted panels), not
Phase 0. Phase 0 delivered exactly its target: the structural decoupling plus a
modest per-event frame win.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped (no regressions).
- Behavior exercised by the regime-B capture (the analysis tab rendered and a
  range query ran during the recording).

## Next

- **Phase 1** — component registry + `<component :is>` dispatch (one "All"
  list, current order; behavior-preserving).
- **Phase 2** — multi-tab schema + persistence migration; render only the
  active tab (fewer mounted panels = the structural regime-B win).
- **Phase 3** — the Settings-tab editor.
- Out of scope (separate arcs): the chart-renderer Port (per-`setOption`
  cost) and RB-3 (packet-receive-path chunking).

License: Public Domain (The Unlicense).
