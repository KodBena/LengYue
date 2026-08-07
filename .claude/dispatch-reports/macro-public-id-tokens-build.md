# Build report — restoring the Cards-tab `${gameSourceId}` macro (macro-public-id-tokens)

Commission (ledger rows 498/500): restore the Cards-tab `${gameSourceId}`
context-id macro, broken by the Browse-leak fix's removal of `ForestStat`'s
raw `root_card_id`/`game_source_id` PKs. ADOPTED DESIGN: widen the
`/forests/query` token vocabulary on the BACKEND to accept per-user id
tokens — the backend owns per-user resolution; the macro expander stays
synchronous; the SPA never touches global PKs. REJECTED (per the
commission): an async resolver in the SPA's macro expander.

Built in an isolated worktree
(`/home/bork/w/omega/.claude/worktrees/macro-public-id-tokens`, branch
`bork/fix/macro-public-id-tokens`), never touching the main checkout or its
ports. Two commits:

- `3b88c416` — backend
- `e672675c` — frontend

The branch HEAD after both commits is **`e672675c`**.

## Context read before building

`backend/CLAUDE.md`, `backend/tests/CLAUDE.md`, `frontend/CLAUDE.md`, the
Browse-leak-fix build and review reports
(`.claude/dispatch-reports/browse-leak-fix-build.md`,
`browse-leak-fix-review.md` — the "Disclosed narrowing" section documents
the exact regression site: `ForestDirectory.vue::updateContextIds`'s
`resolveGameSource` callback always returning `[]`), the macro expander
(`frontend/src/utils/context-id-macros.ts`) and its call site
(`ForestDirectory.vue`), `/forests/query`'s route
(`backend/api/routes/forests.py`), DSL (`backend/domain/pipeline_dsl.py`),
executor (`backend/domain/pipeline.py`), and repository/Port
(`backend/repositories/lineage_repository.py`, `ports.py`), and
`docs/notes/tenancy.md` end to end.

## Grammar diff

`ForestQuery` (backend/domain/pipeline_dsl.py):

| Field | Before | After |
|---|---|---|
| `context_ids` | `List[int]`, `min_length=1` | `List[int]`, `default_factory=list` (may be empty) |
| `game_source_ordinals` | — (new) | `List[int]`, `default_factory=list` |

New `model_validator` requirement: at least one of `context_ids` /
`game_source_ordinals` must be non-empty (replaces the old
`context_ids`-only `min_length=1` constraint; `test_forests_query_empty_context_ids_is_422`
and its unit-test sibling still pass unmodified — a request with only
`context_ids=[]` and no ordinals still 422s).

`context_ids` keeps its existing meaning (raw internal card ids) —
`CardId` is a named per-user-id-enumeration allowlist exception
(`frontend/IDENTIFIERS.md`), the addressing value every already-fetched,
tenant-scoped card round-trips through, so it was never part of the leak
Browse-leak-fix closed. Only `game_source_ordinals` is new: each entry is
a `game_source.display_ordinal` token, resolved server-side by
`PipelineExecutor.run` (via the new `LineageRepositoryPort
.resolve_game_source_root_card_ids` method) to that game_source's root
card id(s), which are unioned into the same context pool `context_ids`
seeds. An ordinal that doesn't resolve (unknown, or belongs to a
different tenant) raises `GameSourceNotFoundError` → 404 at the route.

## Tenancy argument for the resolution query

`LineageRepository.resolve_game_source_root_card_ids` (backend/repositories/lineage_repository.py):

1. `game_source.id` for every requested ordinal, `WHERE display_ordinal IN
   (:ordinals) AND user_id = :user_id` — the ordinal and tenant predicates
   are fused into one WHERE clause, so "this ordinal exists but belongs to
   someone else" and "this ordinal doesn't exist at all" produce the exact
   same empty row for a given `(ordinal, user_id)` pair. This is the same
   404-not-403 predicate-fusion pattern `docs/notes/tenancy.md` documents
   for every other tenant-scoped lookup in this codebase — no split
   existence-then-ownership check, no distinguishable status code.
2. Any ordinal missing from that result set raises `GameSourceNotFoundError`
   immediately (checked in input order) — fails loudly rather than
   silently resolving a partial set.
3. `card_source.card_id` for every row whose `game_source_id` is one of
   the resolved ids, joined to `card` and filtered on `card.user_id =
   :user_id` — belt-and-braces, mirroring the "filter at every step, even
   a non-recursive one" convention `fetch_forest_members` and the CTE
   walkers already use, even though this particular join isn't
   recursive. (A game_source can anchor more than one root card — e.g.
   multiple root moves under one imported game — so this returns every
   such root, not assumed-singular.)

