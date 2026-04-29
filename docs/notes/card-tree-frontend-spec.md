# Card-Tree — Frontend Specification

- **Status:** Specification (pending implementation).
- **Genre:** Frontend widget specification.
- **Date:** 2026-04-26.
- **Scope:** Synthesis of two existing artifacts:
  (1) `frontend/src/components/charts/LineageTreeChart.vue` — the
  current ECharts-based tree renderer with thumbnail-in-tooltip
  integration; (2) a d3 prototype (`card-tree-view.js`) that
  demonstrates the progressive-disclosure pattern this widget
  needs. The prototype is **not** to be read during implementation
  — d3 is not a dependency of this codebase. This spec is the
  authoritative source.

## What this widget is for

The Tree DSL pipeline produces a set of cards drawn from the
user's card forest. Displayed flat, that result tells the user
*what* matched. Displayed as **structural context within the
forest**, it tells them *how the matched cards relate to the
positions they've actually studied* — and that is the more useful
question.

The active-vs-inactive distinction — which cards are pipeline
results, which are merely context surrounding them — is the
**load-bearing UX axis**. Every rendering and interaction
decision derives from it. A widget that renders the cards
uniformly, however prettily, misses the point.

## Synthesis: what to preserve, what to add

`LineageTreeChart.vue` already establishes the patterns this
widget should follow. Preserve:

- **ECharts tree series as the rendering primitive.** No custom
  layout pass; the tree series's tidy layout is fine.
- **Thumbnail rendering in the tooltip** via the codebase's
  existing thumbnail composable. This is the primary user-facing
  affordance for "what is this card actually about."
- **`expandAndCollapse: false`** — click is navigation, not
  collapse. The widget owns its own collapse semantics for stubs
  and buckets (described below); it does not delegate to ECharts.
- **`roam: true`** — pan and zoom.
- **The massive-tree heuristic** (label suppression, animation
  disabled at high node counts). Adjust the threshold if needed.
- **ResizeObserver-driven re-layout.**
- **Click event emitting the relevant card data** for upstream
  navigation.
- **Dark theme, SVG renderer.**

What's missing from the existing implementation, and what this
widget adds:

- **The active set as a first-class input.** A new prop alongside
  the card data. When non-empty, drives the visual hierarchy
  described below.
- **Progressive disclosure for cold regions of the tree.** Most
  of the forest is irrelevant to a typical query; rendering it
  uniformly drowns the active set. The widget summarizes cold
  subtrees as compact glyphs with count indicators, and lets the
  user click to expand them on demand.
- **Multi-tree input.** The existing component handles a single
  rooted tree (with a virtual root for the forest case). The new
  widget treats a forest natively, with per-tree presentation.
- **Per-node visual roles** beyond the existing uniform style.

## Inputs

The widget consumes a **forest** plus an **active set**:

- A list of trees, each rooted at a card id with recursive
  `{id, children}` structure. Per-card metadata is fetched from
  the card store as needed (the existing pattern).
- A set of card ids designated as the active set. Empty is a
  valid state; see "Browse mode" below.
- Layout orientation (horizontal or vertical), runtime-switchable.
- A soft cap on rendered node count, with overflow surfaced as a
  warning per ADR-0002 (preferentially preserve active nodes;
  drop cold subtrees first).

The exact prop shapes and naming are the implementer's choice
subject to the codebase's existing conventions.

## Outputs

The widget emits:

- A **hover** event with `{ id, role, viewport coordinates }` for
  consumers that want to render a thumbnail panel positioned
  alongside the chart. ECharts' tooltip already does in-tooltip
  thumbnails per `LineageTreeChart.vue`'s pattern; consider that
  the default and the hover event a hook for richer behavior.
- A **leave** event symmetric to hover.
- A **click** event for consumer-driven navigation (load
  position, mark for review, etc.). Stub and bucket clicks are
  also reported for visibility, though the widget itself handles
  the resulting state changes internally.

## Node roles

Every rendered node has exactly one of four roles:

- **active** — in the input active set. The query matched this
  card directly. Visually prominent.
- **context** — not active, but on the path between active
  nodes (formally: has at least one active descendant). Quiet
  default rendering.
- **stub** — a single subtree summarized to one glyph because
  it contains no active nodes and no path to one. Rendered with
  a count indicator. Click to expand.
- **bucket** — multiple sibling leaves with the same parent,
  none of which are active and none of which have children,
  collapsed into a single glyph per parent. Click to expand
  into individual nodes.

The visual treatment for each role is the implementer's choice
within the existing palette. The semantic distinctions matter:
active should read as the loud "look here" signal; context
should read as quiet structural connective tissue; stub and
bucket should read as "summarized — there's more, click to see."

The hover and click events should include the role, so consumers
can react differently (e.g., loading a position makes sense for
`active` and `context` clicks, but not for `stub` or `bucket`
which trigger expansion instead).

## The display projection

Given the input forest and active set, compute the rendered
display tree per the following principles. The exact code shape
is the implementer's call.

**Step 1 — Compute the hot set.** Per tree, the hot set is the
closure of the active set under ancestor-walk. A node is hot iff
it is active *or* has at least one active descendant. Compute
once per render.

**Step 2 — Decide what to expand.** Walk each tree from the root.
At each node, decide whether to expand it (recurse into
children) or summarize it (render as a stub). The decision is:

> Expand iff the node has children AND any of:
> (a) the user manually expanded it in a previous click;
> (b) the node is hot AND at least one of its children is also
>     hot;
> (c) browse mode is active and this is the root.

