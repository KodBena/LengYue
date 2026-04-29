# Card-tree frontend widget

- **Status:** Shipped on `frontend/release-item-3-card-tree`,
  2026-04-29. `npm run build` (vue-tsc + vite) passes; dev server
  boots clean; browser-side interactive verification done by the
  user (multi-tree forest verified against a hand-crafted deck
  pulling from five game-source roots).
- **Genre:** Worklog entry — frontend half of release-scope item 3
  (card-tree widget). Implements the spec at
  `docs/notes/card-tree-frontend-spec.md` against the wire contract
  shipped in `docs/worklog/2026-04-29-card-tree-backend.md`.
- **Date:** 2026-04-29.
- **Origin:** Frontend implementer session, picked up after the
  backend dispatch
  `docs/dispatch/backend-to-frontend-card-tree-status.md` declared
  the wire ready.

## Context

The Tree DSL pipeline produces a flat list of cards drawn from the
user's card forest. The pre-existing `LineageTreeChart.vue`
rendered this list as a single tidy ECharts tree, with thumbnail
tooltips, `expandAndCollapse: false`, and a virtual root for the
forest case. Useful, but not the spec's UX axis: the active set
(pipeline result) was indistinguishable from the surrounding
context, and stubs / buckets / progressive disclosure didn't exist.

The card-tree spec (288 lines, authored 2026-04-26) calls for the
active / context / stub / bucket projection on top of a multi-tree
forest input, with the `useCardTreeProjection` decision rule
"expand iff has children AND (manually expanded OR (hot AND ≥1 hot
child) OR (browse AND root))" as its load-bearing invariant. This
session implements that.

## Architectural shape

Per the umbrella's authoring posture (composables hold logic, SFCs
are thin renderers, ACL owns wire shapes) the work splits into
five new files plus four edits:

- **Domain types** (`src/types.ts`, edit) — `GameSourceId` brand,
  `CardLineageNode { id, children }`, `RootGroup`,
  `ResolveRootsResult`, `CardLineageTree`, `CardTreeNodeRole`, and
  the `CardTreeOverflowError` thrown on the 422 path. The
  category-banner JSDoc updated to list the new value-object
  interfaces alongside `ForestStat` etc.
- **ACL** (`src/services/backend-service.ts`, edit) — three
  methods. `resolveRoots(cardIds)` and `fetchTreeByRoot(rootCardId,
  maxNodes?)` translate the new wire shapes; `fetchCard(cardId)`
  surfaces the existing `GET /cards/{id}` endpoint for context-card
  hydration. The 422 path uses `silentStatuses: [422]` against the
  api-client and re-throws as `CardTreeOverflowError`, so the
  system-log surface is loud-once at the typed layer rather than
  duplicated by the generic API-error path.
- **Projection composable** (`src/composables/useCardTreeProjection.ts`,
  new) — pure logic. Computes the hot set per tree (active-set
  closure under ancestor-walk), applies the spec's expand decision,
  classifies children into hot / cold-internal / cold-leaves, and
  emits a discriminated `RenderNode` (`'card' | 'stub' | 'bucket'`).
  `bucketIdFor(parentCardId)` returns `bucket:${parentCardId}` —
  distinct from any real card id, satisfying the spec's "synthetic
  ids must not collide" requirement. `forEachCardNode` is exported
  for the widget's lazy-hydration walk. The composable is band-1
  (truly domain-agnostic) per ADR-0003 — operates on
  `{ id, children }` over branded ids with no Go-bound concept.
- **ECharts adapter** (`src/components/charts/card-tree-echarts.ts`,
  new) — pure conversion `RenderNode → EChartsTreeNode` with
  per-role styling, the tooltip formatter (`tooltipFor`), and the
  `headerLineFor` per-tree header composer. Reuses
  `getCardThumbnailSync` for hydrated cards; "Loading…" placeholder
  for not-yet-hydrated ones. The four roles get distinct
  `itemStyle` / `borderType`; stub heads with `isHeadActive: true`
  pick up the active-accent border so the spec's 4-role partition
  is preserved while the "matched but summarized" case stays
  recognisable.
