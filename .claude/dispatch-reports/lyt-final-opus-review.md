# Final full-surface review of the LengYue SPA — diagnosis before go/no-go

**Reviewer:** fresh-context Opus session, refute posture.
**Date:** 2026-08-13.
**Law read end to end before any claim below:** `docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`, `docs/adr-synopsis.md`, `docs/adr/0019-appendix-ui-proscriptions.md` (the consolidated UI proscription set C1–C29, cited by rule id throughout), `FEATURES.md`, the umbrella `CLAUDE.md`. Rule ids of the form **C\<n\>** below are that appendix's; ADR-0000 Rule 2(a)/2(b) are the two questions this report is organised around.

**Rig (live, interactive, torn down).** Own backend on port 19100 from a copy of `backend/samples/cards.sample.db` at `/tmp/lytrig/cards.db` (7 829 cards, 4 139 game sources under `local_user`); own Vite dev server on port 19200 with `VITE_API_BASE_URL=http://127.0.0.1:19100` and `VITE_KATAGO_WS_URL=ws://192.168.122.68:1235` supplied as process environment so the repository's `.env.local` was never edited. Both ports probed free before use and probed dead after teardown. A second user (`reviewer`) was registered through `/auth/register` and the data-bearing user `local_user` was signed in for the substantive work. The engine was connected for real to `ws://192.168.122.68:1235`; the proxy answered `query_version` with `version 1.17.1` and capabilities `delta_analysis / adaptive_reevaluate{learned_v1} / transposition / selector`, and `query_models` with five labelled models of which `14` and `b11c768h12nbt3tflrs` were healthy. Analysis states were driven to completion: a live ponder produced `EVAL 73.1%/+14.0` with twenty-three suggestion elements on the board, and a ninety-five-node range analysis populated every chart panel. The browser was a single `playwright-core` instance driving `/usr/bin/chromium` through a wrapper that execs `systemd-run --user --scope -p MemoryMax=4G nice -n 19`, with `--js-flags=--max-old-space-size=1024`, closed in a `finally` block. No wall-clock sleep was used anywhere; every wait is a DOM or network condition. Ports 8764, 4173, 5173 and 5174 and their processes were never touched.

**Evidence.** Ninety-one screenshots were captured at `/tmp/lytrig/shots/`. The fourteen load-bearing ones are copied to `.claude/dispatch-reports/lyt-final-opus-review-evidence/` and are referenced below by bare filename. Mechanical DOM audits (viewport escape, non-scrolling clip, pointer-event occlusion by `elementFromPoint`, sub-minimum target size) were run at every state and their raw output is quoted where it carries a finding.

---

## 1. Verdict on overall state

The application is not a collection of bugs; it is a coherent product whose spatial layer never acquired a type. Every substantive capability the tour claims is really there and really works — the board renders correctly at every geometry, the rule engine is sound, the engine connection negotiates capabilities properly, live analysis produces correct suggestion overlays and ownership marks, the ninety-five-node range analysis populated the interval summary, game-state, delta and distribution panels with real numbers, the deck pipelines resolve, the wizard walks its seven steps, the modals open and validate. The domain work is done and it is good work.

What is broken is one thing, expressed in eight or nine registers: **the application has no owner of space.** Width and height are handed out by a compiler that does not know how much space each region's content actually needs; regions do not bound their own content, so overflow escapes upward through an unbroken chain of `overflow: visible` and is silently amputated at a single `overflow: hidden` on `#main-area`; fixed overlays position themselves independently in the same corner and eat each other's controls; and the layout is not a pure function of the window — resizing degrades it monotonically and never recovers. The consequences are not cosmetic. At 1920×1080 — the most common desktop resolution there is — the application's primary study surface (the control panel hosting Library, Cards, Settings, Analysis and Other) is *not present in the layout at all*, demoted for lack of width, while a game-tree panel whose content is sixty pixels wide is holding six hundred and thirteen pixels of that width. In the same default layout, eight interactive Settings controls sit below the bottom of the window and cannot be scrolled to. After a user resizes their window twice, the Go board — the reason the software exists — occupies four percent of the screen and will not grow back.

A demanding user's honest first-hour experience is therefore: *the app looks empty, most of it is missing, and resizing my window breaks it.* That is a fatal first impression sitting on top of a genuinely accomplished piece of engineering. It is also, and this is the substance of my recommendation, **one cure away from being fixed**, because the classes below have a single deeper cause and the type that forecloses it is not exotic.

I would not shut this project down. I would refuse to ship it until the space-ownership type exists, and I would treat every finding in classes 1 through 4 and 8 as a single work item rather than five.

---

## 2. The disease classes, ranked by product damage

### Class 1 — Slack is given to the claimant that cannot use it; an allotment is never joined to its content's natural measure

**Mechanism.** The LYT compiler assigns each region a rectangle from the compiled screen-class program. A region's rendered content and the number the solver hands it are two facts that are never related to one another by any type. There is no `minContent`, no `preferredContent`, and — the decisive omission — no `maxUsefulContent`. So a region that can only ever use sixty pixels of width is a legitimate recipient of seven hundred, and a region that needs six hundred is legitimately given zero and marked "demoted".

**Witnessed instances.**

- Width sweep at height 1000, fresh boot at each width (raw output, scenario `s12`): at 1280 the tree panel is 440 px wide and the control panel is absent; at 1600, 511 px and absent; at 1800, 575 px and absent; at 1920, **613 px and absent**; at 2200, 703 px and absent. At 2560 the tree panel snaps to 150 px and the control panel finally appears. The tree's own content across all of these is a single column of nodes measuring 60 px (`treeSvg` width 60 in the same probe). Evidence: `02-workspace-1920.png`, `03-boot-1366x768.png`, `13-2560x1000.png`.
- The corner presence menu states the demotion in words. At 1920×1080 the Control Panel row reads: *"Control Panel — Not enough width right now — reachable via the summon button"*, with the checkbox still checked. Evidence: `11-presence-1920x1080.png`.
- The demotion is not a small-screen phenomenon. At **2560×1440**, after enabling two auxiliary panels (Setup Tools and Preview Board, each a small fixed strip), the control panel is demoted with the identical "Not enough width right now" hint — in a window 2560 px wide, where the tree panel holds 306 px for its 60 px of content, the preview board holds a 160 px square, and roughly 350 px on the right edge is unallocated black. Evidence: `25-setup-open.png`.
- The board column is subject to the same failure in the other direction: at 2560×1000 the board column is ~1180 px wide and the board renders at ~700 px, leaving ~480 px of empty column that no other region can claim.
- The toolbar row is the failure at the leaf scale, and the codebase has already written it down. `frontend/src/components/chrome/ToolbarEngineMetrics.vue`'s header records a live-engine measurement finding that the `eval` and `health` leaves' natural content needs 534 px and 236 px against a **139 px** allotment, "confirmed both by DOM geometry and screenshot as CHARACTER-LEVEL text overlap", and states that the corrective applied was realization-only — the model-level question of an authored width floor is "a separate, filed open design item … NOT touched here". That filed item is this class.

