# Worklog — provenance-stratified analysis ledger (typeful raw/enrichment split) (2026-06-08)

## Trigger

The maintainer reported board overlays (move suggestions, ownership) going
**blank after a review session** whose card palette differed from the SPA's
active palette. Root suspicion (correct): the analysis ledger keyed everything
by one composite hash, so a palette change made palette-*independent* raw data
unreachable.

Preceded by an Opus design-space consult recorded verbatim at
`docs/notes/consult/opus-consult-2026-06-08-ledger-keying-typeful-defense.md`,
and a Plan-mode plan (`indexed-questing-volcano`).

## Root cause — one composite key over heterogeneous-provenance data

`analysis-ledger.ts` stored `KataAnalysisResponse` keyed by
`hashConfig(compileAnalysisDescriptor())` over all three descriptor legs
`{analysis_config (palette), overrideSettings, model}`. But the stored value
splits by provenance: the raw KataGo fields (`moveInfos`, `rootInfo`,
`ownership`, `policy`, `pv`) depend only on **model + overrides**; only
`extra.*` enrichment depends on the **palette**. Keying both by the full
composite *over-keyed* the raw data — a palette swap minted a new key and the
raw overlays (which read by the active key) missed, even though the bytes were
identical. `getRaw` taking a bare `string` and returning the whole packet let
the type system permit it.

## The change — four moves (consult's c→d→a→b)

- **(c) Structured key → two derived keys.** `deriveAnalysisKeys()`
  (`analysis-config.ts`, sole brand-mint site) yields `{rawKey, enrichedKey}`.
  `enrichedKey` is **byte-identical to the legacy hash** (model-last
  serialization preserved) — load-bearing for back-compat and persistence;
  `rawKey = hash({overrideSettings, model})` drops the palette leg.
  `activeConfigHash` retained as a deprecated alias (== enrichedKey) for the
  stability/trajectory store.
- **(d) Split the value type.** `RawAnalysis` (no `extra`) and
  `Enrichment` (= `KataExtra`) in the wire SSOT
  (`KataAnalysisResponse extends RawAnalysis`); the single record boundary
  (`analysis-service.ts` `onAnalysisUpdate`) parses the normalized packet into
  both halves. winrate-framing already flips only raw scalars, never `extra`,
  so the split is clean.
- **(a) Stratified stores.** A raw store keyed by `RawKey`, an enrichment
  store keyed by `EnrichedKey`, sharing one `nodeVersions` map and one
  `onLedgerFlush` channel (the two key spaces are disjoint strings, so a
  `${key}:${nodeId}` notification disambiguates without tagging). `getRaw` /
  `getEnrichment` / `getCombined`; `mergeRawAnalysis` keeps the visit-gate,
  `mergeEnrichment` is additive last-writer-wins (the enrichment store can't
  see `rootInfo.visits`, and re-coupling to thread it would defeat the split).
  Both purges clear both stores.
- **(b) Branded keys.** `RawKey` / `EnrichedKey` (`Brand<string,…>` in
  `types.ts`) make `getRaw(enrichedKey, …)` a `vue-tsc` error — the wrong-key
  read is unrepresentable (ADR-0002's strongest channel). `IDENTIFIERS.md`
  carries a new "Derived content hashes" subsection.

The fix falls out of the pull surface: a palette swap re-mints `enrichedKey`
but not `rawKey`, so raw consumers' version refs don't bump and they keep
reading their bucket.

### Consumers

Raw-only consumers (`use-move-suggestions`, `BoardWidget` ownership,
`ToolbarEngineMetrics`, `BoardTab`/`useAnalysisTimeline` visit vectors,
`wait-for-analysis`) → `rawKey`. Enrichment-only (`useTriangularHeatmap`,
`useReviewSession` per-move delta) → `getEnrichment(enrichedKey)`. The MIXED
consumer `useEnrichedData` holds both keys and reads via `getCombined`, so the
incremental accumulator and its byte-equality test are untouched. The two
stability composables read a *separate* trajectory store, not the ledger — no
migration; that store has the same latent palette-swap bug, flagged in-code as
an explicit deferral (`stability-trajectory-store.ts`).

### Persistence (frontend-only, no backend dispatch)

The two-store split could not ride the domain bundle's flat
`{configHash, nodeId, packet}` record without rippling through every v2
encoder scheme (the lossy quantizer dereferences `packet.ownership`), and the
wire `schema_version` is a backend-gated literal `1`. Resolution: keep the
record shape, encode the store+key in a self-describing `configHash` **prefix**
(`r:<rawKey>` / `e:<enrichedKey>`), persist the two stores as independent
records. Zero encoder/wire change. **Legacy v1 bundles** (bare composite hash):
enrichment restores under the composite (== enriched) key; the raw half is
dropped (its raw key is underivable from a one-way hash) and re-fetches live,
logged loudly — recording legacy raw under the composite key would reintroduce
the bug.

## Claw-back experiment — measured and rejected

The first-packet *double-bump* (raw + enrichment each bump synchronously on a
node's no-data→has-data transition) was the one perf cost flagged in the plan.
Tried routing enrichment first-packets through the rAF coalescer to claw it
back. **Measured worse** (full-stress battery, paired): clawed render ops ≥
stratified in every comparison (interleaved back-to-back +1.6%, triplet
medians +6%, ranges non-overlapping). Mechanism: Vue's scheduler already
coalesces the synchronous raw+enrichment double-bump into one render per tick;
deferring enrichment to a separate rAF frame *de-batches* it into two. Reverted;
the finding is recorded in the `bump()` comment so it isn't re-tried.

## Verification

- `vue-tsc -b && vite build` clean; `eslint .` clean.
- `npm run test:run`: **815 passed** (+7 new), 3 skipped. New
  `analysis-ledger-stratified.test.ts` proves the regression (raw survives a
  palette swap: `rawKey` stable, `enrichedKey` re-mints), the per-store merge
  semantics, the persistence round-trip, and the legacy-v1 replay. Existing
  ledger-touching tests (`useReviewSession`, `autonomous-srs`,
  `BoardTab.render-count`, e2e harness) migrated to the split API.
- **Perf regression battery (`full-stress`, before/after ×2):** no
  render-coupling regression — render ÷ patch ≈ 1.00 in all runs (ADR-0010);
  heap/DOM/listeners flat. Traces under `~/w/vdc/chromium_profiles/`
  (`…03-16-37…`, `…03-17-10…`, `…03-18-29…`, `…03-18-40…`), repro
  `node frontend/scripts/perf-capture.mjs full-stress --model b10c128`.
- No FEATURES.md change (bug fix, no user-facing capability change). No new
  `src/` file (no FILES.md change). New branded ids → IDENTIFIERS.md updated.

License: Public Domain (The Unlicense).
