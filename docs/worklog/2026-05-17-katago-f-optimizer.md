# KataGo F-optimizer — per-(model, cadence) cliff search and SPA integration

- **Status:** Shipped. The SPA can now empirically discover the
  lowest reliable `firstReportDuringSearchAfter` for the current
  `(SELECTOR-model, reportDuringSearchEvery)` against the live
  engine, persist it to a per-machine localStorage cache, and route
  it onto the wire automatically. UI lives in the Settings tab.
- **Genre:** Feature arc. Builds on the diagnosis recorded at
  `2026-05-15-katago-first-report-cliff-diagnosis.md` and supersedes
  the hardcoded mitigation in
  `2026-05-15-katago-first-report-floor-mitigation.md` for any
  `(model, cadence)` the user has run the optimizer against.
- **Date:** 2026-05-17.

## Context

The 2026-05-15 diagnosis arc characterised the upstream cliff at
F ≈ 25 ms on a single model and shipped a defensive 35 ms wire-side
floor as the universal mitigation. Subsequent data-gathering across
four models (`b10c128`, `b18c384nbt`, `b28c512nbt`, `fdx6d`) and
seventeen cadences showed the original "absolute ~25 ms cliff"
finding was correct for the smallest model but understated the
phenomenon for everything else — the cliff scales with model
latency. For `fdx6d` at C=0.250s, the cliff sits around F=174 ms,
not 25 ms; setting F below that (including at the 35 ms floor)
exposes the user to the full cadence-tick penalty.

A model-specific mitigation is therefore needed. The hardcoded floor
can stay as a fallback for unknown configurations, but for any
(model, cadence) the user is actually using, an empirically-found F
beats a defensive constant.

## Methodology

The optimizer is a bisection on a binary classifier. `dt(F)` is a
step function: below the cliff, `dt ≈ cadence + F + ~17 ms` (pinned
regime — the bug shape); above the cliff, `dt ≈ F + ~17 ms` (F
honoured directly). The argmin is the smallest F above the cliff.

Classifier: for one F value, take samples one at a time. The instant
any sample comes back tardy (where tardy is defined relative to the
pinned-reference dt at F=1 ms), blacklist this F as pinned. F is
honoured only if `min_samples` non-tardy samples land (scan phase
permits one tardy as strip-flip tolerance; bisection phase is
strict). This handles the strip — even a 10 %-tardy F gets caught
after ~7 samples and rejected.

Boundary handling: a geometric scan from F=1 ms upward locates the
first honoured F; bisection then narrows between the last-pinned
predecessor and the first-honoured probe. Strip-flip at F_max no
longer kills the search because the scan finds an honoured F before
reaching the noise-vulnerable upper bound.

Sanity check: the recommended F must materially beat the no-F
control by at least `min_savings_ms` (default 20). For slow models
where multiple cadence-tick alignments produce competing pinning
regimes, the strict-tardy classifier alone can pass an F whose
expected dt is still close to control; the savings filter catches
these and returns null instead.

Reference implementation, validated against a 15 800-trial Python
sweep that covered the four-model zoo: 8/8 (model, cadence) cells
yield F* within ±15 ms of the cliff position from the sweep data;
saving estimates within ±25 ms of independent observation. Python
prototype at `~/katago_bugreport/optimize_f.py`; the SPA port is
a direct translation.

## Shipped surface

- `frontend/src/engine/katago/optimize-f.ts` — pure algorithm.
  `findBestF` and `findBestFWithRetry` consume any
  `OptimizerEngine` implementation. Testable in isolation against
  synthetic engines; thirteen unit tests at
  `tests/unit/engine/katago/optimize-f.test.ts` exercise the
  classifier, the bisection, the boundary cases, and the
  retry-on-null wrapper.

- `frontend/src/engine/katago/optimize-f-live-engine.ts` — the
  production `OptimizerEngine`. Owns its own `KataGoClient` for the
  lifetime of an optimization run so the engine's cache is exclusive
  (every trial begins with `clear_cache`) and cross-talk with the
  main analysis pipeline is structurally impossible. Per-trial
  choreography matches the Python reference reproducer exactly.

- `frontend/src/services/optimize-f-cache.ts` — localStorage-backed
  cache keyed by `${model}|${floor(cadence_ms / 50) * 50}`. Bucket
  width of 50 ms is more than sharp enough above the eval-cost
  regime (where the cliff is roughly cadence-invariant); below that
  regime, finer buckets just produce noisier hits. Cache is
  intentionally per-machine, NOT roamed via SyncService — optimizer
  results depend on GPU, proxy URL, KataGo version, ambient load,
  and other hardware-tied factors no document-sync can faithfully
  carry across devices.

