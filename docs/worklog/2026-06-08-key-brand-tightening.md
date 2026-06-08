# Worklog — key/id brand tightening across the SPA (audit follow-up) (2026-06-08)

## Trigger

After the ledger/trajectory provenance-stratification arc (#361/#362), an
audit (three fan-out Explore sweeps + maintainer review) for *other* untyped /
mistyped / wrong-dependency-set keys across `frontend/src`. The dangerous
class (a cache under-keyed relative to its value's dependencies — the ledger
bug) turned up **no new instance** (the one suspect, `useCardThumbnail`'s
cache, renders a theme-independent SVG, so keying by `CardId` alone is
sound). What remained was a set of **brand-hygiene gaps**: bare `string` /
`number` keys where the type system could enforce key correctness but didn't.
The maintainer asked to fix all of them properly (branded types with
single-construction-site factories, no unjustified casts, every consumer
threaded), not piecemeal.

## The tightenings

Three thread **existing** brands; four introduce **new** ones (all
`Brand<string,…>`, declared in `src/types.ts`):

- **`useTreeExpansion` → `NodeId`.** The game-tree expansion set / `isExpanded`
  / `toggle` / `expandMany` were bare `string`; they hold tree NodeIds. This
  surfaced a latent `'' | NodeId` sentinel reaching `toggle` in `TreeWidget`
  (the toggle renders only under `v-if="item.isBranching"`, where the value is
  always a real NodeId — documented at the type-decl site; cast matched to the
  sibling `onToggleEnter`).
- **`useCardThumbnail` cache → `CardId`** (was `Map<number,…>`); the
  `card-tree-echarts` caller drops its `as unknown as number` brand-strip.
- **analysis-ledger internal `getOrCreateVersion` / `bump` → `RawKey |
  EnrichedKey`** (a `LedgerKey` alias) — the public read/record API stays
  narrowly branded; only the shared internal helpers widen to the union.
- **`QueryId`** (new) — the SPA-minted engine-query correlation id (the wire
  `id` the proxy echoes back). Sole factory `asQueryId` in
  `services/query-id.ts`; threads through analysis-service's four bookkeeping
  maps + public `analyze*` return types + `stopQuery`, the queue telemetry
  store, `usePlayFromPosition`, and the perf harness. The wire
  `KataGoAnalysisQuery.id` stays `string` (serialized form); the response `id`
  is re-branded at the correlation boundary (the one justified ACL cast,
  centralized).
- **`ExtractorId` + `MetricId`** (new, symmetric pair) — the stability
  extractor/metric vocabularies (open-ended `STABILITY_EXTRACTORS` /
  `STABILITY_METRICS` maps, so a `Brand` not a closed union). Branded *both* —
  branding one of a symmetric pair would itself be haphazard. `ExtractorId` is
  a component of the trajectory composite key. Authoritative construction at
  the map literals (one array cast each); `DEFAULT_*_ID` exports feed the panel
  selectors (v-model typechecked clean with branded `<option>` values).
- **`CardTreeExpandKey`** (new) — the card-tree's discriminated expand key
  (`String(cardId)` | `bucket:<cardId>`). Factories `cardExpandKeyFor` /
  `bucketIdFor`, discriminator `isBucketKey`; threaded through the projection,
  the ECharts payload, `CardTreeWidget`, `useCardTreeData`, the two store
  mutators, and the persisted `CardTreeNavState.manuallyExpanded`. A bonus:
  `clearManualExpandForTree` now builds its key set via the factories instead
  of re-spelling the two shapes inline (kills a latent shape-drift).

## Not done (deliberate)

`modelKey` in `useQueryTelemetry`'s `perfByModel` and the `model: string | null`
SELECTOR label remain bare — no `Model` brand exists and one wasn't in scope.
The audit's delimiter-injection flags were false alarms (hash keys are hex,
board-coord keys are integers, extractor ids are a fixed vocabulary); the one
real soft spot (the trajectory store's `|`-split assuming `|`-free NodeIds) is
already documented in `IDENTIFIERS.md`.

## Verification

- `vue-tsc -b && vite build` clean; `eslint .` clean; `npm run test:run`
  **817 passed**, 3 skipped (no test changes — these are type-level changes,
  compile-checked by `vue-tsc`; the existing suite exercising these paths
  confirms no runtime regression).
- No perf-path behaviour change (pure type tightening; the brands erase at
  runtime), so no perf battery run.
- Docs: `IDENTIFIERS.md` gains rows for `QueryId` / `ExtractorId` / `MetricId`
  / `CardTreeExpandKey`; `FILES.md` gains `services/query-id.ts` and corrects
  the now-stale `(configHash, …)` descriptions on the ledger + trajectory
  entries (left over from #361/#362). Doc-graph regenerated.

License: Public Domain (The Unlicense).
