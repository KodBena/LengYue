# Worklog — stability-panel re-profile + measurement substrate (2026-06-11)

> Discharges the **re-profile-first** clause on the open work-status item
> `usestabilitymetrics-incremental-projection`. Branch
> `bork/perf/usestabilitymetrics-incremental`, PR #TBD. Deliverable is a
> measurement finding (the stability-panel `useStabilityMetrics` computed cost
> on current main) plus the dev-only harness scenario that makes that cost
> measurable at all. `useStabilityMetrics.ts` is **not** touched — the
> accumulator lever is gated on a magnitude the measurement does not reach. The
> todo DB was read-only this session; the description append below is staged for
> the maintainer.

## Context — why a re-profile, and why the existing captures could not see it

The item carries the same lineage as the 2026-05-31 incremental-enriched-
projection arc: `useStabilityMetrics` is a Vue `computed` that, for every node
on the variation path, reads `stabilityTrajectoryStore.getTrajectory(rawKey,
extractor, nodeId)` inside its loop. Each `getTrajectory` touches that key's
per-key version ref (the tracking read), so the computed **subscribes to all N
path nodes' version refs**. When any one of them bumps — a packet arrives for
one node — the **whole computed re-runs O(N) over the entire path**. This is
the same O(N)-per-packet shape `enriched-accumulator.ts` was built to amortize
to O(1) for the enriched projection.