**Extent estimate.** Every node under `workspace.tree-control-row` and `workspace.toolbar-row` (205 census nodes) is governed by an allotment decided this way, as is `workspace.board-column` and `workspace.board-rail`. `corner-chrome.control-panel-summon` exists only because of this class. The class also reaches `wizard.step-demo-board` (which mounts the real BoardWidget into a modal-sized box) and every chart panel under `analysis.dashboard`, where ECharts logged `Can't get DOM width or height … should not be 0` during the live analysis run — a chart initialised into a box of zero extent is the same missing join at the smallest scale.

**ADR-0000 shape.** The type that would have made this class unrepresentable is a region layout contract whose construction *requires* the region to supply its own measure. Today a region is a name and the solver's output is a number; the join between them exists only in a human's head. Concretely: no `Measured<Region>` type, so `allot(region, px)` type-checks for every px.

**Generic cure (one seam).** Make natural measure a mandatory field of the layout contract, and make the solver's output a proof rather than a number. A region is constructible only as `Measured<R> = { min: Px, preferred: Px, maxUseful: Px, ... }`, supplied by the region's own component (measured once, not guessed — the toolbar-metrics header shows the project already knows how to measure honestly). The solver's return type becomes `FeasibleLayout` whose sole constructor validates two invariants over the whole assignment: no region receives more than `maxUseful` while any region sits below its `min`, and every region's allotment lies in `[min, ∞)`. A geometry that cannot satisfy both is *refused loudly* (ADR-0002) and the refusal names which region starved and which region was hoarding — which is exactly the diagnostic the presence menu is currently guessing at when it says "not enough width right now". This one type kills the empty tree panel, the demoted control panel, the 139 px engine leaves, and the zero-extent chart containers, without a single per-site patch.

---

### Class 2 — Containers do not bound their content; overflow escapes to a single global clip and silently deletes controls

**Mechanism.** In the SPA's live DOM, the chain from a leaf control up to the document root is `overflow: visible` at every level until `#main-area`, which is `overflow: hidden`. Nothing in between owns a scroll port. Content larger than its allotment therefore does not scroll, does not push, and does not warn — it simply passes through every ancestor and is cut off at the app root. The user sees a panel that appears to end.

**Witnessed instances.** All four are mechanical DOM measurements, not visual impressions.

- **Settings tab at 1920×1080, default (post-reset) layout.** Eight interactive controls are laid out below the viewport: three checkboxes at y 1091, 1113, 1135; a `select.scalar-input` (`off / deltaVisits / perPlayer`) at y 1225–1247; a `.scalar-input` at 1250–1272; a checkbox at 1277; a `restore-btn ↺` at 1297–1321; a `.scalar-input` at 1300–1322. `#main-area` reports `scrollHeight 1338 / clientHeight 1080` with `overflow-y: hidden`. The full ancestor chain was dumped (`s17`): `registry-container` is `overflow-y: auto` but has `scrollHeight === clientHeight` so it does not scroll, and every ancestor above it — `tab-padding`, `tab-pane`, `tab-body`, `vue-tabs`, `lyt-leaf-cell`, `lyt-node`, `control-panel`, `tree-control-wrapper`, `split-workspace`, `main-workspace` — is `overflow-y: visible`. Mouse-wheel over the panel and pressing `End` moved nothing: the count of below-viewport controls was 8 before and 8 after both attempts. These controls are permanently unreachable.
- **Control-panel popover in portrait, both geometries.** At 480×900 and at 1080×1920, ten interactive controls sit below the viewport bottom — four knob sliders, two numeric inputs, `RESET TO DEFAULTS`, the expression `textarea`, `CLEAR OVERRIDES`, and `+ NEW FROM CURRENT` (at 1080×1920 the last is at y 2543–2570 against a 1920 px viewport). Evidence: `24-portrait-480x900-cp-popover.png`, where the "Mistake-finder threshold" row is visibly sliced through by the bottom edge.
- **The setup wizard's centrepiece step at 480×900.** The wizard modal's own box is `[19, 54, 460, 846]`, yet its content escapes it: a knob slider at y 938, the PV-animation mode `select` at y 1051–1085, and the PV-annotation `select` at y 1155–1189. Three hundred and forty-three pixels of the step FEATURES.md calls the centrepiece are outside both the modal and the window. Evidence: `33-wizard-480x900-4.png`.
- **A five-pixel horizontal escape at every geometry, thirty at narrow ones.** `#main-area` reports `scrollWidth` exceeding `clientWidth` by 5 px at 1920, 1080 and 480, and by **30 px** at 1366, 1024 and 900. At 1366×768 the culprit is identified: the four engine toolbar strips are laid out at x 925 (w 185), 1114 (w 139), 1257 (w 139) and **1400 (w 0)** — the third strip's right edge is 1396 against a 1366 viewport, and the fourth strip, `workspace.toolbar-row.engine-queue`, has been squeezed to zero width and pushed entirely off-screen. The census names the queue badge, its in-flight query table and its per-row cancel buttons as operable; below 1400 px of window they do not exist.

**Extent estimate.** Universal. Every leaf of `workspace.tree-control-row.control-panel` (156 census nodes), every panel reachable through `corner-chrome.control-panel-summon`, the whole `wizard` subtree (34 nodes) at small geometries, and `workspace.toolbar-row`'s four engine leaves. Any future panel inherits the defect by default, because the default is `visible`.

**ADR-0000 shape.** "A region either fits its content or owns a scroll port" is stated nowhere as a type — it is a per-file CSS decision, and the safe value is not the default. The tell is that `.lyt-leaf-cell` — the *same component class* — was measured `overflow-y: auto` under the Other tab and `overflow-y: visible` under the Settings tab in the same session.

