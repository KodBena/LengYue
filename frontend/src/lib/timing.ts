/**
 * src/lib/timing.ts
 *
 * Central catalog of the application's timing constants — every
 * authored time-based literal (debounce/throttle windows, timeouts,
 * display durations, interaction delays, polling cadences, render
 * retries, and the engine wire-protocol floor), co-located on one
 * auditable surface.
 *
 * Co-location is NOT collapse. Each constant is its own named export
 * with its own value; tuning one does not move another. The only
 * shared values are the genuine families — the subscriber-projection
 * redraw throttle (§1) and the cases where the same decision was
 * literally duplicated across sites (the interaction-dismiss grace,
 * the chart render-retry). Constants that answer to unrelated
 * decisions keep independent values even when they happen to coincide
 * today; collapsing THOSE would couple unrelated tuning, the failure
 * this catalog exists to prevent.
 *
 * Bands (ADR-0003). Most of this file is band-1 (substrate timing, no
 * game/engine vocabulary — a chess/shogi port reuses it). §7 is
 * engine-coupled (band-2/3): it names KataGo / engine-session timing.
 * The sections are labelled so the band boundary is explicit rather
 * than silently mixed; `frontend/FILES.md` tags this file accordingly.
 *
 * NOT owned here (pointers, not values):
 *   - User-configurable cadences live in the settings registry
 *     (`store/defaults.ts`): persistence sync debounce, the KataGo
 *     report cadences, the persisted PV-animation timings
 *     (`session.ui.pvAnimation`), and the move-suggestions fade (a
 *     knob default). These are runtime-user-owned, not constants.
 *   - CSS transition durations are theme tokens
 *     (`assets/css/theme.css`: `--duration-default`, `--duration-slow`),
 *     reachable from CSS, not TS.
 *   - `waitForAnalysis`'s timeout is caller-supplied (a parameter,
 *     not a constant).
 *
 * Why this surface exists. Each value below was already a named or
 * commented literal at its use-site (magic-literal compliant), but
 * they were scattered across composables, components, services, and
 * the engine layer — there was no single place to audit or tune the
 * application's time-based behaviour. Co-locating them makes that
 * surface auditable (work-status `scattered-timing-literals`).
 *
 * License: Public Domain (The Unlicense)
 */

// ═══════════════════════════════════════════════════════════════════
// §1 — Reactivity-coalescing windows  [band-1]
// Debounce/throttle intervals that batch high-frequency reactive churn
// (analysis packets, navigation, selection drags, persistence dirty-
// edges) before it reaches an effectful or expensive consumer.
// ═══════════════════════════════════════════════════════════════════

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
 * Subscriber-projection redraw cadence — the shared default for the family
 * of throttles below (queue / metrics / BoardTab / the charts / the analysis
 * timeline). These are the views that subscribe to the live engine/analysis
 * data and project it at a refresh cadence; this one knob is "how fast do
 * live-projected views refresh." 4 Hz is the crossover where such a view
 * still feels responsive while coalescing per-packet churn ~6–15× down to a
 * human-comfortable rate. The per-surface constants source this; override one
 * to a literal to diverge. The MECHANISM these throttles share is
 * `composables/useThrottledSnapshot.ts`; the CADENCE they share is here.
 * NOT a global clock — each surface keeps its own timer, so their fires stay
 * phase-offset and the redraw load stays distributed.
 */
export const SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS = 250;

/**
 * Stability-heatmap redraw throttle (trailing+leading). 250 ms is the
 * crossover where 4 Hz still feels responsive for slow-moving summary
 * data while reducing redraw work ~15× vs. the upstream packet rate.
 */
export const STABILITY_HEATMAP_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

/**
 * Distribution-chart (KDE / histogram) redraw throttle (trailing+
 * leading). Same 4 Hz rationale as the heatmap. The adaptive phase
 * churns the KDE source every packet (a touched turn forwards a fresh
 * delta for itself and its delta-window neighbours), so the time cap is
 * the lever — a data-changed gate saves nothing there. Distinct from
 * the heatmap throttle despite the shared value: different consumer,
 * independently tunable.
 */
export const DISTRIBUTION_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

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
export const QUEUE_TOOLTIP_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

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
export const TOOLBAR_METRICS_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

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
export const BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

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
export const BASE_CHART_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

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
export const ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS = SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS;

// ═══════════════════════════════════════════════════════════════════
// §2 — Interaction-dismiss grace  [band-1]
// ═══════════════════════════════════════════════════════════════════

/**
 * Grace window before a transient interactive surface (hover popover,
 * autocomplete suggestion list) hides itself after the interaction that
 * sustained it ends. Long enough that a click/`mousedown` on a
 * suggestion `<li>` lands before the `@blur`-driven hide fires; short
 * enough to feel immediate. Shared by the hover-popover close grace
 * (`useHoverPopover`) and the tag/player suggestion-hide delays
 * (`CardMetadataPanel`, `LibraryPlayerFilter`, `MintCardModal`) — one
 * decision, formerly copied as four `150` literals.
 */
export const INTERACTION_DISMISS_DELAY_MS = 150;

// ═══════════════════════════════════════════════════════════════════
// §3 — Display durations  [band-1]
// ═══════════════════════════════════════════════════════════════════

/**
 * Auto-hide for the transient log reveal (`useTransientLogReveal`): how
 * long a freshly-arrived system message stays surfaced before the reveal
 * collapses. 8 s is long enough to read a short message, short enough
 * not to linger.
 */
export const TRANSIENT_LOG_REVEAL_MS = 8000;

// ═══════════════════════════════════════════════════════════════════
// §4 — Chart render-retry  [band-1]
// Re-attempt intervals while an ECharts container is awaiting layout.
// ═══════════════════════════════════════════════════════════════════

