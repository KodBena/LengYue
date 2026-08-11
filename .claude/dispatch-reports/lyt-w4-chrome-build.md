# W4 — chrome finishing pass (build report)

Slug: `lyt-w4-chrome`. Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a4228b6ed3fec5360`.
Branch: `worktree-agent-a4228b6ed3fec5360`. Commit: `50d1b289` (post-rebase).

Driven by the commissioner's 2026-08-11 screenshot check-in (ledger row 1848),
per `.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W4.

## Base freshness

- First act: fetched, verified `lyt-phase2` at `bc0d6ea2` (the required
  minimum), rebased HEAD onto it cleanly.
- Mid-build, `lyt-phase2` advanced twice (`118ae6e1`, `da324ca6` — two
  research-only "synthesis spike" commits, zero overlap with any file this
  commission touches). Re-fetched, re-rebased cleanly after committing.
- **Delivery-time merge-base: `da324ca6c408af65de80d767ac087128033ade59`**
  (== `lyt-phase2`'s own tip at delivery; `origin/lyt-phase2` matched, no
  further movement).

## Per-item status (all WITNESSED)

**1. Banners + system log → overlay stratum.** WITNESSED. `App.vue`'s
`#lyt-overlay-stack` (`position: fixed`, opaque `--surface-0`-backed,
anchored above the corner presence-menu cluster, `z-index:
var(--z-chrome-overlay)`) now hosts the keybinding-capture banner, the
workspace-save-error banner, and `SystemLogPanel`, each with its exact
pre-existing `v-if` gate unchanged. Live probe confirms zero movement of
`#board-square`/`#split-workspace`/the toolbar strip across every toggle,
and that the overlay's own rect never intersects `#board-square`'s.
`systemLogExpanded`'s field semantics are unchanged (still "does the user
want the log visible") — only the render target moved — so **no 76→77
schema migration was needed**, a disclosed judgment call (the commission
framed the migration as conditional: "field migrates or retires per what
you build").

**2. Toolbar strip structure.** WITNESSED. `ToolbarEngineMetrics.vue`'s
winrate/scoreLead/pps/latency cells now carry `ch`-based `min-width`
envelope reservations (`text-align: right` so growth fills the reserved
cell rather than shifting neighbours). Two real bugs found and fixed along
the way: `ToolbarSliderPopover.vue`'s "SLIDERS11" and
`EngineQueueTooltip.vue`'s analogous concatenated-text defect were both
caused by borrowing a `.metric` class name whose actual flex/gap layout
lived in a **different** SFC's `<style scoped>` block (scoped styles don't
cross SFC boundaries even on a shared class name) — each component now
declares its own layout rule. SLIDERS is now a real `<button>`. Load/Save
SGF has one home (the toolbar strip); the duplicate in `SidebarWidget.vue`
(`.board-actions`) is removed, disclosed in that file's own header comment.
SETUP's docking (`SetupToolPalette.vue`) was already correct per its own
extensively-documented commissioner ruling — no change needed there.

