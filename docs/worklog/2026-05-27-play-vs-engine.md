# Play vs Engine — head-pointer per session

- **Status:** Branch `frontend/play-vs-engine`; awaiting user
  end-to-end test before PR open. Three commits on the branch
  reflecting the iteration: data-model foundation (`eab103e`),
  initial composable + UI (`e5db545`), design revision per user
  clarification (this commit).
- **Genre:** New feature. Per-board state addition (schema 52),
  one new composable, one new modal, Toolbar + App.vue +
  TreeWidget wiring, 16 new i18n strings.
- **Date:** 2026-05-27.

## Design

**Game identity = session.** Starting a "play vs engine" session
records the *current node* as the session's start (immutable
identity key on the board) along with the engine config. Each
session has exactly ONE green ring at any time — its
`currentHeadNodeId` — and that ring moves forward as the game
progresses.

The user plays a move FROM the green ring → the engine queries
the resulting position → the engine plays its response → the
green ring advances to the position AFTER the engine's response
(the new user-turn node).

- Off-line navigation does nothing (cursor away from the head =
  no trigger).
- Plays from non-head nodes don't fire the engine (the user can
  freely explore variations).
- Multiple sessions on one board → multiple green rings, one per
  session. The user navigates to whichever head they want to
  play in.
- Sessions persist across browser restarts via SyncService's
  existing deep-watch.

**Stop affordance:** the modal's "Active games on this board"
list shows each session with start move + current head move + its
config; "End" removes the whole session entry.

**Collisions explicitly undefined:** two sessions whose heads
coincide → the responder picks whichever entry it iterates first.
KataGo's per-query nondeterminism makes the case rare; the user
flagged this as acceptable.

## Shape of the change

### Data model (commit `eab103e`, value shape revised in this commit)

- `types.ts` — `EnginePlayGameConfig` (frozen at session start)
  + `EnginePlayGameSession` (`{ config, currentHeadNodeId }`).
  `BoardState.games: Record<NodeId, EnginePlayGameSession>` —
  keyed by the session's start NodeId (stable identity), value's
  `currentHeadNodeId` advances each round.
- `board-factory.ts` — fresh boards start with `games: {}`.
- `store/index.ts` — `normalizeBoard` backfills `games: {}` and
  drops legacy entries that don't conform to the
  `{ config, currentHeadNodeId }` shape (defensive against
  in-branch test data from the prior descendant-tree design;
  persisted blobs from main never have either shape because the
  schema-52 migration backfills `{}`).
- Schema bump 51 → 52 with backfill migration; per the
  rolling-archive discipline, migration 49 → 50 moves to
  `archived-migrations.ts`.

### Engine responder (`useEngineResponder.ts`)

Single async verb: `fireAndAdvanceHead(boardId, gameStartNodeId)`.
Queries the engine at the board's current position via
`queryEngineMove` (the pure primitive from `usePlayFromPosition`
— opens its own KataGoClient via `connectFresh`, independent of
the analysis-service singleton), applies the engine's top move
via `applyGoMove` + `updateBoardState`, then mutates the named
session's `currentHeadNodeId` to the post-engine-move position.

No reactive watcher — the responder is invoked explicitly by
the caller (`App.vue::handleBoardMove` when the user plays from
a head, or `handleStartGame` when start-position is an
engine-turn node). This is the "much simpler" shape the user
called for, vs the prior subtree-walking responder that fired on
any cursor change inside a game's descendant tree.

Per-board `inFlight` flag guards re-entry. Stale-query guards
(cursor moved during query, session ended during query) drop
the response silently rather than playing into an unrelated
position.

`findGameByHead(board, headNodeId)` is exported for App.vue's
use — walks `board.games` looking for a session whose head
matches; returns the start NodeId so the caller can pass it back
to `fireAndAdvanceHead`. O(games-per-board) per call, which is
bounded by a small constant in practice.

### Modal (`PlayEngineModal.vue`)

Two sections in one surface:

1. **Active games on this board** — every session listed with
   start move number + current head move number + user color +
   visits, plus a per-row "End" button. Empty state when no
   sessions.
2. **Start new game at current position** — form (user color,
   engine model if SELECTOR, engine max visits).

