# Debounce analysis-ledger version bumps via requestAnimationFrame

- **Status:** Shipped on `frontend/debounce-analysis-ledger`,
  2026-05-03. Single-file fix in `src/services/analysis-ledger.ts`;
  build green.
- **Genre:** Performance / responsiveness fix — long-deferred
  closure on a known main-thread saturation symptom under
  fast-backend conditions.
- **Date:** 2026-05-03.

## Context

The frontend's `AnalysisLedger` is the single ingress for KataGo
analysis packets: `record(hash, nodeId, packet)` merges the packet
into per-(hash, nodeId) storage and bumps a per-node `Ref<number>`
that all reactive consumers (`useEnrichedData`, `useKernelSeries`,
`useTriangularHeatmap`, every chart panel, the board overlays)
subscribe to. One bump per packet → cascade through every
consumer's `computed()` → `setOption` on every chart.

Under fast-backend conditions this saturated the main thread:

- **KataGo NN-cache hits** return analysis nearly instantly when the
  position has been seen before; packets arrive faster than the
  reportDuringSearchEvery cadence.
- **Proxy replay-cache replays** (when enabled per the architecture
  note in `proxy/CLAUDE.md`) replay an entire stored response
  stream effectively in one tick — many packets in a microtask.

The symptom was the SPA briefly locking up during analysis-graph
redraws. Surfaced again as preparation for the multi-subscriber
non-regression test in
`docs/dispatch/frontend-to-proxy-keep-alive-middleware.md`'s Phase 1
testing plan, which deliberately fires concurrent ponders from two
tabs sharing one coalesced canonical — a workload that exacerbates
the flood.

## What changed

`frontend/src/services/analysis-ledger.ts`. Single-file change:

1. **ADR-0006 header retrofit** — file lacked the standard JSDoc
   header (path + purpose + license); added per the touched-under-
   full-visibility convention.
2. **New "Batched version-bump scheduler" section** —
   module-scope `pendingBumps: Set<string>` + `flushScheduled: boolean`
   + a `scheduleBumpFlush()` function that, on first call within a
   frame, schedules a `requestAnimationFrame` callback to drain
   `pendingBumps` (each key → `nodeVersions.get(key)?.value++`).
3. **`record()` modification** — instead of bumping the version
   ref synchronously, ensures the ref exists (`getOrCreateVersion`
   for subscription target) and adds the key to `pendingBumps` +
   schedules the flush. The merged packet is still stored
   synchronously, so any non-reactive `getRaw()` returns the
   current data immediately; only the reactive notification is
   deferred.

`purgeBoard()` left unchanged (continues to bump directly): it is a
one-shot user action that wants immediate visual feedback, not a
flood needing coalescing. Documented inline.

## Why this shape

The bottleneck is centralised at `ledger.record()` — every consumer
subscribes through the per-node version refs that `record()` bumps.
Debouncing at this single point means:

- **One change site.** No per-chart or per-composable retrofit.
- **Data path unchanged.** The merged packet is stored
  synchronously; only the *notification* is batched. Any code path
  that reads via `getRaw()` outside a reactive context (e.g.,
  `BoardWidget.vue:81`, `BoardTab.vue:74`) sees the latest data
  with no delay.
- **Browser-paced.** RAF aligns with the screen's refresh; bumps
  collapse to at most one per frame (~16ms at 60Hz). Sub-frame
  updates wouldn't have been visible anyway.
- **Backgrounded-tab safe.** When the tab is hidden, RAF stops
  firing; bumps queue harmlessly until restored, then one final
  flush shows the latest state. (Slight improvement over today's
  behaviour, which keeps re-rendering invisibly while
  backgrounded.)

The pre-existing per-node fine-grained reactivity (one Ref per
(hash, nodeId)) is preserved — bumping a key in the flush only
re-fires consumers that read *that specific* node, not a broadcast
across the ledger.

## Verification

- `npm run build` (vue-tsc + vite build) clean. No new warnings.
- Manual verification expected in the same testing scenarios listed
  in the dispatch's Phase 1 / Phase 2 / Phase 3 testing plans —
  open two tabs on a coalesced position, watch SPA responsiveness
  during the concurrent ponder. Pre-fix: lock-ups visible at NN-
  cache-hit packet rates. Post-fix: smooth chart updates with no
  main-thread saturation.

## Forward notes

- The `frontend/CLAUDE.md`-indicated "magic-literal:" comment
  convention does not apply here — the ratio of literals (`0`
  default version, `false` flush flag) is too small to warrant
  inline justification.
- No TODO entry to mark complete (the work was tracked informally
  as "I've put it off for so long" in conversation, not as a
  numbered TODO row); no entry to add either, since the work is
  shipped.
- No `handoff-current.md` "Known gaps" entry to remove — chart-
  redraw saturation under fast backends was not enumerated there
  as a load-bearing rough edge.
