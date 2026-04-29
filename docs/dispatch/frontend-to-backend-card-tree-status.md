# Card-Tree — Frontend → Backend Status Dispatch

- **Date:** 2026-04-29
- **From:** frontend (card-tree widget implementer session, 2026-04-29)
- **To:** backend (closes
  `docs/dispatch/backend-to-frontend-card-tree-status.md`)
- **Type:** status — closes the consumer side of release-scope item 3
- **Status:** closed on both ends; the loop is complete

## TL;DR

The card-tree widget per `docs/notes/card-tree-frontend-spec.md` is
implemented against the wire shipped in
`backend-to-frontend-card-tree-status.md`. Both endpoints work as
specified; the active / context / stub / bucket projection lives in
`useCardTreeProjection`; ForestDirectory is the consumer (Decks tab
→ active-set mode, Roots tab → browse mode). `npm run build` passes
and the dev server boots clean.

This dispatch closes the backend's open thread from the frontend's
end. There is no further work for the backend on the v1 contract;
two future-ask candidates are surfaced below with no current
implementation pressure.

## What was consumed

Both endpoints, as specified:

- `POST /lineage/resolve-roots` — consumed by
  `useCardTreeData.runPipeline` (Decks tab) once per pipeline
  run. The `unmatched_card_ids` partition surfaces as a
  `console.warn` for visibility per ADR-0002; the widget proceeds
  with the matched portion. No production hit observed; the
  widget treats unmatched as a diagnostic, not a fatal.
- `POST /lineage/tree-by-root` — consumed both by Decks-tab
  active-set mode (one call per `RootGroup` returned from
  `resolve-roots`, fanned out via `Promise.all`) and by Roots-tab
  browse mode (single call against the user-clicked root).
  Per-call failures `console.error` and the surrounding
  `Promise.all` proceeds with the rest, so a per-tree 404 doesn't
  drop the whole forest.

The 422 overflow path is mapped to a typed
`CardTreeOverflowError` in `src/types.ts`; the api-client uses
`silentStatuses: [422]` so the system-log surface is the typed
throw rather than a duplicated raw API-error message.

## Wire-contract feedback

No deviations. The wire shapes match the dispatch verbatim. The
`game_source_id` rolled into `tree-by-root`'s response (the small
spec deviation noted in your dispatch) lands cleanly — it
populates the `forestStats` lookup the widget uses for the
per-tree header without an extra round trip.

`resolve-roots`' input-order preservation is convenient; the
widget doesn't depend on it, but the deterministic shape is
helpful for log readability when debugging cross-tenant inputs.

## Two future-ask candidates (no current pressure)

Surfacing these for visibility; neither is blocking and the
release scope is locked.

### Game date in `ForestStat`

Per the spec §"Multi-tree presentation" the per-tree header is
"game title, players, date, node count, active-count". The
existing `ForestStat` wire shape exposes title (`description`) and
players, but not date — so the v1 widget header omits date.

If a future iteration wants to surface date, the cleanest place is
extending `ForestStat` with a `game_date` field (parsed from the
SGF `DT` property at ingest time, or stored on `game_source` if
that's where date already lives). Either:

- **(a)** the backend extends `ForestStat` directly and the
  frontend picks up the new field on next `gen:api`, or
- **(b)** the frontend parses `DT` from a separately-fetched root
  card's SGF — possible but redundant given the backend has the
  source-of-truth.

(a) is cleaner. Filing as a candidate, not a request — the spec
calls date "metadata" and v1 ships without it.

### Multi-root composite endpoint

Per your dispatch's "What's NOT in scope": the widget calls
`tree-by-root` once per `RootGroup` from `resolve-roots`, fanned
out via `Promise.all`. Profile data does not yet exist; the
"premature for v1" assessment held. If real-world pipelines
return >50 roots and the per-call overhead becomes dominant, a
bulk variant (e.g. `POST /lineage/trees-by-roots` taking
`{ root_card_ids: [...], max_nodes_per_root?: int }`) is the
natural shape. No current pressure to ship.

## Spec corner cases (resolved at the frontend)

Two judgement calls the spec leaves to the implementer; surfacing
for the project record:

### Hot-but-not-warm rendering

The spec's expand decision renders an active node with no hot
children as a stub (the "hot but not warm" case). Faithful to the
spec; the active visual signal is recoverable via a flag
(`RenderStubNode.isHeadActive`) that drives an active-accent
border without changing the role tag — the 4-role partition is
preserved and the "matched but summarized" case stays
recognisable.

### Expanded-bucket leaves

Cold leaves exposed via bucket-expansion don't fit the spec's
`'active'` / `'stub'` / `'bucket'` roles, and `'context'`'s
formal definition ("has at least one active descendant") doesn't
hold for them. The widget assigns `'context'` role pragmatically
("non-active terminal node, quiet treatment"); a code comment
notes the looser definition. Consumer dispatch (load-card on
click for active / context, expand for stub / bucket) follows the
spec correctly.

Neither corner case requires backend action. Recording so that
future spec consumers see the resolved interpretation rather than
re-deriving it.

## Implementation references

- Frontend implementation worklog:
  `docs/worklog/2026-04-29-card-tree-frontend.md`.
- Frontend code: `src/components/charts/CardTreeWidget.vue` (the
  SFC), `src/composables/useCardTreeProjection.ts` (pure
  projection), `src/composables/useCardTreeData.ts` (data state
  machine), `src/composables/useEChartsForestRender.ts`
  (chart lifecycle), `src/components/charts/card-tree-echarts.ts`
  (ECharts adapter + tooltip + header).
- ACL extensions: `src/services/backend-service.ts` (three new
  methods — `resolveRoots`, `fetchTreeByRoot`, `fetchCard`).
- Domain types: `src/types.ts` (`GameSourceId`,
  `CardLineageNode`, `RootGroup`, `ResolveRootsResult`,
  `CardLineageTree`, `CardTreeNodeRole`,
  `CardTreeOverflowError`).
- Consumer: `src/components/ForestDirectory.vue` (rewritten;
  Decks tab and Roots tab now both drive the widget).
- Deletion: `src/components/charts/LineageTreeChart.vue`
  (superseded; ForestDirectory was the only consumer).

## Closing

Release-scope item 3 is closed at both ends. The card-tree
widget is in the codebase, typechecks under strict mode, and
boots in the dev server. Browser-side smoke is the user's call;
the wire surface is verified by typecheck against the
regenerated `src/types/backend.ts`.

If a future session surfaces a wire-contract gap (date, bulk
endpoint, edge labels), it will start as a fresh dispatch.
