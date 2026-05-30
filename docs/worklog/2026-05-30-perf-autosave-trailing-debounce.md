# Worklog — auto-save trailing-debounce: eliminate mid-stream save blocks (2026-05-30)

The frame-level latency win the render-coupling sweep was circling. The chart
throttle (`docs/worklog/2026-05-30-perf-basechart-redraw-throttle.md`) removed
CPU work but left the LongTask count unmoved — because the >50 ms main-thread
blocks during a live query were never the charts. A LongTask stack analysis on
capture O pinned **all** the heavy blocks to one source: the experimental
analysis-persistence **auto-save**.

## Diagnosis

With `analysisAutoSave` on, `useAutoSaveAnalyses` watched each board's
`dirtyVersion` (bumped per authoritative packet) and used a **leading-edge**
debounce: the first dirty bump scheduled a save at +2 s, which fired
regardless of continued streaming. So during a continuous range query the save
fired **every ~2 s**, and each fire synchronously `projectLedgerToBundle` →
`toWireBundleV2` (quantize ownership-q4/q8 + policy-q8 across every analyzed
node) → JSON PUT. That float-heavy re-serialize from scratch blocked the main
thread **50–157 ms** each time — the dominant LongTask source, and growing
with node count. The profiler hotspots matched exactly: `Array.from` ~44 % +
`DoubleToAscii` ~12 % of active samples (the quantize + stringify of the float
arrays). Every heavy LongTask in O shared the identical
`fireSave → save` stack.

## What shipped

`src/composables/useAutoSaveAnalyses.ts`: `scheduleSaveIfNeeded` switched from
leading-edge (absorb bumps within the window) to **trailing-edge debounce**
(each bump clears the pending timer and re-arms at +2 s). During continuous
streaming the timer keeps resetting, so no save fires mid-stream; the bundle is
serialized + PUT **once, ~2 s after analysis settles**. The
dirty-version-capture-at-fire-time is preserved, so a bump during the in-flight
PUT still triggers a follow-up save. The header doc is updated to match.

Tradeoff (user-accepted): no intermediate saves during a long stream — a crash
mid-analysis loses the in-flight (unsaved) bundle, recoverable by manual save.
Arguably also more correct: repeatedly serializing half-finished analysis every
2 s was wasted work.

## Validation (count-based, ADR-0009)

Range-fetch captures, LongTask markers:

| | before (O) | after (P) |
|---|---|---|
| duration | 14.55 s | 7.37 s |
| total LongTasks | 10 | 2 |
| **auto-save LongTasks** (heavy setTimeout ≥ 50 ms) | **9** | **0** |
| ScoreLeadPanel render (streaming-load control) | 374 | 293 |

The auto-save main-thread blocks are **eliminated** — 0 heavy setTimeouts in P.
The 2 residual LongTasks are non-auto-save (paint / style pipeline), the same
floor O had (O: 10 − 9 = 1 non-auto-save). Normalized by streaming load
(LongTasks ÷ panel renders): 0.027 → 0.0068, ~4× fewer. This is the
primary-goal (latency) win the chart throttle couldn't deliver: the 50–157 ms
mid-stream blocks during a live query are gone.

`npm run build` (`vue-tsc -b && vite build`) green.

## What's left

The new frame-level floor is the paint / style pipeline (the residual
rAF / RefreshDriverTick / Styles blocks, ~50–100 ms, far fewer). That's a
deeper / lower-ROI lever; the dominant streaming-jank source is resolved.

## Meta — the lesson

The visible cost (chart `setOption` patch time, ~2.9 s) and the frame-level
bottleneck (auto-save serialization) were **different subsystems**. Ranking by
patch/render time pointed at the charts; the LongTask *stack* analysis pointed
at persistence. Throttling the charts was a real battery win but frame-inert;
the latency win needed tracing the actual >50 ms blocks. Trace the jank, don't
assume the biggest visible cost is the jank source.

License: Public Domain (The Unlicense).
