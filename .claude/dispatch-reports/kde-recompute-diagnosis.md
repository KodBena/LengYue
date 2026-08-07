# KDE-recompute-on-range-change — diagnosis

## Docs read (end-to-end, per ADR-0002 corollary in `frontend/CLAUDE.md`)
- `frontend/CLAUDE.md` (full)
- `frontend/FILES.md` (lookup use, per its own stated exemption)
- Not read end-to-end: `tests/CLAUDE.md`, `docs/handoff-current.md`, `docs/dispatch/*`
  (this is a read-only diagnosis, not authoring — flagged per the
  "say so audibly" rule rather than silently skipped).

## LOCATION

`frontend/src/composables/analysis/useAnalysisContext.ts:52-55`

```ts
const deltaKdeSeries = computed<DistributionSeries[]>(() => [
  { name: 'Black', samples: valuesFromSeries(projection.enriched.value.deltaSeries.black), color: themeColor('--player-black') },
  { name: 'White', samples: valuesFromSeries(projection.enriched.value.deltaSeries.white), color: themeColor('--player-white') },
]);
```

Consumed by `frontend/src/components/charts/DeltaDistributionPanel.vue:21`
(`:series="ctx.deltaKdeSeries.value"`), rendered by
`frontend/src/components/charts/DistributionChart.vue` (KDE math itself
in `frontend/src/lib/distributions.ts`'s `kde()`). Same shape applies to
`mistakeGapHistogramSeries` at `useAnalysisContext.ts:56-59`
(consumed by `MistakeGapPanel.vue`) — not KDE, but the identical
root cause, so a fix should cover both.

The analysis move-range ("selection range") lives in
`frontend/src/composables/analysis/useAnalysisTimeline.ts:59-61`
(`selectionRange`, store-backed at `BoardState.analysisRange`,
mutated only via `setSelectionRange`). It is re-exported by
`useAnalysisProjection.ts:37,104` and available on the injected
`AnalysisContext`, but `deltaKdeSeries` never reads it.

## MECHANISM

`deltaKdeSeries` is a Vue `computed`. Vue computeds re-evaluate only
when a reactive value they actually **read** during evaluation
changes — the dependency set is whatever the body touches, not
whatever "should" affect it. The body above reads exactly one
reactive input: `projection.enriched.value.deltaSeries` (`{black,
white}`), each `EnrichedSeries.data` built in
`enriched-accumulator.ts:249-256` as `this.blackDeltas.map((v, i) =>
[i, v])` / `this.whiteDeltas` — the **entire** per-colour delta
series over the full variation path, indexed by colour-local move
index `i`, with no slicing.

`selectionRange` (the move-range picker) is never dereferenced
anywhere in `deltaKdeSeries`'s body, nor in `valuesFromSeries`, nor
in `enriched-accumulator.ts`'s delta-series construction. So from
Vue's reactivity-tracking perspective, `deltaKdeSeries` has **no
dependency on the range at all** — changing it cannot trigger a
recompute because the computed literally never subscribed to it.
This is not a stale cache (there is no memo/cache key here — it's a
plain `computed`); it is a **missing read**, one level below where a
cache-key omission would show up. The maintainer's framing
("recomputed" implies it should filter by range and doesn't) is
accurate: the KDE panel has always shown the delta distribution over
the *whole game*, and the move-range control only ever fed
`analyzeSelection` (`useAnalysisTimeline.ts:99-109`, which asks the
engine to (re-)analyze that ply span) — a completely different
consumer of `selectionRange` than the KDE display. Nothing in the
display path was ever wired to the range; it isn't that it went
stale, it's that it was never live to begin with. `DistributionChart.vue`
itself is fine — its `watch(() => [props.series, ...])` fires
correctly on every `props.series` identity change (confirmed by
reading the file in full); the defect is upstream, in what
`deltaKdeSeries` computes from.

`MistakeGapPanel`'s `mistakeGapHistogramSeries` has the identical
gap: `useMistakeFinder` (`useMistakeFinder.ts`) computes over the
full `enriched` series with no range slicing either.

## WITNESS status

- **Static/code-reading trace (WITNESSED):** traced the full call
  chain by reading source, listed above — `deltaKdeSeries` body,
  `valuesFromSeries`, `EnrichedSeries.data` construction in
  `enriched-accumulator.ts`, `selectionRange`'s only consumer
  (`analyzeSelection`) in `useAnalysisTimeline.ts`, and confirmed via
  `grep -rn "deltaKdeSeries" src` that `selectionRange` and
  `deltaKdeSeries`/`mistakeGapHistogramSeries` share no code path.
  This is sufficient on its own to explain the reported symptom: it
  is a structural absence of a reactive read, not a race or a timing
  bug, so a live repro would only reconfirm what the source already
  proves.
- **Live browser witness: UNEXERCISED.** Blocker: reproducing this
  meaningfully needs a board with real per-move analysis data (delta
  values require a completed KataGo pass over multiple moves) via
  the live engine (`ws://127.0.0.1:1235`, engine `14`), then driving
  the range slider and reading back the rendered KDE curve/legend
  through the ECharts canvas — `frontend/scripts/perf-capture.mjs`
  is a trace-capture harness built around pre-registered
  `window.__perfScenario` scenarios (`scenarios.ts`), not an
  interactive point of control for arbitrary UI elements like the
  range-selection drag handles; standing up an equivalent bespoke
  Playwright flow (create board, connect engine, run analysis over
  enough plies to populate `deltaSeries`, drag the range control,
  screenshot before/after) was judged out of scope for this
  read-only diagnosis pass given the source-level proof is already
  unambiguous — this is a code-reading conclusion, not a hypothesis
  that needs empirical tie-breaking. No screenshots produced.

## PROPOSED MINIMAL FIX

Files a fix agent would touch:

1. **`frontend/src/composables/analysis/useAnalysisContext.ts`** —
   make `deltaKdeSeries` (and `mistakeGapHistogramSeries`) read
   `projection.selectionRange.value` and slice the per-colour
   samples to that ply window before building `DistributionSeries`.
   `valuesFromSeries` would need a range parameter, or a new
   slicing helper filtering `EnrichedSeries.data` entries by index
   `i ∈ [start, end)`. This alone makes the computed depend on
   `selectionRange` and closes the bug.
2. Possibly **`frontend/src/composables/analysis/useMistakeFinder.ts`**
   — same range-slicing gap for the mistake-gap histogram, if the
   maintainer wants both panels to respect the range consistently
   (not explicitly reported, but the identical defect class).

**Foreclosing type/key change** (per the project's `RawKey`/
`EnrichedKey` branded-cache-key discipline in
`frontend/CLAUDE.md`'s "Type-driven design" section): there is no
cache here to re-key — `deltaKdeSeries` is a plain `computed`, so
the branded-key remedy doesn't directly apply. The analogous
type-driven fix is to make the **dependency explicit and
unavoidable in the function's signature**: introduce a small typed
input, e.g.

```ts
interface DeltaSampleQuery {
  series: EnrichedSeries[];
  range: [PlyIndex, PlyIndex];
}
function samplesInRange(q: DeltaSampleQuery): number[] { ... }
```

so that any future caller of a "give me the delta samples" function
is forced to supply a range at the call site — the same spirit as
"the brand's declaration names the dependency set of the value it
buckets": a function that returns per-range samples but has no
range parameter is the un-typed analogue of a cache key missing a
leg, and should read as suspicious on sight the same way.

**Test (red-then-green):** a `tests/unit/` or `tests/integration/`
test constructing an `EnrichedResult`-shaped fixture with
`deltaSeries.black` spanning e.g. 10 colour-local moves with
distinguishable values (say `[0,0,0,0,0, 100,100,100,100,100]`),
computing `deltaKdeSeries` (or the post-fix samples helper) once
with `selectionRange = [0, 5]` and once with `[5, 10]`, and
asserting the two resulting sample sets (or their means) differ.
Red today: both ranges currently produce the identical full-series
KDE regardless of `selectionRange` input. Green after the fix: each
range's output reflects only its slice. `useAnalysisTimeline.ts`
already exports `selectionRange`/`setSelectionRange` in a
store-backed, easily-fakeable shape (mutate `BoardState.analysisRange`
via `mutateBoard` in the test fixture), so this fits Tier 3
(`tests/integration/`) composable-integration conventions described
in `frontend/CLAUDE.md`'s Testing posture section.