- **Chart-render composable** (`src/composables/useEChartsForestRender.ts`,
  new) — generic over the payload type; manages one ECharts
  instance per tree key with ResizeObserver-driven re-layout, click
  / mouseover / mouseout wiring with payload extraction, and
  dispose-on-unmount. **Imperative**: exposes `syncCharts(configs)`
  rather than watching a `Ref<configs>` internally — the caller
  drives sync from a watch they own. This shape was forced by the
  realisation that `:ref` callbacks fire during render and writing
  to a reactive container map from the callback dirties the
  component mid-render, triggering "Maximum recursive updates
  exceeded." Imperative sync + non-reactive container Map +
  external watch-with-`nextTick()` is the one-way data flow that
  doesn't loop.
- **Hydration composable** (`src/composables/useCardTreeHydration.ts`,
  new) — wraps the lazy-fetch walk in its own composable so the
  widget's script section stays under the ADR-0007 per-section
  budget. Exposes `resetHydration()` for input-replacement reset.
- **Widget** (`src/components/charts/CardTreeWidget.vue`, new) —
  thin SFC. Owns manual-expand `ref<Set<string>>`, accordion
  expanded-tree state, click dispatch (cards emit upward, stubs /
  buckets toggle manual-expand, headers toggle accordion).
  Manual-expand resets on full input replacement (forest or
  active-set identity change) per spec §"Manual expansion state";
  accordion picks first tree on input change but preserves the
  selection if the previously-expanded tree is still in the new
  forest. ADR-0007 budget: 230 total / script 148 / template 23 /
  style 37 — clean under both caps.
- **Data composable** (`src/composables/useCardTreeData.ts`, new) —
  owns the consumer-side state machine. `loadBrowse(rootCardId)`
  is the Roots-tab path (one tree, empty active set →
  browse-mode); `runPipeline(deck)` is the Decks-tab path
  (`fetchCardSet → resolveRoots → Promise.all(fetchTreeByRoot)`,
  surfacing per-tree failures via `console.error` and proceeding
  with the rest). `requestCard(cardId)` is the lazy-hydration
  hook; it dedups in-flight requests and merges into the cards map
  on success. `formatError` wraps `CardTreeOverflowError` into a
  user-readable string ("Tree exceeds the size cap; narrow the
  query") rather than the raw JSON-body message.
- **Consumer** (`src/components/ForestDirectory.vue`, edit) — the
  Decks tab now drives the active-set view, the Roots tab drives
  browse mode. The placeholder "Pruned Steiner Tree visualization
  coming soon" is gone. Hosts the orientation toggle (default
  `'vertical'` — most Go trees are deeper than wide, and the
  right-panel layout has more vertical than horizontal real estate)
  in the right-panel header; clicking the chip flips horizontal /
  vertical at runtime.
- **Deletion** — `src/components/charts/LineageTreeChart.vue`
  removed. The new widget supersedes it; no other consumers.

## Wire-types regen

`src/types/backend.ts` regenerated against the live backend at
`http://192.168.122.68:8764/openapi.json` — the local install is
networked, not on `127.0.0.1`. Diff: +208 lines, all additive
(new operation paths under `/lineage`, six new `components.schemas`
entries: `ResolveRootsRequest`, `ResolveRootsResponse`,
`ResolvedRoot`, `TreeByRootRequest`, `TreeByRootResponse`,
`TreeNode`). The npm script (`gen:api`) hardcodes `127.0.0.1`;
this session invoked `openapi-typescript` directly. Whether to
make the script env-var-aware is a separate decision — the
hardcoded URL covers the common dev-loopback case and the override
is a one-line `npx` invocation in the LAN case.

## Decisions taken (judgement calls signed off)

1. **Replace, don't double-up.** The spec offered three
   evolution paths (in-place, sibling, supersede); chose
   supersede. `LineageTreeChart.vue` is gone; ForestDirectory's
   single consumer migrated.
