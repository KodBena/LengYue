# Analysis persistence — Backend → Frontend Status

- **Date:** 2026-05-07
- **From:** backend (analysis-persistence design-response session,
  2026-05-07; cross-cutting branch `cross/analysis-persistence`)
- **To:** frontend (the dispatch's intended recipient)
- **Type:** status — wire/table/codec acknowledgement plus answers
  to the six open questions, ahead of backend implementation
- **Status:** open at the frontend's end; wire shape acknowledged,
  backend implementation pending. This file will be updated with
  merge SHAs once the implementation PR(s) land.

Reply to:
`docs/dispatch/frontend-to-backend-analysis-persistence.md`.

## TL;DR

Wire shape, table shape, and codec envelope are acknowledged as
proposed, with two small corrections and six concrete answers. We
plan to ship a single coordinated PR on `cross/analysis-persistence`
covering migration + schema + new Port + adapter (with codec
dispatch) + service + route + Pydantic schemas + DI wiring. After
that lands, the frontend half ships the consumer side from the
same branch (settings, service, ACL, UI, `closeBoard` augmentation,
plan-note rewrite).

The two corrections worth catching before code lands:

1. **Path prefix.** The dispatch sketches
   `/api/v1/analysis-bundles/{board_id}`. The codebase has no
   `/api/v1` prefix — all existing routers mount flat (`/auth`,
   `/cards`, `/documents`, `/lineage`, `/forests`, `/qeubo`,
   `/resources`, `/stats`). The dispatch hedged on this; we'll
   ship as `/analysis-bundles/{board_id}` to match convention.
2. **`board_id` column type.** The dispatch describes BoardId as
   "branded string, `crypto.randomUUID()` at board-creation time."
   The codebase already has precedent — `game_source.client_game_id`
   uses SQLAlchemy `Uuid` (Postgres `UUID`, dialect-mapped on
   SQLite) — so using `Uuid` here tightens validation and matches
   the existing pattern. If the frontend ever needs BoardId to
   escape UUID-shape, that's a coordinated migration; for now
   `Uuid` is the right column. Flag if you foresee a non-UUID
   BoardId.

## Answers to the six open questions

### Q1 — Storage column type: `LargeBinary` (BLOB / BYTEA)

Agree with the dispatch. `LargeBinary` is the SQLAlchemy column
type — `BYTEA` on Postgres, `BLOB` on SQLite — and the codebase
already uses it for `normalized_position.content_hash`. Base64-text
buys nothing operationally; `pg_dump` and the SQLite shell handle
binary columns natively. No reason to deviate.

### Q2 — Initial write-scheme: `json+gzip`, with `json` also decoded

Agree with your lean. Concretely: ship the codec dispatch table
with **two** decoders (`json`, `json+gzip`) and one writer
(`json+gzip`). `gzip` is stdlib — no new dependency — and
~5–8× ratio on JSON-shaped data is a free win. Adding `json+zstd`
later is purely additive: a new entry in the dispatch table, a
new opt-in `requirements.txt` line for the `zstandard` package
(or stdlib `compression.zstd` on Python 3.14+), one config-flag
flip on the write side. Old `json+gzip` rows remain readable
forever.

The write-scheme is a single config knob in `core/config.py`:

```python
ANALYSIS_PERSISTENCE_WRITE_SCHEME: str = "json+gzip"
```

A re-pack migration script (matching the existing
`scripts/migrate_*.py` pattern — idempotent, dialect-aware) can
sweep older-scheme rows to a newer scheme when an operator
chooses, with no client involvement. We'll ship the re-pack
script alongside the first scheme upgrade, not pre-emptively.

### Q3 — Per-user quota: yes, with 413 and atomic check

Agree. Default `ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES = 2 * 1024 *
1024 * 1024` (2 GB), env-overridable. The check runs in the same
transaction as the upsert:

```
new_total = (SUM(byte_size) for this user)
          - (existing row's byte_size, if any)
          + new_byte_size
if new_total > QUOTA: 413 before INSERT/UPDATE
```

Atomic by virtue of the surrounding transaction; no race window.
Response shape on 413 carries `{detail, currentBytes, quotaBytes}`
so the frontend can render "Storage limit reached — using X of Y
GB; delete an older bundle to save this one." 413 is the slow-path
safety net; the frontend's pre-save preview is the primary UX.

### Q4 — Per-bundle cap: yes, on the request body

Agree. Default `ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES = 100 * 1024
* 1024` (100 MB), env-overridable. The check runs against the
**request body length** (pre-transcoding JSON), since that's what
the frontend's pre-save preview predicts and what bounds
server-side memory during transcoding. A 100 MB JSON body
serializes through gzip to ~10–20 MB on disk; the per-user quota
in Q3 is what actually bounds long-term storage growth.

### Q5 — Validation depth: opaque, with schemaVersion gate

Agree with frontend's posture: `record.packet` is opaque storage,
not validated. The frontend's ACL boundary owns KataGo wire-shape
honesty (per ADR-0002's "ACL boundaries validate rather than
coerce" applied at the side that owns the contract). We get
"valid JSON" for free as part of FastAPI/Pydantic body parsing.

One small addition: **`schemaVersion` is gated.** A bundle whose
`schemaVersion` isn't in the backend's known set (today: `{1}`)
returns 422 with structured detail. This is the v2-forward-compat
hook — when v2 bundles ship, the backend declares which
schemaVersions it accepts and the gate updates. Silent acceptance
of unknown schemaVersions would let a v2-aware frontend write
bundles a v1 backend then mis-projects on read; the gate
prevents that.

### Q6 — Repository Port: new `AnalysisBundleRepositoryPort`

New Port. The existing five Ports are domain-coupled (Card,
Lineage, Stats, Tag, Resource); analysis bundles are a new
resource type with its own lifecycle. The Port has four methods,
all with `*, user_id: UserId` keyword-only:

```python
class AnalysisBundleRepositoryPort(Protocol):
    async def upsert(
        self, *, board_id: UUID, user_id: UserId,
        bundle: AnalysisBundle,
    ) -> AnalysisBundleStored: ...

    async def get(
        self, *, board_id: UUID, user_id: UserId,
    ) -> Optional[AnalysisBundle]: ...

    async def delete(
        self, *, board_id: UUID, user_id: UserId,
    ) -> None: ...  # idempotent

    async def list_summaries(
        self, *, user_id: UserId,
    ) -> List[AnalysisBundleSummary]: ...
```

Domain DTOs live in `domain/analysis_bundle.py` (Pydantic v2,
`frozen=True`). The codec dispatch — `_encode(bundle, scheme) ->
bytes`, `_decode(scheme, payload) -> bundle` — lives inside the
adapter (`repositories/analysis_bundle_repository.py`); it's
infrastructure, not domain. The Port returns the bundle; the
adapter handles encoding. This keeps domain SQLAlchemy-free and
codec-free.

The `upsert` return shape (`AnalysisBundleStored`) carries
`{board_id, record_count, stored_scheme, stored_byte_size,
updated_at}` — directly serializable into the dispatch's
`AnalysisBundleWriteResponse` wire shape.

## Planned implementation (single PR)

| File | Change |
|---|---|
| `backend/scripts/migrate_create_analysis_bundles.py` | New. Idempotent CREATE TABLE / CREATE INDEX. SQLite + Postgres branches. |
| `backend/db/schema.py` | New `analysis_bundles` table; composite PK `(user_id, board_id)`; `Uuid` column for `board_id`; `LargeBinary` for `payload`. |
| `backend/domain/analysis_bundle.py` | New module. `AnalysisBundle`, `AnalysisBundleRecord`, `AnalysisBundleSummary`, `AnalysisBundleStored` — all `frozen=True`. |
| `backend/repositories/ports.py` | New `AnalysisBundleRepositoryPort` Protocol. |
| `backend/repositories/analysis_bundle_repository.py` | New adapter. SQLAlchemy SELECT-then-conditional-INSERT-or-UPDATE for upsert (matches `documents.py`'s dialect-agnostic pattern); codec dispatch table; quota check inside the upsert transaction. |
| `backend/services/analysis_bundle_service.py` | New use case. Per-bundle cap check (request size); orchestrates the Port. Thin — most logic is in the adapter (codec, quota) since it's infrastructure. |
| `backend/api/routes/analysis_bundles.py` | New router. `PUT/GET/DELETE /analysis-bundles/{board_id}` and `GET /analysis-bundles`. Pydantic request/response schemas declared inline (the auth/me precedent — extract to `schemas/` if a second consumer appears). |
| `backend/api/dependencies.py` | New factories: `get_analysis_bundle_repo`, `get_analysis_bundle_service`. |
| `backend/main.py` | `app.include_router(analysis_bundles.router)`. |
| `backend/core/config.py` | Three new settings: `ANALYSIS_PERSISTENCE_WRITE_SCHEME`, `ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES`, `ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES`. |

Tenancy spine threads through unchanged: route captures
`user_id: UserId = Depends(get_current_user_id)`; service forwards
keyword-only; Port declares `*, user_id`; adapter fuses
`user_id == :user_id` into the WHERE clause for every read and
write. The composite PK `(user_id, board_id)` is the
tenant-isolation enforcement at the DB level — two users with
the same UUID (astronomically unlikely, but the schema enforces
it anyway) get distinct rows. 404-not-403 invariant on `GET` and
`DELETE` follows from the WHERE-clause fusion.

## Migration command

Once shipped, existing installs run:

```bash
python backend/scripts/migrate_create_analysis_bundles.py
```

Idempotent. Reads `DATABASE_URI` from `core.config`. Fresh
installs pick the table up via `metadata.create_all` in
`main.py::lifespan` automatically.

## OpenAPI

The new wire shapes appear in OpenAPI diff once the route lands.
`npm run gen:api` on the frontend picks them up; the consumer-side
PR that lands the service / ACL / UI / `closeBoard` cleanup
references the regenerated types.

## Reply

If the two corrections (path prefix, `Uuid` column) and the six
answers are acceptable, the backend half ships next. If anything
needs revision — different codec scheme set for v1, different
quota/cap defaults, a `String` column preference for `board_id`,
or anything else — say so on this dispatch before code lands.

Once the backend half merges, this dispatch updates with the
merge SHA and the frontend half (settings, service, ACL, UI,
`closeBoard` augmentation, `analysis-persistence-plan.md`
rewrite) lands from the same branch.

## License

Public Domain (The Unlicense).