/**
 * ECharts init re-attempt delay while the chart container has not yet
 * acquired layout (clientHeight/clientWidth still 0). Empirically
 * reliable for the codebase's flex-based chart wrappers. Shared by
 * `BaseChart` and `HeatmapChart` — one decision, formerly two `100`
 * literals hand-synced by comment.
 */
export const CHART_INIT_RETRY_MS = 100;

/**
 * Forest-render re-attempt delay while the ECharts forest instance is
 * not yet sized (`useEChartsForestRender`). Shorter than CHART_INIT_RETRY_MS
 * — a distinct consumer with its own tuned value; independently tunable.
 */
export const FOREST_RENDER_RETRY_MS = 50;

// ═══════════════════════════════════════════════════════════════════
// §5 — Micro-scheduling  [band-1]
// ═══════════════════════════════════════════════════════════════════

/**
 * Next-tick visibility-flip defer (`use-pv-animation`): pushes a state
 * change out of the current synchronous batch so Vue's reactive tracking
 * sees it as a separate update cycle. Functionally a `queueMicrotask`
 * made explicit as a 1 ms timeout.
 */
export const NEXT_TICK_DEFER_MS = 1;

// ═══════════════════════════════════════════════════════════════════
// §6 — Dev-only perf harness  [band-1, DEV]
// Stress-cadence constants for the perf-capture harness; no production
// runtime reads these.
// ═══════════════════════════════════════════════════════════════════

/**
 * Half-period of the popover open/close stress cycle (`useAutoPopoverPerf`,
 * `perf/stimuli`). 250 ms open + 250 ms closed (~2 toggles/sec) is fast
 * enough to stress, slow enough that each phase completes a render + paint
 * so per-toggle cost is cleanly attributable. Formerly duplicated as
 * `HALF_PERIOD_MS` / `DEFAULT_HALF_PERIOD_MS`.
 */
export const POPOVER_STRESS_HALF_PERIOD_MS = 250;

/**
 * Target auto-navigation cadence for the perf harness (`perf/autonav`).
 * 60 Hz pins the auto-driven rate independent of the monitor refresh rate
 * (a 120/144 Hz panel would otherwise over-drive). See
 * `docs/notes/perf-capture-normalization-protocol.md`.
 */
export const AUTONAV_TARGET_HZ = 60;

/** Fixed-timestep interval derived from {@link AUTONAV_TARGET_HZ}. */
export const AUTONAV_MIN_STEP_INTERVAL_MS = 1000 / AUTONAV_TARGET_HZ;

// ═══════════════════════════════════════════════════════════════════
// §7 — Engine-coupled timing  [band-2/3 — KataGo / engine-session vocabulary]
// These name engine-analysis and engine-session timing; they are NOT
// portable to a non-KataGo backend unchanged, so they are band-2/3 and
// sectioned apart from the substrate timing above.
// ═══════════════════════════════════════════════════════════════════

/**
 * Maximum wait for the KataGo final analysis after a user's submitted
 * review move (`useReviewSession`). Exceeding it is treated as a hang:
 * the review is cancelled (status → IDLE) and a warning surfaced. Auto-
 * retry is deliberately NOT implemented — it would mask real engine
 * problems behind silent repeated timeouts.
 */
export const KATAGO_ANALYSIS_TIMEOUT_MS = 30_000;

/**
 * Default per-move timeout in the engine-play loop (`usePlayFromPosition`):
 * how long to wait for an engine move before giving up. (Renamed from the
 * generic `DEFAULT_TIMEOUT_MS` for catalog clarity.)
 */
export const ENGINE_PLAY_MOVE_TIMEOUT_MS = 60_000;

/**
 * Query-ETA decrement tick (`useQueryTelemetry`): keeps the displayed ETA
 * counting down between analysis packets (e.g. during the proxy's queue-
 * wait), so it doesn't freeze when no packets arrive.
 */
export const QUERY_ETA_TICK_MS = 1000;

/**
 * Engine metrics-update interval (`analysis-service`): once-per-second
 * packet-rate (PPS) refresh — the conventional cadence for engine-status
 * displays.
 */
export const ENGINE_METRICS_TICK_MS = 1000;

/**
 * Engine version/heartbeat poll interval (`analysis-service`): re-reads the
 * upstream version payload on a slow cadence to keep `store.engine.info`
 * current and the session alive.
 */
export const ENGINE_HEARTBEAT_POLL_MS = 5000;

/**
 * KataGo `firstReportDuringSearchAfter` protocol floor (seconds). The
 * minimum the wire protocol documents; reverted to it 2026-05-25 with the
 * retirement of the F-optimizer cohort (see
 * `docs/notes/retrospective-katago-f-optimizer-2026-05.md`). Distinct unit
 * (seconds, not ms) — it is a wire-protocol parameter, not a UI delay.
 */
export const KATAGO_FIRST_REPORT_FLOOR_S = 0.001;

// User-configurable cadences — NOT owned here, listed so this surface is
// a complete map of the application's timing behaviour:
//   • persistence sync debounce —
//     store.profile.settings.persistence.debounceInterval (default
//     1000 ms; src/store/defaults.ts), consumed by sync-service.ts.
//   • KataGo report cadence —
//     store.profile.settings.engine.katago.reportDuringSearchEvery
//     (default 0.15 s) and .firstReportDuringSearchAfter (default 0.05 s).
//   • PV-animation timings — store.profile.session.ui.pvAnimation
//     (stepDelayMs / windowDurationMs / fadeDurationMs; defaults in
//     src/store/defaults.ts and use-pv-animation's PV_DEFAULTS seed).
//   • Move-suggestions fade — a knob default (moveSuggestionsFadeMs).