2. **Tab mapping.** Decks tab → active-set mode. Roots tab →
   browse mode (single tree, empty active set).
3. **Per-tree header from `ForestStat`.** Title / players / counts
   composed from the existing wire shape. Date is **not exposed**
   by the wire and omitted for v1; deferred per the dispatch
   reply.
4. **Lazy card hydration.** `tree-by-root` is structure-only.
   Active cards arrive hydrated from the pipeline; context cards
   (and bucket-expanded leaves) lazy-fetched via `GET /cards/{id}`
   on first render-pass. Tooltip shows "Loading…" until data
   arrives, then re-renders on next hover.
5. **Soft-cap behaviour.** `maxNodes` widget prop defaults to
   5000 (separate from the backend's `tree-by-root` `max_nodes`,
   which defaults to 10000). On overflow the widget emits an
   `overflow` event; the host page can surface that. No automatic
   re-pruning — ADR-0002 says fail loudly, not silently truncate;
   the spec's "preferentially preserve active nodes" is naturally
   satisfied because progressive disclosure already collapses cold
   regions.
6. **Accordion presentation, vertical default.** Multi-tree forests
   were initially stacked with a fixed `min-height: 320px` per
   tree section and the panel scrolled. Real use surfaced two
   problems: (a) deep Go trees need full vertical space, (b)
   multi-tree forests divide that space across N sections so each
   chart shrinks. Resolution: accordion — only the
   user-selected tree renders its canvas; others collapse to
   single-row headers; the expanded tree gets `flex: 1` and fills
   the remainder. Default orientation flipped from horizontal to
   vertical because Go game trees are typically much deeper
   (50–300 moves) than wide (a handful of variations per node),
   and the available right-panel real estate is taller than wide.
   Toggle button in the panel-header lets the user flip.

## Spec corner case: hot-but-not-warm rendering

The spec's expand-decision rule renders an active node with no
hot children as a stub (the "hot but not warm" case). Faithfully
implemented; the active signal would otherwise be lost on a
matched mid-chain card with cold descendants. The
`RenderStubNode.isHeadActive` flag preserves the visual cue (active
accent border) while keeping the role tag at `'stub'` per the
spec's 4-role partition. A click expands as for any other stub;
on next render the head card becomes a `'card' | role: 'active'`
node with its (cold) children rendered as further stubs and a
bucket.

## Spec corner case: expanded-bucket leaves

The 4 roles in the spec partition rendered nodes; cold leaves
exposed via bucket-expansion don't fit `'active'`, `'stub'`, or
`'bucket'`. They take `'context'` role with a code-comment noting
the formal "has at least one active descendant" definition is
pragmatically loosened to "non-active terminal node" for this
case. The visual treatment matches; the consumer-side dispatch
(load card on click for active / context, expand for stub /
bucket) follows the spec correctly.

## ADR compliance

- **ADR-0001** — value objects keep `readonly` (the four new
  card-tree value interfaces; the `RenderNode` discriminated
  union); state containers (manual-expand `Set`, cards Map) drop
  `readonly` per the file's existing convention.
- **ADR-0002** — fail loudly. The 422 path becomes
  `CardTreeOverflowError`, surfaced via the typed throw and the
  consumer-side `formatError` rather than swallowed. The
  per-tree fetch failure in `runPipeline` `console.error`s and
  proceeds with the remainder, rather than dropping the whole
  pipeline result on a single tree's 404.
- **ADR-0003** — `useCardTreeProjection` is band 1 (truly
  domain-agnostic); the widget and ECharts adapter are band 2
  (game-tree-coupled, generic over the projection); the Go-bound
  thumbnail rendering reuses the existing `getCardThumbnailSync`
  composable.
- **ADR-0004** — minimal-touch holds: ForestDirectory's pre-existing
  layout / CSS preserved verbatim where unrelated to the tree
  swap.
- **ADR-0005** — documentation lands alongside the code: this
  worklog, the dispatch reply, the spec status flip, and the
  TODO Completed-table entry.
