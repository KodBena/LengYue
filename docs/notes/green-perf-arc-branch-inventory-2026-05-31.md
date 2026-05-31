# Green-perf arc — branch inventory (2026-05-31)

Working-memory anchor for the latency/battery ("green") performance arc. The
work is split across **four independent branches off the session tip**
`bork/perf/autonav-harness-geiger-excision` — they are **parallel, not
stacked**, so no single branch contains all of it. This note exists so none is
forgotten at integration/merge time.

Base (session tip): `bork/perf/autonav-harness-geiger-excision`.

## Branches

### 1. `bork/perf/treewidget-autocenter-reflow` — 1 commit
- `bcf1ac6` perf(tree): observe-don't-poll auto-center (excise per-nav forced reflow)
- **What:** TreeWidget's viewport-centering read `scrollLeft`/`clientWidth`
  synchronously per nav (forced reflow). Reworked to cache scroll/dims via a
  passive scroll listener + ResizeObserver (`useViewportFollow` composable);
  dropped `behavior:'smooth'`.
- **Status:** A first rAF attempt was measured *ineffective* (reflow is ~1% of
  autonav; rAF runs before the frame's layout). The shipped observe-don't-poll
  version is correct-by-construction; re-capture **skipped** by maintainer
  decision — banked as correctness/hygiene.
- Touches: `TreeWidget.vue`, new `composables/useViewportFollow.ts`, FILES.md, worklog.

### 2. `bork/refactor/board-render-ssot` — 6 commits
- `48f556b` extract board-geometry SSOT (step 1/5, no behavior change)
- `4bcc3dc` cache BoardSnapshot as SSOT, string becomes projection (2/5)
- `08307e7` MiniBoard reactive thumbnail component (3/5)
- `408b173` ChartPreviewBox renders MiniBoard, not v-html (4/5)
- `2cf37b4` heatmap fixed preview window, drop ECharts tooltip (5/5)
- `88d44f4` docs(deferred): analysis-panel container-query recompute lever
- **What:** Thumbnail rendering SSOT — one `board-geometry` module, one
  `BoardSnapshot` cache primitive, two non-drifting projections (string
  `renderBoardToSvg` for v-html sinks, reactive `MiniBoard` for components).
  ChartPreviewBox per-nav `v-html` teardown excised; the multiresolution
  heatmap's ECharts thumbnail tooltip replaced by a **fixed dual-board preview
  window** below the chart (the "separated boards view").
- **Status:** Validated (`x1.json.gz`: `set Element.innerHTML` gone, 0/60).
- Touches: `engine/board-geometry.ts` (new), `board-renderer.ts`,
  `BoardDisplay.vue`, `MiniBoard.vue` (new), `useThumbnailCache.ts`,
  `ChartPreviewBox.vue`, `AnalysisChartPanel.vue`, `ScoreLeadPanel.vue`,
  **`MergedDeltaPanel.vue`**, `HeatmapChart.vue`,
  `MultiresolutionIntervalPanel.vue`, FILES.md, FEATURES.md, worklogs.

### 3. `bork/perf/incremental-enriched-projection` — 1 commit
- `ef48249` perf(analysis): incremental enriched projection (O(1)/packet vs O(N)/frame)
- **What:** `useEnrichedData` was a computed re-derived per frame (N getRaw
  reads). Now a `shallowRef` driven by a structural watch (rebuild) + the
  ledger's new `onLedgerFlush` changed-key signal (incremental patch). Pure
  `EnrichedAccumulator` with last-path-order delta arbitration, pinned by an
  equivalence test (patchNode-seq ≡ rebuild). Delta-series colour relayered to
  MergedDeltaPanel.
- **Status:** 9 equivalence tests green; combined-stress showed it's
  *sub-dominant* (the dominant cost is component re-render, not computed
  derivation) — banked as correct + tested, not the combined-stress lever.
- Touches: `analysis-ledger.ts`, `enriched-accumulator.ts` (new),
  `useEnrichedData.ts`, `useMistakeFinder.ts`, **`MergedDeltaPanel.vue`**,
  FILES.md, `tests/unit/composables/enriched-accumulator.test.ts` (new), worklog.

### 4. `bork/perf/boardtab-rugplot-canvas` — 2 commits
- `a0b5d7a` render BoardTab rugplot on canvas, off the Vue render path
- `943cfec` render HorizontalTimelineVisualizer data track on canvas
- **What:** The two "rug-plot rendered as one DOM/SVG node per data point"
  components — the dominant per-render costs in combined-stress — moved to
  imperative canvas draws off the Vue render path. Per-slice tooltip /
  hover-brighten dropped; dead `boardTab.meter*` i18n keys removed.
- **Status:** Both validated. BoardTab 782ms→0 (`after_rug_fix.json.gz`);
  HorizontalTimelineVisualizer 304ms→20.8ms / 3.21→0.22ms-per
  (`timelinevis_fix.json.gz`).
- Touches: `BoardTab.vue`, `HorizontalTimelineVisualizer.vue`, 4 locale JSONs,
  FILES.md, worklogs.

### 5. `bork/perf/treewidget-render-decouple` — 1 commit (added post-retrospective)
- `…` perf(tree): decouple TreeWidget render from navigation (imperative ring)
- **What:** A Chrome capture exposed `<TreeWidget> render` as the #1 JS cost
  (762ms/24.1% self; patch only 59.8ms) — the per-item v-memo spared the patch,
  not the render, which re-ran every nav because the template read
  `activeRingPos`. Made the active ring imperative (static `<circle ref>` set in
  a watch), so TreeWidget renders only on tree-structure change.
- **Status:** Build green; pending Firefox re-capture. Already merged into
  `green-integration`.
- Touches: `TreeWidget.vue`, worklog. (Also corrected the retrospective's
  "diffuse remainder" misjudgment + recorded the pull-both-render-and-patch
  analysis lesson.)

## Integration notes (for the merge / integration branch)

Expected conflicts when integrating all four onto one branch:
- **`FILES.md`** — all four edit it (different rows; mechanical).
- **`MergedDeltaPanel.vue`** — edited by both #2 (preview-show-marker) and #3
  (delta colour relayered). Both edits must survive: the colour application in
  `mergedSeries` (#3) *and* the `:preview-show-marker` (#2). Reconcile by hand.
- `FEATURES.md` — only #2 edits it.

Two pre-existing `useAutoSaveAnalyses` fake-timer test failures are on the clean
base (confirmed by stash) — **not** from this arc; ignore them when checking the
suite.

## State as of this note
- Five branches (the original four + `treewidget-render-decouple`); all commits
  committed, working trees clean.
- **Backup-pushed to origin: done** — all five branches are on origin.
- **Integration branch: done** — `bork/perf/green-integration` (off the session
  tip) merges all four. Zero merge conflicts (the overlapping `FILES.md` /
  `MergedDeltaPanel.vue` edits fell in different sections and auto-merged;
  verified `MergedDeltaPanel` carries both the BoardSnapshot preview *and* the
  themeColor relayer). Build green; suite 753 passed (only the 2 pre-existing
  `useAutoSaveAnalyses` flakes fail). This is the branch to test everything
  *combined* on — including the heatmap separated-boards preview window. Not
  pushed (untested-combined; awaiting maintainer QA).

License: Public Domain (The Unlicense).
