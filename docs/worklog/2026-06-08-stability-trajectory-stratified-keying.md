# Worklog — stability-trajectory store: raw-key stratification (twin-bug follow-up) (2026-06-08)

## Trigger

The ledger-stratification PR (#361) fixed board overlays blanking on a
palette swap and flagged, in-code, that
`stability-trajectory-store.ts` had the **same latent bug**: it keys
raw-derived values by the full composite (enriched) hash, so a palette-only
swap strands a node's stability trajectory the same way the ledger used to
strand the overlays. This is that deferred fix.

## Root cause — raw-derived data keyed by the palette-bearing hash

Every extractor in `STABILITY_EXTRACTORS` reads **only raw packet fields**
(`rootInfo.scoreLead`/`winrate`, `moveInfos`, `moveInfos[i].prior`) — verified
across all six (`scoreLead_sign`, `winrate_quintile`,
`search_agrees_with_policy`, `top1_move`, `top3_set`, `top2_margin_quintile`).
So a trajectory is palette-independent. But `analysis-service.ts` fed
`stabilityTrajectoryStore.record(queryInfo.enrichedKey, …)` and the stability
composables read `getTrajectory(activeConfigHash.value, …)` (== enriched key),
so a palette swap re-minted the key and the byte-identical trajectory became
unreachable. Identical shape to the ledger raw-store bug.

## The fix — key by `rawKey`, retire `activeConfigHash`

- `stability-trajectory-store.ts`: `record` / `getTrajectory` / `keyOf` now
  take a branded `RawKey` (was a bare `string`); header + `type Key` comment
  updated; the in-code KNOWN-DEFERRAL note removed (resolved).
- `analysis-service.ts`: the trajectory record at the boundary now passes
  `queryInfo.rawKey` (was `enrichedKey`).
- `useStabilityMetrics.ts` / `useStabilityCrossCorrelations.ts`: read
  `activeAnalysisKeys.value.rawKey` (was `activeConfigHash.value`);
  `computeSeries`'s `hash` param is now `rawKey: RawKey`.
- `analysis-config.ts`: **`activeConfigHash` removed.** It was a deprecated
  alias (== enriched key) retained in #361 solely for these stability
  consumers; they were its last users, so it is now dead and deleted (its
  doc references in `analysis-config.ts` and `useAppBootstrap.ts` repointed to
  `activeAnalysisKeys`).

Because `RawKey` is branded, the migration is compiler-checked: a stray
`getTrajectory(enrichedKey, …)` would not typecheck.

## Verification

- `vue-tsc -b && vite build` clean; `eslint .` clean.
- `npm run test:run`: **817 passed** (+2), 3 skipped. New
  `stability-trajectory-stratified.test.ts` proves the regression (trajectory
  reachable under the unchanged raw key after a palette change; not reachable
  across a model/overrides boundary).
- **Perf battery (`full-stress`, before/after):** null result, as expected for
  a pure key swap — render ÷ patch ≈ 1.00 preserved (no render-coupling
  regression, ADR-0010); the render-op delta is within run-to-run variance.
- No FEATURES.md change (bug fix). No new `src/` file (no FILES.md change).
  IDENTIFIERS.md already lists `RawKey`/`EnrichedKey` (from #361); no new id.

## Note

This closes the provenance-stratification arc: both per-(key,node) caches on
the analysis path (the ledger and the trajectory store) now key their
raw-derived data by `rawKey` and survive a palette swap by construction.

License: Public Domain (The Unlicense).
