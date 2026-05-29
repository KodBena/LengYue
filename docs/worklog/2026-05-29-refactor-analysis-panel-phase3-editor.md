# Worklog — Analysis-Panel Refactor, Phase 3: tab-layout editor (2026-05-29)

The final phase of the analysis-panel refactor (Phase 0 seam → 1 registry
→ 2 multi-tab). Adds the user-facing editor for `AppSettings.analysisTabs`,
so the four-tab default from Phase 2 is now fully customisable.

## Change

- **`AnalysisTabsEditor.vue`** (`components/editors/`, [B3]) — a
  controlled editor: add / rename / reorder / delete tabs, and assign
  panels to tabs. Single-view (all tabs visible), partition model (each
  panel in ≤ 1 tab; unassigned panels are surfaced under "Unassigned
  (hidden)" and don't render on the dashboard), up/down reordering (no
  drag-drop dependency). Guards (ADR-0002): can't delete the last tab;
  empty labels keep a placeholder; empty tabs are allowed.
- **Controlled, host-agnostic.** Like the other Settings editors it takes
  `:tabs` and emits `update({ path: ['analysisTabs'], value: next })` on
  every mutation (PaletteEditor's wholesale pattern); `SettingsTab`
  applies it via `updateRegistry`. The editor knows nothing about its
  host — relocating it (sub-tab → section, or to a modal) is a one-line
  change at the mount site. (Per the user's request that the wiring not
  require ripping things out to reorganise.)
- **Hosted in a new Settings sub-tab** "Analysis Layout" (`SettingsTab`),
  alongside General / Keybindings.
- **Panel labels.** The deferred-from-Phase-1 `label` field landed on
  `AnalysisPanelDescriptor` (the editor needs human names; the id is the
  persistence key). Literal, matching each panel's own SFC header; i18n
  of panel names is a separate sweep.
- **i18n** keys added to `en.json` (the CJK trio falls back to en).

## Verification

- `npm run build` — clean.
- `npm run test:run` — 746 passed, 3 skipped.
- No render test for the editor (component tests are out of scope) —
  **manual validation pending**: in Settings → Analysis Layout, add /
  rename / reorder / delete tabs and move panels, and confirm the
  dashboard re-tabs live and the layout survives a reload (settings sync
  + the Phase-2 migration).

## Docs

- `FEATURES.md` updated — the tour now describes the tabbed layout (in
  "Analysis charts") and the layout editor (in "Power-user
  customisation"). This also retires the FEATURES.md item flagged
  outstanding from Phase 2.
- `FILES.md` — `AnalysisTabsEditor.vue` entry added.

## Arc complete

Phases 0–3 land the analysis-panel refactor end to end: the projection
seam (no orchestrator re-render), the registry, the multi-tab render
(the regime-B win — `RefreshDriverTick` −45% on the Phase-2 capture), and
now the editor. Remaining analysis-perf levers (the chart-renderer Port,
packet-receive chunking) are separate arcs, not part of this one.

License: Public Domain (The Unlicense).
