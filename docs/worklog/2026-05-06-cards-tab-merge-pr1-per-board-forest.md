# Cards tab merge — PR 1 (per-board forest + composable signatures + orange overlay)

- **Status:** Shipped on `frontend/cards-tab-merge-pr1-per-board-forest`,
  2026-05-06. Eleven files touched (one new, two of which are docs);
  build green. First of two PRs implementing
  `docs/notes/cards-tab-merge-plan.md`. PR 2 (the actual UI tab
  restructure) ships separately and depends on this PR's
  composable signatures.
- **Genre:** Foundation — schema migration, composable signature
  changes, render-time decoration. No user-visible UI move; the
  SR and Database tabs keep their current shape and continue to
  function identically. The orange "current review card" overlay
  becomes visible on the Database tab (and any future
  `CardTreeWidget` consumer) whenever a review session is active.
- **Date:** 2026-05-06.

## Context

The motivation and full design are in
`docs/notes/cards-tab-merge-plan.md`. The plan suggests a two-PR
seam for review ergonomics: PR 1 lays the foundation
(per-board state, composable signatures, orange overlay) without
moving the UI; PR 2 collapses the SR and Database tabs into a
single Cards tab and extracts `ReviewSessionPanel`. This is PR 1.

The split is load-bearing: collapsing it into one PR would
introduce the new tab id and the schema migration in the same
PR, which would force the user through both changes at once. Two
PRs let the user sanity-check the foundation (no UI change, but
review still works) before the cosmetic restructure.

## What changed

Eleven files; broken down by phase below. ADR-0004 (full
visibility) was honoured — every modified file was read in full
before editing. ADR-0006 (file headers) — the new
`board-card-trees.ts` carries the standard header.

### Schema migration (15 → 16)

`src/store/migrations.ts`. Collapses `session.ui.srContextIds`
and `session.ui.databaseContextIds` into a single
`session.ui.cardsContextIds` field.

Seeding rule: prefer `databaseContextIds` (the form most users
were last interacting with once they realized the database tab
gave them the same pipeline preview); fall back to
`srContextIds`; fall back to `[3]`. Idempotent — a pre-existing
valid `cardsContextIds` array is preserved.

The migration **deliberately does not rewrite `activeTab`**.
Rewriting it now would leave users on the `'cards'` tab id with
no matching tab if they hydrated between this PR and PR 2
shipping. PR 2 will add that rewrite (16 → 17) along with the
matching tab id in the UI.

### Per-board card-tree state (new file)

`src/composables/board-card-trees.ts`. Module-scope reactive map
keyed by `BoardId`, holding `BoardCardTreeState` slots (forest,
active set, hydrated cards, forestStats, isLoading, error).
Mirrors `useReviewSession.pendingAnalysisAborts` and
`analysisService.activeQueryIds` in shape.

Three exports for lifecycle:

- `getOrCreateBoardCardTree(boardId)` — lazy-initialise a slot.
- `removeBoardCardTree(boardId)` — drop a single board's slot
  (called from `closeBoard`).
- `clearAllBoardCardTrees()` — drop all slots (called from
  `resetWorkspace` on identity flip).

Not persisted via SyncService. The forest, active set, and
hydrated cards are analysis-shaped data: large, regenerable
from the backend on demand, ephemeral within a session. Same
reasoning as `pendingAnalysisAborts` and the analysis ledger.

### Composable refactor: `useCardTreeData`

`src/composables/useCardTreeData.ts`. Two signature changes:

1. **Becomes a per-board projection composable.** The signature
   changes from `useCardTreeData()` to
   `useCardTreeData(boardIdRef: Ref<BoardId | null>)`. The
   returned refs become `ComputedRef`s reading from the active
   board's slot in `boardCardTrees`. Switching the input ref
   atomically swaps the projected content. Each operation
   (`loadBrowse`, `runPipeline`, `setForestStats`, `requestCard`)
   reads `boardIdRef.value` at call time and writes into that
   board's slot. Per-board reads and writes; cross-board
   isolation is automatic.

2. **`runPipeline` returns `Promise<ReviewCard[]>`.** Previously
   `Promise<void>` — the matched cards were computed but only
   written into internal state. The cards-tab-merge arc collapses
   two backend round-trips (pipeline + start-session) to one,
   and the matched-cards return value is what makes the
   collapse possible: `useReviewSession.startSession` now takes
   a prefetched queue, and the obvious orchestration is "call
   `runPipeline`, hand the result to `startSession`." Returns
   `[]` and sets `slot.error` if the pipeline produces no
   matches.

Sole call site (`ForestDirectory.vue`) updated; its `runDeck`
codepath ignores the return value (browse-only) but that's a
no-op given the discriminated semantics.

### Composable refactor: `useReviewSession.startSession`

`src/composables/useReviewSession.ts`. Signature changes from
`startSession(cardSetId: string)` to
`startSession(prefetchedQueue: ReviewCard[])`. The internal
`backendService.queryForest(...)` call is removed; the caller
is responsible for running the pipeline.

The `pendingAnalysisAborts` module-scope hoist that the plan
calls for is **already in place** — it landed in the
2026-05-04 resource-ownership audit. No further changes there.

