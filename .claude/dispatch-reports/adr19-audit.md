# ADR-0019 audit — LengYue (next build, `http://127.0.0.1:4173`)

Auditor: Opus, dispatched 2026-08-06. Register: cantankerous, per commission.
Law applied: ADR-0019 (Rules 1–4) + companion `0019-appendix-ui-proscriptions.md` (C1–C29).
Genre: desktop Go analysis/review client. Reference exemplars: Sabaki, KaTrain, OGS, Lizzie.
Viewport 3840×2160 @ deviceScaleFactor 1, playwright-core 1.60.0 + `/usr/bin/chromium`, headless.
Screenshots live on the repo host at `/home/bork/w/omega/.claude/dispatch-reports/`.

---

## Verdict

The dark theme is a competent, genre-legible Go client and the board itself is genuinely good — coordinates on four edges, star points, last-move marker, a status bar that says what a status bar should say. Everything wrapped around it is in trouble. The default (light "cluster") theme fails WCAG on **66 of 116** rendered text nodes because someone bound the chrome substrate to a *categorical maximin* palette — a palette engineered to maximise distance between chart series, which has no luminance ramp and therefore cannot produce readable text, a consequence the theme's own docstring cheerfully documents and ships anyway. The settings surface is not a settings surface; it is a raw model dump of 145 unlabelled inputs whose labels sit up to **1315 px** from the controls they name. Twelve facts have two or more editable homes — the exact defect ADR-0019 Rule 3 was minted to forbid, and one of them (`moveFilterThreshold`) has three homes, a read-only mirror, *and* a shipped tombstone note apologising for it. Every modal in the app is keyboard-inert: focus never enters, Escape does nothing, Tab walks the page behind it, and the only exit is an undiscoverable backdrop click that discards your draft without asking. And underneath all of it sits the worst thing I found, which is not a styling matter at all: **on a cold load the app paints a complete, fully interactive, entirely plausible workspace containing the wrong 37 boards, with no loading state, no skeleton, and no stale marker, and then silently swaps it for the real 98.** The panel subdivision the owner suspects is "tacky and probably mis-architected" is worse than tacky: the divider resizes neither of the two panels it sits between, one drag writes two different model slots, and the only slot that gets persisted is the one with no visible effect — so the layout you drag is thrown away on reload while a value that does nothing is saved forever. His instinct was right and the recent "nominal" patch treated symptoms.

---

## Findings, by severity

### S1 — CRITICAL. The app paints a phantom workspace before the real one loads, with no loading state at all

**What it is.** On a cold load the board rail renders **37 boards**. The real workspace has **92**. There is no spinner, no skeleton, no disabled chrome, no "loading", no as-of, nothing — the phantom UI is fully interactive. Some seconds later it silently becomes the real workspace. During that window every control is live: you can select a board, play a move, or close a board against a workspace that is about to be replaced.

**Rule violated.** C6 (loading / error / empty / genuine-zero / no-data-yet must never be collapsed — here *loading* and *loaded* are pixel-identical), C7 (no as-of, no distinct stale appearance), C23 (a failure/pending path returning an apparently-nominal state).

**Evidence.** Witnessed decisively by gating the workspace GET with a Playwright route and inspecting the paint that happens first:

```
PRE-HYDRATION PAINT: { "boards": 37, "saysLoading": false, "skeleton": false,
  "text": "LOAD SGF\nSAVE SGF\nBoard \n×\n+\n◀\nSLIDERS12\nMINT CARD\nPLAY\nMATCH\nCONNECT..." }
POST-HYDRATION: 98
```

`saysLoading` is a regex over the entire rendered `body.innerText` for `loading|please wait|connecting|syncing` — it matched nothing. Screenshots `adr19-audit-70-pre-hydration-paint.png` (the phantom) and `adr19-audit-71-post-hydration.png` (the real thing).

This is not a synthetic-only artifact. It was first hit by accident: five consecutive uninstrumented cold loads returned `37, 98, 98, 37, 98` — the 37s being loads where the measurement landed inside the window. I initially could not reproduce it under instrumentation (six loads, all 98) and was about to report it as a measurement error; the route-gating test above is what settled it.

**Adjacent, unproven but corroborated:** `PUT /documents/user_workspace_01` fires unsolicited on some loads. Six board closes I made were durably accepted by the server and then reverted to the prior count by a later load — consistent with a pre-hydration state being written back over a newer one. I did not capture the PUT body and I am **not** claiming lost-update as proven. It warrants its own investigation.