**3. Popover z-index.** WITNESSED. New `--z-popover-chrome` (1000) /
`--z-chrome-overlay` (2000) role aliases added to `theme.css`'s ladder
(per the ladder's own "add a role alias, not a new tier" guidance). Every
toolbar/corner-chrome popover (presence menu, rail popover, sliders, PBO,
queue tooltip, locale picker, the new debug menu) now uses the shared
token instead of ad hoc literals — `EngineQueueTooltip.vue`'s hardcoded
`100` (lower than its siblings' `1000`) was the concrete occlusion bug a
commissioner screenshot likely caught. Live probe opens each popover and
asserts `elementFromPoint` at its own center resolves inside it, not an
occluding sibling.

**4. MiniBoard clamp.** WITNESSED. `LytNode.vue` now emits `minmax(0px,
Npx)` instead of a rigid `Npx` grid track for a fixed-shape ASPECT leaf
(today, only `previewBoard`), so the cell can shrink under container
squeeze instead of forcing the row to overflow the viewport.
`PreviewBoardPanel.vue` sizes via `min(100cqw, 100cqh)` so the leaf stays
square and fully visible regardless of the cell's own (possibly non-
square) shape. **First draft used `aspect-ratio: 1/1` with both
width/height pinned to 100% — the live probe caught this as INERT** (CSS
`aspect-ratio` only derives a dimension left `auto`; with both pinned it
has nothing to compute) at 900×600: measured 133×204, not square. Fixed
to the container-query idiom `LytNode.vue`'s own header comment already
documents; re-probed square at 900×600.

**5. Debug widgets → debug menu.** WITNESSED. New `DebugMenu.vue`, a
pill-shaped trigger (`.debug-pill`, fully rounded) opening a popover
listing Clear Cache / Auto-Nav Perf / Popover Stress / Jank Test — all
four relocated verbatim (same i18n keys, same disabled/title logic, same
`btn-connected`/`running` active-state classes, re-declared locally per
the same cross-SFC-scoping lesson item 2 surfaced) from `Toolbar.vue`'s
`.engine-controls` cluster and `SidebarWidget.vue`'s board rail. Gated
`v-if="isDevBuild"` (`import.meta.env.DEV`). **Disclosed finding, not a
regression**: `npm run build`'s dist output still contains the compiled
code and string literals for dev-only affordances despite the DEV-folded
`false` — Vite's default minification doesn't trace the constant far
enough through Vue's compiled render function to eliminate the branch.
This is a **pre-existing** characteristic (the original `Toolbar.vue`
clearCache comment, before this file existed, made the identical
"dead-code-eliminate" claim under the same mechanism) — verified true
before my change too, not something this pass introduced or could fix
within a chrome-layout-scoped commission. What IS verified: the menu
never RENDERS/mounts in a production build (the `v-if` gate is real).

**6. Floor softening.** WITNESSED, re-solved not asserted on faith. See
table below.

## Floors lowered (research/lyt/encodings/lengyue_landscape.lyt)

| Floor | Before | After | Live-render effect? |
|---|---|---|---|
| Side column's own declared `min` (root path `2`) | 480px | 280px | YES — this track is only JS-overridden when the user has dragged the OUTER resizer; the default (undragged) case renders this value directly |
| T-node children's per-child `min` (5× `CP-*` leaves) | `WRAPPER_MIN` sentinel (300px, shared Python constant `loader.WRAPPER_MIN_PX`) | literal `160px`, scoped to this ONE encoding | YES — this track is never JS-overridden |
| `tree` leaf's fixed extent (min=pref=max) | 140px | 110px | **NO** — `useResizablePanel.ts`'s `effectiveTreePanelWidthPx` unconditionally overrides this leaf's compiled track at Vue-runtime (`App.vue`'s `lytTrackStyleOverrides`); this number is consulted only by the offline CP-SAT solver, verified dead for rendering before lowering it |

