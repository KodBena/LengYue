/**
 * src/lib/timing.ts
 *
 * Central catalog of the application's reactivity-coalescing windows —
 * the debounce and throttle intervals that govern how high-frequency
 * reactive churn (analysis packets, navigation, selection drags,
 * persistence dirty-edges) is batched before it reaches an effectful or
 * expensive consumer.
 *
 * Why this surface exists. Each interval below was already a named,
 * documented constant at its use-site (so each was magic-literal
 * compliant), but they were scattered across composables, components,
 * and services — there was no single place to audit or tune the
 * application's coalescing behaviour. Co-locating them makes that
 * surface auditable.
 *
 * They are deliberately NOT deduplicated. Two knobs that share a value
 * today (the two 250 ms chart-redraw throttles) remain distinct
 * constants, because they answer to different consumers and must be
 * independently tunable — collapsing them would couple unrelated tuning
 * decisions, which is the failure this catalog exists to prevent, not
 * cause.
 *
 * Scope: reactivity-coalescing windows only. Timeouts (analysis /
 * play-from-position), display durations (transient log reveal), and
 * interaction delays (hover popover) are a different category and are
 * intentionally NOT catalogued here — see docs/notes/deferred-items.md
 * ("Scattered non-coalescing timing literals"). User-configurable
 * cadences live in the settings registry, not here; they are noted at
 * the foot of this file as pointers, not owned.
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * Auto-save of analysis bundles: leading-edge schedule, trailing-edge
 * save (`useAutoSaveAnalyses`). A typical analyze-range completing N
 * final packets at ~10–50 ms intervals settles within a few hundred ms;
 * a 2 s window absorbs the burst while keeping the "Saved … just now"
 * subtitle responsive. Larger would feel laggy; smaller would PUT-spam
 * mid-burst.
 */
export const AUTO_SAVE_DEBOUNCE_MS = 2000;

/**
 * BaseChart active-index marker repositioning. Short — the marker is a
 * cheap visual update that should track navigation tightly without
 * re-running on every intermediate keydown of a fast scroll.
 */
export const CHART_MARKER_DEBOUNCE_MS = 60;

/**
 * Timeline selection-range drag → the heavy ECharts-driving consumers.
 * Debounces the dragged range so the expensive downstream redraw fires
 * once the drag settles rather than on every pointer-move. The
 * `useTimelineLogic` default; callers may override per call site.
 */
export const TIMELINE_SELECTION_DEBOUNCE_MS = 150;

/**
 * Stability-heatmap redraw throttle (trailing+leading). 250 ms is the
 * crossover where 4 Hz still feels responsive for slow-moving summary
 * data while reducing redraw work ~15× vs. the upstream packet rate.
 */
export const STABILITY_HEATMAP_REDRAW_THROTTLE_MS = 250;

/**
 * Distribution-chart (KDE / histogram) redraw throttle (trailing+
 * leading). Same 4 Hz rationale as the heatmap. The adaptive phase
 * churns the KDE source every packet (a touched turn forwards a fresh
 * delta for itself and its delta-window neighbours), so the time cap is
 * the lever — a data-changed gate saves nothing there. Distinct from
 * the heatmap throttle despite the shared value: different consumer,
 * independently tunable.
 */
export const DISTRIBUTION_REDRAW_THROTTLE_MS = 250;

/**
 * Engine queue-tooltip open-list redraw throttle (trailing+leading).
 * Same 4 Hz rationale as the heatmap / distribution throttles. While the
 * hover panel is open, every analysis packet churns each row's progress
 * and ETA (`q.progress` / `q.etaMs`), which would re-render the whole
 * table at the packet rate — illegible at that speed. The time cap is
 * the lever, not a data-changed gate: those values change every packet
 * by construction, so a dirty-check coalesces nothing. Distinct from the
 * heatmap / distribution throttles despite the shared 250 ms value:
 * different consumer, independently tunable.
 */
export const QUEUE_TOOLTIP_REDRAW_THROTTLE_MS = 250;

