# Analysis Persistence — System Note

- **Status:** Backend half shipped on `cross/analysis-persistence`
  (this commit). Frontend precursor BoardId-to-UUID migration
  shipped on the same branch (b0b0e74). Frontend consumer-side
  (settings, service, ACL, UI surface, `closeBoard` augmentation)
  is queued behind the backend half merging to main and the
  frontend's `npm run gen:api` picking up the new wire shapes.
- **Genre:** System note — descriptive documentation of how
  analysis-persistence works in the codebase. Not the design
  negotiation record (that's the dispatch chain at
  `docs/archive/dispatch/frontend-to-backend-analysis-persistence.md`,
  `docs/archive/dispatch/backend-to-frontend-analysis-persistence-status.md`,
  and `docs/archive/dispatch/frontend-to-backend-analysis-persistence-status.md`).
- **Date:** 2026-05-07.
- **Scope:** Both `frontend/` and `backend/`. The cross-cutting
  arc landed on the `cross/analysis-persistence` branch.

## What this document is

A working contributor's mental model of analysis persistence:
the wire shape, the storage row, the codec envelope, the two
caps, and how the discipline composes with the rest of the
codebase (tenancy spine, ADR-0002 fail-loudly, the Port
architecture). The dispatch chain is the canonical record of
the negotiation; this note picks up where it leaves off and
describes what's there.

## Motivation

KataGo analyses cost electricity (real money). Today, all
analyses are held in an in-memory `AnalysisLedger` and lost
when the user closes the browser. A user who reviews 30 games
and analyzes every move pays the compute cost every time they
reopen those games. The feature stores analyses server-side so
subsequent sessions reuse the prior compute work.

## The shape

**Manual + batched, per-`BoardId` bundle.** The user clicks
"Save analyses" on a board to upload; the backend stores one
bundle per `(user_id, board_id)`; reopening the board hydrates
records back into the ledger. The board is the lifecycle anchor:
created on first save, replaced on re-save, deleted on board
close.

A bundle is the flat ledger projection over a board's nodes —
a list of `(config_hash, node_id, packet)` records. Not a tree,
not a sequence; a flat dict. The frontend's
`projectLedgerToBundle(boardId)` (in
`frontend/src/services/analysis-bundle.ts`, shipped in 650c668)
collects every record the ledger holds for the board's nodes.

**Why manual + batched and not streaming-on-packet-arrival?**
Two pressures resolved here:

1. **UI-state snappiness.** `SyncService` debounces document-blob
   writes at ~1s and the user notices nothing. Adding a streaming
   analysis-persistence channel that fires per final packet
   introduces a second concurrent persistence flow on the same
   network path; the worst-case bundle of "30 tabs × 200 moves
   × 48 KB" is in the multi-hundred-MB range and the user should
   opt into that explicitly.
2. **Compression wants a corpus.** Per-record uploads foreclose
   delta encoding. Per-board batching opens the door — every
   record in a bundle has its sibling positions on the same board
   to delta against. Forward-looking codecs (cross-board,
   dictionary-shared) want even more scope; the wire shape mustn't
   lock that out.

The `isDuringSearch === false` validation question that blocked
the original streaming design is dissolved here: under manual +
batched, the trigger is a user click, and the watermark
interpretation of `AnalysisLedger.mergeAnalysisPacket` means
every stored packet is already the strongest seen for its
`(config_hash, node_id)`.

## The storage row

```python
analysis_bundles = Table(
    "analysis_bundles", metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True, default=1),
    Column("board_id", Uuid, primary_key=True),
    Column("scheme", String, nullable=False),
    Column("payload", LargeBinary, nullable=False),
    Column("record_count", Integer, nullable=False),
    Column("byte_size", Integer, nullable=False),
    Column("updated_at", DateTime(timezone=True),
           server_default=func.now(), onupdate=func.now(), nullable=False),
)
```

(See `backend/db/schema.py`.)

- **`(user_id, board_id)` composite PK.** Database-level
  tenant isolation; two users with the same UUID get distinct
  rows. The frontend's RFC4122 v4 UUIDs make collision
  astronomically unlikely, but the schema enforces it anyway.