**Shortest honest fix.** Model the workspace as `RemoteData<Workspace>` with an exhaustive render (C6's own prescription). The pre-hydration arm renders a skeleton with chrome disabled — not a plausible fake workspace. Nothing may write back until the `Loaded` arm is reached.

---

### S2 — CRITICAL. The panel resizer is a divider that resizes neither of its neighbours, writes two slots, and persists the wrong one

*(The owner's sore point. He is right, and the recent patch made the symptom nominal without touching the architecture.)*

**What it is.** The row is `[sidebar][board-column][tree-panel 140px][resizer 4px][control-panel]`. The `.panel-resizer` sits between the **tree panel** and the **control panel** and resizes **neither**. It writes `session.ui.boardSquareMaxWidthPx` — a cap on the *board column*, two elements to its left. Past board saturation it silently switches to writing a **second** slot, `controlPanelWidthPx`, a composable-local ref. The bar appears to track the cursor only as a side effect of `#split-workspace` flipping to `justify-content: center`, which drags the whole block — board included — sideways under the user.

**Rules violated.** Rule 1 / Rule 2 (every named exemplar — Sabaki, Lizzie, KaTrain, and every IDE splitter — resizes the two panes it separates; "any UI structure the genre's reference exemplars do not exhibit is presumptively wrong"). C1 (one control, two model slots). C29 (a mode change at the saturation point with no indicator).

**Evidence.** Measured live, dragging the handle right from `x=2436` in steps (`adr19-audit-33-resizer-dragged-right-1000.png`):

| drag | board x,w | tree | control panel | `justify` | persisted `boardSquareMaxWidthPx` |
|---|---|---|---|---|---|
| start | 168, **2128** | 140 | **1400** | normal | **3490** |
| +100 | 218, **2128** | 140 | 1300 | center | **2228** ← discontinuous −1262 jump |
| +400 | 368, **2128** | 140 | 1000 | center | 2528 |
| +1000 | 668, **2128** | 140 | **400** | center | 3128 |
| **after reload** | **168, 2128** | 140 | **1400** | normal | 3128 |

Read that last row. Three things are wrong at once:

1. **The board never resizes.** Width is 2128 px at every step. It *translates* 500 px rightward instead — direct manipulation inverted.
2. **The persisted value is clobbered at drag start.** `dragOriginPx` is read from the rendered column width (2128), not from the stored target (3490), so the first `mousemove` writes `computeBoardTargetPx(2128, 100) = 2228` and the user's stored 3490 is gone. (`useResizablePanel.ts:~140`, `startResize`.)
3. **The wrong slot survives.** `boardSquareMaxWidthPx` persists (3128) but has *zero* visible effect — the board is height-saturated either way. `controlPanelWidthPx`, the only thing the drag visibly did, is deliberately not persisted (`useResizablePanel.ts` file header), so the panel snaps 400 → 1400 on reload. **The entire visible outcome of the drag is discarded; a value that does nothing is saved.** Screenshot `adr19-audit-34-after-reload-layout-jump.png`.

**Bonus.** The tree panel — the panel actually adjacent to the handle — is hardcoded `width: 140px` and not resizable at all (`App.vue`, `#vue-tree-panel`). The handle you can grab does not resize the panel you would want to resize. And the handle itself is **4 px** wide (C21 floor is 24).

**Shortest honest fix.** Make it a splitter. One divider, two neighbours, one slot each, both persisted. If the board is to be size-capped, that is a separate control (it already exists, as a number field in the registry) — not an overloaded second meaning on a drag handle. Delete the centering hack; it exists only to make the bar appear to follow the cursor while it does something else.

---

### S3 — CRITICAL. One fact, many editable homes — Rule 3's own minting specimen, shipped

**What it is.** `session.ui.moveFilterThreshold` is editable in **three** places and mirrored read-only in a fourth:

1. Settings → Session (UI) → `moveFilterThreshold` (number input, `0.05`)
2. Settings → Advanced Registry → `knobs` → `display.move-filter-threshold`
3. Other tab → Knob Registry editor → same knob
4. Analysis tab → the floating **"5%"** badge — `{{ (store.session.ui.moveFilterThreshold * 100).toFixed(0) }}%` at `AnalysisControls.vue:255`

The knob is not a separate fact; it declares its own aliasing in source — `defaults.ts:374`:

```
outputs: [{ path: 'session.ui.moveFilterThreshold' }],
```

**The class is 12 wide.** `grep -c "outputs: \[{ path:" src/store/defaults.ts` → **12**. Every one names a path that is *also* an editable leaf in one of the two registry editors. Four of them (`watchdogAnimationMs`, `watchdogLatencyThresholdMs`, `reportDuringSearchEvery`, `firstReportDuringSearchAfter`) are visible **twice in a single scroll of one sub-tab** — screenshot `adr19-audit-36-knob-double-home.png`.

Separately, at least ten `session.ui` slots have a registry control *and* a real chrome control: `activeTab` (free-text input vs the tab strip 30 px above it), `sidebarExpanded` / `treeExpanded` / `controlsExpanded` / `boardExpanded` (checkboxes vs the three emoji toolbar toggles), `showStoneMoveNumbers` (vs the StatusBar `#` button), `boardSquareMaxWidthPx` (vs the resizer), `qeuboToolbarView`, `activeCardSetId`, `cardsContextIds` — several of these documented as dual-homed in `schema.ts`'s own comments.

**Rule violated.** Rule 3 verbatim: "Rendering one value under two headings — editable or as a 'convenience' mirror — falsifies that claim... Enforcement is NOT review-only: a duplicated projection of one fact is a TYPE ERROR, refused loudly at UI start." C1 (bijection over the binding registry).

The insult is the tombstone. The Analysis tab ships this, in production, where the Move Filter control used to be (`adr19-audit-20-analysis-panel-zoom.png`):

> **Move Filter** — Moved to Other tab → Knob Registry. A toolbar quick-access surface will replace both eventually.

The team knew about the duplication and resolved it by leaving a signpost instead of removing a home — and then left the read-only "5%" mirror next to the signpost.

**Shortest honest fix.** Build `slot → [controls]` from the knob registry + registry-editor leaf set at mount and refuse on any slot with more than one editable control, naming every claimant. That is a real gate over data you already have declared, and it is C1's stated enforcement. Then delete the losing homes and the tombstone.

---

### S4 — HIGH. The default theme cannot render readable text, by construction

**What it is.** `data-theme="cluster"` is the shipped default (`store/defaults.ts:317`, `index.html:10`). It binds the entire chrome substrate to `--cluster-12-*`, a palette generated by **maximin optimisation for perceptual distance** — i.e. a categorical series palette. Categorical palettes have no luminance ramp. Text needs a luminance ramp.

**Rule violated.** C19 (4.5:1 normal, 3:1 large/non-text).

**Measurement.** Computed WCAG ratios over every rendered text node against its actual composited background: **66 of 116 fail** in light. Worst offenders:

| ratio | need | what |
|---|---|---|
| **2.08:1** | 4.5 | `#00a7ff` on `#fedaf7` — **every** accent element: the "Mint Card" primary CTA, the active control-panel tab, the active settings sub-tab, "Not saved", the MOVE badge, every `branch-label` in both registries |
| **3.84:1** | 4.5 | `#7a6f6d` on `#fedaf7` — **the entire `--text-2` tier**: all 5 top-level tab labels, all 6 settings sub-tab labels, all 145 `leaf-label`s, "Game Tree", the chart axis labels, the tab-rail "Board" labels, all three emoji toggles |

Dark is much better but not clean: **21 of 91** fail, and again the cause is the token, not the widget — `--text-2: #666` on `--surface-0: #000` is **3.66:1**, dragging down the same tab labels, "Game Tree", and the sub-tab strip.

The theme's own docstring names the trade and ships it anyway (`theme.css`, `[data-theme="cluster"]` block): *"the substrate's role distinctions become categorical rather than progressive. That collapse is the honest consequence of strict palette compliance."* Honest, yes. Also unreadable. Strict palette compliance is not a value that outranks WCAG, and `--text-2: var(--cluster-12-6)` on `--surface-1: var(--cluster-12-6)` is **1.00:1** wherever both are used together — the docstring calls that "semantically subtle"; the correct word is invisible.

The failure is visible in `adr19-audit-01-boot-light.png` (whole app, light), `adr19-audit-20-analysis-panel-zoom.png` (the accent-on-pink cluster at native resolution), and `adr19-audit-42-dark-analysis-zoom.png` (the same surface in dark, for comparison).

**Shortest honest fix.** Two token changes, not a repaint: darken `--text-2` and `--accent-primary` in the `cluster` block until they clear 4.5:1 against `--surface-0`, and in `dark` until `--text-2` clears 4.5:1 against `#000`. Accept that a chart palette is not a UI substrate. Then add the token-level contrast test C19 names as its enforcement — this is a one-file gate over 16 anchors.

---

### S5 — HIGH. Every modal is keyboard-inert and dismisses by discarding your work

**What it is.** Opened the Mint Card modal and drove it from the keyboard:

```
open:              { backdrop: true,  focus: "BUTTON.toolbar-btn highlight-btn" }   ← focus never entered
after Escape:      { backdrop: true,  focus: "BUTTON.toolbar-btn highlight-btn" }   ← Escape does nothing
tab walk (12 stops): OUT BUTTON.toolbar-btn / OUT BUTTON.collapse-btn / OUT BUTTON.locale-trigger /
                     OUT INPUT.komi-input / OUT INPUT.knob-slider-input / ...      ← all 12 OUTSIDE the modal
after backdrop click: { backdrop: false }                                           ← the only exit
```

Focus never moves into the modal; Escape is unbound; Tab traverses the **obscured page behind it** — including `INPUT.komi-input` and `INPUT.knob-slider-input`, so a keyboard user can edit the page underneath a modal they cannot reach. The one dismissal that works is an undiscoverable click on the backdrop, which discards the draft with no unsaved-changes guard.

**Class-wide, 7/7.** No modal in `src/components/modals/` binds Escape at the modal level (the single `Escape` hit at `MintCardModal.vue:142` is inside `handleTagKeydown` and clears the tag autocomplete). No modal calls `.focus()` on open. All seven dismiss via `@mousedown.self`/`@click` on their own backdrop.

**Rules violated.** C17 ("a modal capturing focus with no keyboard exit, a pointer-only or undiscoverable action... is refused" — this is the degenerate case: not a trap, an *inert* modal that captures nothing and is reachable by nothing). C16 (navigation-away discarding operator input with no guard).

**Also C20 in the same modal:** all 5 inputs report `(NO LABEL)` — no `<label for>`, no `aria-label` — and one is placeholder-only (`"Add tag (e.g. $fight)..."`), which is C20's named specimen.

**Screenshots.** `adr19-audit-53-mint-modal.png`, `adr19-audit-54-mint-modal-after-escape.png` (modal still up after Escape).

**Shortest honest fix.** One `<AppModal>` component: focus the first control on open, trap focus inside, bind Escape to the same handler as Cancel, and route backdrop-dismiss through the dirty check. Seven hand-rolled `.modal-backdrop` blocks collapse into it (see S14).

---

### S6 — HIGH. Board close is irreversible, unconfirmed, invisible, 16×16, and the only thing in the tab rail a keyboard can touch

Four defects stacked on one control.

- **Irreversible, unguarded.** `closeBoard` (`store/index.ts:560`) splices the board out. No confirm, no undo — `grep "undoStack\|registerUndo" src/store/index.ts` returns nothing. `useDirtyBoardGuard` covers *load-over-board*, not close. A board holding an unsaved tree with your own variations is destroyed by one click. **Witnessed:** my own cleanup destroyed 6 boards with 6 clicks and zero prompts. **C10.**
- **Invisible until hover.** `.close-board-btn { opacity: 0 }` with only a `:hover` rule to reveal it (`BoardTab.vue:304`). `grep focus BoardTab.vue` → **no matches**. So the keyboard focus indicator is painted on an element at `opacity: 0` and is therefore also invisible. **C17.**
- **16×16 px**, positioned `top:-6px; right:-6px` so half of it hangs off the tab corner. C21 floor is 24×24. **C21.**
- **It is the *only* focusable thing in the rail.** The tab row is a bare `<div @click>` — no `tabindex`, no `role`, no keyboard activation. So a keyboard user tabbing from page load hits **72 consecutive destructive close buttons** (measured: Tab stops 3–74 on a 72-board workspace) before reaching the `+` button at 75 and the first toolbar control at 76 — and cannot *select* a board at all, only destroy one. **C17.**

I initially suspected a hard focus trap here and **disproved it** — traversal does escape at stop 75. Reported as what it is.

The rail is shown in `adr19-audit-25-tabrail-zoom.png` (note that no × is visible anywhere, because none is hovered) and `adr19-audit-31-focus-trap-tabrail.png` (the rail mid-traversal).

**Shortest honest fix.** Make the tab a `<button>` (selection becomes keyboard-reachable, close leaves the primary tab order), give the × a confirm-or-undo per C10, pad the hit area to 24×24, and add a `:focus-visible` rule that overrides the `opacity: 0`.

---

### S7 — HIGH. The toolbar of a Go review client has no move navigation

**What it is.** The `.top-nav-bar` is 3672 px wide. Its entire content: a `◀` sidebar toggle, the label **"SLIDERS 12"**, then — 1700 px of nothing — `MINT CARD | PLAY | MATCH | CONNECT`, three emoji toggles, and a language picker. Roughly 85% empty. Screenshots `adr19-audit-21-toolbar-zoom.png`, `adr19-audit-22-toolbar-right-zoom.png`.

There are **no first / previous / next / last controls. No pass. No undo.** Stepping through a game is `ArrowUp`/`ArrowDown` only, discoverable only by opening Settings → Keybindings. (`ArrowLeft`/`ArrowRight` are sibling-variation switching, which is a documented prior trip-hazard for testers.)

**Rules violated.** Rule 1 / Rule 2 — Sabaki, KaTrain, Lizzie and OGS all exhibit a visible move-navigation cluster; it is arguably *the* convergent element of the genre, and its absence is a structure the exemplars do not exhibit. C17's undiscoverable-action tail.

**Shortest honest fix.** Put `⏮ ◀ ▶ ⏭` under the board or in the toolbar's dead centre space. The keybindings already exist; this is a view over them.

---

### S8 — HIGH. Charts render axes and legends over zero data, with no empty state

**What it is.** Both Analysis panels ("GAME STATE (TURNS)", "PER-PLAYER PERFORMANCE (MOVES)") draw a full axis frame, tick labels `0…249` and `0…124`, and a legend (`Complexity / Win Probability / Score Advantage`), with **no series**. A user cannot tell "no analysis has been run" from "analysis ran and returned nothing" from "the feed is down".

**Rule violated.** C6, verbatim: "A dashboard showing `0` when it means 'feed down' is a defect at the severity of showing wrong data, because the operator acts on it."

**Evidence — re-verified with deterministic waits**, because this is the one finding a too-short fixed sleep could have faked. Waited on predicates only: `[_echarts_instance_]` count ≥ 2 → all canvases sized → canvas bytes identical across two consecutive `requestAnimationFrame`s (a settle predicate, not a sleep). Then swept the control panel's full `innerText` for `no data|nothing to show|run an analys|not analysed|no analysis|empty|populate`:

```
emptyStateTextPresent: false,  matched: null
panels: [ {w:1209,h:159,ratio:7.6}, {w:1209,h:159,ratio:7.6} ]
```

Screenshot `adr19-audit-62-charts-settled-deterministic.png`. Theme-independent — same in dark (`adr19-audit-42-dark-analysis-zoom.png`).

**Shortest honest fix.** The Cards tab already does this correctly ("Run a deck to populate the view" — see *What is actually fine*). Copy that pattern: a `RemoteData` arm that renders a message instead of an empty axis frame.

---

### S9 — MEDIUM. Settings is a raw model dump, not a settings surface

- **145 inputs, zero labelled.** Every registry row is a `<label>` with no `for` and an input with no `id` and no `aria-label`. Measured across the Session (UI) tab: `n = 145`, `labelFor: "(none)"`, `id: "(none)"` on all of them. **C20** (WCAG 1.3.1 / 3.3.2), 145 instances.
- **Label-to-control distance 1104–1315 px** (max measured 1315). Labels are left-aligned at `x≈2450`; controls are right-aligned at `x≈3691` (inputs) / `x≈3818` (checkboxes). A 13×13 checkbox sits 1260 px from the 12 px word that names it. No exemplar and no settings dialog in any toolkit does this; the convention is a right-aligned label column adjacent to its control. Screenshot `adr19-audit-32-session-ui-registry.png`.
- **Storage artifacts promoted to navigation.** The Session (UI) tree renders raw board UUIDs as branch headings — `955bfc1d-dd1b-478d-91e2-60a509e80f44`, twice (under `forestNav.selection` and `cardTreeNav`). **Rule 4**: "storage artifacts (junction mechanics, hash chains, lineage columns) are owed no surface at all."
- **A control wired to nothing.** `controlPanelWidth` renders as an editable number input showing `340` — while the control panel it appears to name renders at 1400 px (and at 400 px mid-drag; the field never moves). `grep -rn "controlPanelWidth\b" src/ | grep -v Px` returns **exactly two hits**: the schema declaration and the default. **Nothing reads it.** It is a persisted, editable, live-looking zombie sitting six rows above the real (unexposed, unpersisted) `controlPanelWidthPx`. C2/ADR-0002.
- **No conventional preferences surface exists at all.** The theme switch — a first-class preference in Sabaki and OGS — is reachable only as `appearance.theme` inside the Advanced Registry raw tree.

I suspected the Session (UI) and Advanced Registry sub-tabs were duplicate homes for the same keys and **checked**: leaf-label overlap is **0**, branch overlap **0**. They are disjoint (`session.ui`, 35 leaves vs `profile.settings`, 131 leaves). Not a Rule 3 violation. Reported so the grumpiness stays calibrated.

**Shortest honest fix.** The raw registry is a fine *developer* surface; keep it, label it as such, and build the operator-facing Preferences dialog the genre expects on top of the same schema — grouped sections, real `<label for>`, units, and the label beside the control.

---

### S10 — MEDIUM. The layout does not use the screen it was given

At 3840×2160 the control panel is 1400×2128 px. What it does with that:

| surface | used | wasted |
|---|---|---|
| Analysis charts | 2 × (1209×159), **aspect 7.6:1** | ~1370 px of empty column below them |
| "Analyse Selection (249)" | a **1229 px wide** button | — |
| Analysis range strip | a **1347×14 px** canvas, aspect **96:1**, handles ~6 px wide | its own label ("249 nodes selected · turns 0–249") sits ~1200 px away at the far right |
| Cards tab | a 260 px control column | 1140 px of the 1400 (81%) empty |
| Toolbar | 4 buttons + 3 emoji | ~85% of 3672 px empty |

Meanwhile the board renders at **2128×2128** while the largest text anywhere in the app is **12 px** (histogram of all rendered text: `{9px: 4, 10px: 18, 11px: 38, 12px: 56}`). Nothing scales with the viewport except the board and the empty space.

**Rules.** Rule 1 (exemplars proportion their winrate graphs to their allotment; a 96:1 slider and a 1229 px button are shapes none of them exhibit). C12's spirit — measure should be a typographic constant, not an accident of container width; here the *controls* have the unbounded-measure problem the rule names for text. C21 for the ~6 px range handles.

**Shortest honest fix.** Cap control measures (`max-width` in `ch`/`rem`), give the charts a real aspect and let them fill the column, and move the range label onto the strip.

---

### S11 — MEDIUM. Every board tab is named "Board", to everything that isn't a human eye

`BoardTab.vue` renders the label as `<i18n-t>` with the number supplied by an **empty span filled by a CSS counter** — deliberately, per its own comment, "so it renumbers on a close-induced reflow with no Vue render". The consequence: `document.querySelectorAll('.tab-label')` returns **`["Board","Board","Board", …]` × 92**. The number is absent from the DOM text, from the accessibility tree, from find-in-page, and from copy-paste. A screen reader announces 92 identical tabs.

It is also *positional*, not identity: closing board 5 renumbers 6–92, so "Board 42" does not name the same thing across a close. And loading `30996072.sgf` (a real game, `yj9831 vs ismcts`) leaves the tab reading "Board" — the tab never takes the content's name, which every exemplar and every browser does.

**Rules.** C20 (no accessible name), Rule 1. **Screenshot** `adr19-audit-25-tabrail-zoom.png`.

**Shortest honest fix.** Render the game name (falling back to a stable board id, not an ordinal). If the counter's render cost is genuinely load-bearing, keep the visual counter and add an `aria-label` carrying the real name.

---

### S12 — MEDIUM. Meaning carried by hue alone, in two places

- **Review lifecycle on tab thumbs.** `reviewState` ∈ `ACTIVE | INTERMISSION | COMPLETE` maps to three classes whose only declarations are `border-color: var(--review-*)` (plus `border-width: 3px` when also active). No glyph, no label, no shape. `BoardTab.vue:~285-293`.
- **Sibling variations on the board.** `boardVariations` defaults to `'circles'` — per `schema.ts`'s own text, "each sibling variation = colored stroke-only ring, cycling through a small palette of distinct hues". Variation identity is hue and nothing else. Confirmed live: `boardVariations = circles` at `adr19-audit-01-boot-light.png`.

**Rule.** C18 — "every such distinction has a redundant non-color channel."

**Shortest honest fix.** The variations fix is free: a `'letters'` mode already exists and adds the redundant channel — make it the default. For review state, add the glyph the status component should have been enforcing.

---

### S13 — MEDIUM. Dark theme leaks unstyled system buttons

`.toolbar-btn-sm` (`shared-chrome.css:70`) sets `border` and `color` but **no `background`**, so it inherits Chromium's `ButtonFace` = `rgb(239,239,239)`. In the dark theme this puts a near-white box behind:

| element | measured |
|---|---|
| **SAVE** (Saved Analyses) | `#aaa` on `#efefef` — **2.02:1** |
| **PURGE** (destructive) | `#f04a4a` on `#efefef` — **3.16:1** |

Visible in `adr19-audit-42-dark-analysis-zoom.png`. **C19 + C22** (a control instantiated outside the sanctioned set inherits the platform's constants instead of the theme's).

**Shortest honest fix.** One declaration: `background: var(--surface-3)` on `.toolbar-btn-sm`.

---

### S14 — LOW. Raw literals and hand-rolled controls where a sanctioned set exists

- **17 native `prompt()` / `confirm()` / `alert()` call sites**, including **6 `prompt()` used for naming things** — deck name, palette name, chart name, symbol name, parameter name, bookmark name (`CardSetEditor.vue:77`, `PaletteEditor.vue:63,79,265,282`, `QeuboBookmarks.vue:61,78`). Browser prompts are unstyled, unthemed, unvalidated, not keyboard-configurable, and lose input on Escape (C16). The app ships **seven** modal components; none is used for these.
- `alert(t('mint.alert.failed', …))` (`MintCardModal.vue:287`) — an error with no location, no remediation, no next action. **C8.**
- **7 separate `.modal-backdrop` CSS blocks**, one per modal file.
- **122 raw hex literals** in `src/components` + `style.css` + `shared-chrome.css`, against **19** documented `theme-exception` markers. Roughly 100 undeclared.

**Rule.** C22 — and note C22's own argument for why this matters here: the sanctioned component set is the surface on which C8/C10/C18 become enforceable *once* rather than per-widget. Every one of those is currently per-widget, which is why S5, S6 and S12 are each seven or ninety-two instances instead of one.

---

### S15 — LOW. A 503 on every single load, surfaced nowhere

`GET http://192.168.122.68:8764/qeubo/experiment/status` returns **503** on every cold load, in all 12 loads I instrumented. Checked whether the user learns of it: `logPanelPresent: false, toast: false, bodyHasError: false`. It reaches the console and nothing else. **C23** — "failures are loud at the surface the operator watches, not only in a log they are not."

---

### S16 — LOW. Shipped tombstone text

> **Move Filter** — "Moved to Other tab → Knob Registry. A toolbar quick-access surface will replace both eventually."

A production section header whose entire content is a note about where it went and a promise about the future. No exemplar ships a signpost where a control used to be. (`adr19-audit-20-analysis-panel-zoom.png`; the root duplication is S3.)

---

### S17 — LOW. An association rendered as free text over raw primary keys

Cards tab → **CONTEXT IDS**: a single text input containing `1062, 1032, 1051, 1066, 1034, 1035, 1057, 10…`. **Rule 4**, which names this exact pair of defects in one sentence: "an association renders as a selection over the entities it joins, **never as free text**; ... storage artifacts ... are owed no surface at all." These are opaque database integers typed by hand. `schema.ts` documents it as intended: "Edited via a simple comma-separated text input in the Cards tab."

**Screenshot** `adr19-audit-50-cards-zoom.png`. **Fix:** a multi-select over the named entities.

---

## What is actually fine

Listed so the grumpiness above is calibrated. These I looked at and found no defect worth filing.

- **Engine connect is exemplary.** Clicked Connect: `Engine: Offline` → `Engine: Connected` in **138 ms**, the button relabels `Connect` → `Disconnect`, and a metrics cluster (`VERSION v1.17.1 / MODEL 14 / WINRATE / LEAD / PPS / LATENCY`) appears. Feedback well inside C26's 1 s band; the state is carried by a **text label**, not a hue (C18 pass); and it is a real state machine, not an icon toggle. `adr19-audit-60-after-connect.png`.
- **The engine metrics do C6 correctly** — `WINRATE —`, `LEAD —` render an em-dash for no-data-yet rather than `0`. This is precisely the discrimination the Analysis charts (S8) fail to make, in the same panel, 400 px away. The knowledge is in the building.
- **The Cards tab has a real empty state** — "Run a deck to populate the view." C6 pass, and the pattern S8 should copy.
- **The board itself is genre-correct and good.** 19×19, coordinates on all four edges, star points, last-move marker, wood texture, correct stone rendering at 2128 px. `adr19-audit-13-analysis.png`.
- **The status bar is genre-conventional and compact** — MOVE badge, both players with colour discs and names, ruleset, komi editable inline, prisoner counts. `adr19-audit-23-statusbar-zoom.png`.
- **PURGE is confirmed** (`AnalysisControls.vue:209`). It uses `window.confirm` rather than the app's own modals (S14), but C10 is satisfied in substance: a destructive action is guarded.
- **The dark theme's chrome is coherent** and reads as a real analysis client. 21/91 contrast failures vs light's 66/116, and all 21 trace to two token values rather than scattered widget decisions — a genuinely cheap fix. `adr19-audit-41-dark-analysis.png`.
- **The tab-rail virtualisation works.** 45 rows rendered against 92 boards, scroll and hit-testing intact. The recent perf work did what it claimed; the tab-rail defects above (S6, S11) predate it and are not virtualisation regressions.
- **No focus trap.** I suspected one in the tab rail and disproved it — traversal escapes at stop 75.
- **Settings sub-tabs are not duplicate homes.** I suspected Session (UI) ⊂ Advanced Registry and disproved it — leaf overlap 0, branch overlap 0.

---

## Methodology, limitations, and hygiene

**Driving.** `playwright-core` 1.60.0 (frontend devDep) + `/usr/bin/chromium`, headless, viewport 3840×2160 @ `deviceScaleFactor: 1`, against the running `vite preview` on :4173 (a **production** build — `import.meta.env.DEV` false, so no `window.store`/`__perfScenario`; everything below was driven through the real UI or read from source).

**Contrast method.** Ratios are computed, not eyeballed: for each element with direct text children, resolve `color`, walk ancestors for the first background with `alpha ≥ 0.99`, alpha-composite the foreground over it, and apply the WCAG relative-luminance formula. Threshold selected per element (3:1 for ≥24 px, or ≥18.66 px at weight ≥700; else 4.5:1). Elements hidden or below 5% opacity excluded.

**Disclosed weakness — fixed sleeps.** The exploratory capture scripts (`s1`–`s17`) used `waitForTimeout` after navigation and tab clicks. That is a Playwright anti-pattern and the owner is right to object: a fixed sleep can make an "empty" surface an artifact of measuring too early. Two consequences, both handled:

1. **S8 (empty charts) was the finding at risk**, so it was re-run under deterministic waits only — element-count predicates plus a canvas-byte-stability predicate across two `requestAnimationFrame`s. It held. That re-verification is the evidence cited in S8; the earlier sleep-based capture is not.
2. **S1 was *found* by that weakness.** The 37-board reads were initially indistinguishable from "measured too early" — and that is exactly what they were, except that the window is user-visible and unmarked, which is the defect. It was then established by a falsifiable test (route-gating the workspace GET), not by a sleep.

All post-hoc verification and all cleanup used predicate waits (`waitForSelector`, `waitForFunction`, `waitForResponse`) only.

**Hygiene.**
- **Theme:** flipped `appearance.theme` to `dark` for the dark-theme pass and restored to `cluster`. Verified from a fresh context: `data-theme = cluster`, registry `theme = "cluster"`.
- **Engine:** connected once for the C26 test and disconnected; engine state back to `Offline`. `engine.katago.url` was **never written** — verified still `ws://127.0.0.1:1235`, the value found on first read. (Note for the record: a pre-hydration read once showed `ws://127.0.0.1:41948`; that is S1, not a settings change.)
- **Boards:** I created 6 boards by loading `30996072.sgf`. All 6 closed. The first cleanup attempt appeared to succeed and then reverted (98 → 92 → 98) — that is S1's neighbourhood, and it is why the second attempt waits for the workspace GET before acting and for a **200 PUT** before exiting. Final verified state from a fresh, fully-hydrated context: **92 boards**. Boards created by earlier sessions were not touched.
- **No source file was modified.**

**Not covered.** Library tab and Other tab were captured (`adr19-audit-51-library-zoom.png`, `adr19-audit-52-other-zoom.png`) but not audited in depth. Charts were never exercised with real analysis data — S8 concerns the pre-analysis state only; a populated chart pass (ADR-0010 render-locality, series colour, C18 over series hue) is not done and should be its own dispatch. C27 (auto-refresh vs interaction) and C28 (alarm prioritisation) were not exercised.
