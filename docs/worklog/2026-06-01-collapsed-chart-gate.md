# Collapsed analysis-chart panels no longer process packets

- **Status:** Done 2026-06-01 (frontend). Fixes the "collapsed charts still
  process packets" bug from `docs/notes/deferred-items.md` (the green-arc
  hidden-charts capture).
- **Genre:** Perf fix (structural) + regression guard.
- **Date:** 2026-06-01.

## The bug

Rolling up an `AnalysisChartPanel` toggles `v-show` (`display:none`), which
keeps the panel — and its `BaseChart` — **mounted**. `BaseChart`'s
`watch(() => props.series, …) → updateOptions → ECharts setOption` then ran
on every analysis packet even while the panel was hidden (~250 ms of patch
work in the 2026-05-30 hidden-charts capture, while it was supposedly off).

## The fix — gate-on-collapsed (not unmount)

`BaseChart` gains an `active?: boolean` prop; when explicitly `false` (the
host panel is collapsed), the `setOption` paths — `updateOptions` and
`updateMarker` — early-return and set a `pendingRedraw` flag instead of
touching ECharts. A `watch(() => props.active)` flushes a single catch-up
`updateOptions()` + `updateMarker()` on re-expand. `AnalysisChartPanel`
passes `:active="expanded"`. Omitted/`true` ⇒ always active, so other
`BaseChart` consumers are unaffected (the gate is strictly `=== false`).

**Why gate-on-collapsed over `v-if`-unmount** (the deferred-items entry's
fork, "unmount unless a real reason"): the reason is the current `v-show`
UX — keeping the chart mounted retains its ECharts state (zoom window,
per-series legend toggles) and gives instant, flicker-free re-expand. The
gate gets the perf win (zero ECharts work while collapsed) *and* preserves
that, at the cost of a few lines (the gate + the catch-up). Reversible if a
later call prefers unmount.

## Substantiation (ADR-0009)

Structural-by-inspection — the gate provably eliminates the per-packet
`setOption` while collapsed (the early-return precedes every ECharts call),
so per ADR-0009's trivial-change exception no profile pair is required; the
structural argument + the regression guard substantiate it. (A
`perf-capture` before/after would only re-measure what the code structure
already guarantees.)

## Regression guard

`tests/integration/BaseChart-collapsed-gate.test.ts` — the ECharts-work
analogue of the render-count guards (`tests/integration/render-count/`): it
asserts a *frequency* — a collapsed (`active: false`) `BaseChart` does ZERO
`setOption` on a redraw trigger, then catches up on re-expand. ECharts is
mocked (the chart's `setOption` is a spy); `clientHeight` is stubbed so
`initChart` runs under jsdom; the redraw is driven through the direct
`zoomRange` watch (no throttle timing). Verified **live**: removing the
`updateOptions` gate turns it red. `jsdom-stubs.ts` extended with the three
theme vars `BaseChart` reads (`--surface-3`, `--text-0`, `--text-2`).

## Not done here (deliberate)

The broader **Settings → Analysis Layout affordance** (disable/unmount
charts) the same deferred-items entry wants is untouched — this fixes only
the per-packet-while-collapsed bug. The `deferred-items.md` entry is **not**
edited in this PR to avoid a merge collision with the parallel doc-graph
artifact work (which is editing that file); its update is a follow-on.

## Verification

`vue-tsc -b` clean; suite **770 passed / 3 skipped** (+1 guard).

## License

Public Domain (The Unlicense).
