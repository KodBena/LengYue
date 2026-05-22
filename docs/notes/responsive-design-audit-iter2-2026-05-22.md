# Responsive design audit (iteration 2) — 2026-05-22

- **Status:** **Closed 2026-05-22.** Per-finding resolution below in
  the "Resolution by finding" section appended at the bottom of this
  document. The iter-2 audit's findings A, B, C, F, G, H all
  resolved during the responsive arc; D and E are explicitly
  deferred (recorded in `docs/TODO.md`'s "Responsive design —
  deferred items"). Closure date matches the predecessor audit's
  closure (`responsive-design-audit-2026-05-22.md`).
- **Scope:** `frontend/` Vue 3 + TypeScript SPA, **connected /
  actively-analyzing state** specifically
- **Priority:** Desktop use. Mobile findings are documented as a
  formality.
- **Predecessor:** `docs/notes/responsive-design-audit-2026-05-22.md`
  (iteration 1). That audit exercised the **disconnected** state
  only; this one drives the engine, loads a real game, and starts
  range analysis so the live chart surfaces render with data.

## Method

A single Playwright + Firefox driver script
(`/tmp/audit-iter2.py`) reused the existing
`/tmp/playwright-venv`. The script:

1. Navigates to `http://192.168.122.68:5173/`.
2. Clears `localStorage` and signs in as
   **`responsive_iter2_2026_05_22`** via `#login-username`
   (distinguishing this run from `audit_2026_05_22` in the
   prior audit and `local_user`).
3. Loads `/home/bork/sgf/zchen-Fredda.sgf` via the Sidebar's
   "LOAD SGF" affordance (Playwright's `expect_file_chooser`
   catches the transient `<input type="file">` created by
   `useSgfLoader.openFileDialog()` —
   `frontend/src/composables/sgf/useSgfLoader.ts:65-76`).
4. Clicks the toolbar `CONNECT` button (the proxy URL was already
   present in the persisted profile — `ws://192.168.122.68:1235`).
5. Switches to the Analysis tab and triggers range analysis with
   50 visits across the full game (169 nodes).
6. Resizes to six viewports — 1920×1080, 1440×900, 1280×800,
   1024×768, 800×600, 375×667 — screenshotting the analysis
   tab and the cards tab at each size, and capturing the
   computed geometry of every chart container via
   `getBoundingClientRect` + `getComputedStyle`.
7. Sanity-checks the iteration-1 fix: at 1024×768, can the
   Analysis tab in the control-panel tab strip be clicked from
   the default chrome state?

Screenshots live in
`/tmp/responsive-audit-iter2-screenshots/` (18 PNGs plus
`geometry.json` and `iter1_fix_status.txt`).

Engine confirmed actively analyzing during capture by visible
WINRATE / LEAD / PPS / QUEUE values in the toolbar and by streaming
data lines in the GAME STATE / PER-PLAYER PERFORMANCE / 
MULTIRESOLUTION INTERVAL ANALYSIS charts at the wide viewport.

---

## Desktop findings (priority)

### Finding A (the user-named one) — chart area collapses to a horizontal sliver in the linear panels

**Symptom.** When the control panel is narrow (≤ ~250 px wide),
the GAME STATE and PER-PLAYER PERFORMANCE chart bodies shrink to
~29 px of visible ECharts width while the on-board-thumbnail
preview-box beside each chart retains its full 140 px. The chart
becomes a thin vertical strip showing essentially no data.

**Measured chart-area width (`BaseChart roots` ECharts canvas), at
each viewport, with the default chrome layout (sidebar expanded,
tree panel visible, all toggles on):**

| Viewport   | linear-content w | chart-area w | chart fraction |
|---         |---               |---           |---             |
| 1920×1080  | 1014 px          | 874 px       | 86%            |
| 1440×900   | 534 px           | 394 px       | 74%            |
| 1280×800   | 374 px           | 234 px       | 63%            |
| 1024×768   | 169 px           | **29 px**    | **17%**        |
| 800×600    | 169 px           | **29 px**    | **17%**        |
| 375×667    | 169 px           | **29 px**    | **17%**        |

Visible in `1024x768__analysis.png`, `800x600__analysis.png`, and
`375x667__analysis.png`. The 1280×800 screenshot
(`1280x800__analysis.png`) shows the chart already squashed enough
that the line traces are unreadable. The 1920×1080 screenshot
(`1920x1080__analysis.png`) is the reference baseline.

**Root cause (high confidence, derived from source).**
`frontend/src/components/charts/AnalysisChartPanel.vue:69-72`
declares:

```css
.linear-content { display: flex; height: 160px; align-items: stretch; }
.chart-area { flex: 1; min-width: 0; }
.preview-box { width: 140px; ... }
```

The flex row has two children. `.chart-area` carries the modern
`min-width: 0` discipline (correctly — it should shrink below the
ECharts intrinsic size), but `.preview-box` is an **un-shrinkable
fixed-width 140 px** (no `flex-shrink`, no `min-width: 0`, no
`flex` declaration at all — so it defaults to `flex: 0 1 auto`
which respects the explicit `width: 140px`). When the
`.linear-content` parent narrows to under ~170 px, the preview-box
consumes essentially everything, leaving the chart-area with the
small residue.

The horizontal collapse pathology is symmetric across the
**ScoreLeadPanel** (`series="mainSeries"`) and the
**MergedDeltaPanel** (`blackSeries` + `whiteSeries`) because both
go through the same `AnalysisChartPanel` shell. The
StabilityPanel's heatmap (`.heatmap-content { height: 450px }`,
`StabilityPanel.vue:87-92`) does **not** suffer this pathology —
the heatmap has no sibling preview-box and gets the full
container width (`HeatmapChart` measured at width = 169 px when
control panel is 219 px, which is the available width minus
border/padding, not a sliver).

