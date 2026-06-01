# Forced-reflow attribution — is rAF ordering a perf lever? (2026-06-01)

**Status: measurement only. No change proposed. Falsify-not-generate
(see the perf-philosophy note): this records what the data says, not a
refactor to chase.**

## Question

After PR #336 the maintainer hypothesised that our `requestAnimationFrame`
users might contend within a frame — a callback *writes* the DOM, a later one
*reads* layout, forcing a synchronous reflow — and that "packing the subscribed
calculations cleverly" could reduce it. This note gathers data on whether the
rAF layer is actually a forced-reflow source, and where the forced reflows in a
navigation run actually come from.

## Method

- **Static:** read all six rAF-referencing files end to end and classified each
  callback as a layout *reader* or *writer*.
- **Dynamic:** fresh `nav-range` capture on the canvas-MiniBoard branch
  (`--visits 1000 --model b10`, headless — forced layout is JS-*forced* and
  fully visible headless; only *paint* is masked). Attributed every
  `Blink.ForcedStyleAndLayout.UpdateTime` event to its enclosing-event chain
  (driver category + nearest named JS function) and checked how forced reflows
  distribute across the longest tasks. Scripts in the session tmp; trace
  `nav-range-2026-06-01T21-23-55-426Z.json`.

## Static finding — the rAF callbacks don't read layout

| File | rAF? | Callback does | Reads layout? |
|---|---|---|---|
| `useViewportFollow.ts` | **No** (comment only) | reads `scrollLeft`/`clientWidth` at mount + observer-clean times | yes, but off the hot path by design |
| `useScopedScroll.ts` | yes | runs caller `onScroll(deltaY)` — **wheel-driven only** | depends on caller; never fires in autonav |
| `useUserIORegistry.ts` | yes | fires `nav.handler()` (store mutation) | no |
| `analysis-ledger.ts` | yes | bumps reactive version refs + notifies | no |
| `stability-trajectory-store.ts` | yes | bumps reactive version refs | no |
| `perf/autonav.ts` | yes | `nav.next()` (store mutation) | no |

Every coalescer is a **pure reactive writer**. The write→read interleave the
hypothesis describes does not exist *at the rAF layer* by construction.

## Dynamic finding — where the 330 forced reflows actually come from

330 forced reflows, **123 ms total = 2.5 % of the 4.9 s run**.

```
── driver category ──         ── nearest named JS function ──
  152  Event:scroll             152  onScroll @ useViewportFollow.ts
  103  rAF                       12  step @ echarts.js  (ECharts internal)
   60  OtherTask                  6  syncDims @ useViewportFollow.ts
   15  Microtask(Vue flush)     160  (no JS frame — browser-internal:
                                       scroll-anchoring / observer delivery)
```

