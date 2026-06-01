# Frontend file map

Quick-orientation map of every TypeScript and Vue source file
under `frontend/src/`, with a one-line purpose and an
ADR-0003 band classification. Use this to find what you need
before grepping; use the file's own header (ADR-0006) for the
deeper "why."

**Companion docs.**

- `frontend/README.md` — build / lifecycle / contributor workflow.
- `frontend/CLAUDE.md` — authoring discipline (layering tenet,
  type-driven design, reactivity rules).
- `frontend/IDENTIFIERS.md` — the identifier namespace map: every
  branded/aliased id with construction site, lifetime, cardinality,
  and soundness notes. This map's sibling (files ↔ identifiers).
- `docs/handoff-current.md` — system-level orientation.
- `docs/adr/0003-frontend-portability-and-domain-boundaries.md` —
  the canonical band definitions referenced below.
- `docs/archive/notes/frontend-source-tree-reorganization.md` — why the
  directory layout looks the way it does.

## ADR-0003 band tags (one-line legend)

- **[B1]** — truly domain-agnostic. Would survive a chess port
  without code change. Auth, theming, generic UI primitives,
  HTTP/WebSocket plumbing, persistence schema, vue-i18n, etc.
- **[B2]** — game-tree-coupled but **not** Go-specific. Operates
  on variation-tree shapes (nodes, parents, children, paths,
  expansion). A chess port reuses these unchanged.
- **[B3]** — Go-bound. Depends on stones, B/W, SGF, KataGo's
  wire vocabulary, Go-board geometry. The ~30–40% surface a
  chess port would rewrite.

Borderline cases are tagged for the **dominant** concern in the
file; the header in the source has the nuance.

## Tree

