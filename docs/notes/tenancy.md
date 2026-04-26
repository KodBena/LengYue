# Tenancy — System Note

- **Status:** Implemented across items 13–25 (the tenancy spine).
- **Genre:** System note — descriptive documentation of how the
  tenancy model works in the codebase. Not an ADR (no decision being
  made here); not a tenet (not cross-cutting authoring discipline).
  The "what does this codebase do under the hood" complement to the
  four ADRs.
- **Date:** Closes alongside item 25.
- **Scope:** Backend (`fastapi_service`). Frontend implications
  noted where relevant; full frontend changes are item 28's domain.

## What this document is

A working contributor's mental model of the tenancy system: the
shape it has, the invariants it guarantees, the operator-side
configuration, and the architectural seams that make it work. Writ
for someone who has read the four ADRs and the HANDOFF and now wants
to know how multi-tenancy actually flows through the code.

The historical narrative — why this shape and not another — lives
above this in the four ADRs (especially ADR-0002 on fail-loudly,
which the 404-not-403 invariant directly applies). This note picks
up where they leave off and describes what's there.

## The headline invariant

**Every endpoint that returns or mutates tenant-scoped data filters
on the JWT-derived `user_id` at the SQL level, and the filter is
collapsed into the same WHERE clause as the resource-id predicate
so that "doesn't exist" and "not yours" are indistinguishable from
the API surface.**

This is the "404-not-403 by predicate fusion" invariant. It exists
because:

- Returning 403 for "exists but not yours" leaks the existence of
  another tenant's resources to anyone who can probe by id. A user
  enumerating `GET /cards/1`, `GET /cards/2`, `GET /cards/3` …
  could distinguish "card exists" from "no such card" by status
  code alone.
- Collapsing the predicates into one (`WHERE id = :id AND user_id =
  :user_id`) is one query at the database. Splitting them into two
  (existence check, then ownership check) is two queries with a
  privacy-preserving response pasted back together — slower, more
  code, and easy to get wrong.
- The collapse falls out naturally from how SQL filters work: a
  card belongs to this caller iff both predicates match. The route
  layer's existing `if not card: raise HTTPException(404)` branch
  handles both cases without modification.

## The shape: how tenancy threads through the code

Five layers, each with a small, uniform contract.

### Layer 1: route — captures `user_id` from JWT

Every tenant-scoped route declares a dependency:

```python
user_id: UserId = Depends(get_current_user_id)
```

`UserId` is `NewType("UserId", int)` from `domain/auth.py` — a
runtime-no-op brand that prevents transposition between integer ids
(card_id, position_id, user_id, etc.) at static type check time.
The JWT decode in `api/dependencies.get_current_user_id` applies
the brand at one boundary point; `UserId` flows through the rest of
the system unchanged.

The route forwards `user_id` to its service or repository call:

```python
return await service.process_review(card_id, request, user_id=user_id)
```

`user_id` is **keyword-only** at every Port method and every service
method that takes it. This is deliberate: a method with two adjacent
integer parameters (e.g., `card_id, user_id`) is exactly the
transposition risk the brand was designed to catch — but the brand
only catches the type, not the position. Forcing keyword-only makes
the call site self-documenting.

### Layer 2: service — forwards `user_id` to Port methods

Services are Port-pure orchestrators. They forward `user_id` to
every Port call that touches a tenant-owned table:

```python
async def process_review(self, card_id, request, *, user_id: UserId):
    card = await self.repository.get_card_by_id(card_id, user_id=user_id)
    # ...
    await self.repository.update_card_model(card_id, new_model, user_id=user_id)
    # ...
```

Services don't apply tenant logic themselves — they pass the
parameter through. The filter is enforced one layer down.

One exception: `CardService.create_card` runs a **parent-ownership
precheck** before the create cascade (item 14). If
`data.parent_card_id` is set, the service fetches the parent via
the tenant-aware read Port and raises `CardNotFoundError` on miss.
This is the only place tenant logic lives above the persistence
layer — because it's structurally a precondition (not a filter on
returned data), and lifting it into the route would conflate
domain validation with HTTP concerns.

### Layer 3: Port — declares `*, user_id: UserId` in signatures

The Ports in `repositories/ports.py` are the contract. Every method
that reads or writes a tenant-scoped table takes `user_id`:

```python
async def get_card_by_id(
    self, card_id: int, *, user_id: UserId,
) -> Optional[Card]: ...

async def fetch_selection(
    self, selection: BaseSelection, context_ids: List[int],
    *, user_id: UserId,
) -> List[CardNode]: ...

async def card_ids_matching(
    self, tag_expression: str, *, user_id: UserId,
) -> Set[int]: ...
```

The Ports are domain-pure: their imports are stdlib, `domain.*`,
and `schemas.*`. No `sqlalchemy`, no `db.schema`, no
infrastructure. A test can satisfy any Port with a 5-line fake.

### Layer 4: adapter — applies the WHERE clause

The SQLAlchemy adapters in `repositories/*.py` translate the Port
calls into SQL. The `user_id` parameter becomes a WHERE clause
fragment:

```python
.where(card.c.id == card_id)
.where(card.c.user_id == user_id)  # Item 13: tenancy filter.
```

For recursive CTEs, the filter applies at **both the base case and
the recursive step** — see "Defense in depth" below.

### Layer 5: schema — declares `user_id` as a non-null FK

`db/schema.py` declares `user_id` on every tenant-owned table:

```python
Column("user_id", Integer, ForeignKey("users.id"), nullable=False, default=1),
```

The `default=1` is a backstop that matches `local_user`'s id under
`ALLOW_PASSWORDLESS_LOGIN`. New rows inserted by application code
explicitly supply `user_id`; the default is a safety net for any
code path that omits it (and a backfill convenience for migrations).

For the `documents` table, tenancy is more invasive: the primary
key changed from `(key)` to `(key, user_id)` so that two users can
independently store data under the same key without collision.
This is item 23's distinguishing decision; see its docstring.

## Defense in depth: recursive CTE filtering

The lineage and stats CTEs walk parent-child relations recursively.
A naive single-point filter — applied only at the CTE's entry point
— is insufficient if any historical row has crossed a tenant
boundary (which item 14 prevents for new writes, but old data may
have it). The recursive step could traverse from a user-owned root
into someone else's descendants.

**The pattern**: filter at the base case AND at the recursive step.
Both `_recursive_descent_cte` (lineage) and the `root_mapping` CTE
(stats) join `card` and apply `card.user_id = :user_id` in both
positions:

```python
# Base case: only this user's roots start a CTE walk.
.select_from(card_source.join(card, ...))
.where(base_predicate)
.where(card.c.user_id == user_id)
.cte(recursive=True)

# Recursive step: only this user's descendants are picked up.
.select_from(card_source.join(base, ...).join(cs_card, ...))
.where(cs_card.c.user_id == user_id)
```

Belt-and-braces. The cost is one extra join per recursion level —
microseconds at hobby scale, planner-optimized in practice.

## The auth boundary: `ALLOW_PASSWORDLESS_LOGIN`

A configuration flag in `core/config.py`. Two operating modes:

**`ALLOW_PASSWORDLESS_LOGIN=True` (default)**: the auth route
auto-provisions a `local_user` row on first request to an empty
users table, and issues a JWT for that user without requiring a
password. This is the local-install scenario — one user per
machine, no friction.

**`ALLOW_PASSWORDLESS_LOGIN=False` (multi-tenant deployments)**:
operators provision real accounts; users authenticate with
username + bcrypt-hashed password. The tenancy spine is identical;
only the auth flow differs.

The flag affects:
- `auth/token` endpoint: rejects passwordless requests when off.
- The auto-provision logic on first-startup.
- Nothing else. Every tenant-scoped read and write filters on
  user_id regardless of the flag.

For default installs, `local_user` has id=1, all data lives under
user_id=1, and behavior is indistinguishable from a pre-tenancy
single-user system. The tenancy spine is dormant but correct.

## The architectural seam: where tenancy meets the rest

The five-layer split (route, service, Port, adapter, schema) gives
tenancy a single threading axis. Adding a new tenant-scoped
endpoint follows a fixed recipe:

1. Schema: add `user_id` to the new table (or confirm it exists).
2. Adapter: WHERE clause filters on `user_id`.
3. Port: method signature takes `*, user_id: UserId`.
4. Service: forwards `user_id` from its parameter.
5. Route: captures `user_id: UserId = Depends(get_current_user_id)`
   and forwards.

Skipping any layer breaks the boundary. The discipline is
mechanical, but it's a discipline — there's no compile-time check
that a new endpoint is tenancy-correct. Code review enforces it.

For the four ADR-0003 bands of domain coupling, tenancy is **Band
1** (truly domain-agnostic): nothing about cards, lineages, tags,
or game sources is Go-specific in how they get filtered. A Chess
adopter would inherit the entire tenancy spine without modification.

## Operator pre-flight: going multi-tenant

When deploying for multiple users, the operator must:

1. **Provision real user accounts.** The `users` table needs rows
   beyond `local_user`. There is no admin UI yet; provision via
   direct SQL or a one-shot script.

2. **Set `ALLOW_PASSWORDLESS_LOGIN=False`.** Otherwise anyone who
   hits an empty token endpoint gets auto-logged-in.

3. **Set `SECRET_KEY` to a real secret.** The auto-generated
   `.ebisu_secret_key` is fine for a dev install; a public-facing
   deployment should set the env var explicitly and avoid relying
   on the file fallback.

4. **Configure CORS and origins.** `CORS_ALLOW_ORIGINS` should
   list the actual frontend deployment URL(s); `*` is a sensible
   dev default but inappropriate for production.

5. **Run all schema migrations.** A pre-tenancy database needs
   34a, 34b (Commit 1 and Commit 3), 23, and 24 applied in order
   before the application boots cleanly. The migrations are
   idempotent — safe to re-run.

6. **Verify the tenancy boundary.** Provision a second user. From
   that user's token, attempt to access user 1's resources via
   guessed ids — `GET /cards/1`, `POST /cards/1/review`, `POST
   /cards/` with `parent_card_id=1`. All should return 404.

