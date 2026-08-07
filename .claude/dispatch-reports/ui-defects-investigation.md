# UI defects investigation — LengYue frontend

Read-only investigation. No source files were edited. Screenshots and this
file are the only writes, all under `.claude/dispatch-reports/`.

## Docs read (per frontend/CLAUDE.md's read-end-to-end discipline)

- `frontend/CLAUDE.md` — read in full.
- `frontend/FILES.md` — consulted as a lookup reference (its own stated
  consumption mode; not read end-to-end).
- `frontend/scripts/perf-capture.mjs` — read in full (isolation/driving
  conventions).
- `frontend/eslint.config.js` — read lines 1–946 of 1224 in full (the header's
  rule-rationale prose through the store-write-needs-owner block's opening).
  The remaining ~280 lines (further custom-rule config blocks) were **not**
  read — they cover rules (aliased-write scope analysis details, further
  local-rule wiring) not load-bearing for the component/template-boundary
  question this task turns on (`vue/no-v-html`, the component→services
  deny-by-default boundary, "no logic in components"), which are covered in
  the part read. Flagged per ADR-0002 rather than silently treated as fully
  read.
- `law/adr/0019-appendix-ui-proscriptions.md` (C19, contrast) — read the C19
  entry and its pedigree/enforcement lines only, not the full appendix (a
  ~800-line document covering 29 proscriptions); C19 is the only one this
  task turns on.
- ADRs 0000–0021 as a set — **not** read end-to-end this session (budget);
  named here per the umbrella CLAUDE.md's own disclosure rule. Findings below
  do not depend on their content beyond the C19 citation above.

## Environment correction (IMPORTANT — read before the per-defect sections)

The dispatch brief named `http://127.0.0.1:5173` as "the dev server, already
running." On this host that port serves an **unrelated project** — the
`autoharn-panel` ledger UI (`/home/bork/w/vdc/2/autoharn-panel/frontend`),
confirmed by its page title ("Home — experience4 — Ledger panel") and body
content (ledger rows, chain-verify status) — nothing resembling LengYue. I
found this independently before the coordinator's correction message arrived,
by hitting the URL and reading the returned page; the coordinator's message
confirmed it.

The actual LengYue frontend on this host is served by an already-running
`vite preview` process (`frontend/node_modules/.bin/vite preview`, pid
251528) at **`http://127.0.0.1:4173`**. All screenshots and live DOM/CSS
readings below are witnessed against **`http://127.0.0.1:4173`**, not 5173.

Consequence: `4173` serves the **built production bundle**, not a live dev
server — `window.__perfScenario` (the DEV-gated Playwright driver hook
`frontend/src/composables/perf/scenarios.ts:271` installs) is **absent**
(confirmed: `page.evaluate(() => !!window.__perfScenario)` → `false`). That
hook is the only sanctioned way to connect the KataGo engine to a
*transient* URL without writing to the persisted `store.profile` proxy
setting (`connectEngine` in `scenarioContext.ts:119-149`, explicitly
documented as never touching the persisted profile so a capture "does not
clobber the maintainer's proxy host"). With it unavailable, and under this
brief's explicit instruction to **never** change persisted engine/proxy
settings, I could not connect a KataGo engine at all during this session.
Defects 1 and 2 need a connected engine (model list / live move
suggestions); both are marked **UNEXERCISED** for the live-visual leg below,
with strong file:line code witnesses in its place. Everything else was
verified live against the real running app.

Per-defect tags below: each claim is marked **WITNESSED** (with the observed
evidence — screenshot filename or computed value), **UNEXERCISED** (with the
concrete blocker), or a plain code citation (static reading, not a runtime
claim).

The build served at 4173 was not diffed against current source HEAD; the
component/composable files cited below are the same files driving the build
(no unrelated recent commits touch them per `git log`), so source-level and
visual evidence should agree, but this wasn't independently confirmed by
comparing bundle hashes/build timestamps to HEAD.

---

## Defect 1 — KataGo model-select "flicks back" ~1s after hover

**LOCATION.**
- `frontend/src/components/chrome/ToolbarEngineMetrics.vue:217-230` — the
  SELECTOR-mode `<select class="engine-model-select">`, `v-for="entry in
  availableModels"`.
- `frontend/src/components/chrome/ToolbarEngineMetrics.vue:63-72` —
  `watchdogClasses` computed, reads `metrics.value.pingPendingSince` /
  `metrics.value.latencyMs` **directly**, un-throttled.
- `frontend/src/services/analysis-service.ts:400-408` (`startMetrics`) —
  `window.setInterval(() => { recordPacketRate(...); }, ENGINE_METRICS_TICK_MS)`.
- `frontend/src/lib/timing.ts:311` — `ENGINE_METRICS_TICK_MS = 1000` — the
  "about 1 second (a regular interval)" the maintainer names.

**MECHANISM.** `ToolbarEngineMetrics` is mounted only `v-if="isConnected"`
and, per its own header comment, is a leaf specifically so *this* component's
render doesn't drag the rest of the toolbar along. But inside this leaf, the
`watchdogClasses` computed at lines 63-72 reads `metrics.value` **outside**
the `useThrottledSnapshot`-gated `liveMetrics`/`displayed` pair (lines
174-197) that the component's own comment says exists precisely to cap
redraw rate. `recordPacketRate` fires every `ENGINE_METRICS_TICK_MS` (1000ms)
via `analysis-service.ts`'s `startMetrics`, mutating `store.engine.metrics`
on that cadence regardless of whether any analysis packet actually arrived.
Per ADR-0010's render-locality corollary (quoted verbatim in
`frontend/CLAUDE.md`: *"a reactive read anywhere in a template re-runs the
whole render function; render ≫ patch is the tell"*), that untouched read in
`watchdogClasses` re-runs `ToolbarEngineMetrics`'s **entire** render
function once a second, select element included, even though `:value` never
actually changes. Vue's special-cased `<select>` value-sync (it force-writes
`el.value` on every patch of a select, a documented Vue-internal browser-bug
workaround) then reasserts the bound value on the live DOM node on the same
1s cadence — which is exactly the interval and exact symptom the maintainer
describes: hovering an option, then ~1s later the highlight resets to the
active value.

**WITNESS status.** Code path: plain citation (static read, file:line
above). Live behavior: **UNEXERCISED** — `ToolbarEngineMetrics` (and its
`<select>`) only mounts once `isConnected` is true, and I could not connect
an engine this session (see the environment section above: no DEV build,
`__perfScenario` absent, and connecting via the Toolbar's own button would
route through the *persisted* proxy URL — explicitly forbidden by this
brief). Concrete blocker: no sanctioned non-persisting engine-connect path
was available against the `4173` preview build.

**PROPOSED MINIMAL FIX.** Route `watchdogClasses`'s `metrics.value` reads
through the same `useThrottledSnapshot` throttle the rest of the component
already uses (fold `pingPendingSince`/`latencyMs` into the `MetricsDisplay`
projection at lines 184-196, or add a second throttled snapshot for the
watchdog fields alone if the un-throttled "latency spike flips promptly"
property — explicitly called out in the component's own comment at line
183 — needs to be preserved). Touches only
`frontend/src/components/chrome/ToolbarEngineMetrics.vue`. Acceptance check
at 4k/96dpi: connect a real engine (dev build + `__perfScenario`, or the
maintainer's own browser), open devtools Elements panel on the `<select>`,
hover an `<option>` for >1.5s, and confirm no DOM mutation record fires on
the `<select>`'s `value`/`selectedIndex` during the hover; a Playwright probe
could install a `MutationObserver`/property-setter spy on the element and
assert zero writes over a 3s idle-hover window while connected.

---

## Defect 2 — dashed "visited move" circles bleed into PV hover-preview

**LOCATION.**
- `frontend/src/components/board/BoardWidget.vue:189-198` — `pvHoverActive`
  ref, set from `MoveSuggestions`'s `@pv-preview-active` emit.
- `frontend/src/components/board/BoardWidget.vue:200-202` — `pvHoverActive`
  is consulted **only** by `moveNumbersByCoord` (suppresses move-number
  labels during preview).
- `frontend/src/components/board/BoardWidget.vue:303-310` — the
  `<BoardVariationsOverlay>` mount (the dashed-circle component) — its
  `v-if`/props list does **not** reference `pvHoverActive` anywhere.
- `frontend/src/components/board/BoardVariationsOverlay.vue:143-236` — the
  `markers` computed builds the dashed rings from `props.state`'s **actual**
  `currentNodeId`/children (visited-sibling and next-move markers), with no
  awareness of any hover/preview state — it has no such prop.

**MECHANISM.** `BoardWidget` already threads a `pvHoverActive` boolean
specifically to suppress a different overlay (move-number labels) while a PV
preview is up, with a comment explaining exactly why: *"the user is reading
a hypothetical variation... the played-sequence numbers would conflict."*
The identical reasoning applies to `BoardVariationsOverlay`'s dashed
sibling/next-move rings — they describe the **real** game tree's visited
state, which is exactly the information the maintainer doesn't want
competing with a hypothetical PV overlay — but the wiring stops one
component short: `pvHoverActive` was never threaded into
`BoardVariationsOverlay`'s mount condition or props. The overlay is Go-tree
state, oblivious to `MoveSuggestions`'s hover state, so it keeps rendering
unconditionally.

**WITNESS status.** Code path: plain citation. Live: **UNEXERCISED** — this
needs `MoveSuggestions` to have live suggestion discs to hover, which
requires a connected engine with an active analysis (same blocker as Defect
1). I did confirm live that `BoardVariationsOverlay`'s dashed active-next-move
ring renders unconditionally on any board with a next move on the active
line (default `showActiveNextMove: true`, `boardVariations: 'circles'` per
`frontend/src/store/defaults.ts:692,696`) — visible in
`ui-defect-7-dark-full.png`'s board (small dashed ring near center-left) —
which corroborates that the overlay has no gating mechanism at all, but does
not by itself demonstrate the *overlap with an active PV hover*, since no PV
hover could be produced without an engine.

**PROPOSED MINIMAL FIX.** In `BoardWidget.vue`'s template, add
`!pvHoverActive &&` to the `v-if` at line 304 (or fold it into
`BoardVariationsOverlay`'s existing prop list as a new `suppressed`
prop consumed at the top of `markers`, which would also cover an
already-mounted overlay without an unmount/remount flicker — likely the
better shape since the component stays mounted and re-evaluates cheaply).
Single file: `frontend/src/components/board/BoardWidget.vue` (plus, if the
prop-based route is chosen, `BoardVariationsOverlay.vue`). Acceptance check
at 4k: connect an engine, hover a suggestion disc for >200ms, screenshot the
board, and assert no dashed ring/circle glyph is present anywhere on the
SVG for the duration of `pv-preview-active`.

---

## Defect 3 — "get rid of transitions": full inventory

**Inventory (`grep -rn "transition:\|animation:"` over `src/`, `.vue`+`.css`,
cross-checked against `<Transition>`/`transitionend`/`animationend`):**

| Site | Kind | Classification |
|---|---|---|
| `assets/css/theme.css:288-289` | `--duration-default: 0.2s`, `--duration-slow: 1s` | The two SSOT duration tokens every other site below references (theme.css:275-278 documents this as a 2026-consolidation of "22 surveyed transition sites"). |
| `App.vue:523` `.panel-resizer` | hover-fade (background) | Decorative chrome hover. |
| `assets/css/style.css:67,92` | border/color hover-fade | Decorative (shared input chrome). |
| `CardMetadataPanel.vue:546` | color/border hover-fade | Decorative. |
| `TreeWidget.vue:384,387` `.node-circle`,`.toggle-group rect` | filter/stroke/fill hover-fade | Decorative. |
| `TabWidget.vue:98` | background/color | Decorative (tab active-state fade). |
| `StatusBar.vue:208,243` | color/border-color | Decorative. |
| `PboPopover.vue:266` | color | Decorative. |
| `CardSetEditor.vue:278` | border-color | Decorative. |
| `AnalysisDashboard.vue:131` | color/border-color | Decorative. |
| `assets/css/shared-chrome.css:56` | transform | Decorative (disclosure chevron rotate). |
| `EngineQueueTooltip.vue:213,304` | color | Decorative. |
| `ToolbarSliderPopover.vue:114` | color | Decorative. |
| `HorizontalTimelineVisualizer.vue:474` | background-color | Decorative. |
| `BoardTab.vue:251,285` | border/background/opacity fades | Decorative — **285 is the close-button's own `opacity:0→1` hover reveal**, adjacent to Defect 4's clipping bug; removing the fade doesn't fix the clip. |
| `ForestTreeNav.vue:165,180` | border-color | Decorative. |
| `ToolbarEngineMetrics.vue:313-319` `.watchdog-pinging` keyframe | CSS **animation** (not transition), gated by `session.ui.watchdogColorTransition` (default **off**) | Toggle-gated feature, not always-on decoration; see caveat below. |
| `PboPopover.vue:280` `.busy-dot` | `animation: pulse ... infinite` | Decorative attention-pulse while a qEUBO experiment is busy. |
| `MoveSuggestions.vue:291,303,347,357` inline `:style="{ transition: ... }"` | opacity fade on suggestion rings/discs/PV stones | **User-configurable already** — driven by `profile.settings.appearance.moveSuggestionsFadeMs` (a knob; 0 → no-op per the file's own comment: *"CSS interprets `0ms ease` as a no-op... snaps without an intermediate frame"*). Not hardcoded. |
| `BaseChart.vue`/`HeatmapChart.vue`/`DistributionChart.vue` `animation: false` | ECharts **series option**, not CSS | Unrelated — this disables ECharts' own internal chart-draw animation; grep noise for this inventory, listed for completeness/to show it was checked. |

**transitionend / animationend listeners:** `grep -rn "transitionend\|animationend" src` → **zero hits**. **`<Transition>`/`<transition>` Vue components:** zero hits. So **nothing in this codebase's control flow waits on a transition/animation completing** — there is no load-bearing transition of the "masking a reflow, gated by an end-event" kind ADR-0009-style performance work sometimes creates. Every hit above is pure CSS decoration or an opt-in visual feature.

**PROPOSED MINIMAL FIX.** Two tiers, both safe given the transitionend/
animationend-listener population is zero:
1. **Blanket removal of the always-on decorative fades** — the 14
   `transition:` sites in the table (all reference `--duration-default`) can
   be deleted or the token collapsed to `0s` at the single SSOT
   (`theme.css:288`) for a one-line global kill switch, OR removed
   per-site if the maintainer wants some kept. Given the SSOT exists
   precisely to make this a one-line change, **`--duration-default: 0s`** is
   the smallest possible fix satisfying "get rid of transitions" without
   touching 14 files — worth flagging to the maintainer as the cheap option
   before doing a 14-file sweep.
2. **The two `animation:` keyframes** (watchdog-pinging, busy-dot pulse) are
   feature-carrying, not decoration-only — removing them changes what those
   two indicators *do*, not just how they look. Flag to the maintainer
   rather than delete silently; watchdog-pinging is already off by default.
3. **MoveSuggestions' fade** is already a user-facing knob (set
   `moveSuggestionsFadeMs` to 0 via Settings → Analysis Environment / the
   knob registry) — no code change needed if the maintainer just wants it
   off for themselves; a code change is only needed if the **default**
   should become 0.

Acceptance check: after the `--duration-default: 0s` change, a Playwright
pass over each `.vue` file in the table clicking/hovering the relevant
element and asserting `getComputedStyle(el).transitionDuration === '0s'`.

---

## Defect 4 — tab-strip close button is clipped/occluded

**LOCATION.**
- `frontend/src/components/board/BoardTab.vue:280-286` — `.close-board-btn`,
  `position: absolute; top: -6px; right: -6px;` (documented as intentional:
  *"lifts the 16×16 close button off the tab-thumb's corner so half the
  button overlaps the corner radius and half hangs outside"*).
- `frontend/src/components/chrome/SidebarWidget.vue:244-252` — `.thumb-list`,
  `overflow-y: auto; overflow-anchor: none;` — **added** by the
  virtualization commit `b3bfe8c1` (`git show b3bfe8c1` confirms `.thumb-list`
  carried **no** `overflow` rule at all pre-virtualization; the tabs
  previously rendered directly with no scroll-container ancestor).

**MECHANISM — WITNESSED live** (`4173` build,
`page.evaluate` DOM measurement):
```
listOverflowX: "auto", listOverflowY: "auto"   // computed, though only overflow-y was authored
btnRect.top: 37   listRect.top: 41              // clippedTop: true
btnRect.right: 130.5  listRect.right: 167        // clippedRight: false (at this viewport/board-count)
```
Per CSS 2.1 §11.1.1 (and every modern UA's implementation): when one of
`overflow-x`/`overflow-y` is set to a value other than `visible` and the
other is left at its `visible` default, the UA computes the `visible` one as
`auto` too — confirmed above (`overflow-x` computes to `"auto"` though only
`overflow-y` was ever authored). `.thumb-list` becomes a real scroll/clip
container on **both** axes as an unintended side effect of the
virtualization work adding `overflow-y: auto` for scrolling. `BoardTab`'s
close button, by design, pokes 6px outside its own tab's box on two edges;
for the tab at the very top of the (now-clipping) scroll viewport, that
6px top overshoot is cut off by `.thumb-list`'s own top edge — confirmed:
the button's rect top (37) sits above the list's rect top (41).
Screenshot `ui-defect-4-tab-close-hover.png` shows the visible symptom: the
close glyph on the first tab renders as a small clipped arc instead of a
clean circular ×.

Right-edge clipping (my original hypothesis before measuring) does **not**
currently occur at this board count/viewport — there's ample horizontal
margin between the 86px-wide tab and the 168px sidebar — so the live
"occlusion" the maintainer sees is specifically the **top-edge** clip on
whichever tab sits at the current top of the scrolled list, reproducible on
every tab as the user scrolls (each newly-topmost tab's button gets clipped
in turn).

**WITNESS status: WITNESSED** — live DOM measurement + screenshot
(`ui-defect-4-tab-close-hover.png`), against `4173`.

**PROPOSED MINIMAL FIX.** Give `.thumb-list` (or its padded child
`.thumb-virt`) enough top padding/margin to absorb the button's -6px
overshoot, so the scroll container's clip box no longer coincides with the
tab's own box edge — e.g. `padding-top: 6px` on `.thumb-list` (compensating
by shrinking `.thumb-virt`'s effective content by the same amount so
`useVirtualList`'s height math, tuned to `.thumb-container`'s own
`offsetHeight`, isn't thrown off — the `tabHeight` self-correction in
`SidebarWidget.vue`'s `onMounted` should absorb this since it measures the
DOM directly, but worth confirming after the change). Alternative,
possibly cleaner: move the close button fully inside `.tab-thumb`'s own box
(no negative offset) — changes the "detached affordance" look the original
author chose, so flag that trade-off to the maintainer rather than silently
picking it. Touches `frontend/src/components/chrome/SidebarWidget.vue`
(padding) and/or `frontend/src/components/board/BoardTab.vue` (button
position), one file either way. Acceptance check at 4k: screenshot the
topmost visible tab's hovered close button and assert (via the same
bounding-rect comparison used above) `btnRect.top >= listRect.top` for
every scroll position across a rail of >20 boards.

---

## Defect 5 — control-panel resizer can't reach the right edge

**LOCATION.**
- `frontend/src/composables/chrome/useResizablePanel.ts:14-19,60-63` —
  drag math; own comment: *"Drag right: target grows. Board grows up to the
  saturation point (column.height). Past that, target keeps growing but
  aspect-ratio pins the rendered width — no visible change."*
- `frontend/src/App.vue:489-498` `#board-column` — `aspect-ratio: 1/1;
  height: 100%; max-width: var(--board-target-px, 100%);`.
- `frontend/src/App.vue:357,368-371` — `.panel-resizer` and `#control-panel`
  (`flex: 1 1 0; min-width: 220px`) sit immediately right of `#board-column`
  in `#split-workspace`'s flex row.

**MECHANISM — WITNESSED live.** Dragged the resizer bar's mouse-handle from
its rendered position to `x=3800` (near the 3840px-wide viewport's right
edge) via synthetic mouse down/move(steps=20)/up. Measured before/after:
```
resizer box before drag: {x:2436, y:32, width:4, height:2128}
controlPanelWidth: 1400   (unchanged)
boardColumnWidth:  2128   (unchanged)
resizerRight:      2440   (did not move at all, despite the drag)
controlPanelMinWidth: "220px"   (not the active constraint here — control panel is at 1400px, nowhere near its 220px floor)
```
`#board-column`'s height is 2128px (full available viewport height below the
toolbar), and `aspect-ratio: 1/1` pins its width to match — **2128 is
already the maximum square the available height allows**, independent of
`--board-target-px`. Dragging the resizer further right keeps raising the
*target* (up to `MAX_BOARD = 4096`), but per the composable's own comment
the aspect-ratio clamp makes that growth invisible once the height ceiling
is hit — and because the resizer bar's own rendered position is derived
from `#board-column`'s actual box (it sits immediately to that column's
right in the flex row), the bar visually freezes at the board's width
ceiling instead of continuing to track the cursor. On a **4k landscape
screen** (this maintainer's actual setup) the available height is
essentially always the binding constraint — the board can never use more
than a height-bound square, so the resizer's "reachable range" ends well
short of the true right edge on every wide/short window, not just as an
edge case. `#control-panel`'s `min-width: 220px` floor (my original
hypothesis) is a real, separate constraint but was **not** the one hit in
this measurement — it only bites once the freed control-panel would
otherwise drop under 220px, which didn't happen here.

