# TODO — Pre-Release Infrastructure Health

This list captures the integration and architectural items identified during
the joint review of the Vue SPA (`gogui`) and the FastAPI service
(`fastapi_service`), to be addressed before public release.

**Ordering principle:** items are sorted by *implementation complexity*, not
by priority or impact. The intent is that an implementer can sweep top-down
and accumulate small wins before tackling structural work.

**Scope tags:**
- `[backend]` — touches only the FastAPI codebase
- `[frontend]` — touches only the Vue SPA codebase
- `[both]` — requires coordinated changes on both sides

Items already addressed during the review (deletion of `routers/`) are not
listed; their downstream documentation tasks are folded into the items below
where the code itself needs to reflect a decision.

## Tenancy model — recorded for context

Several items below relate to a single architectural decision recorded
during the review: **the system is multi-tenant capable in its data model
and access control, but single-user transparent in its default UX.**

- Every domain object a user authors (`card`, `documents`, `game_source`)
  is tenant-scoped by a `user_id` foreign key.
- All read paths filter on the JWT-derived `user_id`.
- Intrinsically global reference data (`normalized_position`, `tag`) stays
  global; *usage statistics* over it are filtered through tenant-owned
  objects.
- The frontend's auto-login flow is preserved by a single config flag
  `ALLOW_PASSWORDLESS_LOGIN: bool = True` (defaults to on for the local
  install scenario; multi-tenant operators set it to off and provision
  real accounts).

The current code stamps `user_id` on writes (correct) but ignores it on
reads (bug). The trace below identified ten read paths that leak across
tenants. They are individually small fixes; collectively they are the
"realize the tenancy model that already exists in the schema" work.

---

## Trivial — single-line or single-block changes, no cross-file impact

### 1. `[backend]` Replace placeholder `SECRET_KEY` default
`core/config.py` ships with `SECRET_KEY = "change-this-in-production"`. For a
release intended to be adapted by go schools, the default should refuse to
start unless overridden via env, OR generate a per-installation random key on
first boot and persist it. Either pattern is correct; the current default is
not.

### 2. `[backend]` Fix CORS `allow_origins=["*"]` + `allow_credentials=True`
This combination is rejected by spec-compliant browsers — when credentials
are in play, the wildcard origin is invalid. `main.py` should list explicit
origins (driven from config) or set `allow_credentials=False` if no
cookie/credential flow is intended. The JWT bearer token is *not* a
credential in CORS terms, so `allow_credentials=False` is likely the right
call.

### 3. `[backend]` Replace deprecated `datetime.utcnow()`
`schemas/card.py` defaults `ReviewRequest.timestamp` via `datetime.utcnow()`,
which returns a naive datetime and is deprecated as of Python 3.12. Replace
with `datetime.now(timezone.utc)`.

### 4. `[backend]` Strengthen `POST /cards/` response model
`api/routes/cards.py` uses `response_model=Dict[str, Any]`, which gives
OpenAPI and any code-generated TypeScript client zero useful information.
Define a small `CardCreateResponse(BaseModel)` with
`status: Literal["created"]` and `card_id: int`.

### 5. `[frontend]` Remove dead 404 branch in `sync-service.ts`
The backend's `GET /documents/{key}` returns `200 {data: {}}` for missing
documents, never 404. The `if (err.message.includes('404'))` branch in
`SyncService.connect()` will never fire. Remove the branch and document the
"missing = empty" semantic in a comment.

### 6. `[frontend]` Remove or implement `AppSettings` ghost fields
`src/types.ts` declares `engine.katago.autoConnect: boolean` and
`engine.katago.extensionCapabilities: Record<string, boolean>`, but
`store/defaults.ts` populates neither. Either remove from the type or add
to defaults with sensible values.

### 7. `[backend]` (This TODO item is no longer relevant)

### 8. `[backend]` (This TODO item is no longer relevant)

### 9. `[backend]` `ALLOW_PASSWORDLESS_LOGIN` config flag *(tenancy)*
Add `ALLOW_PASSWORDLESS_LOGIN: bool = True` to `core/config.Settings`.
In `api/routes/auth.py::login_for_access_token`, when a user has
`has_password=False`, accept the login *only if the flag is True*; otherwise
return 401 with a clear error. This is the single switch that flips the
system between "transparent local install" and "multi-tenant deployment."

The default remains `True` so existing local installs and the SPA's
auto-login flow are completely unaffected. Multi-tenant operators set
the flag to `False` via env and provision real accounts.

### 9a. `[backend]` Stop logging every SQL statement to stdout **[ADDED by review]**
`api/dependencies.py` calls `create_async_engine(config.DATABASE_URI, echo=True)`.
In production this fire-hoses every query into stdout, which (a) leaks
data in shared logs, (b) destroys log signal-to-noise, and (c) measurably
slows hot paths under load. Replace with `echo=config.SQL_ECHO` and add
`SQL_ECHO: bool = False` to `core/config.Settings`. Local development can
opt back in via env.

### 9b. `[backend]` Replace `assert` with explicit validation in `update_recall_float` **[ADDED by review]**
`core/ebisu.py::update_recall_float` uses
`assert (0 <= successes <= total and 1 <= total)` for input validation.
`assert` is stripped under `python -O`, at which point invalid inputs
flow into the Bayesian update unchecked and produce silently-wrong
posteriors. Replace with a `raise ValueError(...)` so the contract holds
under any optimization level.

