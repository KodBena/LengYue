# Panel-architecture weirdness — live investigation (read-only)

Investigator: dispatched read-only agent (Opus). Date: 2026-08-06.
Mode: live Playwright against `http://127.0.0.1:4173` (vite preview of the `next`
build), backend `http://192.168.122.68:8764`. Chromium `/usr/bin/chromium`,
viewport 3840×2160, `deviceScaleFactor: 1`. No code changed, no process killed,
no engine URL touched.

Evidence: screenshots under `assets/panel-weirdness/`, rAF sample sets and raw
transcripts under `assets/panel-weirdness/data/`.

Every claim below is marked **WITNESSED** (with the observation that produced it)
or **UNEXERCISED** (with the blocker).

---

## 0. TL;DR — what is actually wrong

Six anomalies, five of them in the resizer, one in the tree pane. The two that
account for essentially all of the "something really weird" feel are:

1. **The divider stops following the pointer once the board saturates**, and then
   permanently trails it — measured up to **541 px of lag** in one drag, and a
   **constant 433 px offset** for the entire length of a subsequent drag.
2. **Every fresh grab of the divider destroys the accumulated past-saturation
   drag state and produces a one-frame layout snap of ~860 px** — with *zero*
   mouse movement. Mouse-down alone re-lays-out the whole workspace.

The maintainer's new hypothesis (discrete responsiveness reorganization firing
mid-drag) is **also real and witnessed at three separate breakpoints** — but it
is the *third*-largest effect, and it fires while the pointer is already several
hundred pixels away from the divider, which is why it reads as spooky rather
than as a normal responsive breakpoint.

The maintainer's actual intent — resizing the **tree** pane — is **impossible by
construction**: WITNESSED, `#vue-tree-panel` is a hardcoded `width: 140px;
flex-shrink: 0` with no knob, no resizer and no interactive affordance anywhere
in the SPA.

---

## 1. Setup and identity verification

**WITNESSED.** Token obtained via `POST /auth/token` (`username=quark`,
`password=nopassword`); `GET /auth/me` with that token returned
`{"id":131,"username":"quark","has_password":false}`. The token and
`auth_username=quark` were seeded into `localStorage` via
`context.addInitScript` before first paint. Every session below is quark.

**WITNESSED.** Board 9 is `store.boards[8]` and was already the active board on
load (`.thumb-container` index 8 carries `.tab-thumb.active`). The rail holds
11 boards; at a 2160 px viewport all 11 fit, so the virtualized window rendered
all of them and **no scrolling was needed** — the virtualization did not
misbehave in any observed way. (`assets/panel-weirdness/01-loaded.png`)

### Console / network across every session

**WITNESSED.** Exactly one recurring console error and one failing request, in
every single session, from first load onward:

```
error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)
GET http://192.168.122.68:8764/qeubo/experiment/status -> 503
```

Nothing else. **Zero** `pageerror`s, **zero** Vue warnings, **zero** other
failed requests, and — notably — **zero** `[navigator] branch-head memory …`
warnings from `navigator.ts:213` across all navigation performed below. The
stale-dist / console-error angle is **refuted**: the build is clean and the
`resolveBranchTarget` fallback never fired. The 503 is a backend endpoint
(`/qeubo/experiment/status`) unrelated to layout or navigation.

---

## 2. Navigation transcript

Keys are the catalog defaults (`keybindings-catalog.ts`): `ArrowDown`=`nav.next`,
`ArrowUp`=`nav.prev`, `ArrowLeft/Right`=`nav.variation(∓1)`, `Home`/`End`,
`u`=`nav.toggleMainLine`. Tree geometry: `TreeWidget.vue` `CELL=24`, `PAD=18`,
so `cy = 18 + 24·depth`; `cx = 18 + 24·column`.

### 2.1 Board 9's shape at depth 87 — WITNESSED

After expanding every collapsed branch toggle (2 passes, 13 toggles clicked),
row `cy=2106` (depth 87) contains **five BLACK nodes**, and the edge paths
identify their parents:

```
cx= 18  B   <- M18,2082 L18,2106                 (parent: trunk node at depth 86, cx=18)
cx=114  B   <- M114,2082 L114,2106               (parent: node at depth 86, cx=114)
cx=138  B   <- M114,2082 L114,2094 L138,2094 …   (same parent as cx=114)
cx=162  B   <- M114,2082 …                       (same parent)
cx=186  B   <- M114,2082 …                       (same parent)
```