**WITNESS status: WITNESSED** — live drag + bounding-rect measurement,
`ui-defect-5-resizer-dragged-right.png`.

**PROPOSED MINIMAL FIX.** This is arguably *intentional* clamping (a Go
board must stay square) colliding with a *resizer affordance* that doesn't
communicate its own ceiling — the resizer bar should either (a) stop
tracking the mouse at the saturation point with some visual "can't go
further" cue instead of silently freezing, or (b) decouple "pull the
resizer right" from "the board's own width" entirely: let the drag
continue to shrink `#control-panel` past the board's saturation point,
with the freed strip becoming margin rather than a no-op. Option (b) is the
smaller change and composes directly with Defect 6's fix below (both are
"freed horizontal space isn't reflected visually" bugs) — adding
`justify-content: center` to `#split-workspace` conditionally would let a
resizer-driven shrink of `#control-panel` show up as growing centered
margin around the (already-maxed) board, satisfying "arbitrarily resize"
in spirit even though the board itself is geometrically capped. Flag the
(a) vs (b) choice to the maintainer rather than picking silently — it's a
real UX call, not a pure bugfix. Touches `frontend/src/App.vue` (styling)
and/or `frontend/src/composables/chrome/useResizablePanel.ts` (drag-ceiling
cue). Acceptance check at 4k: repeat the drag-to-3800px probe above and
assert `resizerRight` (or `controlPanelWidth`) actually changes rather than
staying pinned.