Why this matters at "normal" desktop sizes too: even at 1280×800
the chart-area is at 234 px wide while the preview-box still
claims 140 px — 38% of horizontal space is the preview-box, which
is fine if the user is reading positions from hover but
counter-productive if the user wants to read the chart trace. The
ratio is fixed regardless of how wide the container gets, so a
1920×1080 user gets 14% preview / 86% chart; a 1024×768 user gets
83% preview / 17% chart. The geometry is wrong-shaped at narrow
widths because the preview-box is sized in absolute units while
the chart is sized in relative units.

**Why the static audit missed it.** The prior audit
(iteration 1) inspected `linear-content` and noted
`height: 160px` as a fixed dimension but did not name the
preview-box width as a sibling failure mode. The audit's
"controls panel narrower but usable" verdict at 1280×800 was
based on visible button positioning, not chart-canvas geometry —
which is plausibly readable but already at the 63% mark in this
measurement.

### Finding B — `AnalysisDashboard.vue:101` magic-height `calc(100vh - 165px)` causes the dashboard to overflow the tab-body

**Symptom.** The dashboard container claims a fixed
`calc(100vh - 165px)` height regardless of how much vertical
space the tab-body actually has. At narrow widths the tab-body's
flex chain delivers less than the dashboard's claimed height,
forcing the parent `.tab-body` to scroll. At wider widths it
roughly works, but is brittle to chrome-height changes (the prior
audit named this as a non-derived 165 px subtrahend).

**Measured dashboard heights vs viewport heights:**

| Viewport   | dashboard cssHeight | dashboard rendered h | viewport h | tab-body h | overflow? |
|---         |---                  |---                   |---         |---         |---        |
| 1920×1080  | 915 px              | 915 px               | 1080       | 1027       | no        |
| 1440×900   | 735 px              | 735 px               | 900        | 847        | no        |
| 1280×800   | 635 px              | 635 px               | 800        | 747        | no        |
| 1024×768   | 603 px              | 603 px               | 768        | 715        | no        |
| 800×600    | 435 px              | 435 px               | 600        | 547        | no        |
| 375×667    | 502 px              | 502 px               | 667        | 614        | no        |

The arithmetic on the dashboard's `100vh - 165px` matches across
all viewports (the calculation respects only viewport height, not
parent height). At all measured viewports here the dashboard does
fit inside the tab-body, but only because the chrome on this run
happened to be ~165 px tall above the tab-body. At 1024×768 the
dashboard's bottom edge sits at y = 297 + 603 = 900 — already
132 px below the 768-tall viewport bottom, which means the user
scrolls inside `.tab-body` to see the StabilityPanel's heatmap.
That scrolling is intentional, but tying the height to `100vh`
rather than to the parent (`100%` with a proper flex chain) is
the design fragility named in the prior audit
(`AnalysisDashboard.vue:101`).

