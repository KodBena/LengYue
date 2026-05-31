# Worklog — TreeWidget render decoupled from navigation (2026-05-31)

Chrome profiling of the green-integration build (maintainer capture) put
`<TreeWidget> render` at **762 ms / 24.1% self-time — the single biggest JS
cost** in combined-stress, with `<TreeWidget> patch` at only 59.8 ms.

## Diagnosis — the v-memo only fixed the patch

The active-node ring was already a standalone `<circle v-if="activeRingPos">`,
decoupled from the node `v-for`, and the edges/nodes carry per-item `v-memo`.
But the ring was still **bound reactively in the template**, and `activeRingPos`
depends on `currentNodeId`. So on every nav the template re-read it and
TreeWidget's **whole render function re-ran** — the full `v-for` over edges +
`nodeList`, evaluating every `v-memo` key for hundreds of nodes. The per-item
`v-memo` spares the *patch* (59.8 ms — it works), but does nothing for the
*render* (762 ms). Render ≫ patch is the signature of exactly this:
re-rendering, then memo-skipping the DOM diff.

(This was visible in the Firefox captures too — the `<Component> patch` marks
were present all along; the analysis had only ever aggregated `render`. Lesson
recorded in the retrospective.)

## Fix — imperative ring, off the render path

Same trick as the canvas rug-plots. The ring is now a static
`<circle ref="activeRingEl">` whose `cx`/`cy`/`display` are set imperatively in
`watch(activeRingPos, …)` (seeded by `onMounted`). The template no longer reads
`activeRingPos`, so a cursor-only nav touches one circle's attributes and
**TreeWidget's render runs only on genuine tree-structure change** (nodes
added / expanded), not per nav.

## Expected

`<TreeWidget> render` drops from ~24% toward near-zero in nav-heavy workloads
(it re-renders only on structure change). Behaviour unchanged: the ring tracks
the current node; z-order (between edges and nodes) preserved. Build green.

## Validation (pending Firefox re-capture)

Confirm the `<TreeWidget> render` mark's total + count collapse, and that the
active ring still follows the cursor and hides correctly at the root.

License: Public Domain (The Unlicense).