### 9c. `[backend]` Normalize auth error responses to not leak user existence **[ADDED by review]**
`api/routes/auth.py::login_for_access_token` returns
`"User not found"` (404 semantics, 401 status) when the username
doesn't exist, and `"Incorrect password"` when it does. An attacker can
enumerate valid usernames by diffing the responses. Both branches
should return an identical 401 with a single message
(`"Invalid username or password"`). Trivial to fix; matters more once
item 9's flag is set to `False` in multi-tenant deployments.

### 9d. `[backend]` Delete `core/config.py.legacy` **[ADDED by review]**
`core/config.py.legacy` is a stale snapshot of the old Postgres-era
config. It's not imported anywhere and the live config is in
`core/config.py`. Leaving it in `core/` is actively misleading — a
maintainer searching for `EBISU_TIME_UNIT` will find both files and
have to figure out which is canonical. Delete the file; git history
preserves it if anyone ever needs to look back. Truly `rm`-level work.

### 9e. `[backend]` Resolve broken `domain/pipeline_parser.py` **[ADDED by review]**
`domain/pipeline_parser.py` does not import on its own — the file
references `Dict`, `Any`, `List`, `Select` without importing them, and
calls `compute_structural_metadata` (a function that doesn't exist;
the real one is `compute_structural_coords`). The live request path
goes through `domain/pipeline.py::PipelineExecutor` and never touches
this file. Two acceptable resolutions:
- Confirm it isn't referenced by the test suite and `rm` it.
- If it *is* referenced (the same caveat as items 7 and 8), fix the
  imports and the function name and add a comment explaining what
  scenario it serves that `PipelineExecutor` doesn't.

The current state — a broken-on-import file sitting in `domain/` — is
the worst of both worlds.

---

## Small — one-file refactors, no contract changes

### 10. `[backend]` Inject `EBISU_TIME_UNIT` into `CardRepository`
`repositories/card_repository.py` hardcodes `14400.0` when computing
`current_recall`. Every other call site (`ReviewService`, `PipelineExecutor`,
`StatsEngine`) reads the value from `config.EBISU_TIME_UNIT`. The repository
should take it as a constructor parameter and `get_card_repo` in
`api/dependencies.py` should pass `config.EBISU_TIME_UNIT`. This is a single
named knob; the repository should not own a copy.

### 11. `[backend]` Validate `ReviewRequest.scores` length
`services/review_service.py` silently pads or truncates `request.scores`
to `card.num_moves`. Either replace with a 422 if the lengths disagree, or
accept the resize but echo a `warning` field in the response. Silent repair
at a service boundary is the kind of thing that corrupts data invisibly.

### 12. `[backend]` Make pipeline DSL fail loudly on unknown stage/selection/ordering
`domain/tree_engine.py::build_selection_cte` returns an empty CTE for unknown
selection types. `domain/pipeline.py::_build_order_key_fn` returns
`lambda n: 0` for unknown ordering types. The main `run()` loop ignores
unknown stage actions. Each of these should `raise ValueError` with the
unknown name. A user with a typo in their CardSet currently gets an empty
queue or an unsorted queue with no diagnostic.

> **[Reviewer addendum]**: this item targets the *live* parser. The dead
> file `domain/pipeline_parser.py` (item 9e) has the same anti-pattern
> baked in (`raise ValueError(f"Unknown selection type: {stype}")` —
> actually correct there) but is unreachable. Item 9e is the cleanup for
> the dead copy; this item is the real fix.

### 13. `[backend]` Filter `CardRepository` by `user_id` *(tenancy)*
Both `get_card_by_id` and `update_card_model` must take a `user_id`
parameter and add `WHERE card.user_id = :user_id` to their queries. Routes
in `api/routes/cards.py` already have `user_id` from the JWT dependency;
they need to pass it through. A 404 (rather than 403) is the right response
when the card exists but isn't yours, so the tenancy boundary is not
information-leaking.

### 14. `[backend]` Verify `parent_card_id` ownership in `CardService.create_card` *(tenancy)*
When `data.parent_card_id` is provided, check that the parent card's
`user_id` matches the caller before inserting `card_source`. Otherwise a
user can insert a "child" card under any other user's parent, polluting
their lineage tree. A 403 with an explicit message is appropriate here
since the user is asserting a relationship to something they don't own.

### 15. `[backend]` Filter `StatsEngine` queries by `user_id` *(tenancy)*
`get_tag_usage` joins `tag` ⋈ `card_tag`; needs an additional join into
`card` with a `card.user_id = :user_id` filter so tag counts reflect only
the caller's cards. `get_forest_summaries` selects from `card_source` and
`game_source`; needs filtering through `card.user_id` (and, after item 24,
through `game_source.user_id` directly). `api/routes/stats.py` passes
`user_id` from the JWT dependency through. Tags themselves remain a global
vocabulary (this is intentional, see Tenancy Model section above).

### 16. `[backend]` Filter `tree_engine.fetch_lineage` by `user_id` *(tenancy)*
Same pattern as item 13: take `user_id` as a parameter, add the filter to
the join into `card`. This function is currently unused by the main request
path (the production path goes through `PipelineExecutor`), but it is
exported and could be picked up by future code, so fixing it now is cheap
insurance.

### 17. `[frontend]` Resolve `SyncService` three-channel ambiguity
`src/services/sync-service.ts` sets up three watchers (document, profile,
session) with three independent debounce timers, but `sendSync()` always
writes the entire `{boards, activeBoardIndex, profile, session}` blob.
Pick one: either collapse to a single watcher (matching the actual write
behavior), or split the persistence into three separate document keys with
genuinely independent writes. Currently the structure pays the complexity
of the three-channel design without the benefit.