So `cx=18@87` and `{cx=114,138,162,186}@87` are **cousins**: same depth,
different parents. `{114,138,162,186}` are siblings of each other.
(`assets/panel-weirdness/30-tree-expanded.png`, `30b-tree-expanded.png`)

### 2.2 Keyboard transcript (`data/p7.log`) — WITNESSED

| step | action | result (status bar / active ring) |
|---|---|---|
| T0 | (load) | MOVE 10, ring cx=18 cy=258 |
| T1 | `Home` | MOVE 0, cx=18 cy=18 |
| T2 | `ArrowDown` ×87 | **MOVE 87**, cx=42 cy=2106, W-to-play (⇒ move 87 is Black) |
| T3 | `u` (toggleMainLine) | MOVE 87, cx=**66** cy=2106 — switched to a **sibling** at depth 87 |
| T4 | `u` again | MOVE 87, cx=42 — returned. Two-value toggle behaves per spec |
| T5 | `ArrowRight` (`variation(+1)`) | MOVE 87, cx=66 |
| T6 | `ArrowLeft` (`variation(−1)`) | MOVE 87, cx=42 |
| T7 | `ArrowUp` ×4 | MOVE 83, cx=18 cy=2010 |
| T8 | `u` at depth 83 | **MOVE 82**, cx=138 cy=1986 |
| T9 | `ArrowDown` until leaf | MOVE 85, cx=138 cy=2058 (subtree ends) |

`navigateToggleMainLine` / `navigateVariation` / `resolveBranchTarget` behaved
correctly at T3–T6: the toggle lands on the sibling and returns, and no
`[navigator]` warning was emitted.

**T8 is a mild anomaly.** Pressing `u` at MOVE 83 landed the status bar on
**MOVE 82** while the tree row moved to `cy=1986` (row 82). Diagnosis:
`findNearestFork` (`navigator.ts:162`) found the fork at depth 82 and
`switchToBranch` (`navigator.ts:234`) landed on its alternate child — a node at
tree-row 82 whose **status-bar move number is 82, i.e. one lower than its tree
row**. The consistent reading is that the alternate child is a node that carries
no `move` (an SGF variation node with properties but no `B`/`W`), so `moveNumber`
(a count of placed moves along the path) lags the tree row by one. This is
**cosmetic/labelling, not a navigation defect** — the cursor went where the
primitive says it should. Marked **WITNESSED (behaviour)**, **UNEXERCISED
(root-cause confirmation)**: confirming "the node has no move property" would
require reading the SGF or store, which the production build does not expose
(`#app.__vue_app__` exists but `setupState` is empty in the minified build —
`data/p3` probe).

### 2.3 Reaching the black cousin of move 87 — WITNESSED

Keyboard alone cannot reach `cx=138@87` from the main line (the nearest fork at
depth 86 only offers siblings). Reached by expanding the branches and **clicking
the node in the game tree**, as a user would:

```
BEFORE click: MOVE 10, cx=18 cy=258,  treeScrollL=0    treeScrollT=0
AFTER  click: MOVE 87, cx=138 cy=2106, treeScrollL=71  treeScrollT=1042
```