---

## Defect 6 — disabling the control panel leaves dead space instead of centering the board

**LOCATION.**
- `frontend/src/App.vue:292,299-301` — the `⚙️` toggle button
  (`toggleChrome('controlsExpanded')`).
- `frontend/src/App.vue:357,370` — `v-show="store.session.ui.controlsExpanded"`
  on `.panel-resizer` and `#control-panel`.
- `frontend/src/App.vue:489-498` `#board-column { flex: 0 1 auto; ... }` —
  **`flex-grow: 0`**.
- `frontend/src/App.vue:467-473` `#split-workspace { display:flex;
  flex-direction:row; flex:1; ... }` — no `justify-content` set (defaults to
  `flex-start`).

**MECHANISM — WITNESSED live.** Measured `#board-column`'s rect before and
after clicking the control-panel toggle:
```
before: boardColumn {left:168, right:2296, width:2128}   controlPanel {left:2440, right:3840, width:1400}
after:  boardColumn {left:168, right:2296, width:2128}   (controlPanel gone; no other element replaced it)
```
`#board-column`'s box is **pixel-identical** before and after — it never
grows to reclaim the ~1544px `#control-panel` + `.panel-resizer` freed up.
The reason: `#board-column`'s `flex: 0 1 auto` sets **`flex-grow: 0`**
(explicitly, per the CSS comment at App.vue:483-488, which documents the
*shrink* behavior — `flex-shrink:1` — as deliberate but says nothing about
growth, because growth was never wanted while the control panel is
present: with the panel visible, `#board-column` is meant to stay at its
own natural square size and let `#control-panel`'s `flex:1` claim the
remainder). `#split-workspace` has no `justify-content`, so with
`flex-start` the freed row space simply accumulates unclaimed at the row's
end — visible as the large empty pink area on the right in
`ui-defect-6-controls-after-disabled.png`.

