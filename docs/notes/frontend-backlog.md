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
* PV's should be pasteable into the game-tree
* Seek to off-load some styling/layout to existing libraries in the javascript/typescript/vue eco-system (grid-layout, monaco editor, etc, etc, not sure what's out there)
* When connection with KataGo has been established, should send query_version and query_models in order to display relevant information in the status bar; if connection drops and is re-established,
  should probe again to cover the case where the KataGo service change configuration

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
* ~~After spaced repetition when the game rewinds to initial position, when entering intermission, you can't click on the chart like on the PlayerPanel~~ Closed 2026-05-06: `ReviewSessionPanel.vue`'s intermission `BaseChart` now wires its `@index-click` to a local `handleIntermissionClick` that navigates the board to the position the user faced when making the clicked move (1-indexed along the chart's x-axis), with `position before user move k = path index startIdx + 2(k-1)` since each user move + engine response advances 2 plies along the active variation. Same "navigate to position BEFORE the move" semantics as `useChartNavigation::handlePlayerClick` on the analysis tab; the chart wasn't reused as `AnalysisChartPanel` (which would bring thumbnail-on-hover overlay and `axisPointer` cosmetics) — the intermission chart is a small 180px-tall summary, not a full per-player delta view, and the simpler BaseChart suffices for the click-only fix. Worklog at `docs/worklog/2026-05-06-intermission-chart-click.md`.
* When hovering PV, still shows text annotation (like number of visit or scoreLead), but shouldn't
* Need an override for visits in SR; card metadata should be displayed for active review sessions
* Need a card editor; probably there is going to be some DRY/reuse related to the above
* Disconnect button styling (right now just shows ENGINE in green)
* The analysis done and displayed in the SR tab seems to be independent of that in the analysis tab. This is probably not ever desirable
* The analysis range is not preserved when switching tabs or switching between boards, etc, which is highly annoying.

