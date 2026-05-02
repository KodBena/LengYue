# Cards Tab Merge — Design Note

**Status:** Planned (2026-05-02). Not yet implemented. This document
captures the chosen direction and the reasoning behind it so the
feature can be picked up later without re-deriving the trade-offs.

**Motivation:** the current SR and Database control-panel tabs both
render a deck-config form (deck dropdown + context-ids input) that
drives a pipeline run; the SR form starts a review session, the
Database form populates the forest. The duplication is a real DRY
violation. Independently, the user wants to see SR progress on the
fetched forest — the current review card highlighted in orange against
the existing blue active-set rendering. Both motivations resolve
cleanly when the forest, the review queue, and the deck-config form
share a single tab.

---

## Decision

Merge the SR and Database tabs into a single **Cards** tab whose
visual shape matches the current `ForestDirectory` (Decks / Roots
subtabs preserved). The Decks subtab gains a **"Start review session
from this configuration"** button. In-session review controls move
into a new `ReviewSessionPanel` rendered inline in the Decks left
panel while a session is active; the forest stays visible on the
right throughout.

Forest state, active set, hydrated cards, and per-tree stats become
**per-board**, mirroring the existing per-board convention for review
session state. The current SR card is highlighted in orange in the
forest; the highlight is a render-time overlay independent of the
projection's role partition (active / context / stub / bucket).