Condition (b) is the **single subtlest invariant** in this spec,
and the one most likely to be missed: *hot* alone is not enough.
A node is hot if it has any active descendant — including itself.
But auto-expanding every hot node would also expand active
leaves' subtrees, which can be enormous and unhelpful (the user
matched the leaf as a destination, not as a path). The condition
"hot AND has at least one hot child" — sometimes called "warm" —
captures exactly the *path-through* case. Active leaves and
active-but-no-active-descendants nodes are hot but not warm, and
they don't auto-expand. They render as stubs (clickable to
expand) just like cold internals.

**Step 3 — Classify the children of each expanded node.** Three
buckets:

- *Hot children* — recurse into them. They get fully rendered
  with their own descendants (subject to the same expansion
  rule recursively).
- *Cold internals* — children that are not hot but have
  structure of their own. Render each as its own stub. User
  click promotes a stub to manually-expanded; on the next
  render it is fully recursed into.
- *Cold leaves* — children that are not hot and have no
  children. Group all of them under one parent into a single
  bucket node. Click expands the bucket into its individual
  leaves (each rendered as a quiet, terminal node).

A useful ordering convention: render hot children first, then
cold internals as stubs, then the bucket last. This clusters
the active edges visually, which is what the user came to see.

**Step 4 — Render.** The widget hands ECharts a tree shape with
per-node `role` annotations, and varies `itemStyle`, `label`,
and `lineStyle` per role. Stubs and buckets get a count
indicator (the existing component's label support handles this);
active nodes get the loud color; context nodes get the existing
default; bucket and stub edges get the quieter treatment.

## Browse mode

When the active set is empty, the widget renders only the root
and its immediate children (classified as stubs and buckets per
the same rules with an empty hot set). The user explores the
tree by clicking. This is the "no specific query, let me see
what I have" mode. Useful for orientation and for any path that
shows the widget without first running a pipeline.

## Multi-tree presentation

The input forest may contain many trees (a pipeline result that
spans multiple game sources is the normal case). Render each
tree as its own visually-bounded section with a per-tree header
showing the relevant card metadata (game title, players, date,
node count, active-count). Single-tree case: identical treatment
with one section. Consistency over special-casing.

The exact stacking — vertical, tabs, virtualized list — is the
implementer's call. Vertical with per-tree headers is the
simplest and works for any tree count.

## Manual expansion state

The widget tracks which stubs and buckets the user has clicked
open. Preserve this state across re-renders triggered by clicks
(otherwise the click would be undone immediately). Reset it on
full input replacement (new forest or new active set is a fresh
state). Whether to preserve viewport (pan/zoom) on input change
is a UX call; the prototype preserves it on click-driven
re-renders and resets on full reload.

Synthetic ids (for buckets, which don't correspond to real
cards) need to not collide with real card ids. Any unambiguous
scheme works.

## Integration

Read before implementing:

- `frontend/src/components/charts/LineageTreeChart.vue` — the
  current implementation; this spec extends rather than replaces
  its patterns.
- `frontend/src/composables/useCardThumbnail.ts` (or whatever
  the thumbnail composable is currently named) — reuse for
  tooltip thumbnails.
- `frontend/src/components/charts/BaseChart.vue` — ECharts
  wrapper conventions.
- `frontend/src/composables/useTreeLayout.ts` — may or may not
  apply; judgment call after reading.

Whether the new widget evolves `LineageTreeChart.vue` in place,
sits beside it as a sibling, or supersedes it once stable is an
implementer's call. The current component's flat-list-with-
parent-id input shape needs to evolve to a forest input either
way; whether that evolution is a refactor or a new component is
a matter of how disruptive the change feels in context.

## Non-requirements

Out of scope for this widget:

- Card editing or any mutation. The widget is read-only.
- Search / filter / find-in-tree. If needed, implement as a
  sibling component that drives the active-set prop.
- Cross-render animation. Snap-to-new-layout is fine.
- Multi-select via lasso, drag-rectangle, etc.
- Export to image. ECharts provides this natively if needed.

## Open questions

- **Multi-parent edges.** Resolved at card-tree implementation
  start: the backend's schema does not admit multi-parent
  edges (`card_source.card_id` is `UNIQUE`), so each card has
  exactly one parent and the widget's tree assumption holds
  unconditionally. The backend's `fetch_tree_by_root` returns
  a natural tree. The deferred-decisions ledger
  (`docs/notes/decisions-deferred.md`) carries the rationale and
  the schema-change triggers named for revisiting if the
  single-parent invariant ever changes.
- **Edge labels (move data).** If the backend's wire shape
  exposes parent→child move information, the widget could
  surface it as an edge annotation. Not required; revisit when
  the backend's contract is settled.
- **`useTreeLayout.ts` reuse.** Read the composable; decide.
  The spec is intentionally agnostic.
- **Initial viewport.** Fit-to-screen of the whole forest, focus
  on the active set's bounding box, or focus on the first tree?
  Implementer's call. My weak preference: focus on active when
  non-empty, fit-to-screen in browse mode.

## Related

- **`card-tree-backend-spec.md`** — the backend endpoints and
  Port methods that produce the data this widget consumes.
  Together they describe the contract from both sides.

## On the prototype

A d3 prototype (`card-tree-view.js`, paleolithic, single-tree,
WebSocket-driven) implements the progressive-disclosure logic
described above. Do **not** read it during implementation —
d3 is not a dependency of this codebase, and the prototype's
idioms are tied to its rendering substrate. This spec is sized
to be self-sufficient. If a behavior in the prototype isn't
described here, it's either deliberately out of scope, an
oversight worth flagging, or a behavior we'd rather drop in the
rewrite. Raise the question; don't import the answer.