- **`scheme`** is the codec tag — see "The codec envelope"
  below.
- **`payload`** is opaque bytes (`LargeBinary` = Postgres
  `BYTEA` / SQLite `BLOB`). The frontend never sees the stored
  bytes; the backend transcodes on read and write.
- **`record_count`** and **`byte_size`** are denormalized for
  cheap per-user storage reporting (`GET /analysis-bundles`)
  and for the per-user quota check inside the upsert
  transaction. `byte_size` is the post-transcoding size — the
  same value the frontend's storage panel sums to display
  "X of 2 GB used".

Migration: `backend/scripts/migrate_create_analysis_bundles.py`.
Idempotent (uses SQLAlchemy's
`analysis_bundles.create(checkfirst=True)`, which generates the
dialect-appropriate CREATE TABLE).

## The endpoints

Four routes, all under `/analysis-bundles`:

```
PUT    /analysis-bundles/{board_id}    upsert
GET    /analysis-bundles/{board_id}    fetch (404 on miss)
DELETE /analysis-bundles/{board_id}    idempotent delete (204)
GET    /analysis-bundles               list summaries (no payloads)
```

(See `backend/api/routes/analysis_bundles.py`.)

The PUT request body is a canonical-JSON `AnalysisBundle`
(`schema_version: Literal[1]`, `records: List[Record]`); the GET
returns the same shape after decoding the stored payload.
DELETE always returns 204; cross-tenant deletes are silent
no-ops (the WHERE clause's `user_id` filter ensures
zero-rows-affected for someone else's `board_id`). The list
endpoint returns metadata-only summaries — the frontend's
storage panel uses it to render quota usage without forcing
per-bundle decodes.

## The codec envelope

The `scheme` column is the load-bearing flexibility. The
adapter (`backend/repositories/analysis_bundle_repository.py`)
holds a dispatch table:

```python
_ENCODERS: Dict[str, Callable[[dict], bytes]] = {
    "json": _encode_json,
    "json+gzip": _encode_json_gzip,
}

_DECODERS: Dict[str, Callable[[bytes], dict]] = {
    "json": _decode_json,
    "json+gzip": _decode_json_gzip,
}
```

The current write scheme is read from
`config.ANALYSIS_PERSISTENCE_WRITE_SCHEME` (default
`"json+gzip"`). On read, the adapter dispatches by the row's
stored `scheme` value — old rows with older schemes remain
readable forever.

**Adding a new scheme:**

1. Define `_encode_<name>` / `_decode_<name>` in
   `analysis_bundle_repository.py`.
2. Add them to the corresponding dispatch tables.
3. Optionally flip `ANALYSIS_PERSISTENCE_WRITE_SCHEME` to the
   new tag so newly-written rows use it.
4. (Optional) Ship a re-pack migration script to sweep older-
   scheme rows to the new scheme. Existing migrations in
   `backend/scripts/` are the pattern; idempotent, dialect-aware.

If a stored row carries a `scheme` value the dispatcher doesn't
recognise on read, `UnknownSchemeError(scheme)` propagates to a
structured 500 response (per ADR-0002 — silent garbage on read
would let the user believe analyses hydrated when they hadn't;
Confirmation C2 in the dispatch).

A note on cross-row codecs: when a future `scheme` references
shared state (e.g., `corpus-zstd-dict-vN` referencing a row in
some `zstd_dictionaries` table), DELETE semantics need either
refcount tracking or a "dictionaries are immutable" rule. v1
explicitly does not design this; the door is open, the lock is
a v2 concern when the simpler schemes hit a ceiling.

## The two caps

Two distinct caps with two distinct enforcement points:

| Cap | Default | Where enforced | Failure mode |
|---|---|---|---|
| `ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES` | 100 MB | `AnalysisBundleService.upsert` (request body length) | `BundleTooLargeError` → 413 with `{kind: "bundle_too_large", ...}` |
| `ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES` | 2 GB | `AnalysisBundleRepository.upsert` (post-transcoding sum, atomic with the upsert) | `UserQuotaExceededError` → 413 with `{kind: "user_quota_exceeded", ...}` |

The per-bundle cap bounds memory and parse cost per request.
The per-user quota bounds long-term storage growth per tenant.
Both 413 bodies carry a `kind` discriminator (Confirmation C1
in the dispatch) so the frontend ACL dispatches by tag, not by
field-presence.

The per-user quota check is atomic with the upsert: SUM the
caller's existing `byte_size`, subtract any row being replaced,
add the new transcoded size. If the result exceeds the quota,
no row is written. Realistic per-user cardinality is small
(~tens of bundles), so the SUM is cheap; the whole computation
runs inside the route's transaction.

## Tenancy

Strict per-`user_id` filter on every read path; per-`user_id`
authorization on every write/delete; same posture as the rest
of the tenancy spine (`docs/notes/tenancy.md`). The composite
PK enforces collision isolation at the DB level. A would-be
cross-tenant access (GET, DELETE, or PUT against someone else's
`board_id`) is indistinguishable from access to a non-existent
bundle: 404 on GET, 204 on DELETE, separate-row creation on
PUT (since the composite PK is `(other_user, same_board)`).

## What the frontend does (briefly)

The frontend's projection/replay skeleton is at
`frontend/src/services/analysis-bundle.ts` (commit 650c668):

- `projectLedgerToBundle(boardId)` — collect every
  `(config_hash, node_id, packet)` the ledger holds for the
  board's nodes into a flat `AnalysisBundle`. One-shot snapshot,
  non-reactive.
- `replayBundleIntoLedger(bundle)` — each record becomes one
  `ledger.record()` call; `mergeAnalysisPacket` preserves
  higher-visit packets if a fresher record was already in
  flight.

The consumer side (the service module that calls PUT/GET/DELETE,
the ACL, the UI, the `closeBoard` augmentation) is queued behind
the backend half merging to main. The dispatch's "Coordination
on `cross/analysis-persistence`" section names the sequencing.

## Forward-compat hooks

Two extension points are deliberately left open in v1:

- **`schema_version`.** The Pydantic `Literal[1]` gate rejects
  unknown versions at the route boundary (422 with structured
  detail). Future v2 bundles add fields to records without a DB
  migration; the backend gates which versions it accepts.
- **`scheme` tag.** New codecs slot into the dispatch tables
  without disturbing existing rows. Old rows remain readable
  forever; the operator can re-pack when convenient.

A third, deliberately not-yet-implemented hook: `model_version`
on records. The frontend may eventually want to discriminate
analyses by which KataGo neural-net weights produced them. The
record shape is opaque to the backend, so adding the field is a
frontend-only bundle-version bump (no DB migration). The
dispatch's "Forward-compatibility note on records" documents
this explicitly.

## Related

- `docs/archive/dispatch/frontend-to-backend-analysis-persistence.md` —
  the original wire-shape proposal.
- `docs/archive/dispatch/backend-to-frontend-analysis-persistence-status.md` —
  backend's wire/table/codec acknowledgement plus
  Confirmations (post-frontend-status) for the three
  clarifications.
- `docs/archive/dispatch/frontend-to-backend-analysis-persistence-status.md` —
  frontend's status reply.
- `docs/notes/tenancy.md` — the tenancy spine the analysis-
  bundle Port plugs into.
- `backend/api/routes/analysis_bundles.py` — the route layer.
- `backend/services/analysis_bundle_service.py` — the use case.
- `backend/repositories/analysis_bundle_repository.py` — the
  adapter, including the codec dispatch.
- `backend/repositories/ports.py::AnalysisBundleRepositoryPort` —
  the contract.
- `backend/domain/analysis_bundle.py` — the domain DTOs (also
  reused as wire shapes since they're identical).
- `frontend/src/services/analysis-bundle.ts` — the frontend's
  projection/replay skeleton.
- `frontend/src/services/analysis-ledger.ts` — the in-memory
  ledger the bundle projects from / replays into.

## License

Public Domain (The Unlicense).
