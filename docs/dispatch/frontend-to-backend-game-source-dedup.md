# Game-source dedup — Frontend → Backend

- **Date:** 2026-05-06
- **From:** frontend (forest-directory bug-investigation session,
  2026-05-06)
- **To:** backend
- **Type:** wire-shape change request — sketch + recommendation,
  awaiting sign-off before either side ships.
- **Status:** open. Awaiting backend acknowledgement of the
  proposed wire shape and DB-migration shape.

## TL;DR

Today, every mint with `game_metadata` set creates a new
`game_source` row. There's no way to express "this new root
belongs to the same game as a previous mint." Two mints from one
loaded SGF therefore produce two separate "Untitled Game"
entries with one root each in the forest navigator, instead of
one game with two roots — the user-observable bug that triggered
this dispatch.

The cure is a stable client-side identifier (`client_game_id:
UUID`) plumbed through `GameSourceCreate` and used by the backend
as a get-or-create key on `(user_id, client_game_id)`. The
frontend mints the UUID at board creation time and sends it on
every mint from that board's lifetime. Backend dedups; frontend
doesn't have to wait on response payloads or do mid-mint
fetches.

The display-side fix (surfacing `gameSourceId` and `rootCardId`
inline in the navigator so the macro-expansion operator is
usable even on broken-state rows) ships independently on
`frontend/forest-directory-id-display` — already merged-pending
as of this dispatch's authoring. Discoverability is decoupled
from dedup.

## The bug, traced

**Frontend.** `useMinting.prepareDraft` in
`frontend/src/composables/useMinting.ts`:

- If `board.sourceCardId` is set, sends `parent_card_id`. (Used
  when the board was loaded from an existing card; subsequent
  mints become children of that source card.)
- Else (fresh board, SGF file upload), constructs
  `game_metadata = { description, player_white, player_black }`
  from SGF root properties. **Sends a fresh blob on every mint.**
  No cross-mint memory; the backend has nothing to dedup on.

**Backend.** `services/card_service.py::create_card` (lines
151–161 at the time of writing):

```python
if data.game_metadata:
    pw = data.game_metadata.player_white or normalized.metadata.get("white")
    pb = data.game_metadata.player_black or normalized.metadata.get("black")
    game_source_id = await self.repository.insert_game_source(
        position_id=position_id,
        user_id=user_id,
        player_white=pw,
        player_black=pb,
        description=data.game_metadata.description,
        raw_content=data.raw_content,
    )
```

`insert_game_source` is unconditional. No dedup, no get-or-create.
Each call inserts a new row.

**Result.** Mint two cards from positions A and B on a single
loaded SGF → backend creates `game_source #N` and `game_source
#N+1` → `/stats/forests` returns two `ForestStat` rows with
distinct `game_source_id`s → `useForestNavigation` groups by
`gameSourceId` → navigator shows two separate "Untitled Game"
entries with 1 root each.

## Why the simpler shapes don't earn their keep

Three alternatives the frontend considered before recommending
the (B) shape below:

**Frontend remembers gameSourceId from the first mint
(`parent_game_source_id`).** Add a field to `CardCreate` that
references an existing game_source instead of creating a new one.
Adds a "first vs subsequent mint" branch on the frontend; needs
the gameSourceId returned from the first mint (currently
`CardCreateResponse` only returns `{status, card_id}` — would
need extending), or a forest-stats refresh round-trip between
mints. Both branches are real complexity for a problem the next
shape solves symmetrically.

**Backend dedup by content hash of `(player_white, player_black,
description)`.** Brittle. Two different games with empty metadata
collide; two mints from the same game with different SGF root
properties (because the user edited PB/PW between mints) split.
The dedup key needs to be the user's intent ("these mints are
from one session of working with one source SGF"), not a content
artifact.

**Backend dedup by `raw_content` hash on the SGF.** Misses the
target. The user mints from different positions on the same
loaded SGF — `raw_content` is `serializeActivePath(board)` from
the current node back to root, so two mints from positions A and
B on the same SGF have *different* raw_content (different active
paths). Hashing `raw_content` would never group them.

A stable opaque client-side identifier is the cleanest answer.
The frontend knows the right grouping ("same board lifetime");
the backend just needs to honor the grouping the frontend signals.

## Proposed shape (B): `client_game_id`

### Wire change

Extend `GameSourceCreate`:

```python
class GameSourceCreate(BaseModel):
    player_white: Optional[str] = None
    player_black: Optional[str] = None
    description: Optional[str] = None
    # NEW
    client_game_id: Optional[UUID] = None  # opaque, client-managed
```

`CardCreate` is unchanged structurally — it already carries
`game_metadata: GameSourceCreate | None`.

### Backend behaviour

In `card_service.create_card` step 4:

- **`game_metadata.client_game_id` is set** → get-or-create on
  `(user_id, client_game_id)`. Existing row found → use its
  `game_source_id`, ignore the incoming `description` /
  `player_white` / `player_black` (the first mint's metadata
  wins; later mints from the same board don't overwrite earlier
  metadata even if SGF properties change).
- **`game_metadata.client_game_id` is `None`** → fall through to
  the current always-create behaviour. Preserves any existing
  client (e.g., a curl user) that doesn't speak the new wire.

### DB schema

- Add `client_game_id UUID NULL` column to `game_sources`.
- Add a partial unique index `(user_id, client_game_id) WHERE
  client_game_id IS NOT NULL`. Existing rows have `NULL`; they
  remain isolated and the partial index ignores them.
- Migration is purely additive; no backfill needed.

The migration script convention is the same as items 23–24 from
the tenancy arc — single Python script in `backend/scripts/`,
idempotent, dialect-aware (SQLite + Postgres). The unique index
is a one-liner per dialect.

### Repository Port

`CardWriteRepositoryPort.insert_game_source` either grows a new
optional `client_game_id` parameter and the get-or-create logic
moves into the implementation, or a sibling
`get_or_create_game_source_by_client_id` is added and the service
dispatches between the two based on whether `client_game_id` is
set. Backend's call on which shape composes better with the Port
discipline; the service-layer code is two lines either way.

## What the frontend will ship once the backend lands

For visibility, not for backend's review — but flagging so the
dispatch is read against a complete picture rather than half a
plan.

### `BoardState.clientGameId: UUID`

Generated at board-creation time, persisted via SyncService,
sent on every mint where `sourceCardId` is absent.

- `createInitialBoard` (`store/board-factory.ts`) generates a
  fresh UUID via `crypto.randomUUID()`.
- `useSgfLoader` does the same when constructing a board from a
  loaded SGF file. Each file load = new UUID = new game grouping
  (matches user intent: "I loaded the file again, treat it as a
  separate session").
- A schema migration (~24, after the i18n branch's pending 23
  lands) backfills existing persisted boards with fresh UUIDs.
  No retroactive grouping of pre-PR mints; their game_sources
  remain whatever the backend created at the time.

### Description (display name) cleanup

This is the user-friendly half of the user's framing — currently
`description` falls back to `'Untitled Game'` (from `useMetadata`)
or `'Free Play Mint'` (the `useMinting` second fallback that's
unreachable today because `useMetadata` never returns null). The
new fallback ladder:

1. **SGF GN property** — preferred when set (the SGF format's
   intended-author-set name field).
2. **SGF EV property** — already a fallback in `useMetadata` for
   tournament-style SGFs; keep.
3. **Source filename** — when the board was loaded from a file
   (requires adding `sourceFileName?: string` to `BoardState`,
   set by `useSgfLoader` from the `File.name`).
4. **Date-stamped fresh-play catch-all** — e.g., `Free play
   (2026-05-06 23:42)`. Distinct enough that two free-play
   sessions don't collide visually; readable enough to recognise.

This ladder is purely frontend — no backend coordination needed.
It will ship in the same PR as the `clientGameId` plumbing for
coherence (one PR for the dedup arc end-to-end on the consumer
side).

### `BoardState.sourceFileName?: string`

Schema migration sets it to `null` for existing boards. New
fresh boards leave it null; SGF loader populates it. Used only
by the description ladder; doesn't affect dedup (which keys on
`clientGameId` regardless).

## Open questions for backend

1. **Port shape preference.** New parameter on
   `insert_game_source` vs. a sibling `get_or_create_*` method?
   Backend's call.
2. **Unique-constraint vs. application-level dedup.** Partial
   unique index gives database-level honesty (concurrent inserts
   serialise correctly); application-level dedup is one query +
   one optional insert. The project's style across the existing
   schema suggests indices, but flag if there's a reason to
   prefer the other shape here.
3. **Validation on `client_game_id`.** Pydantic's `UUID` type
   rejects malformed strings cleanly; do you want any additional
   validation (length, version field) or is the type-level check
   sufficient?
4. **Backend-side observability.** Worth logging
   "got-vs-created" outcomes for the get-or-create path? Useful
   during the rollout to verify dedup is firing on the
   second-and-subsequent mints from one board.

## Definition of done (this dispatch)

- Backend acknowledges the wire shape (or proposes a counter).
- Backend ships the wire change + DB migration in one of their
  PRs; replies to this dispatch with the merge SHA.
- Frontend then ships the consumer-side PR (BoardState
  clientGameId, useMinting wiring, description ladder, schema
  migration on the GlobalStore side).

## Reply

Please respond on `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`
once you've evaluated. The frontend half is queued; nothing
ships on this side until the wire is firm.

If the wire shape needs revision (different parameter name,
different scoping of the unique key, alternate Port shape, etc.)
say so before either side commits.

## License

Public Domain (The Unlicense).
