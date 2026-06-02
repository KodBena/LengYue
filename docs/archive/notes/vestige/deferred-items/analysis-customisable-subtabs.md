# Analysis-chart layout affordance (Settings → Analysis Layout) + collapsed charts still process packets

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `analysis-customisable-subtabs` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Surfaced:** 2026-05-30 (green-perf arc; the "hidden charts" capture).
- **Closed:** 2026-06-01 — both halves resolved. The **want** (a Settings →
  Analysis Layout affordance that disables charts by *unmounting* them) shipped
  2026-05-29 as the three-phase analysis-panel refactor: the panel registry
  (`src/components/charts/panel-registry.ts` / `panel-ids.ts`), multi-tab
  rendering that mounts only the active tab's panels
  (`src/composables/analysis/useAnalysisTabs.ts`,
  `src/components/charts/AnalysisDashboard.vue`), and the Settings editor
  (`src/components/editors/AnalysisTabsEditor.vue`). The **bug** (a
  `v-show`-collapsed chart still running ECharts `setOption` per packet) was
  closed by PR #329's `BaseChart` `active`-prop gate (collapsed →
  `pendingRedraw`, catch-up on re-expand) plus render-active-tab-only — so the
  ungated `series` watch the entry named no longer fires while collapsed.
  Whether the measured frame cost is fully retired wants a re-profile
  (ADR-0009); the mechanism is in place.
- **Note (self-referential irony):** this entry was authored 2026-05-30, a day
  *after* the surface it called "future" had shipped — it is the worked Lapse-2
  exhibit in `docs/notes/rca-discipline-lapses-2026-06-01.md`.

---

License: Public Domain (The Unlicense).
