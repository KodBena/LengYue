# Worklog — Distribution-Chart Redraw Coalescing (2026-05-29)

Follow-on to the analysis-panel Phase 0 seam
(`2026-05-29-refactor-analysis-panel-phase0-seam.md`). The two analysis
distribution panels (delta-KDE-with-uncertainty, mistake-gap histogram)
ran a full `setOption({notMerge: true})` KDE rebuild on the **synchronous
Vue render/patch path** on every analysis packet (~12 ms / ~8 ms p50,
tail to 137 ms). This arc coalesces and cheapens those redraws.

**Honest upshot up front:** the changes are correct, composable, and
lossless, but they are *not* the regime-B felt-jank lever. The
distribution paint is <10 % of a ~170 ms regime-B frame; the frame cost
is death-by-a-thousand-cuts across the whole analysis subtree. The
structural lever is Phase 2 (render only the active tab), not here.

## Change

- **Trailing+leading 250 ms throttle** (the `HeatmapChart` idiom) on
  `renderChart`. Caps redraws and moves the paint off the synchronous
  flush into a coalesced `setTimeout`. Per
  `[[project-adaptive-delta-fanout]]` the adaptive phase churns the KDE
  source every packet (a touched turn forwards a fresh delta for itself
  and its delta-window neighbours), so a **time cap is the lever, not a
  data-changed gate** — the gate would pass nearly every adaptive packet.
- **Collapsed-panel gate.** `v-show` kept a hidden panel's chart mounted
  and redrawing the full KDE on every source change; it now schedules
  nothing while collapsed (the `watch(expanded)` handler repaints on
  re-open).
- **`onUnmounted` timer cleanup** — the throttle callback closes over the
  chart instance; clear it before `dispose()`.
- **Incremental merge.** `notMerge: false` for the steady-state data
  churn, reserving `notMerge: true` for genuine structure changes
  (cohort / band / variant) detected via a series-structure signature
  (`name:type` per ECharts series). Mirrors `BaseChart`'s `namesChanged`
  gate. **Lossless:** same KDE, same 200-point resolution, same data —
  only the ECharts write path differs.

The throttle constant was subsequently centralised into
`src/lib/timing.ts` as `DISTRIBUTION_REDRAW_THROTTLE_MS` (a separate,
behaviour-neutral refactor — its own worklog-less commit).

## Measurement (ADR-0009)

Three regime-B captures (navigate while a range query streams), ~31–35 s,
~1800–2070 keydowns. **Normalisation note:** KataGo's result cache warms
across re-runs of the same game, so each successive capture streamed more
packets per wall-second — raw totals are not comparable. Keydowns were
near-matched across the throttle→lever-2 pair (2045 vs 2071), so those
are read per-keydown; the cache-warm `phase0` capture is the structural
before-state, not a normalised baseline.

- phase0 (pre-coalescing): `~/perf-profiles/capture-during-range-query-phase0.json.gz`
- no_cc (throttle + gate):  `~/perf-profiles/no_cc.json.gz`
- lever2 (+ incremental merge, lazyUpdate on): `~/perf-profiles/lever2.json.gz`

| Metric | phase0 | no_cc | lever2 |
|---|---|---|---|
| Distribution paint lives in | **Vue patch (sync)** | setTimeout | setTimeout |
| DeltaDistributionPanel patch p50 | 12.0 ms | 0.1 ms | 0.1 ms |
| DeltaDistributionPanel patch sum | 1678 ms | 52 ms | 53 ms |
| setTimeout callback p50 | — (paint in patch) | **19.73 ms** | **4.22 ms** |
| setTimeout callback sum | — | 5496 ms | 2752 ms |
| RefreshDriverTick (frame) p50 | 167.7 ms | 175.8 ms | **191.7 ms** |
| Jank sum | 47355 ms | 44620 ms | **50993 ms** |
| total CPU | 13995 ms | 14474 ms | 14189 ms |
| keydowns / microtask flushes | 1801 / 1032 | 2045 / 1282 | 2071 / 1153 |

1. **Throttle + gate** moved the per-packet KDE+`setOption` off the
   synchronous Vue patch/flush (`DeltaDistributionPanel` patch
   12 ms → 0.1 ms) into a coalesced `setTimeout`. Frame throughput flat;
   per-keydown CPU flat-to-slightly-down. The win is **input-path
   responsiveness** (the flush that gates the next keypress is now
   light), not throughput.
2. **Lever 2 (incremental merge)** cut the deferred-render cost:
   setTimeout p50 **19.73 → 4.22 ms (−79 %)**, sum −50 %. The per-redraw
   work genuinely shrank.
3. **`lazyUpdate: true` (paired with lever 2, captured in `lever2`) was a
   regression** and has been reverted (commit `af112dd`). It relocated
   the now-cheaper paint from the off-frame `setTimeout` into the next
   rAF, loading the already-saturated regime-B frames
   (`RefreshDriverTick` p50 +9 %, Jank sum +14 %) in a capture that was
   otherwise *less* busy (−10 % microtask flushes — a less-busy capture
   with heavier frames is the signature of work relocating into the
   frame path). A once-per-250 ms throttled redraw has nothing to batch,
   so `lazyUpdate` has no upside here. Reverted **by reasoning, not
   re-measured** — a confirming capture is deferred.

**Honest scope.** The distribution paint is <10 % of a ~170 ms regime-B
frame and fires at ~2–4 Hz. The frame cost is spread across the whole
analysis subtree — the ~1800 cheap-but-numerous `BaseChart` analysis-chart
updates, the timeline — plus the per-navigation board/tree re-render. No
single contributor dominates, so these (correct, lossless) micro-opts do
not move the regime-B felt jank. The `cc.json.gz` capture corroborated
this independently: the cross-correlations panel is cheap, and the ~78 %
`requestAnimationFrame`-callback density is invariant across captures.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped.
- The incremental-merge structure signature (band toggle, variant switch,
  cohort drop all trip `notMerge: true`; steady-state stays
  `notMerge: false`) is reasoned at the call site. No `DistributionChart`
  render test exists, so **visual validation during streaming is the
  backstop** — confirm no stale/ghost series and clean band/variant
  toggles.

## Next

- The regime-B structural lever is **Phase 2** (multi-tab; render only
  the active tab → *unmount* inactive panels, removing whole contributors
  from the frame), not further distribution work. **Phase 1** (component
  registry + `<component :is>`) is its prerequisite.
- Deferred: a confirming capture for the `lazyUpdate` removal; the
  broader non-coalescing timing-literal catalog
  (`docs/notes/deferred-items.md`).

License: Public Domain (The Unlicense).
