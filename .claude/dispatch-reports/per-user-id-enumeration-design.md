# Design — per-user display enumeration for card and game ids (+ non-leak guarantee)

Proposal only, read-only survey. Commissioner amendment (mid-task) upgraded scope from
display cosmetics to a backend-enforced non-leak guarantee; both are addressed below.

## Survey (WITNESSED-in-source)

- `backend/db/schema.py:246-259` `card` table: PK `id` Integer autoincrement, `user_id` FK.
  `backend/db/schema.py:146-161` `game_source` table: same shape, plus `client_game_id`
  (Uuid, nullable) at `:155` — an existing opaque per-row handle, dedup key
  (`repositories/game_library_repository.py:120-141`).
- Card creation: `repositories/card_repository.py:241-268` `insert_card` (single INSERT,
  `.returning(card.c.id)`, no per-user counter today). Game creation: three insert sites —
  `card_repository.py:293-317` (`insert_game_source`), `card_repository.py:325-360`
  (`get_or_create_game_source_by_client_id`), `game_library_repository.py:169-197`
  (`_import_one`, the GoGoD-import path, dedups on `(user_id, position_id)` at
  `:120-127` before insert).
- Wire exposure of the raw PK, confirmed at every site: `backend/schemas/card.py:122`
  (`CardCreateResponse.card_id: int`), `backend/api/routes/lineage.py:73-74,103-125`
  (`root_card_id`, `game_source_id`, `id`, all `int`), `backend/domain/game_library.py:113,
  137,253,271` (`LibraryGameListItem.id`, `LibraryGame.id`, `game_id`, all `int`), `backend/
  api/routes/cards.py:33` (`GET /cards/{card_id}`, PK in the path).
- Frontend ACL brand-mint sites for the raw PK: `frontend/src/services/backend-service.ts:
  135,141,250,305,311-313,348-349,372` (`raw.id as CardId`, `raw.game_source_id as
  GameSourceId`, etc. — every one re-brands the bare server PK, never anything else).
- `frontend/IDENTIFIERS.md:100-101` (existing branded-id ledger) states plainly: `CardId`
  = "server PK", cardinality "large (100s–1000s in a real deck)"; `GameSourceId` = "server
  PK", "~10s–100s". Contrast row `:89` `BoardId` = "client UUID (RFC4122 v4)" — the
  codebase already has a precedent for a UUID-shaped opaque handle serving exactly the
  "stable reference, not sequential" role client-side; `game_source.client_game_id`
  (`db/schema.py:155`) is the server-side sibling of that same idiom.
- Card-tree display: `frontend/src/components/charts/card-tree-echarts.ts` (per commit
  `fb704f6b`, "fix(frontend): ... show bare card-id labels in card-tree") added
  `label.formatter: () => String(node.cardId)` to the `card` branch of `toEChartsNode` —
  **the literal raw PK is now painted on-canvas**, landed the same day as this commission
  (2026-08-06), so the leak surface just got a new, load-bearing, on-screen consumer.
  `name` stays `` `Card ${cardId}` `` for tooltips/keying (same file).
- Library listing: `frontend/src/components/library/LibraryTable.vue:206` keys rows by
  `.id` (`rowAt(i)?.id === selectedId`) — no numeric label rendered there today (checked;
  no `.id` interpolated into visible text in that file), so the library table itself is
  not currently a *display* leak site, but its selection/query plumbing carries the PK
  end to end via `useLibraryQuery.ts` → the ACL.
- `docs/notes/tenancy.md:27-52` — the 404-not-403 predicate-fusion invariant. This is
  necessary but insufficient for the amendment's guarantee: it stops *cross-tenant
  existence probing via the URL*, but says nothing about a *value inside a response body*
  revealing the position of that value in a *global* sequence (German-tank-problem: a
  user who mints 3 cards and sees ids `50001, 50002, 50003` learns "≥50000 cards exist
  system-wide" even though every read they made was correctly tenancy-filtered).
- `backend/tests/CLAUDE.md`'s four tiers (unit / service-with-fakes / adapter-integration
  / route) per `backend/CLAUDE.md:188-241` — the harness the enforcement surface (decision
  7 below) has to fit into. `backend/CLAUDE.md:116-148` — the Alembic revision recipe
  (`REVISION_MARKERS` append requirement at step 5).
