# Worklog — incremental enriched projection (2026-05-31)

The analysis projection's root computed, `useEnrichedData`'s `enriched`, was an
O(path-length) pass re-run *per frame* during a packet flood — the dominant
per-packet JS cost in the combined-stress profile (`long_heavy.json.gz`: Vue
reactive `get`/`track` ≈ 13%, the ~N `ledger.getRaw` reads × per frame, forced
eager by the chart watchers). This replaces the full re-derive with an exact
incremental accumulator: a packet now costs O(1), not O(N).

## Why B (incremental) over A (throttle)

A throttle on `enriched` would have introduced a *shown ≤ live* asymmetry on
the central pipeline value, guarded only by a type-invisible, unenforceable
global invariant ("no sub-cadence consumer may read the throttled projection").
B keeps the projection **exactly live** — no asymmetry — at the cost of a
*local, testable* invariant: `patchNode`-sequence ≡ full `rebuild`. Drift-risk
analysis (and the project's type-sanity primacy) favoured B. The stability
metrics, incidentally, are fed at *ingestion* (`analysis-service` →
`stabilityTrajectoryStore.record`, every packet), upstream of and independent
from this display projection, so neither approach risked dropping the
`is_during_search=True` packets they consume.

## Delta arbitration — empirically de-escalated

The delta fold resolves overlapping per-`mIdx` estimates by **last-path-order
wins** (highest contributing path index). This was originally flagged as a
possible bug; controlled probes against the live SELECTOR proxy (b10c128, real
`quality_delta` palette, `clear_cache` between independent samples — credit the
maintainer for both the test and the cache-clearing) settled it:

- No placeholder zeros (the earlier `0`s were a synthetic-`vd` artifact).
- Visits **always tie** (they reflect the *budget*, not estimate quality) — so
  "highest-visits-wins" is moot.
- Disagreements are immaterial: 16% of overlaps differ, by a median 0.005 / max
  0.014 on the [0,1] quality scale.

So the existing arbitration is fine and was kept; the only change is making the
derivation incremental, reproducing last-path-order exactly.

## What shipped

- **`analysis-ledger.ts`** — `onLedgerFlush(fn)` changed-key signal, emitted at
  all three bump sites (rAF-coalesced flush, first-packet sync bump, purges).
  The per-node version refs stay for the pull consumers (move suggestions,
  wait-for-analysis, the timeline visit vector); this is additive.
- **`enriched-accumulator.ts`** (new, `[B3]`, pure) — persistent accumulators
  (state metrics by path index; per-`mIdx` delta contributor maps for exact
  last-path-order; per-node contributed-`mIdx` sets to diff adaptive window
  shifts). `rebuild` (full) / `patchNode` (O(1), returns whether on-path) /
  `snapshot`. No Vue, no ledger, no effects.
- **`tests/unit/composables/enriched-accumulator.test.ts`** — the equivalence
  invariant (`patchNode`-sequence ≡ `rebuild`) across overlaps, window shifts,
  lazy metric add, purge, and an interleaved multi-packet stream. 9 cases.
- **`useEnrichedData.ts`** — now a `shallowRef` driven by a structural `watch`
  (path / config hash / palette seed names → full rebuild) + the ledger
  changed-key signal (→ patch only changed on-path nodes, republish once per
  batch). Returns `Ref` (was `ComputedRef`); `useMistakeFinder` relaxed to
  accept `Ref`.
- **Layering fix** — the delta-series **colour** moved out of the data
  projection into `MergedDeltaPanel`'s `mergedSeries` (presentation belongs in
  the chart). This also removes `themeColor` (browser-only) from the eagerly-
  built projection, which is what let the `useAnalysisProjection` integration
  tests pass.

## Verification

Build green. Full suite: 753 passed, 9 accumulator-equivalence cases green; the
only 2 failures (`useAutoSaveAnalyses` fake-timer cases) are **pre-existing on
the clean base** (confirmed by stash) and unrelated to this arc.

## Pending

- The **stability-panel computed** (`useStabilityMetrics`) has the same
  O(N)-per-frame shape, reading `stabilityTrajectoryStore` (which carries the
  identical per-key version refs + coalesced flush). The same treatment applies
  and is the next step.
- Re-capture combined-stress to size the reactive-cost drop (expect the `get`/
  `track` share to fall sharply; the native pipeline floor is unaffected).

License: Public Domain (The Unlicense).
