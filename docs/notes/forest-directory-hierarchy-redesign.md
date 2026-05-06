# Forest Directory — Hierarchical Redesign (planning note)

The Roots tab in `frontend/src/components/ForestDirectory.vue`
currently flattens every game-source root into a single scrollable
list. This note scopes a redesign that presents the same data as a
file-manager-style hierarchy ("games → roots → cards") with
expand/collapse and node-level selection, so the user can descend
systematically rather than scrolling a flat list.

## Status

**Closed: shipped 2026-05-06** across PRs #151–#154. Worklogs:

- `docs/worklog/2026-05-06-foreststat-tagstat-acl-translator.md`
  (PR 0 — ACL translators).
- `docs/worklog/2026-05-06-forest-navigation-composable.md`
  (PR 1 — `useForestNavigation` + schema migration 20 → 21).
- `docs/worklog/2026-05-06-forest-tree-nav-component.md`
  (PR 2 — `ForestTreeNav.vue`).
- `docs/worklog/2026-05-06-forest-tree-nav-wire-in.md`
  (PR 3 — wire-in + `loadBrowseForest` + `useForestBrowsePolicy` +
  `MULTI_ROOT_DISPLAY_CAP`; closes the arc).

This note remains as the design record for the arc — the schema
reality check, UX sketch, six open decisions, and out-of-scope
boundaries are the historical context that informed the
implementation. The TODO entry under "Future projects" has been
retired in lockstep with this status flip; the
"Decisions resolved at implementation time" column below
records how the six open decisions actually closed.

### Decisions resolved at implementation time

| Decision (planning note ref) | Resolution shipped |
|---|---|
| Multi-root forest display | `MULTI_ROOT_DISPLAY_CAP = 8` in `engine/constants.ts`; game-selection past the cap shows a guidance message in the right pane. |
| Persistence of expanded / selected state | Persistent in `store.session.ui.forestNav` via schema migration 20 → 21. |
| Aggregate stats placement | Inline per-node — both at game level (Σ + weighted recall) and at root level (existing trio). |
| Decks-tab interaction | None; independent path. |
| "Navigating into a card" | Nav clicks toggle expand / set selection only; loading into the main board view stays the right-pane CardTreeWidget's existing `node-click` → `emit('load-card')`. |
| Scale (276-root case) | Render-cap in `ForestTreeNav` past 50 roots per game; fetch-cap past 8 roots per game-selection. |

### Out-of-scope items, status

- **Card-level expansion in the nav.** Remained out of scope.
  The persistence union narrows to `game | root`. Adding card-
  level later needs a fresh schema migration plus a
  `NavNodeId` template-literal extension (`\`card:${number}\``).
- **Cross-upload dedupe / super-game grouping.** Remained out
  of scope; v2 design questions still open.
- **Search / filter within the navigator.** Remained out of
  scope; possible follow-up.

## Schema reality check (2026-05, sampled from the live database)

The lineage model (per `backend/db/schema.py` and verified against
`backend/cards.db`):

- **`card`** — the entity the SR system schedules. Owns its
  Bayesian prior, `num_moves`, `normalized_position_id` (the
  canonical position it sits at), and `grading_parameter`.
- **`card_source`** — the lineage edge table. Each card has
  exactly one `card_source` row (UNIQUE on `card_id`). The
  `CHECK ((card_source_id IS NOT NULL AND game_source_id IS NULL)
  OR (card_source_id IS NULL AND game_source_id IS NOT NULL))`
  constraint enforces: a card's parent is **either** another
  card (branch) **or** a game_source (root) — never both,
  never neither.
