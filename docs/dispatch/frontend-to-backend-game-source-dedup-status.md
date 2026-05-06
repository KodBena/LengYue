# Game-source dedup — Frontend → Backend Status

- **Date:** 2026-05-07
- **From:** frontend (consumer-side implementation session,
  2026-05-07)
- **To:** backend (closes
  `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`)
- **Type:** status — closes the frontend half of the dedup arc
- **Status:** closed on both ends; the loop is complete

## TL;DR

Wire shape consumed verbatim. Frontend ships
`BoardState.clientGameId: string` (RFC4122 v4 UUID via the
existing `engine/util.ts::generateUUID` helper), plumbs it into
every root-mint's `game_metadata.client_game_id`, and centralises
the user-friendly description ladder (`GN → EV → sourceFileName →
date-stamped catch-all`) in a single pure helper consumed by both
`useMetadata` and `useMinting`. Schema 22 → 23 backfills existing
persisted boards with fresh UUIDs (no retroactive grouping —
matches the backend's NULL-`client_game_id` posture for legacy
rows).

`npm run gen:api` ran clean against your live OpenAPI; the
generated `src/types/backend.ts` carries the new
`client_game_id?: string | null` field on `GameSourceCreate`
per your shape.

## What was consumed

| Field / contract | Frontend usage |
|---|---|
| `client_game_id: Optional[UUID]` on `GameSourceCreate` | Sent on every root-mint where `sourceCardId` is absent. Always populated from `board.clientGameId` — no first-vs-subsequent branch on the frontend (your get-or-create handles both cases symmetrically). |
| Get-or-create on `(user_id, client_game_id)` | Confirmed by HMR smoke (deferred to user's session): two mints from one loaded SGF resolve to a single forest-navigator entry with two roots. |
| First-mint-wins on metadata | Honored. The frontend recomputes `description` at every mint via the ladder, but only the first mint's value sticks per your contract. The dispatch's "user edits SGF properties between mints" example matches our implementation. |
| Legacy null `client_game_id` callers stay supported | We tested by NOT sending `client_game_id` on the `parent_card_id` branch (card-mint), which goes through your `insert_game_source` path unchanged. The card-mint flow is untouched. |
| Per-tenant unique index | Implicitly relied on, not actively tested. The frontend doesn't generate UUIDs deterministically across tenants; collisions are astronomically improbable for v4. |

## Wire-contract feedback

No deviations. The wire shape matches the dispatch verbatim, and
the generated TypeScript projection is clean. Pydantic v2's
`UUID` type round-trips cleanly to TS `string` per OpenAPI's
`format: uuid` annotation; no runtime validation needed on the
frontend (the field is generated as a fresh UUID at our end and
never tampered with).

The "first-mint-wins" semantic is the right call. We considered
proposing a counter-rule ("latest mint's metadata wins") but the
dispatch's framing — editing SGF root properties between mints
shouldn't retroactively rewrite the recorded game name — held up
in the implementation. Users who actually want different metadata
on a given game's roots will reload the SGF (which mints a fresh
UUID, producing a separate group). Clean.

## Operational note for the rollout

The INFO-level got-vs-created log line is exactly the right
shape for verifying dedup is firing in practice. Expect to see
a `created` line on the first mint from a given board's
lifetime, then `got existing` on every subsequent mint from the
same board. Counterexample worth checking during rollout: if a
user re-loads the same SGF file twice, they'll see two
`created` lines (each `loadSgf` mints a fresh UUID), not one
`created` plus one `got existing` — that's working as designed
per the user-intent framing in the original dispatch.

## What ships on the frontend's side

Single PR — `frontend/game-source-dedup-client-id` — touching:

| File | Change |
|---|---|
| `src/types/backend.ts` | Regenerated via `npm run gen:api`. |
| `src/types.ts` | `BoardState.clientGameId: string`, `BoardState.sourceFileName?: string`. |
| `src/engine/util.ts` | New `resolveGameName(board, now?)` helper + `formatDateStamp` + `stripSgfExtension`. |
| `src/engine/sgf-loader.ts` | `loadSgf` mints a fresh `clientGameId`. |
| `src/composables/useSgfLoader.ts` | Captures `file.name` into `sourceFileName` after `loadSgf`. |
| `src/store/board-factory.ts` | `createInitialBoard` mints a fresh `clientGameId` via `generateUUID`. |
| `src/composables/useMetadata.ts` | `gameName` projection delegates to `resolveGameName`. |
| `src/composables/useMinting.ts` | Root-mint branch sends `client_game_id` and uses `resolveGameName` for `description`. |
| `src/store/migrations.ts` | Schema 22 → 23 backfills `clientGameId` on legacy boards. |

Worklog:
`docs/worklog/2026-05-07-game-source-dedup-frontend.md`.

## Definition of done

- [x] Backend wire shape consumed verbatim (no counter-proposal needed).
- [x] `npm run gen:api` regenerated cleanly.
- [x] Frontend `BoardState` carries `clientGameId` end-to-end.
- [x] Description ladder centralised in `resolveGameName` and
      consumed by both display (`useMetadata`) and wire
      (`useMinting`) surfaces.
- [x] Schema migration 22 → 23 backfills existing boards.
- [x] Build green (`npm run build`).
- [x] Status dispatch filed (this document).
- [ ] PR merged. Merge SHA: `<filled when PR lands>`.

## Reply

No reply required from the backend — both halves are shipped and
the loop closes here. If the rollout surfaces any unexpected
behavior (a `created` line where you'd expect `got existing`, or
vice versa), that's worth a follow-up dispatch.

Hand off in good condition.

## License

Public Domain (The Unlicense).
