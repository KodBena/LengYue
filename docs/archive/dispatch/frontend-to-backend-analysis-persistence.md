# Analysis persistence — Frontend → Backend

- **Date:** 2026-05-07 (revised same day with branch rename and
  cross-team coordination note; original dispatch shipped via PR
  #165)
- **From:** frontend (analysis-persistence design session,
  2026-05-07; cross-cutting branch
  `cross/analysis-persistence`, originally `frontend/analysis-persistence`
  before the cross-cutting nature was made explicit)
- **To:** backend
- **Type:** new-feature wire-shape proposal — sketch + recommendation,
  awaiting sign-off before either side ships.
- **Status:** open. Awaiting backend acknowledgement of the
  proposed wire shape, table shape, and codec-experimentation
  envelope.

## TL;DR

Persist KataGo analysis records server-side so a user who
re-opens a previously-analyzed game doesn't re-pay the compute
cost. Two design choices distinguish this proposal from the
shape sketched in `docs/notes/analysis-persistence-plan.md`:

1. **Manual + batched, not streaming.** The user clicks "Save
   analyses" on a board to upload; we do not auto-persist on
   packet arrival. Reasoning in §"Why the design shifted" below.
2. **Per-`BoardId` bundle as the storage row.** A bundle is the
   flat ledger projection over a board's nodes (a flat dict of
   `(configHash, nodeId) → packet`, not a tree, not a sequence).
   The board is the lifecycle anchor: created on first save,
   replaced on re-save, deleted on board close.

The wire shape is canonical JSON. The backend stores an opaque
**scheme-tagged blob** so the storage codec (raw JSON, gzip'd
JSON, zstd, delta-encoded zstd, eventually a corpus-aware
dictionary codec) can evolve without the frontend caring. This
is the load-bearing flexibility — see §"Codec experimentation"
for why and what shape the envelope takes.

The `isDuringSearch === false` validation question that blocked
the original plan is dissolved here: under manual + batched, the
trigger is a user click, and the watermark interpretation of the
ledger (every stored packet is already the strongest seen for
its `(configHash, nodeId)` — `mergeAnalysisPacket` in
`frontend/src/services/analysis-ledger.ts`) means we always
snapshot the best-known data without needing a streaming gate.

## Why the design shifted

The original plan (`docs/notes/analysis-persistence-plan.md`)
sketched per-`(configHash, nodeId)` granularity with auto-persist
on `isDuringSearch === false` packet arrival. Two pressures
moved us:

1. **UI-state snappiness is load-bearing.** `SyncService` debounces
   document-blob writes at ~1s and the user notices nothing.
   Adding a streaming analysis-persistence channel that fires per
   final packet introduces a second concurrent persistence flow on
   the same network path; the worst-case bundle of "30 tabs × 200
   moves × 48 KB" is in the multi-hundred-MB range and the user
   should opt into that explicitly, not have it happen invisibly.
2. **Compression wants a corpus.** Per-record uploads foreclose
   delta encoding (each record has no neighbour at upload time).
   Per-board batching opens the door — every record in a bundle
   has its sibling positions on the same board to delta against.
   Forward-looking codecs (cross-board, dictionary-shared) want
   even more scope; the wire shape mustn't lock that out.

Manual + batched is the point on the design surface where
both pressures resolve.

## Storage row shape

```sql
CREATE TABLE analysis_bundles (
  user_id      <FK to users>      NOT NULL,
  board_id     TEXT               NOT NULL,
  scheme       TEXT               NOT NULL,
  payload      BLOB               NOT NULL,
  record_count INTEGER            NOT NULL,
  byte_size    INTEGER            NOT NULL,
  updated_at   TIMESTAMP          NOT NULL,
  PRIMARY KEY (user_id, board_id)
);
```

Notes on the columns:

- `board_id` is the frontend's `BoardId` (branded `string`,
  `crypto.randomUUID()` at board-creation time, persisted in the
  document blob). Collision across users is astronomically
  unlikely, but the composite PK with `user_id` is the
  tenant-isolation guarantee per `docs/notes/tenancy.md`.
- `scheme` is the codec tag (see §"Codec experimentation"). Stored
  as text so a migration that adds a new scheme is purely
  additive — old rows keep their tag, the codec dispatch table on
  the backend handles them.
- `payload` is opaque bytes from the backend's storage perspective.
  The wire-format JSON the frontend ships gets transcoded into
  whatever `scheme` the backend currently writes; the frontend
  never sees the stored bytes.
- `record_count` and `byte_size` are denormalized for cheap
  per-user quota reporting and for the frontend's "you have N
  bundles using M MB" UI without forcing a decode.
- `updated_at` is for diagnostic / forensic use; no automatic
  expiration is proposed (deletion is explicitly user-driven via
  board close or a UI action).

## Endpoint shape

```
PUT    /api/v1/analysis-bundles/{board_id}
GET    /api/v1/analysis-bundles/{board_id}
DELETE /api/v1/analysis-bundles/{board_id}
GET    /api/v1/analysis-bundles            # list + sizes for the user
```

