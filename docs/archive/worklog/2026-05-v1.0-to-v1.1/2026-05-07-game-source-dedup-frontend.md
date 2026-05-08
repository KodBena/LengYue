/**
 * docs/worklog/2026-05-07-game-source-dedup-frontend.md
 * Worklog — frontend half of the game-source dedup arc. BoardState
 * gains `clientGameId: string` (RFC4122 v4 UUID) and
 * `sourceFileName?: string`; description ladder centralised in
 * `engine/util.ts::resolveGameName`; useMinting sends client_game_id
 * in every root-mint's game_metadata; schema 22 → 23 backfills
 * existing persisted boards with fresh UUIDs.
 * License: Public Domain (The Unlicense).
 */

# Game-source dedup — frontend half

- **Status:** Shipped on `frontend/game-source-dedup-client-id`,
  2026-05-07. Build green; closes the consumer side of the
  dispatch loop opened on 2026-05-06.
- **Genre:** Multi-file feature PR. Pairs with backend's
  `backend/game-source-dedup` PR (merged as commit `dded8bf` /
  PR #160).
- **Date:** 2026-05-07.

## Context

Two mints from positions A and B on a single loaded SGF were
producing two distinct "Untitled Game" entries with one root each
in the Forest Directory, instead of a single game with two roots.

Root cause analysis filed on 2026-05-06 as
`docs/dispatch/frontend-to-backend-game-source-dedup.md`. Backend
confirmed the wire-shape proposal verbatim and shipped the server
half on 2026-05-06: `client_game_id: UUID` added to
`GameSourceCreate`, `get_or_create_game_source_by_client_id` Port
method on `CardWriteRepositoryPort`, partial unique index on
`(user_id, client_game_id) WHERE client_game_id IS NOT NULL`,
INFO-level got-vs-created log line. Reply at
`docs/dispatch/backend-to-frontend-game-source-dedup-status.md`.

This PR ships the frontend's consumer half: a stable per-board
UUID, plumbed into the mint payload; a centralised description
fallback ladder; the schema migration to backfill existing
boards.

## What ships

Eight files modified, one new helper added, one schema migration.

### `src/types/backend.ts` — regenerated

`npm run gen:api` against the backend dev server picked up the new
`client_game_id?: string | null` field on `GameSourceCreate`. No
hand edits to the generated file (per ADR-0006's generated-files
exemption + `frontend/README.md`'s codegen rationale).

### `src/types.ts` — BoardState gains two fields

```ts
clientGameId: string;          // required, persisted, dedup key
sourceFileName?: string;       // optional, set only on file-loaded boards
```

Both fields carry full docstrings naming the dedup contract,
the SSOT relationship with `engine/util.ts::resolveGameName`,
and the schema-23 introduction.

### `src/engine/util.ts` — `resolveGameName` helper

Centralised the four-rung description ladder:

1. SGF `GN` root property — when set in the file
2. SGF `EV` root property — common in tournament SGFs
3. `board.sourceFileName` — populated by `useSgfLoader`,
   `.sgf` extension stripped via the new `stripSgfExtension`
   helper
4. Date-stamped catch-all — `Free play (YYYY-MM-DD HH:MM)` via
   the new `formatDateStamp` helper, locale-independent so the
   persisted description doesn't drift across user-agent locales

Pure function; the `Date.now()` reading is parameterised via
the second argument so tests / future fixtures can pin the
timestamp deterministically.

The previous implementation was a chained `||` in
`useMetadata`'s `gameName` projection ending in `'Untitled
Game'` — which conflated "no SGF metadata at all" with
"this is a fresh-play board" and produced the user-observed
bug where every fresh-play mint became its own "Untitled
Game" entry.

### `src/store/board-factory.ts` — `createInitialBoard` mints UUIDs

Imports `generateUUID` from `engine/util.ts` (the existing
RFC4122 v4 helper with secure-context fallback to
`crypto.getRandomValues`). Stamps `clientGameId: generateUUID()`
on every freshly constructed board. The pre-existing 7-character
`uuid()` helper (used for `BoardId` and `NodeId`) is preserved
with a docstring naming the distinction — those are intra-frontend
handles where short ids are friendlier in DevTools; the
client_game_id has to satisfy backend's Pydantic `UUID` type so
it goes through the proper RFC4122 v4 path.

### `src/engine/sgf-loader.ts` — `loadSgf` mints UUIDs

Same `generateUUID` import. Each `loadSgf` call mints a fresh
`clientGameId`, so two loads of the same SGF produce two distinct
game-source groupings on the backend (matching user intent: "I
re-imported the file, treat it as a separate session").

`sourceFileName` is intentionally NOT set here — the engine layer
doesn't see the File API. The composable boundary
(`useSgfLoader`) is where that field lives.

### `src/composables/useSgfLoader.ts` — captures the filename

After `loadSgf` returns, the composable assigns
`newBoard.sourceFileName = file.name` before pushing to the
store. The raw filename (with extension) is stored;
`resolveGameName` strips the `.sgf` for display.

### `src/composables/useMetadata.ts` — delegates to `resolveGameName`

`gameName` projection now calls `resolveGameName(b)` instead of
the chained-`||` ladder. SSOT honesty: any consumer that wants
"the user-friendly name of this board's game" reads from one
helper. (Audit confirmed today's only consumer outside `useMinting`
is StatusBar, which reads `blackName`/`whiteName`/`komi`/`rules`,
not `gameName` — no regression.)

### `src/composables/useMinting.ts` — wires the dedup payload

The root-mint branch (when `sourceCardId` is absent) now:

1. Calls `resolveGameName(board)` directly for `description`
   (skips the `metadata.gameName` projection — same answer
   either way, but the wire path doesn't depend on the
   composable surface for a value the wire requires).
2. Includes `client_game_id: board.clientGameId` in the
   `game_metadata` blob. Sent unconditionally on every root-mint
   from the board's lifetime; backend's get-or-create resolves
   subsequent mints to the same game_source row.

The card-mint branch (when `sourceCardId` is set) is unchanged —
those go through `parent_card_id`, not `game_metadata`, and
inherit grouping from their source card's lineage.

### `src/store/migrations.ts` — schema 22 → 23

```ts
(blob: any) => {
  const out = structuredClone(blob);
  if (Array.isArray(out.boards)) {
    for (const b of out.boards) {
      if (b && typeof b === 'object' && typeof b.clientGameId !== 'string') {
        b.clientGameId = generateUUID();
      }
    }
  }
  return out;
}
```

Backfill rule: each existing persisted board gets its own fresh
UUID. **No retroactive grouping** — pre-rollout `game_source`
rows on the backend have `client_game_id IS NULL` (the partial
unique index ignores them), and pre-rollout BoardStates have
no way to reconstruct which mints came from which board's
lifetime. The two halves match: legacy state stays isolated;
new state groups correctly.

Idempotent: a pre-existing string `clientGameId` is preserved
(a hand-edited blob isn't clobbered); missing or non-string
gets a fresh UUID.

`CURRENT_SCHEMA_VERSION` bumped to 23.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) green.
- Bundle markers confirmed: `client_game_id`, `clientGameId`,
  `Free play` (the date-stamped fallback string) all present.
- Generated `src/types/backend.ts` carries
  `client_game_id?: string | null` on `GameSourceCreate` per
  the regen.
- Migration sanity: idempotent (re-run on a v23 blob is a
  no-op); fresh installs land on `createInitialBoard`'s
  factory-set UUID, never touching the migration.

### HMR smoke (deferred to user's session)

1. Load an SGF file from the OS file picker (e.g., a known game).
2. Mint a card from move 5.
3. Navigate to move 20 on a different variation.
4. Mint a second card.
5. Open Forest Directory → Browse tab.
6. Expected: a single game entry titled with the GN/EV/filename
   (whichever rung resolves), with `#N` chip, expanding to
   reveal **two** root rows (one per minted position).
7. Reload the page. The grouping persists (the SyncService
   round-trip preserves `clientGameId` on `BoardState`).
8. Open the same SGF a second time → mint again → it shows up
   as a SEPARATE game entry (each `loadSgf` call mints a fresh
   UUID).
9. Create a fresh blank board → mint without loading anything →
   forest entry titled `Free play (YYYY-MM-DD HH:MM)` with the
   timestamp captured at first mint.

## Out of scope (deliberate)

- **Retroactive grouping of pre-rollout mints.** The backend's
  partial unique index ignores NULL `client_game_id` rows; the
  frontend's migration generates a fresh UUID per legacy board
  rather than trying to reconstruct grouping. Pre-rollout
  `game_source` rows remain isolated, which matches the
  backend's posture.
- **Surfacing the source filename in any UI other than the game
  description.** A future tooltip on the navigator's game row
  showing "loaded from <file>" is a small follow-on; not in
  scope here.
- **Allowing the user to re-edit a game's description after
  the first mint.** The backend's first-mint-wins contract is
  intentional; if the user wants different metadata, they
  reload the SGF (fresh UUID = fresh grouping).
- **Date format localization.** `formatDateStamp` is
  locale-independent ISO-8601-ish; once the i18n arc lands and
  the locale picker is in users' hands, a follow-on could
  format dates per the active locale. The current shape is
  deliberately permanent-string-friendly — a description set
  in 2026-05-07 should still read sensibly in any locale's UI
  context.

## Coordination notes

- The backend PR (#160) is on main (`dded8bf`) at the time of
  this PR's authoring. The wire-shape feedback loop is closed
  on both ends.
- The status dispatch
  `docs/dispatch/frontend-to-backend-game-source-dedup-status.md`
  closes the loop from the frontend's side, naming the merge
  SHAs once this PR lands.
- The display fix from 2026-05-06
  (`frontend/forest-directory-id-display`, PR #158) ships
  independently and is already on main; this PR composes
  with it — the user sees the new grouping AND the inline
  `#N` chips.

## License

Public Domain (The Unlicense).