```
frontend/src/
├── App.vue                            [B3]  Root SFC. Orchestrator hosting tabs, board, modals; wires composables.
├── logic.ts                           [B3]  applyGoMove — Go-rule board mutation with dedup-or-descend on the tree.
├── main.ts                            [B1]  Vue app bootstrap (createApp, install i18n, mount #app).
├── jquery-bridge.ts                   [B1]  Installs jQuery on `window` for legacy interop.
├── types.ts                           [B2]  Branded ids, discriminated unions, GlobalStore schema. Carries Move/StoneColor (B3 leakage).
├── style.css                          [B1]  Empty stub; theme lives in chrome substrate variables.
│
├── assets/                                  Static assets (icons, textures).
│
├── components/                              Vue SFCs. Thin renderers, minimum wiring to composables.
│   ├── CardMetadataPanel.vue          [B3]  Inline-edit metadata panel for a single card (tags / numMoves / gamma / suspended / reset_prior).
│   ├── KeybindingRow.vue              [B1]  Per-action row in the Keybindings view — idle/capture/conflict state machine + Edit/Reset/Unbind buttons.
│   ├── KeybindingsView.vue            [B1]  Keybindings sub-tab: per-domain registry list + Reset-all + reserved-keys disclosure.
│   ├── KnobRegistryEditor.vue         [B1]  Cross-domain knob-registry editor — lists every scalar knob, grouped by domain (Phase 3b).
│   ├── ReviewSessionPanel.vue         [B3]  In-session SR controls: status, counter, intermission chart, hint visibility.
│   ├── SettingsTab.vue                [B2]  Settings tab surface: General / Keybindings sub-tabs via TabWidget.
│   │
│   ├── board/                                Go-board surface. Renderers + overlays.
│   │   ├── BoardDisplay.vue           [B3]  Stateless SVG Go board with stone gradients, hoshi, last-move ring, move-number text.
│   │   ├── BoardHeatmapOverlay.vue    [B3]  Stateless per-intersection heatmap (ownership / liveness / dots).
│   │   ├── BoardTab.vue               [B3]  Tab row in the board-list rail (label, close, canvas analysis-depth rugplot drawn imperatively off the render path).
│   │   ├── BoardVariationsOverlay.vue [B3]  Sibling-variation rings + active-next-move hint on the board.
│   │   ├── BoardWidget.vue            [B3]  Hosts BoardDisplay + overlays + MoveSuggestions; computes derived view-model.
│   │   ├── MiniBoard.vue             [B3]  Reactive thumbnail board — component projection of a BoardSnapshot (memoised grid + per-stone v-memo). Replaces per-nav v-html frame-teardown; used by ChartPreviewBox + heatmap preview.
│   │   ├── MoveSuggestions.vue        [B3]  KataGo move-suggestion overlay; PV preview on hover; paste-pv on modifier/middle-click.
│   │   └── StatusBar.vue              [B3]  Move number, player names, komi, turn indicator, captures, transient hint, # toggle.
│   │
│   ├── charts/                              ECharts wrappers. Mostly B2/B3; the renderer itself is generic.
│   │   ├── AnalysisChartPanel.vue     [B3]  Standardised analysis chart panel host (visits, winrate, scoreLead, …).
│   │   ├── AnalysisDashboard.vue      [B3]  Provides the per-board AnalysisContext + tab strip; renders only the active tab's panels via <component :is> (panels self-source via inject); timeline is the persistent header.
│   │   ├── panel-ids.ts               [B3]  SFC-free SSOT for the frozen analysis-panel id values (PANEL_ID); importable by the store (defaults/migration) without pulling SFCs.
│   │   ├── panel-registry.ts          [B3]  Analysis-panel registry: id → component descriptors + ANALYSIS_PANELS_BY_ID lookup. Render source for AnalysisDashboard; resolves persisted tab panelIds.
│   │   ├── AnalysisTimelinePanel.vue  [B3]  Rug-plot timeline + visits input + "Analyse selection" controls.
│   │   ├── BaseChart.vue              [B1]  Generic ECharts wrapper with module-scoped legend memoisation.
│   │   ├── card-tree-echarts.ts       [B2]  ECharts node/tooltip composer for the card-tree forest.
│   │   ├── CardTreeWidget.vue         [B2]  Card-tree forest display (one tree-section per CardLineageTree, accordion).
│   │   ├── ChartPreviewBox.vue        [B3]  Isolated leaf rendering a panel's hover/position thumbnail (MiniBoard) via a `() => BoardSnapshot` accessor — keeps the per-nav preview update off the chart host's render.
│   │   ├── ColorDebugStrip.vue        [B1]  Dual-track gradient-calibration debug strip.
│   │   ├── HeatmapChart.vue           [B1]  Stateless generic ECharts heatmap renderer; emits cell-click / cell-hover / cell-leave (no tooltip — the host renders any preview).
│   │   ├── MergedDeltaPanel.vue       [B3]  Both-players delta chart on a parity-interleaved x-axis.
│   │   ├── ScoreLeadPanel.vue         [B3]  ScoreLead chart panel.
│   │   ├── DistributionChart.vue      [B1]  Generic histogram/KDE primitive (variant-dispatched ECharts mount).
│   │   ├── DeltaDistributionPanel.vue [B3]  Per-colour delta-KDE panel (injects AnalysisContext; wraps DistributionChart).
│   │   ├── MistakeGapPanel.vue        [B3]  Own-colour mistake-gap histogram panel (injects AnalysisContext; wraps DistributionChart).
│   │   ├── MultiresolutionIntervalPanel.vue  [B3]  Triangular multiresolution-interval heatmap + fixed interval-preview window (hovered cell → start/end MiniBoards).
│   │   ├── StabilityCrossCorrelationPanel.vue [B3]  Pairwise Pearson over extractor × extractor and metric × metric. Collapsed by default.
│   │   └── StabilityPanel.vue         [B3]  Per-position stability metric over the variation path; extractor-selectable.
│   │
│   ├── chrome/                              Application shell. Generic UI primitives.
│   │   ├── EngineQueueTooltip.vue     [B1]  Toolbar badge + hover panel listing in-flight KataGo queries with ETA.
│   │   ├── FloatingThumbnail.vue      [B1]  Generic floating thumbnail tooltip.
│   │   ├── LocalePicker.vue           [B1]  Top-nav locale picker (flag + native name).
│   │   ├── RootErrorBoundary.vue      [B1]  Catches descendant errors, logs via ADR-0002, renders fallback.
│   │   ├── SidebarWidget.vue          [B1]  Sidebar layout container.
│   │   ├── SystemLogPanel.vue         [B1]  Always-visible system log bar with idle row.
│   │   ├── TabWidget.vue              [B1]  Controlled tabbed navigation.
│   │   ├── Toolbar.vue                [B3]  Application toolbar shell (title, buttons, popover mounts). Reads only `isConnected`; telemetry lives in ToolbarEngineMetrics so the shell doesn't re-render per packet.
│   │   ├── ToolbarEngineMetrics.vue   [B3]  Live engine-telemetry strip leaf (version/model/winrate/scoreLead/PPS/latency/watchdog + queue tooltip); self-sources the per-packet/per-tick reads, extracted out of Toolbar (render-coupling fix).
│   │   ├── ToolbarSliderPopover.vue   [B1]  Toolbar badge + hover popover: compact priority-ordered list of every scalar knob (quick-access surface for the knob registry).
│   │   └── UserBadge.vue              [B1]  Auth-identity badge; opens LoginModal on click.
│   │
│   ├── editors/                             Settings / palette / pipeline editors.
│   │   ├── AnalysisControls.vue       [B3]  Per-board analysis controls (engine status, palette picker, bundle persistence, …).
│   │   ├── AnalysisTabsEditor.vue     [B3]  Controlled editor for the analysis-tab layout (AppSettings.analysisTabs): add/rename/reorder/delete tabs, assign panels (partition). Hosted in Settings → Analysis Layout.
│   │   ├── CardSetEditor.vue          [B2]  Master-Detail Tree-DSL pipeline editor (CodeMirror 6) with JSON5+holes dialect.
│   │   ├── HyperparameterPanel.vue    [B1]  Declarations editor (name/type/default/constraints) for a deck's harness.
│   │   ├── PaletteEditor.vue          [B3]  Master-Detail Analysis-Environment editor.
│   │   └── RegistryEditor.vue         [B1]  Generic managed-registry editor with defaults and structural protection.
│   │
│   ├── modals/                              Dialog modals. Mostly B1 (generic UX) with two B3 (engine/SGF-touching).
│   │   ├── ConfirmLoadModal.vue       [B1]  "Save / discard / cancel" dirty-board dialog.
│   │   ├── EngineMatchModal.vue       [B3]  Engine-vs-engine match config (model picker, visits, num moves).
│   │   ├── HyperparamPromptModal.vue  [B1]  Bind-time prompt for deck-pipeline hyperparameters (defaults pre-filled, per-field validation).
│   │   ├── LoginModal.vue             [B1]  Sign-in / register / switch-user / sign-out.
│   │   ├── MintCardModal.vue          [B3]  Flashcard mint dialog (SGF → backend mint).
│   │   ├── PlayEngineModal.vue        [B3]  "Play vs engine" session manager: lists active sessions (start + current-head move) on the board with End buttons; start form for a new session at the current node.
│   │   └── ResetAllKeybindingsModal.vue [B1] Destructive-confirm modal for the Keybindings sub-tab's Reset-all action.
│   │
│   ├── knobs/                               Per-knob widgets for the knob-registry editor surfaces.
│   │   └── KnobSlider.vue             [B1]  Unified scalar slider — substrate-aware read/write, claim-state disable (Phase 3b).
│   │
│   ├── library/                             SGF library surface: import + sortable table + preview pane.
│   │   ├── LibraryImportPanel.vue     [B1]  Drag-drop + picker + progress UI for useLibraryImport.
│   │   ├── LibraryPlayerFilter.vue    [B1]  Autocomplete input fed by useLibraryPlayerSuggest.
│   │   ├── LibraryPreviewPane.vue     [B3]  Mini-board (via renderBoardToSvg) + scrubber + action buttons.
│   │   ├── LibraryTab.vue             [B1]  Master-detail orchestrator wiring the four library composables.
│   │   └── LibraryTable.vue           [B1]  Virtual-scrolled table with sortable headers; emits select / open / visible-range.
│   │
│   ├── qeubo/                               PBO (preference-based Bayesian optimisation) calibration UI surfaces. Code path retains the `qeubo` identifier (matches `useQeubo` / `qeubo-service.ts` / `/qeubo/*` routes); user-facing label is PBO.
│   │   ├── QeuboBookmarks.vue         [B1]  Bookmark list (A/B candidates). Independent of experiment lifecycle.
│   │   └── PboPopover.vue             [B1]  Toolbar hover popover — phase badge + audition toggle / verdict pair / apply / pin / debug. Consumes useHoverPopover.
│   │
│   └── tree/                                Tree-shaped surfaces: game tree, forest directory, timeline.
│       ├── ForestDirectory.vue        [B2]  Master-Detail database explorer (Decks tab + Browse tab + chart).
│       ├── ForestTreeNav.vue          [B2]  File-manager-style hierarchical navigator (games → roots).
│       ├── HorizontalTimelineVisualizer.vue [B2]  Horizontal timeline rug-plot + draggable selection. Data track drawn on a canvas off the render path; slider/handles/grid stay DOM.
│       └── TreeWidget.vue             [B2]  SVG game-tree viewer; enforces current-node-visible invariant via ensureVisible.
│
├── composables/                             Logic layer. Pure-ish functions over reactive refs.
│   ├── reactive-settle.ts             [B1]  waitForCondition — the reactive-settle bridge (resolve a promise when a reactive predicate flips true). Shared by the autonomous-SRS driver and the perf-scenario context.
│   ├── useAutoNavigatePerf.ts         [B2]  Dev-only: dev-toolbar toggle wrapper (start/stop/isRunning) over the shared autonav loop core in perf/autonav.ts. Button gated to dev builds.
│   ├── useAutoPopoverPerf.ts          [B1]  Dev-only: toggles a target popover open/closed at ~2/s (via useHoverPopover's force hook), emitting popover:open/close marks tagged with queue state — for the popover-toggle-cost measurement.
│   ├── useEngineControls.ts           [B3]  Engine connect / disconnect / toggle lifecycle.
│   ├── useNavigation.ts               [B2]  Headless navigation within the game tree (next/prev/parent/child).
│   ├── useQeubo.ts                    [B1]  qEUBO experiment state machine + audition + verdict.
│   ├── useQueryTelemetry.ts           [B1]  Singleton in-flight KataGo query queue + per-model visits/sec ETA.
│   ├── useScopedScroll.ts             [B1]  Wheel-event scoped scroll (board + tree both consume).
│   ├── useViewportFollow.ts           [B1]  Centre a scroll container on a moving target via cached scroll/dims (passive scroll listener + ResizeObserver) — no synchronous layout read in the nav hot path. TreeWidget auto-center.
│   ├── useThrottledSnapshot.ts        [B1]  Shared trailing-throttle: createTrailingThrottle primitive + useThrottledSnapshot sugar — the rate limiter behind the subscriber-projection redraw throttles (queue/metrics/BoardTab/charts/timeline).
│   ├── useTransientHint.ts            [B1]  Module-scoped reactive hint string surfaced by StatusBar.
│   ├── useTransientLogReveal.ts       [B1]  Auto-reveals system-log panel on error/warning bursts.
│   ├── useUserIORegistry.ts           [B2]  Hardware-event → domain-verb adapter (keyboard nav, suggestion toggle, …).
│   │
│   ├── analysis/                             KataGo-derived view models and chart wiring.
│   │   ├── useAnalysisContext.ts      [B3]  Per-board analysis context (projection + derived) shared to panels via provide/inject.
│   │   ├── useAnalysisTabs.ts         [B3]  Analysis-tab state: persisted tab list (AppSettings.analysisTabs) + ephemeral active-tab selection. No component imports (resolution is the dashboard's job).
│   │   ├── useAnalysisProjection.ts   [B3]  Projects raw board + analysis ledger to UI-ready view model.
│   │   ├── useAnalysisPersistence.ts  [B2]  Effectful boundary for AnalysisControls' save/discard + reactive summary/auto-save-error + stopBoardAnalysis; keeps the analysisPersistenceService/analysisService imports out of the component.
│   │   ├── useAnalysisTimeline.ts     [B3]  Owns the chart selection range + visit-vector from the ledger.
│   │   ├── useChartNavigation.ts      [B3]  Pure black-box click+thumbnail handler for analysis charts.
│   │   ├── useEChartsForestRender.ts  [B2]  Per-tree ECharts lifecycle (init, dispose, resize) for card-tree forests.
│   │   ├── enriched-accumulator.ts    [B3]  Pure incremental derivation of the enriched series (patchNode O(1) vs full O(N) rebuild); last-path-order delta arbitration. Equivalence-tested.
│   │   ├── useEnrichedData.ts         [B3]  Reactive enriched series — shallowRef driven by structural watch (rebuild) + ledger changed-key signal (incremental patch); no per-frame O(N) re-derive.
│   │   ├── useMistakeFinder.ts        [B3]  Calculated property: per-move mistake severity + un-punished red-flag.
│   │   ├── useStabilityCrossCorrelations.ts [B3] Pairwise Pearson over the extractor and metric axes of stability series.
│   │   ├── useStabilityMetrics.ts     [B3]  Per-move stability fractions from the trajectory store for a chosen extractor + metric.
│   │   ├── useTimelineLogic.ts        [B2]  Contiguous-segment calc + selection range + debounced updates.
│   │   ├── useTriangularHeatmap.ts    [B3]  Extracts proxy-side triangular heatmap from the ledger for a path.
│   │   └── wait-for-analysis.ts       [B3]  Primitive: wait for a specific KataGo packet (with timeout, abort).
│   │
│   ├── auth-app/                             Auth + app cold-start.
│   │   ├── useAppBootstrap.ts         [B1]  Cold-start: auth → sync hydrate → resource preload → tag fetch.
│   │   ├── useAuth.ts                 [B1]  AuthState SSOT; wraps api-client auth methods; JWT synchronisation.
│   │   └── useMetadata.ts             [B3]  SGF root properties → UI metadata (gameName ladder, players, dates).
│   │
│   ├── board/                                Board-surface composables. Mostly B3.
│   │   ├── autonomous-srs.ts          [B3]  Policy/Driver/Recorder abstractions for the autonomous SRS loop.
│   │   ├── useActivePath.ts           [B2]  NodeId lineage root → current node.
│   │   ├── useDirtyBoardGuard.ts      [B3]  Dirty-board guard: confirm-load modal + dirty-board policy for cards AND library games; delegates the SGF load to sgf/loadIntoBoard (swallow-and-log over the fail-loud primitive).
│   │   ├── useEngineResponder.ts      [B3]  "Play vs engine" trigger: `fireAndAdvanceHead(boardId, gameStartNodeId)` queries the engine at the board's current position and advances the game's single green-ring head; invoked from App.vue when the user plays from a head.
│   │   ├── use-move-suggestions.ts    [B3]  Refined intensity-mapping for KataGo move suggestions.
│   │   ├── usePlayFromPosition.ts     [B3]  "Engine plays from here" — looped applyGoMove against a KataGo URL.
│   │   ├── use-pv-animation.ts        [B3]  PV stone-sequence animation (window / instant / sequential modes).
│   │   └── useVariationPath.ts        [B2]  Full active game-line root → leaf.
│   │
│   ├── cards/                                Card-tree exploration state.
│   │   ├── board-card-trees.ts        [B2]  Per-board card-tree state at module scope (forest, active set, hydration).
│   │   ├── useCardThumbnail.ts        [B3]  Memoised SGF → SVG renderer for tooltips.
│   │   ├── useCardTreeData.ts         [B2]  Per-board card-tree projection + loadBrowse / runPipeline entry points.
│   │   ├── useCardTreeHydration.ts    [B2]  Lazy-hydration walker over the render forest.
│   │   ├── useCardMetadata.ts         [B2]  Effectful boundary for card-metadata edits (updateCardMetadata); shared by ReviewSessionPanel + ForestDirectory, which splice the returned card into their own state.
│   │   ├── useCardTreeProjection.ts   [B2]  Pure projection: forest + active-set + manual-expand → role-annotated render forest.
│   │   └── useThumbnailCache.ts       [B3]  Shared board-thumbnail cache (module-scoped Map).
│   │
│   ├── chrome/                               UI-shell composables.
│   │   ├── useHoverPopover.ts         [B1]  Hover-intent open/close primitive (open ref + mouseenter/mouseleave + 150 ms close-grace timer) shared by toolbar popovers.
│   │   ├── useLocale.ts               [B1]  Locale read/write through GlobalStore + supported-locale registry.
│   │   ├── usePopoverEdgeClamp.ts     [B1]  Viewport-edge clamp for hover popovers (setPopoverEl function-ref + xShift) — translateX shifts the rendered popover inward when its CSS anchor would push it off-screen.
│   │   └── useResizablePanel.ts       [B2]  Horizontal resize-bar between tree and control panels.
│   │
│   ├── forest/                               Forest / game-tree expansion + navigation.
│   │   ├── useForestBrowsePolicy.ts   [B2]  Forest-Directory selection → fetch-behaviour dispatcher.
│   │   ├── useForestStats.ts          [B2]  Effectful boundary for the Browse forest's data source (getForestStats); ForestDirectory reads its roots through this rather than the backend singleton.
│   │   ├── useForestNavigation.ts     [B2]  Tree-shaping for the file-manager-style navigator (games → roots).
│   │   ├── useTreeExpansion.ts        [B2]  Variation-hiding expansion state; enforces "current-always-visible" invariant.
│   │   └── useTreeLayout.ts           [B2]  Pluggable tree-layout composable (watchEffect-driven).
│   │
│   ├── library/                              SGF library surface composables.
│   │   ├── useLibraryImport.ts        [B3]  File picker / directory picker / drag-drop with webkitGetAsEntry walk + chunked upload with progress.
│   │   ├── useLibraryPlayerSuggest.ts [B1]  In-memory player-name autocomplete (frequency-ordered cache + substring filter).
│   │   ├── useLibraryPreview.ts       [B3]  Selected-row state + lazy getGame + SGF parse + scrub navigation.
│   │   ├── useLibraryQuery.ts         [B1]  Sparse-buffer pagination over /library/games with sort + filter + generation-counter race protection.
│   │   └── useVirtualRowList.ts       [B1]  Tiny fixed-row-height virtual-scroll primitive (no deps; ~50 LOC).
│   │
│   ├── perf/                                 Dev-only performance-capture harness (no perf claim; ADR-0009).
│   │   ├── autonav.ts                 [B2]  SSOT autonav loop core: awaitable rAF walk of next() to leaf at ~60 Hz, emitting <prefix>:start/step/end marks. Consumed by useAutoNavigatePerf (toggle) and the scenario context (awaitable).
│   │   ├── fixtures.ts                [B2]  buildSpacedFixtureSgf — generated even-grid game (legal, no captures) + DEFAULT_FIXTURE_SGF; deterministic deep main line for scenarios.
│   │   ├── scenarioContext.ts         [B2]  createScenarioContext + runScenario: the imperative app-action façade (createBoard / loadSgf / resetWorkspace / connectEngine / clearCache / analyzeRange / autonav / spawn / measure) + the stimulus-teardown runner.
│   │   ├── scenarios.ts               [B2]  Scenario registry + built-ins (nav-only / nav-range / full-stress / workspace-reset; analysis preamble connects engine + cold-cache, protocol defaults 1000 visits / no-adapt / SELECTOR) + window.__perfScenario (run / list / disconnect) install.
│   │   ├── stimuli.ts                 [B1]  popoverStress — background ScenarioStimulus toggling a popover via __devForcePopoverOpen (the useAutoPopoverPerf core, composable form).
│   │   └── types.ts                   [B2]  PerfScenario / ScenarioContext / QueryHandle / ScenarioStimulus / RangeOpts contracts.
│   │
│   ├── review/                               Spaced-repetition session.
│   │   ├── useMinting.ts              [B3]  Mint flashcards from boards (Go-board → backend mint payload).
│   │   └── useReviewSession.ts        [B3]  SR-session state machine: AWAITING_MOVE / INTERMISSION / FINISHED.
│   │
│   └── sgf/                                  SGF I/O.
│       ├── loadIntoBoard.ts           [B2]  loadSgfIntoBoard — parse + overwrite an existing board + navigate-to-leaf. The bare load primitive (fail-loud); useDirtyBoardGuard wraps it with the confirm-modal, the perf context calls it directly.
│       ├── useSgfDownload.ts          [B3]  Export the active board to an SGF file.
│       └── useSgfLoader.ts            [B3]  SGF file-dialog loader; parse + create-board sequence.
│
├── engine/                                  Pure Go-engine code: rules, SGF, KataGo wire, board rendering.
│   ├── analysis-config-curation.ts    [B3]  Bit-equivalent rewriter for KataGo `analysis_config` symbol bodies.
│   ├── board-geometry.ts              [B3]  SSOT for board rendering geometry (pad/cell/stoneR/toSVG, gridLines) + the BoardSnapshot position primitive; shared by renderBoardToSvg (string) and the Vue board components so projections can't drift.
│   ├── board-renderer.ts              [B3]  Pure SVG Go board rendering → string (v-html / ECharts-innerHTML sinks); geometry from board-geometry.
│   ├── constants.ts                   [B3]  Board geometry, stone-radius ratio, label-band width, etc.
│   ├── helper.ts                      [B1]  Piecewise cubic Hermite interpolation (pure math).
│   ├── navigator.ts                   [B3]  LCA-based game-tree traversal with setup-stone + capture tracking.
│   ├── rules.ts                       [B3]  Pure Go rules engine (legality, captures, ko).
│   ├── sgf-loader.ts                  [B3]  SGF parser → GameNode forest.
│   ├── sgf-writer.ts                  [B3]  GameNode forest → SGF serialisation.
│   ├── suggestion-colors.ts           [B3]  Pure colour utilities for move-suggestion overlays.
│   ├── tree.ts                        [B2]  Generic grid-based tree layout + tree-graph transforms.
│   ├── util.ts                        [B3]  Board / SGF coord helpers; active-variation traversal.
│   │
│   ├── analysis/
│   │   ├── clustering.ts              [B3]  Pure transposition-grouping utilities.
│   │   ├── filters.ts                 [B3]  Predicate type for analysis-turn inclusion.
│   │   └── stability-extractors.ts    [B3]  Curated KataGo extractor catalogue for stability-trajectory observations.
│   │
│   └── katago/                              KataGo wire-protocol surface. All B3.
│       ├── capability-injection.ts    [B3]  Pure builder for the per-query `capabilities` dict (proxy v1.0.14+).
│       ├── contract.ts                [B3]  KataGoClient black-box callback-registry contract.
│       ├── katago-client.ts           [B3]  WebSocket transport for KataGo analysis engine.
│       ├── types.ts                   [B3]  SSOT for KataGo wire types + enrichment envelope.
│       ├── version-probe.ts           [B3]  Pure parsers for `query_version` + `query_models` (SELECTOR-aware).
│       └── winrate-framing.ts         [B3]  Resolves and normalises `reportAnalysisWinratesAs` framing.
│
├── services/                                Effectful singletons: API calls, WebSocket clients, persistence.
│   ├── analysis-bundle/                      Analysis-bundle compression-v2 hierarchy (cross-arc).
│   │   ├── encoder.ts                 [B3]  BundleEncoder interface + JSON_PROJECTED_V1 + Q4/Q8 ownership × Q8-factored policy leaves (optional byte-XOR delta) + base64 helpers.
│   │   ├── projection.ts              [B3]  SPA-typed-shape allow-list with compile-time drift gate.
│   │   └── quantization.ts            [B3]  Q4 ownership + Q8-factored policy primitives for the lossy leaf.
│   ├── analysis-bundle.ts             [B3]  Pure projection ledger ↔ wire bundle.
│   ├── analysis-config.ts             [B3]  Palette compile + ledger hash.
│   ├── analysis-ledger.ts             [B3]  Per-(configHash, nodeId) merged KataGo packet store. Per-node version refs (pull consumers) + `onLedgerFlush` changed-key signal (incremental push consumers).
│   ├── analysis-persistence-service.ts [B3] HTTP boundary for analysis-bundle persistence (save/restore/discard).
│   ├── analysis-service.ts            [B3]  Bridges KataGo turns to the ledger nodes.
│   ├── api-client.ts                  [B1]  Pure REST client; JWT injection; zero-friction local auth.
│   ├── backend-service.ts             [B2]  ACL for the backend; wire snake_case → domain camelCase with branded ids.
│   ├── library-service.ts             [B1]  ACL for the /library endpoints; chunked import with progress callback.
│   ├── qeubo-service.ts               [B1]  ACL for qEUBO REST endpoints.
│   ├── resource-service.ts            [B1]  Typed client for backend static resources.
│   ├── stability-trajectory-store.ts  [B3]  Per-(configHash, extractor, nodeId) trajectory store fed by analysis-service preview ingestion.
│   └── sync-service.ts                [B1]  Stateless persistence bridge; identity-aware document sync.
│
├── store/                                   Single GlobalStore singleton + mutators + migrations.
│   ├── archived-migrations.ts         [B1]  Pre-v1.0.0 schema migrations (preserved for the framework's contiguity invariant).
│   ├── board-factory.ts               [B3]  Pure factory functions for board state construction.
│   ├── defaults.ts                    [B3]  Initial GlobalStore constants (board defaults dominate; some B1 too).
│   ├── index.ts                       [B3]  Central reactive store; createBoard / closeBoard / resetWorkspace.
│   └── migrations.ts                  [B1]  Schema-versioning framework (B1); the migrations themselves touch every band.
│
├── i18n/                                    vue-i18n integration.
│   ├── index.ts                       [B1]  createI18n configuration; bundled-catalog loading.
│   └── locales.ts                     [B1]  SupportedLocale registry + browser-detection helper.
│
├── locales/                                 vue-i18n catalogs.
│   ├── en.json                        [B1]  English source catalog (canonical).
│   ├── ja.json                        [B1]  Japanese (LLM-drafted, native-speaker review pending).
│   ├── ko.json                        [B1]  Korean (LLM-drafted, native-speaker review pending).
│   └── zh-CN.json                     [B1]  Simplified Chinese (LLM-drafted, native-speaker review pending).
│
├── types/
│   └── backend.ts                     [B1]  Generated OpenAPI types (committed; `npm run gen:api` rewrites).
│
├── utils/                                   Small DOM / chrome helpers.
│   ├── context-id-macros.ts           [B2]  `${a,b}` macro expansion for the Cards-tab context-id field.
│   ├── modifier-key.ts                [B1]  Platform-aware modifier-click detection (Cmd vs Ctrl, middle-button).
│   └── theme-color.ts                 [B1]  Runtime CSS-variable accessor for ECharts adapter configs.
│
├── lib/
│   ├── correlation.ts                 [B1]  Pairwise Pearson with NaN-pair dropping.
│   ├── distributions.ts               [B1]  Histogram binning (integer-aware + Freedman–Diaconis) and Gaussian-kernel KDE with Silverman's-rule bandwidth.
│   ├── dsl-harness.ts                 [B1]  Pipeline-DSL hyperparameter harness: JSON5+holes parser/formatter, validator, substitute.
│   ├── keybindings.ts                 [B1]  Keybindings registry substrate: declarative `KeybindingActionDecl` catalog, `ACTIONS` const, `effectiveKey` / `isActionEnabled` / `normalizeKey` / `validateKeybindingsRegistry` helpers. Authoritative list of every user-rebindable keyboard action. Phase 1 of `docs/notes/keybindings-plan.md`.
│   ├── keybindings-capture.ts         [B1]  Capture-mode + binding-mutation helpers for the editor (Phase 4): `captureMode` ref, `setBinding` / `resetBinding` / `resetAllBindings`, `RESERVED_KEYS`, `findActionByKey` conflict detection.
│   ├── knobs.ts                       [B1]  Knob-registry substrate: path-walk accessors, named-transform library, startup validation, ownership state machine, policy-aware writeKnobValue.
│   ├── stability-trajectory.ts        [B1]  Generic change-point-compressed V-axis trajectory + log-V-weighted stable-fraction.
│   ├── timing.ts                      [B1]  Central catalog of reactivity-coalescing windows (debounce/throttle intervals): individually-named, independently-tunable constants — the auditable tuning surface.
│   └── utils.ts                       [B1]  debounce helper (the only inhabitant; lib/utils merger flagged separately).
│
└── config/
    └── env.ts                         [B1]  Centralised reader for Vite environment variables.
```

## Maintaining this map

The full discipline lives in `frontend/CLAUDE.md`'s "File map"
section; in short:

- **Create** a file → add an entry here with one-line purpose
  and band tag, same PR.
- **Move** a file → update its entry's path.
- **Delete** a file → remove the entry.
- **Band change** during refactor → retag here, same PR.

Drift between actual dependencies and the band tag is the
silent-failure mode this map exists to surface; ADR-0005 Rule 5
applies (file location reflects content, and that includes
this map's representation of the layout).

**Immature files.** Honest representation beats clean-sounding
lies. Entries for files whose purpose is still maturing should
say so — `"Experimental: …"`, `"Scaffold for …"`, or a
description naming the current uncertainty. The band tag can
also be **`[B?]`** (unclassified) for files whose
domain-coupling hasn't crystallised yet. Refining the entry as
the file's role firms up is the expected path; pretending
settled purpose where there isn't any is the failure mode this
allowance prevents.

A future scripted check could validate that every file under
`src/` appears here, and complain on drift. Out of scope for
v1 of this map; flag as follow-up if the manual cadence proves
unreliable.