Column projection: both queries select only the columns the method needs
(`game_source.id`/`display_ordinal`, `card_source.card_id`) — no wire
response is involved here (this is server-internal resolution, not a
response schema), but the same discipline applies to keep the queries
minimal.

The route (`api/routes/forests.py`) catches the `NotFoundError` axis
(parent of `GameSourceNotFoundError`) → 404, alongside the pre-existing
`InvalidInputError` → 422 mapping.

## OpenAPI diff

Regenerated `frontend/src/types/backend.ts` via `npm run gen:api` against
the worktree's own throwaway backend (port 19764, scratch SQLite file at
`/tmp/macro-gen-api-scratch.db`, killed and removed after use — never
`cards.db`/port 8764). WITNESSED — `ForestQuery`'s schema before → after:

| Field | Before | After |
|---|---|---|
| `context_ids` | `number[]`, required | `number[]`, optional (default `[]`) |
| `game_source_ordinals` | — | `number[]`, optional (default `[]`) — **new** |

No other schema changed. `ForestQuery` is request-body-only, so it is
explicitly excluded from `test_global_sequence_schema_walk.py`'s
response-reachable-schema walk (confirmed by reading that test's own
`_response_reachable_schema_names` docstring) — no allowlist change
needed or made.

## Frontend rewire

`context-id-macros.ts`'s `expandContextIdMacros` redesigned: no longer
resolves a `${N}` token to a raw root card id (that source doesn't exist
client-side anymore). New contract:

```ts
function expandContextIdMacros(
  input: string,
  isKnownGameSourceOrdinal: (ordinal: number) => boolean,
): {
  cardIds: readonly number[];
  gameSourceOrdinals: readonly number[];
  unknownGameSourceOrdinalTokens: readonly number[];
}
```

Literal ids outside `${...}` go to `cardIds`; recognized ordinal tokens
inside `${...}` go to `gameSourceOrdinals`; unrecognized ones are reported
separately (still the ADR-0002 UI-input-validation exception — dropped
from the request, not fatal — but visibly, not silently).

Threaded through: `store/schema.ts` / `defaults.ts` (new persisted field
`cardsContextGameSourceOrdinals: number[]`, sibling of `cardsContextIds`),
`store/migrations.ts` (65 → 66 backfills it; 63 → 64 rolled into
`archived-migrations.ts` per the rolling-archive discipline, keeping
exactly two active), `services/backend-service.ts::queryForest` (new
`gameSourceOrdinals` param → `game_source_ordinals` wire field),
`composables/cards/useCardTreeData.ts::runPipeline` (same param threaded
through), `components/tree/ForestDirectory.vue::updateContextIds` (rewired
against the new expander contract; the always-empty-macro degradation and
its "always warn if known" console message are replaced — the macro
now actually works, and the warning fires only for genuinely unrecognized
tokens). The "→ Expands to" hint (now "→ Sends:") shows what will be SENT
(literal ids plus `game N` tags) since final resolution is server-side and
can no longer be shown client-side before submit.

## Test list

Backend, failure-paths-first per ADR-0021 / `backend/tests/CLAUDE.md`:

- `tests/unit/domain/test_pipeline_dsl.py`: `test_forest_query_game_source_ordinals_alone_satisfies_nonempty`,
  `test_forest_query_both_context_sources_empty_fails`,
  `test_forest_query_game_source_ordinals_defaults_to_empty`.
