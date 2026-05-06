/**
 * docs/worklog/2026-05-06-forest-navigation-composable.md
 * Worklog — PR 1 of the Forest Directory hierarchical redesign arc:
 * the `useForestNavigation` composable + schema migration 20 → 21
 * for the persisted navigator state. Pure infrastructure; no UI yet.
 * License: Public Domain (The Unlicense).
 */

# Forest navigation composable + schema migration 20 → 21

- **Status:** Shipped on `frontend/forest-navigation-composable`,
  2026-05-06. Four files touched (one new); `npm run build` passes.
  No UI yet — PR 2 (`ForestTreeNav.vue`) consumes the composable
  and PR 3 wires the consumer into `ForestDirectory.vue`.
- **Genre:** Composable + persistence infrastructure for the Forest
  Directory hierarchical redesign per
  `docs/notes/forest-directory-hierarchy-redesign.md`.
- **Position in the arc:**
  - PR 0 (closed 2026-05-06, `frontend/foreststat-tagstat-acl`):
    `ForestStat` / `TagStat` ACL translators.
  - **PR 1 (this one):** `useForestNavigation` composable + schema
    migration.
  - PR 2: `ForestTreeNav.vue` component.
  - PR 3: Wire into `ForestDirectory.vue` + `loadBrowseForest`.
- **Date:** 2026-05-06.

## What this PR is

The composable `useForestNavigation(forestStats: Ref<ForestStat[]>)`
returns:

- `nodes: ComputedRef<readonly ForestNavGameNode[]>` — the grouped
  tree, with `ForestStat[]` collapsed by `gameSourceId` into
  game-level nodes each carrying its roots and a per-game
  aggregate (rootCount, totalCards, totalReviews, weighted
  averageRecall).
- `expanded: ComputedRef<ReadonlySet<NavNodeId>>` — O(1)-lookup
  projection over the persisted expansion array.
- `selection: ComputedRef<NavSelection | null>` — the persisted
  selection.
- Mutators: `toggle(nodeId)`, `expandAll()`, `collapseAll()`,
  `select(s)`. Each writes through `store.session.ui.forestNav`
  with a fresh array / object so SyncService's deep-watch picks
  up the change.

Pure projection plus store writes; no backend calls. The composable
is the typed seam between the navigator's persistence shape (in
`types.ts`, schema-version 21) and the navigator's render shape
(`ForestNavGameNode` / `ForestNavRootNode` here, consumed by PR 2's
SFC).

## Design decisions

### Game | root only — card-level expansion is out of scope for v1

The planning note's UX sketch shows card-level branches under
expanded roots (`├── Branch: my variation A`); the user's
file-manager framing extends that hierarchy in principle. v1
scopes to **games → roots only** for two reasons:

1. **Right-pane redundancy.** The right-pane `CardTreeWidget`
   already renders the full card-level lineage with its own
   expand/collapse. Replicating card-level structure in the nav
   would duplicate the same widget's job at a different scale.
2. **Data dependency.** Card-level expansion would need the
   lineage tree per root, which means triggering `fetchTreeByRoot`
   from nav expansion — a coupling the composable currently
   doesn't have. v1 keeps the composable pure over `ForestStat[]`.