### 18. `[frontend]` Either consume or stop sending `current_recall` / `halflife_units`
`CardResponse` (backend) computes both fields on every read.
`mapToReviewCard` (frontend) drops them. Decide whether `ReviewCard` should
expose them (they seem useful for forest UI and review session display), or
whether they should be removed from `CardResponse` to stop computing them.
Currently the network carries dead bytes.

### 19. `[frontend]` Make `ResourceService` URL configurable
`src/services/resource-service.ts` hardcodes
`http://127.0.0.1:8765/api/resources`. Once item 22 introduces a
configurable base URL pattern for the FastAPI host, apply the same pattern
here for the KataGo-side HTTP host. Also worth a prominent comment that
this is a *different* backend than `api-client.ts`'s target.

### 20. `[frontend]` Route API/sync errors through `pushSystemMessage`
`api-client.ts` and `sync-service.ts` use `console.log/error`. The store
exposes `pushSystemMessage` which is consumed by `SystemLogPanel`. Engine
errors already use this; API errors do not. A user can't see half of what's
happening to their own app. Wire the API and sync layers to the system log
with appropriate severity levels (`error` for failed requests, `warning`
for recovered ones, `info` for successful auth/hydration milestones).

### 21. `[frontend]` Add abort/timeout to KataGo wait in `useReviewSession`
`processUserMove` awaits `watch(() => ledger.getRaw(hash, s_1_id), ...)`
with no timeout and no abort signal. If KataGo never returns a final-search
packet (engine crash, WebSocket drop, user navigates away mid-review), the
review is permanently stuck in `ANALYZING`. Add a timeout (configurable,
default ~30s) and a reset path that returns to `IDLE` with a
`pushSystemMessage` warning.

### 21a. `[backend]` Replace `print()` with structured logging **[ADDED by review]**
Item 20 covers this for the frontend; the backend has the same problem
in at least `api/routes/cards.py` (`print(f"Review Error: {e}")` inside
the broad `except Exception` handler) and the `scripts/` validators.
Wire up the standard `logging` module with a single configurator in
`main.py`, then replace `print` calls with `logger.error/info/warning`
calls at sensible severities. The route's broad exception handler in
particular currently swallows the traceback and returns
`"Internal mathematical error"` to the client — log the full traceback
on the server side at minimum.

### 21b. `[backend]` Add indexes for hot CTE join paths **[ADDED by review]**
The recursive lineage CTEs in `tree_engine.build_selection_cte` and
`tree_engine.fetch_lineage` join `card_source` to itself on
`card_source.card_source_id = base.card_id`. There is no explicit index
on `card_source.card_source_id`. SQLite tolerates this on small data
sets; Postgres-scale users will see this as the dominant cost of any
forest query. Similarly, `card_tag.tag_id` is part of the composite PK
but the reverse-lookup direction (tag → cards) used by the tag DSL would
benefit from a dedicated index.

Add to `db/schema.py`:
- `Index("ix_card_source_parent", card_source.c.card_source_id)`
- `Index("ix_card_tag_tag_id", card_tag.c.tag_id)`

Cheap to add now; expensive to add later under load.

### 21c. `[backend]` Move engine construction out of import-time **[ADDED by review]**
`api/dependencies.py` constructs `engine = create_async_engine(...)` and
`AsyncSessionLocal = async_sessionmaker(engine, ...)` at module-import
time. Side effects on import are exactly the thing that makes a codebase
test-hostile: importing `dependencies` for *any* reason (e.g. to grab
`get_current_user_id` in a test) instantiates a database connection
pool. Move both into a small `Database` factory that is constructed in
`main.py::lifespan` and provided via `app.state`, with `get_db` reading
from `request.app.state`. This also makes the test suite's database URL
override (currently impossible without monkey-patching) a clean
constructor parameter.

### 21d. `[backend]` Bound `_BETALN_CACHE` growth in `core/ebisu.py` **[ADDED by review]**
`_BETALN_CACHE` is a plain dict that grows once per unique `(alpha, beta)`
pair the system has ever seen. Since Ebisu rebalances both parameters on
every review, the set of pairs grows monotonically with review volume.
For a multi-user multi-month deployment this is a slow memory leak.
Replace with `functools.lru_cache(maxsize=4096)` (or similar) — the
working set is small and bounded, and `lru_cache` gives bounded memory
for free. The `betaln(a + dt, b)` term in `predict_recall` is correctly
*not* cached (dt varies per call); only the denominator is cacheable.

### 21e. `[backend]` Batch `_attach_tags` get-or-create **[ADDED by review]**
`services/card_service.py::_attach_tags` issues a SELECT, optional
INSERT, and existence check *per tag, sequentially*. For a 5-tag card
this is 10–15 round trips; for the migration script's bulk path it is
the dominant cost. Replace with a single `SELECT ... WHERE name IN (...)`,
compute the set difference in Python, single bulk INSERT for missing
tags, single bulk INSERT into `card_tag` for the links. Minor for
typical interactive use, but the migration script in `scripts/` will
appreciate it and it's straightforward SQLAlchemy.

### 21f. `[backend]` Define `CardRepositoryPort` Protocol **[ADDED by review]**
`services/review_service.py::ReviewService.__init__` is typed as
`(self, repository: CardRepository, ...)` — depending on the *concrete
adapter*, not an interface. This is the missing Port half of the Ports
& Adapters pattern that the directory layout implies but does not
deliver. Add a `CardRepositoryPort(Protocol)` in
`repositories/card_repository.py` (or a new `repositories/ports.py`)
with the methods the service actually consumes (`get_card_by_id`,
`update_card_model`), and re-type `ReviewService` to depend on the
Protocol. `CardRepository` becomes one possible implementation; tests
can supply an in-memory implementation without an `AsyncSession`.