Empty queue handling: goes straight to IDLE without spinning up
state. The caller surfaces the empty-result error to the user
(typically via the slot's `error` field or a dedicated toast).

### Orange "current review card" overlay

`src/components/charts/card-tree-echarts.ts` and
`src/components/charts/CardTreeWidget.vue`.

The adapter's `toEChartsNode` gains an optional second
parameter `currentCardId: CardId | null = null`. When a `card`
or `stub` node's id matches, the chrome `color` and
`borderColor` are overridden to `--player-white` (the orange
substrate handle whose literal value is `#f0a04a`, matching
App.vue's start button and the intermission accent). The
spec's four-role partition (active / context / stub / bucket)
stays exhaustive — orange is render-time decoration on top of
`active` or `stub`, not a fifth role.

The widget gains a `currentCardId?: CardId | null` prop with
default `null`; passes it through `buildConfigs` to
`toEChartsNode`. The chart-rebuild watcher gains
`() => props.currentCardId` as a dependency so the orange
follows the active review card across `nextCard` /
`rewindToStart` / `loadCard(n)` transitions.

The card-tree spec
(`docs/notes/card-tree-frontend-spec.md`) is updated with a
brief paragraph in the "Node roles" section acknowledging the
overlay and pointing back at the cards-tab-merge plan; the
partition's exhaustiveness is recorded as the deliberate
choice it is.

### Wiring: `ForestDirectory.vue`

Switched to `useCardTreeData(activeBoardIdRef)`. Reads the
active board's `currentCardId` from
`store.session.reviews[boardId].queue[currentIndex]` and
forwards it to `CardTreeWidget`. Re-seeds `forestStats` into
the slot when the active board changes (the slot may be
empty if the board never explored the database).

The Decks panel switches `databaseContextIds` references to
`cardsContextIds` (one read, one write site).

### Wiring: `App.vue`

Two changes:

1. SR-tab "Context IDs" input switches from `srContextIds`
   to `cardsContextIds` (one read, one write site).
2. `startEbisu` now pre-fetches the queue inline via
   `backendService.queryForest(...)` and hands it to
   `reviewSession.startSession(matched)`. Two backend calls
   collapse to one — the SR tab's behaviour is identical
   to the pre-merge version, but the codepath is now
   compatible with the new composable signature. The
   inline fetch is a transitional shape; PR 2 routes this
   through `useCardTreeData.runPipeline` so the forest
   visualisation and the review queue share one pipeline
   call.

### Resource-ownership integration: `closeBoard` / `resetWorkspace`

`src/store/index.ts`. The new per-board card-tree slot needs
the same lifecycle hygiene as every other per-board owned
resource:

- `closeBoard` now calls `removeBoardCardTree(boardId)` after
  the existing six cleanups (audit pair O12 — per-board
  card-tree state). Function docstring updated with the
  seventh enumerated cleanup.
- `resetWorkspace` now calls `clearAllBoardCardTrees()`
  alongside the existing module-scope cache purges. Privacy-
  relevant: the slot's hydrated-cards map is keyed by raw
  CardId (auto-incremented per-tenant, collision-prone across
  users), so an identity flip without this clear would let the
  prior identity's card content surface in the new identity's
  forest renderings. Function docstring updated to add this
  clear to the privacy-relevant list alongside
  `clearCardThumbnailCache`.

### Defaults and types

- `src/store/defaults.ts`: `defaultSessionUI.{srContextIds, databaseContextIds}` collapse into `cardsContextIds: [3]`.
- `src/types.ts`: `UISession` field rename mirrors defaults; comment updated to describe the merged shape and the schema-version 16 migration.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- All call sites of `useCardTreeData` and `useReviewSession.startSession` updated; type system would catch any stragglers.
- The orange overlay reactivity: `CardTreeWidget`'s sync watcher includes `() => props.currentCardId`, so a card transition (`loadCard(n)`, `nextCard`, `rewindToStart`) bumps `store.session.reviews[boardId].currentIndex` → `ForestDirectory`'s `currentCardId` computed re-fires → widget prop changes → chart re-renders with the new orange node.
- The schema migration's idempotency: re-running on a v16 blob (which has `cardsContextIds` and lacks the prior fields) is a no-op because `validArr(ui.cardsContextIds)` is true; `delete ui.srContextIds` is a no-op when the field is absent.
- Per-board isolation: switching the active board mid-pipeline-fetch writes the result into the original board's slot (the closure captures `id` at call time), so a board switch doesn't corrupt either slot.

Manual smoke (left as a follow-on observation; HMR-driven user verification):

- Start an SR session on board A — orange node appears at `queue[0]` in the Database tab's forest if visited.
- Switch to board B without an active session — Database tab shows board B's last browse state (or empty); no orange anywhere.
- Switch back to board A — Database tab restores board A's forest (preserved across the switch); orange follows the current card.
- Run a Database-tab pipeline on board A, then run another on board B — independent forests; no cross-contamination.
- Close board A mid-session — the slot is removed via `closeBoard`'s cleanup; no leak.

## Forward notes

- PR 2 picks up here: schema migration 16 → 17 rewriting `activeTab`, new `ReviewSessionPanel.vue`, `ForestDirectory` integration with the panel, `App.vue` tab restructure dropping SR / Database in favour of Cards.
- The TODO entry "Cards tab merge" stays in the Active Medium tier until PR 2 lands; the plan note's two-PR phasing is the agreed shape, and a partial close is misleading.
- The card-tree spec's "Open questions" section at the end may grow a closure note in PR 2 acknowledging the orange overlay decision is implemented; held for PR 2 to keep the spec changes paired.
- Resource-ownership audit pair O12 is a new entry in the audit's bookkeeping; the plan at `docs/notes/resource-ownership-audit-plan.md` should grow a row covering closeBoard / resetWorkspace's per-board card-tree cleanup. Held for the PR 2 merge so the audit plan retrofit is one edit covering the full arc.