/**
 * Toolbar engine-metrics strip redraw throttle (trailing+leading). Same
 * 4 Hz rationale as the other redraw throttles. `<ToolbarEngineMetrics>`
 * re-renders on two per-packet sources: the current node's `rootInfo`
 * (winrate / scoreLead refine every packet) and `store.engine.metrics`,
 * which analysis-service replaces wholesale on every response (the
 * `lastResponseId` bump in `onAnalysisUpdate`) — so even the 1 Hz PPS and
 * 5 s latency reads churn at the packet rate through object identity.
 * Coalescing the displayed scalars to 4 Hz drops the strip from
 * ~packet-rate to ~4 redraws/sec; the headline numbers to one decimal
 * don't change meaningfully faster. The watchdog dot is intentionally NOT
 * throttled (it stays live so a latency spike flips it promptly).
 * Distinct from the chart / queue throttles despite the shared 250 ms:
 * different consumer, independently tunable.
 */
export const TOOLBAR_METRICS_REDRAW_THROTTLE_MS = 250;

/**
 * Board-rail tab rugplot redraw throttle (trailing+leading). Same 4 Hz
 * rationale as the other redraw throttles. `BoardTab`'s `rugPlot` reads
 * every node on the board's variation path from the ledger to colour a
 * per-move depth meter; during a range query the per-node version refs bump
 * on essentially every packet, so the O(path) colour walk re-runs ~16/s.
 * The cheap per-node visit scan stays live (it must, to track the ledger),
 * but the colour mapping + re-render is coalesced to 4 Hz — a peripheral
 * sidebar strip the user isn't watching mid-stream doesn't need per-packet
 * precision. Distinct from the other throttles despite the shared 250 ms:
 * different consumer, independently tunable.
 */
export const BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS = 250;

/**
 * BaseChart (line / scatter) series-data redraw throttle (trailing+
 * leading). Same 4 Hz rationale as the heatmap / distribution chart
 * throttles. The analysis panels (ScoreLead / MergedDelta / Stability)
 * re-map their `series` prop on every analysis packet, so BaseChart's
 * series watch fires `updateOptions` → ECharts `setOption` (the expensive
 * option-merge) at the packet rate (~24/s). Coalescing the data-driven
 * redraw to 4 Hz cuts that ~6× while the line still visibly refines. Only
 * the streaming data path is throttled — zoom updates stay prompt (they're
 * user-driven and debounced upstream via TIMELINE_SELECTION_DEBOUNCE_MS).
 * NOTE: an earlier rAF (~60 Hz) coalesce of this path was inert because
 * packets are sub-frame-rate; the 4 Hz window is coarser than the packet
 * rate, which is what makes it bite. Distinct from the other chart
 * throttles despite the shared 250 ms: different consumer, independently
 * tunable.
 */
export const BASE_CHART_REDRAW_THROTTLE_MS = 250;

/**
 * Analysis-timeline rug-plot redraw throttle (trailing+leading). Same 4 Hz
 * rationale as the other streaming-redraw throttles, and the consistency
 * partner that keeps the timeline from being the one un-coalesced streaming
 * surface. `AnalysisTimelinePanel`'s `visitVector` (the per-turn visit
 * counts feeding HorizontalTimelineVisualizer) is rebuilt on every analysis
 * packet, redrawing the rug-plot at the packet rate; snapshotting it to 4 Hz
 * coalesces the visualiser's redraw. Lives in the analysis-specific panel,
 * not the band-1 visualiser (which stays cadence-agnostic). Distinct from
 * the other throttles despite the shared 250 ms: different consumer,
 * independently tunable.
 */
export const ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS = 250;

// User-configurable cadences — NOT owned here, listed so this surface is
// a complete map of the application's coalescing behaviour:
//   • persistence sync debounce —
//     store.profile.settings.persistence.debounceInterval (default
//     1000 ms; src/store/defaults.ts), consumed by sync-service.ts.
//   • KataGo report cadence —
//     store.profile.settings.engine.katago.reportDuringSearchEvery
//     (default 0.15 s) and .firstReportDuringSearchAfter (default 0.05 s).