**Generic cure (one seam).** Give the LYT leaf cell an overflow discipline as a required construction parameter with no permissive default: `OverflowDiscipline = Fit | Scroll`. A `Fit` leaf asserts at mount that `scrollHeight <= clientHeight && scrollWidth <= clientWidth` and fails loudly when it does not (ADR-0002's construction-time surface, ADR-0019 C23's no-swallow floor); a `Scroll` leaf has the scroll port attached by the renderer, not by the panel author. `visible` ceases to be constructible for a leaf. `#main-area`'s `overflow: hidden` then becomes a backstop that should never fire, and a test can assert it never does. This is one edit at one component boundary and it closes the Settings amputation, the portrait popover amputation, the wizard escape, the toolbar escape and the Browse list of Class 9 simultaneously.

---

### Class 3 — Layout is not a pure function of geometry; resize is lossy and the boot path and the resize path disagree

**Mechanism.** The layout the user sees depends on the path taken to the current window size, not only on the size. Recomputation appears to fold the previous layout into the new one rather than deriving a fresh assignment from `(screen class, viewport, user overrides)`.

**Witnessed instances.** A single browser session was resized through 1920×1080 → 480×900 → 2560×1440 → 1024×768 → 1080×1920 → 1366×768 → 900×600 → 1920×1080 with no reload, waiting on a two-frame settle at each step (`s34`).

- **1366×768 reached by resizing** renders the board as a 268 px square in the bottom-left corner of the window, with roughly 580 px on the right edge entirely empty and the status bar truncated to `Black vs ● | Pass | B: 0` — the ruleset select, komi input, capture counts and user badge all gone. A **fresh boot** at the identical 1366×768 renders a ~700 px board with a complete status bar. Same geometry, two different layouts. Evidence: `34-resized-1366x768.png` against `03-boot-1366x768.png`.
- **Returning to 1920×1080** does not restore anything. The board renders at 735 px inside a 767 px column with ~120 px of dead space above and ~180 px below, the tree panel holds 480 px of black, and a 670 px strip on the right edge is empty. A fresh boot at 1920×1080 gives the board 1106 px. Evidence: `34-resized-1920x1080.png` against `02-workspace-1920.png`.
- The disagreement runs both ways, which is what makes it a purity failure rather than a "resize is worse" failure: the *resized-into* 1366×768 has **no** 30 px horizontal escape and **no** SLIDERS/locale occlusion, while the *freshly booted* 1366×768 has both.

**Extent estimate.** The entire `workspace` subtree (236 census nodes) plus the portrait/landscape screen-class swap. Any user who resizes, maximises, un-maximises, docks a window, or connects an external monitor is in this state, and the state is persisted, so it survives into the next session.

**ADR-0000 shape.** The compiled layout is being treated as mutable state with more than one writer (the compiler, the resize observer, the persisted override) rather than as a derived value with exactly one home (ADR-0012 P1). A pure function has an idempotence property that is mechanically checkable; a mutated cache does not.

**Generic cure.** Make `layout : ScreenClass × Viewport × UserOverrides → FeasibleLayout` a pure function with no in-place mutation of the previous result, and add one property-level gate to CI: for a set of geometries and a set of traversal orders between them, the resulting `FeasibleLayout` must be equal regardless of path. This is a single equality assertion over the type Class 1 introduces, which is why Class 1 must land first. It also makes the "Default layout" button honest by construction — resetting overrides and recomputing is then *definitionally* the same thing as booting fresh, which is what FEATURES.md already promises.

---

### Class 4 — Fixed overlays contend for one corner with no arbitration, and one overlay swallows another's controls

**Mechanism.** The bottom-right corner hosts, independently and each with its own `position: fixed` placement, the presence menu, the system-log panel, the system-log toggle, the debug pill, the board-rail popover trigger and the control-panel summon trigger. No single owner lays them out together, so their rectangles are free to intersect, and the later one in paint order takes the pointer events.

**Witnessed instances.**

- With `session.ui.systemLogExpanded = true` — a first-class, documented, persisted user setting — the system-log panel covers the lower portion of the presence popover. The DOM audit reports both `select#lyt-presence-popover-rail-style` and `button.lyt-presence-reset-layout` ("Default layout") as occluded, with `elementFromPoint` returning `div.message-row.msg-info`. Reproduced at 1920×1080, 1366×768 and 1024×768. Evidence: `11-presence-1920x1080.png`, where the "Board Rail style" select and the "Default layout" button are visibly buried under the SYSTEM DIAGNOSTICS panel.
- This is not a near-miss; the controls are genuinely inoperable. Playwright's own actionability engine timed out attempting to click `.lyt-presence-reset-layout` and named the interceptor in its log: *"`<div class="message-row msg-info">` from `<div id="lyt-overlay-stack">` subtree intercepts pointer events"*. It succeeded immediately after the log panel was collapsed. Reproduced three times across separate scenarios.
- FEATURES.md's claim for this layer is *"renders in a fixed overlay layer anchored above the corner presence menu … The layer contributes no layout cost and is verified never to overlap the board."* The verification covers the board and nothing else; the layer overlaps the chrome it is anchored above.

**Extent estimate.** All nineteen `corner-chrome` nodes and all ten `overlay-stack` nodes, plus `modals` insofar as the same absence of a stacking authority governs them (the modal backdrop correctly occludes everything, so modals are currently accidental winners rather than principled ones).

**ADR-0000 shape.** The corner is a contested slot with several independent writers and no owner — ADR-0012 P1's one-home-per-fact violated at the level of screen real estate. A z-index is not an arbitration; it is a per-site guess.

**Generic cure.** One `CornerStack` owner that receives every corner surface as a declared entry (anchor, order, and whether it reserves space or floats) and lays them all out in a single flow, so two surfaces cannot occupy the same rectangle by construction. Under Class 1's cure this is the same type applied to fixed surfaces: fixed overlays become regions with a measure and an allotment like everything else, which is why Classes 1 and 4 should be fixed by one piece of work rather than two.

---

### Class 5 — A real capability with no visible affordance, and refusals that return `null` into the void

**Mechanism.** Continuous analysis — the feature the product exists to deliver — has exactly one trigger in the entire application: the spacebar. There is no button, no menu item and no toolbar control that starts it. Every guard on the path from that keystroke to a wire query returns `null` or bare-`return`s with no user-visible message, and every call site discards the return value.