**Root cause hypothesis (conjectural — based on file inspection,
not on a varied-chrome experiment).** The dashboard's intent is
"fill the available vertical space inside the analysis tab,
clipping at the viewport floor". A correct expression of that
intent would be `height: 100%` plus a `min-height: 0` flex chain
from `.tab-body → .tab-pane → .tab-padding → .chart-container-outer
→ .dashboard`. The current `calc(100vh - 165px)` is a workaround
shape that gets the right value when the 165 px assumption holds.
The conjectural failure cases:

- If any chrome height ever changes (toolbar grows from 28 to
  40 px when a new label lands; system-log bar appears via
  `transientLogReveal`; status bar wraps), the 165 px is off.
- If the analysis tab is opened with the system-log bar
  visible (`v-if="store.session.ui.systemLogExpanded || transientLogReveal"`,
  `App.vue:319`), the available vertical space shrinks by the
  log bar's height but the dashboard still claims `100vh - 165`.
- The prior audit's static finding flagged exactly the
  arithmetic-fragility class; this iteration's geometry data
  confirms the height is hard-coded against viewport, not
  parent.

### Finding C — `.chart-container-outer { min-height: 200px }` exceeds the inner dashboard at the smallest viewports

`AnalysisControls.vue:319` declares
`.chart-container-outer { min-height: 200px }`. At 800×600,
the dashboard renders at 435 px tall, which is fine — but if the
viewport were 350 px tall (a tiny window state, or a
projected-screen scenario), `100vh - 165 = 185 px < 200 px`,
so the `min-height: 200px` on the wrapper would force the inner
dashboard to render larger than its flex-chain allocation,
producing a layout inconsistency. This is a corner case but the
two constraints disagree about what the minimum dashboard height
should be (one says "200 px", the other says "viewport-derived").
No visible symptom in this audit's measured viewports; flagged
because the two constraints disagree silently and the more
permissive `200px` floor wins.

### Finding D — `AnalysisTimelinePanel`'s rug plot reads 16 px regardless of viewport

`HorizontalTimelineVisualizer.vue:378` declares
`.timeline-container { height: 16px }`. The rug-plot's visual
strip is a fixed 16 px tall regardless of how much vertical
space is available. At 1920×1080 this is fine — there's plenty
of room. But the rug plot is the *primary* selection-range
affordance for range analysis (the user drags the handles to
choose the analyze span), and at 16 px tall the touch handles are
defeated (echoes the prior audit's mobile-touch finding under
"Surprises in the touch-aware code") **and** the visual density
of the per-position visit counts is constrained: at a 1014 px
wide × 16 px tall strip showing 169 plies, each ply is ~6 × 16
px and the rug-plot intensity is legible; at 169 plies × 169 px
wide (1024×768 case) each ply is ~1 × 16 px and the strip is
visually pixelated.

This is conjectural in terms of user perception — the strip is
intended to be a dense overview, so the 1-px-per-ply density at
narrow widths may be acceptable as a "you can't read
individual positions but the gradient is the signal" affordance.
Naming it because the prior audit's
"hardcoded panel widths" cross-cutting finding extends to fixed
heights in the analysis surface.

### Finding E — preview-box content (board thumbnail) is sized in the same fixed 140 px as the wrapper

The preview-box width of 140 px constrains the SVG board
thumbnail to render at 140 × 160 px (`linear-content { height:
160px }`, `.preview-box { width: 140px }`,
`AnalysisChartPanel.vue:69-71`). This is fine at wide viewports
(the chart has plenty of width left). But at the smallest
viewports — where the chart is the visible signal compromised —
the preview-box continues showing a perfectly readable
thumbnail. The thumbnail is the *secondary* affordance (it
explains the hovered position); the *primary* affordance is the
chart trace. The geometric allocation is inverted from the
information-architecture priority.

**Root cause hypothesis.** This is a deliberate design call
that was wider-viewport-tested. When the surface narrows below
~400 px wide, the priority should arguably flip — the chart
should claim the full width and the preview-box should either
hide, become an overlay, or shrink. The current implementation
has no such conditional.

