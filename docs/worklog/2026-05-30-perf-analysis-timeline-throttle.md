# Worklog — throttle the analysis-timeline rug-plot to ~4 Hz (2026-05-30)

The consistency partner of the streaming-redraw throttle family — without it
`AnalysisTimelinePanel` was the one streaming surface still redrawing per
packet while queue / metrics / BoardTab / BaseChart all coalesced to 4 Hz.

## The coupling

`AnalysisTimelinePanel` binds `<HorizontalTimelineVisualizer
:data-vector="visitVector">`. `visitVector` (the per-turn visit counts feeding
the rug-plot) is rebuilt on every analysis packet, so the panel — and the
nested visualiser — redrew at the packet rate (~19/s).

## What shipped

- `src/lib/timing.ts`: `ANALYSIS_TIMELINE_REDRAW_THROTTLE_MS = 250`, the
  seventh sibling in the 4 Hz family.
- `src/components/charts/AnalysisTimelinePanel.vue`: snapshot `visitVector`
  into a `displayedVisitVector` ref on a trailing+leading throttle, seeded
  synchronously; bind the visualiser to the snapshot. The throttle lives in
  the analysis-specific panel, not the band-1 visualiser (which stays
  cadence-agnostic per ADR-0003). `selectionRange` (user drag) stays prompt.

## Validation (count-based, ADR-0009)

Streaming capture, `<AnalysisTimelinePanel> render` normalized by the untouched
streaming control `<ScoreLeadPanel> render` (= packet count):

| | before (activity) | after (timeline) |
|---|---|---|
| AnalysisTimelinePanel render | 263 | 35 |
| ScoreLeadPanel (control) | 263 | 211 |
| ratio (renders ÷ packets) | 1.00 | 0.166 |

**6.0× fewer renders per packet.** The render rate pinned at ~3.2/s (the 4 Hz
throttle; `scheduleVectorSnapshot` markers fire at 3.5/s), decoupled from the
~19/s packet rate. The nested `<HorizontalTimelineVisualizer>` dropped with it
(263 → 35). Render+patch total ~658 ms → ~113 ms (~5.8×).

`npm run build` green. The streaming-throttle family is now complete — no odd
one out (queue, metrics, BoardTab, BaseChart, analysis-timeline all at 4 Hz).

License: Public Domain (The Unlicense).