**WITNESS status: WITNESSED** — live before/after rect measurement +
screenshot.

**PROPOSED MINIMAL FIX.** Bind `#split-workspace`'s `justify-content` to
`'center'` when `!store.session.ui.controlsExpanded` (optionally also when
`!treeExpanded`), else the current default (`flex-start`, so the layout with
the control panel visible is unchanged). One-line `:style`/computed-class
addition in `frontend/src/App.vue`, same file and same mechanism as the
option-(b) fix sketched for Defect 5 — genuinely the same underlying gap
("freed row space isn't reflected"), so these two are natural candidates to
fix together rather than as fully independent dispatches (see the partition
section). Acceptance check at 4k: repeat the before/after rect probe above
and assert `boardColumn.left` shifts rightward (recentres) once
`controlsExpanded` flips false, rather than staying pinned to its
control-panel-visible position.

---

## Defect 7 — dark-theme tree background makes black nodes nearly invisible

**LOCATION.**
- `frontend/src/components/tree/TreeWidget.vue:143-147` — `nodeFill`:
  `item.move.color === 'B' ? '#111' : '#eee'`.
- `frontend/src/components/tree/TreeWidget.vue:378` — `.tree-widget-wrapper
  { background: var(--surface-2); }`.
- `frontend/src/assets/css/theme.css:90-95` `[data-theme="dark"]` —
  `--surface-2: #1a1a1a;` (`--surface-1: #111`, i.e. the SAME literal as the
  black-stone fill, one token lighter).

