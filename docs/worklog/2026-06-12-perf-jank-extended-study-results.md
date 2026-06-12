# Worklog — jank-extended before/after study: results (2026-06-12)

> The comparison record for work-status item `perf-jank-extended-before-after`.
> Companion to the protocol worklog (same directory, same date, `-protocol`
> suffix), which carries the scenario design, the RUNBOOK, and the port-delta
> record. This document carries the study outcome. Authored by the
> coordinating session from the mechanically-extracted substrate; the
> extraction layer drew no comparisons (its outputs carry no-claims headers);
> every comparative statement below is this document's own and is
> substantiated by the referenced substrate (ADR-0009, including its
> 2026-06-12 best-effort-latency amendment).

## Question

Whether the 2026-06 refactoring span — the history-lessons audit program
(PRs #369–#394), the debt campaign (#396–#414), and the follow-on session
(#415–#427), roughly thirty PRs of extractions, relocations, owner-routing,
delta contracts, and union narrowing — introduced measurable runtime cost
through its added indirections. Render/patch counts had served as the proxy
throughout; this study adds the realtime-latency axis the counts cannot see.

## Method (pointer)

The `jank-extended` scenario (protocol worklog has the full design): 16-board
Shusaku rail, 200-visit transposition-enabled warm range query to completion,
all four board overlays asserted on, then one 342-step autonav pass under
popover stress + thumbnail hover-scrub + a never-completing 100000-visit
in-flight query, ended by indirect cancel via proxy disconnect. Headed
Chromium on the real display; per-reading proxy cache clear + fresh browser
profile. Two tree states: **baseline** `34650471` (before any program
refactoring merged) and **main** (post-#427), both running the identical
ported scenario (one coordinator amendment: the dashboard tab pinned on both
sides — an unpinned tab would have differed systematically via the
baseline-side hydration skew). 10 readings per state, interleaved pairs with
alternating start order. Model `b10c128` via the SELECTOR proxy.

## Substrate (user-local; referenced per the profile-share convention)

- Manifest: `~/w/vdc/chromium_profiles/jank-extended-study-20260612-manifest.json`
- Traces: `~/w/vdc/chromium_profiles/jank-extended-{baseline,main}-run{01..10}-*.json`
  (20 kept readings, ~130–185 MB each uncompressed; zero discards, zero
  retakes; per-trace canonical parser output in sibling `.metrics.txt` files)
- Extracted tables: `...-results.md` / machine-readable `...-results.json`
  (same directory)
- Parser: `frontend/scripts/perf-trace-parse.mjs` at commit `5b00edb0`
  (this branch — the latency-surface extension; frame keying =
  `PipelineReporter` pipeline-latency spans, documented caveat: pipeline
  latency, not isolated per-frame CPU; LongTask = blink `LongTask` ≥ 50 ms,
  cross-checked per reading against renderer-main `RunTask` ≥ 50 ms)

## Comparability (asserted before any comparison, per the normalization protocol)

Identical across every reading of both states: autonav steps (342), packet
first-bumps (343), component top-15 set, settings subtrees at idle
(byte-identical parity probe). Packet volume (`rb3:handler`): baseline median
1260 (1212–1307), main 1284.5 (1221–1336) — main ran ~1.9 % busier, a
confound direction that would overstate, not hide, a main-side cost. Popover
cycles and window durations near-identical. Comparability holds.

## Result: null on both comparables

**Counts (strict comparable): no change.** Aggregate render ops median
7596.5 (baseline) vs 7611 (main), +0.2 % against the +1.9 % packet-volume
excess — per-packet render volume flat to slightly lower. Render÷patch ratio
1.00 for every component in every reading: no render-coupling was introduced
anywhere in the span. Nav-bound components are identical per state
(`BoardDisplay`/`BoardWidget` 364, `MoveSuggestions` 363, `TreeWidget`/
`StatusBar`/`BoardVariationsOverlay` 360); packet-bound components track
packet volume exactly (`AnalysisChartPanel` 529 vs 533, `BaseChart` 527 vs
531, `ScoreLeadPanel`/`MergedDeltaPanel` 263.5 vs 265.5). One deterministic
fingerprint: `ChartPreviewBox` renders exactly 690 (baseline) vs exactly 688
(main) in every reading — plausibly the PR #424 preview migration's two
removed initial async writes (one per migrated panel); attribution is
plausible-not-proven, the delta is two renders per ~66 s run.

**Realtime latency (best-effort comparable): no change.** Frame-duration
medians-of-runs: p50 14.70 vs 14.74 ms, p90 36.51 vs 35.65 ms, p99 229.12 vs
230.19 ms, max 1794.91 vs 1781.00 ms — every distribution statistic overlaps
across states. Over-budget frames as a fraction of frames: 31.9 % vs 31.5 %
(> 16.667 ms) and 10.49 % vs 10.55 % (> 33.333 ms). LongTask count 358.5 vs
358; LongTask cumulative 37046 vs 37637 ms (+1.6 %, at/below the +1.9 %
packet-volume confound; as a fraction of window, 56.0 % vs 56.5 %). The raw
deltas vanish under volume normalization; none clears the confound floor.

**Calibration note (ADR-0009 case-2 posture).** This is a
measurement-finds-nothing outcome on the question asked, and it is the
verdict: the span's indirections produced no measurable render-population or
felt-latency change under the heaviest available stress. Separately, the
protocol confirms the SPA runs hot under this load on BOTH states — ~32 % of
frames over the 60 Hz budget, ~56 % of wall-clock inside long tasks, p99
~230 ms — which is the stress doing its job, recorded here as the standing
baseline the canonical stress test now measures against, not as a regression
claim in either direction.

## Corrections and amendments folded into this branch

- The protocol worklog's predicted `MiniBoardSvg`(baseline) vs
  `MiniBoardCanvas`(main) tree divergence did not reproduce — both states
  render `MiniBoardSvg`; dated strike-corrections applied in place (two
  sites). `MiniBoardCanvas` belongs to a thumbnail surface this protocol does
  not exercise.
- Coordinator review amendment (pre-study, both branches): dashboard tab
  pinned (`normalizeTab: true`) — determinism across runs and states against
  the hydration skew.
- Parser latency surface (commit `5b00edb0`) discharges the "parser is
  counts-only at this amendment's date" note in ADR-0009's 2026-06-12
  amendment.

## Disposition

The scenario carries forward as the canonical SPA stress test (maintainer
decision, recorded on the work-status item). The baseline branch
(`bork/perf/jank-extended-baseline`, pinned at `34650471`) is retained
unmerged as the study's reproducibility scaffold. The standing
perf-battery guidance updates at this merge: `jank-extended` is the standard
stress battery; `full-stress` remains the lighter chart-focused battery.

License: Public Domain (The Unlicense).