- **`onScroll` in `useViewportFollow` is the #1 named source (152, ~46 %).** Its
  `scrollLeft`/`scrollTop` reads were *assumed* reflow-free ("a scroll event
  fires after the scroll is settled"). That assumption holds for user scrolls;
  it does **not** hold here, because the scroll is triggered by `centerOn`'s
  programmatic `scrollTo` during navigation, and the tree DOM keeps mutating
  (nav steps + streaming analysis re-renders), so layout is dirty when the
  scroll handler runs.
- **0 forced reflows are attributable to our rAF coalescers** (`scheduleBumpFlush`,
  autonav `frame`, the nav handler). Dynamic confirmation of the static read.
- The rAF-driver bucket (103) is diffuse — ECharts internals + browser-internal
  layout with no captured JS frame — not our code.

## Calibration — forced reflows are not the jank

| longest task | forced reflow inside |
|---:|---|
| 177.6 ms | 15 events / **6.4 ms** (3.6 %) |
| 102.1 ms | 3 events / 2.7 ms |
| 78.7 ms | 3 events / 1.0 ms |

The long tasks — the actual jank — are **not** made long by forced layout. The
177 ms task is ~96 % *something else*.

## What the 96% actually is (measured 2026-06-01, replacing an inferred claim)

The maintainer correctly flagged that the first draft's "analysis re-derivation
/ chart `setOption` / Vue render" was *inferred* ("consistent with the earlier
perf arc"), not measured in this pass. Decomposing the same trace two ways —
`X`-event self-time, and the `blink.user_timing` per-component render/patch
marks within the long-task windows — gives the actual breakdown:

**Self-time across all 19 long tasks (1289 ms):**

| self-time | share | label |
|---:|---:|---|
| 567 ms | 44.0 % | `RunMicrotasks` (the Vue reactive flush — see component split below) |
| 357 ms | 27.7 % | **ECharts `step`** (chart render — unambiguous) |
| 88 ms | 6.8 % | Canvas2D `ProduceCanvasResource` (largely ECharts' canvas) |
| 33 ms | 2.6 % | `Paint` |
| ~30 ms | ~2 % | style + layout (matches the 2.5 % forced-reflow finding) |
| 14 ms | 1.1 % | autonav `frame` (the harness driver — negligible) |

**Two corrections the measurement forces:**

1. **The biggest single long task is mostly one-time, not steady-state.** The
   177 ms task is dominated by `<AnalysisDashboard> mount` (118 ms) +
   `init` (104 ms) + `<TabWidget>`/`<AnalysisControls> patch` — the cost of
   autonav switching to the Analysis tab *once* at the start. It is a mount
   artifact of the harness, not recurring per-nav jank. Reading "177 ms task =
   the jank" without this split overstates the steady-state cost.
2. **Steady-state per-nav work splits board ↔ chart — it is not chart-exclusive.**
   The recurring user_timing patches (gross ms / count):
   `<BoardWidget> patch` 2.5 ms/step, `<TreeWidget> render` 2.0 ms,
   `<BoardDisplay>`/`<StatusBar>` on the board side; `<MergedDeltaPanel>`
   1.9 ms, `<ScoreLeadPanel>` 1.5 ms, `<AnalysisChartPanel>`,
   `<ChartPreviewBox>` 1.4 ms, `<MiniBoard>` 1.3 ms on the chart/preview side.

So "the jank lives in the analysis/chart re-render path" is **partly right**:
ECharts render is the single largest steady-state self-time bucket (27.7 %), and
the chart panels are a big share of the Vue flush — but board-component patches
are also significant, and the largest long task is a one-time mount. The honest
statement is *"chart rendering is the biggest single contributor; board renders
are second; the worst single task is a one-time dashboard mount."*

**The one thing still unseparated:** how much of the 44 % `RunMicrotasks` is the
chart-feeding *data derivation* (the enriched-projection / series computeds — the
AoS→SoA target) versus the chart-component *render* (Vue patch + ECharts). The
clean causal test is the **collapse-charts run** (below): the collapsed-chart
gate (`docs/worklog/2026-06-01-collapsed-chart-gate.md`) skips ECharts
`setOption` while keeping the panel mounted, so the `props.series` computed still
runs — a collapsed capture isolates derivation from render. *Not run here:* the
panel `expanded` state is component-local (`AnalysisChartPanel.vue:43`), so the
capture needs a small dev hook (mirroring autonav's `__devForceActiveAnalysisTab`
capture-normalization hook) to force it. Flagged as the next increment, not a
silent omission.

## Conclusions

1. **The rAF-ordering / phase-packing bet is falsified as a jank source**, two
   independent ways: the coalescers don't read layout (0 attributable forced
   reflows), and forced reflows total only 2.5 % of wall and are nearly absent
   from the long tasks. Cleverly packing rAF subscribers would move ~nothing.
   *Measuring before acting saved a refactor that wouldn't have paid.*
2. **The data-organisation (AoS→SoA) idea is not falsified — it's redirected,
   and its target is now narrower than "the long tasks."** The long-task time is
   dominated by *rendering* — ECharts `step` (27.7 %) + the chart/board Vue
   patches in the 44 % microtask bucket. The AoS→SoA idea only helps the *data
   derivation* (the projection / series computeds), which is a not-yet-separated
   slice of that 44 %. Whether it is a big slice or a small one is exactly what
   the collapse-charts run measures. So: don't open an AoS→SoA refactor until the
   collapse run quantifies the derivation slice — if rendering is ~all of it,
   the data-org idea is also weak. *Measure the slice before betting on it.*
3. **`useViewportFollow.onScroll` is a real but minor forced-reflow site.**
   Documented as a hygiene observation, **not scheduled** — it's mostly outside
   the long tasks, so fixing it on its own wouldn't move perceived jank. Listed
   so it isn't lost, not as a work item.

## Postscript — is the read/write discipline lint-able?

Asked alongside this investigation. Short answer: **not soundly — it's a
runtime property, not a static one.** Whether a `scrollLeft` read forces a
reflow depends on whether layout is *dirty at that instant*, which depends on
what else ran in the frame. ESLint sees syntax, not frame timing. Two tractable
approximations:

- **(a) Heuristic ESLint rule** — flag layout-forcing reads (`offsetWidth`,
  `getBoundingClientRect`, `scrollLeft`, `getComputedStyle`, …) lexically inside
  a `requestAnimationFrame` / `watch` / draw callback. Cheap; would have flagged
  both the canvas regression *and* `onScroll`. But false-positive-prone (the
  ResizeObserver-cached read is provably safe yet would trip it), so it needs an
  inline-disable escape with a justification comment — same shape as the
  `as`-needs-a-reason rule.
- **(b) Runtime forced-reflow-count guard** — the *sound* form, and the one that
  fits the codebase: assert in the perf harness that the forced-reflow count
  stays under a per-source budget, exactly mirroring the existing render-count
  regression guards (ADR-0010 P4) and the counts-not-wall-clock discipline
  (ADR-0009). The trace's `Blink.ForcedStyleAndLayout.UpdateTime` *is* the SSOT.
  This data shows it would have teeth today (`onScroll` = 152).

The lint catches the *smell* statically; the harness guard catches the *fact*
at runtime. The fact is the one that matters, so (b) is the recommendation if
this is ever pursued.

License: Public Domain (The Unlicense).