**Witnessed instances.**

- Connecting the engine and navigating moves produces no analysis. The websocket frames sent to `ws://192.168.122.68:1235` over a full session were: one `query_version`, one `query_models`, then `query_version` watchdog polls every five seconds and nothing else. The board sat at move 95 with a connected engine and an empty `EVAL —/—`, `HEALTH 0pps`, `QUEUE 0`.
- Pressing the spacebar with the board focused immediately produced a real ponder query (`{"id":"ponder-601f9abe-…","moves":[["B","Q16"],…]}`), and within seconds `EVAL 73.1%/+14.0`, `QUEUE 1`, and twenty-three suggestion elements with winrates and score deltas painted on the board. Evidence: `15-ponder-analysis.png`. The feature is excellent; it is simply unreachable by anyone who has not read the keybindings list.
- FEATURES.md line 107 states *"When the engine is connected, the active board is continuously analysed."* That is false as shipped.
- The guard chain was traced in source and is uniformly silent. `analysis-service.ts` returns `null` at lines 927 and 942 and at 661–662 with no message; `useFollowMePonder.ts:88` re-issues a ponder only `if (analysisService.isPondering(curr.id))` and otherwise returns silently, which is precisely the observed symptom; `useUserIORegistry.ts:161` runs `preventDefault()` and *then* checks `enabledWhen()`, so pressing space while disconnected consumes the key and does nothing visible; `useAnalysisTimeline.ts:126` silently drops a zero-width selection. The contrast within the same file is the tell: `clearCache`, `warnIfMidTreeSetupDropped` and the delta-analysis refusal in `analysis-service.ts` all push user-visible system messages. The analyze path is the odd one out. Every caller (`keybindings-catalog.ts:248`, `useFollowMePonder.ts:89`, `useAnalysisTimeline.ts:130`) discards the `QueryId | null` it is handed.

**Extent estimate.** The whole `workspace.toolbar-row.engine-*` cluster and everything downstream of it — the board's five analysis overlays, all fourteen chart panels under `analysis.dashboard`, the review-session grading path, and `modals.learn-path`, which the modal text itself says "requires an engine connection". The silent-`null` half of the class is wider than analysis: it is the shape of every guard in `useUserIORegistry`.

**ADR-0000 shape.** Two joined omissions. First, a domain verb is representable with no surface — the keybindings catalog entry carries a key and a handler but no obligation to render an affordance, so "spacebar-only" is a constructible state. Second, `T | null` as a refusal type permits the caller to drop the refusal, which is the ADR-0002 silent failure written into a signature (ADR-0012 P8: the typed signature is the contract, and this one says the failure is optional to notice).

**Generic cure.** Make the verb catalog entry's type require a `surface` — a registered, rendered affordance — so a verb with no visible control cannot be constructed, and let the chrome render the catalog rather than hand-authoring buttons that happen to duplicate keybindings. Then change every analysis entry point from `QueryId | null` to `Result<QueryId, Refusal>` where `Refusal` carries ADR-0019 C8's required fields (`location`, `message`, `remediation`, `nextAction`) and cannot be constructed without them, and add the discard lint so a dropped `Result` fails the build. One type change at the service boundary makes every one of these guards audible, and the surface field makes every capability findable.

---

### Class 6 — Readouts that collapse "no data", "zero" and "stale" into one rendering

**Mechanism.** Some readouts discriminate their states and some do not, and there is no shared metric type forcing the discrimination.

**Witnessed instances.** `HEALTH` displayed `0pps` and, in its hover popover, `LATENCY 0ms` at every point of the session: before connecting, while connected and idle, during a live ponder that was demonstrably producing packets, and after a ninety-five-node range analysis completed successfully. `EVAL`, by contrast, correctly showed `—/—` when it had nothing and `73.8%/+14.6` when it did; the chart panels correctly showed "no data" and then real series. So the codebase knows how to do this — it did not generalise it. No readout anywhere in the toolbar carries an as-of time or a stale rendering.

**Extent estimate.** `workspace.toolbar-row.engine-health` (pps, latency, watchdog dot), `engine-queue.badge`, the analysis persistence summary (`Not saved` versus a genuine zero-record bundle), the Browse aggregate counts, and any future telemetry readout.

**ADR-0000 shape.** ADR-0019 C6 and C7 name the exact missing types: a discriminated `RemoteData<T> = Loading | Error | Empty | Loaded<T>` with an exhaustiveness check, and a metric component whose props *require* a non-optional `asOf` plus a staleness policy. Neither exists, so "render the number 0" type-checks for a value that was never received.

**Generic cure.** One shared metric component that cannot be instantiated without `asOf` and a `RemoteData` payload, with the stale rendering a pure function of `asOf` versus now. Every readout routes through it. This is C7's stated construction-time surface and it is cheap because the readouts are few and structurally identical.

---

### Class 7 — Visual constants and controls instantiated outside a sanctioned set, so contrast and focus fail per-site

**Mechanism.** Native form controls and buttons are styled ad hoc rather than through one component set, so a control that misses one declaration inherits a user-agent default that fights the theme.

**Witnessed instances (computed styles, measured contrast ratios).**

- `#analysis-palette-select` — the Analysis tab's palette picker, a control the study workflow depends on — renders `color: rgb(255,255,255)` on `background-color: rgb(239,239,239)`, a measured contrast ratio of **1.15 : 1**. The text is invisible. Evidence: `28-analysis-Basic.png`, where the palette control is a blank white bar. The status bar's `.rules-select` — the same native element in the same role — is correctly themed at `rgb(255,255,255)` on `rgb(26,26,26)`, 17.4 : 1. ADR-0019 C19 sets the floor at 4.5 : 1.
- The focus indicator is invisible on the majority of buttons. Tabbing through the first twenty-five stops, every `button.toolbar-btn`, `.pass-btn`, `.move-numbers-btn`, `.sliders-trigger` and `.locale-trigger` reports `outline: auto 1px rgb(16,16,16)` against a `rgb(26,26,26)` surface — roughly 1.05 : 1 — while `select`, `input`, `.user-badge` and the tab `li` elements get a clearly visible `solid 2px rgb(74,174,240)`. ADR-0019 C17 requires a visible focus indicator on every actionable control.
- A long tail of sub-minimum pointer targets against C21's 24×24 baseline, present at every geometry: `.user-badge` 96×13, `.komi-input` 42×12, `.rules-select` 79×14, `.pass-btn` 40×18 (36×18 at ≤1024), `.eval-summary` 50×15, `.health-summary` 81×15, `.tab-add-btn` 20×20, `.uri-display` 183×17, `.locale-trigger` 78×18, and the move-navigation `<` / `>` buttons at 16×24 below 1366. Forty-five such targets were counted at 2560×1440 with the control panel open.

