/**
 * docs/worklog/2026-05-06-forest-tree-nav-wire-in.md
 * Worklog — PR 3 of the Forest Directory hierarchical redesign
 * arc: wiring ForestTreeNav into ForestDirectory.vue, the
 * loadBrowseForest data-layer entry point, the MULTI_ROOT_DISPLAY_CAP
 * constant, and the useForestBrowsePolicy composable that
 * orchestrates selection-to-fetch dispatch.
 * License: Public Domain (The Unlicense).
 */

# Forest Directory hierarchical redesign — wire-in (PR 3 / closer)

- **Status:** Shipped on `frontend/forest-tree-nav-wire-in`,
  2026-05-06. Five files touched (one new); build green; the
  flat-list Roots tab is gone, the file-manager nav drives the
  right pane through a persisted selection. Closes the Forest
  Directory hierarchical redesign arc.
- **Genre:** Wire-up + data-layer + orchestration; closes the
  arc opened by `docs/notes/forest-directory-hierarchy-redesign.md`.
- **Position in the arc:**
  - PR 0 (`frontend/foreststat-tagstat-acl`, merged): ACL
    translators.
  - PR 1 (`frontend/forest-navigation-composable`, merged):
    `useForestNavigation` composable + schema migration 20 → 21.
  - PR 2 (`frontend/forest-tree-nav-component`, merged):
    `ForestTreeNav.vue` SFC.
  - **PR 3 (this one):** wire-in + data-layer + orchestration.
- **Date:** 2026-05-06.

## What this PR does

Replaces the flat-list Roots tab in `ForestDirectory.vue` with the
file-manager `ForestTreeNav`, threads the persisted selection
through a small orchestration composable to the data layer, and
adds the multi-root browse-mode entry point on `useCardTreeData`.
The arc now ships end-to-end:

1. User loads roots via `getForestStats()` (existing path,
   unchanged).