This is the smallest possible step toward item 32a, and it pays back
immediately in test-writability for `ReviewService`.

---

## Medium — touches contracts or requires coordinated changes

### 22. `[frontend]` (mostly) Make backend URLs configurable
Replace the hardcoded `BASE_URL = 'http://localhost:8764'` in
`src/services/api-client.ts` (and the parallel URL in
`resource-service.ts`, see item 19) with values read from
`import.meta.env.VITE_*`. This is the interim step before any zeroconf
work (item 32) and is a strict prerequisite for any deployment scenario.
Backend touch is minor: a default `.env.example` in the repo and a
`vite.config.ts` review.

### 23. `[backend]` Add `user_id` to `documents` table *(tenancy)*
Schema migration:
- Add `user_id INTEGER REFERENCES users(id) NOT NULL` column to `documents`.
- Change primary key from `(key)` to `(user_id, key)`.
- Migration step for existing data: assign all existing rows to `user_id=1`
  (the `local_user`'s expected id under the default install). Document this
  assumption in the migration script.

Then update `api/routes/documents.py`:
- Both `GET` and `PUT` filter by `(user_id, key)`.
- Both pass `user_id` from `get_current_user_id` through to the queries.

The frontend's `SyncService` does not change — the URL still uses `key`
alone, and the backend looks up by the JWT-derived `user_id` plus `key`.
This makes the tenancy boundary entirely server-side, which is correct.

### 24. `[backend]` Add `user_id` to `game_source` table *(tenancy)*
Schema migration:
- Add `user_id INTEGER REFERENCES users(id) NOT NULL` column to
  `game_source`.
- Backfill existing rows by joining through `card_source.game_source_id`
  to find an associated `card.user_id`. Multiple cards may reference the
  same game_source under the current schema, but in practice they should
  all belong to the same user (since `create_card` only mints a new
  game_source on a root). Verify this invariant before migration; if it
  holds, take any matching `user_id`. If it doesn't, log the violations
  and require manual resolution.

Then update `CardService.create_card` to stamp `user_id` on inserts, and
update item 15's `get_forest_summaries` filter to also constrain on
`game_source.user_id` directly (cleaner than going through `card_source`
→ `card.user_id`).

### 25. `[backend]` Thread `user_id` through `PipelineExecutor` and `build_selection_cte` *(tenancy)*
This is the largest of the tenancy items because the DSL evaluator was
designed with no awareness of ownership. Two coordinated changes:

- `PipelineExecutor.__init__` (or `.run()`) takes `user_id`. The final
  query that materializes the pool joins `card` and applies
  `WHERE card.user_id = :user_id`.
- `build_selection_cte` in `tree_engine.py` either takes `user_id` and
  filters at the CTE level, OR the CTE stays unfiltered and the outer
  query that joins `card` does the filter. The second is simpler (one
  filter point, easier to audit) and is what I'd recommend; the first
  is more defensive.

Also: `TagDSLCompiler.compile_to_subquery` produces a subquery selecting
`card_id` from `card_tag → tag`. If a user has the tag `$private` on
their card and another user also has `$private`, the subquery returns
both card ids. The outer pool filter from `PipelineExecutor` will drop
the wrong ones, so this is technically safe — but only because the outer
filter exists. Document this dependency in a comment in `tag_dsl.py` so
no one later "optimizes" by using the tag subquery in isolation.

`api/routes/forests.py::query_forest` already has `user_id` from the JWT
dependency; it just needs to pass it through.

### 26. `[both]` Document the tenancy model in code and README
Now that items 9, 13–16, 23–25 implement multi-tenancy properly, a
prominent README section ("Tenancy") should describe the model: what's
isolated, what's global, the role of `ALLOW_PASSWORDLESS_LOGIN`, the
default single-user UX. Brief docstrings in:
- `db/schema.documents`, `db/schema.game_source`, `db/schema.tag` — what
  is and isn't tenant-scoped, and why
- `core/config.Settings.ALLOW_PASSWORDLESS_LOGIN` — what flipping it does
- `api/dependencies.get_current_user_id` — the invariant that downstream
  code can rely on
- `src/services/api-client.ts::ensureAuthenticated` — the assumption
  about the backend that this flow relies on

This item is mostly documentation, but it's the documentation that turns
the working multi-tenancy into something a future maintainer can find,
trust, and extend.

### 27. `[both]` Make document sync semantics explicit
Within a single tenant, the document sync is last-write-wins with no
version field. For the intended single-user-per-tenant use case this is
fine, but two browser tabs against the same account will silently
overwrite each other. Pick one of:
- Add an `updated_at`-based ETag pattern with `If-Match` on PUT and a
  409 + diff-resolution UI on conflict. *(Significant work — only if
  multi-tab use is in scope.)*
- Keep last-write-wins but add a comment in both
  `api/routes/documents.py` and `src/services/sync-service.ts` naming
  the invariant ("single-tab-per-tenant assumed; concurrent edits will
  silently overwrite") and add a README note.

The minimal version is the second option, which is essentially
documentation but in code.

### 28. `[frontend]` (backend touch optional) Improve JWT 401 handling
`api-client.ts::request` clears the token on 401 and throws. With 30-day
tokens (`core/security.py::ACCESS_TOKEN_EXPIRE_MINUTES`), most users
will hit this exactly once per month, and the failure presents as one
user-visible error followed by silent recovery on the next call. Replace
with: on 401, attempt `ensureAuthenticated()` once and retry the
original request; only throw if the retry also fails. Surface the
recovery via `pushSystemMessage('info', ...)` (depends on item 20).

### 29. `[both]` Decide and act on the API-side ACL exceptions
Two places leak backend shapes through the frontend's anti-corruption
layer:
- `EbisuService.queryForest` accepts and forwards `pipeline: any[]`.
- `useReviewSession.processUserMove` reads
  `currentCard.value?.grading_parameter?.data?.analysis_config` directly,
  bypassing `mapToReviewCard`.

Either expose `gradingParameter` as a typed field on `ReviewCard` (with
a tagged union for the `analysis_config` payload), or refactor the read
path to go through the ACL. Item 30 (codegen) makes the typed version
much cheaper.

### 30. `[both]` Introduce OpenAPI → TypeScript codegen
FastAPI publishes OpenAPI at `/openapi.json` for free. Add an
`openapi-typescript` (or equivalent) build step to the frontend that
generates `src/types/api.gen.ts` from a snapshot of the backend schema,
and have `EbisuService` and `ApiClient` consume the generated types.
This closes an entire class of silent-drift bugs (the dropped
`current_recall` field, the runtime `card_source_id` warning, etc.) and
makes items 6, 18, and 29 near-trivial. The work is mostly tooling: a
script to fetch+regen, a make-target or npm script, a CI check that the
generated file is up to date.

This item is a *prerequisite* for item 31 to be worth doing properly.

### 30a. `[backend]` Move recall/halflife computation out of `CardRepository` **[ADDED by review]**
`repositories/card_repository.py::get_card_by_id` calls
`predict_recall(...)` and `model_to_halflife(...)` and stuffs the
results into the returned `CardResponse`. That mixes three concerns in
the adapter:
- *Persistence* (the SQL query) — belongs in the repository.
- *Domain computation* (Bayesian recall projection) — belongs in a
  use case or domain service.
- *Presentation* (the `CardResponse` DTO) — belongs at the route
  boundary.

Refactor: the repository returns a thin `Card` representation (Pydantic
model with the persisted fields only). A small `CardProjection` use
case (in `services/` or `domain/`) takes a `Card` plus a `now` timestamp
and returns the recall/halflife-augmented view. The route or a
dedicated mapper assembles the final `CardResponse`. Same wire format;
clean separation; the repository becomes mockable without monkey-patching
the Ebisu math.

This item is a clean prerequisite for items 30b and 32a.

### 30b. `[backend]` Refactor `CardService` to depend on a repository **[ADDED by review]**
`services/card_service.py::CardService.__init__` takes a raw
`AsyncSession` and runs `select`/`insert` statements inline, against
`db.schema` tables it imports directly. This is a service that has
*become* an adapter — it bypasses the repository layer entirely.

Extend `CardRepository` (or split into a sibling `CardWriteRepository`)
with the methods `CardService` actually needs:
- `get_or_create_position(norm) -> int`
- `insert_card(values) -> int`
- `insert_game_source(values) -> int`
- `link_source(card_id, parent_id, game_source_id)`
- `attach_tags(card_id, tag_names)` *(folds in item 21e's batch path)*

`CardService` then takes the repository (or a write-port Protocol per
item 21f's pattern) and orchestrates these calls. The session is owned
by the repository, not the service. This is the moment where item 21f's
Port abstraction pays back: `CardService` becomes testable without a
database.

> **[Reviewer addendum — domain-agnosticism]**: When introducing the
> repository Port pattern here, also extract a `PositionNormalizerPort`
> from `domain/normalization.normalize_sgf` along the same lines.
> `CardService.create_card` currently calls `normalize_sgf` directly
> (the only Go-specific call site in `services/`); after this refactor
> it should depend on the normalizer Protocol via the same DI pattern
> as the repository. This is the architectural seam that item 34
> formalizes for cross-domain adoption (Chess, music theory, anatomy,
> etc.) and costs roughly 30 extra lines on top of the repository work.

### 30c. `[backend]` Single CTE per pipeline run **[ADDED by review]**
`domain/pipeline.py::PipelineExecutor.run` loops over `context_ids` and
issues one CTE round trip per id, then unions the results in Python
with first-seen-wins on collision:

```python
for cid in context_ids:
    cte = build_selection_cte(base_cfg, cid)
    res = await self.session.execute(query_using(cte))
    for row in res.fetchall():
        if row.id not in pool_map or row.depth < pool_map[row.id].depth:
            pool_map[row.id] = CardNode(row)
```

For `M` context ids this is `M` round trips and `M` separate query
plans. Replace `build_selection_cte(cfg, context_id)` with
`build_selection_cte(cfg, context_ids: List[int])` that emits a single
CTE keyed off `WHERE card_source.card_id IN (:context_ids)` (or the
equivalent for the recursive base). The first-seen-wins collision
semantics move into a SQL `MIN(depth) GROUP BY card_id` or stay in
Python on a single `fetchall()`.

Observable behavior is identical for users; latency drops linearly with
the number of contexts. This is a contract-shaped change to the
internal CTE-builder API but no externally-visible change.

### 30d. `[backend]` Consolidate the four recursive-CTE implementations **[ADDED by review]**
The same recursive lineage CTE pattern is implemented in at least four
places:
- `domain/tree_engine.py::fetch_lineage`
- `domain/tree_engine.py::build_selection_cte` (the `DescendantSelection`
  and `SubtreeSelection` branches)
- `domain/tree_queries.py::get_lineage_cte` *(used in tests, per the
  caveat on items 7 and 8 — do not delete; refactor to delegate)*
- `domain/tree_dsl.py::SubtreeSelection.to_cte` *(also used in tests;
  same caveat)*

Each one has its own subtle variation (column naming for the depth
literal, base-case predicate, max-depth handling). Extract a single
`_build_lineage_cte(root_predicate, max_depth: Optional[int]) -> CTE`
helper and have all four call sites delegate to it. Keep the four
public surfaces intact — they're each used by something — but the
recursive machinery lives in exactly one place. Bug-fixes to one
variant currently never propagate to the others; this item closes that
hole.

A natural pair-up with item 30c: once consolidated, the single helper
takes a list of root ids by default, and 30c becomes "use the helper
correctly in the executor."

---

## Large — structural changes that introduce new abstractions

### 31. `[both]` Tree DSL typed schema
Currently the Pipeline DSL crosses the wire as `List[Dict[str, Any]]` on
the backend and `any[]` on the frontend. There is no compile-time
guarantee that a CardSet authored by the frontend's `CardSetEditor` will
be evaluable by the backend, and item 12 above (loud failures) only
catches errors at *evaluation* time, not authoring time.

The correct fix is to define each pipeline node as a Pydantic
discriminated union on the backend:

```python
class DescendantSelection(BaseModel):
    type: Literal["DescendantSelection"]
    max_depth: int | None = None

class SubtreeSelection(BaseModel):
    type: Literal["SubtreeSelection"]
    n: int = 0
    m: int | None = None

# ... etc, including AncestorSelection, SiblingSelection, union, intersect, filter

Selection = Annotated[
    DescendantSelection | SubtreeSelection | AncestorSelection | ...,
    Field(discriminator="type"),
]
```

…and the same shape for `Ordering` (with primitives like `DepthKey`,
`HeightKey`, `EbisuRecallKey`, and combinators like `LexicographicOrder`,
`WeightedSumOrder`, `negated`) and for the preset aliases.

The presets are interesting: they're macro-expanded at evaluation time
in `_build_order_key_fn`. Two acceptable designs:
- Keep them as runtime expansions but add a `PresetOrdering` variant to
  the union with a `Literal` of valid preset names. The TS type then
  exhaustively lists the legal names.
- Eliminate them on the frontend by inlining their definitions in
  `defaults.ts`. Simpler and more transparent but loses the
  abbreviation.

Once the schema exists on the backend, item 30 generates the TypeScript
counterparts automatically. The frontend's `CardSet.pipeline: any[]`
becomes `CardSet.pipeline: PipelineStage[]`, the `CardSetEditor` gets
typed autocomplete, and an entire category of integration bug becomes
representable-but-uninstantiable.

This is the single highest-leverage architectural item on this list,
and it is a prerequisite for the visualization work captured in
`Addendum.md`.

### 32. `[both]` Zeroconf / mDNS service discovery
Replace fixed-port URL configuration (item 22) with mDNS service
advertisement on the backend (`_ebisu._tcp.local.` or similar) and
discovery on the frontend. Constraints recorded in earlier discussion:
must not introduce mandatory dependencies for Linux users (no Avahi
requirement), must work on Windows out of the box, must work in Firefox
without extra extensions.

This is large not because the implementation is hard but because the
testing matrix is wide (three OSes × multiple browsers × with-and-without
network configurations) and the failure modes need graceful fallback to
the configured URL from item 22.

### 32a. `[backend]` Purify the domain layer of SQLAlchemy **[ADDED by review]**
The directory layout reads as Clean/Hexagonal — `domain/`, `services/`,
`repositories/`, `api/routes/` — but the dependency rule is inverted in
every file under `domain/`:

| File | Cross-layer import |
|---|---|
| `domain/tree_engine.py` | `from db.schema import card, card_source, ...` and takes `AsyncSession` in `fetch_lineage` |
| `domain/tree_dsl.py` | imports `db.schema`; `Selection.to_cte() -> CTE` is the Port contract |
| `domain/tree_queries.py` | imports `db.schema` |
| `domain/stats_engine.py` | imports `db.schema` and `AsyncSession`; runs queries directly |
| `domain/pipeline.py` | imports `AsyncSession`; runs queries; constructs `CardResponse` DTOs |
| `domain/tag_dsl.py` | imports `db.schema`; returns `Select` |

What today is called the "domain" is in fact a SQL-builder layer. There
is no `Card` domain entity (everything reaches into a SQLAlchemy `Row`
via `n.data._asdict()`); there is no Port whose contract is independent
of SQLAlchemy (the `Selection.to_cte() -> CTE` Protocol *names itself
in CTE terms*); and the use cases (`services/`) cannot be tested
without a database because their dependencies cannot be substituted.

The target end-state has four moving parts:

1. **Domain entities.** A frozen Pydantic `Card` (and `CardNode`,
   `Lineage`, `Pool`) with no ORM coupling, populated by adapters at
   the boundary. The current `CardNode` becomes a domain entity rather
   than a row wrapper; structural coordinates remain on it.

   > **[Reviewer addendum — domain-agnosticism]**: Use generic field
   > names (`raw_content`, `canonical_content`, `content_hash`) on the
   > domain `Card` entity rather than the Go-specific `sgf`,
   > `normalized_sgf`, `pos_hash`. The schema columns can keep their
   > original names temporarily; the in-memory domain model is neutral
   > from day one. This costs nothing extra at the time you're writing
   > the entity classes anyway. Item 34 will rename the schema columns
   > later as a one-shot migration once 32a has settled.

2. **Pure domain algorithms.** `compute_structural_coords` already
   *is* pure (it operates on Python objects); it just imports nothing
   wrong. The Tag DSL parser (`_parse_definition`, `_parse_query`,
   `_expand_conjunction` in `tag_dsl.py`) is also pure modulo the
   `_conjunction_to_sql` exit step. Both stay where they are; only
   their colocated SQL-emitting code moves out.

3. **Repository Ports** (Protocols, see item 21f for the smallest
   first step):
   - `LineageRepositoryPort.fetch(roots, selection_spec) -> Lineage`
   - `CardRepositoryPort.get(id, user_id) -> Card | None`
   - `CardRepositoryPort.update_model(id, model)`
   - `TagFilterRepositoryPort.filter_card_ids(predicate, user_id) -> Set[int]`

   The `selection_spec` and `predicate` arguments are typed domain
   objects (Pydantic discriminated unions per item 31), not SQL
   constructs.

4. **SQLAlchemy adapters** under `repositories/` (or
   `infrastructure/`) that implement the Ports. The CTE-building code
   from `tree_engine.py` and the `_conjunction_to_sql` from
   `tag_dsl.py` move here. This is where the "How" lives — the only
   layer that knows about `card_source.c.card_id`.

Items 9e, 21f, 30a, 30b, 30c, 30d are each independently shippable
steps along this path. This item is the explicit naming of the
destination they're walking toward, and the place where remaining
work (porting `PipelineExecutor` to use Ports, removing the
`AsyncSession` argument from `StatsEngine`, defining `Card` and
`Lineage` entities) lives once those prerequisites land.

This and item 31 are complementary halves of the same architectural
milestone: 31 makes the wire DSL representable as types; 32a makes
the domain that *consumes* those types representable independently of
the database. Landing one without the other leaves either typed
garbage flowing into untyped code (31 alone) or untyped garbage
flowing through clean ports (32a alone). The natural sequencing is
30a → 21f → 30b → 31 → 32a, with the medium tenancy items (23–25)
landing in parallel since they don't interfere.

Scope honesty: this is the largest item on the list and is roughly
the size of items 23+24+25+31 combined. It is not a prerequisite for
any user-visible feature; it is a prerequisite for *cheap future
change*. The decision of whether to attempt it before public release
is a judgment call about how stable the domain model is expected to
be: if it will keep evolving, this pays for itself within a few
features; if it's frozen, the current state is liveable.

### 34. `[backend]` Domain-agnostic core: extract `PositionNormalizerPort` and document extension points **[ADDED by review]**
The codebase is currently structured around Go (SGF parsing in
`domain/normalization.py`, `sgf` field name on the API, `normalized_sgf`
column in the schema, KataGo-specific `default_visits` column on the
`card` table). The architecture is otherwise domain-neutral: the Ebisu
math, the tree DSL, the tag system, auth, multi-tenancy, and document
sync all work identically for any knowledge domain that fits an "acyclic
graph of cards with tags" model — Chess, music theory, mathematical
proofs, anatomy, language vocabulary, and so on.

This item formalizes the architectural boundary so that another
community (most concretely Chess, which has no equivalent SR-with-graph
tool today) can adopt this codebase by writing roughly one Python file.

**Port extraction** (the architectural seam, mostly already done by 30b):
- Define `PositionNormalizerPort(Protocol)` with a single method
  `normalize(raw_content: str) -> NormalizedContent` returning a
  Pydantic-frozen `(canonical_content, content_hash, metadata)` triple.
- `domain/normalization.SgfNormalizer` becomes the Go implementation;
  a hypothetical `PgnNormalizer` would be the Chess one.
- Wire the normalizer via DI exactly as the repository will be after
  item 30b — `CardService` depends on the Port, not on a concrete
  implementation. Item 30b's addendum locks this in.

**Schema renaming** (one-shot migration, scriptable on both SQLite
and Postgres):
- `normalized_position.normalized_sgf` → `canonical_content`
- `normalized_position.pos_hash` → `content_hash`

The SQLite path requires a swap-table pattern (no `ALTER COLUMN
RENAME` in older SQLite; modern SQLite supports `ALTER TABLE ... RENAME
COLUMN`, so 3.25+ deployments are a one-liner). Postgres is a one-liner
either way.

**API renaming** (coordinated breaking change, smoothed by item 30's
codegen which surfaces every consumer):
- `CardCreate.sgf` → `CardCreate.raw_content`
- `CardResponse.normalized_sgf` → `CardResponse.canonical_content`

**Domain entity field naming** (no rename — these don't exist yet,
just naming convention for items 30a/32a). Item 32a's addendum locks
this in.

**`default_visits` cleanup**: the `card.default_visits` column is
KataGo-specific (Go analysis-engine playout count) bleeding into the
SR schema. Move into a separate `analysis_settings` JSON column, or
fold into the existing `grading_parameter` JSON blob (which is
already the catch-all for per-card analysis-engine configuration).

**Documentation**: add a README section "Adopting this codebase for
another knowledge domain" with a one-page checklist:
- Implement `PositionNormalizerPort` for your domain's notation.
- Set the appropriate file extension and Pydantic schema.
- Supply domain-appropriate Ebisu defaults via env config (the time
  unit, gamma, and target recall are currently tuned for Go; Chess
  tactics cards likely want a different time unit, vocabulary
  drilling wants a different gamma, etc.).
- Optionally implement an analysis-engine integration in the same
  shape as the existing KataGo one, if your domain has an equivalent
  (Stockfish for Chess, etc.).

**Dependencies**: this item depends on item 30b (for the Port wiring
pattern) and item 32a (for the entity field naming convention). The
actual rename + migration work is bounded — about a day's work — but
should land *after* the architectural turn so it's a one-time
mechanical pass rather than a moving target.

**Non-blocker for first release**: the Go community benefits from
everything else without this; Chess (or any other domain) only needs
this item. Sequencing it after 32a means we don't waste the work if
the domain-neutralization decision is reversed (it won't be, but
optionality is cheap to preserve).

The honest pitch to a future Chess team after this item lands: *write
one Python file implementing `PositionNormalizerPort`; inherit the SR
engine, tree DSL, tagging, multi-tenancy, and auth; ship in a week.*

---

## Implementation order recommendation

Within each complexity tier, items are mostly independent and can be
parallelized or cherry-picked. The few dependencies worth naming:

- **Item 10** is a clean prerequisite for the magic-number cleanup in
  items 11 and 12 staying clean.
- **Item 19** depends on item 22's pattern.
- **Item 28** depends on item 20 to surface its recovery message.
- **Item 29** becomes much smaller after item 30 lands.
- **Item 31** depends on item 30.
- **Item 32** can stand alone or build on item 22.

> **[Reviewer addendum — additional dependencies]**
> - **Item 30a** (move recall computation out of the repo) is a clean
>   prerequisite for item 30b (`CardService` repository refactor) and
>   for item 32a (domain purification).
> - **Item 21f** (define `CardRepositoryPort`) is a prerequisite for
>   item 30b and 32a, but is independently shippable as a pure
>   contract-addition step.
> - **Item 30c** (single CTE per pipeline run) and item 30d
>   (consolidate the four CTE implementations) pair naturally — 30d
>   makes 30c a one-liner. Either order works; doing 30d first is
>   easier to review.
> - **Item 32a** (domain purification) is the destination for items
>   9e, 21f, 30a, 30b, 30c, 30d, and pairs with item 31 as the two
>   halves of the same architectural milestone.
> - **Item 34** (domain-agnostic core) depends on items 30b (Port
>   wiring pattern) and 32a (entity field naming). Non-blocking for
>   any release; pure adoption-enablement for other knowledge domains.
> - **Item 21a** (backend logging) is a prerequisite only in the soft
>   sense that the broad-`except Exception` swallow in `cards.py` will
>   keep hiding bugs from any review work until logging exists to
>   surface them.

For the **tenancy items specifically**, a coherent sub-sequence is:

> 9 (config flag — completely independent, ship first)
> → 13, 14 (CardRepository + parent ownership — purely additive filtering)
> → 15, 16 (StatsEngine + fetch_lineage — same pattern)
> → 23 (documents migration — first schema change, isolated table)
> → 24 (game_source migration — second schema change)
> → 25 (PipelineExecutor — uses everything above and is the largest behavioral change)
> → 26 (documentation — once the model is real, document it)

Each tenancy step is independently reviewable and leaves the system in a
working (if incompletely-tenant-isolated) state. The order above never
breaks the local install: at every intermediate point, `local_user` (the
sole tenant) sees exactly the same data they did before. The behavior
only changes for installs that have actually provisioned multiple users,
which by definition only happens after item 9 has been used to flip the
flag.

If maximum-velocity-with-minimum-coordination is the goal across the
*whole* list:

> **[Reviewer addendum — original sequence preserved, new items inserted in tier]**

**Trivial sweep:**
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 9a → 9b → 9c → 9d → 9e

**Small sweep:**
10 → 21a → 20 → 11 → 12 → 21b → 21c → 21d → 21e → 21f → 13 → 14 → 15 →
16 → 18 → 17 → 21 → 19

**Medium sweep:**
22 → 30a → 23 → 24 → 25 → 26 → 27 → 30b → 28 → 29 → 30c → 30d → 30

**Large sweep:**
31 → 32 → 32a → 34

This delivers all tier-one wins, then the tenancy sub-sequence (now
with item 30a slotted in just before it because purifying the
`CardResponse` build path simplifies the per-user filter additions
in 13/15/16), then contracts and structural items in order. The
architectural items (21f, 30a, 30b, 32a) are interleaved so that each
one's prerequisite has landed before it comes up.

> **[Reviewer note — the genuine starting-point question]**
> Three credible places to start, in increasing order of investment:
>
> 1. **Trivial sweep alone** (items 1–9e). Half a day of work, no
>    architectural commitment, eliminates every Tier-1 security
>    concern except the multi-tenancy data leak. Ships a noticeably
>    safer system on its own.
>
> 2. **Trivial sweep + tenancy spine** (items 1–9e, then 9 → 13 → 14
>    → 15 → 16 → 23 → 24 → 25 → 26). The minimum sufficient work to
>    legitimately call this "multi-tenant capable." Most of the
>    individual changes are small; the cumulative review surface is
>    substantial.
>
> 3. **Trivial sweep + tenancy spine + architectural turn**
>    (everything above plus 21f → 30a → 30b → 31 → 32a). The version
>    where future feature work gets *cheaper*, not just possible.
>    This is the version where item 31's typed pipeline DSL is worth
>    its full cost, and where the test suite can actually grow
>    without each new test booting a database.
>
> Path 1 is unambiguously good. Path 2 is the right answer if
> multi-tenant deployment is a near-term goal. Path 3 is the right
> answer if the domain model is expected to keep evolving and the
> codebase will outlive its current author. The choice between 2 and
> 3 is the strategic decision; everything else is execution.