- `frontend/README.md`'s OpenAPI codegen note (`npm run gen:api`, referenced at
  `docs/handoff-current.md:113-117,162-163`) — additive response fields are picked up
  automatically by regenerating `src/types/backend.ts`; no manual step beyond running it.

## Decision 1 — SCOPE

**Recommendation:** two entities get a per-user ordinal: `card` and `game_source`. Survey
found no third user-visible sequential id: `documents` is already keyed `(key, user_id)`
with a string `key`, not exposed as a number (`db/schema.py:336-341`); `tag` is global
(shared vocabulary, not user-owned — `db/schema.py:294-299`, no `user_id` column, correctly
so); `analysis_bundles` is already keyed by `board_id` UUID (`db/schema.py:394-397`), no
leak. `normalized_position` is never surfaced to the wire as an id (checked `schemas/`,
`domain/game_library.py` — position ids don't appear in any response model). So the scope
is exactly the two the maintainer named.

## Decision 2 — STABILITY, uniqueness, concurrency

**Recommendation:** gaps-on-delete (stable forever), **not** dense/renumbered. Renumbering
on delete would move the ordinal under a card/game a user has already referenced in their
own notes, screenshots, spaced-repetition history, or `gradingParameter` JSON blobs
(`db/schema.py:258` — free-form, user-authored, opaque per `docs/handoff-current.md:417-423`)
— exactly the kind of external reference ADR-0001-style immutability discipline protects
against silently invalidating.

Assignment mechanism: **`SELECT COALESCE(MAX(display_ordinal), 0) + 1 FROM card WHERE
user_id = :user_id FOR UPDATE` is the wrong idiom here** — the row set being locked doesn't
exist yet for a first-insert user, so `FOR UPDATE` finds nothing to lock and the race stays
open. Two real options, evaluated against the codebase's actual concurrency posture
(`repositories/game_library_repository.py:95-98` already uses `session.begin_nested()`
SAVEPOINT-per-row for exactly this "isolate one insert's failure" reason):

- **(a) a per-user counter table** (`user_display_counters(user_id PK, next_card_ordinal,
  next_game_ordinal)`), incremented via `UPDATE ... SET next_card_ordinal = next_card_ordinal
  + 1 RETURNING next_card_ordinal` — an atomic read-modify-write the row-locking protects
  even for a brand-new user, because the counter row is created (with value 0) at user
  provisioning time (or lazily upserted on first card, `INSERT ... ON CONFLICT DO UPDATE`
  for Postgres / `INSERT OR IGNORE` + `UPDATE` for SQLite — the codebase already carries
  dialect-aware SQL per `docs/notes/tenancy.md:393-395`).
- **(b) a `UNIQUE(user_id, display_ordinal)` constraint + retry-on-conflict loop** computing
  `MAX+1` optimistically and retrying on `IntegrityError`.

**Recommend (a).** It's one write, not a retry loop; it matches the codebase's existing
preference for explicit, auditable state over implicit derivation (the tenancy note's own
rejection of "soft" mechanisms, `docs/notes/tenancy.md:358-366`); and it composes cleanly
with the SAVEPOINT-per-row pattern the library import path already uses — the counter
increment happens inside the same nested transaction as the row insert, so a failed import
doesn't burn an ordinal. Add the `UNIQUE(user_id, display_ordinal)` index on `card` and
`game_source` regardless, as the defense-in-depth belt-and-braces the tenancy note's whole
posture favors (`docs/notes/tenancy.md:166-198` is the same "two independent enforcement
layers" instinct).

## Decision 3 — MIGRATION

Two additive columns per table (see Decision "Non-leak wire disposition" below for why two,
not one): `display_ordinal INTEGER NOT NULL` and, only where an opaque stable-reference
handle doesn't already exist, `public_id UUID NOT NULL UNIQUE` (see next section — `card`
needs this mint, `game_source` already has `client_game_id` and does not).

Alembic revision shape (`backend/alembic/versions/`, following `0002_sgf_library_columns`'s
precedent for a multi-statement data-carrying revision):

1. `op.add_column('card', sa.Column('display_ordinal', sa.Integer(), nullable=True))` +
   same for `game_source` (nullable first — large-table-safe: no default-computed rewrite
   lock on Postgres, matches the "additive, nullable-then-backfill-then-not-null" idiom
   implied by the `game_source.created_at` marker's own history at `db/alembic_bootstrap.py:69-71`).
2. `op.add_column('card', sa.Column('public_id', ..., nullable=True))` (UUID type, same
   pattern as `game_source.client_game_id` at `db/schema.py:155`).
3. Backfill, **per user, ordered by `(created_at, id)` — `id` as tiebreak, not primary
   sort key**, so two rows inserted in the same second still get a deterministic order
   (`card` has no `created_at`; it has `creation_date` at `db/schema.py:257` — use that;
   `game_source.created_at` at `:156`). Backfill in batches (`window` function
   `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY creation_date, id)` in one UPDATE
   FROM/subquery is dialect-portable across SQLite ≥3.25 and Postgres — both already
   assumed live minimums per `card_repository.py:243-244`'s RETURNING-requires-3.35+ note).
   For `card.public_id`, backfill with a fresh UUID per row (`uuid4()`); no dedup concern
   since it's a mint, not a lookup key.
4. New-user counter seeding: after backfill, `INSERT INTO user_display_counters SELECT
   user_id, MAX(display_ordinal), (SELECT MAX(display_ordinal) FROM game_source WHERE
   game_source.user_id = card.user_id) FROM card GROUP BY user_id` (plus users with only
   game_source rows, plus users with neither — counters start at 0, lazily upserted).
5. `alter_column(..., nullable=False)` for `display_ordinal` and `card.public_id` once
   backfilled.
6. `REVISION_MARKERS` append (`db/alembic_bootstrap.py:69-`) — `("card", "display_ordinal",
   "<this-revision-id>")` — required per `backend/CLAUDE.md:135-141` so a multi-revision
   upgrade stamps correctly.

Large-table note: the maintainer's own GoGoD import is the stated worst case — thousands of
rows, not millions; SQLite/hobby-Postgres scale. No online-migration tooling is warranted;
a straight backfill inside the startup-bootstrap's `alembic upgrade head` is fine (same
posture the bootstrap already takes for every other revision, `db/alembic_bootstrap.py:1-30`).

Test per step 4 of `backend/CLAUDE.md:134`: `alembic upgrade head && downgrade -1 && upgrade
head` — downgrade drops both new columns and the counter table cleanly (additive-only, no
data other than the ordinals themselves is destroyed).

## Decision 4 — WIRE + ACL, and the non-leak guarantee (commissioner amendment)

**The guarantee, stated precisely:** no user-facing wire response value is drawn from a
global (cross-tenant) sequence. Two distinct roles current PK values play, disambiguated
because they need different replacements:

- **Display role** (a number the user reads: card-tree label, library row count) → replace
  with `display_ordinal`. Per-user, starts near 1, non-guessable-as-global-count.
- **Reference role** (a value the frontend round-trips to identify *which* row a later
  request means: `parent_card_id` for tree edges, `root_card_id`/`game_source_id` for
  lineage joins, `card_ids_in_tree`/`unmatched_card_ids` for batch resolution, the `/cards/
  {id}` and `/library/games/{id}` path parameters) → these need a value that (a) uniquely
  identifies a row across the whole table (an ordinal alone is not unique cross-tenant —
  two users both have a "card 3"), and (b) doesn't encode global mint position. A UUID-
  shaped opaque handle is the fit. `game_source` already has one: `client_game_id`
  (`db/schema.py:155`). `card` does not — this design adds `card.public_id` (Decision 3,
  step 2) as its sibling, following the exact precedent `IDENTIFIERS.md:89`'s `BoardId`
  row already documents server-side for `game_source`.

**Disposition of every currently-int wire field surveyed above:**

| field | site | disposition |
|---|---|---|
| `CardCreateResponse.card_id` | `schemas/card.py:122` | → `public_id` (UUID); add `display_ordinal` alongside for immediate display without a round trip |
| `GET /cards/{card_id}` path param | `api/routes/cards.py:33` | **exception, named**: path stays PK for now. Reason: re-keying every route's path param to UUID is a full routing-layer rewrite (all of `api/routes/cards.py`, `lineage.py`, `library.py`), out of this ledger item's unit-of-resumption; tracked as follow-on (see Decision 7). The 404-not-403 fusion (`tenancy.md:27-52`) already prevents this path from leaking *existence*; it leaks nothing about *cardinality* either, because the path param is never displayed or logged to the user — it's consumed only by the fetch call the ACL itself issues. This is a genuine narrowing of the guarantee (addressing ≠ display-or-response-body), stated explicitly rather than silently — flag as an open question for the maintainer in the acceptance-criteria ledger row. |
| `root_card_id`, `game_source_id`, tree node `id` | `api/routes/lineage.py:73-125` | → `public_id`/`client_game_id` for the *reference* use (rebuilding the tree client-side, keying nodes); `display_ordinal` added alongside wherever the frontend currently paints the bare id (card-tree labels) |
| `LibraryGameListItem.id`, `LibraryGame.id`, `game_id` | `domain/game_library.py:113,137,253,271` | → `client_game_id` already covers the reference role for post-rollout rows (`Optional[UUID]`, per `:114,138`); **exception, named**: legacy rows minted before `client_game_id` existed have it `None` (`domain/game_library.py:262-265`, "may be None for legacy rows... frontend handles by falling back to game_id"). Design closes this exception rather than perpetuating it: backfill `client_game_id` for the legacy `None` rows in the same migration (UUID mint has no uniqueness dependency on content, so it's a pure fill), removing the `Optional` and the fallback-to-int path entirely. `display_ordinal` added for the list/table display column. |

**ACL:** additive `display_ordinal: number` (branded `CardDisplayOrdinal`/
`GameDisplayOrdinal` — new brands, per-user-scoped so *not* interchangeable with `CardId`/
`GameSourceId`, same discipline `IDENTIFIERS.md` already applies) and, for `card`, a new
`CardPublicId` (string, UUID-shaped) mirroring the existing `GameSourceId`→`client_game_id`
re-brand pattern at `backend-service.ts:251,312,349`. Snake_case→camelCase at the ACL
boundary, same site, same convention (`backend-service.ts:130-141`). `npm run gen:api`
picks up new additive response fields automatically (`docs/handoff-current.md:113-117`) —
no manual codegen step; the ACL re-brand line is the only hand-written addition, matching
every existing brand-mint site's shape.

**Ordinal-based lookup endpoint:** not needed. Every mutating/reading call the frontend
issues already carries `public_id`/`client_game_id`/the (now-flagged-exception) PK; the
ordinal is read-only display data, never sent back. State this explicitly, per the
brief's ask.

## Decision 5 — DISPLAY SITES and ADR-0019 Rule 3

Switch to `display_ordinal`: `card-tree-echarts.ts`'s `toEChartsNode` `card` branch
(`label.formatter`, the site landed today in `fb704f6b` — now paints `displayOrdinal`
instead of raw `cardId`); `LibraryTable.vue` gains a visible ordinal column (currently none
renders a number at all — this is a net-new, not a swap, since no int is painted there
today); any future "card N of M" or breadcrumb text.

Keep the PK-derived reference (`public_id`/`client_game_id`) as the internal keying value
(`name` field for tooltips can *also* switch to the ordinal now that one exists — `` `Card
${cardId}` `` was only ever a stand-in because no better human label existed;
`card-tree-echarts.test.ts`'s existing regex assertion (`/^\d+$/`) still holds against the
ordinal, so the test's *shape* survives, its *meaning* changes — update the test to assert
against a per-user-ordinal fixture, not the raw PK, so the test doesn't silently keep
pinning the leaked value).

**Deliberately keep the PK visible**: nowhere in the current UI does the PK appear as a
debugging surface (no admin/devtools panel found in the survey) — so there is no site that
needs an exception on the frontend side. The browser console logging convention
(`docs/handoff-current.md:444-451`, "logs aggressively... don't suppress") is a candidate
future exception if a developer wants raw PKs in `SyncService`/`BackendService` console
lines for support debugging; recommend explicitly allowing PK in **console log lines only**
(never response bodies, never rendered DOM), named as an intentional carve-out consistent
with the guarantee's wire-response framing (the amendment scopes the guarantee to "wire
response", not "every byte the client process ever holds" — client already holds the PK
in memory either way once fetched for addressing).

**ADR-0019 Rule 3** ("one home per fact"): the ordinal is not a formatted mirror of the PK
(e.g., not "PK mod N" or a client-side re-index) — it is a *second, independently-stored
fact* ("this is the Nth card this user created"), persisted server-side, with its own
column and its own assignment mechanism. That's the correct posture under Rule 3: a
derived-at-render-time renumbering (e.g., "sort visible cards, use array index as label")
would be the Rule-3 violation, because it silently changes meaning under filtering/sorting
and isn't a stored fact at all — instability wearing the ordinal's clothes.

## Decision 6 — TENANCY interplay

Single-user (`ALLOW_PASSWORDLESS_LOGIN=True`, `local_user` id=1, `docs/notes/tenancy.md:
199-222`): the per-user counter is scoped to `user_id=1` regardless, so a fresh single-user
install still gets `1..N` — the design doesn't special-case single-tenant, it's the same
mechanism degenerating correctly (mirrors the tenancy note's own "dormant but correct"
framing at `:220-222`).

**The GoGoD-import case, confirmed:** the maintainer's own user (say `user_id=1`, who
imported GoGoD — thousands of rows, currently PKs 1..50000-ish per the commission's own
"50000+" figure) keeps their `display_ordinal` values `1..M` (M = however many cards/games
that user owns) — unaffected by the redesign, just relabeled from PK to ordinal, still
their own full count. A **new** user (`user_id=7`, say) mints their first card and sees
`display_ordinal=1`, second card `2`, etc. — never anything reflecting the 50000+ rows
that exist system-wide, because the counter table's `next_card_ordinal` row is per-`user_id`
and starts fresh. This is the exact complaint ("a new user currently will see game ids like
50000+") resolved, plus the amendment's guarantee that the *reason* it's resolved is
structural (no shared sequence surfaces at all) rather than coincidental (e.g., "new users
happen not to look at old ones").

## Decision 7 — ENFORCEMENT SURFACE (commissioner amendment)

Two mechanical guards, sized to the codebase's four-tier test layout
(`backend/CLAUDE.md:188-217`):

1. **Static schema-walk test (new, sits beside the route tier)** — a script/test that
   introspects every FastAPI response model reachable from the OpenAPI schema
   (`app.openapi()`, already computed at startup for the frontend's `gen:api` pull) and
   flags any `int`-typed field whose name matches an id-shaped pattern (`*_id$`, `^id$`)
   UNLESS it appears on an explicit allowlist tuple `(model, field, reason)` living in one
   file (e.g. `tests/global_sequence_allowlist.py`). Today's allowlist, stated explicitly
   per the amendment's "exceptions enumerated, never silent": `CardWithRecall`/route path
   `card_id` param (Decision 4's named exception) — nothing else, once the disposition
   table above ships; the test's job is to make sure nothing *new* gets added to that list
   by accident. Mechanically cheap (one Pydantic model walk), fits the "adapter integration"
   tier's spirit (introspects the actual wire contract, not a Port fake) even though it's
   schema-level rather than a DB round trip — name it as its own small addition to
   `tests/CLAUDE.md`'s four-tier taxonomy rather than force-fitting an existing tier.
2. **Property test (route tier, `tests/integration/routes/`)**: two tenants, tenant A
   imports N objects (N large enough to separate signal from noise, e.g. 50), tenant B
   creates 1 card/game and reads its own list/detail responses; assert no numeric field in
   B's response body is `>= N` or otherwise correlated with A's cardinality (concretely:
   every surfaced int-shaped id field equals B's own `display_ordinal` sequence, which is
   small and independent of A's activity). This is the amendment's literal ask, phrased as
   a runnable assertion rather than a description.

**Honest ceiling:** this pair catches "did a global PK leak into a response field" and "does
one tenant's activity numerically leak into another's response" — both mechanically. It does
**not** catch semantic leaks (e.g., an error message string that says "card 50231 not found"
interpolating the PK into free text) — that class stays **review-only**, flagged in PR review
by grepping for f-string/format interpolation of `.id`/`_id` into user-facing `detail=`
messages (`HTTPException(status_code=404, detail=...)` sites). Name this ceiling in the
enforcement test's own docstring so a future reader doesn't assume the gate is exhaustive.

## Size estimate (re-estimated after the amendment)

Original display-only shape: small (2 columns, 1 migration, ACL passthrough, 2 display
sites) — roughly a half-day unit.

With the non-leak guarantee: materially larger, because it adds (a) the `card.public_id`
UUID mint + backfill (new column class, not just the ordinal), (b) closing the
`client_game_id`-`None`-for-legacy-rows exception on `game_source` (touches
`domain/game_library.py`'s `Optional[UUID]` typing and the frontend's fallback-to-int
branch), (c) the disposition rewrite of every response model in the survey table (5 route/
schema files), (d) two new enforcement-test artifacts. Estimate: **3 independently-
resumable units** — (1) schema+migration+counter-table+backfill (backend, includes the
`public_id` mint and legacy `client_game_id` backfill), (2) wire/ACL disposition rewrite
across the 5 surveyed response models + frontend ACL/display-site updates (backend route
files + frontend `backend-service.ts` + `card-tree-echarts.ts` + `LibraryTable.vue`), (3)
the two enforcement tests (schema-walk allowlist test + cross-tenant property test). Each
is its own ledger item per the umbrella `CLAUDE.md` point 1 "unit of independent resumption"
test; (1) blocks-close (2) and (2) blocks-close (3).

## Acceptance handles

- Backend unit: `display_ordinal`/counter-increment pure logic (Tier 1).
- Backend service-with-fakes: `CardService`/`GameLibraryRepositoryPort` fake exercising
  the counter-increment-on-create path (Tier 2).
- Backend adapter-integration: concurrent-insert race test against `seeded_session`
  (two coroutines minting cards for the same user_id, assert two distinct ordinals, no
  duplicate-key error) (Tier 3).
- Backend route: the cross-tenant non-correlation property test (Decision 7.2) (Tier 4).
- Backend: the OpenAPI schema-walk allowlist test (Decision 7.1), new small addition.
- Frontend integration: ACL test asserting `display_ordinal`/`publicId` are branded and
  present on `mapToReviewCard`/game-list mapping.
- Playwright witness: fresh (non-maintainer) user's card-tree/library view shows small
  (`1..N`) numbers regardless of how many rows the maintainer's own GoGoD-imported account
  holds — the literal repro of the commission's complaint, now with a green/red witness.

## Touched-file inventory

Backend: `db/schema.py`, new `alembic/versions/000N_*.py`, `db/alembic_bootstrap.py`
(`REVISION_MARKERS`), `repositories/ports.py`, `repositories/card_repository.py`,
`repositories/game_library_repository.py`, `schemas/card.py`, `domain/game_library.py`,
`api/routes/cards.py`, `api/routes/lineage.py`, `api/routes/library.py`, new
`tests/.../global_sequence_allowlist.py` + schema-walk test, new cross-tenant property
test under `tests/integration/routes/`.

Frontend: `src/services/backend-service.ts`, `src/components/charts/card-tree-echarts.ts`
(+ its existing unit test), `src/components/library/LibraryTable.vue`,
`src/composables/library/useLibraryQuery.ts` (typing follow-through),
`frontend/IDENTIFIERS.md` (new brand rows for `CardDisplayOrdinal`/`GameDisplayOrdinal`/
`CardPublicId`, closing the `CardId`/`GameSourceId` "large cardinality PK" rows' framing).