**MECHANISM — WITNESSED live** (forced `data-theme="dark"` on `<html>` for a
pure visual probe — this does not touch persisted profile settings; the
attribute is what `theme.css`'s `[data-theme="dark"]` block keys off, and
`useAppBootstrap.ts` normally sets it from the persisted theme choice).
Computed, live:
```
wrapper background: rgb(26, 26, 26)   // #1a1a1a = --surface-2, dark theme
black-node fill:     #111              // rgb(17,17,17)
```
WCAG relative-luminance contrast ratio between those two, computed via the
standard sRGB formula: **≈1.085 : 1**. `law/adr/0019-appendix-ui-proscriptions.md`'s
C19 ("Text and essential glyphs meet contrast thresholds") sets **3:1** as
the floor for non-text/large information-bearing glyphs (WCAG SC 1.4.11) —
a tree node marking a played move is exactly that class of glyph. 1.085:1 is
not "hard to distinguish," it is **functionally invisible** — only the
node's 1px stroke (`nodeStroke`, `themeColor('--border-3')`) remains
visible, confirmed in screenshot `ui-defect-7-tree-dark-zoom.png`: the black
nodes appear as faint rings with no visible fill against the panel
background.

**WITNESS status: WITNESSED** — live computed-style read + screenshot +
manual WCAG-formula calculation cross-checked against the in-page computed
one (both landed at ≈1.085).

