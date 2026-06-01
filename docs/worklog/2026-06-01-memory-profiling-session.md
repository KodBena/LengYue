# Memory profiling — first session: lifecycle is leak-free

- **Status:** Done 2026-06-01 (frontend). The quartet's item 3, folded onto
  item 4's perf-scenario harness (PR #323). Tool + findings; the discipline
  lands as an ADR-0009 metric-vocabulary extension (not a separate tenet,
  per the maintainer's preference).
- **Genre:** Tooling + investigation. Companion to
  `docs/worklog/2026-06-01-perf-scenario-harness.md`.
- **Date:** 2026-06-01.

## The tool

`frontend/scripts/perf-heap.mjs` (`npm run perf:heap`) — a CDP
`HeapProfiler` driver over the same Playwright/`window.__perfScenario`
harness. It runs a scenario N times and, between cycles, forces a major GC
(`HeapProfiler.collectGarbage` ×2) and reads the **retained** V8 heap
(`Runtime.getHeapUsage` post-GC). `--snapshot` writes a `.heapsnapshot`
for attribution (DevTools → Memory).

### Methodology (the load-bearing part)

A leak surfaces only under *repetition*, and the naive metric misleads:

- **Warmup run before baseline.** One-time init (i18n catalogs, lazy
  singletons, bounded caches filling) allocates on the first cycles; a
  `--warmup` run absorbs it so only steady-state growth is measured.
- **Tail-slope, not whole-series slope, is the discriminant.** The first
  `nav-only ×20` run reported an 80 KB/cycle whole-series slope and the
  tool cried "LIKELY LEAK" — wrong. The curve was *decelerating*
  (per-cycle delta shrinking ~+0.4 MB → +0.02 MB), the signature of bounded
  warmup, not a leak (which holds a *constant* per-cycle delta). Fixed the
  verdict to fit the **steady-state tail** (last third): a high whole-slope
  with a flat tail-slope is warmup, not a leak.

## Findings — both lifecycle paths leak-free

| probe | exercises | retained-heap result |
|---|---|---|
| `nav-only ×40` | board create → load 100-node fixture → autonav → `closeBoard` | **clean** — plateaus ~cycle 30; tail-slope 30 KB/cyc and decaying (GC-noise wiggle), +2.9 MB bounded warmup over 40 cycles |
| `full-stress ×12` | + engine connect + streaming b10/1000 analysis + `clearCache` + `closeBoard` | **clean** — tail-slope **−11 KB/cyc** (flat/declining), +1.7 MB bounded, plateaued by cycle 10 |

So `closeBoard`'s resource ownership holds under repeated cycles — the
per-board tree, the analysis subscriptions, and the ledger entries all
release; no unbounded growth on either the board-lifecycle or the
analysis-lifecycle path. A substantiated **clean** verdict: the
resource-ownership-at-mutation-sites discipline (the `closeBoard` /
`resetWorkspace` worked examples, the ADR-0010 §4 cleanups) survives a
memory probe. A 54 MB snapshot of the full-stress steady state is retained
under `~/w/vdc/chromium_profiles/` if the bounded warmup ever wants
attribution.

## Faithfulness limitation surfaced (VM GPU)

Comparing headed-on-X11 (watched vs unwatched display) vs headless: the
**deterministic** render/patch counts are identical across all conditions
(`MiniBoard` = 201 every run — it's navigation-driven and emitted by Vue's
JS-level `app.config.performance` instrumentation, independent of whether
any pixels are scanned out). The only variance (`AnalysisChartPanel`
258–290) is proxy analysis-streaming timing, present headless too. So
watched-vs-unwatched is a non-issue for our metrics.

The real limitation is the **paint axis**: this VM's GL path is
**virtio-gpu** (`/dev/dri/renderD128`, "Red Hat Virtio 1.0 GPU"), likely
software-fallback — so no capture here (headless/headed/watched) reflects
real-hardware paint/compositor cost. The render/patch *counts* (JS work)
are faithful and device-independent; the *felt-latency / paint* axis is a
VM ceiling regardless. (This bounds the future perceptual-event-projection
subproject — its paint-timing fidelity needs representative hardware.)

## Mobile-viability (architectural, speculative — not a product statement)

The maintainer asked whether the *architecture* could support mobile (the
layout explicitly does not today; the product direction is the
maintainer's). Grounded in this session's data, architecture-only:

**Enablers.** (1) The working-set memory is modest and bounded — ~30 MB
retained heap, leak-free — well within mobile budgets. (2) The heavy
compute (KataGo search) is **offloaded to the proxy** over WS; the device
is a thin rendering client, never running the engine. (3) Data-dense
visuals are already `<canvas>` (ADR-0010) — GPU-composited, mobile-friendly.
(4) Logic lives in composables/services, UI-agnostic — a different (touch)
component layer could reuse the substrate. (5) Input is mediated by an ACL
(`useUserIORegistry`, hardware-event → domain-verb) that can be retargeted
to touch.

**Non-architectural blockers (surface/tuning, not dead-ends).** (a) The
regime-B per-frame cost (analysis-chart redraws during nav) scales with the
weaker mobile CPU — felt-latency risk *if* heavy real-time streaming +
nav run simultaneously; a lighter mode (review-only / pre-computed
analysis) sidesteps it, and the green arc already cut the JS cost. (b)
Desktop-coupled interaction bindings (keyboard nav, hover popovers) — the
input ACL can retarget, but the bindings are work. (c) Heavyweight deps
(jQuery + jQuery-UI, ECharts) hurt mobile bundle/parse weight.

**Verdict:** the architecture is *capable* — nothing structural is a
dead-end; the blockers are layout, interaction bindings, and dependency
weight, all addressable. Caveat: this extrapolates from desktop-VM data
(memory is ~device-independent; per-op paint cost would scale by mobile's
weaker hardware), not a mobile measurement.

## ADR-0009 extension

Added **retained-heap tail-slope per cycle** to the metric vocabulary (with
the warmup-vs-leak calibration), and CDP `HeapProfiler` (`perf-heap.mjs`)
to the canonical tools — via the append-a-rule pattern, not a new tenet.

## Open / deferred

- A `--memory` trace-counter flag on `perf-capture.mjs` (the Chrome
  "Memory" checkbox = `UpdateCounters` heap/node/listener timeline) — a
  coarse grow-during-run signal foldable onto the existing trace capture.
- A `resetWorkspace`-churn scenario to stress the *other* named cleanup
  (this session covered the high-traffic `closeBoard` paths).

## License

Public Domain (The Unlicense).