### Finding F (serendipitous) — `BaseChart`'s ECharts `grid.left: '10%'` consumes 10% of an already-narrow chart-area

`BaseChart.vue:294` declares the ECharts grid with
`left: '10%'`. At 1024×768 the chart-area is 29 px wide, of
which 10% (~3 px) is the y-axis label gutter. The y-axis label
fontSize is 9 px (`BaseChart.vue:305`) — taller than the 3-px
gutter. ECharts will silently clip or omit y-axis ticks under
this geometry, but the visible failure is just "chart looks even
more empty" which compounds Finding A.

Visible in `1024x768__analysis.png`: the chart-area appears
mostly empty even with line traces present.

### Finding G — toolbar metric clusters get crushed even at 1440×900 in the connected state

The 1440×900 screenshot (`1440x900__analysis.png`) shows the
toolbar's right-side cluster (VERSION / MODEL / WINRATE / LEAD /
PPS / LATENCY / WATCHDOG / QUEUE) bleeding over the right edge
in the analysis-tab view, because the control-panel's 220 px
floor + tree-panel 220 px + sidebar 108 px leaves limited room
for the board-column + toolbar. Confirms the prior audit's
"Toolbar has no `flex-wrap`" cross-cutting finding under the
connected state (the prior audit only saw it at 800×600 and
below). At 1440×900 the toolbar metric overflow is now visible
because the live engine populates more text into the metric
labels.

### Finding H — `400px` `max-height` on `.registry-container` ignores tall viewports

(Recapitulation of the prior audit's settings-tab finding —
named here because this audit confirmed it at multiple
viewports while paging across the tab strip. At 1920×1080 the
registry container's 500 px override at `App.vue:401` and 400 px
default at `App.vue:576` create a fixed-height scroll region
inside an otherwise-spacious tab. No new evidence; flagging only
to record that this finding was visible during iter2 paging.)

---

## Static-audit cross-confirmation

What the iter1 static audit predicted that iter2 confirmed:

- **Toolbar has no `flex-wrap`** (`Toolbar.vue:317`) → confirmed
  at 1440×900 in the connected state (Finding G), earlier than
  the iter1 audit's 800×600 cutoff because the connected state
  populates more metric text.
- **`AnalysisDashboard.vue:101` magic-number height** → confirmed
  via the dashboard-height vs. viewport-height table in
  Finding B. The 165 px subtrahend is observable as the exact
  difference between viewport height and dashboard cssHeight.
- **`#control-panel` `flex-shrink: 0`** (`App.vue:527`) and the
  220 px `minWidth` inline override (from the iter1 fix in
  d3c0714) — confirmed: the control panel does pin at 220 px
  even at 800×600 and 375×667, allowing the tab strip to stay
  reachable. Iter1 fix intact.
- **Hardcoded panel widths consume the viewport** → confirmed at
  1024×768 and below: the control panel's 220 px floor plus the
  140 px preview-box inside it leaves only ~30–50 px for the
  chart. The hardcoded-widths finding now extends one level
  deeper than the iter1 audit could see (chart-internal fixed
  widths, not just chrome-level fixed widths).

What this iteration **adds** that the iter1 audit could not see:

- **Chart-area horizontal collapse is the dominant symptom in
  the analyzing state** (Finding A). The static read of
  `AnalysisChartPanel.vue:69-72` could have predicted it in
  principle but the iter1 audit did not isolate the preview-box
  width as the load-bearing cause; without engine data
  populating the chart the symptom was invisible.
- **Per-viewport chart-area widths measured via
  `getBoundingClientRect`** — the geometry record in
  `/tmp/responsive-audit-iter2-screenshots/geometry.json` is
  reusable evidence for future iterations.

What this iteration could **not** reach (gaps, not
counterexamples):

- The match-running state — `EngineMatchModal` and the
  in-flight-match toolbar variant — was not exercised. The
  match flow would require seeding the opponent's clock /
  identity / starting position; out of scope here.
- The card-review session UI — same gap as the iter1 audit;
  reaching an active review session requires the workspace's
  card-set to be populated with reviewable cards, which is more
  setup than this audit's budget covered.
