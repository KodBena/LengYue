# Analysis-panel container-query recompute under chart redraw (de-CQ the responsive preview-hide)

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `de-cq-preview-hide` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Surfaced:** 2026-05-31 (board-render-ssot arc; the `x1.json.gz`
  charts-visible sanity capture, after the ChartPreviewBox `v-html`
  excision landed).
- **Closed:** 2026-06-01 — replaced the `@container` query with a
  ResizeObserver-toggled `.narrow` class in `AnalysisChartPanel.vue` (fires only
  on real width changes, not per style flush). Headless before/after (15+15
  cold-cache `nav-range` runs): forced style+layout invocations **−19.4%**
  (417→336 median count), forced-flushes-per-chart-render **−21%** (1.03→0.81),
  `Layout` duration −7.3%, recalc/layout-tree time flat; **no regression**
  (layout fell, so dropping `container-type`'s containment was safe). The
  Firefox "907 `UpdateContainerQueryStyles`" has no Chrome-named event, but the
  CQ's forced extra passes are countable as `ForcedStyleAndLayout`. Worklog:
  `docs/worklog/2026-06-01-de-cq-preview-hide.md`. The diagnosis below is
  retained as the method record.
- **Concern:** With the analysis charts visible, a per-nav jank tax is the
  container-query recompute storm — `x1.json.gz` (9.24 s) shows **907
  `UpdateContainerQueryStyles` / ~186 ms** (it was 0 with charts hidden).
  `marker stack` traced it: ECharts' canvas text rendering forces a synchronous
  style flush per redraw, and because every `AnalysisChartPanel`'s
  `.linear-content` declares `container-type: inline-size`, each flush
  re-evaluates the panel's `@container` query:
  `brushText → set CanvasRenderingContext2D.font → DoFlushPendingNotifications →
  Styles → Container Query Styles Update`. So the recompute volume scales with
  forced style flushes × visible container-query panels.
- **The container-type is load-bearing — but doesn't need to be a CQ.** It
  drives `@container (max-width: 379px) { .preview-box { display: none } }`
  (`AnalysisChartPanel.vue:101`) — hide the 140px thumbnail when the panel is
  too narrow for both chart + preview (else the chart collapses to a sliver).
  But the query keys purely on the panel's *own* inline width vs a fixed 379px
  threshold, which a `ResizeObserver`-driven `.narrow` class toggle (the panel
  measures its own width and toggles the class) reproduces exactly — removing
  the per-flush CQ recompute while preserving the responsive hide. (A viewport
  media query would be wrong: the panel isn't necessarily full-width.)
- **Magnitude caveat (the reflow-arc lesson):** ~186 ms / 9.24 s ≈ **2%**, and
  de-CQ-ing only removes the *CQ-recompute portion* of each flush — the
  ECharts-font-forced flush itself still happens. Real, clean, but modest;
  trades pure CSS for a little `ResizeObserver` JS. Genuinely low priority.
- **The other charts-visible Styles cost is diffuse and lower-ROI:** the biggest
  Styles blocks root at `set Node.textContent → patchElement` (Vue reactive
  `{{ }}` text updates across the UI per nav, each a tiny `ContentRangeInserted`)
  — death-by-a-thousand-cuts inherent to interpolation, not a concentrated
  lever. Noted only so a future reader doesn't re-discover it as new.
- **Where:** `AnalysisChartPanel.vue:89` (`.linear-content { container-type:
  inline-size }`), `:101` (`@container (max-width: 379px)`).

---

License: Public Domain (The Unlicense).
