# Play vs Engine — game-roots as tree-node annotations

- **Status:** Branch `frontend/play-vs-engine`; awaiting user
  end-to-end test before PR open. Multiple commits on the branch
  for bisectability (data model first, then composable + UI).
- **Genre:** New feature. Per-board state addition (schema 52),
  one new composable, one new modal, Toolbar + App.vue + TreeWidget
  wiring, 16 new i18n strings.
- **Date:** 2026-05-27.

## Design

**Game identity = node identity.** Starting a "play vs engine"
session records the *current node* as a "game-root" on the active
board with the chosen engine config. The annotation is persistent
on the board (round-trips through `SyncService`); the engine
watches the cursor and responds whenever the user is at a
descendant of any game-root and it's the engine's color's turn.

The user can have multiple game-roots on a single board (multiple
parallel games on the same board, each with its own config). The
engine "follows the cursor" — navigating into a game-root's
descendant tree at an engine-turn node triggers the engine response.
Navigating elsewhere does nothing.

Persistence: per-board `games` map lives inside `BoardState` → the
existing SyncService deep-watch handles round-tripping. A schema-52
migration backfills `games: {}` for legacy persisted boards.

Multi-board: each board has its own `games` map; the responder
watches the active board only, but games on background boards
persist and resume when the user switches to them.

Stop affordance: the modal's "Active games on this board" section
lists every game-root with an "End" button. Per the design
discussion, no separate tree-context-menu path in v1 — the modal
is the single management surface.

Behaviour explicitly undefined: two games whose descendant trees
overlap. KataGo's nondeterminism makes collision rare; the
responder picks whichever game-root the ancestor walk finds first.

## Shape of the change

### Data model (commit `eab103e`)

- `types.ts` — new `EnginePlayGameConfig` interface
  (`userColor`, `engineMaxVisits`, `engineModel`); new `games:
  Record<NodeId, EnginePlayGameConfig>` field on `BoardState`.
- `board-factory.ts` — fresh boards start with `games: {}`.
- `store/index.ts` — `normalizeBoard` backfills `games: raw.games
  ?? {}` for legacy persisted boards arriving via SyncService
  hydrate.
- `migrations.ts` — schema bump 51 → 52 with backfill migration;
  per the rolling-archive discipline, migration 49 → 50 moves to
  `archived-migrations.ts` so the active file keeps the two
  latest as style anchors.

### Engine responder (`useEngineResponder.ts`)

Watches the active board's `(currentNodeId, gamesKey)` tuple. On
change: walks parents from currentNodeId to find a game-root
ancestor; if found and it's the engine's color's turn at the
current node, fires `queryEngineMove` (the pure primitive from
`usePlayFromPosition`) using the per-game `engineMaxVisits` and
`engineModel`. The engine query opens its own KataGoClient via
`connectFresh` — same posture as `usePlayMatch`, independent of
the analysis-service singleton.

Doesn't fire on board-switch (matches the "Follow Me" ponder
watcher's posture in `App.vue`). Per-board `inFlight` flag prevents
double-firing. Stale-query guard: if the user navigates away
mid-query, the response is dropped silently rather than played at
the (now-different) position.

Exposes `tryFireResponder(boardId)` for synchronous kick from the
modal's "Start game" handler — the engine opens the game
immediately if it's its color's turn at the start position, without
waiting for the reactive watcher's next tick.

### Modal (`PlayEngineModal.vue`)

Two sections in one surface:

1. **Active games on this board** — every game-root listed with
   its config summary ("Move N, you play [B/W], V visits") and an
   "End" button per row. Empty state when no games active.
2. **Start new game at current position** — form mirroring
   `EngineMatchModal`'s shape: user color (B/W), engine model
   (SELECTOR-mode dropdown), engine max visits. SELECTOR-mode
   gating identical to the match modal so the LEAF-mode collapse
   reads as one consistent UX.

Emits `start-game` (App.vue's handler adds a `games[currentNodeId]`
entry and kicks the responder) and `end-game` (removes the entry).