(Path versioning matches existing project convention; adjust to
whatever the current API prefix is.)

### Request / response shapes

**`PUT /analysis-bundles/{board_id}`** — upsert.

Request body (canonical JSON, the frontend's wire shape):

```typescript
type AnalysisBundleRequest = {
  schemaVersion: 1;
  records: Array<{
    configHash: string;            // opaque to backend
    nodeId: string;                // BoardId-scoped node identifier
    packet: KataAnalysisResponse;  // opaque blob; backend never inspects
  }>;
};
```

Response:

```typescript
type AnalysisBundleWriteResponse = {
  boardId: string;
  recordCount: number;             // echoed from request
  storedScheme: string;            // codec the backend wrote with
  storedByteSize: number;          // size after transcoding
  updatedAt: string;               // ISO-8601
};
```

Returning `storedScheme` and `storedByteSize` lets the frontend
display "saved 142 analyses, 1.2 MB after compression" honestly
in the UI, and gives forensic hooks for the codec-experimentation
phase.

**Forward-compatibility note on records.** The three record fields
above are the v1 schema. Records may grow additional opaque
fields under future bundle schema versions — e.g., a
`modelVersion` tag if the frontend ever wants to discriminate
analyses by which KataGo neural-net weights produced them. The
backend treats records as opaque storage; adding a record field
is a frontend bundle-version bump, no DB migration. The
`schemaVersion: 1` field at the bundle level is the extension
hook. We do not propose to ship model-versioning in v1 (a user
who wants fresh analyses against new weights can `DELETE` the
bundle and re-analyse), but the wire shape leaves the door open.

**`GET /analysis-bundles/{board_id}`** — fetch.

Returns the canonical-JSON bundle (the same shape as the request
body), reconstructed from the stored payload via the
scheme-dispatch table on the backend. 404 if no bundle exists.

**`DELETE /analysis-bundles/{board_id}`** — idempotent. 204
whether or not a row existed.

**`GET /analysis-bundles`** — list metadata only, for UI quota
display:

```typescript
type AnalysisBundleListResponse = Array<{
  boardId: string;
  recordCount: number;
  storedByteSize: number;
  storedScheme: string;
  updatedAt: string;
}>;
```

No payloads. The frontend uses this to show per-board usage in a
settings or storage panel without forcing a download cascade.

## Codec experimentation

The `scheme` column is the load-bearing flexibility. Proposed
initial vocabulary (the backend can pick any starting point):

| `scheme` | Encoder | Notes |
|---|---|---|
| `json` | `json.dumps(bundle).encode()` | Simplest baseline; lets the team measure pre-compression sizes empirically before committing to a codec. |
| `json+gzip` | gzip over canonical JSON | Easy, universal, ~5–8× on JSON like this in practice. |
| `json+zstd` | zstd over canonical JSON | Better ratio than gzip; std-lib in modern Python. Recommended starting point if zstd is acceptable as a backend dependency. |
| `json+delta+zstd` | per-bundle delta encoding on numeric fields, then zstd | Future scheme. Requires a structural pass on the JSON before serialising; backend implementation only. |
| `corpus-zstd-dict-vN` | zstd with a shared dictionary keyed by version `N` | Forward-looking. The dictionary lives in a sibling table or static file; bundles store only the dict reference + payload. |

The backend's contract on read:

- Look up the row's `scheme`.
- Dispatch to the matching decoder.
- Return canonical JSON.

The backend's contract on write:

- Pick the current write-scheme from a single config knob (e.g.
  `ANALYSIS_PERSISTENCE_WRITE_SCHEME = "json+zstd"`).
- Transcode the request bundle.
- Store `(scheme, payload)`.

Existing rows with older schemes remain readable forever; a
re-pack migration (one of the existing `backend/scripts/`
patterns) can sweep them to the new scheme when the operator
chooses, with no client involvement.

A note on cross-row codecs: when `scheme` references shared
state (e.g., `corpus-zstd-dict-v3` references row N in some
`zstd_dictionaries` table), DELETE semantics need a refcount or
a "dictionaries are immutable" rule. We are explicitly not
designing this for v1 — the door is open, the lock is a v2
concern when there's evidence the simpler schemes hit a ceiling.
Flagging here so it's not invisible.

## Tenancy

Strict per-`user_id` filter on every read path; per-`user_id`
authorization on every write/delete. `BoardId` collisions across
users must not leak data (the composite PK enforces this; the
read paths must filter accordingly to actually exercise it).
Same posture as the rest of the tenancy spine
(`docs/notes/tenancy.md`).

The frontend will only ever query its own bundles. There is no
admin / cross-user access path proposed.

## Behavioural contract — what the frontend will and won't do

For visibility, not for backend's review:

**Frontend will:**

- Mint and persist `BoardId` at board creation (already done —
  `BoardState.id` exists, branded, persisted via `SyncService`).
- Compose the request bundle by projecting `analysis-ledger`'s
  flat dict over the board's node IDs (`Object.keys(board.nodes)`
  cross every `configHash` the ledger holds for those nodes).
