/**
 * docs/worklog/2026-05-06-forest-tree-nav-component.md
 * Worklog — PR 2 of the Forest Directory hierarchical redesign
 * arc: the `ForestTreeNav.vue` SFC that renders the file-manager
 * hierarchy over the `useForestNavigation` composable. Pure
 * presentation; no consumer until PR 3 wires it into ForestDirectory.
 * License: Public Domain (The Unlicense).
 */

# Forest tree navigator — file-manager-style SFC

- **Status:** Shipped on `frontend/forest-tree-nav-component`,
  2026-05-06. One new SFC; no other files touched. `npm run build`
  passes; SFC sits at 152 lines under the ADR-0007 250 budget.
- **Genre:** Presentation component for the Forest Directory
  hierarchical redesign per
  `docs/notes/forest-directory-hierarchy-redesign.md`.
- **Position in the arc:**
  - PR 0 (`frontend/foreststat-tagstat-acl`, merged): ACL
    translators.
  - PR 1 (`frontend/forest-navigation-composable`, merged):
    `useForestNavigation` composable + schema migration 20 → 21.
  - **PR 2 (this one):** `ForestTreeNav.vue` SFC.
  - PR 3: Wire into `ForestDirectory.vue` + `loadBrowseForest`
    for the multi-root selection path.
- **Date:** 2026-05-06.

## What this PR is

A single new SFC at `src/components/ForestTreeNav.vue`. Pure
presentation over the PR-1 composable (consumed via the `nav`
prop, which carries the full `ForestNavigation` interface).
Renders games at the top level with a chevron, title, and inline
per-game aggregate stats; expanded games render their roots
indented underneath, each with description / players / per-root
stats. No emit surface — interactions call the composable's
mutators directly (`nav.toggle(nodeId)`, `nav.select(s)`); the
parent reacts to `nav.selection.value` to drive the right pane
in PR 3.

The component has no consumer yet — it imports cleanly under
`vue-tsc -b` and ships in the bundle but no Vue tree mounts it
until PR 3.

## Design decisions

### Composable-as-prop (`nav: ForestNavigation`)

Idiomatic alternatives considered and rejected:

- **Component instantiates the composable internally.** Then the
  parent has no shared access to `selection.value`, so the parent
  can't react to selection changes — the whole point of the
  selection state is to drive the right-pane Lineage Explorer
  from the parent. Two composable instances over the same store-
  backed state would also subtly double-watch.
- **Component receives raw refs and emits raw events.** Splits
  the composable interface across props/emits boilerplate; the
  parent then has to translate emits back into composable calls.
  Round-trip with no expressive gain.

The chosen shape has the parent (PR 3, `ForestDirectory.vue`)
construct `useForestNavigation(roots)` and pass `nav` down. The
nav object's reactive refs flow through prop binding; the
component's reads (`props.nav.expanded.value.has(...)`) and
mutator calls (`props.nav.select(...)`) talk to the same shared
state the parent watches. ADR-0001-aligned: the composable is
the named-mutator surface; the SFC is a thin renderer + event
binding layer.

### Render-cap with `+ N more` over true virtual scrolling

For games whose root count exceeds `VIRT_THRESHOLD = 50`, the
component renders the first 50 roots and a "+ N more" message
prompting the user to refine via the parent game selection.

True virtual scrolling (DOM-mount only visible items, recycle
on scroll) was considered and rejected:

- The 276-root case from the user's actual data is the largest
  known shape. Past 50, scrolling a long list isn't the user's
  recovery move — selecting the parent game is. The render-cap
  pattern matches the file-manager idiom (manageable child count
  per node), where descending past a deep level requires
  refining the selection rather than scrolling.
- A virtual-scroller library would add a dep + integration
  complexity for no gain at this scale.
- Hand-rolled virtual scrolling is a fixed cost that doesn't
  earn its keep here; the render-cap is one slice + one `<div>`.

### Click-chevron-to-toggle, click-row-to-select

File-manager idiom: clicking the chevron toggles expand/collapse;
clicking the row name selects. The component uses Vue's
`@click.stop` modifier on the chevron button so the chevron's
click doesn't bubble up to the row's selection handler. Standard
pattern; no surprises.

