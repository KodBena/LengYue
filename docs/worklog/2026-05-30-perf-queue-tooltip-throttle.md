# Worklog — queue-tooltip open-list redraw throttle (2026-05-30)

Part of the render-coupling perf sweep on
`bork/perf/autonav-harness-geiger-excision` (the green-application arc:
latency-responsiveness first, battery a downstream win). The popover-stress
capture harness (commit `1f62c3d`, the autonav analog for toolbar popovers)
surfaced this as its first fix: while the engine queue tooltip is hovered
open, its in-flight-query list re-rendered on **every analysis packet**.

## The coupling

`useQueryTelemetry` rebuilds `inFlight` — a fresh array of fresh objects — on
every `recordPacket`, by design, so each row's ETA / progress stay live. The
tooltip's `v-for="q in inFlight"` read those per-packet fields
(`fmtProgress(q)` over `q.progress`, `fmtEta(q.etaMs)`), so the whole table
re-rendered at the packet rate whenever the popover was open. The ETAs and
visit counts churn far faster than a human can read; the redraw is waste.

## What shipped

- **`src/lib/timing.ts`**: new `QUEUE_TOOLTIP_REDRAW_THROTTLE_MS = 250`, the
  third sibling in the catalog's 4 Hz per-packet-churn family
  (`STABILITY_HEATMAP_REDRAW_THROTTLE_MS`, `DISTRIBUTION_REDRAW_THROTTLE_MS`).
  Kept distinct per the catalog's explicit no-dedup discipline — different
  consumer, independently tunable.
- **`src/components/chrome/EngineQueueTooltip.vue`**: the open list now renders
  from a throttled `displayRows` snapshot of **plain, pre-formatted strings**
  (kind / model / progress / ETA / cancellability), rebuilt at most every
  250 ms. Formatting the reactive fields *inside* the throttled callback and
  storing plain values is what severs the coupling — the template no longer
  touches `q.progress` / `q.etaMs`. The badge `count` stays live (it changes
  only on query add/remove, already value-stable per packet, so it never drove
  a per-packet render).
  - Hand-rolled trailing+leading `setTimeout` throttle matching the two sibling
    chart consumers (`DistributionChart` / `HeatmapChart`), **not** lodash:
    `lodash-es` is a declared dep but unused in `src`, and matching the siblings
    keeps the `onUnmounted` clear-before-teardown discipline identical.
  - **A closed popover schedules nothing** (its list isn't rendered, so
    rebuilding `displayRows` would be pure waste — mirrors DistributionChart's
    collapsed-panel gate). A `watch(open)` seeds `rebuildRows()` synchronously
    on open (default `'pre'` flush, before the popover renders) so there is no
    stale/empty flash.

## Validation (ADR-0009 — count-based; cross-run via counts, not wall-clock)

Popover-stress captures (toggle the queue tooltip at ~4 Hz while a range query
streams), `<EngineQueueTooltip> render` UserTiming markers counted:

| | before (`J.json.gz`) | after (`L.json.gz`) |
|---|---|---|
| `<EngineQueueTooltip> render` | 332 | 89 |
| popover open-windows | 40 | 37 |

**Confound ruled out.** A raw 332→89 could be inflated if L merely toggled over
an *idle* queue. Per-packet components untouched by this change confirm the
opposite — L was ~14 % *less* loaded: BaseChart 726→626, AnalysisChartPanel
726→625, ScoreLeadPanel 363→312, BoardTab 363→312. Load-normalized (queue
renders ÷ ScoreLeadPanel renders, cancelling the streaming-load difference):
`332/363 = 0.91` → `89/312 = 0.29` = **3.2× fewer queue-tooltip renders per
unit of streaming**.

**The harness understates the real-world win.** Most of L's residual 89 is
*structural*: the stress harness opens+closes the popover 37×, and each toggle
forces a render the throttle cannot remove (`open` is a template dep) — ~73 of
the 89. Subtracting that floor, the per-packet *churn* the throttle targets
fell from ~253 to ~16 renders (≈ 6.3 → 0.43 per open-window, ~13× after
load-normalization). The harness is pessimal — it pays the toggle cost
repeatedly while giving a 250 ms throttle almost no room inside each short
open-window; in real use (open once, watch a query stream for seconds) the win
scales with how long the popover stays open. The `scheduleRowsRebuild`
`setTimeout` markers firing at 194–247 ms confirm the coalescing is live.

`npm run build` (`vue-tsc -b && vite build`) green.

## Incidental finding — ToolbarEngineMetrics is the next per-packet renderer

The same captures confirm the prior Toolbar extraction (commit `6683b6d`)
landed: `<Toolbar> render` 614 → 1. The per-packet telemetry now lives in
`<ToolbarEngineMetrics>`, which renders **716×/capture** — the single largest
per-packet renderer remaining. That is *by design* (live winrate / scoreLead /
PPS / latency), but it is the natural next green candidate: those headline
numbers to one decimal do not need ~35 Hz updates. Throttling them is a
separate UX call (live vs ~4 Hz) and a separate change; recorded here as the
next lever, consistent with
`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`'s
"Toolbar is the place to watch next."

## Docs

- No `FILES.md` change — no file created / moved / deleted; both touched files
  keep their `[B1]` band and their purpose lines stay accurate (the throttle is
  an internal mechanism, not a purpose change).
- No `FEATURES.md` change — the tooltip shows the same information; only its
  redraw cadence changed.

License: Public Domain (The Unlicense).