- Call `PUT` on a "Save analyses" user action; show pre-save
  preview ("142 analyses, ~1.2 MB before compression").
- Call `GET` on board appearance in the workspace (SPA restore
  or document-side board addition) and replay records into the
  ledger via `ledger.record(hash, nodeId, packet)`.
- Call `DELETE` from inside `closeBoard` (`store/index.ts`)
  alongside the existing `ledger.purgeBoard` — extending the
  resource-ownership audit pair.
- Call `GET /analysis-bundles` (list) to populate a storage panel.

**Frontend will not:**

- Auto-persist on packet arrival.
- Couple to `SyncService` (separate service module entirely).
- Maintain client-side compression / decompression. Delegated to
  the backend so codec swaps are one-sided.
- Inspect or repair partial bundles. Either the backend returns
  a complete decoded bundle or it returns 404; failure modes are
  loud (per ADR-0002).

## Coordination on `cross/analysis-persistence`

Frontend and backend implementation work both land on the
`cross/analysis-persistence` branch. End-to-end iteration across
the two sub-projects is the load-bearing requirement (the
feature is tested by sending a real bundle through a real
backend and watching it round-trip into the ledger), and a
single branch is the cheapest way to honour it. Each side commits
to its own sub-tree (`frontend/`, `backend/`); path collisions
are not expected.

The branch was originally cut as `frontend/analysis-persistence`
before the cross-cutting work pattern was named explicitly. It
has been renamed to `cross/analysis-persistence`; the old name
is gone from origin.

### Push hygiene

When two contributors are pushing to one branch, the rule is
`git pull --rebase` (or `git pull` with merge) before
`git push`. **Avoid `git push --force` on this shared branch** —
even though it is not main, force-pushing a branch the other
side has based work on overwrites their commits silently. If a
rebase produces a conflict, resolve it locally rather than
reaching for force. ADR-0002 extends here: noisy merge commits
are better than silently losing the other team's work.

If a force-push genuinely is needed (e.g., to remove an
accidentally-committed secret), coordinate first via a
status-dispatch addressed to the other side before doing it.

## Open questions for backend

1. **Storage column type.** `BLOB` (Postgres `BYTEA`, SQLite
   `BLOB`) is what the proposal assumes. Is there a reason to
   prefer base64-text-in-a-text-column for some operational
   convenience (e.g., dump/restore tooling)? My read is no, but
   you'd know better.
2. **Initial write-scheme.** `json` (no compression — easy to
   measure ground-truth sizes), `json+gzip` (free win, no new
   dependency), or `json+zstd` (best initial ratio, adds a
   dependency)? My lean is `json+gzip` for v1 — the size
   reduction is real and there's no dependency cost; the
   experimentation harness lets us upgrade to zstd or further
   schemes later without frontend churn.
3. **Per-user quota.** Should the backend enforce a hard cap
   (e.g., 500 MB per user)? My lean is yes, with a clean 413
   Payload Too Large response that the frontend surfaces as a
   user-visible message ("Storage limit reached — delete an
   older bundle to save this one"). The frontend already
   computes pre-save size, so a 413 is a slow-path safety net,
   not the primary UX.
4. **Per-bundle size cap.** The 30 tabs × 200 moves × 48 KB
   worst case is ~280 MB for a single board. Defensible as an
   upper bound to refuse at upload time? Suggest a default of
   e.g. 50 MB per bundle, configurable via env.
5. **Validation depth.** The proposal treats `packet` as opaque.
   Is there a backend reason to validate it more strictly
   (defence against a misbehaving frontend posting garbage)? My
   lean is no — the frontend ACL boundary owns wire-shape
   honesty for KataGo, the backend's job is opaque storage.
   But flag if you'd prefer at-least-JSON-parses validation as a
   sanity gate.
6. **Repository Port shape.** New `AnalysisBundleRepositoryPort`
   with `upsert / get / delete / list` methods, or extend an
   existing Port? Backend's call; the service-layer is small.

## Definition of done (this dispatch)

- Backend acknowledges the wire shape, table shape, and codec
  envelope (or proposes a counter).
- Backend ships endpoints + table + initial codec in one or more
  PRs; replies on
  `docs/dispatch/backend-to-frontend-analysis-persistence-status.md`
  with the merge SHAs.
- Frontend then ships the consumer-side PR(s) from
  `cross/analysis-persistence` (settings, service, UI surface,
  `closeBoard` cleanup augmentation, `analysis-persistence-plan.md`
  rewrite to reflect the shipped design).

## Reply

Please respond on
`docs/dispatch/backend-to-frontend-analysis-persistence-status.md`
once you've evaluated. The frontend half is queued on
`cross/analysis-persistence`; nothing ships on this side
until the wire is firm.

If the wire shape needs revision (different endpoint pattern,
different codec-tag granularity, alternate Port shape, etc.) say
so before either side commits. The codec envelope in particular
is the place where backend's intuition outweighs frontend's —
if the proposed scheme-tag column gets in the way of how you'd
naturally structure the codec dispatch, propose an alternative.

## License

Public Domain (The Unlicense).
