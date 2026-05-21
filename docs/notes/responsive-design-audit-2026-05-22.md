# Responsive design audit — 2026-05-22

- **Status:** Active (audit / observation record; no remediation plan yet)
- **Scope:** `frontend/` Vue 3 + TypeScript SPA
- **Priority:** Desktop use. Mobile findings documented as a formality
  but are not the active concern; the project's deployment surface is
  desktop browsers in the LengYue user base.

## Method

Three independent static-inspection passes by parallel agents,
each scoped to one surface slice of the frontend to avoid coverage
overlap and to allow independent cross-confirmation of cross-cutting
findings. The agents were briefed neutrally — no prior conclusion
was shared with them, and serendipitous discoveries were the
explicit success criterion. After the three static passes, a
fourth agent exercises the live dev server via Playwright /
Firefox at multiple viewport sizes; that section is appended
under [Live verification](#live-verification).

Surface partition for the static passes:

1. Board surface + global toolbar (board widget, move suggestions,
   variations overlay, tab bar, toolbar, chrome layout shell)
2. Cards / review session / card-forest browse (review session,
   card metadata panel, tree widgets, forest navigation)
3. Chrome / power-user customisation / settings (toolbar popovers,
   knob registry, settings tabs, modals, auth)

The agents read end-to-end per the ADR-0002 corollary on documentation
consumption and cited line numbers from full reads.

---

## Desktop findings (priority)

### Cross-cutting — confirmed by every agent

These findings appeared independently in all three audits, with
specific source-line citations. Treat as load-bearing observations
about the codebase's responsive posture in general.

#### 1. Zero `@media` queries in `frontend/src/`

Verified by recursive grep across `.vue` and `.css` files. No
breakpoints exist anywhere in the codebase — not for phones,
tablets, narrow-desktop, or ultrawide. The design is "one layout,
scaled by flex." Combined with `body { overflow: hidden }`
(`assets/css/style.css:30`), content that exceeds the chrome at
narrow widths is clipped rather than reflowed.

#### 2. Hardcoded panel widths sum to ~608 px before content gets any horizontal space

- `frontend/src/components/chrome/SidebarWidget.vue:95` and
  `frontend/src/assets/css/style.css:47` — `#sidebar-widget { width: 108px }`
- `frontend/src/App.vue:518` — `#vue-tree-panel { width: 220px }`
- `frontend/src/components/tree/ForestDirectory.vue:435` —
  `.left-panel { width: 280px; flex-shrink: 0 }` (when forest view is active)
- Plus the resizer at `App.vue:527` (4 px) and the board column's
  `MIN_BOARD = 300` floor at `composables/chrome/useResizablePanel.ts:31`

At 1024 × 768 (smallest viewport a desktop user might hit when
window-snapped), chrome consumes ~608 + 300 (board floor) = 908
px before any other content gets pixels — meaning the right pane
collapses to under 120 px wide before any other UI is rendered.

#### 3. `body` and `#app` both set `overflow: hidden`

`frontend/src/assets/css/style.css:30` and
`frontend/src/App.vue:466,471`. No scroll escape if any content
overflows the visible chrome. Combined with the missing media
queries, the layout fails-silently on narrow desktops: content
simply doesn't render at full size, rather than getting a
scroll-into-view affordance.

#### 4. Two parallel CSS systems with dead-code overlap

`frontend/src/assets/css/style.css` (loaded by `App.vue:460`)
declares selectors that no longer exist in the markup:
`#toolbar`, `#sidebar` (vs the active `#sidebar-widget`),
`#status-bar`, `#tree-panel`, `#tabs`, `#centre`, `#board-area`.
The active chrome is rendered by SFC-scoped styles inside
`Toolbar.vue`, `SidebarWidget.vue`, etc., which silently shadow
the legacy globals where they overlap. Some rules in style.css
(e.g., `input[type="range"] { width: 25rem }` at line 294 — a
fixed-width slider) still apply because their selectors do match
live elements.

The CSS-source posture is "two systems coexist; only the scoped
one is documented as the SSOT." Audit reading is more difficult
because the inactive global rules cannot be visually
distinguished from active ones without per-selector verification.

#### 5. Documented z-index ladder is not consistently used by the popover layer

`frontend/src/assets/css/theme.css:259-271` defines
`--z-popover: 10`, `--z-affordance: 50`, `--z-modal: 9999`,
`--z-overlay: 99999`. The popover-layer consumers use raw values
instead:

- `frontend/src/components/chrome/EngineQueueTooltip.vue:174` — `z-index: 100`
- `frontend/src/components/chrome/ToolbarSliderPopover.vue:133` — `z-index: 1000`
- `frontend/src/components/chrome/LocalePicker.vue:161` — `z-index: 1000`
- `frontend/src/components/chrome/PboPopover.vue:295` — `z-index: 1000`

None routes through the documented anchors. Stacking interactions
between popovers and modals are presently fine (modals at 9999),
but the anchor system and the consumers have drifted.

#### 6. Body font is literally 10 px

`frontend/src/assets/css/theme.css:348` defines `--text-body: 10px`;
`frontend/src/assets/css/style.css:24-31` applies it via
`html, body { font-size: var(--text-body) }`. This ignores user
browser font-size preferences (a user who has set 18 px as their
preferred default still sees the SPA at 10 px). `--text-tiny: 9 px`
(used in toolbar metric labels, system log timestamps,
tree-panel-header, locale-picker caret) is at the limit of
on-screen legibility on standard-DPI desktops.

WCAG 1.4.4 requires content to be usable at 200% zoom; at the
9-px floor, that lands at 18 px which is just at the WCAG floor.
On HiDPI displays at native scaling the 9 px text is at the lower
edge of typographic legibility.

---

### Surface-specific desktop findings

#### Board surface (`components/board/*` and toolbar)

What is well-handled:
- The board widget's SVG geometry is intrinsically scalable
  (`frontend/src/components/board/BoardDisplay.vue:170-313`):
  `viewBox="0 0 ${TOTAL_PX} ${TOTAL_PX}"` plus
  `.board-svg { width: 100%; height: 100%; display: block }`.
  All cell / stone / label / hoshi geometry derives inside the
  SVG coordinate space; `BOARD_PX = 600` in
  `frontend/src/engine/constants.ts:16` is a viewBox unit, not a
  CSS pixel constraint.
- `aspect-ratio: 1/1; height: 100%; max-width: var(--board-target-px, 100%)`
  on the board column (`App.vue:505-514`) responds cleanly to
  vertical viewport changes. The resizer composable
  (`useResizablePanel.ts:48`) rebases on actual rendered width
  at drag time, so persisted caps don't fight stale viewports.
- Per-panel show/hide toggles persist across sessions and live
  in the top nav bar regardless of viewport (`App.vue:294-303`).
  Manual responsiveness as an escape hatch.

What is gappy or surprising at desktop sizes:

**Visual decoupling of resize handle and its target.** The
`panel-resizer` at `App.vue:361` sits between the tree-panel and
the control-panel, but `useResizablePanel.ts:44` reads
`#board-column`'s rendered width and mutates the board's max-width
cap. The user-visible handle and the controlled element are
spatially mismatched. On narrow desktops, dragging the visible
handle to "give the controls more room" instead shrinks the board.

**Toolbar has no `flex-wrap`.** `Toolbar.vue:317` declares the
container as a flex row with no wrap. `engine-identity` (line 329)
and `engine-controls` (line 374) carry `flex-shrink: 0`, so under
width pressure the middle metric cluster gets crushed first while
VERSION / MODEL / MATCH / CONNECT stay full-width. There is no
scroll, no `…` overflow menu, no responsive collapse.

For SELECTOR-mode (multi-model proxy routing), the in-line comment
at `Toolbar.vue:323-328` acknowledges 30–40-character `internalName`
strings. At normal desktop sizes a single such name leaves no room
for the rest of the toolbar's right-side controls — the
in-between cluster is the first to crush, while the model-name and
connect-state retain their space.

**Scroll hijacking inside the board.**
`frontend/src/composables/useScopedScroll.ts` is wheel-only with
`passive: false`, consuming scroll events when the cursor is
inside the board. Combined with `body { overflow: hidden }`,
there is no escape: a user whose viewport is filled by the board
cannot scroll past it.

**`AnalysisDashboard.vue:101` uses `height: calc(100vh - 165px)`.**
The 165-px subtrahend is the sum of toolbar (`Toolbar.vue:317`,
28 px) + top-nav-bar (`App.vue:486`, 32 px) + status-bar
(`StatusBar.vue:90`, 20 px) + `#tree-panel-header`
(`App.vue:519`, 20 px) + various other gaps. It is unverified
arithmetic, not derived from layout — adding a row breaks the
analysis-panel sizing silently. If the toolbar's height ever
shifts, the chart's vertical extent is wrong.

#### Cards / review session / card-forest tree

What is well-handled:
- `min-width: 0` discipline is universal across nested flex
  containers in the card-forest navigation:
  `frontend/src/components/tree/ForestDirectory.vue:434,452,458`,
  `frontend/src/components/charts/CardTreeWidget.vue:258,270`,
  `frontend/src/components/tree/ForestTreeNav.vue:170-184`. The
  shrink-below-content-size gotcha is solved deliberately rather
  than by accident.
- Ellipsis-on-overflow is consistent for tree-node titles
  (`ForestTreeNav.vue:172,184`, `CardTreeWidget.vue:297`) — long
  player names and SGF descriptions degrade gracefully.
- ECharts forest re-layout on container resize via
  `ResizeObserver` (`useEChartsForestRender.ts:115-117`) — parent
  panel-resize triggers `inst.resize()` correctly.

What is gappy or surprising at desktop sizes:

**Magic-number height in `AnalysisDashboard.vue:101`** (same
finding as the board section — flagged here too because it
affects the analysis-overlay surface inside review).

**Render-cap affordance for large game-source lists.**
`ForestTreeNav.vue:35` declares `VIRT_THRESHOLD = 50`, slicing
to the first 50 with a `+ N more` text node and no scroll path
for the hidden N. On narrow desktops (where the right pane is
~120 px wide per the panel-width math above), this becomes the
user's only escape — they have to change parent selection
rather than reflow the visible list.

**Mixed-posture inputs in the card-metadata panel.**
`CardMetadataPanel.vue:412` fixes `.num-input { width: 80px }`
regardless of viewport. The tag-input wrapper at line 469 uses
`min-width: 80px` and grows. The file has no comment explaining
why numeric and text inputs are sized inconsistently.

#### Chrome / settings / toolbar popovers

What is well-handled:
- Modal viewport clamping is universal. All five modals use
  `max-width: 90vw` (or `width: min(560px, 92vw)` in
  `RootErrorBoundary.vue:73`), so dialog cards never overflow a
  narrow viewport. Button rows use `flex-wrap: wrap` in
  `LoginModal.vue:188` — the only `flex-wrap` in the entire
  codebase.
- Long-content truncation on tree titles is consistent (cited
  above under cards / tree).

What is gappy or surprising at desktop sizes:

**Toolbar popovers anchor to viewport-edge offsets without
clamping.** `ToolbarSliderPopover.vue:124-126` uses `right: 0`;
`EngineQueueTooltip.vue:167-168` uses `left: 0`;
`PboPopover.vue` uses `right: 0`. When their parent metric sits
near a viewport edge, the popover anchors against the wrong
edge or clips off-screen. No `max(0, min(viewport - width, x))`
clamp exists.

**`FloatingThumbnail.vue:20` positions at `posX + 20, posY + 20`
with no clamp.** The hover-handler at `SidebarWidget.vue:44`
passes `clientX + 20, clientY - 60`. A hover at the right or
top edge paints partially offscreen.

**Settings tab is one large nested-scroll container.**
`App.vue:569` sets `.registry-container { max-height: 400px }`
(with an inline `500px` override at line 401), but the parent
`.tab-body` is also `overflow-y: auto`
(`TabWidget.vue:94`). Two nested scrollers means the inner
400 px is fixed regardless of viewport — on a tall display the
wasted vertical space is large; on a short display two
scrollbars compete for trackpad / wheel scroll.

**`<details open>` for all five settings sections.**
`App.vue:389, 399, 411, 418, 425` — only F-Optimizer is closed
by default. The whole tab renders as a long scroll inside a
nested scroll inside a tab-pane inside a control-panel inside
the split-workspace.

**KnobSlider's `grid-template-columns: minmax(0, 1fr) minmax(120px, 2fr) auto`**
(`KnobSlider.vue:384`). The 120 px slider minimum prevents the
slider from collapsing under width pressure in the toolbar
popover. But the popover's own
`min-width: 380px; max-width: 520px` cap
(`ToolbarSliderPopover.vue:131-132`) means the popover itself
won't shrink to fit a narrow viewport — it would overflow.

**`SidebarWidget` is `v-show`, not `v-if`** (`App.vue:271`).
The 108 px sidebar collapses to zero rendered width via
`v-show="store.session.ui.sidebarExpanded"`, so the user can
toggle it manually. There's no auto-collapse below any width
threshold.

---

## Live verification

A fourth agent installed Playwright + Firefox in `/tmp/playwright-venv`,
exercised the live dev server at `http://192.168.122.68:5173/`, and
screenshotted nine viewport sizes across the main surfaces. The agent
authenticated as **`audit_2026_05_22`** (not `local_user`) by signing
out via the user-badge, then signing in with the alt username via
`#login-username`; the backend accepts password-less identities.
Confirmed by badge text `aud..._2026_05_22` (truncated by badge
width) in all post-login screenshots.

Pink background is the intended theme; not a finding.

Screenshots live in `/tmp/responsive-audit-screenshots/` (54 PNGs).
The audit script is preserved at `/tmp/audit2.py` for re-running.

### Desktop verification (priority)

| Viewport | Verdict | Key observation |
|---|---|---|
| 1920×1080 | clean | SLIDERS popover opens beside the badge without clipping. Tabs render with breathing room. |
| 1440×900 | clean | Controls panel narrower but usable; popover positions correctly. |
| 1280×800 | cramped | Cards-tab header "Lineage Explorer" crowds the "SELECT DECK / standard / NEW PIPELINE" button row; some control text bleeds toward the right edge. Popover still OK. |
| **1024×768** | **broken** | The control-panel tab strip is positioned **outside the viewport's right edge**. Playwright reports "Element is outside of the viewport" even with `force=True` and `scroll_into_view_if_needed`. A user at 1024×768 cannot click Cards / Analysis / Other from the default chrome state. |
| **800×600** | **broken** | The entire Control Panel (the Cards / Settings / Analysis / Other tab widget) is **not visible at all** — and not just visually offscreen but absent from the full-page screenshot, which matches the viewport size. Only the Sidebar, board, and a slim Game Tree pane render. Toolbar shows truncated SLIDERS / MINT CARD overlap and CONNECT clipped at the right edge. |
| 3840×1080 (ultrawide) | renders | Synthesized successfully — Playwright + Firefox handles ultrawide without special config. Long horizontal whitespace in the registry-editor rows; toolbar buttons cluster top-right against the wide expanse. |

#### What this reveals beyond the static audit

Three findings the static read could not have predicted with confidence:

**1. The control-panel tab strip is unreachable at 1024×768.** Even
Playwright's `force=True` click cannot land on the tab strip because
it's positioned beyond the viewport. The flex children in
`App.vue:363-371` (`flex: 1 1 0; min-width: 0`) plus the order of
children at that flex level produce an emergent layout where the
tab strip slides outside the visible area instead of compressing.
A static audit reading `flex: 1 1 0; min-width: 0` would have
predicted "compresses gracefully"; the live behaviour is "slides
offscreen."

**2. The Control Panel is entirely absent from the DOM render at
800×600.** Both the visible viewport screenshot AND the full-page
screenshot match the viewport size (1.07 MB) with no scrollable
content hidden — meaning the panel doesn't render at all, it's not
just offscreen. The resizer plus flex-children chain collapses one
branch completely at this width. Static reading of the resizer logic
(`useResizablePanel.ts`) doesn't expose this — the collapse happens
in the flex resolution of `#main-workspace`'s children.

**3. The popover label column is what clips, not the slider.** At
800×600 and below, `ToolbarSliderPopover` overflows the **left edge**
with the label column truncated (`"rea…"`, `"thre…"`, `"ode…"`), while
the slider track and the numeric value on the right stay visible. The
static audit predicted "the popover will clip" but couldn't predict
directionality — the `right: 0` anchor combined with the popover's
fixed-min-width produces left-side clipping specifically. Reference
screenshot: `desktop_800x600__popover.png`.

#### Static-audit cross-confirmation

The static findings the live verification confirmed visibly:

- **Toolbar has no `flex-wrap`** → confirmed: SLIDERS / MINT CARD
  buttons overlap at ≤800 px viewport; CONNECT clips at the right
  edge. Reference: `desktop_800x600__board.png`,
  `mobile_375x667__board.png`.
- **No viewport-edge clamping on popovers** → confirmed: the
  SLIDERS popover does not test viewport bounds before placing
  itself; it bleeds against the upper edge at 1024 and clips the
  left at 800.
- **Hardcoded panel widths consume the viewport** → confirmed via
  the Control Panel pathology at 1024×768 and 800×600.

The static findings the live verification did NOT reach (gaps, not
counterexamples):

- **Long `internalName` overflow path**: the user's installation
  has a short engine-identity string, so the documented 30–40-char
  SELECTOR overflow path was not exercised. Other narrow-viewport
  overlaps suggest the same mechanism applies, but the specific
  long-identity case is unverified.
- **Engine-queue popover, PBO popover**: not reachable from the
  disconnected default state the agent tested in. Architectural
  similarity to `ToolbarSliderPopover` suggests they share the
  no-edge-clamping shape.
- **Card-review session UI**: the agent didn't have an active
  review running and reaching one would require seeded card data
  plus a click-through flow longer than the budget allowed.

### Key screenshots referenced

- `desktop_1920x1080__board.png` — clean baseline
- `desktop_1280x800__cards.png` — control panel cramped
- `desktop_1024x768__board.png` — tabs offscreen
- `desktop_1024x768__popover.png` — popover bleeding against upper edge
- `desktop_800x600__board.png` — control panel **absent**
- `desktop_800x600__popover.png` — popover left-edge label clipping
- `desktop_3840x1080__board.png` — ultrawide
- `mobile_375x667__board.png` — toolbar overlap, CONNECT clipped
- `mobile_375x667__popover.png` — phone-viewport popover clipping
- `mobile_768x1024__board.png` — iPad portrait; control panel still
  offscreen (same root cause as 1024×768)

### A note worth recording on tooling

Playwright's `has_text="Sign In"` matches the Register & Sign-In
button by substring. Anchored regex (`^Sign In$`) avoids this. Not
a SPA defect — just a confusable button label that's easy to fire
by mistake during scripted login. Worth knowing if any future
test automation hits the auth path.

---

## Mobile / touch findings (formality)

The deployment surface is desktop browsers. Mobile observations
are documented for completeness but are not the project's active
concern.

### Cross-cutting mobile observations

1. **No touch event handlers on the board.**
   `frontend/src/components/board/BoardDisplay.vue:142-165` reads
   `MouseEvent.clientX/clientY` only. Touch works only by browser
   emulation (which loses pressure / multi-finger fidelity).
2. **`useScopedScroll.ts` is wheel-only**, with no `touchmove`
   analog. The "scroll to navigate moves" affordance is
   desktop-only.
3. **Hover-driven affordances are pervasive.**
   `MoveSuggestions.vue:245` (PV preview), `BoardTab.vue:181`
   (close-board "×" opacity-0-until-hover), `FloatingThumbnail`,
   `PboPopover`, `EngineQueueTooltip`,
   `ToolbarSliderPopover` (recently the new home for the
   animation knobs added 2026-05-22) — all hover-intent via
   `useHoverPopover`. On touch, the entire knob quick-access
   surface, the in-flight-query panel, and most overlays are
   unreachable.
4. **`useResizablePanel.ts` is mouse-only** (`mousemove` /
   `mouseup`, lines 55-56). No touch drag-resize.
5. **`100vh` instead of `100dvh`** at `App.vue:464` and across
   modal backdrops (`MintCardModal.vue:315`,
   `EngineMatchModal.vue:171`, `HyperparamPromptModal.vue:131`,
   `ConfirmLoadModal.vue:70`). On iOS Safari and Android Chrome
   the URL bar contributes to the viewport, so `100vh` overshoots
   the visible region.
6. **Touch-target sizes are far below the 44 px standard.**
   Sample measurements:
   - `.close-board-btn` 16×16 (`BoardTab.vue:179`)
   - `.tab-add-btn` 20×20 (`SidebarWidget.vue:104`)
   - `.collapse-btn` 18 px tall (`App.vue:571`)
   - `.toolbar-btn` `padding: 1px 5px` (`Toolbar.vue:378`)
   - `.chevron-btn` `padding: 0 2px` ≈ 10 px tall
     (`ForestTreeNav.vue:168`)
   - `.chip-remove` ~10 px square (`CardMetadataPanel.vue:458`)
   - `.action-btn-large` (Start Review) `padding: 4px 12px`
     + 10 px font ≈ 22 px tall (`App.vue:567`)
   - Native range thumb at `height: 0.5rem; width: 1.5%`
     (`style.css:317-319, 339-340`) — roughly 5×4 px on a 250 px
     slider, defeated by a finger.
7. **MIN_BOARD = 300 floor** (`useResizablePanel.ts:31`) plus
   the sidebar (108) plus tree (220) requires 628 px minimum
   viewport for the layout to render correctly. A 360 px phone
   viewport is structurally impossible.

### Surprises in the touch-aware code

`HorizontalTimelineVisualizer.vue` is the ONE component in the
audit scope with paired `@mouseenter` / `@touchstart` handlers
(lines 10, 54-78, 354-357). Every mouse event has a touch
counterpart. **But the geometric hit targets defeat the touch
intent**: the touch handles are 16 px wide (line 445) at -8 px
offset (lines 454-455), and the pill bar inside is 4 px × 12 px
(line 463-464). Event-level touch awareness honoured;
geometry-level usability defeated by a thumb.

---

## Related files

- `frontend/CLAUDE.md` — frontend conventions; architectural shape
- `frontend/FILES.md` — per-file purpose + band map
- `frontend/src/App.vue` — layout shell; many of the cross-cutting
  findings cite line numbers here
- `frontend/src/assets/css/style.css` — global styles + dead-code
  overlay
- `frontend/src/assets/css/theme.css` — design-token registry
  (font-size scale, z-index ladder, colour variables)
- `frontend/src/components/chrome/Toolbar.vue` — chrome's
  responsive-shape gravity centre
- `docs/notes/deferred-items.md` — adjacent open questions some
  of which intersect this audit (e.g., the PV-overlay typography
  proportions)

## License

Public Domain (The Unlicense).