### Tree highlight (`TreeWidget.vue`)

New optional `gameRootIds?: ReadonlySet<NodeId>` prop. Each game-
root node renders a green ring at radius `NODE_R + 5` —
outermost ring so the existing current-node accent ring at
`NODE_R + 3` stays visible when both apply (the user is on a game-
root). `--state-success` is the green substrate token (sibling to
`--state-attention` red used for the modal's "End" buttons and
the Stop Match border).

App.vue computes `activeBoardGameRootIds` from
`Object.keys(activeBoard.value.games)` and passes it through.

### Toolbar + App.vue wiring

- `Toolbar.vue` — new PLAY button next to MATCH; emits `open-play`.
- `App.vue` — imports the modal + composable, mounts the
  responder, holds the modal ref, handles the start-game /
  end-game events (mutateBoard + responder kick on start), wires
  the toolbar listener, threads the game-root ids to TreeWidget.

### i18n strings

16 new keys in `en.json` (`playEngine.*` and `toolbar.play`).
Other locale catalogs (`zh-CN / ja / ko`) intentionally not
updated here — vue-i18n's fallback chain renders the English
source until the next i18n sweep PR backfills translations
(matches the existing per-locale-tier discipline).

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline; no test surface touched).

User-side validation:

1. Open a board (any position). Click PLAY on the toolbar → modal
   opens.
2. With no games yet, the "Active games" list is empty. Pick a
   color, pick the engine (if SELECTOR), set visits, click "Start
   game". Modal closes. The current node's tree marker gets a
   green ring. If it's the engine's turn at the start, the engine
   plays immediately.
3. Play your color's move (click the board). The engine should
   respond shortly after. Continue back and forth.
4. Navigate to an earlier position inside the game's tree. If
   it's the engine's turn there, engine plays (creating a branch
   if a different continuation than the existing one). If it's
   your turn, engine waits.
5. Navigate to a position OUTSIDE the game's tree (e.g., a
   sibling variation not descended from the game-root). Engine
   doesn't fire.
6. Open the modal again — the active game appears in the list.
   Click "End" — the green ring disappears; the engine stops
   responding to that game's tree.
7. Start a SECOND game at a different position. Both games' roots
   should have green rings; engine responds in whichever you're
   inside.
8. Reload the page (or restart the SPA). The games persist via
   SyncService — same green markers, same configs, engine resumes
   following the cursor.
9. Switch to another board. The first board's games are still
   there (unaffected by board switch); the active board's games
   are what the responder follows.
10. Multi-tasking: a range / ponder query on a non-active board
    keeps flowing while you're playing vs engine on the active
    board.

## Scope-explicit non-goals

- **Tree-context-menu path for end-game.** Modal-based delete is
  sufficient for v1; a tree-node right-click context menu would
  need new infra and felt out of scope. Adding it later is
  additive (the modal stays as the canonical management surface).
- **Per-game-config editing post-start.** End and re-create.
- **Visual indicator on game-DESCENDANT nodes.** The green ring
  marks game-roots only; descendants get no special chrome.
  Could be added if the user wants "you're inside game X"
  feedback beyond the engine playing.
- **Pause / resume semantics.** A game-root annotation either
  exists (engine plays when conditions match) or doesn't (no
  trigger). No paused state.
- **"Engine is thinking" indicator on the board.** The toolbar's
  existing queue tooltip surfaces in-flight queries; no extra
  per-board indicator was added.
- **i18n catalogs other than `en`.** Deferred to the next i18n
  sweep PR.

## What stays

The `games` substrate is now available for any future per-board
node-keyed annotation pattern. The responder's
`findGameRootAncestor` helper is exported so a future surface
(e.g., a tree-tooltip explaining the green ring) can query the
same ancestor relation. The "modal-as-management-surface for
per-board annotated state" pattern composes naturally with
similar features (favourite-position bookmarks, custom-named
positions, etc.) if those land later.

License: Public Domain (The Unlicense)