Active sub-tab selection in the control panel remains
**workspace-global** (today's behaviour). UI affordance state
intentionally does not flip on board change; only content that is a
projection of the active board does.

---

## Context — why per-board forests

The frontend's existing convention is that anything that is a
projection of "the work happening on this board" is per-board:
`store.session.reviews[boardId]` for review session state,
`store.boards[i]` for board state, `AnalysisControls` keyed off
`activeBoardId` for the analysis tab. UI affordances
(`activeTab`, panel widths, `treeExpanded`, etc.) are workspace-global.

Once a review session and a forest are linked by a single pipeline
run, the forest is logically a projection of the session — and a
session is a projection of a board. Holding the forest as a single
workspace-global slot would create a new asymmetry: switching boards
would change the session under the user (correct) but not the forest
(incorrect — the orange highlight would silently misalign, or the
active set would belong to the wrong session).

The per-board model extends the existing convention rather than
inventing a third scope.

A more general survey of UX patterns (VS Code sidebar, IntelliJ tool
windows, Photoshop / Figma inspector panels, browser DevTools) and
the supporting principles (Nielsen heuristic 4, principle of least
astonishment) was taken before the choice; the convergent rule is
"UI affordances stay global; content scoped to whatever it
projects." See the surrounding session log for the full survey if
the rationale needs to be revisited.

---

## Design

### Tab structure

`controlTabs` shrinks from `[sr, database, settings, analysis,
other]` to `[cards, settings, analysis, other]`. The Cards tab body
is `<ForestDirectory @load-card="handleLoadCard" />`, unchanged in
external interface. Its left panel (Decks subtab) hosts either the
deck-config form *or* the in-session review controls, depending on
review state.

### Decks subtab — idle state

The deck-config form (deck dropdown, context-ids input) renders as
today, with two action buttons:

- **Run pipeline** — populates the forest in browse mode (active
  set + matched-card hydration + per-tree stats). Does not start a
  review.
- **Start review session from this configuration** — runs the same
  pipeline, then immediately starts a review session on the active
  board with the matched cards as the queue. One backend call.

Both buttons disabled while a session is active (`state !== 'IDLE'`
and `state !== 'FINISHED'`) to prevent forest/queue divergence.

### Decks subtab — in-session state

A new `ReviewSessionPanel` component replaces the deck-config form
in the same slot, hosting the controls currently in the SR tab:
status, card N/M counter, intermission `BaseChart`, moves-made line,
visits override row, Skip / Next / Rewind buttons. The forest panel
on the right remains visible the whole time.

### Roots subtab

Unchanged. `loadBrowse(rootCardId)` writes into the active board's
forest slot; switching boards swaps the displayed browse view to
that board's last state (or empty). No review-start affordance —
Roots is browse mode, sessions start from Decks.

### Orange overlay — current review card

`CardTreeWidget` accepts `currentCardId?: CardId | null`. The echarts
adapter (`card-tree-echarts.ts::toEChartsNode`) takes the same value
as a parameter and overrides:

- `kind: 'card'` nodes where `cardId === currentCardId` —
  `itemStyle.color` becomes `COLOR_CURRENT` (`#f0a04a`, the existing
  orange used in `App.vue` start button and intermission), border
  becomes white. Symbol size and border width unchanged from the
  active branch.
- `kind: 'stub'` nodes where `cardId === currentCardId` — border
  switches from `COLOR_STUB_ACTIVE_BORDER` (blue) to the orange.

The current-card concept is **not** added to the projection's role
partition. The spec at `card-tree-frontend-spec.md` enumerates four
roles (active / context / stub / bucket) and the partition stays
exhaustive. Orange is a render-time decoration on top of `active` or
`stub`, orthogonal to pipeline membership.

---

## Per-board state structure

Forest state moves out of `ForestDirectory.vue`'s local refs into a
module-level reactive map keyed by `BoardId`. Mirrors the spirit of
`pendingAnalysisAborts` in `useReviewSession.ts` — ephemeral session
state, not persisted via `SyncService` (analysis-shaped data, large,
regenerable from backend).

```ts
// src/composables/board-card-trees.ts
interface BoardCardTreeState {
  forest: CardLineageTree[];
  activeSet: ReadonlySet<CardId>;
  cards: ReadonlyMap<CardId, ReviewCard>;
  forestStats: ReadonlyMap<CardId, ForestStat>;
  isLoading: boolean;
  error: string | null;
}

const boardCardTrees = reactive(new Map<BoardId, BoardCardTreeState>());

export function removeBoardCardTree(boardId: BoardId): void { ... }
```

`useCardTreeData(boardIdRef: Ref<BoardId | null>)` becomes a
projection composable: takes the active-board ref, returns reactive
refs that read from `boardCardTrees.get(boardIdRef.value)` and
mutate the same slot. Switching boards swaps the returned content
atomically. Same shape as `useReviewSession(boardIdRef)`.

Lifecycle: a slot is lazily initialised on first read or first
write for a board id. Removed by `removeBoardCardTree` when a board
is closed (wherever board removal lives — to be confirmed at
implementation time; if no board-removal flow exists today, the map
is naturally GCable on page reload since it's not persisted).

### Composable consolidation

To make multi-instance `useReviewSession` calls safe (the new
`ReviewSessionPanel` will instantiate it independently of `App.vue`),
hoist its internal `pendingAnalysisAborts` map to module scope, same
shape as `boardCardTrees`. The composable becomes a pure projection
over per-board state. Two callers can each call `processUserMove` /
`loadCard` and the abort scope stays correctly per-board.

Alternative: keep one instance in `App.vue` and `provide`/`inject`
to descendants. The hoist is preferred for consistency with the
forest treatment (one pattern across all per-board ephemeral state).

---

## Linkage — single pipeline call

`useCardTreeData.runPipeline` is augmented to return its matched
card list (it computes it locally already; today the list is only
written into internal state):

```ts
- runPipeline: (deck: CardSet, contextIds: number[]) => Promise<void>
+ runPipeline: (deck: CardSet, contextIds: number[]) => Promise<ReviewCard[]>
```

`useReviewSession.startSession` is restructured to accept a
pre-fetched queue rather than fetching internally:

```ts
- async function startSession(cardSetId: string)
+ async function startSession(prefetchedQueue: ReviewCard[])
```

Internal `backendService.queryForest(srContextIds, pipeline)` call is
removed. The cardSetId argument is dropped (unused after the change).

The "Start review session" button in `ForestDirectory` orchestrates
both:

```ts
async function startReviewFromConfig() {
  const deck = store.profile.cardSets[selectedDeckId.value];
  const matched = await tree.runPipeline(deck, store.session.ui.cardsContextIds);
  if (matched.length > 0) await reviewSession.startSession(matched);
}
```

Two backend calls collapse to one. The forest's active set and the
review queue are by-construction the same set of cards.

---

## Schema migration 11 → 12

Three field changes to the persisted blob:

1. `session.ui.srContextIds` and `session.ui.databaseContextIds`
   collapse into `session.ui.cardsContextIds` (a single
   `number[]`). Seed from `databaseContextIds` if present and
   non-empty (the form survives visually as "Database looks
   today"); fall back to `srContextIds`; fall back to `[3]`.
2. `session.ui.activeTab` values `'sr'` and `'database'` rewrite
   to `'cards'`. Other values pass through.
3. `defaults.ts::defaultSessionUI.activeTab` becomes `'cards'`;
   `cardsContextIds: [3]` replaces the two old fields.

`CURRENT_SCHEMA_VERSION` bumps to 12. Migration is idempotent and
order-independent within itself. Append-only invariant honoured;
prior migrations untouched.

The `cardsContextIds` field stays **single-valued at the UI level**,
not per-board. The form is transient form input — what the user
typed for the next pipeline run. Per-board persistence of form
fields is a separate UX call that can be reopened later if
warranted; today's `srContextIds` / `databaseContextIds` are global
too, so the choice preserves existing behaviour.

---

## Touch list

In rough phase order (see "Phasing" below):

**Schema and types**
- `src/store/migrations.ts` — append 11 → 12 migration; bump
  `CURRENT_SCHEMA_VERSION` to 12.
- `src/store/defaults.ts` — drop `srContextIds` and
  `databaseContextIds`; add `cardsContextIds: [3]`; default
  `activeTab` becomes `'cards'`.
- `src/types.ts` — same field rename in `UISession`.

**Per-board ephemeral state**
- `src/composables/board-card-trees.ts` (new) — module-level
  reactive map, `removeBoardCardTree` helper.
- `src/composables/useCardTreeData.ts` — restructure to a
  projection composable taking `Ref<BoardId | null>`; reads/writes
  the map. `runPipeline` returns matched cards.
- `src/composables/useReviewSession.ts` — hoist
  `pendingAnalysisAborts` to module scope; restructure
  `startSession` to take a prefetched queue.

**Render-time overlay**
- `src/components/charts/card-tree-echarts.ts` — add
  `currentCardId` parameter to `toEChartsNode`; add
  `COLOR_CURRENT` constant; orange override for matching `card`
  and `stub` nodes.
- `src/components/charts/CardTreeWidget.vue` — accept
  `currentCardId` prop; pass to adapter; pass through in
  `buildConfigs`.

**UI restructure**
- `src/components/ReviewSessionPanel.vue` (new) — in-session
  controls; ADR-0006 header; ADR-0007 budget (target ≤150 lines).
- `src/components/ForestDirectory.vue` — accept
  `currentBoardId`; instantiate per-board `useCardTreeData`; pass
  `currentCardId` to widget; render either deck-config form
  (idle) or `ReviewSessionPanel` (active) in left panel; "Start
  review session" button orchestrating combined flow.
- `src/App.vue` — drop `#sr` and `#database` templates; replace
  with single `#cards` template containing `ForestDirectory`;
  remove imports / locals only used by SR (`BaseChart`,
  `intermissionSeries`, `startEbisu`, `handleVisitsOverrideChange`).
  `controlTabs` shrinks accordingly.

**Documentation**
- `docs/notes/card-tree-frontend-spec.md` — add a brief note
  acknowledging the orange "current review card" overlay, with a
  pointer that the four-role partition is unchanged.
- `docs/notes/frontend-backlog.md` — strike "SR ↔ analysis tab
  independence" if applicable (verify at execution time; it may
  remain a separate concern).
- `docs/handoff-current.md` — update the "frontend" section if
  anything in the architectural snapshot references the old
  `sr`/`database` tab names.
- `docs/notes/cards-tab-merge-plan.md` (this document) — close
  out with status "Implemented" once shipped, with a back-pointer
  to the worklog entry.

---

## Verification

- No business logic in components: `ReviewSessionPanel` is wiring;
  `ForestDirectory` is orchestration over composables.
- No wire shapes outside the ACL: changes touch only domain types
  (`ReviewCard`, `CardId`, `UISession`); `backend-service.ts`
  unchanged.
- No `as` without justification: existing widening casts in
  `useCardTreeData` are preserved; no new ones.
- ADR-0001: per-board map mutation goes through named writes only;
  reactive refs returned from the composable are
  `readonly()`-wrapped where the consumer should only read.
- ADR-0002 fail-loud: `startSession([])` is rejected upstream
  (button disables when matched.length === 0 after the pipeline
  call); empty-pipeline-result error already surfaces via
  `tree.error`.
- ADR-0006: header on the new `ReviewSessionPanel.vue` and
  `board-card-trees.ts`.
- ADR-0007: `App.vue` shrinks by ~80 lines; new panel ~120 lines;
  adapter file gains ~10 lines (current-card branch). Net
  win on file-budget pressure.
- `npm run build` (`vue-tsc -b && vite build`) green at each
  phase boundary.
- Smoke (manual):
  - Start session from Decks panel — orange node appears at
    `queue[0]`, advances on Skip/Next, returns to start on Rewind.
  - Switch boards mid-session — control panel sub-tab unchanged
    (workspace-global); forest + review-state swap to the new
    board's content.
  - Two parallel sessions on two boards — orange follows the
    active board.
  - Roots subtab on board A then switch to board B — B shows
    its own browse state (or empty).
  - Re-hydrate a v11 blob: `cardsContextIds` populated;
    `activeTab` rewritten from `'sr'` or `'database'` to
    `'cards'`.

---

## Phasing

Two-PR split is natural; the seam minimises the risk of a
half-cohered intermediate.

**PR 1 — Per-board forest + composable signature changes (no UI move).**
- Schema migration 11 → 12 (field rename only; `activeTab`
  rewrite included so v11 blobs land cleanly).
- Hoist `pendingAnalysisAborts`; restructure `startSession`.
- `useCardTreeData` becomes per-board projection.
- Orange overlay (echarts adapter + widget prop).
- Old SR tab unchanged in shape, but its `startSession` call
  passes a prefetched queue from a small inline pipeline call.
- Shippable; SR / Database UI still as today; the orange shows
  on the (still-separate) Database tab when a session is active.

**PR 2 — Tab merge.**
- New `ReviewSessionPanel` extraction.
- `ForestDirectory` integration.
- `App.vue` tab restructure.
- Documentation updates.

If the user prefers a single PR, that is also fine — the split is
for review-ergonomics, not technical necessity.

---

## Open questions for execution time

1. **Per-board cleanup hook.** Where is a board removed from
   `store.boards`? `removeBoardCardTree` should be wired to the
   same point. If no removal flow exists today, defer the wire
   (the map is GCable on reload).
2. **`cardsContextIds` scope revisit.** If the workflow turns out
   to be "each board habitually uses different context-ids,"
   per-board form state is a small follow-up. Not in scope for
   this change.
3. **"Run pipeline" button with no review.** Preserved as today's
   browse-only action. If telemetry or feel suggests users only
   ever press "Start review session," the button could be retired
   in a follow-up.

---

## License

Public Domain (The Unlicense).