**Extent estimate.** Every `[control]` node in the census — 130-odd — is a candidate, and the counts above show the failures are spread across `board-column.status-bar`, `toolbar-row.app-cluster`, `control-panel.analysis` and `control-panel.settings` rather than concentrated.

**ADR-0000 shape.** ADR-0019 C22 exactly: visual constants and control instantiations are not routed through a sanctioned token and component set, so each site can omit a declaration independently. C22 also names why this matters structurally — the sanctioned components are the surface on which C10, C17, C18, C19 and C21 become enforceable *once* instead of per widget.

**Generic cure.** One `AppSelect` / `AppButton` / `AppInput` set carrying background, foreground, focus ring and minimum hit area, plus the stylelint gate C22 specifies banning raw control instantiation and raw hex outside tokens. The palette select, the focus rings and most of the target-size tail are then one fix, not forty-five.

---

### Class 8 — Like surfaces behave unlike, because each site decides its own interaction contract

**Mechanism.** Dismissal, presence and scroll semantics are authored per component instead of owned by a primitive, so surfaces that a user reads as the same kind of thing behave differently.

**Witnessed instances.**

- **Escape.** It dismisses the mint-card, play-vs-engine and engine-match modals. It does **not** dismiss the learn-path modal. It does **not** close the control-panel popover at 480×900 or at 1080×1920 — and FEATURES.md explicitly promises that it does: *"closing the popover (the same button, a click outside it, or Escape)"*.
- **Markup contract.** The login modal renders as `modal-card`; every other modal renders as `modal-content` inside `modal-backdrop`. Two dialog implementations for one concept.
- **Scroll ownership.** `.lyt-leaf-cell` — one component class — was measured `overflow-y: auto` under the Other tab and `overflow-y: visible` under the Settings tab in the same session, which is the immediate cause of the Settings amputation in Class 2.
- **Overlapping siblings in a list.** The board-rail tab `button.tab-thumb "Board"` is reported occluded by `button.tab-add-btn "+"` at 480×900 and at 1080×1920, in every portrait boot. Evidence: `03-boot-480x900.png`, where the tab label is not visible at all and only the `+` is.
- **Naming.** After adding a second board, both rail tabs render their label as the bare string `Board ` with no ordinal, where a single board renders `Board 1`.

**Extent estimate.** All eleven modals (64 census nodes), all six popovers (`sliders`, `pbo`, `engine-eval`, `engine-health`, `engine-queue`, `control-panel-summon`, `board-rail-trigger`), and every leaf cell.

**ADR-0000 shape.** There is no dialog/popover primitive owning the open-close-Escape-outside-click-focus-trap contract, so the contract is re-derived per site and diverges. ADR-0019 C17's focus-trap and dismissal requirements are review-only here because there is no single construct to gate.

**Generic cure.** One overlay primitive that owns open state, Escape, outside-click, focus trap and restore, and one leaf-cell type that owns scroll (the Class 2 cure). Every modal and popover is constructed through it; a bespoke one is not constructible.

---

### Class 9 — Unbounded rendering and unbounded reads on the study path, after the codebase already paid to learn the lesson

**Mechanism.** A list whose length scales with the user's data is rendered as one DOM node per row with no virtualisation and no scroll port, and the backend query behind it returns the whole corpus in one response.

**Witnessed instances.**

- `GET /stats/forests` against the shipped sample database returns **847 876 bytes in 13.83 seconds** (measured directly with `curl`, HTTP 200). The Cards → Browse tab fires it on mount and shows a bare `Loading…` for the duration; measured in-browser, the tab took **14 725 ms** to leave that state, with no progress indication and no cancel — ADR-0019 C9 (cancellable long operations) and C26 (determinate progress past ~10 s) both unmet.
- On arrival, the navigator renders every game source. The DOM audit counted **2 797 interactive elements laid out below the viewport with no clipping or scrolling ancestor** — `button.chevron-btn` rows running from y 1466 downward against a 1440 px viewport. Roughly thirty of ~1 400 rows are reachable. Evidence: `37-browse-loaded.png`, where the list runs off the bottom edge with no scrollbar.
- The comparison is the diagnosis: FEATURES.md documents that the Library tab's table *is* virtual-scrolled and "renders at 25k+ rows without lag". The technique exists in the codebase and was not generalised to the sibling surface — which is verbatim the recurrence pattern ADR-0010 was written to arrest ("the codebase had paid to learn each once").

**Extent estimate.** `control-panel.cards.browse.nav` and its game-source and root rows, `control-panel.cards.tree-panel`'s per-root sections, the keybindings rows, the registry editors' branch trees, and `overlay-stack.system-log`'s message list.

**ADR-0000 shape.** ADR-0010's canvas/virtualisation rule is a *tenet*, not a type: nothing prevents authoring a `v-for` over an unbounded collection. And the backend contract has no page type, so "return everything" is the only constructible call.

**Generic cure.** One virtualised, scroll-owning `RowList` primitive that all row collections are constructed through (it composes with the Class 2 leaf-cell type — a `Scroll` leaf hosting a windowed list), and a paged or summary response type for `/stats/forests` such that an unpaged read is not expressible at the Port.

---

## 3. The deeper common cause, and what it implies

**Classes 1, 2, 3, 4 and 8 are one disease.** Their shared root is that *screen space in this application has no owner and no type*. Regions are given numbers unrelated to their content (1); regions do not bound what they render (2); the assignment is mutated rather than derived, so it depends on history (3); fixed surfaces bypass the assignment entirely and collide (4); and the per-surface contracts that would otherwise compensate are authored independently and diverge (8). Every one of them disappears under a single construct: **a Layout authority whose output type is a total, validated assignment of every visible surface — in-flow regions and fixed overlays alike — to a rectangle, where each surface declares its own measure and its own overflow discipline, and the assignment is a pure function of screen class, viewport and explicit user overrides.**

