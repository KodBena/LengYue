# Game-source dedup — Backend → Frontend Status

- **Date:** 2026-05-06
- **From:** backend (game-source-dedup implementation session,
  2026-05-06)
- **To:** frontend (the dispatch's intended recipient)
- **Type:** status — closes the backend half of the dedup arc
- **Status:** open at the frontend's end; backend half is shipped
  pending merge

Reply to:
`docs/dispatch/frontend-to-backend-game-source-dedup.md`.

## TL;DR

Wire shape signed off as proposed. Backend half lands a single
additive migration, a sibling Port method
`get_or_create_game_source_by_client_id`, the corresponding
adapter implementation with INFO-level got-vs-created logging,
and a one-`if` branch in `CardService.create_card` step 4.
Existing legacy callers (no `client_game_id` in the request) keep
their always-create behavior unchanged.

When you ship the consumer-side PR, regenerate `src/types/backend.ts`
via `npm run gen:api` to pick up the new optional
`client_game_id: UUID` field on the `GameSourceCreate` request shape.

## What ships

| File | Change |
|---|---|
| `backend/scripts/migrate_add_client_game_id_to_game_source.py` | New. Adds nullable `client_game_id` column + partial unique index on `(user_id, client_game_id) WHERE client_game_id IS NOT NULL`. Idempotent; SQLite + Postgres branches. |
| `backend/db/schema.py` | `client_game_id` column added to `game_source`; partial unique `Index` declared via SQLAlchemy's `sqlite_where` / `postgresql_where` kwargs. Per-table docstring updated. |
| `backend/schemas/card.py` | `GameSourceCreate.client_game_id: Optional[UUID] = None` field added. Docstring carries the dedup contract and first-mint-wins semantic. |
| `backend/repositories/ports.py` | New sibling Port method `get_or_create_game_source_by_client_id` on `CardWriteRepositoryPort` with full docstring (semantic, first-mint-wins, race-window posture). `insert_game_source`'s docstring notes the dispatch path. |
| `backend/repositories/card_repository.py` | New method's adapter implementation: SELECT by `(user_id, client_game_id)`, return existing id or fall through to INSERT. INFO-level log line in both branches. |
| `backend/services/card_service.py` | Step 4 branches on `data.game_metadata.client_game_id`: dispatches to the get-or-create method when set, falls through to `insert_game_source` when not. Docstring updated. |

The integration smoke (in-process `CardRepository`, fresh SQLite DB)
verifies four invariants:

- Same `(user_id, client_game_id)` → second call returns the first
  call's id; second call's metadata is ignored (first-mint-wins).
- Different tenant, same UUID → distinct rows. Tenancy boundary
  honored.
- Two `insert_game_source` calls (NULL `client_game_id`) → two rows.
  Legacy callers unaffected.
- Raw INSERT bypassing the SELECT-then-INSERT path with a colliding
  `(user_id, client_game_id)` → `IntegrityError` from the partial
  unique index. The race window has database-level honesty.

## Migration command

Existing installs (single SQLite file or Postgres) run:

```bash
python backend/scripts/migrate_add_client_game_id_to_game_source.py
```

Idempotent — safe to re-run. Reads `DATABASE_URI` from `core.config`,
the same as items 23/24.

## Answers to the four open questions

### Q1 — Port shape: sibling method (not new parameter)

A new sibling method `get_or_create_game_source_by_client_id` on
`CardWriteRepositoryPort` rather than overloading `insert_game_source`
with an optional `client_game_id` kwarg.

Reasoning:

- Method-name honesty (ADR-0002 spirit applied to the Port surface).
  A method named `insert_*` should insert. An overloaded
  "sometimes inserts, sometimes selects, depending on a kwarg" Port
  contract makes the name a discriminator that a reader has to chase
  through the docstring.
- The codebase already has the precedent: `get_or_create_position`
  is a separately-named Port method, not an overloaded `insert_*`.
- Service-layer dispatch is one well-named `if` block — the same
  pattern the rest of the tenancy spine uses for any branch where
  the call shape itself differs.
- Adapter ends up implementing both methods either way; the cost
  is identical at the SQL layer.

### Q2 — DB enforcement: partial unique index

The schema declares the unique constraint at the database level:

```python
Index(
    "uniq_game_source_user_client_game_id",
    game_source.c.user_id,
    game_source.c.client_game_id,
    unique=True,
    sqlite_where=game_source.c.client_game_id.isnot(None),
    postgresql_where=game_source.c.client_game_id.isnot(None),
)
```

Both SQLite (3.8.0+, 2013) and Postgres (always) support
`CREATE UNIQUE INDEX ... WHERE ...`. The codebase's general posture
of pushing invariants to the schema where the schema can carry them
([the `users.username` / `tag.name` / `card_source.card_id`
precedents](db/schema.py)) extends here naturally.

The `get_or_create_game_source_by_client_id` adapter does
SELECT-then-INSERT (no upsert). The partial unique index is
belt-and-braces against the race window the SELECT-then-INSERT
admits — same posture as `get_or_create_position`. We don't add
explicit retry logic; the IntegrityError surfaces as a 500, which
is honest about the rare race rather than silently coercing it
(ADR-0002).

### Q3 — Validation: Pydantic's `UUID` type is sufficient

`client_game_id: Optional[UUID] = None` is the wire-side declaration.
Pydantic v2's `UUID` rejects malformed strings cleanly (length,
character set, RFC 4122 format) and accepts versions 1–5. We don't
constrain to v4 specifically:

- It would reject deterministic v3 / v5 UUIDs that future test
  fixtures or `make_sample_db.py` enrichment might want for
  reproducibility.
- The frontend's `crypto.randomUUID()` emits v4 already, so the
  constraint would be inert against the actual production caller.
- Treating `client_game_id` as opaque (no introspection of the bits)
  matches the dispatch's own framing of the field.

### Q4 — Observability: yes, INFO-level got-vs-created log

Both branches of `get_or_create_game_source_by_client_id` emit:

```
game_source dedup: got existing row id=<gid> user_id=<uid> client_game_id=<uuid>
game_source dedup: created row id=<gid> user_id=<uid> client_game_id=<uuid>
```

at INFO level. Cheap, matches the project's "loud filterable
observability" posture (per `docs/handoff-current.md`'s ops notes),
and lets the operator verify dedup is firing on
second-and-subsequent mints during rollout. Removable in a
follow-up commit once dedup is validated; until then it's a useful
sanity check.

## Behavioral notes

### First-mint-wins metadata

When `client_game_id` matches an existing row, the existing row's
`player_white` / `player_black` / `description` / `position_id` /
`raw_content` are preserved. The incoming values on the second mint
are ignored.

This is the documented intent in the dispatch and matches user
behavior: editing SGF root properties between mints from one board
shouldn't retroactively rewrite the recorded game name or players.
If a user actually wants to refresh the metadata, they reload the
SGF (which the frontend will mint with a fresh `clientGameId` per
the consumer-side plan) — different game grouping, different
metadata, expected.

### Tenancy and the partial unique index

The unique index is `(user_id, client_game_id)`, not just
`(client_game_id)`. Two users that somehow generated the same UUID
(astronomically improbable for v4, but possible for deterministic
test fixtures across tenants) get isolated rows. The SELECT-side
predicate fuses both columns — same WHERE-clause-fusion pattern as
the rest of the tenancy spine, so the
`docs/notes/tenancy.md::404-not-403` invariant is preserved (a
`client_game_id` from another tenant is invisible from the caller's
SELECT, and an INSERT under that pair succeeds because the partial
unique index is per-tenant).

### Legacy callers

`insert_game_source` is unchanged on the wire. Any call without
`client_game_id` in the `GameSourceCreate` blob produces a row with
`client_game_id IS NULL`, which the partial unique index ignores.
`curl` users, test fixtures, and any pre-rollout frontend traffic
keep working with the historical always-create semantic.

## What's NOT in scope

- **No retroactive grouping of historical rows.** Pre-rollout
  game_source rows have `client_game_id IS NULL` and remain isolated.
  Inventing a grouping key (content-hash or raw_content-hash)
  would re-introduce the false-collision modes the dispatch
  rejected up front.
- **No upsert on the adapter side.** The race window is
  documented; the IntegrityError path is acceptable. If concurrent
  multi-tab ingestion ever becomes a workload, the adapter can grow
  a dialect-specific upsert branch (Postgres `ON CONFLICT`,
  SQLite `INSERT ... ON CONFLICT DO NOTHING`).
- **No new endpoint.** `POST /cards/` is the only consumer; the
  dedup is internal to the create-card flow.
- **No tenancy doc changes.** The dedup composes within the
  existing five-layer threading discipline; nothing about the
  spine itself moved. `docs/notes/tenancy.md` stays as-is.

## Definition of done

- [x] Wire shape acknowledged.
- [x] Backend ships migration + Port + adapter + service branch.
- [x] Status dispatch filed (this document).
- [ ] Backend PR merged. Merge SHA: `<filled when PR lands>`.
- [ ] Frontend ships consumer-side PR (BoardState clientGameId,
      useMinting wiring, description ladder, frontend schema
      migration). Owned by frontend.

The frontend half is queued at the dispatch's authoring; nothing
on the backend's side blocks it from picking up
`npm run gen:api` and shipping once this PR lands.

## License

Public Domain (The Unlicense).
