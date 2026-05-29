# Worklog — Analysis-Panel Refactor, Phase 2: multi-tab (2026-05-29)

Phase 2 of the analysis-panel refactor (Phase 0 = projection seam; Phase 1
= panel registry). Organises the scrollable panels into user-defined tabs
and renders **only the active tab**, so inactive panels unmount and leave
the frame — the regime-B structural lever the coalescing arc identified
(`2026-05-29-perf-distribution-redraw-coalescing.md`: the distribution
micro-opts couldn't move the ~170 ms frame because the cost is spread
across the whole subtree; removing whole panels from the frame is what
helps).

## Change

- **Schema.** `AnalysisPanelId` / `AnalysisTabId` / `AnalysisTab` branded
  types in `types.ts`; `AppSettings.analysisTabs: AnalysisTab[]` — an
  ordered list of tabs, each a named, ordered subset of the panel
  registry.
- **Panel-id SSOT split (layering).** `AnalysisPanelId` *values* moved
  into an SFC-free `components/charts/panel-ids.ts` (`PANEL_ID`), so the
  store layer (`defaults.ts`, the migration) can reference the frozen ids
  without pulling Vue SFCs into the store graph. `panel-registry.ts` now
  imports `PANEL_ID` and adds `ANALYSIS_PANELS_BY_ID` (id → descriptor)
  for resolving persisted `panelIds`.
- **Default layout** (`defaults.ts`) + **migration 54 → 55**
  (`migrations.ts`, backfilling legacy blobs; frozen literal): the four
  tabs —
  - **Basic** — ScoreLead, MergedDelta
  - **Distributions** — DeltaDistribution, MistakeGap
  - **Stability** — Stability, StabilityCrossCorrelation
  - **Multiresolution** — MultiresolutionInterval

  Per the rolling-archive discipline, migration 52 → 53 (keybindings)
  moved to `archived-migrations.ts`, keeping 53 → 54 / 54 → 55 as the two
  active anchors.
- **`useAnalysisTabs`** — tab list (from settings) + ephemeral active-tab
  selection (resets on reload, per scope). No component imports.
- **`AnalysisDashboard`** — adds a lightweight tab strip and renders the
  active tab's panels via `v-for` + `<component :is>`. A `panelId` not in
  the registry is dropped + warned (ADR-0002 non-fatal degradation). The
  proven `.scrollable-content` flex/scroll chain is preserved (a custom
  strip rather than wrapping in `TabWidget`, whose own flex chain would
  disturb it).

## Measurement (ADR-0009) — PENDING

The regime-B before/after is **not yet captured**. This is the phase
expected to move the frame number the micro-opts couldn't: with the seven
panels split across four tabs, the active tab mounts at most three (Basic
mounts two), so ~4–5 panels and their per-packet chart work are **absent
from the frame**. The signal to look for is `RefreshDriverTick` /
`requestAnimationFrame` p50 finally dropping (vs the ~170–190 ms of the
coalescing captures), clipped to a matched keydown-index window.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped (migration suite green; the
  54 → 55 backfill mirrors the 52 → 53 / 53 → 54 idempotent pattern).
- Active-tab-only rendering is structural (the `v-for` ranges over the
  active tab's resolved panels only) — visual validation during a session
  (tabs switch, panels mount/unmount, default split correct) is the
  backstop, as no dashboard render test exists.

## Next

- **Phase 3** — the Settings-tab editor to create / rename / reorder tabs
  and assign panels (mutating `AppSettings.analysisTabs`). Until then the
  four-tab default is fixed.
- **FEATURES.md** — tabbed analysis is a user-facing capability; update
  the tour when the editor lands (or sooner) — flagged, not yet done.
- Known minor tradeoff: a panel's collapsed/expanded state resets on tab
  switch (panel-local `ref`, lost on unmount). Liftable to the context if
  it annoys.

License: Public Domain (The Unlicense).