- **`game_source`** — the human-game-level entity. Carries
  `position_id` (the root's position), `player_white`,
  `player_black`, `description`, `raw_content` (the full
  uploaded SGF), and `user_id` (tenancy).
- **`normalized_position`** — content-addressed canonical
  positions, globally deduplicated by `content_hash`.

So the user's framing — *"a card has a parent that is either a
card or a game"* — maps directly: a card's `card_source` row
points either upward to another card, or all the way up to a
`game_source`. The "roots" today are exactly the cards whose
`card_source.game_source_id` is non-null.

### Live-data observations

A snapshot of `backend/cards.db` (mixed sample + user data):

| Quantity                                       | Count |
|------------------------------------------------|-------|
| `game_source` rows                             | 4 141 |
| `card` rows                                    | 7 831 |
| `card_source` rows                             | 7 831 |
| Roots (`card_source.game_source_id` non-null)  | 3 550 |
| `normalized_position` rows                     | 7 743 |

Multi-root per game_source is **already the norm**, not a
hypothetical:

- Sample-loader-built `game_source` 2664 has **276 roots**
  attached. Several others sit at 30-47 roots each. These come
  from `backend/scripts/load_sample.py` populating one
  `game_source` row with many starting positions from the same
  SGF — exactly the "humans organize cards by where they came
  from" idiom the user wants to surface.
- User-mint paths create one `game_source` per mint, so a single
  organic game typically has a single root attached. But each
  organic game *can* accumulate descendants (branches via
  `card_source.card_source_id`) which are the user's own
  variations off the original position. Those don't show up as
  additional roots; they appear under the root in the lineage
  tree.

Both shapes — many roots per game_source (sample data) and one
root per game_source with deep descendants (organic mint) —
naturally fit a file-manager hierarchy.

### What the schema does *not* dedupe

The `game_source` table has no uniqueness constraint over the
SGF content. Two uploads of the same SGF produce two
`game_source` rows. They'd share `normalized_position_id` at the
position the root sits at, but they're otherwise distinct. The
live data shows this is uncommon (the 13 rows with players
"廖元赫 vs 이원영" turn out to be 13 *different* games — distinct
`position_id`s — not 13 uploads of the same game). Cross-upload
dedupe is therefore a follow-up concern, not part of v1 here.

## Current shape of `ForestDirectory.vue`

- Two tabs: **Decks** (drives the right pane from a CardSet
  pipeline result) and **Roots** (single-tree browse mode, the
  subject of this redesign).
- The Roots tab loads `ForestStat[]` from `GET /stats/forests`
  via `backendService.getForestStats()` on mount. Each entry
  renders as a card with title (`description`), players, and
  aggregate stats (`total_cards`, `total_reviews`,
  `average_recall`).
- Selection contract: clicking a root invokes
  `tree.loadBrowse(rootCardId)` (from `useCardTreeData`), which
  populates `CardTreeWidget` in the right pane. **This is the
  seam to preserve** — whatever the redesigned navigator
  exposes, it must end up driving the same call so the lineage
  explorer continues to respond.

## What "game" means as a hierarchy node

Mapping straight from the schema to the user's framing:

- A **game** is one `game_source` row. It carries the human
  metadata (players, description) and the canonical SGF.
- A **root** is a card whose `card_source` points to that
  `game_source`. There may be one or many.
- A **card** below a root is a branch — a card whose
  `card_source` points to another card, transitively rooted at
  the same `game_source`.

The cheapest interpretation — `game_source.id` as the "game"
identity — matches both the schema and observed multiplicity.
It ships from a frontend session: group the existing
`ForestStat[]` by `game_source_id` client-side and render as a
collapsible tree.

The follow-up question — *"should two uploads of the same SGF
collapse into one game node?"* — is a separate concern. Not
part of v1 here. Three options when it does become relevant:

| Option                          | Pros                                                 | Cons                                                                 |
|---------------------------------|------------------------------------------------------|----------------------------------------------------------------------|
| Hash `game_source.raw_content`  | True dedupe; surfaces the duplication explicitly.    | Requires a new indexed column or computed-on-read; backend dispatch. |
| Group by `position_id`          | Cheap; uses an existing column.                      | False positives (different games happen to share the root position). |
| Add a `game` entity             | Cleanest long-term; opens room for tournament/player groupings. | Substantial blast radius — new table, migration, new endpoints.       |

Filing this as a v2 question; the v1 redesign uses
`game_source.id` directly.

## File-manager UX sketch

```
[games]                                       ← top level
├── ▾ 廖元赫 vs 이원영                         ← game_source row;
│   └── ▸ Root @ move 9                       │   one root here
├── ▾ load_sample batch 2664                  ← game_source row
│   ├── ▸ Root @ move 12                      │   many roots
│   ├── ▸ Root @ move 12
│   ├── ▸ Root @ move 5
│   └── … (276 in this case)
└── ▾ My casual against Bob
    └── ▾ Root (move 1)
        ├── Branch: my variation A           ← descendants live
        └── Branch: my variation B           │   under the root
```

**Selection rules:**

- Selecting a **game** node drives the right pane with all
  roots attached — natural extension of `CardTreeWidget`'s
  existing `forest` prop, which already takes a list of trees
  (the multi-context forest model). For game_source 2664 with
  276 roots this might overwhelm the rendering; cap or paginate
  if needed.
- Selecting a **root** node behaves as today:
  `tree.loadBrowse(rootCardId)` → single-tree view.
- Selecting a **card** node within a tree is a finer-grained
  drill — focus on that card's subtree, or emit `load-card` to
  the parent (existing CardTreeWidget node-click behavior). The
  user might want both, e.g. via click vs. double-click.

**Aggregate stats placement.** The user wants the existing
per-root aggregates (`total_cards`, `total_reviews`,
`average_recall`) preserved. Options:

- Inline per-node (next to each game / root in the tree). Dense
  but compact.
- Footer panel that updates with the active selection. Cleaner
  visual hierarchy in the nav, but loses scan-ability.
- Both — abbreviated inline plus a detailed footer for the
  active selection.

Per-game aggregates (sums across roots) the frontend can
compute cheaply from the existing `ForestStat[]`.

## Backend extensions — not required for v1

The cheapest path uses the existing `GET /stats/forests` and
groups client-side by `game_source_id`. No new endpoint, no
schema change, no backend dispatch.

A future v2 (cross-upload dedupe, super-game grouping) would
need backend work — see the table above for the options. Keep
that as a separate planning arc when prioritized.

## Frontend extensions — required regardless

- **Tree-shaped nav state.** Either a new composable
  (`useForestNavigation`) or component-local state in
  `ForestDirectory.vue` to model expanded/collapsed nodes plus
  active selection. The composable form is cleaner — the state
  has enough structure (`Set<NodeId>` for expanded;
  `NodeId | null` for active selection; methods to toggle,
  expand-all, collapse-all) to deserve a typed seam, and it
  composes cleanly with persistence later.
- **New navigator component** (likely `ForestTreeNav.vue`) for
  the file-manager rendering. The visual idiom (vertical
  expandable list) differs enough from `CardTreeWidget`'s graph
  rendering that a fresh implementation is cleaner than reuse.
- **Refactor of `ForestDirectory.vue`** — the Roots tab body
  shrinks to host the new navigator; the existing flat list
  rendering is removed. Tab structure (Decks vs Roots) and the
  right-pane Lineage Explorer wiring stay.
- **Tab name reconsideration.** "Roots" no longer fits if the
  top level is games. "Browse," "Library," or "Games" might
  read better. Defer to user preference at implementation
  time.

## Outstanding decisions (must precede implementation)

- **Multi-root forest selection display.** When a user selects
  a game node with N roots, does the right pane show N trees
  side-by-side (CardTreeWidget already supports this via
  `forest`) or require sub-selection? At N = 276 (sample-data
  case) side-by-side is impractical; some cap or pagination is
  needed.
- **Persistence of expanded / selected state.** Per-session
  ephemeral (component-local) or persistent in `GlobalStore`
  per-identity? Persistent matches the file-manager idiom but
  adds a store schema migration.
- **Aggregate stats placement.** Inline per-node, footer panel,
  or both. The only firm constraint: the existing per-root
  aggregates must remain visible somewhere.
- **Decks tab interaction.** Today Decks and Roots share the
  right pane (swapped by `activeTab`). Does the new navigator
  affect Decks? Probably not — Decks has its own data shape
  (pipeline result, not lineage browse). Keep them
  independent.
- **What does "navigating into a card" mean?** A card node has
  a position, branches descending from it, and a relationship
  to its parent's lineage. Drilling into it could mean focusing
  the right pane on its subtree (zoom), or loading it into the
  main board view (`load-card` emit, current behavior on
  `CardTreeWidget` node click). Probably both, depending on
  click vs. double-click or modifier keys.
- **Scale handling for sample-style game_sources.** The 276-
  root case from sample data is an edge case but a real one.
  Either render lazily (only expand on click and only render
  visible roots), cap with a "show more" affordance, or accept
  the cost and rely on virtual scrolling if the navigator is
  long.

## Definition of done — planning arc

- This document ratified.
- TODO entry under "Future projects" referencing it.
- Outstanding decisions either resolved or explicitly deferred
  to the implementation arc.

## Definition of done — implementation arc

- File-manager-style hierarchical navigator rendered in place
  of the current flat Roots list.
- Selecting any node drives the Lineage Explorer in the right
  pane with the correct subtree / forest.
- Existing per-root aggregate stats remain visible somewhere.
- Backward compatibility with the sample-data shape (one
  game_source, many roots) is intact.
- Persistence model for expanded / selected state agreed and
  implemented.
- ADR-0007 budget honoured — likely requires extracting the
  navigator and its state into separate files rather than
  growing `ForestDirectory.vue`.

## Triggers — when to actually start

- Frontend bandwidth available and the user prioritizes this
  above the other Active items in `docs/TODO.md`.
- Outstanding decisions above resolved (none of them are
  hard blockers; defaults can be chosen at implementation time
  if the user is comfortable with the choices).

## Out of scope (for both arcs)

- Cross-upload dedupe (collapsing two uploads of the same SGF
  into one game node). See the v2 options table above.
- Tournament / player / theme grouping above the game level.
  Possible if a `game` entity is added later, but defer the
  actual grouping work.
- Search / filter within the navigator. Plausible follow-up.
- Drag-and-drop reordering or moving cards between games. The
  data model doesn't naturally support this without
  conceptual gymnastics around `card_source` reassignment.
- Multi-select for bulk operations. Plausible future, not v1.