The provisioning gap (no admin UI) is deliberate: the system
doesn't yet have user-management routes because no deployment has
required them. When a real multi-tenant deployment lands, that's
when the routes get written. Pre-extraction would shape against
speculation rather than need (ADR-0003's principle, applied to
auth).

## Limits and worth-revisiting

Honest documentation of what the spine doesn't yet do.

**No row-level audit log.** The system records `user_id` on every
row but doesn't track *which* user made *which* change to *which*
row over time. For a two-user-Alice-and-Bob install this is fine;
for any compliance-flavored deployment it would need an audit
table. Adding one is non-trivial — every mutating service method
gains a "who's calling and from which session" handle, with the
audit write happening alongside the data write in the same
transaction.

**No tenant deletion.** Removing a user means cascade-deleting
their cards, documents, and game_sources. The schema has
`ON DELETE CASCADE` on `card_source.card_id` and `card_tag.card_id`,
but no script exists to do the user-level cascade safely. This is
deferrable until a user actually wants to leave; building it
ahead of time would shape against speculation.

**`game_source.user_id` is defense-in-depth, not load-bearing.**
Existing read paths reach `game_source` via the `card_source ⋈
card` chain, which already filters on `card.user_id`. The new
column matters for writes (stamping the creator) and as
availability for any future direct-on-`game_source` query, but no
production query path strictly requires it today. If item 24 had
been omitted entirely, the system would still be tenancy-correct
on reads. The column was added for forward-compatibility and to
match the codebase's "every tenant-owned table has user_id" rule.

**The `dsl_validator.py` shim.** The validator script uses
`UserId(1)` as a constant because it runs against a known
single-tenant fixture. If validators ever need to exercise
multi-tenant data shape, they'll need a way to inject a tenant
identity per test scenario — a small Port-fake refactor, not a
big change.

**No rate limiting per tenant.** The system trusts JWT-bearing
clients to behave. A misbehaving (or compromised) tenant could
exhaust resources without the system pushing back. Out of scope
for the current spine; a separate concern that deserves its own
treatment when the deployment shape demands it.

**The `documents` key namespace is now per-tenant but the keys
themselves still carry the legacy `user_workspace_*` prefix from
the frontend's pre-tenancy convention.** It's harmless — the
prefix is a no-op string per row — but it's vestigial. A future
cleanup can strip the prefix on both sides; not part of any
shipped item.

## Why this shape: a brief tour

The spine could have looked very different. Three alternatives
considered and rejected, in case anyone wonders why we didn't go
that way:

**Row-level security in Postgres (RLS).** An attractive option for
Postgres-only deployments: declare the policy once in DDL, the
database enforces it on every query without application code
having to know. Rejected because the codebase targets both SQLite
and Postgres, and SQLite has no equivalent. Building RLS for
Postgres-only installs and a parallel application-level filter for
SQLite would mean two codepaths for the same invariant — a recipe
for them to drift.

**A repository wrapper that injects `user_id` automatically.** The
service would hold a `TenantBoundCardRepository` constructed with a
`user_id` at request time; every method on the inner Port would
have `user_id` injected from the wrapper rather than passed
explicitly. Rejected because it hides the parameter at exactly the
sites where it should be visible (the Port methods, where the
filter actually applies). The discipline of "every Port method
takes user_id keyword-only" is a feature, not a tax — it makes
tenant-scope auditable by reading the Port file alone.

**Tenant ids on resources but no enforcement at read time.** The
schema would have `user_id` columns; the application would stamp
them on writes; reads would not filter. A "soft tenancy" model
where the server trusts clients to only request their own
resources. Rejected for the obvious reason that the architecture
should not trust the network. ADR-0002's fail-loudly tenet
applies: if the server CAN enforce a privacy invariant in code,
it MUST.

The shape we chose — explicit Port parameters, predicate-fusion
in WHERE clauses, defense-in-depth in recursive CTEs — is the
result of following the existing architectural seams (the Port
boundary from items 21f and 32a) rather than overlaying a new
mechanism. It costs more typing than RLS would, but it composes
with the rest of the codebase the same way every other concern
composes: through the Port.

## Related

- **handoff-current.md** — describes the system at the close of the
  pre-release infrastructure sweep. The tenancy section there
  enumerates the items in the spine; this document explains the
  shape they collectively produce.
- **ADR-0001** (state mutation): the same "honest types over
  aspirational annotations" principle led to UserId being a real
  branded type rather than a comment-as-type.
- **ADR-0002** (fail loudly): the 404-not-403 invariant is a
  direct application — the system fails loud (refuses the
  request) rather than silently coercing a 200 with empty data.
- **ADR-0003** (frontend portability): the tenancy spine is
  domain-agnostic; a Chess port inherits it unchanged.
- **ADR-0004** (minimal-touch edits): repeatedly-applied
  discipline during the spine's implementation, especially when
  threading `user_id` through code paths where multiple files
  needed coordinated changes.
- **`scripts/migrate_*.py`** — the schema migrations. Idempotent;
  dialect-aware (SQLite + Postgres); see each script's docstring.