- `frontend/src/composables/useFOptimizer.ts` — the composable
  consumed by UI components. State machine
  (`idle → running → done | aborted | error`), progress log
  (capped at 500 lines), abort, forget. Constructs and disposes a
  fresh `LiveOptimizerEngine` per run.

- `frontend/src/components/FOptimizerPanel.vue` — the user-facing
  panel: current model + cadence + effective F display, optimize
  button, live progress + algorithm log, cached entries table with
  per-row "forget" and global "forget all". Wired into the Settings
  tab via a collapsed `<details>` section.

- `frontend/src/services/analysis-service.ts` — modified.
  Both F-clamp sites (the `analyzeRange` `isRealtime` branch and
  the `analyzeActiveNode` body) now consult
  `effectiveFirstReportS(model, cadence)`. When the cache has an
  entry, its `fS` flows to the wire directly, bypassing the
  35 ms `KATAGO_FIRST_REPORT_FLOOR_S` workaround (which exists for
  unknown configurations only). When no entry exists, the existing
  floor-clamped-slider path is preserved unchanged.

## Wire-side semantics

```
F_wire = min(cadence, cached_F ?? max(35ms_floor, slider_F))
```

- Cache entry present → use cache directly; the empirical
  characterisation makes the defensive floor unnecessary.
- Cache entry absent → fall back to user's slider with the
  35 ms floor still in place (the original mitigation).
- Always: clamp down to cadence so first-report ≤ cadence (the
  semantic invariant — sending a first-report larger than cadence
  would delay first paint past the second regular report).

## Operational notes

- The optimizer takes ~30–90 seconds per (model, cadence) on a live
  engine. On a typical run for a single (model, cadence), the panel
  shows the progress log streaming as the algorithm probes — useful
  for spotting strip-flip events and abnormal latencies during a
  diagnostic session.

- Cache is wiped per-row or globally via the panel's Forget /
  Forget-all buttons. The user does this when:
  - The SELECTOR's upstream pool changes (different GPU, different
    proxy host).
  - The KataGo version changes (the bug shape might change).
  - The system's ambient load profile changes meaningfully (other
    GPU consumers, thermal throttling settings, etc.).

- The non-deterministic strip width observed in the data (~4 ms
  for the cleanly-characterised cases) is comfortably below the
  2 ms safety margin the recommendation adds to `F_high`. A
  recommendation at, e.g., F=184.6 ms means the bisection
  bracketed F_high at 182.6 ms; the strip top is at ~178 ms; the
  cushion is ~5 ms in absolute terms.

## What this does NOT change

- The hardcoded `KATAGO_FIRST_REPORT_FLOOR_S = 0.035` constant in
  `frontend/src/engine/katago/limits.ts` stays. It's the safe
  default for the (model, cadence) cells the optimizer hasn't
  characterised yet. Removal trigger is unchanged: when KataGo
  upstream fixes the cliff and the reproducer at
  `~/katago_bugreport/reproducer.py` no longer shows pinning, drop
  the constant and the corresponding `minFloor` field in the F
  KnobDecl.

- The F slider in the registry editor (`engine.katago.firstReportDuringSearchAfter`)
  is unchanged. It's the source of truth when no cache entry exists
  and remains user-editable for the "I want manual control even with
  a cache entry" workflow — clearing the cache entry returns the
  wire to slider control.

- The cadence slider is unchanged. We discussed an auto-pick-cadence
  policy ("here's a sensible cadence for fdx6d"); deferred. The
  optimizer takes whatever cadence the user is currently at; a 50 ms
  bucket move triggers a recompute opportunity.

## Cross-references

- `docs/worklog/2026-05-15-katago-cadence-knobs.md` — knob
  promotion that started the arc.
- `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`
  — the diagnosis arc that characterised the cliff and produced
  the bug-report package.
- `docs/worklog/2026-05-15-katago-first-report-floor-mitigation.md`
  — the previous-shipped mitigation (35 ms floor) that this work
  supersedes for measured (model, cadence) cells.
- `~/katago_bugreport/` — the staged upstream bug-report package;
  contains the Python reference implementation, the 15 800-trial
  sweep CSV, and the diagnosis README this work builds on.

License: Public Domain (The Unlicense)
