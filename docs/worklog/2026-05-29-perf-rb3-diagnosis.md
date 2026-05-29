# Worklog — RB-3 diagnosis: the receive path is not the bottleneck (2026-05-29)

RB-3 ("packet-receive-path chunking") was the last named regime-B lever.
Instrumented (`rb3:handler`, `rb3:firstBump`, DEV-gated) and measured on
current `main` (post analysis-panel refactor) against a cold-cache
regime-B capture — `~/perf-profiles/rb3-before.json.gz`, 17.1 s, 962
keydowns, 369 packets, Basic tab. Per ADR-0009 + the normalization
protocol (`perf-capture-normalization-protocol.md`).

## Finding: the receive handler is negligible

- **`rb3:handler`** (per-packet normalize + ledger-merge + stability +
  board-mutation): count 369, p50 **0.2 ms**, max 10.9 ms, **sum 99 ms**
  across the whole capture.

So the synchronous receive *work* is ~99 ms total — **not** the
"73 ms / 2.35 s" the pre-refactor audit attributed to `onAnalysisUpdate`.
That attribution was the version-bump **render cascade** (plus
pre-refactor chart work the analysis-panel refactor has since cut), never
the normalize+merge itself. **Chunking the receive path would optimize
~99 ms — unwarranted.** RB-3 as scoped is **closed**.

## Where the cost actually is: the render cascade (death by a thousand cuts)

- **`Perform microtasks`** (the Vue scheduler flushes): **sum ~9932 ms**,
  p50 6.84 ms × 871. This is the regime-B cost; frames sit at
  `RefreshDriverTick` p50 **72.6 ms**.
- Flushes (871) track **keydowns (962)** more than packets (369) → the
  cascade is navigation re-renders interleaved with streaming, not the
  packet path.
- Component render/patch breakdown (sum over the capture):
  - **Analysis charts** (ScoreLead + MergedDelta via AnalysisChartPanel,
    Basic tab): **~2.7 s** — ~537 updates each, but **already cheap per
    op** (p50 ~0.5 ms; BaseChart's incremental `notMerge:false`).
  - **Board + tree** (per navigation): **~1.5 s** (TreeWidget 650 ms,
    BoardWidget 426, BoardDisplay 271, StatusBar 116; ~328 updates).
  - Timeline: ~0.3 s.
  - The remaining ~5.4 s of flush time is the **reactive-recompute**
    layer (projection / enriched-data / stability computeds running per
    packet + per nav), not captured by component-render markers.
- **No single fat target.** The biggest contributor (the active charts)
  is already cheap-per-op; the cost is the *aggregate* of many cheap
  renders + recomputes per flush, driven by navigating while streaming.

## Conclusions

1. **RB-3 (receive-path chunking) is not a bottleneck — closed.** No
   chunking lever to build.
2. **The typed-effect §5 reserve trigger did NOT fire.** RB-3 was the
   named candidate for a "genuine concurrency / resource-scoping need"
   that would justify full Effect-TS. It didn't materialize — the handler
   is negligible, so there's no chunking / cancellation machinery to build
   here. The **light stack remains sufficient**; Effect-TS stays in
   reserve, un-triggered. (Record in `typed-effect-documentation-plan.md`
   §5/§6 as a sibling note when that arc opens, per its §10 — not edited
   here, to respect the silent-edit discipline.)
3. **Regime B's residual ~72 ms frames are the legitimate
   navigate-while-streaming render cascade.** Post-Phase-2 the maintainer
   judged it "almost non-janky." Remaining options, in order of leverage:
   - **Structural:** fine-grained reactivity (Vue **Vapor Mode**) —
     re-run only what changed per flush, not the whole cascade. The
     render-coupling postmortem already names this as the by-construction
     fix. Vapor is beta (~Q4-2026 stable) — a future arc, not now.
   - **Micro-opt (diminishing returns):** throttle the active analysis
     charts' per-packet updates (ScoreLead/MergedDelta), the same lever as
     the distribution-panel coalescing. Smaller win than the distributions
     (per-op is already cheap), touches the shared BaseChart, and the
     perception is already acceptable — optional, not indicated.
   - **Accept the current state:** the big regime-B wins landed in the
     analysis-panel refactor (Phases 0-3) + the distribution coalescing.
     RB-3 was the last suspect and is a red herring post-refactor — the
     perf arc is essentially complete.

## State / next (for the maintainer's return)

- The RB-3 instrumentation (`rb3:handler` / `rb3:firstBump`, DEV-gated)
  and the `DEBUG_PACKETS` per-packet-log gating live on
  `bork/perf/rb3-packet-receive` (currently rebased onto #309 so the
  clear-cache button is in that tree for testing). Decisions for you:
  - The **`DEBUG_PACKETS` gating is worth keeping** regardless (logging
    hygiene) — land it.
  - The **`rb3:*` marks** have served their purpose (this diagnosis);
    keep them as a perf harness or strip them — your call.
  - Git: once you merge **#309** (clear-cache button, verified), ping me
    and I'll rebase RB-3 onto `main` (drops #309's commit from its diff);
    the RB-3 branch then PRs as the gating + (kept?) marks + this
    diagnosis.
- **No after-capture is needed** — there is no fix to validate.

License: Public Domain (The Unlicense).