That is the ADR-0000 Rule 2(a) answer for the whole family, and I want to state its quantification universe explicitly, per the 2026-07-02 closure-statement amendment, because the natural instinct will be to name the class at the width of the fix already imagined:

- **Axes covered:** width and height (the Settings amputation is vertical, the toolbar escape horizontal — a width-only fix regresses on the next pass); presence/absence (demotion is an allotment of zero and must go through the same type, not a separate boolean); and path (the assignment must be recomputed, not folded, or Class 3 survives).
- **Sibling surfaces covered:** in-flow LYT regions, fixed corner overlays, modal and popover boxes (the wizard escape proves modals are in the same universe), and chart containers (the ECharts zero-extent warning is the same join missing at the leaf).
- **Denomination:** every bound is denominated in the resource that actually detonates — measured CSS pixels of the region's own rendered content, obtained by measurement as `ToolbarEngineMetrics.vue` already demonstrates, never a round literal and never a guess about "how wide a panel should be".

**Class 5 has a different root** (a capability with no affordance, and refusals typed as droppable `null`) and must be fixed independently — it is the one class where the product's core promise is simply not delivered as documented.

**Classes 6, 7 and 9 are each a missing shared primitive** — the metric component, the control set, the list. They are independent of the layout cure and of each other, and each is small.

**ADR-0000 Rule 2(b) — the operational question, aimed where the ADR aims it.** These classes are not implementer errors. Each was foreseeable and several were *already written down* — the toolbar allotment shortfall is recorded verbatim in a component header as a filed open item; ADR-0010 predicted the virtualisation recurrence; ADR-0019 C6, C7, C17, C19, C21 and C22 name six of these classes as rules. The net that failed is that all of it is review-only: there is no gate that fails a build when a region overflows its box, when a control renders below 24 px, when a `select` has no background, when a focus outline is invisible against its surface, or when a layout differs between two paths to the same geometry. ADR-0019's own roll-up claims a CI gate for C17, C19, C21 and C22 on the Vue substrate; **no such gate is in force** — every one of those four classes was found live and mechanically in an afternoon by a script of about a hundred lines. The single highest-value operational act available to this project is to run that audit script in CI. It found every finding in Classes 2, 4 and 7 without human judgment.

---

## 4. Proposed cure sequence

1. **Measured regions + feasible-layout type + overflow discipline on the leaf cell.** One work item, not three. Subsumes Class 1 and Class 2 outright, makes Class 4 a special case of the same assignment, and removes the immediate cause of half of Class 8. This is the item that decides whether the product is shippable.
2. **Purity gate on the layout function.** Closes Class 3. Only meaningful once step 1 exists, because the equality it asserts is over step 1's output type. Cheap once available: a property test over geometries × traversal paths.
3. **Ship the ADR-0019 CI gates that are claimed but absent** — axe or equivalent for C17/C19/C20/C21, stylelint for C22 — plus the layout audit used for this review (viewport escape, non-scrolling clip, `elementFromPoint` occlusion, target size) as a per-geometry smoke gate. This is the Rule 2(b) net for steps 1, 2 and 4, and it should land alongside step 1 so the fix cannot silently regress.
4. **Sanctioned control set.** Closes Class 7 and the residue of Class 8's markup divergence. Gated by step 3.
5. **Affordance-carrying verb catalog + `Result`-typed analysis refusals.** Closes Class 5. Independent of the layout work and can proceed in parallel; it is the item that makes the product's headline feature discoverable, so it should not queue behind layout.
6. **`RemoteData` + required `asOf` metric component.** Closes Class 6. Small, independent.
7. **Virtualised `RowList` primitive + paged forest-stats contract.** Closes Class 9. Composes with step 1's `Scroll` leaf, so it is cheaper after step 1 than before.

After steps 1 and 2, the residual constraints should be re-measured rather than predicted — in particular, whether the control panel still needs a presence/demotion concept at all once slack stops being hoarded, and whether the portrait screen class still needs a popover-mounted control panel. My expectation is that both questions answer themselves, but they are exactly the sort of thing that should be re-evaluated after the generic cure rather than special-cased in advance.

---

## 5. Corrections owed to `FEATURES.md`

These are documentation defects witnessed against the running application, listed separately because they are cheap and because ADR-0002 Rule 6 makes a false design-time record a first-class failure.

- *"When the engine is connected, the active board is continuously analysed"* (line 107) — false. The only trigger is the spacebar. **WITNESSED.**
- *"Pass moves are representable in the data model and SGF I/O but no UI surface for issuing one ships today `[planned]`"* (line 51) — false in the other direction. A `Pass` button ships in the status bar and the census names it. **WITNESSED** (measured at 40×18 px at 1920, 36×18 at 1024).
- *"closing the popover (the same button, a click outside it, or Escape)"* — Escape does not close the control-panel popover in either portrait geometry. **WITNESSED.**
- *"The layer contributes no layout cost and is verified never to overlap the board"* — true of the board, and untrue of the presence menu, whose rail-style select and Default-layout button the layer renders inoperable. **WITNESSED.**
- *"Drags persist across sessions"* — **CONFIRMED TRUE.** I initially suspected otherwise and was wrong: the value persists as `session.ui.treeControlRegionWidthPx` and my first probe simply reloaded inside the debounce window. Recorded here because a reviewer's near-miss is worth naming.
- *"Default layout … returning each resized region to the size the app would compute fresh for the current window"* — the button works and its effect persists (verified by polling the workspace document until `treeControlRegionWidthPx` cleared and stayed cleared across two reloads). But because of Class 3, "the size the app would compute fresh" is itself path-dependent, so the promise is only as true as the layout function is pure.
- Two i18n keys are missing from the English catalog and log `[intlify] Not found` on every boot: `knobRegistry.label.display.move-suggestions-fade-ms` and `knobRegistry.label.display.mistake-finder-threshold`. The labels do render via a fallback, so this is cosmetic, but it is noise in the console on every load.
- `/qeubo/*` returns HTTP 503 by design when `QEUBO_ENABLED=False` (the documented disabled-state contract), and the SPA logs it as an uncaught resource error on every single boot. The contract is honoured; the client-side handling of the documented disabled state is not, and it trains the operator to ignore console errors.

---

## 6. Coverage appendix