- Hot reloading / re-render under engine reconnection — the
  audit captured static frames at each viewport; the dynamics
  of "chart resizes mid-analysis when control panel is dragged"
  is not exercised. The ECharts ResizeObserver
  (`BaseChart.vue:446-449`) is the mechanism; whether it
  triggers correctly under live data updates was not tested.

---

## Live verification

### Iter1 fix sanity check

At 1024×768 with the default chrome state, the Analysis tab in
the control-panel tab strip is **reachable**. Playwright's
`get_by_role("listitem").filter(has_text="Analysis").first.click()`
landed cleanly; `iter1_fix_status.txt` records `REACHABLE`. The
prior audit's failure mode ("Element is outside of the
viewport") is resolved by the d3c0714 commit's two-line fix
(`#control-panel` inline `minWidth: '220px'`, `#board-column`
`flex: 0 1 auto`).

### Connected-state confirmation

The toolbar at 1920×1080 reports `MODEL b10c128`,
`WINRATE 2.8%`, `LEAD -16.1pts`, `PPS 0`, `LATENCY 13ms`,
`WATCHDOG`, `QUEUE 5/5` — confirming the engine session is
active and the proxy is responding. The GAME STATE chart shows
multi-series traces (colored line plots typical of the
Score / Win-prob / Complexity bundle); the PER-PLAYER
PERFORMANCE chart shows blue/red interleaved deltas; the
MULTIRESOLUTION INTERVAL ANALYSIS heatmap shows the canonical
red-quartile-bright triangle. All three panels rendered with
engine data during the audit window.

### Key screenshots referenced

- `1920x1080__analysis.png` — connected baseline, charts at 86%
  of linear-content width
- `1440x900__analysis.png` — 74% chart fraction, toolbar metric
  overflow visible
- `1280x800__analysis.png` — 63% chart fraction, chart traces
  becoming hard to read
- `1024x768__analysis.png` — **17% chart fraction** —
  user-named chart-sliver symptom visible
- `800x600__analysis.png` — 17% chart fraction, dashboard
  scrolls below the visible tab-body
- `375x667__analysis.png` — 17% chart fraction, mobile-width
  the same pathology
- `1024x768__cards.png` — Cards tab at 1024×768; iter1 fix
  visibly intact (DECKS sub-tab and Start Review button
  reachable)
- `geometry.json` — raw `getBoundingClientRect` /
  `getComputedStyle` records for every analysis-chart selector
  at every measured viewport

---

## Mobile / touch findings (formality)

No new mobile findings beyond what the iter1 audit's mobile
section captured. The chart-sliver pathology (Finding A) is the
same at 375×667 as at 1024×768 because both viewports clamp the
control panel to the 220 px floor. The
`HorizontalTimelineVisualizer` selection handles
(`HorizontalTimelineVisualizer.vue:445,454-455`) remain 16 px
wide as the iter1 mobile section noted; on touch the rug-plot
is even less usable when the chart area beside it is collapsed.

---

## Related files

- `frontend/src/components/charts/AnalysisChartPanel.vue` —
  the load-bearing file for Finding A. `.linear-content` flex
  row, `.preview-box { width: 140px }` fixed width, `.chart-area
  { flex: 1; min-width: 0 }` lines 69-72.
- `frontend/src/components/charts/AnalysisDashboard.vue` —
  Finding B (`height: calc(100vh - 165px)` line 101).
- `frontend/src/components/editors/AnalysisControls.vue` —
  Finding C (`.chart-container-outer { min-height: 200px }`
  line 319).
- `frontend/src/components/tree/HorizontalTimelineVisualizer.vue`
  — Finding D (`.timeline-container { height: 16px }` line 378).
- `frontend/src/components/charts/BaseChart.vue` —
  Finding F (ECharts `grid.left: '10%'` line 294;
  yAxis `axisLabel.fontSize: 9` line 305).
- `frontend/src/components/charts/ScoreLeadPanel.vue` and
  `MergedDeltaPanel.vue` — both delegate to
  `AnalysisChartPanel`, so both inherit Finding A.
- `frontend/src/components/charts/StabilityPanel.vue` —
  exception case for Finding A (no preview-box sibling, full
  width used).
