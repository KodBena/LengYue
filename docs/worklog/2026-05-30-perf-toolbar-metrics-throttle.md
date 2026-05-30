# Worklog — throttle the ToolbarEngineMetrics strip to ~4 Hz (2026-05-30)

The follow-on to the ToolbarEngineMetrics extraction
(`docs/worklog/2026-05-30-perf-toolbar-metrics-extraction.md`). That fix
*isolated* the per-packet telemetry into its own leaf but did not *reduce*
it — the leaf inherited the whole-shell coupling's render rate and became the
largest per-packet renderer remaining (716 in capture L). This throttles it.

## The two drivers (both confirmed in source)

`<ToolbarEngineMetrics>` re-rendered on every analysis packet from:

1. **`rootInfo`** (`ledger.getRaw(hash, currentNodeId)`) — winrate and
   scoreLead refine on every packet for the active node.
2. **`store.engine.metrics` object identity** — `analysis-service`'s
   `onAnalysisUpdate` replaces it wholesale on *every* response
   (`{ ...metrics, lastResponseId: board.id }`, `analysis-service.ts:960`).
   So even the 1 Hz PPS (`startMetrics` interval, `:318`) and 5 s latency
   (watchdog poll) reads re-render per packet through the churned object
   identity — not because their values changed.

## What shipped

- **`src/lib/timing.ts`**: `TOOLBAR_METRICS_REDRAW_THROTTLE_MS = 250`, the
  fourth sibling in the catalog's 4 Hz per-packet-churn family.
- **`src/components/chrome/ToolbarEngineMetrics.vue`**: the four displayed
  scalars (winrate / scoreLead / PPS / latency) are snapshotted into a plain
  `displayed` ref on a trailing+leading `setTimeout` throttle (the same
  hand-rolled shape as the chart / queue consumers), seeded synchronously so
  there's no placeholder flash on mount. The template reads `displayed.*`
  instead of the live computeds / `metrics.*`, so the strip re-renders at most
  ~4 Hz.
  - **The watchdog dot stays LIVE** (not throttled): its `watchdogClasses`
    computed short-circuits on a stable class string, so it costs no
    per-packet render even though it reads the churning `metrics`; and staying
    live lets a latency spike flip the dot promptly rather than up to a
    throttle-window late. The engine-identity slots (version / model /
    tooltips) are likewise untouched — they change only on connect / select.

## Validation (count-based, ADR-0009)

Streaming-range-query captures, `<ToolbarEngineMetrics> render` markers:

| | before (L) | after (M) |
|---|---|---|
| duration | 20.38 s | 31.06 s |
| `<ToolbarEngineMetrics> render` | 716 | 127 |
| render **rate** | 35.1 / s | **4.09 / s** |

**Confound ruled out — in the hard direction.** M was *more* loaded, not
less: per-packet control components untouched by this change rose with the
longer, heavier capture — BaseChart 626→998, ScoreLeadPanel 312→499 (~1.6×
more streaming). Yet the strip's render rate fell to 4.09/s. Load-normalized
(renders ÷ ScoreLeadPanel renders): `716/312 = 2.29` → `127/499 = 0.255` =
**9.0× fewer**.

The decisive observation: the strip's render rate is now **independent of the
packet rate**. In L it tracked the packets (~35/s); in M it sat at ~4 Hz
*despite 1.6× more streaming*. The `scheduleDisplayRebuild` `setTimeout`
markers firing at 144–250 ms confirm the coalescing. 127 renders over 31 s is
~4.09/s — essentially the throttle's 4 Hz ceiling, i.e. the stream kept it
saturated and it never exceeded the cap.

`npm run build` (`vue-tsc -b && vite build`) green.

## UX note

The headline numbers now update 4×/sec rather than ~35×/sec. The cadence is a
single tunable constant (`TOOLBAR_METRICS_REDRAW_THROTTLE_MS`); raise it if
the strip should feel more live, lower it for more green. The watchdog dot's
promptness is unaffected (left live).

License: Public Domain (The Unlicense).
