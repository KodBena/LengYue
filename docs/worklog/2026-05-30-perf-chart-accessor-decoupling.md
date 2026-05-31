# Worklog — chart render-coupling: preview-box + cursor accessor decoupling (2026-05-30)

*(Backfilled the same day from commits `bc7dcd6`, `e4727b5` — the
validation counts below are those the commits recorded.)*

Two fixes on the render-coupling perf sweep, both instances of the
render-coupling-at-composition-nodes anti-pattern
(`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`)
applied to the analysis charts: a **value** prop threaded through a
composition node re-renders every consumer on the path when the value
changes, even those whose render never reads it. The postmortem's contract
is to pass an **accessor thunk** (`() => value`) instead, so only the leaf
that actually reads it in its render re-renders — the read-coupling is
dissolved, not relocated.

## Preview-box (`bc7dcd6`)

ScoreLeadPanel / MergedDeltaPanel threaded their per-navigation hover
thumbnail (`preview`) through AnalysisChartPanel as a value prop, so every
thumbnail update re-rendered the chart host and the panel — even though only
the sibling preview-box changed and BaseChart itself already skipped.

Fix: a new isolated `<ChartPreviewBox>` leaf reads the thumbnail by invoking
an accessor (`() => preview.value`) in its own render; the panels pass the
stable thunk, so neither the panel nor the host reads `preview.value`.

Count-validated (regime-B capture, 167 navs), per-chart component renders:

| component | before | after |
|---|---|---|
| AnalysisChartPanel | 470 | 310 |
| ScoreLeadPanel | 471 | 310 |
| MergedDeltaPanel | 470 | 310 |
| ChartPreviewBox | — | 165 |

~329 host/panel re-renders eliminated; the inherent `v-html` SVG render moved
to the bare leaf (after == BaseChart's own 310 — the preview gap closed).

## Cursor (`e4727b5`)

`activeIndex` (the chart cursor) threaded down as a value prop through the
ScoreLead / MergedDelta / Stability panels → AnalysisChartPanel → BaseChart,
re-rendering all three on every navigation — even though only BaseChart
consumes it (for the marker), and only in a watch + `updateMarker`, never in
its template.

Fix: BaseChart's prop becomes `activeIndexAccessor: () => number | null`,
read in the marker watch / `updateMarker` (not the template), so the cursor
no longer enters any component's render path; the marker still updates via
its debounced watch. Panels pass stable thunks; AnalysisChartPanel forwards
without invoking. ReviewSessionPanel (the other BaseChart user) never passed
`activeIndex`, so the interface stays single and clean — no dual prop.

Count-validated, then timed via the fixed-step-window protocol
(regime-B, 167 navs; H = preview-fix-only → I = + cursor):

| metric | before (H) | after (I) |
|---|---|---|
| chart-subtree renders / chart | 310 | 139  (−55%; now == series-changes) |
| per-nav frame time (median) | 100.2 ms | 88.9 ms  (−11%) |

Corroborated: aligned 130-step window −12.5 %, LongTask p50 −12.7 %.
Scenario-matched (same nav steps), and not a clock artifact — capture I ran
at *higher* CPU-utilization, so the gain holds despite a heavier environment
(the count/within-run discipline in
`docs/notes/perf-capture-normalization-protocol.md`). Still ~1 LongTask/nav
(~89 ms): less janky, not un-janky.

## Docs

- `FILES.md`: new `ChartPreviewBox.vue` entry (in `bc7dcd6`).
- No `FEATURES.md` change — pure render-path refactor; charts, previews, and
  cursor behave identically.

License: Public Domain (The Unlicense).