The persistence shape (`NavNodeId`, `NavSelection`) is left
narrow on the union for now. A future iteration that adds
card-level expansion widens both the discriminator (`'card'`
variant) and the `NavNodeId` template-literal type, paired with
a fresh schema migration. The user's resolution of decision #5
in the planning note ("nav clicks toggle expand/collapse and
set selection only — they don't load the board") composes
unchanged.

### Persistence: `expanded: NavNodeId[]` (array, not Set)

JSON round-trips through SyncService cleanly as an array. The
composable projects to `ReadonlySet<NavNodeId>` for O(1)
lookup at render time via `expanded.value.has(node.nodeId)`.
The two shapes co-exist by design — the persistence shape is
serializable; the render shape is queryable.

### NavNodeId: template-literal-typed string

```ts
export type NavNodeId = `game:${number}` | `root:${number}`;
```

The discriminator is structural (the `game:` / `root:` prefix is
part of the type) rather than convention-only, so a string from
elsewhere can't accidentally pass for a NavNodeId without a cast.
Two helpers (`gameNodeId(gameSourceId)`, `rootNodeId(rootCardId)`)
construct ids with the cast localised, and document the cast at
the helper site. Per ADR-0002's "type assertions need
justification" — the helpers themselves are the justification:
the format is guaranteed by construction.

### Per-game aggregate — weighted average recall

```ts
averageRecall: totalReviews > 0
  ? weightedRecall / totalReviews
  : 0
```

`weightedRecall` accumulates `s.averageRecall * s.totalReviews`
across the game's roots. Games with many under-reviewed roots
don't dominate the per-game average; a single heavily-reviewed
root contributes proportionally. The 0-reviews case returns 0
rather than NaN (0/0); the renderer can choose to display "—"
or hide the recall line when `totalReviews === 0` if needed.

### Idempotent migration with lenient validation

Migration 20 → 21 checks shape (object with `expanded: array` and
a `selection` key) but doesn't validate `NavNodeId` format on
expanded entries or `NavSelection` shape on the selection. Bogus
entries are dead in the renderer (Set lookup never matches,
selection doesn't drive the right pane), and the composable's
mutators only write well-shaped values forward. Stricter
validation would add code that solves a problem that doesn't
exist in practice.

The "fail loudly" tenet still binds: the migration throws on a
future-version blob (existing contract, unchanged) and
the composable doesn't catch any error it shouldn't.

## What changed

Four files. One new (the composable); three modified (types,
defaults, migrations).

### `src/types.ts` — persistence types

Three new declarations after the brand-type cluster (lines
522-525):

- `NavNodeId` — `\`game:${number}\` | \`root:${number}\``.
- `NavSelection` — discriminated union over `'game'` /
  `'root'`, each carrying its branded id.
- `ForestNavState` — `{ expanded: NavNodeId[]; selection:
  NavSelection | null }`. The persisted shape on
  `session.ui.forestNav`.

`UISession.forestNav: ForestNavState` added after
`showTranspositionRings` (the v20 field) with a doc comment
naming schema-version 21 and pointing at `useForestNavigation`
for the render-shape projection.

### `src/store/defaults.ts` — fresh-install default

`defaultSessionUI.forestNav = { expanded: [], selection: null }`.
A fresh user lands on a fully-collapsed tree.

### `src/store/migrations.ts` — schema 20 → 21

`CURRENT_SCHEMA_VERSION` bumped to 21; one migration appended
to the array. Idempotent; lenient on bogus entries (see design
section above).

### `src/composables/useForestNavigation.ts` — new file (225 lines)

Imports persistence types from `types.ts`; defines render-shape
types locally (`ForestNavGameNode`, `ForestNavRootNode`,
`ForestNavGameAggregate`, `ForestNavigation`). Exports the two
NodeId helpers (`gameNodeId`, `rootNodeId`) and the main entry
point. Pure tree-shaping in two private helpers (`titleFor`,
`aggregateFor`); main entry point wires `nodes` / `expanded` /
`selection` computeds and the four mutators.

Slightly over the ADR-0007 200-line TS soft budget; the surplus
is heavy inline doc comments documenting the design decisions
(persistence-vs-render shape split, NavNodeId-cast justification,
weighted-recall formula rationale, scope boundaries). Trimming
those would compress the *why* future contributors need; per
ADR-0007's "never compress logic to fit a budget" principle and
the density-over-line-count framing, the doc-heavy shape is the
right trade-off here. Well under the 300-line "coherent state
machine" extended budget.

## Out of scope (future iterations)

- **Card-level navigation.** The composable's union narrows to
  game / root for v1. Adding `'card'` variants needs a fresh
  migration; the composable's mutator surface composes
  unchanged.
- **The actual SFC.** PR 2 builds `ForestTreeNav.vue` consuming
  this composable.
- **Wiring into the right pane.** PR 3 connects nav selection
  to `tree.loadBrowse(rootCardId)` (single-root path) and
  introduces `loadBrowseForest(rootCardIds: CardId[])` for the
  game-node multi-root path with the side-by-side cap.
- **Virtualisation for the 276-root case.** Belongs in PR 2's
  rendering layer; the composable produces the full
  `roots: readonly ForestNavRootNode[]` regardless.

## Verification

`npm run build` (`vue-tsc -b && vite build`) passes — strict
typecheck happy under the new branded persistence types,
template-literal types narrow correctly through the helpers,
vite bundle builds clean. No runtime behaviour change yet
(the composable has no consumer until PR 2).

A future PR 1.5 could add unit tests for the pure tree-shaping
helpers (`groupByGameSource`, `titleFor`, `aggregateFor`); the
codebase has no test suite today (a known durable gap per
`docs/handoff-current.md`), so deferring to whenever the
broader test debt gets paid down.

## License

Public Domain (The Unlicense).
