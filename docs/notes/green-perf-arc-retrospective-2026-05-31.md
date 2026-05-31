# Green-perf arc — retrospective (2026-05-31)

Retrospective on `bork/perf/green-integration` (the four-branch integration;
inventory: `green-perf-arc-branch-inventory-2026-05-31.md`) before merge to
`origin/main`. Cumulative measurement: `green_checkpoint_1.json.gz` — a 21 s
combined-stress capture (popover + streaming analysis + navigation) with all
four arcs combined.

## What the arc delivered

Ten commits across four arcs:
1. **observe-don't-poll** TreeWidget auto-center (correctness/hygiene; reflow was
   ~1% — banked, not a measured win).
2. **board-render SSOT** — one geometry module + one `BoardSnapshot` primitive +
   two non-drifting projections (string for v-html sinks, reactive `MiniBoard`
   for components); ChartPreviewBox per-nav `v-html` teardown excised; heatmap
   ECharts tooltip → fixed dual-board preview window.
3. **incremental enriched projection** — O(1)/packet vs O(N)/frame, exact, with
   an equivalence test.
4. **canvas rug-plots** — BoardTab + HorizontalTimelineVisualizer data tracks
   moved off the Vue render path.

## Measured outcome (green_checkpoint_1, 21 s combined-stress)

**Concentrated component-render hotspots — eliminated, confirmed combined:**

| component | before | after (integration) |
|---|---|---|
| `BoardTab` | 782 ms / 7.6 ms-per | **0 renders** |
| `HorizontalTimelineVisualizer` | 304 ms / 3.2 ms-per | **13.5 ms / 0.19 ms-per** |

**The honest new finding — `MiniBoard` is now the top component render** (386 ms,
683 renders, 0.57 ms-per). This is the *visible, cheaper form of a previously
hidden cost*: ChartPreviewBox used to inject board SVG via `v-html`, whose cost
landed in native `Styles`/`ContentRangeInserted` recalc (~6.6 ms/injection in
prod), not in the component-render mark. MiniBoard replaces that with reactive
diffing at ~0.57 ms/render — ~10× cheaper per update — but the cost is now
*attributed to a component render* rather than buried in native Styles. Net
positive, but `MiniBoard`'s **render frequency** (683 over 21 s ≈ 32/s) is the
new top candidate if the arc continues — it smells like residual per-packet
preview coupling.

**The native pipeline floor is unchanged — and this is the arc's central lesson.**

| metric | green_checkpoint_1 |
|---|---|
| LongTasks | 141 / 21 s ≈ **6.7/s** (≈ the pre-arc 6.3/s) |
| RefreshDriverTick | 17 250 ms ≈ **82%** of wall |
| UpdateContainerQueryStyles | 316 ms (chart container-query tax — deferred) |

Combined-stress jank is **native style/layout/paint-bound**, not JS-bound. Every
JS-level fix this arc shipped is real, but the LongTask *rate* barely moves
because the render pipeline (RefreshDriverTick ~82%) dominates wall-time. We
confirmed this repeatedly — `marker stack`, function sampling, and the flat
LongTask rate all agree.

## Honest verdict

This is a **CPU / battery / responsiveness + code-health** release, **not** a
combined-stress frame-rate release:

- **Real wins:** the two `per-render`-expensive components (BoardTab, timeline)
  are gone; ChartPreviewBox's forced-Styles teardown is gone; the thumbnail
  pipeline is a clean SSOT; the projection is exact-incremental with a test; a
  forced-reflow and a smooth-scroll battery-thief are gone. These reduce JS/CPU
  work and improve per-surface responsiveness — they matter for battery and for
  the non-pathological (single-subsystem) cases.
- **Not moved:** the combined-everything-at-once LongTask ceiling, which is the
  native paint pipeline. Moving that is a different class of work (DOM/paint
  complexity reduction, the container-query tax, MiniBoard frequency) and was
  out of scope here.

Calling it "highly beneficial" is fair on the battery/CPU/hygiene axis and on
per-surface latency; it would be over-claiming on the combined-stress frame
ceiling.

## Correction (2026-05-31, post-Chrome-capture)

The "diffuse / lower-ROI remainder" framing below was **wrong on the biggest
item.** A maintainer Chrome capture showed `<TreeWidget> render` at **762 ms /
24.1% self — the single biggest JS cost** (`<TreeWidget> patch` only 59.8 ms).
The render≫patch split is the tell: the per-item `v-memo` we'd added spares the
*patch*, not the *render*, and the render re-ran on every nav because the
template read `activeRingPos` (→ `currentNodeId`). This was an **analysis gap**,
not a tooling one — the `<Component> patch` marks are present in the Firefox
captures too (5,822 of them); the analysis had only ever aggregated `render`.

**Process lesson:** when ranking component cost, aggregate **both** `render` and
`patch` marks, and read render≫patch as render-coupling (re-render then
memo-skip-the-diff). Folded into the Firefox analysis workflow; no Chrome CLI
tooling required.

Fixed in `bork/perf/treewidget-render-decouple` (imperative ring, off the render
path — merged into `green-integration`). Pending Firefox re-capture to confirm.

Caveat: the Chrome (nav-heavy) and `green_checkpoint_1` (preview-heavy) captures
disagree on #1 by workload. The **robustly-large** lever across both is the
MiniBoard/preview subtree (`ChartPreviewBox patch` 865 ms in Firefox, 604 ms in
Chrome); TreeWidget render dominates *nav-heavy* use specifically.

## Remaining levers

- **MiniBoard / preview subtree** — the robust top lever across both captures
  (`ChartPreviewBox patch` total ~865 ms). Per-packet/nav preview coupling; the
  next real target.
- Analysis-panel container-query recompute (deferred-items entry; ~2%).
- `BoardWidget` / `BoardDisplay` patch subtree (nav-driven board re-render).
- The native RefreshDriverTick floor (DOM/paint complexity — the real ceiling).
- Pre-existing `useAutoSaveAnalyses` fake-timer test flakes (unrelated; worth a
  separate look).

## Merge posture

`green-integration` builds green; suite 753 passed (only the 2 pre-existing
flakes). Recommend merging to `origin/main` as the consolidated unit (or the
four component branches individually — each individually validated; see the
inventory). A post-merge re-capture on `main` confirms nothing regressed in
integration.

License: Public Domain (The Unlicense).