This is the black cousin of move 87 (depth 87, Black, parent = the depth-86 node
at cx=114, a different parent from the main line's depth-86 node at cx=18).
`assets/panel-weirdness/40-at-cousin.png`.

`useViewportFollow` correctly scrolled the tree both vertically (1042) **and
horizontally (71)** to bring it into view. No console warning, no layout change:
`GEO` before and after the cousin click is byte-identical
(`row.w=3672 board.w=900 tree.w=140 panel.w=2628 justify=normal`).
**No spurious layout change on navigation — refuted.**

---

## 3. ANOMALY 1 — the divider decouples from the pointer past board saturation

**WITNESSED.** Sweep S1 (`data/s1.json`, 698 rAF samples, Library tab active,
continuous 8 px steps from x=1212 to x=3700):

```
mx=1210  rezX=1208  lag=  2   boardW= 900  panelW=2628  justify=normal
mx=2372  rezX=2370  lag=  2   boardW=2062  panelW=1466  justify=normal
mx=2444  ------------------  boardW=2128  panelW=1394  justify: normal -> center   <- SATURATION
mx=2564  rezX=2499  lag= 65   boardW=2128  panelW=1274  justify=center
mx=2924  rezX=2679  lag=245   boardW=2128  panelW= 914  justify=center
mx=3340  rezX=2887  lag=453   boardW=2128  panelW= 498  justify=center
mx=3516  rezX=2975  lag=541   boardW=2128  panelW= 322  justify=center
```

Below saturation the divider tracks the cursor exactly (lag = 2 px = the grab
offset). At the saturation point (board width = column height = 2128 px) the lag
starts growing and reaches **541 px** — **exactly half** the post-saturation
mouse travel (mouse +1072, divider +536).

### Mechanism

`useResizablePanel.ts:190` sets `controlPanelWidthPx` to a defined value the
moment `next > boardColumnSaturationPx`. `App.vue:235-237`
(`splitWorkspaceCentered`) then flips `#split-workspace` to
`justify-content: center` (`App.vue:385`). The row's content block
(board + tree + resizer + panel) is now narrower than the row, so **centering
splits the freed space into two equal margins**. The divider sits inside that
block, so for every `d` px the panel shrinks, the block's left edge moves right
by `d/2` and the divider moves right by only `d/2` — while the cursor moves the
full `d`.

The file header at `useResizablePanel.ts:22-28` claims centering "is also what
makes the resizer bar itself track the cursor past saturation." **That claim is
false at the factor of 2**: centering makes the bar move in the right
*direction* at *half* the rate. Half-rate tracking of a drag handle is
indistinguishable from "the app is fighting me."

---

## 4. ANOMALY 2 — mouse-down alone re-lays-out the workspace; every re-grab destroys the accumulated drag

This is the largest single discontinuity found, and it needs **no mouse movement
at all**.

**WITNESSED** (`data/p10.log`, "R2: RE-GRAB TEST"). Starting from a released
past-saturation state:

```
hovering the divider, before mousedown:
  board.w=2128  panel.w= 538  resizerX=2867  justify=center   --board-target-px: 2990px

AFTER mousedown, ZERO mouse travel:
  board.w=2128  panel.w=1400  resizerX=2436  justify=normal   --board-target-px: 2990px
                     ^^^^^^^^          ^^^^
                 +862 px            -431 px

after a 1 px nudge right:
  board.w=2128  panel.w= 537  resizerX=2867  justify=center   --board-target-px: 2129px
                                                                                 ^^^^^^^
                                                              861 px of drag state destroyed
```

The released state and the post-mousedown state are captured in
`51-past-saturation-released.png` and `52-after-regrab.png` respectively.

Independently reproduced from the opposite extreme (`data/p11.log`,
"extreme-start drag", panel already pinned at its 220 px floor): mousedown with
zero travel snapped `panel.w 220 → 1400`, `resizerX 3026 → 2436`; the 1 px nudge
collapsed `--board-target-px` from **3484 → 2129**.

And reproduced a third time as the **first frame of the leftward sweep**
(`data/rev.json`, first two samples, `dmx = 0`):

```
PANEL-JUMP  d=+863.0 px   at dmx=0
REZ-JUMP    d=-431.5 px   at dmx=0
JUSTIFY     center -> normal   at dmx=0
```

…after which the divider sat at a **constant 433 px to the left of the cursor
for the entire remaining 1700 px of the leftward drag**:

```
mx=2741 rezX=2308 lag=433 | mx=2229 rezX=1796 lag=433 | mx=1141 rezX=708 lag=433
```

### Mechanism — three defects compounding, all inside `startResize`

**(a) `useResizablePanel.ts:141` — unconditional reset before measurement.**

```ts
controlPanelWidthPx.value = undefined;   // line 141
```

This runs on *every* mousedown, before any movement. It hands `#control-panel`
back to `flex: 1 1 0` (`App.vue:442`) and simultaneously flips
`splitWorkspaceCentered` back to `false` (`App.vue:236`), so
`justify-content` reverts to `normal` (`App.vue:385`). The panel widens to its
natural fill and the whole block slides left — **the observed 862 px / 431 px
snap.** It is undone one mousemove later, so the user perceives a flash, not a
new state.

**(b) `useResizablePanel.ts:148` — the drag origin is read from the *rendered*
width, which is capped by `aspect-ratio`, so overshoot is unrecoverable.**

```ts
const colRect = col.getBoundingClientRect();
dragOriginPx = Math.round(colRect.width);          // line 148
boardColumnSaturationPx = Math.round(colRect.height); // line 149
```

Past saturation, `#board-column`'s rendered width is pinned at the height-driven
square (`App.vue:612-621`, `aspect-ratio: 1/1`), i.e. **2128**, while the
persisted `store.session.ui.boardSquareMaxWidthPx` is **2990** (or 3484). Line
148 therefore reads 2128 and throws away every pixel of overshoot. The first
`onMouseMove` writes `computeBoardTargetPx(2128, delta)` straight back into the
store (`:181-182`), permanently overwriting 2990 with 2129. The past-saturation
position is **write-only**: you can reach it, but you can never re-enter it, and
merely clicking the handle deletes it.

The header comment at `:37-40` justifies line 148 as making "the first delta
visually continuous with what the user is looking at, *regardless of whether the
persisted target was previously set, undefined, or stale*." That reasoning is
sound for the below-saturation regime and is exactly wrong above it, where the
rendered width is a **clamped projection** of the target rather than the target.

**(c) `useResizablePanel.ts:157-171` — the row geometry is measured in the same
synchronous tick as the (a) reset, so it reads the pre-flush DOM.**

Vue flushes DOM updates asynchronously, so `panel.getBoundingClientRect()` at
line 161 still returns the *old, explicitly-narrowed* panel width (538), not the
flex-fill width the reset at line 141 is about to produce (1400). Consequently

```ts
otherFixedWidthAtDragStartPx = rowWidthPx - dragOriginPx - panelWidthPx;
// = 3672 - 2128 - 538 = 1006
```

whose honest value ("tree panel + resizer + borders", per the doc at `:105-106`)
is **144**. The 862 px of centering dead-space has been silently folded into
"other fixed width". `computeControlPanelWidthPx`'s `naturalPanelWidthPx`
(`:112-113`) then evaluates to 538 — the panel's *current* width, not its
natural width. The formula degenerates into `panel = current − overshoot`, which
happens to be *continuous* and so masks (c) behind (b): the post-nudge frame
looks right, and only the destroyed store value and the mousedown flash betray
it. This is the ADR-0021 case exactly — the symptom (post-nudge continuity) is
not the property (correct geometry), and the two disagree here.

**Ordering note for whoever fixes this:** (a) at line 141 must not precede the
measurements at 143-171, and the measurements must not be taken in the same tick
as a reactive write that changes the thing being measured. Diagnosis only — no
fix designed here, per the charter.

---

## 5. ANOMALY 3 — discrete responsiveness reorganizations fire mid-drag (the maintainer's new hypothesis: CONFIRMED)

**WITNESSED at three independent breakpoints**, one per control-panel tab, each
detected as a same-frame discontinuity in child-element rects during rAF
sampling of a continuous drag.

### 5.1 Library tab — 700 px container query (`data/s1.json`)

```
mx=3116  panelW: 722 -> 697
  .library-split  grid-template-columns:  "415.797px 277.203px"  ->  "697px"   (2 cols -> 1 col)
  .library-split-preview  width  +419.8 px   (same frame)
  .library-split-list     width  +281.2 px   (same frame)
```

Mechanism: `LibraryTab.vue:190` `container-type: inline-size` on the tab root;
`LibraryTab.vue:286` `@container (max-width: 700px) { .library-split {
grid-template-columns: 1fr; grid-template-rows: minmax(0,1fr) minmax(0,auto); } }`.
Master-detail collapses to a stack in one frame.
The wide and reflowed states are captured in `41-library-wide.png` and
`42-after-right-sweep.png`.

### 5.2 Cards tab — 479 px container query (`data/cards.json`)

```
mx=3358  panelW: 480 -> below
  .forest-container  flex-direction:  row -> column     (same frame)
  .left-panel        width +199 px, height -1904 px     (same frame)
```

Mechanism: `ForestDirectory.vue:496` `.forest-cq-wrapper { container-type:
inline-size }`; `ForestDirectory.vue:508` `@container (max-width: 479px) {
.forest-container { flex-direction: column } .left-panel { width: 100%;
max-height: 40%; … } }`. The left panel loses **1904 px of height** in a single
frame while the user is still dragging.
The wide and stacked states are captured in `60-cards-wide.png` and
`61-cards-narrow.png`.

### 5.3 Analysis tab — 379 px ResizeObserver threshold (`data/analysis.json`)

```
mx=3410  panelW: 428
  .linear-content  class:  "content linear-content" -> "content linear-content narrow"
  .preview-box     width -140 px, height -159 px   (display:none)
  .chart-area      width +140 px
```

Mechanism: `AnalysisChartPanel.vue:55` `PREVIEW_HIDE_BELOW_PX = 379`;
`:63-70` a `ResizeObserver` toggles `narrow`; `:141`
`.linear-content.narrow .preview-box { display: none }`. Fires at panel width
428 because the observed element is `.content`, inset from the panel by padding
and borders. Note this is *not* a container query (it was deliberately migrated
off one for perf, per the comment at `:45-56`) — but it produces the identical
discrete mid-drag reflow.
The wide and narrow states are captured in `62-analysis-wide.png` and
`63-analysis-narrow.png`.

### Why this reads as "weird" rather than "responsive"

**WITNESSED, and this is the compounding fact:** all three breakpoints sit
**inside the past-saturation regime**. At the Library reflow (`mx=3116`) the
divider was at `rezX=2787` — **353 px to the left of the pointer**. At the Cards
reflow the pointer was ~430 px away; at the Analysis reflow, similar. So the
panel violently reorganizes at a moment when the handle the user believes they
are dragging is nowhere near their cursor, and the board has already stopped
responding. A breakpoint that fires under the cursor reads as responsive design;
one that fires a third of a metre away on a 4K screen reads as a haunting.

---

## 6. ANOMALY 4 — the board freezes while the divider keeps moving

**WITNESSED** (S1 and all later sweeps). Past `mx=2444`, `boardW` is pinned at
2128 for the remaining ~1250 px of drag while `panelW` continues to fall
(1394 → 220) and the divider continues to creep. The resizer is documented as
"the control for the board square" (`useResizablePanel.ts:5-6`), yet more than
half of its usable travel at this viewport does nothing to the board. The
regime change is invisible — no cursor change, no detent, no bar restyle.

---

## 7. ANOMALY 5 — past-saturation layout does not survive reload (asymmetric persistence)

**WITNESSED.** `store.session.ui.boardSquareMaxWidthPx` persists correctly
*below* saturation: a drag to `--board-target-px: 608px` produced
`PUT /documents/user_workspace_01 -> 200` and the reload came back
byte-identical (`board.w=608 panel.w=2920`) — `data/p11.log`,
`64-after-reload-persist.png`.

*Above* saturation it does not: a session ending at `panel.w=220,
--board-target-px: 3390px` reloaded to `panel.w=2628, --board-target-px: 900px`
(`data/p10.log`, R1). `controlPanelWidthPx` is deliberately not persisted
(`useResizablePanel.ts:54-60`), so the narrow-panel arrangement is lost by
design; but the board target that *is* persisted also came back stale, because
the same re-grab bug (§4b) had already been overwriting it during the session.
The net user experience is "my layout doesn't stick," and the deliberate part
and the buggy part are indistinguishable from the outside.

---

## 8. ANOMALY 6 — the tree pane cannot be resized, and is far too narrow for its content (the maintainer's actual intent)

**WITNESSED — fixedness.** `#vue-tree-panel` is set once, statically:

- `App.vue:637` — `#vue-tree-panel { width: 140px; … flex-shrink: 0; padding-right: 5px; }`
- `App.vue:625-636` — the magic-literal comment explicitly notes the pane "is
  not currently resizable" and suggests "dial up (180-200) **or add a resizer**"
  as future work.

Exhaustive greps over `frontend/src/`: **zero** hits for `treeWidth`,
`treePanelWidth`, `tree-resizer`; exactly **one** `.panel-resizer` element in the
entire app (`App.vue:424`), bound to `startResize` from the single
`useResizablePanel()` call at `App.vue:218`. That resizer sits **between the tree
panel and the control panel** (`App.vue:413-443` DOM order:
`#board-column`, `#vue-tree-panel`, `.panel-resizer`, `#control-panel`), so it
trades **board ↔ control-panel** width and never touches the tree.

Corroborated empirically: across **all 2700+ rAF samples** in every sweep in this
investigation, `tree.w` is `140` in every single frame, in both drag directions,
in every regime, on every tab. There is no input that changes it.

**WITNESSED — why 140 px hurts.** With board 9's branches expanded:

```
.tree-svg width          = 492 px
.tree-widget-outer clientWidth = 134 px    (140 minus the 5px padding-right + border)
.tree-widget-outer scrollWidth = 492 px
node columns present at depth 87: cx = 18, 114, 138, 162, 186
```

Only `cx ≤ ~120` is visible without horizontal scrolling. **Four of the five
depth-87 cousins are off-screen**, and the whole right ~72% of the tree is
clipped. `useViewportFollow` does auto-scroll horizontally to the cursor
(measured `treeScrollL=71` after the cousin click), which keeps the *active*
node visible but scrolls the surrounding context out — so at any moment the user
sees a 134 px keyhole onto a 492 px tree, with no stable frame of reference.
`assets/panel-weirdness/30b-tree-expanded.png` is the crop; compare
`20b-tree-mainline-87.png`.

This fully explains "the tree's width made it hard to see where he was", and
explains why reaching for the divider felt broken: **the divider the maintainer
grabbed is not attached to the thing he wanted to resize.** He then hit
Anomalies 1–3 on a control he had no reason to be using in the first place.

---

## 9. Negative results (clean bill, with coverage)

Each of the following was actively exercised and found **not** to misbehave:

- **Navigation state survives dragging — WITNESSED.** Cursor (`MOVE 87`, ring
  `cx=42 cy=2106`), tree scroll (`treeScrollT=1042`) identical before and after
  full-range drags in both directions.
- **Focus is not stolen by the resizer — WITNESSED.** `document.activeElement`
  is `BODY` before and after every drag; `ArrowUp`/`ArrowDown` immediately after
  a drag, with no intervening click, navigated correctly (MOVE 87 → 86 → 87).
- **No spurious layout change on navigation — WITNESSED.** `GEO` byte-identical
  across `Home`, 87×`ArrowDown`, `u`, `ArrowLeft/Right`, and the cousin click.
- **Fast drags behave identically to slow drags — WITNESSED.** A 5-step jump
  (1600→2200→2800→3400→3700) landed on exactly the same end state as the 8-px
  continuous sweep (`board.w=2128, panel.w=220, --board-target-px: 3390px`). No
  fast-path divergence, no dropped mouseup, no stuck `.resizing` class.
- **`onUnmounted`/`stopResize` hygiene — WITNESSED.** `body.classList` never
  retained `resizing` after any mouseup across all sweeps.
- **Branch-switch navigation is sound — WITNESSED.** `navigateToggleMainLine`'s
  two-value toggle returned to the origin branch on the second press;
  `navigateVariation` clamped correctly; **no** `[navigator] branch-head memory …`
  warning (`navigator.ts:213`) was ever emitted, so no dangling
  `lastVisitedDescendant` exists in this workspace.
- **Tab-rail virtualization — WITNESSED clean, but only lightly stressed.** 11
  boards, all within one 2160 px viewport, so the virtual window spanned the
  whole list and no scroll-recycling occurred. **UNEXERCISED:** virtualization
  under scroll (would need ≫40 boards or a short viewport).
- **Build freshness — WITNESSED.** No stale-dist symptom: no Vue warnings, no
  pageerrors, no missing-asset requests; the only failure is the backend
  `/qeubo/experiment/status` 503.

### Explicitly UNEXERCISED

- **Store-level confirmation of the T8 move-number/row offset** — blocker: the
  production build does not expose `store` (minified `setupState` is empty).
- **Virtualized rail under real scrolling** — blocker: only 11 boards exist in
  quark's workspace.
- **Touch / pointer-event drags** — only `mouse.*` was exercised; `startResize`
  is bound to `@mousedown` only (`App.vue:424`), so touch drag is presumably
  simply absent, but this was not tested.
- **Behaviour at non-4K viewports** — all measurements are at 3840×2160.
  The saturation point *is* the column height, so at a shorter viewport the
  saturation regime is entered sooner and the anomalies of §3–§5 occur earlier
  in the drag; not separately measured.

---

## 10. Does the discrete reorganization explain the weirdness?

**Partially — it is real, but it is not the main event.** Ranked by measured
magnitude of the discontinuity a user sees:

| # | Anomaly | Magnitude | Needs mouse motion? |
|---|---|---|---|
| 1 | Re-grab reset / mousedown snap (§4) | **862 px panel, 431 px divider, in one frame** | **No** |
| 2 | Divider/cursor decoupling (§3) | up to **541 px** lag; **433 px** constant offset | yes |
| 3 | Library CQ reflow (§5.1) | 420 px + 281 px child jumps | yes |
| 4 | Cards CQ reflow (§5.2) | 199 px width, **1904 px** height on `.left-panel` | yes |
| 5 | Analysis narrow toggle (§5.3) | 140 px, element disappears | yes |
| 6 | Board freeze past saturation (§6) | ~1250 px of dead travel | yes |

The maintainer's memory of "a jump discontinuity at a resizer regime boundary"
is best matched by **#1**, not by the breakpoints: #1 is the only effect that
produces a jump with *no* mouse movement, is the only one that *loses state*,
and is the one that fires at the moment of grabbing — which is exactly when a
user re-approaches "the boundary" to try again. #3–#5 then pile on during the
drag that follows.

And the whole encounter was avoidable: the control being fought with is the
wrong control for the intent (§8).

---

## 11. Evidence index

Screenshots — `.claude/dispatch-reports/assets/panel-weirdness/`

| file | what it shows |
|---|---|
| `01-loaded.png` | first load as quark, board 9 active |
| `10-board9-initial.png`, `11-move87.png`, `11b-tree-move87.png` | board 9 at move 87 |
| `20-mainline-87.png`, `20b-tree-mainline-87.png` | main-line depth 87 |
| `21b-tree-after-u.png` | after `u` — sibling at depth 87 |
| `22b-tree-cousin-subtree.png`, `23-cousin-87.png`, `23b-tree-cousin-87.png` | alternate-subtree navigation |
| `30-tree-expanded.png`, `30b-tree-expanded.png` | all branches expanded; the 492-px-tree-in-134-px-pane clipping |
| `40-at-cousin.png` | cursor on the black cousin of move 87 |
| `41-library-wide.png`, `42-after-right-sweep.png` | Library tab before/after the 700 px reflow |
| `50-after-reload.png` | past-saturation layout lost on reload |
| `51-past-saturation-released.png`, `52-after-regrab.png` | the re-grab snap (§4) |
| `53-after-reverse.png`, `54-fast-drag.png` | reverse sweep end state; fast-drag end state |
| `60-cards-wide.png`, `61-cards-narrow.png` | Cards tab across the 479 px reflow |
| `62-analysis-wide.png`, `63-analysis-narrow.png` | Analysis tab across the 379 px toggle |
| `64-after-reload-persist.png` | below-saturation layout surviving reload |

Data — `assets/panel-weirdness/data/`

| file | contents |
|---|---|
| `s1.json` | 698 rAF samples, rightward full-range sweep, Library tab |
| `rev.json` | 490 rAF samples, leftward sweep (contains the `dmx=0` jump) |
| `cards.json` | 375 rAF samples, Cards tab sweep (`.forest-container`, `.left-panel`) |
| `analysis.json` | 1164 rAF samples, Analysis tab sweep (`.linear-content`, `.preview-box`, `.chart-area`) |
| `p1/p4–p11.log` | raw per-phase transcripts (identity, navigation, geometry, console) |

## 12. Code seams read in full

`frontend/src/composables/chrome/useResizablePanel.ts` (all 215 lines),
`frontend/src/engine/navigator.ts` (all 391 lines),
`frontend/src/App.vue` (all 657 lines, template + style),
`frontend/src/components/tree/TreeWidget.vue` (script + template + style),
`frontend/src/components/chrome/SidebarWidget.vue` (virtualized rail section),
`frontend/src/composables/keybindings-catalog.ts` (navigation registry),
`frontend/src/components/library/LibraryTab.vue` (§CQ),
`frontend/src/components/tree/ForestDirectory.vue` (§CQ),
`frontend/src/components/charts/AnalysisChartPanel.vue` (§ResizeObserver threshold),
`frontend/src/components/board/StatusBar.vue` (template).
Law: ADR-0009 (evidence before hypothesis — every claim above is a measurement,
not an inference from the diff) and ADR-0021 (witness the property, not the
symptom — §4c explicitly separates the two).
