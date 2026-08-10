# LYT → Vue realization roadmap (for commissioner ratification)

*Drafted 2026-08-10 by the orchestrator on the parity inventory (scout, this date), the
clean-room mockups (lyt-phase2 @ d2759153), and the commissioner's rulings: merge bar =
functional completeness ("usable for the purpose OmegaGo was built"); the rework is a
skeleton replacement with components mapped mutatis mutandis, NOT a recreation.*

## 1. Objective and merge bar

Replace `App.vue`'s chrome skeleton (the layout half: nested flex containers, toolbar
rows, collapse rails, resizers, embedded layout CSS, plus `layout-model.ts`'s geometry
policy) with the LYT clean-room skeleton — per-node single-axis grids compiled from the
ratified encodings (ledger row 1704) — mounting every existing component unchanged into
its leaf. The branch merges to `next` only when the FEATURES.md-derived parity checklist
(§6) is fully green and the commissioner's own use confirms it.

## 2. What is replaced vs reused (from the parity inventory)

**Replaced (the skeleton):** `App.vue`'s `#main-area`/`#board-area`/`#tree-control-wrapper`
structure and layout CSS; `#resizer-outer`/`#resizer-inner`; the sidebar collapse rail and
right-toggles cluster (superseded by the corner presence menu); toolbar row *structure*
(clusters regrouped per the census — the buttons themselves are reused); the five
`session.ui.*Expanded` toggles' UI (state migrates, §5).

**Reused verbatim (everything else):** the board stack (BoardWidget/BoardDisplay and all
overlays), TreeWidget, the control panel's five tabs and all their contents, every modal,
the wizard, StatusBar's contents, the toolbar's buttons/popovers, the entire
engine/store/service layer. Engine data remains one stream with consumers as taps
(commissioner's correction on record): no upstream changes whatsoever.

## 3. Compilation story

The mockups' generated per-node grid CSS is the skeleton's blueprint. Realization shape:
a new `AppLayout` chrome component (or small family, one per orientation class) whose
grid structure is derived mechanically from the encoding — hand-authored but
line-for-line traceable to the LYT declaration, with the conformance harness verifying
rendered-vs-solved per class as the drift gate. Full SFC codegen is deliberately NOT
committed to in this phase (premature; revisit if hand-derivation drifts twice —
ADR-0011 Rule 2). The existing `useDeferredLayoutClass` hysteresis machinery is retained
with its derivation swapped to nearest-neighbor over the encoding's screen classes
(spec §4.4: the composable keeps its commit discipline).

## 4. The nine geometry-coupled behaviors — each gets an explicit home

1. **Resizers (OUTER/INNER, drag persistence)** — L4 verbatim: persisted drags override
   solved constants per slot. Realized as grid-track drag handles writing the same two
   session fields (`treeControlRegionWidthPx`, `treePanelWidthPx`); paint 1px / grab 4px
   per the standing ruling.
2. **Narrow-mode collapse (`workspaceAxisColumn`)** — subsumed by screen classes: the
   portrait-class tree IS the stacked layout. The class swap replaces the bespoke
   computed; hysteresis machinery unchanged.
3. **StatusBar segment-priority collapse** — content behavior inside its slot; reused
   as-is, re-verified against the new board-area width source.
4. **Sidebar rail** — the boardRail presence slot (default OFF, commissioner may flip;
   popover fork recorded row 1736 for later decision).
5. **Setup palette no-occlusion ruling** — hard constraint carried forward: the palette's
   reserved in-flow docking point is a named slot in the toolbar region of the encoding;
   the ruling comment travels with the component.
6. **Pointer-target floor** — the existing test suite polices the new chrome; every
   chrome-hosted control keeps ≥24px effective targets.
7. **Popover edge-clamping** — anchor-relative, survives remount; visual re-check per
   popover against the new toolbar geometry.
8. **LibraryTab `twoColumnReflow`** — panel-internal container query fed by the panel's
   own width; re-verify its breakpoint against the new control-panel sizing.
9. **System log** — OPEN DECISION (§7): preserve slot (always-reserved band) vs overlay
   stratum. Its auto-reveal is system-driven, so L1 forbids the current push-down shape.

## 5. Presence menu and state migration

The corner presence menu becomes the real settings surface for panel visibility,
replacing the five `*Expanded` toggles' scattered buttons. Schema migration maps:
`sidebarExpanded`→boardRail presence, `treeExpanded`→(tree is always visible —
commissioner ruling; field retires), `controlsExpanded`→panels T-group presence,
`boardExpanded`→(board is never optional; field retires), `systemLogExpanded`→per §7
decision. Rolling-archive discipline; dead fields dropped per the 61→62 precedent.
previewBoard joins as a new presence entry (default OFF).

## 6. Parity checklist (the merge gate)

Derived from FEATURES.md by the scout's inventory; maintained as a checked table in the
branch. Categories: (a) Panel features — verification = "mounts and is reachable"
(bulk; one sweep); (b) Chrome features — each individually verified (the toolbar's
capabilities, board overlays, status bar, engine controls, locale picker, user badge);
(c) the nine geometry behaviors above — each with its named verification; (d) FEATURES.md
doc pass at merge (the Workspace/chrome section rewrite; the pre-existing tab-count
staleness folds in). The conformance harness green per class and the full test suite
green are standing prerequisites, not checklist items.

## 7. Open decisions for the commissioner — ALL RESOLVED (2026-08-10, ledger row 1743)

Resolutions: (1) banners + system log = overlay stratum, never occluding the board;
(2) board rail = user-configurable between BOTH styles — toggleable slot via the corner
presence menu, or popover behind a badge-like trigger co-located near the user badge /
presence-menu corner (W2 scope grows accordingly); (3) Cards-tab inner resizer
untouched, control panel a black box; (4) debug widgets = the portrait mockup's menu
shape, debug builds only. The original questions are preserved below as drafted.

### As originally drafted (blocking the affected wave only)

- **Banners (capture/save) and system log**: preserve slot (costs board area — the
  ~300px lesson) vs overlay stratum with occlusion declarations. Recommendation:
  overlay, never occluding the board.
- **boardRail default** (OFF shipped; his to flip) and the popover fork (row 1736).
- **Cards-tab inner tree resizer**: classified panel-internal (recommendation: untouched
  by the rework).
- **Debug widgets**: mockup relegated them to an inert pill; real app keeps them
  dev-build-only — recommendation: a debug entry in the presence menu, dev builds only.

## 8. Waves (each: build → review → conformance harness → commissioner eyeball)

- **W1 — skeleton + static mounting**: AppLayout grids per class; board composite,
  tree, tab group, toolbar clusters, status bar mounted; no toggles, no resizers;
  parity sweep (a)+(b) starts here. The app must already be *usable* at W1 exit.
- **W2 — presence menu + state migration** (§5) + boardRail/previewBoard slots
  (previewBoard mounts the MiniBoard machinery as its first content).
- **W3 — resizers (L4 drags) + screen-class swap** (narrow mode via portrait class).
- **W4 — the remaining geometry behaviors** (status bar re-verify, popover checks,
  LibraryTab reflow, palette docking) + banners/system-log per §7 ruling.
- **W5 — parity audit**: checklist walked to green, FEATURES.md rewritten, doc-graph
  regenerated, full-suite + harness + power-set green; then the commissioner's own
  usage verdict, then merge.

Estimated shape: W1 is the largest single wave; W2–W4 are moderate; W5 is audit. All on
`lyt-phase2`. `next` maintenance continues in parallel throughout.