Graded against the 371-node census fetched from `http://127.0.0.1:19310/spa-surface-tree.json`. **Exercised** means I drove its verbs; **observed** means I rendered and measured it but did not drive every verb; **unreached** carries a concrete blocker.

### `boot` — 7 nodes

| Node | Status |
|---|---|
| `boot.loading` | **Exercised.** Captured mid-hydrate (`01-first-load.png`); it is what the first screenshot caught before I built a proper ready-condition. |
| `boot.error`, `boot.error.retry` | **Unreached.** Blocker: inducing a hydrate failure requires killing the backend between page load and the workspace GET; I judged the resulting rig instability not worth the coverage and did not attempt it. |
| `boot.recovery-gate` (+ continue, reset) | **Unreached.** Blocker: requires a persisted workspace document whose `schemaVersion` exceeds the running build's. I could have injected one through the documents endpoint and did not — this is a genuine hole, and given that the gate guards a destructive "reset server workspace" action (C10), it is the hole I would close first in a follow-up. |

### `wizard` — 34 nodes

All seven steps rendered, measured and screenshotted at **1920×1080** and at **480×900** (`32-wizard-*`, `33-wizard-*`), reached through Settings → Session (UI) → "Re-run setup wizard", and driven to completion via the footer's Next/Finish so the wizard closed cleanly.

- **Exercised:** `wizard.footer.next` (all seven transitions), `wizard.close` (present and measured), the step sequence itself, and `wizard.step-indicator` (rendered with all seven labels; I did not click a dot to jump).
- **Observed:** `step-locale.card`, `step-theme.card`, `step-engine-uri` (input, test button, status chip), `step-palette` (basic cards, advanced disclosure, palette and aggregation selects), `step-demo-board` (live BoardWidget mount, three display toggles, five knob sliders, PV preview group with its mode and annotation selects), `step-sgf-import` (dropzone, staged summary), `step-finish`.
- **Unreached:** `step-sgf-import.pick-files` and `.pick-dir` — blocker: native OS file and directory pickers are not driveable from this harness. `wizard.footer.back` and `.skip` — not clicked; I walked forward only.
- **Finding carried:** the demo-board step's PV selects and one slider fall outside the viewport at 480×900 (Class 2).

### `modals` — 64 nodes

- **Exercised (opened, measured, dismissal semantics tested):** `mint-card`, `learn-path`, `play-engine`, `engine-match`, `login`. All render centred and fully within the viewport at 1920×1080. Their internal controls were enumerated from rendered text (mint: lineage box, target moves, default visits, memory decay, palette select, calibrate-komi, tag mode, tags, cancel, submit — all present; engine-match: both model selects populated with the five proxy labels, both visit inputs, moves-to-play, start) but **not individually driven** — I did not submit a mint or start a match, to keep the sample database and the engine in a known state.
- **Unreached with blockers:** `confirm-load` — requires loading an SGF onto a dirty board, and SGF load goes through a native file picker. `confirm-close-board` — requires closing a board with unsaved state; I added a board but did not close one. `app-confirm` and `app-prompt` — generic dialogs invoked by flows I did not complete (deck deletion, palette item naming). `hyperparam-prompt` — requires a deck declaring holes; the default decks do declare `deck_size`, and my "Run pipeline" click did not surface the modal within the observation window, which I am recording as *not established either way* rather than as a defect. `reset-all-keybindings` — requires Settings → Keybindings → Reset all, which I reached the sub-tab of but did not click (destructive against the persisted profile).

### `overlay-stack` — 10 nodes

- **Exercised:** `system-log` panel (opened, closed, re-opened), `system-log.messages` and their content, `messages.dismiss` (measured at 9×16 px), `clear-all` (measured at 53×11 px). The panel is the subject of Class 4.
- **Unreached:** `keybinding-banner` — requires entering keybinding capture mode, not driven. `save-error-banner` and its retry — requires a failing workspace PUT; not induced. `suppressed-banner` and its destructive reset — same blocker as the recovery gate.

### `workspace` — 236 nodes

**`workspace.board-rail` (9).** **Exercised:** the rail in slot style at every geometry; `new-board` (added a second board; both tabs then rendered the label `Board ` with no ordinal); the rail-style switch to `popover` and the resulting `corner-chrome.board-rail-trigger`. **Observed:** `tab.rugplot`, `tab.activity-dot`, `tab.close`, and `hover-preview` (the docked shelf renders as a persistent empty black box at every geometry — visible in `02-workspace-1920.png` and `03-boot-1366x768.png`). **Finding carried:** the tab is occluded by the add button in portrait.

**`workspace.board-column` (21).** **Exercised:** `board.display` (played a real move — the counter advanced 96 → 97 and the tree grew to 99 nodes), `status-bar.move-nav` (first/prev/next/last), `move-counter`, `rules-select`, `komi-input`, `pass`, `move-numbers-toggle`, `user-badge` (opens the login modal). **Observed live with the engine running:** `move-suggestions` (23 elements with winrate labels and a score-delta on the best move), `dots-overlay` / liveness marks on stones (`15-ponder-analysis.png`). **Observed but not driven:** `variations-overlay`, `delta-annotation`, `setup-mode-chip`, `game-end-badge`, `transient-hint`. **Not driven:** PV hover preview and ctrl/middle-click PV paste. **Finding carried:** `rules-select` and `komi-input` render at 0×0 on a fresh boot at 1024×768, 900×600 and 480×900 — genuinely absent, not merely small.

**`workspace.toolbar-row` (49).** **Exercised:** all five engine-control buttons; `connect` (real connection, capability negotiation observed on the wire); `engine-eval.summary` → popover (version `v1.17.1`, the SELECTOR `model-select` with all five labels and `14` selected, winrate, score lead) and its hover-dismiss; `engine-health.summary` → popover (pps, latency, watchdog) and its hover-dismiss; `engine-uri` click-to-edit → typed a new URI → committed with Enter → persisted; `sliders` badge → popover with all eleven knob sliders; `locale-picker` trigger → menu listing English / 简体中文 / 日本語 / 한국어 with the active one ticked, dismissed by Escape; `setup-palette` trigger → open panel with the three tool buttons and the handicap trigger (verified against the board rectangle: it does **not** overlap the board, so that standing design rule holds at 2560×1440). **Observed:** `engine-queue.badge` (count readout; its table and per-row cancel did not populate because queue depth never exceeded 1 for long enough to catch). **Unreached:** `app-cluster.pbo` and all six of its children — blocker: `QEUBO_ENABLED=False` on the backend by default, `/qeubo/*` returns 503, and the trigger does not render. `load-sgf` / `save-sgf` — blocker: native file dialogs. `engine-controls.menu-trigger` (the narrow-width overflow menu) — did not appear at any geometry I tested, including 480×900. **Findings carried:** `engine-queue` is squeezed to zero width and pushed off-screen below 1400 px; `sliders` and `locale-picker` are occluded by the tree-panel header on a fresh boot at 1366, 1024 and 900.