The user's earlier resolution of decision #5 in the planning
note ("nav clicks toggle expand/collapse and set selection only
— they don't load the board") composes: the nav handles
expansion + selection, board loading stays the right-pane
`CardTreeWidget`'s job in response to selection-driven right-
pane state changes.

### Per-game aggregate composition with the per-root row

Inline stats appear at both levels:

- **Per-game:** root count, totalCards (Σ), totalReviews (Σ),
  averageRecall (weighted by reviews; hidden when `totalReviews
  === 0` to avoid showing a meaningless 0.00).
- **Per-root:** the existing flat-list trio (totalCards,
  totalReviews, averageRecall) preserved at the same visual
  density as today's `ForestDirectory.vue` flat list — the
  user constraint from the planning note ("existing per-root
  aggregate stats remain visible somewhere") is satisfied
  inline rather than via a footer panel.

The shared visual idiom (icons 🗂️ 🔄 🧠) is identical between
the per-game and per-root lines so the user can scan the
hierarchy and see the same vocabulary at every level.

### Selection comparison via discriminator + branded id

`isSelected(target: NavSelection)` walks the discriminator
explicitly (`sel.kind === target.kind`) before comparing the
branded id. The branded comparison (`sel.gameSourceId ===
target.gameSourceId` / `sel.rootCardId === target.rootCardId`)
is a JavaScript number equality on the same brand — fine. The
extra discriminator narrowing keeps TypeScript honest in the
exhaustive-narrowing block; no `as` needed.

## What changed

One new file. No edits to existing code.

### `src/components/ForestTreeNav.vue` — 152 lines

Sections:

- Header comment (14 lines) — purpose + interaction model
  description.
- `<script setup>` (~57 lines) — type imports, the `VIRT_THRESHOLD`
  constant, four small helpers (`isExpanded`, `isSelected`,
  `selectGame`, `selectRoot`) plus the `visibleRoots` /
  `hiddenCount` cap helpers.
- `<template>` (~58 lines) — the file-manager hierarchy, with
  empty state, game rows (chevron + title + aggregate), and
  expanded root rows.
- `<style scoped>` (~22 lines) — compact one-line-per-rule CSS
  matching the project's existing idiom in
  `ForestDirectory.vue`. All chrome reads from the theme
  substrate (`var(--surface-N)`, `var(--border-N)`,
  `var(--accent-primary)`, `var(--space-*)`, `var(--text-*)`,
  `var(--radius-default)`, `var(--duration-default)`,
  `color-mix(in srgb, var(--accent-primary) 5%, transparent)`
  for the selection tint — same posture as the post-substrate
  sweep PRs).

ADR-0007 compliance: total 152 lines (under 250); no section
exceeds 60 lines.

## Out of scope

- **Wiring into `ForestDirectory.vue`.** PR 3 replaces the
  flat-list rendering with this component, constructs the
  `nav` composable instance, watches `nav.selection.value`,
  and drives the right pane via `tree.loadBrowse` /
  `loadBrowseForest`.
- **`loadBrowseForest(rootCardIds: CardId[])` on
  `useCardTreeData`.** Lands in PR 3 alongside the wiring; the
  new entry point fetches each tree via `fetchTreeByRoot` and
  combines them, capped at the side-by-side display limit (~4)
  for game-node selection.
- **Tab rename.** The "Roots" tab label no longer fits with a
  game-level top tier. Defer to PR 3 (or a follow-up) — naming
  is a user-preference call.
- **Card-level expansion.** Out of scope per PR 1's worklog;
  the persistence union narrows to `game | root` and the
  component only renders those two kinds.

## Verification

`npm run build` (`vue-tsc -b && vite build`) passes — strict
typecheck happy under the composable's interface and the
template's reactive bindings; vite bundle clean.

No HMR smoke yet — the component has no Vue tree mounting it
until PR 3 wires the parent. The PR-3 verification will exercise
the visual end-to-end.

## License

Public Domain (The Unlicense).