- `frontend/src/components/chrome/TabWidget.vue` — the flex
  chain that hosts the analysis tab pane
  (`.tab-body { flex: 1; overflow-y: auto; min-height: 0 }`
  line 92-97).
- `frontend/src/App.vue` — `#control-panel` inline style
  (`minWidth: '220px'`, the iter1 fix on line 366) and
  `.registry-container { max-height: 400px }` line 576
  (Finding H).
- `docs/notes/responsive-design-audit-2026-05-22.md` — iter1
  predecessor.
- `/tmp/audit-iter2.py` — driver script preserved for re-run.

---

## Resolution by finding (close-out)

The 23-iter responsive arc on `feat/responsive` addressed the iter-2
audit's findings as follows. See the predecessor audit's "Resolution
by iter" section for the cross-cutting iter-1 findings; this block
covers iter-2's eight surface-specific findings only.

- **Finding A — chart area collapses to a 29 px sliver in linear
  panels** — **resolved by iter-2** (commit `3efc1a0`). Container
  query `@container (max-width: 379px)` on `.linear-content` hides
  `.preview-box` below the 380 px threshold, letting `.chart-area`
  claim the full row. Threshold is content-derived (140 + 240 = 380,
  documented as `magic-literal:` in `AnalysisChartPanel.vue`).
- **Finding B — `AnalysisDashboard.vue:101` magic-height
  `calc(100vh - 165px)`** — **resolved by iter-12** (commit
  `67d816a`). Parent-relative `height: 100%` plus `min-height: 0`
  flex chain end-to-end through `.tab-body → .tab-pane → .tab-padding
  → .chart-container-outer → .dashboard`. The chain's
  `flex-direction: column` on `.chart-container-outer` is load-
  bearing (without it the horizontal axis collapses; the user spotted
  the regression during interactive test and the corrective shipped
  in the same iter).
- **Finding C — `.chart-container-outer { min-height: 200px }`
  silently conflicts with the dashboard's calc-derived height** —
  **resolved by iter-5** (commit `ba8f0cc`). Removed the 200 px
  floor; the dashboard's parent-relative height (after iter-12) is
  the single source of truth on the analysis surface's vertical
  extent.
- **Finding D — `AnalysisTimelinePanel` rug plot fixed at 16 px** —
  **deferred.** Conjectural in terms of user perception per the
  audit's own framing; the rug-plot's intended density (1 px/ply at
  narrow widths is the "gradient is the signal" affordance) is
  preserved. Recorded in TODO.md's deferred items.
- **Finding E — preview-box content sized in the same fixed 140 px
  as wrapper** — **subsumed by Finding A's resolution.** Hiding the
  preview-box below 380 px container width removes the geometric
  inversion this finding named at narrow viewports.
- **Finding F — `BaseChart` `grid.left: '10%'` consumes 10% of an
  already-narrow chart-area** — **resolved by iter-3** (commit
  `d47d379`). `grid.left` changed from `'10%'` to `30` (absolute
  px), sized to fit the longest expected y-axis label at fontSize 9
  with breathing room. Documented as `magic-literal:` in
  `BaseChart.vue:301`.
- **Finding G — toolbar metric clusters crushed at 1440×900 in the
  connected state** — **resolved by iter-13** (commit `aa114eb`).
  `.toolbar { min-height: 28px; flex-wrap: wrap }` plus parent
  `.top-nav-bar { min-height: 32px }`. Wrap engages organically when
  the metric cluster's natural width pushes the row over container
  width.
- **Finding H — `.registry-container { max-height: 400px }` ignores
  tall viewports** — **resolved by iter-4** (commit `06288a0`).
  Default container uses `clamp(400px, 60vh, 800px)`; Card Sets
  inline override uses `clamp(500px, 70vh, 900px)` for its richer
  table. Floor preserves prior behaviour on short viewports; cap
  prevents 4K runaway.

The connected-state surfaces that the iter-2 audit recorded as the
"chart-sliver pathology" at 17% chart fraction at 1024×768 and below
now render at 100% chart fraction below the 380 px CQ threshold
(preview hidden) or at the prior 86% at wider viewports (preview
visible).

## License

Public Domain (The Unlicense).
