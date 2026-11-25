* Storage
    * Registry
        * PV-settings
    * Currently stored analyses
* Need a way to close/minimize/restore open games; maybe take inspiration from tab manager extensions for firefox
* ~~ownership maps~~ — shipped as the release wrap-up. Three orthogonal
  sub-modes (continuous adjacent-square fill, discrete dots, liveness
  dot-in-stone) on `UISession.overlayLayers.ownership`; rendered by the
  parameterised `BoardHeatmapOverlay.vue`; KataGo's `includeOwnership`
  wire flag plumbed reactively. Policy head outputs still pending — they
  will reuse `BoardHeatmapOverlay` and `decodeBoardArray` (the latter
  resolves the linear→2D mapping concern frontend-side, so no proxy
  middleware extension is needed; the trailing "pass" slot must be
  stripped before decode).
* PV's should be mouse-scrollable (as in the animated versions of the PV display but optionally done manually using the scroll-wheel)
* ~~PV's should be pasteable into the game-tree~~ Closed 2026-05-11:
  `MoveSuggestions.vue` gains a `paste-pv` emit fired on modifier-click
  (Ctrl on Win/Linux, Cmd on Mac — `utils/modifier-key.ts` centralises
  the platform split) or middle-click (`@mousedown` with `button === 1`
  is the portable shape; `@click.middle` is unreliable across browsers).
  `BoardWidget.vue` re-emits, `App.vue::handlePastePv` loops
  `applyGoMove` from the active board state — the dedup-or-descend
  branch at `logic.ts:79–82` means moves that already exist as
  children of the current node are descended into rather than
  duplicated, which is exactly the historical-bug guarantee carried
  forward to the sequential case. Cursor advances to the PV leaf
  via the `BoardState.currentNodeId` chain. Illegal moves surface
  a system message and accept the legal prefix per ADR-0002.
  Discoverability: a new `useTransientHint` composable (module-
  scope ref) lets the hover-enter handler publish a localised
  "{Ctrl|Cmd}+click or middle-click to paste PV" message to the
  status bar, cleared on hover-leave. No-op during the review
  session's `AWAITING_MOVE` state to preserve single-move
  discipline; allowed in idle / intermission / finished states.
