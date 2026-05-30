# Worklog — throttle the BoardTab rail rugplot to ~4 Hz (2026-05-30)

The next lever after the toolbar-metrics throttle, and the biggest single
**non-chart** per-packet renderer in the streaming-range-query captures.

## The coupling

`BoardTab`'s `rugPlot` computed (read in the template `v-for`) colours a
per-move analysis-depth meter by reading `ledger.getRaw(activeConfigHash, id)`
for **every node on the board's variation path**. The ledger keys a per-node
reactive version ref per `getRaw`, so during a range query — which streams
packets for many path nodes — `rugPlot` invalidates on essentially every
packet (rAF-coalesced to ≤1/frame) and recomputes the whole path's colours.
`useVariationPath` is fingerprint-stabilised, so `path.value` is stable during
streaming; the churn is purely the ledger reads. Two stacked costs: per-packet
**frequency** (~16/s) and O(path) **work** (a ledger lookup + `log1p` +
colour-LUT walk per node) — the most expensive per-render component in the
capture (render 4.2 ms + patch 2.2 ms ≈ 6.4 ms × 499 ≈ **3.2 s** in capture M).

## What shipped (Option B — split visits from colours)

- **`src/lib/timing.ts`**: `BOARD_TAB_RUGPLOT_REDRAW_THROTTLE_MS = 250`, the
  fifth sibling in the catalog's 4 Hz per-packet-churn family.
- **`src/components/board/BoardTab.vue`**: the rugplot work is split.
  `rugVisits` (new) is the cheap, per-packet-reactive half — it stays
  subscribed to the per-node ledger version refs (so it tracks every packet)
  but does only map lookups, no colour maths. A trailing+leading `setTimeout`
  throttle snapshots it into `displayedVisits` at ≤4 Hz, and `rugPlot` derives
  the colours from that snapshot. So the per-packet path does no colour work,
  and the expensive O(path) walk **and** the re-render both run at 4 Hz. The
  template is unchanged (`rugPlot` still emits `{ idx, visits, color }[]`).
  - `displayedVisits` is seeded synchronously so the meter paints on mount.
  - **Deliberate tradeoff:** navigation is throttled along with streaming, so
    the tab strip's meter lags a path change by ≤250 ms. Judged imperceptible
    for a peripheral sidebar indicator; a prompt-on-path-change seed is the
    cheap escalation if it ever reads as laggy.

## Validation (count-based, ADR-0009)

Streaming-range-query captures, `<BoardTab> render` markers:

| | before (M) | after (N) |
|---|---|---|
| duration | 31.06 s | 31.39 s |
| `<BoardTab> render` | 499 | 117 |
| render rate | 16.07 / s | 3.73 / s |

**Confound minimal — near-identical load.** Per-packet control components
untouched by this change barely moved (N ~3 % heavier): ScoreLeadPanel
499→514, BaseChart 998→1026, AnalysisChartPanel 998→1027. Load-normalized
(renders ÷ ScoreLeadPanel): `499/499 = 1.00` → `117/514 = 0.228` = **4.4×
fewer**. The render rate pinned at ~3.7/s — the throttle decoupled it from the
~16/s packet cadence (`scheduleVisitsSnapshot` markers fire at ~135–246 ms).
Each render still does the same O(path) colour walk (not made cheaper
per-render, just ~4.3× less frequent), so BoardTab's ~3.2 s render+patch
footprint drops by that factor — it leaves the per-packet tier and joins the
throttled components (queue 138, metrics 129, BoardTab 117).

The residual per-packet cost is the cheap `rugVisits` scan (map lookups, no
colour), which is not a `<BoardTab> render` and is provably negligible.

`npm run build` (`vue-tsc -b && vite build`) green.

## What's left

The remaining per-packet renderers are the analysis chart panels — the
perf-audit note's **RB-2** chart-update-coalescing lever, where the ECharts
redraws dominate *patch* time (ScoreLeadPanel + MergedDeltaPanel patch ≈
4.85 s in M) — and the timeline visualiser. The charts are now the clear #1
remaining cost; see `docs/notes/perf-audit-range-query-nav-2026-05-29.md`
RB-2. They were tried-and-reverted in the *nav* scenario, so streaming-side
chart coalescing is its own investigation.

License: Public Domain (The Unlicense).
