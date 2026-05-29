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

// User-configurable cadences — NOT owned here, listed so this surface is
// a complete map of the application's coalescing behaviour:
//   • persistence sync debounce —
//     store.profile.settings.persistence.debounceInterval (default
//     1000 ms; src/store/defaults.ts), consumed by sync-service.ts.
//   • KataGo report cadence —
//     store.profile.settings.engine.katago.reportDuringSearchEvery
//     (default 0.15 s) and .firstReportDuringSearchAfter (default 0.05 s).