2. `useForestNavigation(roots)` projects roots into a `games →
   roots` hierarchy and exposes the persisted expanded-set +
   selection (PR 1's composable).
3. `ForestTreeNav` renders the hierarchy with click-to-toggle
   chevrons and click-to-select rows; mutations write through
   to `store.session.ui.forestNav` (PR 2's SFC).
4. `useForestBrowsePolicy(nav, tree, browseError)` watches the
   selection (and `nav.nodes`) and dispatches to `tree.loadBrowse`
   / `loadBrowseForest` / `clearBrowse` based on the selection
   kind and the cap. New in this PR.
5. `useCardTreeData.loadBrowseForest(rootCardIds)` fetches each
   tree in parallel and combines into the slot's forest. New in
   this PR.

## What changed

Five files. One new composable, four modifications.

### `src/engine/constants.ts` — `MULTI_ROOT_DISPLAY_CAP = 8`

The fetch-side cap on game-node selection. A game with N roots
where N ≤ 8 auto-loads all trees; past 8, the parent shows a
guidance message and requires sub-selection. The 276-root case
in the user's actual data sits well past this cap.

The cap is on the FETCH side, not the render side. `CardTreeWidget`'s
vertical-stack-with-one-expanded layout handles modest
trees-per-forest counts without visual squeeze; the constraint
is parallel `fetchTreeByRoot` calls + per-tree CTE costs. 8 is
the default; tuning consideration (drop to 4 if right pane feels
crowded for 5-7 root games; raise to 16 if users routinely have
that many they want to "show all") recorded inline.

### `src/composables/useCardTreeData.ts` — `loadBrowseForest` + `clearBrowse`

Two new entry points on the `CardTreeData` interface. Both write
into the active board's slot in `board-card-trees.ts`.

- `loadBrowseForest(rootCardIds: CardId[])`: parallel
  `fetchTreeByRoot` calls; per-root failures aggregate (same
  pattern as `populateSlotFromMatched`'s pushSystemMessage
  surface, ADR-0002-aligned). No active set / hydrated cards
  (browse semantics, not pipeline).
- `clearBrowse()`: drops the slot's browse state (forest, error,
  isLoading) without a fetch. Called when selection becomes
  null.

### `src/composables/useForestBrowsePolicy.ts` — new file (88 lines)

The orchestration composable. Subscribes to
`[nav.selection, nav.nodes]` and dispatches to the data layer:

- `null` → `clearBrowse()`.
- `root` → `loadBrowse(rootCardId)`.
- `game ≤ cap` → `loadBrowseForest(rootCardIds)`.
- `game > cap` → set `browseError` to a guidance message; clear.

Why a composable rather than inlined in the SFC: the policy is a
real concept ("how does the navigator drive the right pane") and
naming it makes it findable when future contributors ask the
question. The cap policy lives at the boundary between navigation
state and data-layer effects — a shape composables encapsulate
well.

Why watch both `nav.selection` and `nav.nodes`: the game-kind
branch needs `nav.nodes` to look up `game.roots.length`. Nodes
resolve asynchronously after `forestStats` loads in the parent's
onMounted; without the dual-source watch, an `immediate: true`
fire on mount with empty nodes wouldn't refire when nodes
populate. Vue's tuple-source watcher refires when either ref's
identity changes.

### `src/components/ForestDirectory.vue` — flat-list out, navigator in

Changes:

- Imports `useForestNavigation`, `useForestBrowsePolicy`,
  `ForestTreeNav`. Drops the no-longer-needed `MULTI_ROOT_DISPLAY_CAP`
  + `watch` direct imports (the policy composable owns those).
- Constructs `nav = useForestNavigation(roots)` alongside the
  existing `tree = useCardTreeData(boardIdRef)`.
- Adds `browseError: Ref<string | null>`. Distinct from
  `tree.error` (fetch failure) — `browseError` is a UX cap.
- Calls `useForestBrowsePolicy(nav, tree, browseError)` to install
  the selection→fetch dispatcher.
- Drops `activeRootId`, `selectRoot()` — the composable owns
  selection state.
- Drops the auto-select-first-root logic from `onMounted` — let
  the persisted `nav.selection` (or null for fresh users) drive.
  The watcher's `immediate: true` handles the mount-time fire.
- Replaces the Roots-tab flat list with
  `<ForestTreeNav :nav="nav" />`. Tab key/label `'roots'` →
  `'browse'`.
- Right-pane empty-state cascade extended: `tree.isLoading` →
  `browseError` → `tree.error` → no-forest-yet guidance ("Select
  a game or root in the navigator.").
- Drops the now-unused `.roots-list` / `.root-card` / `.root-*`
  CSS rules.

Net file size: 343 → 335 lines (-8) despite adding the navigator
wiring + selection-policy invocation. The composable extraction
absorbs the orchestration that would otherwise inflate the SFC by
~50 lines.

## ADR compliance

- **ADR-0001:** mutations to `store.session.ui.forestNav` happen
  exclusively through the named mutators on
  `useForestNavigation` (toggle / expandAll / collapseAll /
  select). The SFC's local `browseError` ref is per-mount UX
  state and doesn't persist.
- **ADR-0002:** `loadBrowseForest` aggregates per-root failures
  through `pushSystemMessage` (ADR-0002 fail-loudly). The cap
  surface is a UX message, not silent truncation — the user sees
  the count and the guidance to refine.
- **ADR-0003:** the new composables live in band 1 (truly
  domain-agnostic) — `useForestNavigation` shapes any
  ForestStat-like aggregate; `useForestBrowsePolicy` orchestrates
  generic data-fetch dispatch. The Go domain doesn't leak in.
- **ADR-0004:** all edits to existing files were targeted; the
  full-file CardTreeWidget / useCardTreeData were already in
  view when each edit was made.
- **ADR-0007:** `ForestDirectory.vue` is at 335 lines (still over
  the 250 SFC budget but down from the pre-edit 343). The file
  was already in violation; this PR's discipline is "don't make
  it worse" (achieved: -8 net) plus extraction of the
  orchestration concern. A targeted refactor of
  `ForestDirectory.vue` past the SFC budget remains future work
  — the deferred-items entry "Refactoring queue from ADR-0007"
  has App.vue at 591 as the higher-priority target.

## Decisions kept and decisions changed

The six open decisions from the planning note resolve as
follows; the user's confirmation of my defaults at the start of
the arc held throughout:

1. **Multi-root forest selection display** — `MULTI_ROOT_DISPLAY_CAP
   = 8` (raised from 4 once the vertical-stack-with-one-expanded
   layout was confirmed to handle more trees than I'd initially
   modelled).
2. **Persistence of expanded / selected state** — persistent
   in `store.session.ui.forestNav` via schema migration 20 → 21
   (PR 1).
3. **Aggregate stats placement** — inline per-node, both at game
   level (Σ + weighted recall) and at root level (the existing
   trio). No footer panel.
4. **Decks-tab interaction** — none; Decks runs a pipeline,
   independent path.
5. **"Navigating into a card"** — nav clicks toggle expand /
   set selection only; loading into the main board view stays
   the right-pane CardTreeWidget's `node-click` → `emit('load-card')`
   path.
6. **Scale handling for sample-style game_sources** — render-cap
   in `ForestTreeNav` (PR 2) past 50 roots per game; fetch-cap
   here past 8 roots per game-selection.

The cap-value adjustment (4 → 8) is the only meaningful change
from the plan as proposed; it's recorded in `engine/constants.ts`
inline so a future contributor can re-tune it without
archaeology.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) passes — strict
  typecheck happy under the new composable signatures and the
  navigator's reactive bindings; vite bundle clean.
- HMR smoke (deferred to user's session — the assistant cannot
  visually verify):
  - Browse tab loads with the navigator.
  - Game rows show inline aggregates; chevron toggles expansion.
  - Root rows under expanded games show description / players /
    stats.
  - Click on a game row with ≤ 8 roots loads all trees in the
    right pane; > 8 shows the cap message.
  - Click on a root row loads the single tree.
  - Selection persists across reloads (schema migration 20 → 21
    + SyncService round-trip).
  - The 276-root case from the user's actual data: navigator
    shows the first 50 roots + "+ N more" message; clicking the
    parent game (276 > 8) shows the cap message in the right
    pane.

## Out of scope (future iterations)

- **Card-level expansion in the nav.** Out of scope per the arc;
  the persistence union narrows to `game | root`. Adding card-
  level later needs a fresh schema migration and a NavNodeId
  template-literal extension.
- **Auto-expand-parent-on-select.** A persisted root-selection
  whose parent game is collapsed is currently dangling-but-
  functional (selection drives the right pane regardless). A
  future polish: when `select({ kind: 'root', ... })` is called,
  also expand the parent game node. Marginal; deferred.
- **Tab name re-tuning.** "Browse" is the chosen replacement for
  "Roots"; the user can redirect to "Library" / "Games" / etc.
  if it reads off.
- **Auto-load-fewer-trees-when-cap-exceeded.** Currently the
  cap is binary (auto-load all or none). A future iteration
  could load the first N trees when the cap is exceeded, with
  a "+ M more in nav" message. Considered for v1 and rejected as
  feature accretion.

## License

Public Domain (The Unlicense).
