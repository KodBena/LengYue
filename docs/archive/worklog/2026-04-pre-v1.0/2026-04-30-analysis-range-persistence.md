# Analysis-range persistence (release-scope item 2)

- **Status:** Shipped on `frontend/release-item-2-analysis-range`,
  2026-04-30. `npm run build` (vue-tsc + vite) passes.
- **Genre:** Worklog entry — release-scope item 2.
- **Date:** 2026-04-30.

## Bug

The analysis-chart selection range
(`useAnalysisTimeline::selectionRange`) was a local `ref` inside the
composable. The composable is instantiated at component-setup time
(via `useAnalysisProjection` → `AnalysisDashboard`); `AnalysisDashboard`
unmounts when the user switches away from the Analysis tab, and is
keyed by `boardId` so it remounts on board switch too. Either way,
the local `ref` was destroyed and reset to the default `[0, len-1]`
fit-to-path on the next mount. The author's
`docs/notes/frontend-backlog.md` calls the resulting UX "highly
annoying" — every excursion to a different tab discards the user's
selection.

## Scope decision

Persistence scope was deferred at scope-freeze time to the
implementation session (`docs/release-scope.md` item 2: "per-board
or per-context"). Decision taken in this session: **per-board**. The
range belongs to a particular game's analysis context; per-context
(e.g. global) would homogenise across boards which isn't the
useful axis.

## Architectural shape

One-file domain change, one-file composable change.

- **`src/types.ts`** — `BoardState` gains an optional
  `analysisRange?: [number, number]` field. Mirrors the existing
  `maxVisitsTarget?: number` pattern (also a per-board UI
  configuration that survives across component lifecycles).
  Documented inline that `undefined` means "use the default
  fit-to-path", and that mutation flows through `mutateBoard`.
- **`src/composables/useAnalysisTimeline.ts`** — `selectionRange`
  was `Ref<[number, number]>` backed by a local ref; now
  `ComputedRef<[number, number]>` reading from the active board's
  `BoardState.analysisRange` via the store. `setSelectionRange`
  writes via `mutateBoard`. The watch on `variationPath.value.length`
  initialises the stored range on first observation of a non-empty
  path, and clamps to fit on subsequent length changes (skipping the
  write when the clamp is a no-op so navigation doesn't churn
  `boardsVersion`).

## Why store-backed works

`BoardState` outlives the component lifecycle on both axes:
- **Tab switch** — `<template #analysis>` destroys
  `AnalysisControls` (and its child `AnalysisDashboard`); the store
  survives. Remount reads back the stored range.
- **Board switch** — `<AnalysisDashboard :key="boardId">` forces
  remount on every board id change; the new instance reads the
  *new* board's stored range. No reactive boardId plumbing
  required.

`SyncService` persists the entire `GlobalStore` shape, so the new
field round-trips across reloads as a side effect of `BoardState`
already being on the wire. No migration shim needed in
`normalizeBoard` — the field is genuinely optional and `undefined`
on a freshly-loaded board is the desired default.

## Interface change for downstream consumers

`AnalysisTimelineState.selectionRange` shifts from
`Ref<[number, number]>` to `ComputedRef<[number, number]>`. All
existing consumers (`AnalysisDashboard`, `AnalysisChartPanel`,
`StabilityPanel`, `AnalysisTimelinePanel`) read it as a prop and
mutate via `update:selectionRange` events that route to
`setSelectionRange`. None mutate `.value` directly, so the
read-only narrowing is structurally compatible. Strict typecheck
confirms.

## What's NOT in scope

- **Range-per-variation**: the range is one-per-board. Switching
  to a different variation within the same board reuses the same
  stored range, clamped if the variation is shorter. Per-variation
  scoping would need a different key (per-NodeId or per-leaf-NodeId)
  and isn't called for in the spec.
- **Visual indicator that the stored range was restored**: silent
  resumption is the natural behaviour. The user notices that their
  range came back; no banner needed.
- **Sync-conflict handling**: the range round-trips through
  SyncService alongside the rest of `BoardState`. If two tabs
  edit the same board's range, `last-write-wins` applies (the
  documented `SyncService` invariant). Not specific to this work.

## Files touched

```
frontend/src/types.ts                                 (one optional field on BoardState)
frontend/src/composables/useAnalysisTimeline.ts       (rewrite — store-backed selectionRange)
docs/worklog/2026-04-30-analysis-range-persistence.md (this file)
docs/TODO.md                                          (Completed entry)
```

## Closing

Closes release-scope item 2.
