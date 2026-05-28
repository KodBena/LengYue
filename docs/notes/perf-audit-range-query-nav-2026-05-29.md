# Performance Audit — Navigation During a Live Range Query (regime B, 2026-05-29)

Profile-substantiated diagnosis of the user-perceived sluggishness when
navigating *while* a range query streams (with parallel async work). This
is the "regime B" the game-scroll audit
(`docs/notes/perf-audit-game-scroll-2026-05-28.md`) deferred. Investigation
read-only; this note is the **before** anchor for the regime-B fix arcs and
the ledger of which lever each contributor belongs to.

Per ADR-0009: this capture is the substrate of the *perception*; the
diagnosis below is the substantiation of the *investigation*. Case 1 —
measurement substantiates the perception.

## Profile

- `~/perf-profiles/capture-during-range-query.json.gz` — 6.2 MB gzipped,
  31.717 s wall. Captured on `main` **with the Arc 1 + Arc 2 navigation
  fixes already in place** (PR #294 merged), so navigation is already
  localized; what this profile adds is the per-packet work of a live
  range query layered on top.
- **Scenario:** range query streaming over the game while the user holds
  arrow keys to navigate, Analysis tab open.
- Tooling: `@firefox-devtools/profiler-cli` + Vue `app.config.performance`.

## Headline — the perception is substantiated

| Metric | Regime A (post-Arc-2) | Regime B | |
|---|---|---|---|
| **RefreshObserver p50 (frame)** | ~14 ms | **47 ms** | ~3.3× over the 60fps budget; max 275 ms |
| LongTask count | 11 | **166** | ~15× more main-thread-blocking events |
| Main-thread CPU | — | 15.5 s / 31.7 s | 69% during the active window |

The median frame during a range query is **47 ms** — visibly janky.
The user's perception ("sluggish navigating during a range query, lots of
async tasks") is correct.

**Arc 2 corroboration:** despite **1708 keydowns** in this capture, App
re-rendered only on the 531 *engine-metric* updates, never on navigation —
so the Arc-2 cursor decoupling holds. The residual App re-renders are a
*different* coupling (RB-1 below).

## Contributors, ranked (over the 31.7 s capture)

| Contributor | n | cost | mechanism |
|---|---|---|---|
| **Analysis-panel patches** — AnalysisChartPanel (2466 ms, max 34 ms) + ScoreLeadPanel (1156 ms) + MergedDeltaPanel (935 ms) | ~1.7k | **~4.5 s** | ECharts `setOption` re-run per streamed packet; AnalysisChartPanel also thrashes ~2.6× per update |
| **WS message handler** (`analysis-service::onAnalysisUpdate`) | 500 | **~2.35 s** | synchronous, unchunked receive (normalize + ledger merge); max **73 ms** main-thread block |
| **App whole-tree re-render** (RootErrorBoundary render+patch) | 531 | **~1.0 s** | App reads `engineControls.status`/`metrics` in its template (for `<Toolbar>`) → whole tree re-renders on every metric tick |
| **Toolbar re-render** | 672 | **~0.67 s** | reads the streaming metrics (genuine — it displays live PPS / latency) |

## The three levers (separability)

- **RB-1 — App ↔ engine-metrics decouple** *(cheap, low-risk, separable; the
  Arc-2 pattern again).* App.vue's template reads
  `engineControls.status.value` / `engineControls.metrics.value` to pass to
  `<Toolbar>`; during streaming those tick continuously, re-rendering the
  whole tree (531×, ~1 s + the cascade). Fix: `Toolbar` self-sources
  status/metrics via `useEngineControls()` (store-backed, safe to call
  again); App drops the two prop bindings (keeps `engineControls.toggle`,
  a stable fn). App then stops re-rendering during analysis. **Chosen as
  the first regime-B fix.**

- **RB-2 — analysis-panel chart-update coalescing** *(the dominant ~4.5 s).*
  Don't `setOption` per packet — batch to a frame / short-circuit unchanged
  data; fix AnalysisChartPanel's ~2.6× thrash per update. **Belongs to the
  analysis-panel refactor** (this profile is its before-anchor too).

- **RB-3 — packet-receive-path chunking** *(~2.35 s, the 73 ms blocks).* Get
  the synchronous normalize+merge in `onAnalysisUpdate` off the main thread
  / chunk it (the 2026-05-27 audit's incidental find: "no work-chunking
  anywhere in the packet receive path"). Cross-cutting (feeds both charts
  and overlays); its own arc, medium risk. The lever that most directly
  removes the long blocks behind the jank.

## ADR-0004 note (for the RB-1 edit)

`useEngineControls` (composables/useEngineControls.ts) exposes `status` /
`metrics` as `computed(() => store.engine.status/metrics)` — store-backed,
no local state — so calling it from `Toolbar` returns the same
store-derived refs (no divergence). `Toolbar` already reads `store.engine`
directly for `info` / `pingPendingSince` / `selectedModel`, so
self-sourcing status/metrics is consistent with its existing shape.

## Staged plan

- **RB-1 (this arc).** App↔metrics decouple. Measure against this profile.
- **RB-2.** Chart-update coalescing → analysis-panel refactor.
- **RB-3.** Packet-receive-path chunking → its own arc.

## Acceptance (ADR-0009)

- **Before:** `capture-during-range-query.json.gz` (above).
- **After (RB-1):** to be captured under the same scenario once RB-1 lands.
  Expect `RootErrorBoundary` render+patch to collapse from ~531 toward the
  structural-only floor; `Toolbar` re-renders persist (genuine metric
  display); the chart/packet contributors (RB-2/RB-3) unchanged.

## References

- `docs/notes/perf-audit-game-scroll-2026-05-28.md` — regime-A audit + the
  Arc 1/2 that this builds on.
- `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` — Bug C + the
  packet-path incidental finds (the RB-3 substrate).
- `docs/adr/0009-performance-investigation-discipline.md`.

License: Public Domain (The Unlicense).