- `tests/integration/test_pipeline_e2e.py` (real `LineageRepository`
  against `seeded_session`): `test_unknown_game_source_ordinal_raises_game_source_not_found`
  (RED case), `test_cross_tenant_game_source_ordinal_raises_game_source_not_found`
  (RED case — user B querying user A's own ordinal), then
  `test_game_source_ordinal_resolves_to_root_and_descendants` (happy path
  — ordinal-only query matches the equivalent literal-`context_ids` query)
  and `test_game_source_ordinal_unions_with_literal_context_ids`
  (composition + dedup).
- `tests/integration/routes/test_forests_routes.py` (full HTTP + tenancy
  matrix via `seed_user`): `test_forests_query_unknown_game_source_ordinal_is_404`,
  `test_forests_query_cross_tenant_game_source_ordinal_is_404` (Bob's
  ordinal queried with Alice's bearer), then
  `test_forests_query_game_source_ordinal_resolves_root_and_descendants`
  (happy path) and `test_forests_query_context_ids_and_game_source_ordinals_both_empty_is_422`.
- `tests/fakes/lineage_repository.py`: `FakeLineageRepository.resolve_game_source_root_card_ids`
  extended to satisfy the widened Port (mirrors the production adapter's
  two-step resolution via a new `(user_id, ordinal) -> game_source_id`
  reverse index seeded alongside the existing `game_source_ordinal` map).

Frontend:

- `tests/unit/utils/context-id-macros.test.ts` (new, 8 cases): the
  cardIds/gameSourceOrdinals split, the round-trip shape that feeds
  `ForestQuery` directly, unknown-token reporting, dedup across repeated
  macros, malformed-token filtering (parity with the pre-existing literal
  parser), unclosed-macro handling, empty-macro-body handling, and the
  plain-non-macro-input path.

## Per-claim evidentiary status

| Claim | Status |
|---|---|
| `ForestQuery` widened with `game_source_ordinals`, `context_ids` no longer solely required | WITNESSED — unit tests + OpenAPI diff above |
| Resolution query fuses `(display_ordinal, user_id)`, 404-not-403 | WITNESSED — `test_forests_query_cross_tenant_game_source_ordinal_is_404` and `test_forests_query_unknown_game_source_ordinal_is_404`, both real HTTP round trips against a seeded two-tenant DB |
| Unknown ordinal fails loudly (not a partial/silent result) | WITNESSED — executor- and route-tier RED cases, `GameSourceNotFoundError` raised deterministically on the first unresolved ordinal |
| Backend suite green | WITNESSED — `./venv/bin/python -m pytest -q` → `719 passed, 2 skipped, 1 xfailed` (worktree venv, never main checkout's) |
| `ForestQuery` excluded from the response-schema leak walk (request-body-only) | WITNESSED — read `test_global_sequence_schema_walk.py::_response_reachable_schema_names`'s own docstring, which names `ForestQuery` explicitly as an example of a request-only exclusion |
| Frontend macro expander redesigned, no raw-PK resolution client-side | WITNESSED — `context-id-macros.ts` diff; grepped the frontend tree post-change for `resolveGameSource`/`warnedMacroTokens` (the old names) — zero hits |
| Store migration 65→66 correctness | UNEXERCISED as a dedicated round-trip unit test — no synthetic-v65-blob test was added (matches the disclosed gap the browse-leak-fix build report left for its own 64→65 migration: `migrations.ts`'s own composition-corpus test, `tests/integration/migration-store-roundtrip.test.ts`, still passes unmodified, but that's not a targeted pin of this specific migration body). Flagged as a follow-on, same posture as the prior build. |
| `npm run gen:api` regenerated against the worktree's own throwaway backend, port 19764, own scratch SQLite, killed after | WITNESSED — server pid 797384 started and killed within this session; scratch DB file removed |
| Frontend build / eslint / test:run green | WITNESSED — build clean (pre-existing >500kB chunk-size advisory only, unrelated), `npx eslint .` exit 0 with no output, `npm run test:run` → `1364 passed, 4 skipped` |
| No `waitForTimeout`/wall-clock sleeps introduced | WITNESSED — no chromium/playwright was used for this build (backend + Vitest gates were sufficient to exercise the change; no live-app visual behavior changed enough to warrant it), and grepping the new test files for `sleep(`/`waitForTimeout` finds nothing |
| No live ports (4173/5173/5174/8764) touched | WITNESSED — the only server started was the worktree's own on port 19764, killed before this report was written |

## Gate outputs

Backend (`./venv/bin/python -m pytest`, worktree venv):
```
719 passed, 2 skipped, 1 xfailed, 4 warnings
```

Frontend:
```
npm run build   -> clean (vue-tsc -b && vite build; only the pre-existing
                    >500kB chunk-size advisory, unrelated)
npx eslint .     -> clean, exit 0
npm run test:run -> 1364 passed | 4 skipped
```

## Notes on governance during the build

This worktree inherited the main checkout's `.claude/settings.json`
PreToolUse ledger gate (`hooks/pretooluse_change_gate.py`), which
requires a `./autoharn led -f <basename> decision "..."` row before each
source-file edit. Every edited file in both commits was preceded by such
a row (run from the main checkout, `/home/bork/w/omega`, since the
`autoharn` dispatcher script itself is untracked and doesn't exist inside
a fresh worktree). This is disclosed for completeness; it did not change
the substance of the design or implementation, only the mechanics of
getting each edit past the gate.

## Summary

Branch: `bork/fix/macro-public-id-tokens`. Head: `e672675c`. Two commits
(`3b88c416` backend, `e672675c` frontend). Backend suite 719/2/1 green;
frontend build/eslint/test:run all green (1364/4). The Cards-tab
`${gameSourceId}` macro works again: `${5}` now sends
`game_source_ordinals: [5]` to `/forests/query`, which resolves it
server-side, within the caller's own tenancy, to that game's root card
id(s) — the SPA never touches a raw global PK to make this happen, closing
the disclosed regression from ledger row 456 without reopening the leak
Browse-leak-fix closed.
