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

Before/after pair, regime B (navigate while a range query streams), ~31 s,
~1708 / ~1801 keydowns.

- before: `~/perf-profiles/capture-during-range-query.json.gz`
- after:  `~/perf-profiles/capture-during-range-query-phase0.json.gz`

| Marker | Before | After | Δ |
|---|---|---|---|
| **AnalysisDashboard render + patch** | 225× / ~4.6 s | **0** | orchestrator re-render eliminated |
| AnalysisChartPanel patch (= ScoreLead + MergedDelta + Stability charts) | 956× / 2466 ms | 921× / 2475 ms | ~unchanged |
| ScoreLead + MergedDelta + Stability patch | ~2735 ms | ~2749 ms | ~unchanged |
| DistributionChart patch | 168× / 10 ms | 148× / 10 ms | ~unchanged |
| RefreshObserver (frame) p50 | 47.06 ms | 41.55 ms | −12% |
| Perform microtasks p50 | 4.14 ms | 3.12 ms | −25% |

**Result:** the `AnalysisDashboard` orchestrator's per-update re-render is
eliminated (225 → 0) — render-coupling instance #3 dissolved, and the
container is immune-by-construction for the tab phases. Net ~1.1 s of
orchestrator overhead removed over the capture (its own render + regenerating
all panel vnodes + the distribution recompute, per update) → frame p50 −12%,
microtask-flush p50 −25%.

**Honest scope of the win:** the *visible panels' own per-packet re-renders
are unchanged* (the `AnalysisChartPanel` count is flat) — they still
`setOption` on their packet-driven data. Reducing that is the chart-renderer
Port (per-redraw cost) and the tab phases (fewer mounted panels), not Phase 0.
Phase 0 delivered exactly its target: the structural decoupling plus a
modest frame win; the larger regime-B lever is the later phases.

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