- **ADR-0006** — ADR-0006 headers on every new file.
- **ADR-0007 (proposed)** — `CardTreeWidget.vue` 228 lines;
  `ForestDirectory.vue` 194 lines. Both under the 250-line file
  cap. Script-section soft cap (≤ ~150) is at 153 on the widget;
  the "~" tolerance covers it. The 5-file split (widget +
  ECharts adapter + projection composable + chart-render
  composable + data composable) is the contraction that kept the
  SFC small.

## What's NOT in scope

- **Date in the per-tree header.** Backend's `ForestStat` doesn't
  expose game date; surfacing it would be a backend wire-shape
  extension and a fresh dispatch. Filed in the dispatch reply.
- **Multi-root composite endpoint.** The spec / dispatch
  acknowledged this; v1 calls `tree-by-root` once per RootGroup
  via `Promise.all`. Profiling can revisit if dominant.
- **Edge labels (move data) on the rendered tree.** The wire
  shape carries id and children only. The spec marks this as a
  future possibility; revisit when the widget's needs are
  clearer.
- **Browser-side interactive verification.** The session is
  text-only; the dev server boots clean and the strict
  type-check passes, but visual / interaction smoke is the
  user's call.

## Implementation iterations (worth recording for the next session)

Two bugs surfaced during browser-side verification, both useful
data points for the codebase's reactivity discipline.

### "Maximum recursive updates exceeded"

First runtime error after the initial implementation. Diagnosis:
the `:ref="(el) => setContainerRef(...)"` callback in the v-for
fires *during render*, and the original `setContainerRef`
implementation wrote to a `shallowRef<Map>` (replacing the outer
Map to force reactivity). That write dirtied the component
mid-render, scheduling another render, which fired the ref
callback again — infinite loop. Vue caught it and bailed.

Fix: containerRefs is now a plain (non-reactive) `Map`, and the
chart-render composable was redesigned to be **imperative** —
`syncCharts(configs)` rather than internally watching a `Ref<configs>`.
The widget owns a watch on `[renderForest, orientation, cards,
expandedRootId]` that, after `nextTick()`, calls
`syncCharts(buildConfigs())`. Data flow is one-way: render →
ref-callbacks populate non-reactive Map → external watch fires →
chart sync. No reactive writes from inside the template.

### Charts not rendering despite header showing the right counts

Earlier symptom (resolved en route to the recursion fix): the
per-tree header would show "9 rendered, 108 total" but no
ECharts canvas appeared. Root cause was the same shallowRef bug —
inner Map mutations didn't trigger reactivity, so `chartConfigs`
saw an empty container map at initial-watch-fire time and never
re-evaluated. The recursion fix above addressed both symptoms.

## Files touched

```
frontend/src/components/charts/CardTreeWidget.vue          (new, 230 lines)
frontend/src/components/charts/card-tree-echarts.ts        (new, 186 lines)
frontend/src/composables/useCardTreeProjection.ts          (new, 365 lines)
frontend/src/composables/useEChartsForestRender.ts         (new, 184 lines)
frontend/src/composables/useCardTreeData.ts                (new, 162 lines)
frontend/src/composables/useCardTreeHydration.ts           (new,  56 lines)
frontend/src/components/ForestDirectory.vue                (rewrite, 212 lines)
frontend/src/services/backend-service.ts                   (extended)
frontend/src/types.ts                                      (extended)
frontend/src/types/backend.ts                              (regenerated, +208)
frontend/src/components/charts/LineageTreeChart.vue        (deleted)
docs/notes/card-tree-frontend-spec.md                      (status flip)
docs/dispatch/frontend-to-backend-card-tree-status.md      (new)
docs/worklog/2026-04-29-card-tree-frontend.md              (this file)
docs/TODO.md                                               (Completed entry)
```

## Closing

Release-scope item 3 closed at the frontend's end. The two
endpoints from the backend dispatch are consumed; the widget
implements the spec faithfully (with the two corner cases above
explicitly documented); the strict type-check passes.

The remaining release-scope items are 1, 2, 4, 5, 6, 7 per
`docs/release-scope.md`. None are frontend-blocking on this
work.