The item's re-profile-first clause was **binding and not discharged** by the
2026-06-11 regime-B re-profile (`docs/notes/investigation-perf-reprofile-2026-06-11.md`):
that arc measured nav/range scenarios on the **Basic** Analysis sub-tab, which
renders only ScoreLead + MergedDelta. **StabilityPanel lives in the `'stability'`
sub-tab** (`store/defaults.ts` `analysisTabs[2]`), which the harness never
activates — so the existing captures show *zero* stability-panel cost. There
was no existing stimulus exercising the panel; the measurement substrate had to
be built before the cost could be read (the same "harness sub-arc before app
lever" shape the 06-11 re-profile recommended for many-boards).

## What ran

A new dev-only scenario `stability-nav-range` (mirror of `nav-range` but the
autonav walk pins the **Stability** sub-tab, so `StabilityPanel` mounts and
`useStabilityMetrics` recomputes under the same streaming packet load). Captured
against a worktree dev build on `:5181` (the running `:5173` is the *main*
worktree and lacks the new scenario), SELECTOR `ws://127.0.0.1:1235` model
`b10`, 1000 visits/move, cold cache, adaptive off — the green-arc protocol.
Traces under `~/w/vdc/chromium_profiles/` per the ADR-0009 off-tree convention.

The computed's O(N) cost was isolated from the panel render / chart patch cost
with a **temporary** `performance.measure('useStabilityMetrics:compute', …)`
(DEV-only, removed before commit — `git diff` on `useStabilityMetrics.ts` is
empty). Counts are the ADR-0009 Chromium-path comparable; the per-recompute
durations below are recorded as **exploratory observations** (the ADR-0009
"worklog-internal exploratory observations" register), used only to size
magnitude, not as authoritative wall-clock claims.

## Finding — the O(N) shape is present; the magnitude is small

Headline capture (`stability-nav-range`, 125 `rb3:handler` packets, 100
autonav steps, N=101 path nodes):

- **`useStabilityMetrics:compute` ran 102×** over 125 packets = **0.82
  recomputes per packet** — confirming the predicted O(N)-per-on-path-packet
  shape (one full re-pass per packet that lands on a path node).
- Per-recompute (exploratory, N=101): **median 84 µs, avg 144 µs, p90 172 µs,
  p99 1582 µs, max 1847 µs**. **Aggregate 14.69 ms** over the whole ~100-step
  streaming window.

**Absolute magnitude is the load-bearing reading:** 84 µs at median is ≈0.5%
of a 16.7 ms frame; the lever (accumulator → O(1)/packet) would save ≈14.7 ms
aggregate across a full-game streaming window, i.e. ≈84 µs/packet. That is real
but sub-frame at median.

**Relative magnitude (supporting):** in the *same* capture the dominant costs
are an order of magnitude larger — TreeWidget render 303 ms (3004 µs avg),
StabilityPanel + its chart patch 303 ms, AnalysisChartPanel patch 125 ms. The
stability computed is independently small, not merely small-by-comparison.

Component render/patch ratios were **R/P = 1.00 across every component** — no
render-coupling (ADR-0010's `render ≫ patch` tell absent); the panel re-renders
about once per on-path packet, it does not thrash.

## Decision — measurement-only; NO accumulator lever (ADR-0009 case-2)

The commission made Stage 2 conditional: build the enriched-accumulator pattern
**only if** the capture shows the O(N) shape *at meaningful magnitude*. The
shape is present; the magnitude reads below that bar (84 µs median, sub-frame,
≈20× dominated). This is the ADR-0009 **case-2** outcome class
(measurement-finds-nothing-meaningful) for the *lever*, with the structural
shape itself confirmed-present. Building the accumulator (a new stateful class +
the `patchNode`-sequence ≡ `rebuild` equivalence test + the reactive rewiring)
to amortize an 84-µs-median per-packet cost is not warranted now.

This judgment was put through the `hack-rationalization-detector` (the two
deterministic scripts run; my own justification treated as the object of
suspicion; frame limitation that I am not strongly out-of-frame named). Verdict:
**narrower-but-justified** — the downgrade is anchored to a measured cost gap,
not a minimality word. The full artifact is appended verbatim below (auditability
per the memory convention).

### Caveats the decision rests on (named, not buried)

- **N-dependence.** The recompute is linear in path length; measured at the
  100-move fixture (N=101). A 300-move game projects to ≈250 µs median — still
  sub-frame and still dominated, but the "small" verdict is anchored to a
  representative, not worst-case, depth. If the stability panel is ever a felt-
  jank surface specifically on very long games, the lever's value rises and this
  no-build should be revisited.
- **Tail.** p99 ≈1.6 ms / max ≈1.85 ms — ≈10% of a frame, rare (<1% of
  recomputes, likely the first cold-trajectory packets at a turn). Not lever-
  justifying, but the cost is not uniformly negligible.
- **Packet-volume confound (#1).** Across three stability runs the cold-cache
  packet count varied 56–202 (upstream NN cache warming across runs on the same
  fixture), so the per-packet normalization is load-bearing; absolute counts are
  not cross-comparable as totals.

## Code change (the measurement substrate only)

- `composables/perf/autonav.ts` — `AutonavOptions` gains an optional `subTab`
  (default `'basic'`, the historical pin); `runAutonav` forces that sub-tab when
  `normalizeTab` is true. Inert when `normalizeTab` is false.
- `composables/perf/types.ts` + `scenarioContext.ts` — `ctx.autonav` threads the
  `subTab` option through to `runAutonav`.
- `composables/perf/scenarios.ts` — new `stability-nav-range` scenario (pins
  `subTab: 'stability'`); header + FILES.md row updated.

All dev-only (B2), DCE'd in production via the existing `import.meta.env.DEV`
gates on the `__devForceActiveAnalysisTab` hook. Makes no perf *claim* (ADR-0009).

## Documentation audit

- **Work-status store:** read-only this session. The description append below is
  **staged**, not applied — the maintainer applies on sign-off. The item stays
  **open** (the shape is real; the lever is a magnitude-gated follow-up, NOT
  retired).
- **handoff-current.md:** read end to end; no orientation surface it carries is
  affected. No edit.
- **FEATURES.md:** no edit — no user-facing capability changed (dev-only harness).
- **FILES.md:** `scenarios.ts` row updated for the new scenario; band unchanged
  ([B2]). No new file, so no new row. **IDENTIFIERS.md:** no branded id added.
- **ADR-0009 "Revisit when…":** no trigger satisfied — this arc *uses* the
  tooling; the new scenario is a harness addition, not a tool-surface or metric-
  vocabulary change.
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs`; committed `docs/doc-graph.json` +
  `docs/doc-graph.md`.
- **Dispatch ledger:** no open dispatch addressed to the frontend bears on this.

## Deviations (recorded loudly)

1. **Wall-clock durations recorded, not just counts.** The ADR-0009 Chromium-path
   comparable is counts; I additionally recorded per-recompute durations (via
   temporary instrumentation) because the **magnitude** question Stage 2 gates on
   cannot be answered by counts alone (counts give recompute *frequency*, not
   *cost*). The durations are flagged as exploratory observations, not
   authoritative claims, and the no-build decision leads with the absolute
   magnitude. The temporary instrumentation was removed before commit.
2. **A harness scenario was built as part of a "measurement-first" arc.** The
   existing scenarios could not exercise the stability panel (Basic sub-tab),
   so measuring required adding the substrate. This is the sanctioned
   "harness sub-arc before app lever" shape; the substrate is dev-only and
   carries no app-behaviour change.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite, exit 0); `npx eslint .`
exit 0; `npm run test:run` 912 passed / 4 skipped (unchanged from main — the
change is a dev-only harness addition; no behaviour test surface). No new unit
test commissioned (measurement-only delivery; the scenario is measurement
substrate exercised by the capture path, like the existing scenarios).

## Staged work-status description append (NOT executed — maintainer review)

`usestabilitymetrics-incremental-projection` — append (preserving prior text):

> [2026-06-11 re-profile (docs/worklog/2026-06-11-perf-stability-panel-reprofile.md):
> the O(N)-per-frame shape IS present and measured — useStabilityMetrics
> recompiled 102x over 125 packets (0.82/packet, one full O(N=101) re-pass per
> on-path packet) on a new `stability-nav-range` harness scenario (the existing
> scenarios pin the Basic sub-tab, which does not mount StabilityPanel). BUT the
> magnitude is small: per-recompute median 84us / avg 144us / p99 1582us,
> aggregate 14.69ms over a ~100-step full-game streaming window; ~0.5% of a
> 16.7ms frame at median, and ~20x dominated by TreeWidget render (303ms) /
> chart patch (303ms) in the same capture. ADR-0009 case-2 (measurement-finds-
> nothing-meaningful) for the LEVER -> measurement-only delivery; the enriched-
> accumulator treatment is NOT built. Caveat: cost is linear in path length
> (measured at N=101; a 300-move game projects ~250us median, still sub-frame).
> Item stays OPEN: re-scope the residual to "build the accumulator only if the
> stability panel is found to be a felt-jank surface on very long games, or if a
> faithful frame-ms (Firefox-path) capture contradicts the count finding." Engine
> ws://127.0.0.1:1235 b10 / 1000 visits / cold cache; traces under
> ~/w/vdc/chromium_profiles/. NO build blind.]

## Appendix — hack-rationalization-detector artifact (verbatim)

The build/no-build judgment was audited with the `hack-rationalization-detector`
skill. Per the verbatim-return convention, the full artifact:

```
## Hack-rationalization review: usestabilitymetrics-incremental-projection (build/no-build judgment)

FRAME CHECK: PARTIAL — I produced this judgment, so I am NOT out of frame in the
strong sense the skill demands. I ran the two deterministic scripts (which cannot
be reasoned around) and am treating my own justification as the object of
suspicion rather than as context to agree with. This is the weaker of the two
sanctioned frames; I name the limitation loudly. A truly independent invocation
would be stronger, and I flag that the maintainer should weight this accordingly.

GENERAL FIX:   "A per-turn projection over the variation path patches only the
               node that changed (O(1)/packet), never re-deriving the whole path
               (O(N)/packet)" — the enriched-accumulator invariant, applied to
               useStabilityMetrics. It IS stateable as one invariant; it is the
               same one enriched-accumulator.ts already discharges for the
               enriched projection.
PATCH SHIPPED: No patch to the computed. A measurement-only delivery: a new
               `stability-nav-range` perf scenario (the substrate that makes the
               panel measurable at all — the existing scenarios pin the Basic
               sub-tab, which does not mount StabilityPanel) + worklog + staged
               DB append. useStabilityMetrics.ts is untouched (git diff empty).
DOWNGRADE:     Concrete measured cost, NOT a discipline-word: the isolated
               computed costs 84us median / 144us avg / 14.69ms aggregate over a
               full ~100-step streaming window at N=101. The dominant costs in
               the SAME capture (TreeWidget render 303ms, StabilityPanel+chart
               patch 303ms, AnalysisChartPanel patch 125ms) are ~20x larger.
               The accumulator lever would amortize the 84us-median recompute to
               O(1), saving ~14.7ms aggregate — real, but sub-threshold against
               costs an order of magnitude larger, and below the per-frame budget
               at median (84us ≈ 0.5% of 16.7ms).
WRITER DELTA:  N/A to the shipped change (no per-writer gate was built — there is
               no fix to be incomplete). For completeness: the O(N)-read state
               (`trajectories` / `trajectoryVersions` maps) has exactly ONE
               writer each (`record()` in stability-trajectory-store.ts:116),
               plus purge paths. The accumulator lever, IF built, would consume
               from that single producer — no multi-writer fragility either way.
RUNTIME:       Reproduced + measured. Live dev server (worktree build on :5181) +
               real engine (ws://127.0.0.1:1235, b10, 1000 visits, cold cache).
               Three captures; computed cost isolated with temporary
               instrumentation (removed; git diff confirms clean). NOT derived on
               paper — the 102-recompute / 0.82-per-packet shape is measured.

TELLS (Step 1): No co-occurrence tell. 3 minimality-terms ("over-engineering",
               "proportionate", "sub-threshold") seen, 0 named-fix cues
               co-occurring. The named-better-fix (the accumulator) IS narrated,
               but its downgrade is anchored to a measured magnitude, not to the
               minimality-word — which is the honest-narrowing case the scanner
               distinguishes from a hack.

VERDICT: narrower-but-justified

WHY: The O(N)-per-frame shape the item predicted is genuinely present and
measured (102 full re-passes, one per on-path packet). The decision not to build
the lever rests on a measured cost gap of roughly 20x against the dominant costs
in the same capture and a median per-recompute well under 1% of the frame budget
— a concrete cost comparison, not a taste call or a minimality reflex. The
commission explicitly made Stage 2 conditional on "meaningful magnitude," and the
measurement reads below that bar; ADR-0009 case-2 (measurement-finds-nothing-
meaningful) is the matching outcome class.

FINDINGS BEYOND VERDICT (required):
  - The magnitude is N-dependent and I measured at ONE depth (N=101, the 100-move
    fixture). The recompute is linear in path length, so a 300-move game triples
    the per-recompute cost (~250us median projected) and the aggregate. That is
    still sub-frame and still dominated, but the "small" verdict is anchored to a
    representative-not-worst-case depth. If a future arc finds the stability panel
    is a felt-jank surface specifically on very long games, the lever's value
    rises and this no-build should be revisited. The worklog must name this N-
    dependence explicitly, not bury it.
  - The p99 (1582us) and max (1847us) recompute tail is ~10% of a frame. These are
    rare (sub-1% of recomputes) and likely coincide with the first packets at a
    turn (cold trajectory, more changepoints), but they mean the cost is not
    uniformly negligible — there are occasional ~1.6ms recomputes. Not lever-
    justifying on their own, but honest to record.
  - The "dominant costs are 20x larger" framing is true but is itself a partial
    argument: those dominant costs (TreeWidget, chart patch) are SEPARATE,
    independently-tracked surfaces with their own open items. The stability
    computed being small does not become large if they were fixed — it is
    independently small. So the relative-magnitude argument is sound, but the
    ABSOLUTE argument (84us median, sub-frame) is the load-bearing one and should
    lead in the worklog, with the relative comparison as support. I have the
    ordering right in the delivery.
  - Nothing structurally prevents the O(N)-per-packet shape from being re-noticed
    and re-deferred indefinitely. The honest disposition is: the shape is real,
    the magnitude is measured-small at representative depth, and the lever is a
    documented, gated-on-magnitude follow-up — NOT "retired." The staged DB append
    must keep the item open with the magnitude recorded, so the next reader does
    not re-measure from scratch (the exact rb3-lesson the item itself cites).
```

License: Public Domain (The Unlicense).