**`workspace.tree-control-row` (156).**
- **Resizers — exercised.** `outer-resizer` dragged repeatedly (1307 → 760 → 600) with the layout responding live and the value persisting as `session.ui.treeControlRegionWidthPx`; `inner-resizer` appears only once the control panel is present, and was measured but not dragged.
- **`tree` — exercised/observed.** Node count verified (99 circles after a move), the active-node ring follows navigation to both ends of the game. Hover thumbnail, ctrl-click batch mint selection, and the four other ring types were **not driven**.
- **`control-panel` — all five top-level tabs exercised** (Library, Cards, Settings, Analysis, Other) at 1920×1080 with a dragged layout and at 2560×1440 natively, plus all five again inside the portrait popover at 480×900 and 1080×1920.
  - **Library:** rendered its empty state ("No games in library") with the import zone, both pick buttons, both player filters, the all-players disclosure and the sortable header row present. The table, preview pane, scrub slider and open/delete actions are **unreached** — blocker: the sample database's `library/games` table is empty and importing requires a native picker. Note the census already flags `preview.delete` as `[unverified]`.
  - **Cards → Decks:** deck selector populated with five decks, context-ids input, `START REVIEW SESSION` and `RUN PIPELINE` all rendered; `RUN PIPELINE` clicked. **Unreached:** the entire review-session subtree (counter, back/forward, status line, intermission chart, visit override, retry, inline card-metadata editor, advance/rewind/end) — blocker: I did not start a review session, to avoid writing Ebisu review records into the sample database.
  - **Cards → Browse:** exercised to the point of the Class 9 finding — 14.7 s load, ~1 400 rows, 2 797 unreachable interactive elements. The card-tree panel rendered its empty state; its orientation toggle, per-root accordion and collapse-all are **observed only**.
  - **Settings:** all six sub-tabs enumerated and the strip exercised (Session (UI), Analysis Environment, Card Sets (Decks), Advanced Registry, Analysis Layout, Keybindings). Session (UI) driven in full — theme select, tabs-orientation select, the registry editor's branches and leaves, and `Re-run setup wizard` (which launched the wizard). The palette editor, card-set editor, analysis-layout editor and keybinding rows are **observed only**; blocker for the last: capture mode and the reset-all confirm are destructive against the persisted profile.
  - **Analysis:** exercised with live data. Engine status chip, palette select, purge button, move-filter badge, adaptive-re-evaluation box (present, since the proxy advertises the capability, with the `learned_v1` binding available), the persistence box with its `Not saved` summary and SAVE button, the timeline with its rugplot and "95 nodes selected · turns 0–95" readout, the visits input, and `Analyse Selection (95)` — which was **clicked and ran to completion against the real engine**. All four chart tabs then rendered with real data: Basic (interval summary, game-state series with complexity / win-probability / score-advantage, per-player delta with mistake markers), Distributions, Stability, Multiresolution (`28-analysis-*.png`). Not driven: chart point-click navigation, rugplot range drag, heatmap cell click, and the stability/cross-correlation selects.
  - **Other:** exercised — gradient calibration strip, the full knob registry with all eleven display sliders, visits-LERP inputs, per-query-overrides textarea, qEUBO bookmarks header. This tab is where the below-viewport amputation is most visible in portrait.
- **`workspace.preview-board` — exercised.** Enabled from the presence menu; renders a 160×160 mini-board floating in unallocated space at 2560×1440 (`25-setup-open.png`). Enabling it is one of the two toggles that demotes the control panel at 2560.

### `corner-chrome` — 19 nodes

- **Exercised:** `presence-menu.trigger`, all four `checkboxes` (Board Rail, Preview Board, Control Panel, Setup Tools — toggled and observed), `rail-style` select (switched slot → popover), `reset-layout` ("Default layout" — clicked, effect verified live and its persistence verified by polling the workspace document across two reloads); `system-log-toggle`; `control-panel-summon.button` and its `popover` (opened at both portrait geometries, all five tabs switched inside it); `board-rail-trigger.button` and its popover.
- **Observed only:** `debug-menu.trigger` (the DEBUG pill renders in this dev build) — its four children (Clear Cache, Auto-Nav Perf, Popover Stress, Jank test) are **unreached**: two scripted attempts to open the menu did not produce a popover, and I did not pursue it further since FEATURES.md states the menu is absent from production builds and is explicitly "not a user-facing feature".

### Geometry coverage

Fresh boot **and** full DOM audit at 2560×1440, 1920×1080, 1366×768, 1024×768, 900×600, 480×900 and 1080×1920, plus additional fresh boots at 1280, 1440, 1600, 1680, 1800, 2048, 2200, 2560 and 3000 px width for the width-threshold sweep. A no-reload resize traversal through all seven mandated classes in sequence, audited and screenshotted at each stop. Modals audited at 1920×1080; the wizard audited at 1920×1080 and 480×900; the control-panel popover audited at both portrait sizes.

### What got shallow treatment, disclosed

Three areas received breadth but not depth, and I would not want the commissioner to read the coverage table as claiming otherwise. **The review-session flow** (the product's primary pedagogical loop) was reached but not entered, so its state machine — AWAITING_MOVE, grading, INTERMISSION, FINISHED, back/forward deck repeat — is untested by me; given that it is where the SR pedagogy lives, it deserves its own review. **The SGF library** end-to-end (import, sort, filter, preview, open) is untested because the sample database ships no library rows and import needs a native picker; a follow-up should seed the library table directly. **The palette and card-set CodeMirror editors** were rendered and measured but not typed into, so their lint, hole-declaration and error-surfacing behaviour is unverified. Everything else in this report was driven or measured, and every claim above carries either a screenshot, a quoted DOM measurement, a wire frame, or a timed HTTP response.
