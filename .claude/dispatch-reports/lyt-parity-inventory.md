# Parity inventory — FEATURES.md vs rendering surfaces (layout-rework merge checklist source)

*Scout-produced 2026-08-10 (read-only sweep of FEATURES.md end to end + FILES.md grounding);
orchestrator-persisted verbatim for the W1–W5 builders and reviewers. Legend: Chrome = lives
in App.vue's skeleton (replaced by the rework); Panel = tab body or App-root modal (reused
verbatim; only its docking point changes).*

## Chrome-mounted features (each individually parity-verified)
- Stone placement/rules, ghost stone, move numbers, last-move, coordinates: BoardWidget/BoardDisplay in #board-area
- Board rail / multi-board tabs / hover shelf: SidebarWidget, BoardTab, MiniBoard (geometry-coupled: virtualized rail; G7 fixed-width rail)
- SGF import/export toolbar entries; engine controls (connect/status/metrics/URI/model select); STOP MATCH button
- Board overlays: MoveSuggestions (+ move filter overlay half), BoardHeatmapOverlay, BoardVariationsOverlay
- StatusBar contents (incl. narrow-mode segment-priority collapse), toolbar-move-nav, Pass, annotate
- LocalePicker, UserBadge (toolbar); ToolbarSliderPopover, PboPopover (edge-clamped popovers)
- Setup Tool Palette: DOCKED in-toolbar, position:static, visibility-hidden toggle — commissioner no-occlusion ruling, categorical
- SystemLogPanel (collapsible bottom bar + auto-reveal) — geometry-coupled; W4 overlay ruling applies

## Panel features (bulk sweep: mounts-and-reachable)
- Analysis tab: dashboard, charts, timeline/rugplot, palettes, range re-analysis, adaptive re-eval [experimental], bundles
- Cards tab: minting, decks/DSL, review session states, per-card visit override, Browse/ForestDirectory, card-tree forest, inner tree resizer (RULED: untouched, panel-internal)
- Library tab: import, virtual-scroll table, filters, preview pane (geometry note: twoColumnReflow fed by panel's own width — re-verify breakpoint)
- Settings tab: palette editor, analysis layout editor, registry editor, card-set editor, keybindings view
- Other tab: knob registry, qEUBO bookmarks, gradient calibration
- App-root modals: EngineMatchModal, MintCardModal, LearnPathModal, LoginModal, wizard (all outside chrome tree — unaffected)

## The nine geometry-coupled behaviors (priority list; homes per roadmap §4)
1. OUTER/INNER resizers — session.ui.treeControlRegionWidthPx / treePanelWidthPx, sole-writer-each (L4 verbatim)
2. Cards-tab inner tree resizer — RULED panel-internal, untouched
3. Sidebar collapse rail — superseded by boardRail presence slot / popover (both, setting selects — row 1743)
4. workspaceAxisColumn narrow-mode — subsumed by portrait screen class
5. StatusBar segment-priority collapse — content behavior, re-verify vs new width source
6. Setup palette no-occlusion ruling — named toolbar slot, ruling comment travels
7. LibraryTab twoColumnReflow — re-verify breakpoint vs new control-panel sizing
8. Pointer-target 24px floor — existing test polices new chrome
9. Popover edge clamps — visual re-check per popover vs new toolbar geometry

## Keyboard + state notes
- No chrome-toggle keybindings exist (collapse toggles are raw @click); display.* bindings are board-content toggles (survive)
- session.ui layout fields: activeTab; sidebarExpanded/treeExpanded/controlsExpanded/boardExpanded/systemLogExpanded (migrate W2 per roadmap §5); treeControlRegionWidthPx/treePanelWidthPx (kept, W3); analysisLayout (panel-internal)

## FEATURES.md staleness at merge (W5 doc pass)
- "Workspace and chrome" section rewrite (resizable-layout bullet describes the replaced mechanism)
- Pre-existing: Tabs bullet lists 4 tabs, code has 5 (Library) — fold into same pass