* Seek to off-load some styling/layout to existing libraries in the javascript/typescript/vue eco-system (grid-layout, monaco editor, etc, etc, not sure what's out there)
* ~~When connection with KataGo has been established, should send query_version and query_models in order to display relevant information in the status bar; if connection drops and is re-established, should probe again to cover the case where the KataGo service change configuration~~ Closed 2026-05-06: `KataGoClient.ClientCallbacks` gains an optional `onConnect` hook fired from `onopen` (initial connection + every reconnect); `analysisService.probeEngineInfo()` issues `query_version` + `query_models` and writes a new `EngineInfo` value object onto `store.engine.info`. The 5s watchdog refreshes the version field on each tick so a mid-session restart with a version bump surfaces without waiting for a full reconnect; on disconnect the info clears so a stale identity doesn't survive into the next session. `StatusBar.vue` renders the version + first model name (with a `(+N)` suffix when multiple) on the right-hand cluster. Worklog at `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-katago-engine-info-probe.md`.

---

Bugs or other rough edges

* ~~useUserIORegistry interacts with keyboard handling elsewhere. For
  example, in the Monaco editor, bound keys in UserIO can not be used
  which is obviously a blocker~~ — resolved. The editor in use is
  actually CodeMirror 6 (`.cm-content` is a `<div contenteditable="true">`),
  which the existing `instanceof HTMLTextAreaElement` guard missed.
  Fixed by adding `HTMLElement.isContentEditable` to the context guard
  in `useUserIORegistry.ts`; the property accounts for inheritance, so
  a single check covers nested elements inside any contenteditable
  surface (CodeMirror today, Monaco if ever added, generic
  contenteditable mounts).
* ~~After spaced repetition when the game rewinds to initial position, when entering intermission, you can't click on the chart like on the PlayerPanel~~ Closed 2026-05-06: `ReviewSessionPanel.vue`'s intermission `BaseChart` now wires its `@index-click` to a local `handleIntermissionClick` that navigates the board to the position the user faced when making the clicked move (1-indexed along the chart's x-axis), with `position before user move k = path index startIdx + 2(k-1)` since each user move + engine response advances 2 plies along the active variation. Same "navigate to position BEFORE the move" semantics as `useChartNavigation::handlePlayerClick` on the analysis tab; the chart wasn't reused as `AnalysisChartPanel` (which would bring thumbnail-on-hover overlay and `axisPointer` cosmetics) — the intermission chart is a small 180px-tall summary, not a full per-player delta view, and the simpler BaseChart suffices for the click-only fix. Worklog at `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-intermission-chart-click.md`.
* ~~When hovering PV, still shows text annotation (like number of visit or scoreLead), but shouldn't~~ Closed in a prior PR (user-reported as already done during the 2026-05-06 backlog sweep; the suggestion-disc text annotation correctly hides on hover via the `hoveredIndex !== null` opacity gate in `MoveSuggestions.vue`).
* ~~Need an override for visits in SR~~ Closed earlier as the visits-override feature on the Cards tab's `ReviewSessionPanel` (per-card sticky `visitsOverride` in `ReviewSessionData`, `effectiveVisits` resolution chain, number input on the in-session panel). Card-metadata display during active review sessions is a separate small enhancement and remains open below.
* Card metadata display during active review sessions (the half of the prior bullet that didn't ship with the visits-override feature). The SR session shows status / counter / scores but doesn't surface the card's tags, parent lineage, or notes. Useful when reviewing a card pulled from a months-old game and the user needs the context.
* Need a card editor; probably there is going to be some DRY/reuse related to the above
* ~~Disconnect button styling (right now just shows ENGINE in green)~~ Closed in a prior PR (user-reported as already done during the 2026-05-06 backlog sweep).
* ~~The analysis done and displayed in the SR tab seems to be independent of that in the analysis tab. This is probably not ever desirable~~ Made irrelevant by the cards-tab-merge arc (PRs #140 / #141 / #142): the SR tab no longer exists; `ReviewSessionPanel` shares the active board with the analysis surface, so per-board analysis state composes naturally. Retired as "no longer applicable" rather than as a fix.
* ~~The analysis range is not preserved when switching tabs or switching between boards, etc, which is highly annoying.~~ Closed in a prior PR (user-reported as already done during the 2026-05-06 backlog sweep; `BoardState.analysisRange` is per-board and persists via SyncService).

## 2026-11-25 — Frontend baseline test and lint dispositions

The following findings were reproduced on `main` and on the dependency-refresh branch using the same baseline comparison. They are **not dependency regressions**. This section records work still owed; it does not mark the suite or lint as clean.

* **Baseline test failures — 17 failing tests in six files.** The apples-to-apples run recorded `main: 3,656 passed / 17 failed / 8 skipped` and the refreshed branch `3,655 passed / 18 failed / 8 skipped`. The 17 shared failures are in:
  * `frontend/tests/integration/useAppDialogs.test.ts`
  * `frontend/tests/unit/composables/keybindings-catalog.test.ts`
  * `frontend/tests/unit/composables/useMintDialogSignal.test.ts`
  * `frontend/tests/unit/logic-setup.test.ts`
  * `frontend/tests/unit/logic.test.ts`
  * `frontend/tests/unit/lyt-d2-system-log-toggle.test.ts`

  **Disposition: triage and fix each failing case, not a blanket allowance.** The comparison record available for this filing has aggregate counts and file names but not the 17 individual test names, assertion output, or root causes; those are not fabricated here. Re-run a clean `npm ci` and `npm run test:run` on `main` under the CI Node/npm pair (Node `22.23.5`, npm `10.9.9`), capture the full reporter output, enumerate each failing test and assertion, identify the violated contract and cause, then fix or file each independent cause. Keep the six shared failures distinct from the dependency-branch-only `system-message-sink` notification failure.

* **Baseline ESLint cast-hygiene failures — 10 errors.** The same `local/justification-adjacency` diagnostics were independently reproduced on `main` and the dependency-refresh branch. The current CI witness is [frontend-ci run 45634660243](https://github.com/KodBena/LengYue/actions/runs/45634660243). Exact sites:
  * `frontend/src/App.vue`: 1384:11, 1401:43
  * `frontend/src/components/tree/ForestDirectory.vue`: 40:18, 41:41, 382:26
  * `frontend/src/engine/stencil-cover-geometry.ts`: 134:29, 310:31
  * `frontend/src/state/feasible-layout.ts`: 1697:48
  * `frontend/src/store/index.ts`: 271:20, 283:10

  **Disposition: remove or structurally justify the assertions; do not weaken the rule or add blanket suppressions.** For each site, first identify the general invalid-state / unchecked-boundary class and the type or validation contract that would make it unrepresentable, then identify the operational lapse that admitted the assertion. Expected design direction: narrow `activeTab` through the existing predicate rather than re-asserting it; validate DOM event targets and persisted sort-key strings at their boundary; type wire points as validated readonly tuples instead of `unknown[]` casts; make the sovereign tree quantity numeric in the input contract; and model message-record updates as a typed aggregate rather than widening a readonly field with assertions. Verify the resulting code with the existing ESLint rule unchanged.

* **Dependency-branch-only synchronous notification failure — in-scope fix committed on PR #490; verification pending.** The dedup path now constructs a complete readonly `SystemMessage` snapshot and replaces the array slot once, rather than separately writing `count` and `timestamp`. The test uses an incrementing `Date.now()` stub and asserts exactly one synchronous subscriber run per logical push, including dedup hits. See [PR #490 fix commit](https://github.com/KodBena/LengYue/commit/0aea2268d6f58f81428e628292962867ed14c252). This is not a baseline backlog item. The PR #490 CI run typechecked successfully but skipped the unit suite after the already-filed baseline lint errors, so the new test still needs an execution result before the fix is considered verified.