Emits `start-game` (App.vue creates the session entry and kicks
the responder if the start position is engine's turn) and
`end-game` with the start NodeId (App.vue deletes the entry).

### Tree highlight (`TreeWidget.vue`)

Optional `gameHeadIds?: ReadonlySet<NodeId>` prop. Each node
whose id is in the set renders a green ring at radius
`NODE_R + 5` — outermost ring so the existing current-node
accent ring at `NODE_R + 3` stays visible when both apply.
`--state-success` is the green substrate token (sibling to
`--state-attention` red used for the modal's "End" buttons and
the Stop Match border).

App.vue computes `activeBoardGameHeadIds` from
`Object.values(activeBoard.value.games).map(g => g.currentHeadNodeId)`
and threads it through. Reactive: `currentHeadNodeId` updates
on each engine response, so the green ring relocates without
manual re-render.

### Toolbar + App.vue wiring

- `Toolbar.vue` — new PLAY button next to MATCH; emits
  `open-play`.
- `App.vue`:
  - Imports modal + composable; mounts the responder.
  - Holds the modal ref; `triggerPlay` opens it on toolbar click.
  - `handleStartGame`: writes the new session
    (`currentHeadNodeId = start`); if start's `board.turn` ==
    engine's color, immediately fires `fireAndAdvanceHead` so
    the engine plays first.
  - `handleEndGame(startNodeId)`: deletes the entry.
  - `handleBoardMove`: captures `prevNodeId` and
    `findGameByHead(...)` BEFORE `applyGoMove`. After the move
    lands (`applyGoMove` + `updateBoardState`), if `prevNodeId`
    was a game's head, fires `fireAndAdvanceHead` for that
    session. Off-line moves (cursor not at a head) don't trigger.
  - `activeBoardGameHeadIds` computed → TreeWidget's `game-head-ids`.

### i18n strings

16 new `en.json` keys: `playEngine.*` (modal title, subtitle,
field labels, button labels, error messages, active-game-list
labels) + `toolbar.play`. Other locale catalogs intentionally
not updated here — vue-i18n's fallback chain renders the English
source until the next i18n sweep PR backfills translations
(matches the existing per-locale-tier discipline).

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline; no test surface touched).

User-side validation:

1. Open a board, click PLAY → modal opens with empty active-
   games list. Pick a color (whichever you want to play), pick
   the engine (if SELECTOR), set visits, "Start game". Modal
   closes; current node gets a green ring.
2. If it's the engine's turn at the start (e.g., you picked
   White at a White-to-play position), the engine plays
   immediately and the green ring advances to the
   post-engine-move position (your turn).
3. Click the board to play your move. The engine responds; the
   green ring advances forward to the new user-turn position.
   The PREVIOUS green ring is gone.
4. Play several moves back and forth. Each round, the green
   ring tracks the current user-play position.
5. Navigate to an earlier position in the game's line (off the
   head). No green ring at the earlier position (heads have
   moved on); playing from there → no engine response (you're
   off-line, free exploration).
6. Navigate to a position OUTSIDE the game's line entirely (a
   sibling variation you're studying). Same as #5 — no engine
   trigger.
7. Navigate back to the head (where the green ring still is) →
   playing from there → engine resumes.
8. Open the modal again. The active game appears with start +
   current head move numbers. Click "End" — green ring
   disappears, session removed.
9. Start a SECOND session at a different position. Two green
   rings on the board, one per session. Play from either —
   that session's ring advances; the other is unaffected.
10. Reload the SPA. Sessions persist (schema 52 + SyncService).
11. Switch boards. The first board's sessions are still there;
    the active board's sessions are what the responder operates
    on.
12. Multi-tasking: a range / ponder query on a non-active board
    keeps flowing while you're playing vs engine on the active
    board.

## Scope-explicit non-goals

- **Tree-context-menu path for end-game.** The modal is the
  canonical management surface in v1.
- **Per-session config editing post-start.** End + restart.
- **Highlight on prior-head nodes (game history).** The green
  ring is exactly the current head per the user's clarification
  ("only one node that is responsive to that modality of
  interacting with the SPA"). No history coloring.
- **Pause / resume semantics.** A session either exists
  (engine responds at head) or doesn't.
- **"Engine is thinking" indicator on the board.** The toolbar's
  existing queue tooltip surfaces in-flight queries; no extra
  per-board indicator was added.
- **i18n catalogs other than `en`.** Deferred to the next i18n
  sweep PR.
- **Pass moves.** Out of scope for v1; handleBoardMove takes
  (x, y), no pass routing.

## What stays

The `games: Record<NodeId, EnginePlayGameSession>` substrate is
now available for similar per-board node-keyed annotation
patterns (favourite-position bookmarks, custom-named positions,
etc.) if those land later. The "single moving green ring" pattern
generalises: any feature that wants a per-session cursor in the
game tree can follow the same shape.

The responder's `findGameByHead` helper is exported so a future
surface (e.g., a tree-tooltip explaining the green ring) can
query the same head relation.

License: Public Domain (The Unlicense)
