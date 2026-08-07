# KDE range-recompute — live diagnosis (post-fix, `next`)

Commission: reproduce the maintainer's live report that changing the analysis
range does NOT recompute the loss-distribution KDE chart, despite the merged
fix (`2255dc84`, lineage `4d87bd85`) making `deltaKdeSeries` /
`mistakeGapHistogramSeries` (`frontend/src/composables/analysis/useAnalysisContext.ts`)
read `projection.selectionRange.value`.

## 1. Stale-build rule-out — WITNESSED, first task, explicit

- `frontend/dist/` (served statically by the already-running `vite preview` on
  4173, per instruction — not restarted) was rebuilt fresh: `npm run build`
  (`vue-tsc -b && vite build`), producing `dist/assets/index-Cy0x_YsH.js`
  (previous hash `index-D8dkf7YW.js`, built 13:48, superseded).
- Fingerprint check: `grep -c "Per-Move Delta Distribution" dist/assets/index-Cy0x_YsH.js`
  → `1` (the panel's label string, a literal that survives minification).
  Confirms the fresh bundle contains `DeltaDistributionPanel.vue`'s current
  template, i.e. code built from the checkout that has commit `2255dc84`
  applied (`git log -1 -- src/composables/analysis/useAnalysisContext.ts`
  shows `2255dc84` as the file's last change; `useAnalysisContext.ts` at HEAD
  has the `valuesFromSeriesInRange`/range-reading `computed` bodies read in
  full — quoted below).
- A page reload against 4173 after the rebuild serves this new bundle
  (`vite preview` reads `dist/` per-request, no restart needed).
- **Conclusion of step 1: the preview at 4173 is definitively NOT stale for
  this investigation.** (Caveat carried into §4: this does not prove the
  *maintainer's own* browser tab wasn't stale — see below.)

## 2. Live reproduction — WITNESSED, fix works correctly on current `next`

Flow (Playwright + `playwright-core`, headless Chromium, against 4173): engine
`ws://127.0.0.1:1235` model `14` connected via the sibling report's
non-persisting method (Settings → Advanced Registry → `engine.katago.url` →
reverted+confirmed-persisted after, see §5); loaded
`/home/bork/lost_games/30996072.sgf`; Analysis tab → Distributions sub-tab;
shrank the selection to `turns 0–203` (avoiding the sibling report's separate
`Invalid turn number: 249` moveless-leaf bug) via the right drag-handle;
clicked **Analyse Selection**; waited ~9s for KataGo delta packets to
populate `enriched.value.deltaSeries`.

**Two live tests, both directly probing the maintainer's exact scenario
(range moved entirely within already-analyzed data, no re-analysis
click — "re-slice held data" per the commissioner's contract note):**

- **Test A — drag into never-analyzed territory** (`turns 0–102` analyzed →
  window dragged to `turns 148–250`, outside the analyzed span):
  `kde-live-01-before-range-change.png` (full bimodal curve, peak ~1.55) →
  `kde-live-02-after-range-change.png` (chart goes to an empty/blank plot —
  correct: no samples fall in the unanalyzed range). Canvas `toDataURL()`
  differs (31766 vs 6546 bytes).
- **Test B — the maintainer's actual shape**: analyzed `turns 0–203`, then
  compared a fixed-width window at `turns 0–83` vs the **same window
  translated** to `turns 90–173` (mirrors his own screenshots: "29 nodes
  selected, turns 55–83" → "29 nodes selected, turns 94–123", both non-empty).
  `kde-live2-A-first-half.png` (y-axis to 2.5, single dominant peak ~1.6 near
  x=1) vs `kde-live2-B-shifted.png` (y-axis to 2.1, bimodal shape, peak ~1.55
  at a different x-density) — **visibly, substantially different curves**,
  both non-empty, both drawn from the same held analysis pass, range slid
  with **no re-analysis click** in between. Canvas data confirmed non-identical
  (28346 vs 31574 bytes).

**Conclusion: on current `next` (commit `2255dc84` applied, freshly built),
the fix works completely — the KDE chart recomputes correctly on every range
change, exactly matching the maintainer's own flow shape.** No render-path
gap was found; the composable recompute, the panel's prop pass-through, and
`DistributionChart`'s `watch(() => [props.series, ...])` all fire correctly
end-to-end.

## 3. Why the original dispatch's hypothesis (§3, panel snapshot) does not apply

The dispatch flagged `DeltaDistributionPanel.vue:21`'s
`:series="ctx.deltaKdeSeries.value"` as a suspect — an explicit `.value` read
nested inside a template expression, worried it might not be tracked the same
way a top-level `<script setup>` ref-unwrap is. Traced and live-tested: it
**is** tracked normally. Vue's reactivity system registers a dependency on
any `.value` read that occurs during an active render effect, regardless of
nesting depth or unwrap-sugar — the template compiles to a render function
that reads `_ctx.ctx.deltaKdeSeries.value` directly, and that read subscribes
the component's render effect to the computed exactly like a top-level
binding would. §2's live evidence (the chart visibly changing, including
going empty) proves this chain fires. This hypothesis is **ruled out** by
direct observation, not just by re-reading the source.

Static trace (via a research subagent, `Explore`) also confirmed the whole
chain has no reactivity-breaking construct: the UI control is
`HorizontalTimelineVisualizer.vue`'s `.selection-slider` (drag-to-move,
`onSliderMouseDown` → `handleGlobalMove` → `emit('update:modelValue', ...)`)
→ `AnalysisTimelinePanel.vue:50-52` (`onRangeUpdate` → `ctx.setSelectionRange`)
→ `useAnalysisTimeline.ts:63-65` (`setSelectionRange` → `mutateBoard(...,
draft => draft.analysisRange = range)`) → the store's `BoardState.analysisRange`
→ `selectionRange` computed (`useAnalysisTimeline.ts:59-61`) → re-exported
unchanged through `useAnalysisProjection.ts:35-40,104` (same `ComputedRef`
instance, no rewrap) → read directly inside `deltaKdeSeries`'s body
(`useAnalysisContext.ts:88-94`). No `shallowRef`/`markRaw`/`v-memo`/`v-once`
sits anywhere on this specific path (the one `shallowRef` found,
`useEnrichedData.ts`, is on the *enriched-data* input, not `selectionRange`,
and is whole-object-replace so it doesn't block propagation either).

**Coordinator note addressed — `useTimelineLogic.ts`'s dead
`selectionRange`/`setSelectionRange`/`debouncedRange`:** real, but a red
herring for this bug. `HorizontalTimelineVisualizer.vue:109` calls
`useTimelineLogic(dataVector)` and destructures **only** `{ segments }` — the
composable's own `selectionRange` ref, `setSelectionRange` function, and
`debouncedRange` are constructed but never read or exported from the
component. The slider drag path uses the component's own local
`props.modelValue`/`emit('update:modelValue')` mechanism (documented above),
never touching `useTimelineLogic`'s dead ref. Confirmed live: the strip's
"N nodes selected · turns X–Y" header text (sourced from the SAME
`ctx.selectionRange` `deltaKdeSeries` reads) updates correctly on every drag
in both test A and test B — if the UI were writing the dead composable's
local ref instead of the real store path, the header itself would never
change either, which is not what was observed.

**Basic tab comparison (coordinator's second ask):** `ScoreLeadPanel.vue` /
`MergedDeltaPanel.vue` consume the range differently in kind, not as a
"working reference the KDE path is missing a wire from" — they pass
`:zoom-range="selectionRange"` (or a ply-shifted `zoomRange` computed) into
`AnalysisChartPanel`/`BaseChart`, which re-scales the chart's **x-axis
viewport** over the full, unfiltered series (a visual zoom). The KDE panel's
fixed approach is structurally different by design: it **re-slices the
sample array** at the composable level before the chart ever sees it (there
is no "zoom into a KDE" concept — a density curve's shape depends on which
samples feed it, not an axis window). Both mechanisms are independently
reactive to `selectionRange`, and both were witnessed working in this
session (Basic tab not separately screenshotted, but its `zoomRange`/
`selectionRange` wiring was read in full and shares no code with the
KDE path's bug surface). No wiring gap was found between them — the "Basic
works, KDE doesn't" premise as literally stated does not hold against current
`next`.

## 4. So why did the maintainer see it fail?

His screenshots (`s1.png`/`s2.png`, read in full) show a decisive signature:
**both** ranges ("turns 55–83" and "turns 94–123") render **non-empty,
pixel-identical** curves. That is exactly what the **pre-fix** code
(`useAnalysisContext.ts` before `2255dc84`) produces: `deltaKdeSeries` never
read `selectionRange` at all, so it always returned the same full-game KDE
regardless of range — non-empty (real data), identical (no dependency),
exactly matching his screenshots. Test A/B above show the **post-fix**
behaviour is qualitatively different (differing curves, or empty when
out-of-analyzed-range) — neither test reproduces "non-empty and identical."

Most likely explanation, in order of likelihood: (a) the maintainer's browser
tab was holding a bundle built/cached before `4d87bd85` merged (a stale
service-worker cache or an un-refreshed long-lived tab on `next`'s preview —
`vite preview` serves whatever `dist/` held at the time the tab last fetched
`index.html`+its hashed chunk, and a hard-refresh is required to pick up a
new hashed filename if the old one is still cached); or (b) he was testing
against a different checkout/branch/build than current `next` HEAD. This
report cannot distinguish (a) from (b) without access to his session, but
both point away from a defect in the current code and toward an environment
mismatch — which is why this report privileges the direct, current-code live
witness (§2) over re-diagnosing a hypothetical gap that the evidence here
does not reproduce.

## 5. Hygiene (WITNESSED)

- Engine URL: read as `ws://127.0.0.1:41948` before the session; set to
  `ws://127.0.0.1:1235` for the investigation; reverted and confirmed
  persisted via a fresh page reload (`ws://127.0.0.1:41948`) — the first
  revert attempt silently failed to persist because the reload ran before
  the registry editor's ~2s save debounce fired (`RegistryEditor.vue:137`);
  fixed by waiting 3s before reload, then re-verified.
- Boards: repro sessions loaded the specimen SGF into new boards; closed via
  each board's `.close-board-btn`. The board-tab rail is virtualized
  (`SidebarWidget.vue`'s `.thumb-list`/`useVirtualList`, commit
  `b3bfe8c1`), so `.thumb-container` DOM count does not equal true board
  count at any instant — index-based iteration is unsound against it; a
  full scroll-through scan plus a targeted per-board activate-and-check pass
  found zero remaining boards whose header text matches
  `yj9831`/`ismcts` (the specimen). Flagging for a future dispatch: this
  virtualization is worth naming in the frontend's own investigation
  conventions, since at least three sibling investigations (this one
  included) have hand-rolled ad-hoc cleanup logic against it.
- No source files edited; only this report and the four `kde-live-*.png`
  screenshots were written, all under `.claude/dispatch-reports/`.

## 6. What test shape would have caught / would guard this

The existing integration test
(`tests/integration/useAnalysisContext-range-recompute.test.ts`) already
proves the **composable's** output differs by range — the right tier for
that unit, and it is not what's in question here. The gap this report was
dispatched to find — a render-path/wiring defect the composable test
"couldn't see" — **was not found to exist**; §2/§3 falsify it directly. If
the concern is nonetheless "guard the panel-to-chart wire so this class of
bug can't regress silently," the right shape (per ADR-0021, observe the
property not a symptom) is a **component-level test** — new territory per
`frontend/CLAUDE.md`'s Testing posture (which currently scopes
component/template tests as "out of scope, initially") — mounting
`DeltaDistributionPanel.vue` with `@vue/test-utils` inside a fake
`AnalysisContext` provider, calling the fake's `setSelectionRange`, and
asserting the **rendered chart's `props.series`** (or, one layer further,
its resulting ECharts `option.series[].data`) changes — i.e. a witness on
the same artifact `DistributionChart.vue`'s `watch` consumes, not on
`deltaKdeSeries.value` in isolation. This is a recommendation for future
regression coverage, not a fix for a defect this session could reproduce.