**PROPOSED MINIMAL FIX.** Token-level, per the maintainer's own framing:
raise the dark-theme black-stone fill (or the tree wrapper's background) so
the pair clears 3:1. Cheapest: since `nodeFill`'s `#111`/`#eee` pair is a
**hardcoded literal**, not a theme-aware `themeColor()` call (the file's own
header says B/W stones are "domain colors, not chrome" — deliberately not
themed), the actual fix has to pick one of: (a) special-case the black fill
in dark theme only (e.g. a small lift to something like `#3a3a3a`, still
readably "near-black" against `--surface-2`'s `#1a1a1a`, clearing 3:1 — this
keeps stones domain-literal in every OTHER theme and only touches the one
combination that fails), or (b) lighten `--surface-2` for the tree panel
specifically. (a) is smaller-blast-radius (one conditional in one function)
and doesn't touch the shared `--surface-2` token other chrome elements rely
on. Touches only `frontend/src/components/tree/TreeWidget.vue`. Acceptance
check: a Playwright pass reading `getComputedStyle`/SVG `fill` +
`background-color` for `.tree-widget-wrapper` and a black `.node-circle` in
dark theme, computing the same WCAG contrast formula used above, and
asserting `>= 3.0`.

---

## Defect 8 — card-tree annotations are needlessly verbose ("Card 3179")

**LOCATION.**
- `frontend/src/components/charts/card-tree-echarts.ts:96-118` — the `card`
  branch of `toEChartsNode`: `name: \`Card ${node.cardId}\`` (line ~102, no
  `label.formatter` override for this branch — unlike the sibling `stub`
  (line ~157) and `bucket` (line ~193) branches, which both DO carry an
  explicit `label: { formatter: ... }` for their own short annotations
  (`+N`, `×N`)).
- `frontend/src/composables/analysis/useEChartsForestRender.ts:174-184` —
  the ECharts `tree` series' `label: { show: !isMassive, ... }` has **no**
  `formatter`, so it renders ECharts' default: the datum's `name` field
  verbatim — i.e. the ungated `Card ${cardId}` string, on-canvas, next to
  every card node in the forest.
- Distinct from `frontend/src/locales/en.json:552` —
  `"cardTree.tooltip.cardHeader": "Card {id}"` — the **hover tooltip**
  header (i18n'd, separate render path,
  `useEChartsForestRender.ts:154-158`'s `formatter`), which is fine as-is:
  the maintainer's complaint is about the always-visible on-canvas labels
  crowding the whole tree, not the hover tooltip.

**MECHANISM.** `name` is doing double duty in the `card` branch: it's both
ECharts' internal datum identifier and (by omission of a `label.formatter`)
the rendered on-canvas text. The two sibling branches (`stub`, `bucket`)
already demonstrate the fix shape in-file — they set a short `label.formatter`
distinct from `name` — the `card` branch is the one place in this function
that never got the same treatment, so its full `Card ${id}` string leaks
straight onto the canvas for every card node simultaneously.

**WITNESS status.** Code path: plain citation, high confidence (this is a
direct, unambiguous string→render trace with no dynamic indirection).
Live: **UNEXERCISED** — I navigated to the Cards tab → Lineage Explorer on
the `4173` build and it showed "Run a deck to populate the view." for the
pre-existing "Standard" deck; clicking "RUN PIPELINE" did not populate a
visible tree within the ~2.5s I waited (concrete blocker: pipeline-run
population either needs longer than I waited, needs deck/context-id state I
may have disturbed by clicking into the field beforehand, or needs backend
state this fresh-ish session didn't have — I did not chase further given
the strength of the static citation and the session's time budget).

**PROPOSED MINIMAL FIX.** Add an explicit `label: { formatter: () =>
String(node.cardId) }` to the `card` branch (mirroring the `stub`/`bucket`
pattern already in the same file), **without** changing `name` itself
(leaves `name`'s other potential consumers — ECharts' internal keying,
should any future code read `.name` — unaffected; only the rendered text
changes). Single file:
`frontend/src/components/charts/card-tree-echarts.ts`. Acceptance check:
Playwright reading rendered SVG `<text>` content inside `.forest-container`
after a pipeline run and asserting every card-node label matches `/^\d+$/`
(bare number) rather than `/^Card \d+$/`.

---

## Suggested partition for parallel, worktree-isolated fix dispatches

| Dispatch | Defects | Files touched | Notes |
|---|---|---|---|
| A — toolbar poll/render coupling | 1 | `ToolbarEngineMetrics.vue` | Self-contained. |
| B — board overlay hover-suppression | 2 | `BoardWidget.vue`, possibly `BoardVariationsOverlay.vue` | Self-contained; does not touch A's file. |
| C — transitions sweep | 3 | `theme.css` (token) and/or the 14 sites in the Defect-3 table | **Overlap risk**: if the maintainer wants the per-site sweep rather than the one-line token kill, this dispatch touches `BoardTab.vue` (shared with D) and `TreeWidget.vue` (shared with G) purely for their `transition:` declarations — a few lines each, non-overlapping with those dispatches' own edits (button positioning, node-fill), but same file. Sequence C before D/G, or hand C only the `theme.css` token change and defer per-site removal. |
| D — tab-strip close button | 4 | `SidebarWidget.vue`, possibly `BoardTab.vue` | Shares `BoardTab.vue` with C only if C does a per-site sweep (see above); otherwise clean. |
| E — resizer + control-panel-disabled centering | 5, 6 | `App.vue` (both), possibly `useResizablePanel.ts` | Deliberately **paired** — both are "`#split-workspace` doesn't reclaim freed space" and the natural fix for 6 (`justify-content`) is also the cleanest option-(b) fix for 5; splitting them across two agents touching the same `App.vue` region would conflict. Recommend one dispatch for both. |
| F — dark-theme tree contrast | 7 | `TreeWidget.vue` | **Overlap with C** only if C's sweep touches `TreeWidget.vue`'s `transition:` lines (384/387) — different lines from `nodeFill`/`.tree-widget-wrapper` (143-147, 378), so a merge conflict is unlikely but not impossible; sequence F before a per-site C, or note the shared file at PR time. |
| G — card-tree label verbosity | 8 | `card-tree-echarts.ts` | Self-contained. |

Real, unavoidable overlaps: **E's two defects share `App.vue`** (intentional
pairing, not a scheduling problem). **C (only if per-site, not token-level)
shares `BoardTab.vue` with D and `TreeWidget.vue` with F** — recommend C be
scoped to the `theme.css` token-level fix to avoid this entirely, or run C
last after D and F land.
