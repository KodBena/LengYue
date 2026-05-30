# Worklog — shared throttle mechanism + hoisted family cadence (2026-05-30)

DRY pass over the subscriber-projection redraw throttles. Seven surfaces
(queue tooltip, ToolbarEngineMetrics, BoardTab rugplot, BaseChart,
AnalysisTimelinePanel, DistributionChart, HeatmapChart) each hand-rolled the
identical leading+trailing `setTimeout` boilerplate — well past this codebase's
composable-extraction threshold. They now share one mechanism, and (the user's
call) one default cadence.

## What shipped

- **`src/composables/useThrottledSnapshot.ts`** (new, `[B1]`):
  - `createTrailingThrottle(fn, ms): { schedule, cancel }` — the pure timer
    primitive (the copy-pasted core).
  - `useThrottledSnapshot(source, ms): Ref<T>` — sugar for the common shape: a
    ref mirroring `source` at ≤ the cadence, seeded synchronously, timer
    released on unmount.
- **Rewired all seven**:
  - Plain snapshot via the sugar: ToolbarEngineMetrics (a derived `liveMetrics`
    computed), BoardTab (`rugVisits`), AnalysisTimelinePanel (`visitVector`).
  - Primitive + consumer-specific logic kept: EngineQueueTooltip (open-gate +
    seed-on-open), BaseChart (callback `updateOptions`), DistributionChart
    (expanded-gate), HeatmapChart (mode-accumulation).
- **`src/lib/timing.ts` — hoisted family cadence**:
  `SUBSCRIBER_PROJECTION_REDRAW_THROTTLE_MS = 250` is the shared default; the
  seven per-surface constants now source from it, so the common cadence is one
  ergonomic knob. Each keeps its own named constant — a single surface diverges
  by sourcing a literal (override, not collapse). The catalog header is
  rewritten from "deliberately NOT deduplicated" to the family discipline: the
  subscriber-projection family shares a default; OTHER families (marker /
  selection debounces, auto-save) stay fully independent.

## NOT a global clock

Each surface keeps its own throttle instance (own timer). A single shared clock
would phase-align every projection into one synchronised burst per window — the
cross-component analogue of the O(N)-burst the tree group-memo hit — and would
lose leading-edge responsiveness. The shared things are the mechanism and the
default cadence, not the clock. Documented in the composable + the timing
header.

## Behaviour-preserving

Same throttle, same constant values, same per-consumer logic → count-preserving,
build-gated (`vue-tsc -b && vite build` green), no re-capture needed. One
micro-nuance: where the snapshot source is a derived `computed`
(ToolbarEngineMetrics' `liveMetrics`), the cheap formatting (`toFixed`) now
evaluates per-packet inside that computed rather than at 4 Hz — but it triggers
no extra renders (the throttled snapshot still publishes at 4 Hz), so the render
counts the throttles exist to bound are unchanged.

License: Public Domain (The Unlicense).
