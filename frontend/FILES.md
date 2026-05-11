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
- `docs/handoff-current.md` — system-level orientation.
- `docs/adr/0003-frontend-portability-and-domain-boundaries.md` —
  the canonical band definitions referenced below.
- `docs/notes/frontend-source-tree-reorganization.md` — why the
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
│   ├── ReviewSessionPanel.vue         [B3]  In-session SR controls: status, counter, intermission chart, hint visibility.
│   │
│   ├── board/                                Go-board surface. Renderers + overlays.
│   │   ├── BoardDisplay.vue           [B3]  Stateless SVG Go board with stone gradients, hoshi, last-move ring, move-number text.
│   │   ├── BoardHeatmapOverlay.vue    [B3]  Stateless per-intersection heatmap (ownership / liveness / dots).
│   │   ├── BoardTab.vue               [B3]  Tab row in the board-list rail (label, close, rugplot, activity dot).
│   │   ├── BoardVariationsOverlay.vue [B3]  Sibling-variation rings + active-next-move hint on the board.
│   │   ├── BoardWidget.vue            [B3]  Hosts BoardDisplay + overlays + MoveSuggestions; computes derived view-model.
│   │   ├── MoveSuggestions.vue        [B3]  KataGo move-suggestion overlay; PV preview on hover; paste-pv on modifier/middle-click.
│   │   └── StatusBar.vue              [B3]  Move number, player names, komi, turn indicator, captures, transient hint, # toggle.
│   │
│   ├── charts/                              ECharts wrappers. Mostly B2/B3; the renderer itself is generic.
│   │   ├── AnalysisChartPanel.vue     [B3]  Standardised analysis chart panel host (visits, winrate, scoreLead, …).
│   │   ├── AnalysisDashboard.vue      [B3]  Orchestrator binding chart panels to useChartNavigation.
│   │   ├── AnalysisTimelinePanel.vue  [B3]  Rug-plot timeline + visits input + "Analyse selection" controls.
│   │   ├── BaseChart.vue              [B1]  Generic ECharts wrapper with module-scoped legend memoisation.
│   │   ├── card-tree-echarts.ts       [B2]  ECharts node/tooltip composer for the card-tree forest.
│   │   ├── CardTreeWidget.vue         [B2]  Card-tree forest display (one tree-section per CardLineageTree, accordion).
│   │   ├── ColorDebugStrip.vue        [B1]  Dual-track gradient-calibration debug strip.
│   │   ├── HeatmapChart.vue           [B1]  Stateless ECharts heatmap renderer.
│   │   ├── PlayerPanel.vue            [B3]  Per-player (B/W) stat panel.
│   │   ├── ScoreLeadPanel.vue         [B3]  ScoreLead chart panel.
│   │   └── StabilityPanel.vue         [B3]  Triangular multiresolution-interval heatmap.
│   │
│   ├── chrome/                              Application shell. Generic UI primitives.
│   │   ├── FloatingThumbnail.vue      [B1]  Generic floating thumbnail tooltip.
│   │   ├── LocalePicker.vue           [B1]  Top-nav locale picker (flag + native name).
│   │   ├── RootErrorBoundary.vue      [B1]  Catches descendant errors, logs via ADR-0002, renders fallback.
│   │   ├── SidebarWidget.vue          [B1]  Sidebar layout container.
│   │   ├── SystemLogPanel.vue         [B1]  Always-visible system log bar with idle row.
│   │   ├── TabWidget.vue              [B1]  Controlled tabbed navigation.
│   │   ├── Toolbar.vue                [B3]  Application toolbar (engine controls, match button, ponder controls, …).
│   │   └── UserBadge.vue              [B1]  Auth-identity badge; opens LoginModal on click.
│   │
│   ├── editors/                             Settings / palette / pipeline editors.
│   │   ├── AnalysisControls.vue       [B3]  Per-board analysis controls (engine status, palette picker, bundle persistence, …).
│   │   ├── CardSetEditor.vue          [B2]  Master-Detail Tree-DSL pipeline editor (CodeMirror 6).
│   │   ├── PaletteEditor.vue          [B3]  Master-Detail Analysis-Environment editor.
│   │   └── RegistryEditor.vue         [B1]  Generic managed-registry editor with defaults and structural protection.
│   │
│   ├── modals/                              Dialog modals. Mostly B1 (generic UX) with two B3 (engine/SGF-touching).
│   │   ├── ConfirmLoadModal.vue       [B1]  "Save / discard / cancel" dirty-board dialog.
│   │   ├── EngineMatchModal.vue       [B3]  Engine-vs-engine match config (model picker, visits, num moves).
│   │   ├── LoginModal.vue             [B1]  Sign-in / register / switch-user / sign-out.
│   │   └── MintCardModal.vue          [B3]  Flashcard mint dialog (SGF → backend mint).
│   │
│   ├── qeubo/                               qEUBO calibration UI surfaces.
│   │   ├── QeuboBookmarks.vue         [B1]  Bookmark list (A/B candidates). Independent of experiment lifecycle.
│   │   └── QeuboToolbar.vue           [B1]  Audition toggle / verdict pair / apply / pin / phase indicator.
│   │
│   └── tree/                                Tree-shaped surfaces: game tree, forest directory, timeline.
│       ├── ForestDirectory.vue        [B2]  Master-Detail database explorer (Decks tab + Browse tab + chart).
│       ├── ForestTreeNav.vue          [B2]  File-manager-style hierarchical navigator (games → roots).
│       ├── HorizontalTimelineVisualizer.vue [B2]  Horizontal timeline of cards / reviews.
│       └── TreeWidget.vue             [B2]  SVG game-tree viewer; enforces current-node-visible invariant via ensureVisible.
│
├── composables/                             Logic layer. Pure-ish functions over reactive refs.
│   ├── useEngineControls.ts           [B3]  Engine connect / disconnect / toggle lifecycle.
│   ├── useNavigation.ts               [B2]  Headless navigation within the game tree (next/prev/parent/child).
│   ├── useQeubo.ts                    [B1]  qEUBO experiment state machine + audition + verdict.
│   ├── useScopedScroll.ts             [B1]  Wheel-event scoped scroll (board + tree both consume).
│   ├── useTransientHint.ts            [B1]  Module-scoped reactive hint string surfaced by StatusBar.
│   ├── useTransientLogReveal.ts       [B1]  Auto-reveals system-log panel on error/warning bursts.
│   ├── useUserIORegistry.ts           [B2]  Hardware-event → domain-verb adapter (keyboard nav, suggestion toggle, …).
│   │
│   ├── analysis/                             KataGo-derived view models and chart wiring.
│   │   ├── useActivityDecay.ts        [B1]  Leaky-integrator exponential-decay model (generic math).
│   │   ├── useAnalysisProjection.ts   [B3]  Projects raw board + analysis ledger to UI-ready view model.
│   │   ├── useAnalysisTimeline.ts     [B3]  Owns the chart selection range + visit-vector from the ledger.
│   │   ├── useChartNavigation.ts      [B3]  Pure black-box click+thumbnail handler for analysis charts.
│   │   ├── useEChartsForestRender.ts  [B2]  Per-tree ECharts lifecycle (init, dispose, resize) for card-tree forests.
│   │   ├── useEnrichedData.ts         [B3]  Reactive transformation of enriched KataGo packets.
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
│   │   ├── useDirtyBoardGuard.ts      [B3]  Dirty-board guard: confirm-load modal, SGF parse, navigate-to-leaf.
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
│   │   ├── useCardTreeProjection.ts   [B2]  Pure projection: forest + active-set + manual-expand → role-annotated render forest.
│   │   └── useThumbnailCache.ts       [B3]  Shared board-thumbnail cache (module-scoped Map).
│   │
│   ├── chrome/                               UI-shell composables.
│   │   ├── useLocale.ts               [B1]  Locale read/write through GlobalStore + supported-locale registry.
│   │   └── useResizablePanel.ts       [B2]  Horizontal resize-bar between tree and control panels.
│   │
│   ├── forest/                               Forest / game-tree expansion + navigation.
│   │   ├── useForestBrowsePolicy.ts   [B2]  Forest-Directory selection → fetch-behaviour dispatcher.
│   │   ├── useForestNavigation.ts     [B2]  Tree-shaping for the file-manager-style navigator (games → roots).
│   │   ├── useTreeExpansion.ts        [B2]  Variation-hiding expansion state; enforces "current-always-visible" invariant.
│   │   └── useTreeLayout.ts           [B2]  Pluggable tree-layout composable (watchEffect-driven).
│   │
│   ├── review/                               Spaced-repetition session.
│   │   ├── useMinting.ts              [B3]  Mint flashcards from boards (Go-board → backend mint payload).
│   │   └── useReviewSession.ts        [B3]  SR-session state machine: AWAITING_MOVE / INTERMISSION / FINISHED.
│   │
│   └── sgf/                                  SGF I/O.
│       ├── useSgfDownload.ts          [B3]  Export the active board to an SGF file.
│       └── useSgfLoader.ts            [B3]  SGF file-dialog loader; parse + create-board sequence.
│
├── engine/                                  Pure Go-engine code: rules, SGF, KataGo wire, board rendering.
│   ├── analysis-config-curation.ts    [B3]  Bit-equivalent rewriter for KataGo `analysis_config` symbol bodies.
│   ├── board-renderer.ts              [B3]  Pure SVG Go board rendering (used by thumbnails).
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
│   │   └── filters.ts                 [B3]  Predicate type for analysis-turn inclusion.
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
│   ├── analysis-bundle.ts             [B3]  Pure projection ledger ↔ wire bundle.
│   ├── analysis-config.ts             [B3]  Palette compile + ledger hash.
│   ├── analysis-ledger.ts             [B3]  Per-(configHash, nodeId) merged KataGo packet store.
│   ├── analysis-persistence-service.ts [B3] HTTP boundary for analysis-bundle persistence (save/restore/discard).
│   ├── analysis-service.ts            [B3]  Bridges KataGo turns to the ledger nodes.
│   ├── api-client.ts                  [B1]  Pure REST client; JWT injection; zero-friction local auth.
│   ├── backend-service.ts             [B2]  ACL for the backend; wire snake_case → domain camelCase with branded ids.
│   ├── qeubo-service.ts               [B1]  ACL for qEUBO REST endpoints.
│   ├── resource-service.ts            [B1]  Typed client for backend static resources.
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