Gaps were **not** touched (Amendment 3's own "rhythm is not negotiable
under board-maximization" principle, respected verbatim). The `WRAPPER_MIN`
lever was deliberately **not** lowered as the shared global constant — that
would have silently moved `current_row_repaired.lyt`/`current_row_asis.lyt`
(two unrelated historical fixtures) too; instead this encoding now declares
its own literal, scoped to exactly this file.

**Net effect** (re-solved via `research/lyt`'s own pytest suite, not
hand-derived): under the **default** presence valuation (the realistic,
shipped case — boardRail/previewBoard absent), the three previously-
`INFEASIBLE` landscape sizes (1280×1024, 1024×700, 900×600) are now
`OPTIMAL`. Under **all-present** (every release-toggle forced visible),
those same three sizes remain genuinely `INFEASIBLE` — this is the
"all-preserve-slots-present valuation may legitimately remain INFEASIBLE
at small sizes" carve-out the commission's own instructions name
explicitly, so those three stay pinned. One side effect, disclosed:
all-present/1366×768 (previously `INFEASIBLE`) also flips `OPTIMAL` — a
strict widening of the feasible region, since lowering a `min` can only
ever add newly-feasible points. `lyt-layout.gen.ts` regenerated via the
documented chain (`python emit_layout_tree.py --registration landscape`);
`research/lyt` pytest: 120/120 green (113 pre-existing + 7 from
`lyt-phase2`'s own advance, none touched by this pass).

## Probe-isolation evidence

Dev server launched with `VITE_API_BASE_URL=http://127.0.0.1:19101` /
`VITE_KATAGO_WS_URL=ws://127.0.0.1:19102` (both dead scratch ports, nothing
listening), served on `19173` — all three ports ≥19100, none of the
forbidden live ports (`5173`/`5174`/`4173`/`8764`). Launched and probed
under `systemd-run --user --scope -p MemoryMax=4G`. The probe
(`.claude/dispatch-reports/lyt-w4-chrome-probe.mjs`) instruments every
Playwright network request and asserts none ever targeted
`127.0.0.1:8764`/`:1235`/`:1242` — final assertion output:

```
PASS  PROBE ISOLATION: no request ever targeted 127.0.0.1:8764/:1235/:1242 (live backend/engine ports)
```

Full run (final, after fixing the two findings above):

```
Resolved engine URL (profile setting, may be unset -> env fallback applies): ws://127.0.0.1:1242
PASS  save-error banner: #board-square rect unchanged
PASS  save-error banner: #split-workspace rect unchanged
PASS  save-error banner: toolbar strip rect unchanged
PASS  save-error banner overlay never intersects #board-square
PASS  system-log overlay: #board-square rect unchanged
PASS  system-log overlay: #split-workspace rect unchanged
PASS  system-log overlay never intersects #board-square
PASS  presence menu: trigger present
PASS  presence menu: popover opens
PASS  presence menu: elementFromPoint at its center resolves inside it (not occluded)
PASS  DEBUG menu: trigger present
PASS  DEBUG menu: popover opens
PASS  DEBUG menu: elementFromPoint at its center resolves inside it (not occluded)
PASS  SLIDERS trigger present
PASS  SLIDERS: popover opens on hover
PASS  SLIDERS: elementFromPoint at its center resolves inside it (not occluded)
PASS  previewBoard rect stays within viewport horizontally at 900x600
PASS  previewBoard rect stays within viewport vertically at 900x600
PASS  previewBoard stays square (+-2px) even if shrunk
PASS  previewBoard has nonzero size (not collapsed to 0)
PASS  DEBUG pill is present in this DEV build
PASS  PROBE ISOLATION: no request ever targeted 127.0.0.1:8764/:1235/:1242 (live backend/engine ports)

ALL CHECKS PASSED
```

(Note: `Resolved engine URL` above reads the built-in fallback constant,
`ws://127.0.0.1:1242` — the user's PROFILE setting is empty by default on
a fresh workspace; the actual WebSocket the app would attempt is
`VITE_KATAGO_WS_URL`, `ws://127.0.0.1:19102`, per `analysis-service.ts`'s
documented resolution order. The probe's own request-log instrumentation
is what actually confirms no connection reached a live port — not this
printed profile-setting read, which is included only as an orientation
line.)

Dev server + probe processes cleaned up after the run (`systemctl --user
stop`, verified no leftover `vite --port 19173` process).

## Committed tests

- `frontend/tests/unit/lyt-w4-chrome.test.ts` (new, 30 assertions) — Tier
  1 source-text guards for all five frontend items: overlay-stack
  structure/z-index, envelope-reserved metric cells, the popover
  z-index-token sweep across all seven sites, the LytNode/PreviewBoardPanel
  containment fix, DebugMenu's dev-gating and pill shape, and the
  four-affordance relocation (no stray imports left in `Toolbar.vue`/
  `SidebarWidget.vue`).
- `frontend/tests/integration/DebugMenu-popover-stress-disabled.test.ts`
  (renamed+retargeted from `Toolbar-popover-stress-disabled.test.ts`) —
  the M8(a) popover-stress-honesty regression guard, moved to its new
  mount site.
- `frontend/tests/unit/pointer-target-minimum-size.test.ts` — the obsolete
  `.board-action-btn` 24px-floor block replaced with equivalent coverage
  for `.sliders-trigger`/`.debug-pill`/`.debug-item`.
- `frontend/tests/unit/sidebar-widget-stacked-sgf-buttons.test.ts` —
  deleted (the feature it tested, `.board-actions`, was removed).
- `research/lyt/tests/test_lyt.py` / `test_emit_layout_tree.py` — updated
  pins for the three lowered floors (see table above).
- `.claude/dispatch-reports/lyt-w4-chrome-probe.mjs` — the live Playwright
  probe (see evidence above), following `lyt-w3-resizers-probe.mjs`'s own
  established pattern (`window.store` DEV-only console handle, dead-port
  isolation).

## Gate exit codes (foreground, explicit timeout, literal codes)

- `npx vitest run`: **0** (3025 passed, 8 skipped, 240 files)
- `npx vue-tsc -b`: **0** (clean)
- `npm run build`: **0** (clean)
- `research/lyt` `pytest tests/ -q`: **0** (120 passed)

`npx eslint .` (not a mandated gate, run as a bonus check): exit 1, but
all 19 errors are pre-existing `cast-hygiene` debt on `lyt-phase2`'s own
base in files this commission never touched (verified against
`lyt-phase2`'s own committed content directly) — `AnalysisDashboard.vue`,
`chart-data.ts`, `LibraryTable.vue`, `WizardStepPalette.vue`,
`batch-mint-core.ts`, `useMinting.ts`, `ProxyUpstreamSettingField.vue`,
`SettingsTab.vue`. Zero new lint errors from this pass's own files
(verified via a scoped `eslint` run against exactly the changed/new
files).

## Disclosed judgment calls

1. **No 76→77 schema migration for `systemLogExpanded`** — the field's
   semantics are unchanged (still "user wants the log visible"); only its
   render target (in-flow → overlay) changed. The commission itself framed
   this as conditional ("migrates or retires per what you build").
2. **Side column's floor lowered to 280px without a live measured-sweep
   re-verification** — the W1 REPAIR precedent this number descends from
   (480px) was itself derived from a Playwright width-sweep of the fully-
   mounted Toolbar; this pass's 280px is a disclosed estimate (justified
   by item 2's own compacting work — envelope cells, a real SLIDERS
   button, one home for Load/Save — plus the toolbar's proven flex-wrap
   degradation), not independently re-swept at the new number. Named as
   the open confirmation a follow-up wave should close if a tighter number
   matters.
3. **`WRAPPER_MIN` scoped to a literal rather than lowering the shared
   Python constant** — avoids a cross-boundary side effect on two
   unrelated historical fixtures (`current_row_repaired.lyt`/
   `current_row_asis.lyt`) outside this item's scope.
4. **Overlay-stack anchor position** — bottom-right, stacked above the
   existing corner-chrome cluster (a `calc(var(--space-medium) + 40px)`
   offset — a conservative estimate of one pill/button row's height, not
   a live-measured number the way the corner-chrome cluster's own
   footprint could in principle be swept). Reuses the SAME corner
   `#lyt-corner-chrome` already argues is provably outside `#board-square`
   in both screen classes, rather than deriving a new anchor's safety
   from scratch.
5. **DEBUG menu's production bundle-stripping claim** — corrected mid-build
   after `npm run build` showed the compiled code/strings still ship
   (verified pre-existing, not a regression); the component's own header
   comment now states precisely what was verified ("never renders") versus
   what wasn't ("never ships").
6. **SETUP palette docking** — audited, found already correct per its own
   standing commissioner ruling (in-flow, `position: static`, reserved
   space at all times); no change made. If the commissioner's screenshot
   showed something else, it may reflect a build predating that fix, or a
   narrow-viewport wrap interaction this pass didn't specifically probe.

## Biggest concern

Item 6's side-column floor (280px) is the one number in this pass not
independently re-verified by a live measured sweep the way its
predecessor (480px) was — see disclosed judgment call #2. Functionally
safe (the toolbar's flex-wrap degrades gracefully to any width, proven
mechanism from W1 REPAIR) but not empirically pinned at this specific
value. A follow-up wave re-running the REPAIR PASS's own sweep
methodology at the new floor would close that gap.
