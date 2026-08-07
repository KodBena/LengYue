# Build report — Browse-tab leak fix (last hole in the per-user-id non-leak guarantee)

Commissioned at ledger row 426 (LAZY-mode transcription of the maintainer's
dispatch prompt). Maintainer rulings governing this work: row 423 (clean
architecture over backward compatibility — wire-shape breakage acceptable,
data loss not required), row 424 (a possible clean migration must be used),
row 425 (precedence: design clean first, migrate only insofar as the clean
design admits it — the seams named `/stats/forests` + `/lineage/*` were
expected to need no new schema, since migration `0004_per_user_id_enumeration`
already backfilled `card.public_id`/`display_ordinal` and
`game_source.display_ordinal`; **confirmed true** — this build adds zero new
columns and zero new Alembic revisions).

Built in an isolated worktree
(`/home/bork/w/omega/.claude/worktrees/browse-leak-fix`, branch
`bork/fix/browse-leak-fix`), never touching the main checkout or its ports.
Two commits:

- `056fd1e2` — backend
- `593740ce` — frontend

The branch HEAD after both commits is **`593740ce`**.

## Scope actually closed

The prior per-user-ids build (`.claude/dispatch-reports/per-user-ids-review.md`,
Top Finding) left `ForestTreeNav.vue` painting raw `root_card_id` /
`game_source_id` as literal `#`-ids, sourced from `/stats/forests` and — for
the same field-name pair — `/lineage/resolve-roots` and `/lineage/tree-by-root`.
This build converts exactly those six allowlist rows
(`ForestStat`/`ResolvedRoot`/`TreeByRootResponse` × `root_card_id`/
`game_source_id`) to `card.public_id` / `game_source.display_ordinal`, per the
commission's literal wording.

**Deliberately unchanged** (WITNESSED as out of the named scope, disclosed
below): `TreeNode.id`, `ResolvedRoot.card_ids_in_tree`,
`ResolveRootsResponse.unmatched_card_ids`. These are different field names
from the ones the commission named; they carry raw card ids purely as a
reference/addressing role (the frontend uses them to key already-tenancy-
scoped card data it fetched via `/forests/query`'s `CardWithRecall.id`, itself
a named allowlist exception) — never painted as digits anywhere
(`card-tree-echarts.ts` already renders `displayOrdinal`, not `TreeNode.id`,
since the prior build's Unit 2). Reclassified on the allowlist from
"deferred follow-on" to "named exception," same class as `CardWithRecall.id`.

## Option space — CTE threading vs. response-edge projection (backend/CLAUDE.md ask)

The commission asked to "thread public_id/display_ordinal through the
recursive CTEs (join at the CTE seam or project at the response edge — justify
the option space)." Three call sites, three different answers, each justified
by the site's own shape:

1. **`StatsRepository.fetch_forest_members`** — **CTE seam** (stage 2, the
   plain non-recursive join after the recursive `root_mapping` CTE resolves).
   A second `card` alias (`root_card`) joined once on the resolved
   `root_card_id`, plus reading `game_source.display_ordinal` off the
   already-joined `game_source` table. Rejected: threading the two columns
   through the *recursive* `root_mapping` CTE itself — rejected because that
   CTE runs once per recursion level, so extra columns cost more per row than
   one extra join in the flat stage-2 SELECT that runs once per query.

2. **`LineageRepository.resolve_roots`** — **response edge**. The upward-walk
   CTE (`_root_walk_cte`) is left untouched; after grouping into
   `(root_id, gs_id)` pairs, two small batched `IN`-lookups (one against
   `card`, one against `game_source`) resolve the *distinct* set of roots in
   the result to their `public_id`/`display_ordinal`. Mirrors the existing
   tag-enrichment batch already in `LineageRepository._materialize` (same
   file, same pattern, already reviewed and shipped). Rejected: adding the
   two columns to every level of `_root_walk_cte`'s recursive step — rejected
   because the columns are only needed once per *distinct* root in the final
   grouped result, not once per recursion row; the distinct-root set is
   typically much smaller than the walk's row count for cards several levels
   deep.

3. **`LineageRepository.fetch_tree_by_root`** — the root's **identity
   parameter itself** switches from the raw internal `card.id` to
   `card.public_id`. The existing root-verification SELECT (already a single
   non-recursive query) gains a `card.public_id` filter and a
   `game_source.display_ordinal` join; the internal id it resolves to is then
   fed unchanged into the pre-existing internal-id descent CTE (never exposed
   on the wire). This is the "per-user id IS the handle" instruction taken
   literally: `TreeByRootRequest.root_card_id: int` becomes
   `root_card_public_id: UUID`, so no raw id ever needs to round-trip through
   this endpoint's request either. Rejected: keeping `root_card_id: int` on
   the request and adding a second Port method to translate `public_id → int`
   at the route layer — rejected because it leaves a raw-PK addressing path
   alive for the frontend to hold onto, which is exactly the leak the
   guarantee forbids; the fused lookup+verify query costs nothing extra over
   the two-step version.

## Wire-shape diff (load-bearing, per backend/CLAUDE.md)

Regenerated `frontend/src/types/backend.ts` via `npm run gen:api` against the
worktree's own throwaway backend (port 18764, its own scratch SQLite file,
never `cards.db`/port 8764). WITNESSED — the four changed schemas, before →
after:

| Schema | Before | After |
|---|---|---|
| `ForestStat` | `root_card_id: number`, `game_source_id: number` | `root_card_public_id: string` (uuid), `game_source_display_ordinal: number` |
| `ResolvedRoot` | `root_card_id: number`, `game_source_id: number` | `root_card_public_id: string`, `game_source_display_ordinal: number` |
| `TreeByRootRequest` | `root_card_id: number` | `root_card_public_id: string` |
| `TreeByRootResponse` | `root_card_id: number`, `game_source_id: number` | `root_card_public_id: string`, `game_source_display_ordinal: number` |

`TreeNode.id` and the two array-of-id fields are byte-identical before/after
(unaffected, per the scope decision above).

## Allowlist-gate plant-and-trip proof (WITNESSED)

1. Removed the six `ForestStat`/`ResolvedRoot`/`TreeByRootResponse`
   `root_card_id`/`game_source_id` rows from
   `tests/enforcement/global_sequence_allowlist.py` (they no longer match any
   wire field, since the fields were renamed away, not just relisted).
2. **Plant**: temporarily added `leak_test_id: int` to `schemas/stats.py`'s
   `ForestStat`.
3. **Trip** (red, captured verbatim):
   ```
   FAILED tests/integration/routes/test_global_sequence_schema_walk.py::test_no_unlisted_global_sequence_field_on_the_wire
   AssertionError: Unlisted id-shaped integer field(s) on a response-reachable
   wire schema: ['ForestStat.leak_test_id']. ...
   ```
4. **Revert**: removed the plant; re-ran the same test —
   `tests/integration/routes/test_global_sequence_schema_walk.py ... 3 passed`.
   `git diff schemas/stats.py` confirmed clean of the plant before the
   backend commit.

## Race witness (WITNESSED, ledger row 417 item 2 — was open since the
per-user-ids review)

New `tests/integration/repositories/test_display_counters_concurrency.py`,
four tests:

- `test_broken_increment_harness_sanity_produces_a_duplicate` — a
  deliberately non-atomic read-then-write increment (`_broken_increment`,
  test-file-only, never imported by production code) run under this
  harness's concurrency **does** produce a duplicate — proves the harness can
  catch the defect class before trusting it to certify the real
  implementation clean (ADR-0021 witness-construction discipline).
- `test_concurrent_card_ordinal_mints_are_duplicate_and_gap_free` — the real
  `next_card_display_ordinal`, two independently-connected SQLite engines (two
  real DBAPI connections against a shared temp-file DB, not the in-memory
  `StaticPool`-backed fixture that would hand both sessions the same
  connection), each minting 15 ordinals concurrently for one user. Combined
  result: exactly `{1..30}`.
