# SGF Library — Design Note

- **Status:** `design-note: locally-implemented`. Both halves
  of the arc are landed on `feat/sgf-library` — backend
  (schema migration, normalizer extension, domain types, Port,
  Service, Adapter, five REST endpoints under `/library`) and
  frontend (regen'd OpenAPI types, ACL service, five
  composables + a no-dep virtual-scroll primitive, five SFCs,
  App.vue tab wiring, i18n keys across en/ja/ko/zh-CN). Full
  test sweep on both sides clean. Transitions to
  `design-note: implemented` after the user exercises the
  end-to-end flow against their ~/w/vdc/sgf_db directory and
  the branch merges to `next`.
- **Genre:** Design note — the planning record per ADR-0005's
  author-as-decide rule. The conversation that produced this
  shape is the substrate; the document records the decisions.
- **Date:** 2026-05-24.
- **Scope:** Primarily `backend/`. Frontend consumer-side is a
  separate arc that follows backend ship; this note carries the
  open questions the frontend arc will resolve.

## What this document is

A working contributor's mental model of the SGF library
feature: the user-facing capability, the schema shape, the
wire contract, the Port/Service split, and the forward-compat
levers chosen to keep institutional-scale deployments viable
without a migration arc later.

## Motivation

Users with large personal collections of SGF files (the
author's own case is ~25k games of ~2 kB each) have no
relational repository in LengYue today. The existing
`game_source` table is populated only as a side-effect of
card creation; a `game_source` row exists only when at least
one card has been minted against it. Standalone games — old
games the user just wants to browse, replay, or pull
problems from — have no home.

The pedagogy this serves (multifaceted; see
`docs/handoff-current.md`'s "What this product is" section)
benefits from a library because heredity tracking and
parsimonious-compression both flow from "having games to
work with." The library is the seed bed; cards grow from
positions inside library games.

## What this is and is not

**Is.** A first-class store for SGFs, browseable and
filterable in the SPA, with card-creation continuing to work
from library entries via the existing mint flow.

**Is not.** A re-architecture of `game_source`. The existing
table already carries `raw_content` + `player_white` +
`player_black` + `position_id` + `client_game_id` + `user_id`.
A library entry is just a `game_source` row not yet pointed
at by any `card_source`. The arc adds metadata columns and
new endpoints; it doesn't rename or split tables.

**Is not.** A workflow change for the existing card-mint path.
Card creation continues to mint a `game_source` row directly
(via the existing `get_or_create_game_source_by_client_id`
path) without requiring a prior library import. The library
is an optional source, not a mandatory waypoint.

## Architectural shape

The integrated-DB direction. The argument against a sibling
games database is the FK cost: cards reference game sources;
a separate DB makes every card-create flow a cross-DB
duplication or join. The integrated direction lets the existing
content-addressable dedup chain
(`raw_content → canonical_content → content_hash`) do double
duty for both card minting and library imports.

The semantic stretch — calling a table `game_source` when
some rows aren't sources for anything — is mild. The
existing comment language ("originates with a specific
user's upload") already supports the library reading.

## Schema additions (Phase 1)

Single migration to `game_source`:

```python
Column("created_at", DateTime(timezone=True),
       server_default=func.now(), nullable=False)
Column("date", String, nullable=True)         # SGF DT
Column("result", String, nullable=True)       # SGF RE
Column("ruleset", String, nullable=True)      # SGF RU
Column("board_size", Integer, nullable=True)  # SGF SZ
Column("metadata_extra", JSON, nullable=True) # komi, handicap, TM, EV, RO, ...
```

Plus compound `(sort_col, id)` indexes for stable secondary
sort on every column the list view sorts by:

- `(created_at, id)`
- `(date, id)`
- `(player_white, id)`
- `(player_black, id)`
- `(result, id)`
- `(ruleset, id)`
- `(board_size, id)`

`metadata_extra` is the forward-compat lever: it absorbs every
SGF property we don't typed-column (komi, handicap, time
controls, event name, round number, plus any obscure
properties an SGF might carry). The rule for moving a property
from extras to a typed column: when the list view wants to
sort or filter on it. Until then, JSON is sufficient.

**Why these columns and not others.** The five typed columns
are the ones a Go player thinks of as "metadata I'd want to
sort or filter by." They're also Band-1-portable: chess has
date, result, ruleset, board-equivalent (variant), and player
names. Komi and handicap are Go-specific and live in
`metadata_extra` for that reason.

Migration script at
`backend/scripts/migrate_NN_add_game_library_columns.py`,
dialect-aware (SQLite + Postgres), idempotent — matching the
existing migration pattern. Backfills `created_at` to the
migration run time for existing rows. Metadata columns stay
NULL for existing rows (those came in via card-mint without
explicit metadata extraction; the user can re-import them
through the library flow later if they want enrichment).

## Domain layer (Phase 2)

The existing `domain/normalization.py::normalize_sgf` is a pure
function that returns `{content, hash, meta}`. Today `meta` has
only `{white, black}` with `"Unknown"` fallback strings; the
fallback is preserved for CardService backward-compatibility.

The extension: `normalize_sgf` populates additional keys in
`meta`:

```python
meta = {
    # Existing — preserved for CardService backward-compatibility
    "white": <PW or "Unknown">,
    "black": <PB or "Unknown">,
    # New, library-facing
    "date": <DT or None>,
    "result": <RE or None>,
    "ruleset": <RU or None>,
    "board_size": <SZ-as-int or None>,
    "extras": {<all-other-properties>: <raw-string>, ...},
}
```

The decision to keep `"Unknown"` on the existing keys rather
than unifying with `None` is deliberate: changing the existing
fallback would ripple through CardService and possibly the
frontend ACL, which is scope creep for this arc. The library
service reads `meta["white"]` / `meta["black"]` and stores
"Unknown" verbatim if that's what arrived — matching whatever
the existing card-mint flow stores. Future cleanup can unify
the fallback in a dedicated arc.

New domain value objects (`backend/domain/game_library.py`):

```python
class SgfMetadata(BaseModel):
    model_config = ConfigDict(frozen=True)
    player_white: Optional[str]
    player_black: Optional[str]
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    extras: Dict[str, str]

class LibraryGameListItem(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: int
    client_game_id: UUID
    player_white: Optional[str]
    player_black: Optional[str]
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    created_at: datetime
    # Note: no raw_content — list view projection

class LibraryGame(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: int
    client_game_id: UUID
    player_white: Optional[str]
    player_black: Optional[str]
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    created_at: datetime
    metadata_extra: Dict[str, Any]
    raw_content: str
```

Closed-vocabulary sort enum (per ADR-0008's classification
discipline):

```python
GameListSort = Literal[
    "created_at", "date", "player_white", "player_black",
    "result", "ruleset", "board_size",
]
```

Filter shape (Pydantic, not frozen — request-construction):

```python
class GameListFilter(BaseModel):
    player_white_like: Optional[str] = None
    player_black_like: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    result_eq: Optional[str] = None
    ruleset_eq: Optional[str] = None
    board_size_eq: Optional[int] = None
```

Import outcome (discriminated union):

```python
class ImportOutcomeCreated(BaseModel):
    status: Literal["created"]
    game_id: int

class ImportOutcomeDeduplicated(BaseModel):
    status: Literal["deduplicated"]
    game_id: int  # the existing row

class ImportOutcomeErrored(BaseModel):
    status: Literal["errored"]
    error: str

ImportOutcome = Annotated[
    Union[ImportOutcomeCreated, ImportOutcomeDeduplicated, ImportOutcomeErrored],
    Field(discriminator="status"),
]
```

## Port (Phase 3)

New `GameLibraryRepositoryPort` in `repositories/ports.py`. A
separate Port, not an extension of `CardWriteRepositoryPort`:
the read operations make it a distinct contract, and the
existing Ports are named per concern.

```python
class GameLibraryRepositoryPort(Protocol):
    async def import_games(
        self, *, user_id: UserId, raws: list[str],
    ) -> list[ImportOutcome]: ...

    async def list_games(
        self, *, user_id: UserId,
        sort: GameListSort, filt: GameListFilter,
        offset: int, limit: int,
    ) -> tuple[list[LibraryGameListItem], int]: ...

    async def get_game(
        self, *, user_id: UserId, game_id: int,
    ) -> Optional[LibraryGame]: ...

    async def delete_game(
        self, *, user_id: UserId, game_id: int,
    ) -> bool: ...
```

`list_games` returns `(rows, total_count)`. The total is
required for the SPA's virtual-scroll height; computed via a
parallel `SELECT COUNT(*) WHERE <same filters>` for now,
upgradeable to a window-function approach on Postgres if it
ever becomes a hot path.

## Service (Phase 4)

`backend/services/game_library_service.py`. Orchestrates the
use case over the Port. Pure where possible:

- `import_games(user_id, raws)` — per-file: call normalizer (pure),
  pass canonical content + extracted metadata to the Port's
  `import_games`. The Port handles SAVEPOINT-per-file isolation
  so one bad SGF doesn't roll back the batch. Per-file
  outcomes return as a list.
- `list_games(user_id, sort, filt, offset, limit)` — thin
  pass-through with input validation (sort must be in the
  closed vocabulary; offset >= 0; limit in [1, MAX_LIMIT]).
- `get_game(user_id, game_id)` — pass-through, 404 surfaces at
  the route on None.
- `delete_game(user_id, game_id)` — pass-through; cascade
  behavior on dependent `card_source` rows is `SET NULL`
  (already in schema), which orphans cards' source link
  without deleting the cards themselves. The route docstring
  carries this note.

ADR-0002 fail-loudly applies to parse failures. The
normalizer raises `ValueError` on malformed SGF (existing
behavior); the service catches and translates to a structured
`ImportOutcomeErrored` carrying the error message. The batch
keeps processing the remaining files. The route returns 200
with the per-file outcome list (4xx is for malformed *request*
bodies, not per-file parse errors).

## Adapter (Phase 5)

`backend/repositories/game_library_repository.py` implements
the Port via SQLAlchemy 2.0 async. Key behaviors:

- `import_games`: per-file SAVEPOINT via
  `session.begin_nested()`. For each file:
    1. Call normalizer in the service layer (pure); the
       adapter receives canonical + content_hash + metadata.
    2. `get_or_create_normalized_position` (already exists or
       extracted; see Q below) returns the `position_id`.
    3. Dedup check: `SELECT id FROM game_source WHERE user_id
       = :user AND position_id = :pos`. If hit, return
       `Deduplicated(game_id=existing)`. If miss, INSERT with
       a freshly-generated `client_game_id` UUID.
    4. Return `Created(game_id=new)`.

- `list_games`: builds SQL —
  - WHERE `user_id = :user_id` (always, per tenancy spine).
  - WHERE clauses from filter (composed conditionally).
  - ORDER BY `(<sort_col>, id)` for determinism.
  - OFFSET + LIMIT.
  - Column projection excludes `raw_content` — explicit
    SELECT list, not `SELECT *`. Per backend CLAUDE.md's
    column-projection discipline.
  - Parallel `SELECT COUNT(*)` with the same WHERE for total.

- `get_game`: single-row WHERE `id = :id AND user_id = :user_id`.
  Returns `LibraryGame` (with raw_content) or `None`. 404-not-403
  invariant: cross-tenant access returns None, not a permission
  error.

- `delete_game`: DELETE WHERE `id = :id AND user_id = :user_id`,
  returns `rowcount > 0`.

## Routes (Phase 6)

`backend/api/routes/library.py` — surface-named router prefix
``/library`` so the URL surface matches the SPA's product
surface. Five endpoints:

- `POST /library/games/import` — request body
  `{games: [{raw_content: str, source_path?: str}, ...]}`,
  response `{outcomes: [ImportOutcome, ...]}`. 422 for malformed
  body; per-file errors surface as Errored outcomes (200 response).
  Limit on `games` array length (e.g., 1000) to bound a single
  request's work — larger batches client-side-chunked.

  ``source_path`` is the optional provenance field for
  directory-upload UX: the SPA reads
  ``File.webkitRelativePath`` and forwards it so the user's
  on-disk organisation (e.g. ``sgf_db/1996/cho-vs-lee.sgf``)
  is preserved inside ``metadata_extra["source_path"]``. The
  field is non-namespaced lowercase to avoid colliding with
  uppercase SGF property keys (PB / PW / DT / KM / HA / EV / RO /
  …). Single-file uploads, curl clients, and existing scripts
  omit the field — nothing is stored then.

- `GET /library/games?sort=&filter[col]=&offset=&limit=` —
  list endpoint.
  - `sort` defaults to `created_at`.
  - `filter[col]=val` query params for each filter dimension.
  - `offset` defaults to 0; `limit` defaults to 100, max 500.
  - Sort column validation against the closed vocabulary; bad
    sort → 422 with structured message naming the valid set.
  - Response: `{rows: [...], total_count: N}`.

- `GET /library/games/{id}` — detail with `raw_content`. 404 on
  miss or cross-tenant.

- `DELETE /library/games/{id}` — 204 on success, 404 on miss or
  cross-tenant.

- `GET /library/players` — distinct player-name set across the
  caller's library, frequency-ordered. Drives the SPA's filter-
  input autocomplete; fetched once on tab mount, re-fetched
  after imports. Held in SPA memory, not persisted in the
  workspace document.

Pydantic request/response schemas inline at the top of the
route file per backend CLAUDE.md (no `schemas/library.py` until
a second consumer appears).

## Tests (Phase 7)

Mirrors the four-tier pattern from `tests/CLAUDE.md`:

- **Unit** (`tests/unit/domain/test_sgf_metadata.py`) —
  metadata extraction across happy SGFs, missing properties,
  malformed SGFs, the extras-dict carry-through. Failure-mode-
  first: malformed SGFs raise `ValueError` (existing contract).

- **Service with fakes**
  (`tests/unit/services/test_game_library_service.py`) — new
  fake at `tests/fakes/game_library_repository.py` mirroring
  the Port. Tests the orchestration, the per-file outcome
  dispatch, the malformed-SGF translation to `Errored`.

- **Adapter integration**
  (`tests/integration/repositories/test_game_library_repository.py`)
  — fresh in-memory SQLite via `seeded_session`. Verifies SQL
  behaviors the fake doesn't model:
  - WHERE-clause tenancy on every read path.
  - ORDER BY determinism with the `(col, id)` tiebreaker
    (rows with tied sort values are ordered by id).
  - OFFSET correctness at depth.
  - Total_count under filters matches row count.
  - Dedup uniqueness: same content + same user → second
    import returns Deduplicated.
  - Cross-user same content → two distinct rows (per the
    existing tenancy contract).
  - SAVEPOINT isolation: malformed SGF in position 5 doesn't
    roll back positions 1-4.

- **Routes** (`tests/integration/routes/test_games_routes.py`)
  — wire contract:
  - 404-not-403 invariant on cross-tenant detail / delete.
  - 422 on bad sort column or out-of-range pagination.
  - Batch-import per-file outcome shape.
  - Large-payload behavior (at the batch-size limit).

Defect xfails strict per the project's testing discipline.

## Documentation (Phase 8)

- This note transitions to `design-note: implemented` when the
  arc lands.
- `docs/handoff-current.md` "The backend" section gains a
  "Game library" subsection naming the new surface.
- `FEATURES.md` gains a "Game library" entry — open question
  whether it slots under the existing "Browse" section
  (extending the forest-directory navigator with library-only
  rows) or as a sibling top-level Library surface. Frontend
  arc decides.
- `docs/wire-schemas.md` — new section for the four endpoints'
  wire shapes.
- After ship: `docs/dispatch/backend-to-frontend-sgf-library-status.md`
  — status dispatch announcing the endpoints + OpenAPI codegen
  instructions.
- ADR-0006 headers on every new file in the arc.

## Forward-compat slots

The wire contract is intentionally pagination-shaped from day
one, not bulk-shaped. The reasoning (institutional scale up
to 500K+ games; the project author's "we've done everything
else in support of that" framing) is in the conversation
substrate; the operational consequence is the wire shape
above. Random-walk UX (scrollbar drag to arbitrary row N) is
supported by `offset+limit` — cursor pagination is structurally
the wrong tool for random walk because cursors encode "next
after this row" rather than "row at rank N."

The thumbnail rapid-scan UX is solved frontend-side via
prefetching `GET /library/games/{id}` for a lookahead window of rows
around the user's scroll position. Prefetching is a frontend
concern; the wire contract stays simple.

Forward-compat moves baked in:

- `metadata_extra` JSON column for SGF properties not in the
  typed-column set.
- Per-user dedup via `(user_id, position_id)` is the
  default; can be loosened with a query param later if a
  use case appears (none today).
- The list endpoint's response shape — `{rows, total_count}`
  — is a superset of cursor pagination; adding `next_cursor`
  later is backward-compatible.

## Open questions for the frontend arc

These are deferred to the frontend implementation arc, not
backend blockers:

1. **Library surface location.** Extends Browse mode (forest
   directory shows library-only games with empty card trees)
   or sibling top-level Library tab? Affects routing and
   FEATURES.md placement but not the backend contract.

2. **Virtual scrolling library.** TanStack Virtual,
   vue-virtual-scroller, or roll-our-own? The 25k-row case
   needs virtual scroll regardless; this is a library-pick
   decision, not an architectural one.

3. **Prefetch buffer size.** N rows above/below the current
   scroll position to prefetch raw_content for. Default
   guess: 20. UX tuning, not contract.

4. **Card-mint integration.** When a user opens a library game
   and mints a card, the existing
   `get_or_create_game_source_by_client_id` flow should hit
   the library row via shared `client_game_id`. The frontend
   board-creation flow needs to carry the library game's
   client_game_id rather than minting a fresh UUID when
   opening from a library entry. The backend contract
   supports this trivially; the frontend has to thread it.

## Deferred (out of scope)

These are real concerns but not in this arc:

- **Player-name normalization.** "Cho Chikun" vs "趙治勳" vs
  "Cho U" vs misspellings. Store raw; normalize at query time
  if it bites.

- **Collections / tagging at the library level.** Different
  from card tags. Probably a separate join table when
  introduced. The schema doesn't preclude it.

- **"Unknown" fallback unification.** The existing CardService
  flow writes "Unknown" to `player_white` / `player_black` when
  PB/PW is absent; the library flow writes the same. Future
  cleanup can switch to NULL across the board.

- **Full-text search on player names or descriptions.** Simple
  LIKE filters are sufficient for now. ts_vector / FTS comes
  later if needed.

- **Per-page ETag / cache freshness.** The contract supports
  it via standard HTTP headers but the first pass doesn't
  implement.

## References

- `docs/handoff-current.md` — system state, "The backend"
  section.
- `docs/notes/tenancy.md` — multi-tenancy model the library
  inherits from.
- `backend/db/schema.py` — the existing `game_source` table
  and its dedup discipline.
- `backend/domain/normalization.py` — the existing SGF
  normalizer being extended.
- `backend/repositories/card_repository.py::get_or_create_game_source_by_client_id`
  — the existing dedup-aware mint path that library imports
  compose with.

## License

Public Domain (The Unlicense).