- `test_concurrent_game_ordinal_mints_are_duplicate_and_gap_free` — same
  property for `next_game_display_ordinal`.
- `test_concurrent_first_mint_lazy_upsert_serializes_without_duplicate` —
  witnesses the module's own disclosed race window (two concurrent *first*
  mints for a brand-new user) directly: two distinct ordinals, `[1, 2]`, no
  duplicate, regardless of which of the two documented recovery paths (PK
  serialization + `IntegrityError` retry, or SQLite's writer lock) fires on a
  given run.

Why file-backed SQLite with two engines rather than the existing
`async_session` fixture: that fixture's `:memory:` engine gets SQLAlchemy's
`StaticPool`, meaning every session shares the *same* DBAPI connection — two
"racing" sessions on it never actually contend, which would make a
red-then-green demonstration meaningless (a broken increment would pass too,
for the wrong reason). Stable across 5 repeated runs (no flakes observed).

## Frontend rewire (WITNESSED)

Types, ACL, and every consumer chain rebranded from `CardId`/`GameSourceId`
(raw PKs) to `CardPublicId`/`GameDisplayOrdinal` (both brands pre-existed from
the prior per-user-ids build): `types/lineage.ts` (`ForestStat`, `RootGroup`,
`CardLineageTree`, `CardTreeOverflowError`), `services/backend-service.ts`
(ACL mappings, `fetchTreeByRoot`'s parameter and request body),
`useForestNavigation.ts` (render-shape types, `rootNodeId`/`gameNodeId`
factories), `ForestTreeNav.vue` (the literal `#`-chip fix),
`useCardTreeData.ts` / `board-card-trees.ts` (the `forestStats` Map's key
type), `useCardTreeProjection.ts` (`RenderTree`), `CardTreeWidget.vue` /
`card-tree-echarts.ts` (the widget's root-identity props and header lookup),
`store/schema.ts` (`NavSelection`, `NavNodeId`).

**Store migration 63 → 64** (new; 61 → 62 rolled into
`archived-migrations.ts` per the rolling-archive discipline to keep exactly
two active) clears any persisted `session.ui.forestNav.selection` — both
`NavSelection` variants changed identity semantics, not just type: a stale
persisted numeric `gameSourceId` would silently select the wrong game under
the new per-user-ordinal numbering without ever failing a type check, so both
variants are cleared, not only the type-incompatible `rootCardId` one.

### Disclosed narrowing (ledger row 456) — the Cards-tab `${N}` macro

`context-id-macros.ts`'s `${gameSourceId}` macro (Cards-tab context-id text
input) resolved synchronously, on every keystroke, against `ForestStat`'s now-
removed raw `root_card_id`/`game_source_id` to expand a game-source token to
its root card ids for `/forests/query`'s unchanged `context_ids: number[]`.
With the raw PKs gone from `ForestStat`, there is no synchronous raw-id source
left; the only backend path that could supply one
(`/lineage/tree-by-root`'s `TreeNode.id`) is an async round trip per token,
which the every-keystroke call site can't absorb without a debounce/async
rearchitecture — out of this commission's named scope (`/stats/forests` +
`/lineage/*` + their direct display consumer, `ForestTreeNav.vue`).

**Decision** (ledger row 456): the macro's token match re-keys to
`gameSourceDisplayOrdinal` (the number the user now actually sees), but its
resolution always yields no matches — a real, user-visible regression to a
power-user feature, disclosed rather than hidden behind a silently-reverted
type or a re-smuggled raw PK. Visible via the input's existing "→ Expands to"
hint (now shows nothing) plus a one-time `console.warn` per distinct
unresolved token. Follow-on options, neither attempted here: widen
`/forests/query` to accept `root_card_public_id` tokens server-side, or make
`updateContextIds` async against `/lineage/tree-by-root` with a debounce.

### Known, disclosed test-hygiene gap (UNEXERCISED, not a correctness defect)

`tests/integration/useForestNavigation.test.ts` and sibling composable-
integration tests still construct `NavSelection`/`ForestStat` literals with
`as CardId`/`as GameSourceId` casts (numeric placeholders) rather than the new
`CardPublicId`/`GameDisplayOrdinal` brands. This is harmless at runtime
(brands are phantom; the tests validate `nav.select()`/`useForestNavigation`
*behavior*, which doesn't depend on the placeholder value's shape) and these
tests are **not** part of the type-gated build (`tests/` is outside both
`tsconfig.app.json` and `tsconfig.node.json`'s `include`, confirmed by
inspection) — `npm run test:run` is green with them unchanged. Not fixed in
this pass for time; flagged here rather than left silently stale.

## Per-claim evidentiary status

| Claim | Status |
|---|---|
| No new backend schema/migration needed (migration 0004 sufficient) | WITNESSED — zero new columns, zero new Alembic revisions in this diff |
| `StatsRepository`/`LineageRepository` rewired, backend suite green | WITNESSED — 708 passed, 2 skipped, 1 xfailed |
| Allowlist gate covers the six fields; plants and trips | WITNESSED — red output captured above, revert confirmed clean |
| Concurrent-insert race witness, no duplicate/gap | WITNESSED — stable over 5 repeated runs |
| Frontend types/ACL/consumers rewired; `npm run gen:api` against own server | WITNESSED — diff table above, own port 18764, pid killed after use |
| Frontend build / eslint / test:run green | WITNESSED — build clean, eslint 0 errors, 1333 passed / 4 skipped |
| Store migration 63→64 correctness (round-trip on a synthetic v63 blob) | UNEXERCISED — no unit test added for this specific migration; the existing `tests/unit/store/migrations.test.ts` composition-corpus test still passed unmodified (didn't need updating — no `forestNav.selection` fixture existed in the corpus to exercise), but the migration itself has no dedicated red/green test per `migrations.ts`'s own authoring recipe step 5. Follow-on. |
| `${N}` Cards-tab macro fully closed for the leak class | UNEXERCISED / disclosed narrowing — see above; the macro's own display surface (the expanded text) was never audited as a *separate* leak site in this pass, only its now-broken resolution path |

## Gate outputs

Backend (`./venv/bin/python -m pytest`, worktree venv, never the main
checkout's runtime venv):
```
708 passed, 2 skipped, 1 xfailed, 4 warnings
```

Frontend:
```
npm run build   -> clean (vue-tsc -b && vite build; only the pre-existing
                    >500kB chunk-size advisory, unrelated)
npx eslint .     -> clean, exit 0
npm run test:run -> 1333 passed | 4 skipped
```

## Ledger disposition

Commission: row 426. Decomposition: work items `browse-leak-backend` (427),
`browse-leak-allowlist-gate` (428), `browse-leak-frontend` (429),
`per-user-ids-concurrency-witness` (430, resuming the item left open since
row 417). All four are **shipped in substance** (commits `056fd1e2` /
`593740ce`) but **could not be closed from this worktree** — `led work close`'s
witness-reachability check requires the commit be an ancestor of the shared
checkout's own HEAD at `/home/bork/w/omega`, the same limitation the prior
per-user-ids build hit. A session with write access to the main checkout
closes all four (`shipped`, `--witness commit:593740ce`) once this branch is
merged.

## Summary

Branch: `bork/fix/browse-leak-fix`. Head: `593740ce`. Two commits
(`056fd1e2` backend, `593740ce` frontend). Backend suite 708/2/1 green;
frontend build/eslint/test:run all green (1333/4). The Browse tab
(`ForestTreeNav.vue`) no longer has a raw global PK to paint on screen; the
schema-walk gate now trips if one reappears on `/stats/forests` or
`/lineage/*`; the display-ordinal counter's atomicity under real concurrent
connections is now witnessed, not just architecturally argued. One disclosed,
real regression: the Cards-tab `${gameSourceId}` macro stops expanding until
a follow-on unit gives it a non-leaking raw-id source (ledger row 456) —
flagged for the commissioner's ruling, same posture as the prior build's own
disclosed narrowings.
