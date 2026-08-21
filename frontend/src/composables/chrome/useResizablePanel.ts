/**
 * src/composables/chrome/useResizablePanel.ts
 *
 * The nested-splitter tree (resizer-rearch, charter amendment ledger
 * row 391, geometry per maintainer constraint ledger row 414). TWO
 * resizer bars, each directly manipulating ONE independently-owned,
 * persisted width — never derived from the other's (ADR-0012
 * one-home-per-fact), and — per ledger row 414 — the tree pane's
 * width changes through EXACTLY that one channel, never
 * automatically (no fit-to-content, no auto-grow on branch expansion
 * or navigation):
 *
 *   OUTER bar (`#resizer-outer`, between `#board-area` and
 *     `#tree-control-wrapper`) → directly sets
 *     `session.ui.treeControlRegionWidthPx` — the WRAPPER's own
 *     width (the combined tree+control region), not either pane
 *     inside it.
 *
 *   INNER bar (`#resizer-inner`, between `#vue-tree-panel` and
 *     `#control-panel`, INSIDE the wrapper) → directly sets
 *     `session.ui.treePanelWidthPx` — the tree panel's own width.
 *
 * `#control-panel` is ALWAYS `flex: 1 1 0` within the wrapper (pure
 * CSS, no JS derivation at all) and `#board-area` is ALWAYS `flex:
 * 1 1 auto` in the outer row (App.vue) — both fully derived, never a
 * second writer for either persisted fact.
 *
 * ── Why TRUE nesting, not a flatter derivation (the geometric fix
 *    behind the live diagnostic) ──────────────────────────────────
 * An earlier shape of this rearch treated the row as one flat list
 * and derived `#board-area`'s width in JS from the OTHER panes'
 * widths. The live diagnostic
 * (.claude/dispatch-reports/panel-weirdness-live-investigation.md
 * §3/§6) measured up to 541px of lag between the cursor and the
 * divider under that shape, because whichever pane absorbed the
 * "complement" (the derived one) could sit on the SAME side of a bar
 * as the pane being dragged — in a flat list, the bar's own screen
 * position is the SUM of everything before it, and if both the
 * dragged pane and its complement-absorber are on that same side,
 * their opposite changes cancel and the bar doesn't move at all.
 *
 * TRUE CSS nesting avoids this structurally: `#tree-control-wrapper`
 * is its own independent flex container, so `#resizer-inner`'s
 * position depends only on what's INSIDE the wrapper before it
 * (`#vue-tree-panel`'s width, directly dragged — nothing else is
 * between them), while `#control-panel` absorbs the wrapper-local
 * complement on the OTHER side of that bar. One level up,
 * `#resizer-outer`'s position depends only on `#board-area`'s width
 * in the OUTER row, which absorbs the complement against the
 * wrapper's OWN width (directly dragged by the outer bar) — the
 * dragged quantity (wrapper width) and the absorber (`#board-area`)
 * are on OPPOSITE sides of that bar too. Both bars therefore track
 * the cursor 1:1 across their FULL range, with no saturation-
 * triggered decoupling — see the unit tests
 * (`useResizablePanel.test.ts`) for the pure-math continuity/no-
 * clobber probes, and the Playwright probe
 * (`.claude/dispatch-reports/resizer-rearch-probe.mjs`) for the live
 * bar-position-vs-cursor lag measurement this argument predicts.
 *
 * ── Shared drag math (both bars) ─────────────────────────────────
 * `computePaneWidthPx(dragOriginPx, totalDeltaPx, minWidthPx,
 * maxWidthPx, sign)` is the ONE function both bars' `onMouseMove`
 * calls — `next = dragOriginPx + sign * totalDeltaPx`, clamped. `sign`
 * differs per bar (`+1` for the INNER bar, `-1` for the OUTER —see
 * `computePaneWidthPx`'s own doc for why: it depends on which side of
 * the bar the directly-dragged pane sits on). No regime handoff,
 * continuous and monotone across the whole domain. `dragOriginPx` is
 * always read from the DIRECTLY-DRAGGED element's CURRENT rendered
 * width at `mousedown` (never from the store), which is what makes
 * the drag-start-clobber class structurally impossible. `maxWidthPx`
 * (and the fixed-sibling widths it's derived from) is measured once
 * at `mousedown`, not on every `mousemove`, per the
 * ResizeObserver-cached-geometry discipline (`frontend/CLAUDE.md`'s
 * imperative-escape pattern) — a `mousemove`-time
 * `getBoundingClientRect` read would force a synchronous reflow on
 * the hot path.
 *
 * ── Shared drag-in-progress flag (deferred-reorg mechanism) ─────────
 * `isAnyPanelResizing` (module-scope, exported) is `true` while
 * EITHER bar is being dragged — consumed by
 * `useDeferredContainerBreakpoint.ts` (charter amendment item 2), a
 * SEPARATE continuity obligation from the geometric width functions
 * above: a control-panel-hosted component's own internal responsive
 * breakpoint must not commit mid-gesture. One flag, not two, because
 * a human drags at most one bar at a time.
 *
 * ── Persistence: touchSession() at every write site ──────────────────
 * `next`'s `SyncService` (ec840417/f645ca42, "version-count
 * `store.session` in SyncService instead of deep-watching it") no
 * longer deep-watches `store.session` — it watches a shallow
 * `sessionVersion` counter that every persistence-relevant
 * `store.session` write must bump explicitly via `touchSession()`
 * (`store/index.ts`). A write that skips the bump is a SILENTLY LOST
 * SAVE. Both `onMouseMoveInner` and `onMouseMoveOuter` call
 * `touchSession()` immediately after their store write, once per
 * `mousemove` — SyncService's own debounce coalesces the resulting
 * burst into one PUT after the drag settles, exactly as the prior
 * deep-watch did. Covered by `tests/integration/
 * sync-session-version.test.ts`'s save-coverage net (extended for
 * both new fields) — a dropped `touchSession()` at either site must
 * turn a case red there.
 *
 * ── Restore-time board-visibility clamp (ui-5-3) ──────────────────
 * The two `:style` bindings above (App.vue) used to read
 * `store.session.ui.treeControlRegionWidthPx` RAW — the OUTER bar's
 * own drag clamps against the row's live width at `mousedown`
 * (`regionMaxWidthPx` below), but a value that reaches App.vue any
 * other way (hydrated from a stale save, a save made on a wider
 * screen, or simply garbage) was rendered unclamped. On a narrower
 * viewport than the one the value was saved from, this could squeeze
 * `#board-area` down to a sliver — reported as "the board comes
 * back minimized after upgrading" (wiki #5.3): the fix predates the
 * nested-splitter rearch only in the sense that ANY numeric width
 * persisted against one viewport and replayed against another has
 * the same failure shape; the rearch just gave it a name
 * (`treeControlRegionWidthPx`) and a single call site to fix it at.
 *
 * `effectiveTreeControlRegionWidthPx` (returned below) re-derives the
 * SAME clamp `startResizeOuter` computes at drag-time, but from the
 * CURRENT live width of `#split-workspace` on every render — not just
 * while a drag is in flight — via `sanitizeTreeControlRegionWidthPx`,
 * a pure function so the clamp itself is unit-testable without
 * mounting anything. The live width is tracked with the
 * ResizeObserver-cached-geometry idiom (`frontend/CLAUDE.md`'s
 * imperative-escape pattern): measured once on mount and on every
 * resize of the row, never read synchronously on a hot path. The
 * tracking ref starts at `0`, which clamps the wrapper DOWN to its
 * own floor (`WRAPPER_MIN_WIDTH_PX`) until the first real
 * measurement lands — the opposite failure (a briefly narrow
 * tree/control region for one tick) is harmless and self-corrects;
 * a minimized board is the regression this exists to prevent, so the
 * default errs toward protecting the board. `undefined` in (never
 * dragged) still means `undefined` out — fresh installs, which have
 * no persisted value to sanitize, are unaffected.
 *
 * ── Board-area width cap: don't strand width the board can't use
 *    (commission row 848, "space should not be wasted") ─────────────
 * `#board-area` is a HEIGHT-bound square (App.vue's `#board-square`:
 * `flex: 1 1 auto; aspect-ratio: 1/1`, sharing `#board-area`'s height
 * with the status bar sibling since wiki2-status-bar-reparent) — its
 * rendered width is capped at the row's own height (`#split-workspace`'s
 * live height, the exact same element the width clamp above already
 * observes), never wider,
 * regardless of how much ROW width `#board-area`'s `flex: 1 1 auto`
 * would otherwise let it claim. Left uncapped, the NO-EXPLICIT-WIDTH
 * flex-fill branch (App.vue: `#tree-control-wrapper`'s `flex: '1 1
 * 0'`, engaged whenever `treeControlRegionWidthPx` has never been
 * dragged/restored) splits free row space between the two flex-grow
 * parties by their grow factor alone — `#board-area` claims its
 * "share" even past the point its own square can render into it,
 * which becomes dead centered margin around the square (`#board-
 * square`'s `align-self: center`), while `#control-panel` starves at
 * its floor. `boardAreaMaxWidthPx` (returned below) is a `max-width`
 * cap so the standard CSS flex algorithm freezes `#board-area` at
 * its actual usable width once it hits that ceiling and hands the
 * REMAINING free space to `#tree-control-wrapper`'s own `flex-grow`
 * instead — no JS-computed complement, no second writer for either
 * pane's width, same "let native flexbox redistribute past a frozen
 * item" mechanism the rest of this file relies on, just applied to
 * the OUTER pair instead of the inner one.
 *
 * ── W3 rewire: grid-track drag handles, not flex `:style` bindings ───
 * (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W3, §4
 * item 1). This composable's DOM ids (`#split-workspace`,
 * `#board-area`, `#tree-control-wrapper`, `#vue-tree-panel`,
 * `#control-panel`) are UNCHANGED — App.vue's `LYT_DOM_ID_BY_PATH` still
 * assigns them to the same real elements, now grid cells instead of flex
 * children (commission item 4: preserve the load-bearing legacy hooks).
 * All the geometry MEASUREMENT below (mousedown-time
 * `getBoundingClientRect`, the ResizeObserver-cached row dims) is
 * therefore untouched. What changed is the WRITE side's consumer: pre-W3,
 * App.vue's own `:style` bindings read `effectiveTreeControlRegionWidthPx`
 * directly on `#tree-control-wrapper`/`#vue-tree-panel`; under the LYT
 * grid skeleton those two elements are GRID ITEMS whose size is set by
 * their PARENT split's own `grid-template-columns`/`rows` track list
 * (`LytNode.vue`), not by an inline style on the item itself — so the
 * effective widths below now flow out through
 * `resizerTrackStyleOverrides`, a path -> literal-px-string map App.vue
 * feeds to `<LytNode>`'s `trackStyleOverrides` prop (LytNode.vue's own
 * header, "Resizer drag overrides", documents the override-wins-verbatim
 * contract on that side). `effectiveTreePanelWidthPx` is the INNER bar's
 * own analog of `effectiveTreeControlRegionWidthPx` — `computeTreePanelBoundWidth`
 * (state/layout-model.ts) already carried this exact stored-vs-default
 * precedence (pre-W3: consulted directly by App.vue's own template
 * ternary); this composable now owns evaluating it, so both bars' final
 * effective widths live in one place.
 *
 * The `treeExpanded` scope note: a prior review flagged a DORMANT read
 * of `store.session.ui.treeExpanded` at this file's fresh-profile floor
 * computed (`freshTreeControlWrapperMinWidthPx`, pre-W3) — dormant
 * because the LYT skeleton (W1) already renders `tree` as an
 * unconditionally-visible leaf (`@fixed` presence in both `.lyt`
 * encodings — SPEC.md §11's own "only a bare leaf... release toggle"
 * scoping excludes it), so `treeExpanded` never actually varied that
 * computed's OUTPUT in the post-W1 app; only the READ itself lingered.
 * This rewire removes the chrome-side read (`freshTreeControlWrapperFloorPx`
 * is now always called with `true` below) — the FIELD itself is
 * untouched (`session.ui.treeExpanded` still exists in the schema;
 * blind-mode review UI owns its remaining semantics, per the
 * commissioner's own W3 scope boundary — this file does not touch
 * `blind-mode-prefs.ts`/`useReviewSession.ts`).
 *
 * Deliberately governs ONLY the flex-fill branch — see
 * `boardAreaMaxWidthPx`'s own doc for why an explicit (dragged or
 * restored) `treeControlRegionWidthPx` already leaves `#board-area`
 * with exactly the row's remaining share and needs no additional cap.
 * `rowHeightPx` reuses the SAME `#split-workspace` ResizeObserver the
 * width clamp above already maintains (one observer, two dimensions
 * off one `getBoundingClientRect()` read, per the imperative-escape
 * discipline's "measured once on resize, never on the hot path").
 * `computeBoardAreaMaxWidthPx` is a pure function so the cap is
 * unit-testable without mounting anything, matching
 * `sanitizeTreeControlRegionWidthPx`'s shape. When the board is
 * WIDTH-bound instead (a tall/narrow viewport, or the row is narrower
 * than its own height) the cap is simply non-binding — `rowHeightPx`
 * exceeds the available row width, so `#board-area` never reaches
 * it and keeps claiming freed space exactly as before; the un-height-
 * bound case is unchanged by construction, not by a separate branch.
 *
 * License: Public Domain (The Unlicense).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { store, touchSession } from '../../store';
import {
  MIN_BOARD_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  TREE_PANEL_MIN_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
  RESIZER_WIDTH_PX,
  computeTreePanelDefaultWidthPx,
  computeTreeControlRegionDefaultWidthPx,
  computeTreePanelBoundWidth,
} from '../../state/layout-model';
import { measured, px, resolveSovereignOverrides, type RegionAllotment } from '../../state/feasible-layout';

// Phase 0 (resolution roadmap, audit finding R2): these five floors
// used to be hand-picked literals living HERE, independently of each
// other and of the tab strip they were meant to track (R2's root
// cause). They are now DECLARED DATA in `state/layout-model.ts` — the
// single home `getPanelGeometryPolicy`/`PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS`
// reads too — and re-exported below unchanged so this file's own drag
// math (which only ever needs one floor at a time, never a whole
// `LayoutClass`) doesn't have to thread one through. See that module's
// header for the full derivation of each.
export { MIN_BOARD_PX, CONTROL_PANEL_MIN_WIDTH_PX, TREE_PANEL_MIN_WIDTH_PX, WRAPPER_MIN_WIDTH_PX, RESIZER_WIDTH_PX };

// True while EITHER resizer bar is being dragged. See this file's
// header, "Shared drag-in-progress flag", for what consumes it.
export const isAnyPanelResizing = ref(false);

/**
 * Pure drag math shared by both bars: the next pane width for a given
 * drag origin (the DIRECTLY-DRAGGED element's rendered width at
 * mousedown), cumulative pointer displacement since mousedown, and a
 * `sign` that encodes which side of the bar the directly-dragged pane
 * sits on — clamped to `[minWidthPx, maxWidthPx]`. No DOM, no store,
 * no regime branch — continuous and monotone across its whole domain
 * (the direction of monotonicity depends on `sign`, see below).
 *
 * `sign` is `+1` when the directly-dragged pane sits to the bar's
 * LEFT (dragging the bar right pushes the boundary further right,
 * GROWING that pane — e.g. `#resizer-inner` and the tree panel, which
 * is to its left) or `-1` when the pane sits to the bar's RIGHT
 * (dragging right pushes the boundary right, SHRINKING that pane —
 * e.g. `#resizer-outer` and the tree+control wrapper, which is to its
 * right). Getting this wrong doesn't break clamping or persistence —
 * the drag still writes SOME value on every mousemove — but it makes
 * the bar's own screen position track the cursor at completely the
 * wrong rate or direction, exactly the class of defect the live
 * diagnostic's Anomaly 1 named (lag up to 541px under an earlier,
 * differently-shaped bug in this same file): a first version of this
 * nested-splitter geometry reused the OUTER bar's sign unchanged for
 * the INNER bar without re-deriving it for the flipped left/right
 * relationship, and the Playwright probe caught a 1188px lag as a
 * direct result — see `useResizablePanel.test.ts`'s monotonicity
 * blocks, which pin each bar's OWN correct direction so a sign
 * regression fails loudly here rather than only in a live drag.
 *
 * `maxWidthPx` may legitimately be smaller than `minWidthPx` on a
 * very narrow viewport; the clamp degrades gracefully by clamping to
 * whichever of the two bounds is actually the min/max of the pair.
 */
export function computePaneWidthPx(
  dragOriginPx: number,
  totalDeltaPx: number,
  minWidthPx: number,
  maxWidthPx: number,
  sign: 1 | -1,
): number {
  const next = dragOriginPx + sign * totalDeltaPx;
  const lo = Math.min(minWidthPx, maxWidthPx);
  const hi = Math.max(minWidthPx, maxWidthPx);
  return Math.max(lo, Math.min(next, hi));
}

/**
 * `computePaneWidthPx` specialised to the tree panel's floor — the
 * INNER bar's math. `sign = +1`: the tree panel sits to
 * `#resizer-inner`'s LEFT (`#vue-tree-panel`, then the bar, then
 * `#control-panel`), so dragging right GROWS it.
 */
export function computeTreePanelWidthPx(
  dragOriginPx: number,
  totalDeltaPx: number,
  maxTreePanelWidthPx: number,
): number {
  return computePaneWidthPx(dragOriginPx, totalDeltaPx, TREE_PANEL_MIN_WIDTH_PX, maxTreePanelWidthPx, 1);
}

/**
 * `computePaneWidthPx` specialised to the wrapper's floor — the
 * OUTER bar's math. `sign = -1`: `#tree-control-wrapper` sits to
 * `#resizer-outer`'s RIGHT (`#board-area`, then the bar, then the
 * wrapper), so dragging right SHRINKS it (matching the original,
 * pre-nesting resizer-rearch convention: "drag right narrows the
 * control-side pane, grows the board").
 */
export function computeTreeControlRegionWidthPx(
  dragOriginPx: number,
  totalDeltaPx: number,
  maxRegionWidthPx: number,
): number {
  return computePaneWidthPx(dragOriginPx, totalDeltaPx, WRAPPER_MIN_WIDTH_PX, maxRegionWidthPx, -1);
}

// HISTORICAL, deleted by dispatch L3 (`.claude/dispatch-reports/
// lyt-space-owner-spec.md` §3 step 3, ledger rows 2447/2450/2460/2461):
// `sanitizeTreeControlRegionWidthPx` (the ui-5-3 restore-time clamp,
// reserving `MIN_BOARD_PX` against a hydrated `treeControlRegionWidthPx`)
// and `freshTreeControlWrapperFloorPx` (the flex-era first-paint floor,
// already unconsumed by App.vue since the W3 CSS-Grid rewire — confirmed:
// `useResizablePanel()`'s own `freshTreeControlWrapperMinWidthPx` return
// value had no App.vue reader) used to live here. Both are transcribed in
// full in `.claude/dispatch-reports/lyt-space-owner-l3-build.md`'s
// "Transcribed disclosures" section, per ADR-0002 Rule 6.
// `sanitizeTreeControlRegionWidthPx`'s protective intent (never leave
// `#board-area` starved) is NOW discharged by `outerRowSovereignDiagnostic`
// below — sovereignty (SCOPE item 3): the stored value wins VERBATIM at
// the STORE layer (this composable's own `effectiveTreeControlRegionWidthPx`
// still passes it through unclamped), a starved board is DIAGNOSED. Stale
// doctrine correction (ledger row 2511, `.claude/dispatch-reports/
// lyt-disease-repair-review.md`, cross-cutting finding): "never resisted"
// stopped being true the moment `resolveRootSplitLiveLayout`
// (`state/feasible-layout.ts`) shipped — the RENDER layer (what App.vue's
// landscape path actually writes into the grid track) now DOES clamp a
// stored override down to the board-floor-reserving ceiling at the
// current geometry, and `startResizeOuter`'s own drag-time ceiling below
// was harmonized to the same bound (row 2511 review condition 2). "Never
// resisted" is accurate only for THIS composable's own store-layer
// pass-through, not for what the user ultimately sees rendered.

/**
 * "Default layout" (commission, ledger row 2379): clears BOTH persisted
 * layout-override cells this file owns — `treeControlRegionWidthPx`
 * (OUTER bar) and `treePanelWidthPx` (INNER bar) — back to `undefined`.
 * `undefined` is not a magic sentinel invented here; it is the exact
 * "never dragged" state `effectiveTreeControlRegionWidthPx` /
 * `effectiveTreePanelWidthPx` (below, inside `useResizablePanel()`)
 * already know how to resolve — the SAME stored-or-default precedence a
 * drag start/stop already exercises, just landing on the DEFAULT branch
 * instead of a stored value. Because that precedence is reactive and
 * reads the row's CURRENT live width (`rowWidthPx`), the very next
 * render recomputes `computeTreeControlRegionDefaultWidthPx(rowWidthPx)`
 * / `computeTreePanelDefaultWidthPx(rowWidthPx)` for whatever the
 * viewport is RIGHT NOW — not a remembered "factory" pixel value. If the
 * current width demotes a sibling (e.g. `controlPanel` width-demoted
 * per `resolveWidthConditionalPresence`), the recomputed default
 * reflects that too (`resolveTreeRowWidthPx` already accounts for which
 * fixed-demand siblings are actually present) — the panel staying
 * demoted after a reset at a narrow width is therefore CORRECT, not a
 * partial reset.
 *
 * Not a THIRD writer in the ADR-0012 one-home-per-fact sense: the two
 * `effective*` computeds remain the single home for what's actually
 * RENDERED; this function only clears the STORED override half of that
 * precedence — exactly what an explicit "forget my drags" user action
 * means. It composes with the existing single-channel discipline (this
 * file's own header, "the tree pane's width changes through EXACTLY
 * that one channel") the same way a drag's own write does: a
 * deliberate, user-initiated write, never an automatic derivation.
 *
 * These two fields are the FULL enumeration of persisted layout-override
 * cells in `session.ui` — verified against `store/schema.ts` (the only
 * two `Px`-suffixed optional fields on that interface; `pvAnimation`,
 * `overlayLayers`, etc. are content settings, not draggable geometry).
 * Presence toggles (`lytPresence`, `railStyle`) are a DIFFERENT axis —
 * which panels are SHOWN, not how wide a shown panel is — and are
 * deliberately untouched here; the commission's own ruling draws
 * exactly this line ("geometry, not presence").
 */
export function resetLayoutOverrides(): void {
  store.session.ui.treeControlRegionWidthPx = undefined;
  store.session.ui.treePanelWidthPx = undefined;
  touchSession();
}

// HISTORICAL, deleted by dispatch L3: `computeBoardAreaMaxWidthPx` (the
// flex-era `#board-area` max-width cap) used to live here — already
// unconsumed by App.vue since the W3 CSS-Grid rewire (confirmed:
// `useResizablePanel()`'s own `boardAreaMaxWidthPx` return value had no
// App.vue reader). Transcribed in full in `.claude/dispatch-reports/
// lyt-space-owner-l3-build.md`'s "Transcribed disclosures" section.

export function useResizablePanel() {
  // ── INNER bar: tree panel (inside #tree-control-wrapper) ─────────
  let treeDragOriginPx = 0;
  let treeMaxWidthPx = TREE_PANEL_MIN_WIDTH_PX;
  let treeLastMouseX = 0;

  function startResizeInner(e: MouseEvent) {
    e.preventDefault();
    isAnyPanelResizing.value = true;
    treeLastMouseX = e.clientX;

    const tree = document.getElementById('vue-tree-panel');
    const wrapper = document.getElementById('tree-control-wrapper');

    if (tree) {
      // Rendered width, never the stored value — see this file's
      // header, "no drag-start clobber".
      treeDragOriginPx = Math.round(tree.getBoundingClientRect().width);
    } else {
      treeDragOriginPx = store.session.ui.treePanelWidthPx ?? TREE_PANEL_MIN_WIDTH_PX;
    }

    if (wrapper) {
      const wrapperWidthPx = wrapper.getBoundingClientRect().width;
      // Sovereignty (dispatch L3, SCOPE item 3): the ceiling reserves
      // ONLY the resizer's own physical width — NOT `controlPanel`'s
      // demand. Reserving `CONTROL_PANEL_MIN_WIDTH_PX` here (pre-L3) was
      // the exact mechanism behind the commissioner's own "~640px
      // control-panel drag floor" complaint: it capped the tree's drag
      // range so `controlPanel` could never be squeezed below its own
      // floor. `resolveSideColumnLiveLayout` (`state/feasible-layout.ts`)
      // now diagnoses a starved `controlPanel`/`previewBoard` instead —
      // never resists the drag itself.
      treeMaxWidthPx = Math.max(0, Math.round(wrapperWidthPx - RESIZER_WIDTH_PX));
    } else {
      treeMaxWidthPx = treeDragOriginPx;
    }

    document.addEventListener('mousemove', onMouseMoveInner);
    document.addEventListener('mouseup', stopResizeInner);
    document.body.classList.add('resizing');
  }

  function onMouseMoveInner(e: MouseEvent) {
    const totalDelta = e.clientX - treeLastMouseX;
    store.session.ui.treePanelWidthPx = computeTreePanelWidthPx(
      treeDragOriginPx,
      totalDelta,
      treeMaxWidthPx,
    );
    // treePanelWidthPx is persisted session UI state; bump the session
    // counter so SyncService schedules a (debounced) save. Per-move
    // bumps coalesce into one PUT after the drag settles. See this
    // file's header, "Persistence: touchSession() at every write
    // site", and `sessionVersion` in `store/index.ts`.
    touchSession();
  }

  function stopResizeInner() {
    isAnyPanelResizing.value = false;
    document.removeEventListener('mousemove', onMouseMoveInner);
    document.removeEventListener('mouseup', stopResizeInner);
    document.body.classList.remove('resizing');
  }

  // ── OUTER bar: tree+control wrapper (in #split-workspace) ────────
  let regionDragOriginPx = 0;
  let regionMaxWidthPx = WRAPPER_MIN_WIDTH_PX;
  let regionLastMouseX = 0;

  function startResizeOuter(e: MouseEvent) {
    e.preventDefault();
    isAnyPanelResizing.value = true;
    regionLastMouseX = e.clientX;

    const wrapper = document.getElementById('tree-control-wrapper');
    const row = document.getElementById('split-workspace');

    if (wrapper) {
      regionDragOriginPx = Math.round(wrapper.getBoundingClientRect().width);
    } else {
      regionDragOriginPx = store.session.ui.treeControlRegionWidthPx ?? WRAPPER_MIN_WIDTH_PX;
    }

    if (row) {
      const rowWidthPx = row.getBoundingClientRect().width;
      // Ledger row 2511 review condition 2 (`.claude/dispatch-reports/
      // lyt-disease-repair-review.md`, defect 4): this ceiling USED to
      // reserve ONLY the resizer's own physical width, leaving it far
      // LOOSER than `resolveRootSplitLiveLayout`'s render-time ceiling
      // (`state/feasible-layout.ts`, which additionally reserves
      // `MIN_BOARD_PX` for the board) — two homes for what should be one
      // fact (ADR-0012). A single drag gesture could accept mouse deltas
      // past the point the RENDER stops moving, decoupling the cursor
      // from the divider mid-gesture — a close cousin of the N4 "stuck,
      // no visible movement" symptom, just relocated from across-drags to
      // within-a-drag. Now reserves `MIN_BOARD_PX` here too, the same
      // floor the render-time ceiling reserves, so the drag can never
      // accept a delta the render would then refuse to honor. This is a
      // disclosed NARROWER unification, not byte-identical: the render
      // ceiling also reserves `boardRailReservedPx` and the LYT root
      // `gapPx` (both unavailable to this composable without threading
      // boardRail's own presence in — out of scope for this repair), so
      // the two ceilings can still diverge by that small margin when
      // boardRail is visible. A starved board is still DIAGNOSED
      // (`outerRowSovereignDiagnostic` below), never silently resisted —
      // this ceiling only stops the CURSOR from promising more than the
      // render can ever grant, it does not resist a stored/restored
      // value arriving some other way.
      regionMaxWidthPx = Math.max(0, Math.round(rowWidthPx - RESIZER_WIDTH_PX - MIN_BOARD_PX));
    } else {
      regionMaxWidthPx = regionDragOriginPx;
    }

    document.addEventListener('mousemove', onMouseMoveOuter);
    document.addEventListener('mouseup', stopResizeOuter);
    document.body.classList.add('resizing');
  }

  function onMouseMoveOuter(e: MouseEvent) {
    const totalDelta = e.clientX - regionLastMouseX;
    store.session.ui.treeControlRegionWidthPx = computeTreeControlRegionWidthPx(
      regionDragOriginPx,
      totalDelta,
      regionMaxWidthPx,
    );
    // treeControlRegionWidthPx is persisted session UI state; bump the
    // session counter so SyncService schedules a (debounced) save. See
    // onMouseMoveInner's identical comment above.
    touchSession();
  }

  function stopResizeOuter() {
    isAnyPanelResizing.value = false;
    document.removeEventListener('mousemove', onMouseMoveOuter);
    document.removeEventListener('mouseup', stopResizeOuter);
    document.body.classList.remove('resizing');
  }

  // If the host SFC unmounts mid-drag (HMR, route change), the
  // document-level mousemove / mouseup listeners would persist and
  // body.classList would keep the 'resizing' class. Both stop*
  // functions are idempotent — safe to call when no drag is in
  // flight, removeEventListener is a no-op for unattached handlers,
  // classList.remove is a no-op for an absent class. Mirrors
  // HorizontalTimelineVisualizer's onUnmounted(() => stopDragging())
  // pattern.
  onUnmounted(() => {
    stopResizeInner();
    stopResizeOuter();
  });

  // ── Restore-time board-visibility clamp (ui-5-3) + board-area
  //    width-cap geometry (commission row 848) ───────────────────────
  // See this file's header, "Restore-time board-visibility clamp" and
  // "Board-area width cap", for the full rationale of each. Both
  // read off the SAME element — `rowWidthPx` / `rowHeightPx` are
  // `#split-workspace`'s own live width/height, independent of how its
  // children (board / wrapper) currently divide the row, so measuring
  // either is never circular with a clamp derived from it. ResizeObserver-
  // cached geometry per `frontend/CLAUDE.md`'s imperative-escape pattern:
  // both dimensions read off ONE `getBoundingClientRect()` call, measured
  // once on mount, refreshed only on an actual resize of the row, released
  // on unmount.
  const rowWidthPx = ref(0);
  const rowHeightPx = ref(0);
  let rowObserver: ResizeObserver | null = null;
  // Row 2502/2503 review repair, finding 2 (`.claude/dispatch-reports/
  // lyt-cure-final-repair-review.md` §5, "SCREEN-CLASS FREEZE"): tracks
  // WHICH element is currently observed, so a re-attach can detect the
  // element identity changed (see `attachRowObserver`'s own doc below)
  // rather than trusting `rowObserver !== null` alone to mean "still
  // watching the live element."
  let observedRowEl: Element | null = null;

  function measureRowDims() {
    const row = document.getElementById('split-workspace');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    rowWidthPx.value = Math.round(rect.width);
    rowHeightPx.value = Math.round(rect.height);
  }

  // Attach the observer to #split-workspace if it exists NOW; returns
  // whether it did. The element sits behind the cold-load gate
  // (App.vue: v-if workspaceLoadState 'loaded'), so at App mount time it
  // typically does NOT exist yet — the live-regression class this
  // two-phase attach closes: the original mount-only attach silently
  // never observed, rowWidthPx stayed 0, and the clamp pinned the
  // region to its minimum ("divider stopped dragging", commissioner
  // report 2026-08-07).
  //
  // Row 2502/2503 review repair, finding 2: RE-ENTRANT, not attach-once.
  // `document.getElementById('split-workspace')` by id is stable across
  // a landscape/portrait screen-class swap for THIS element specifically
  // (App.vue's own `activeLytDomIdByPath` maps the compiled program's
  // OWN root path — `''` — to this id in BOTH classes, and `<LytNode>`'s
  // root template element is the SAME component instance across a prop
  // change, never remounted) — but `attachWrapperObserver` (below)
  // observes a DIFFERENT element (`#tree-control-wrapper`) that sits
  // several levels deep inside the RECURSIVE `<LytNode>` structure,
  // where a screen-class swap genuinely CAN replace the underlying DOM
  // node (landscape's and portrait's own tree-row splits live at
  // completely different tree depths/shapes, so Vue's own `v-for`/`:key`
  // diffing tears down and recreates the nested `<LytNode>` instances
  // along that path). An observer left attached to a DETACHED element
  // never fires again — `sideColumnWidthPx` would freeze at whatever it
  // last measured. Both functions below now re-check the CURRENTLY LIVE
  // element on every call (not only the first successful one) and
  // re-observe when identity changed, so `reattachObservers()` (exposed
  // below, called by App.vue on every screen-class transition) is a
  // genuine no-op when nothing moved and a real fix when it did.
  function attachRowObserver(): boolean {
    const row = document.getElementById('split-workspace');
    if (!row) return false;
    measureRowDims();
    if (typeof ResizeObserver === 'undefined') return true;
    if (rowObserver !== null && observedRowEl === row) return true; // already observing the live element
    rowObserver?.disconnect();
    rowObserver = new ResizeObserver(measureRowDims);
    rowObserver.observe(row);
    observedRowEl = row;
    return true;
  }

  // Finish-pass wave A (`.claude/dispatch-reports/lyt-wA-width-
  // demotion.md`, F1/F2-partial): `#tree-control-wrapper`'s own live
  // width — the tree/panels/preview row, i.e. the SAME rectangle the
  // side column's `board-priority-clamp` grid track resolves to (the
  // row's V-parent stacks its children full-width, so this element's
  // width IS the side column's rendered width, whether that came from
  // the compiled CSS calc or a resizer-drag override — a genuine DOM
  // measurement is the only way to know the TRUE rendered figure either
  // way). Consumed by `state/layout-model.ts`'s
  // `resolveWidthConditionalPresence` to evaluate the `controlPanel`
  // Exclusive's own compiled `@demote(h ...)` threshold against reality,
  // rather than trusting an un-measured CSS formula to already agree
  // with the model's own structural floor (the finish-pass F1 gap: it
  // didn't, at every landscape size the pass exercised). A SECOND
  // observer, deliberately (ADR-0010's "one observer per measured
  // element" — this is a DIFFERENT element than `#split-workspace`),
  // co-located here (not a separate composable) because it needs the
  // exact same two-phase cold-load-gate attach `rowObserver` above
  // already implements, and duplicating that watch/onMounted machinery
  // in a second file would be the ADR-0012 P1 violation this composable
  // exists to avoid for the sibling case.
  const sideColumnWidthPx = ref(0);
  let wrapperObserver: ResizeObserver | null = null;
  // Row 2502/2503 review repair, finding 2 — see `attachRowObserver`'s
  // own doc above for why THIS element specifically is the one at real
  // risk of identity change across a screen-class swap.
  let observedWrapperEl: Element | null = null;

  function measureWrapperWidth() {
    const wrapper = document.getElementById('tree-control-wrapper');
    if (!wrapper) return;
    sideColumnWidthPx.value = Math.round(wrapper.getBoundingClientRect().width);
  }

  function attachWrapperObserver(): boolean {
    const wrapper = document.getElementById('tree-control-wrapper');
    if (!wrapper) return false;
    measureWrapperWidth();
    if (typeof ResizeObserver === 'undefined') return true;
    if (wrapperObserver !== null && observedWrapperEl === wrapper) return true; // already observing the live element
    wrapperObserver?.disconnect();
    wrapperObserver = new ResizeObserver(measureWrapperWidth);
    wrapperObserver.observe(wrapper);
    observedWrapperEl = wrapper;
    return true;
  }

  // Dispatch row 2504's A2b finding (`.claude/dispatch-reports/
  // lyt-cure-final-repair.md`'s "FINAL re-witness discharge", finding 2,
  // and the two live-rig re-witnesses that followed): the RE-ENTRANT
  // `attachRowObserver`/`reattachObservers()` fix above is correct as far
  // as it goes but is chained AFTER `activeScreenClassId`'s own watch
  // (App.vue) — a signal that can only fire once `rowWidthPx` has
  // already been correctly re-measured. If the ResizeObserver instance
  // itself simply stops delivering callbacks for a live, still-attached,
  // still-correctly-identified element (witnessed live, three
  // reproductions: a `MutationObserver` proof of zero style mutations
  // for 3+ seconds post-resize; a raw-callback trace showing the
  // production `rowObserver`'s own callback fires twice during initial
  // settle and never again despite the element's real, later
  // `getBoundingClientRect().width` genuinely changing 1920→480; and a
  // FRESH `ResizeObserver` attached to the SAME live element moments
  // before the same resize DOES fire) — nothing downstream can ever
  // recover, because the recovery mechanism depends on the very delivery
  // that stopped. This is a structural catch-22 independent of whatever
  // causes the specific browser/engine's ResizeObserver instance to stop
  // delivering (not root-caused further here — a live-rig, real-browser-
  // only mechanism, not reproducible in jsdom, which never runs real
  // ResizeObserver box-size delivery at all).
  //
  // Fix: a plain `window` `resize` listener, decoupled from
  // ResizeObserver entirely, force-remeasures BOTH dimensions directly
  // whenever the browser tells us the VIEWPORT itself changed — the
  // exact trigger category the live-rig regression is about. `window`
  // 'resize' is dispatched by the browser unconditionally on a real
  // viewport change (confirmed live, independent of the ResizeObserver
  // question entirely), so this path never depends on ResizeObserver's
  // own health to recover a live resize. It is a SUPPLEMENT, not a
  // replacement: ResizeObserver remains the primary, finer-grained path
  // for layout changes that are NOT a window resize (a resizer drag,
  // presence toggles, a sidebar reflow) — this listener only closes the
  // one gap where the window itself resizes and the observer chain
  // doesn't recover.
  function handleWindowResize(): void {
    measureRowDims();
    measureWrapperWidth();
  }

  onMounted(() => {
    const rowAttached = attachRowObserver();
    const wrapperAttached = attachWrapperObserver();
    window.addEventListener('resize', handleWindowResize);
    if (rowAttached && wrapperAttached) return;
    // Either element not in the DOM yet (cold-load gate): attach one
    // tick after the workspace actually renders, same as the row
    // observer's own precedent above. The watcher stops itself once
    // BOTH are attached; onUnmounted's disconnect handles both
    // observers.
    const stopWatch = watch(
      () => store.workspaceLoadState.kind,
      (kind) => {
        if (kind !== 'loaded') return;
        void nextTick(() => {
          if (attachRowObserver() && attachWrapperObserver()) stopWatch();
        });
      },
      { immediate: true },
    );
  });

  onUnmounted(() => {
    rowObserver?.disconnect();
    rowObserver = null;
    observedRowEl = null;
    wrapperObserver?.disconnect();
    wrapperObserver = null;
    observedWrapperEl = null;
    window.removeEventListener('resize', handleWindowResize);
  });

  // Row 2502/2503 review repair, finding 2: the caller-facing re-attach
  // hook — `App.vue` calls this after `nextTick()` on every
  // `activeScreenClassId` transition (the one signal that CAN replace
  // `#tree-control-wrapper`'s own DOM identity, per `attachRowObserver`'s
  // own doc above). A plain re-invocation of both attach functions:
  // idempotent when nothing moved (the `observed*El === live element`
  // check above short-circuits to a no-op), corrective when it did
  // (disconnects the stale observer, attaches a fresh one, and
  // immediately re-measures via each attach function's own synchronous
  // `measure*()` call — no waiting for the new observer's first async
  // callback to recover a correct reading).
  function reattachObservers(): void {
    attachRowObserver();
    attachWrapperObserver();
  }

  const effectiveTreeControlRegionWidthPx = computed(() => {
    const raw = store.session.ui.treeControlRegionWidthPx;
    // Geometry not yet known (observer not attached — pre-load, or the
    // one tick between load and attach): pass the value through with
    // only the non-finite guard; the real default engages as soon as
    // the row is measured.
    if (rowWidthPx.value <= 0) {
      return raw !== undefined && Number.isFinite(raw) ? raw : undefined;
    }
    if (raw === undefined || !Number.isFinite(raw)) {
      // Never dragged, nothing restored: the init-vs-drag divergence fix
      // (ledger rows 1505/1510) — an EXPLICIT default width, not
      // `undefined`. See `computeTreeControlRegionDefaultWidthPx`'s own
      // doc (state/layout-model.ts) for the full diagnosis.
      return computeTreeControlRegionDefaultWidthPx(rowWidthPx.value);
    }
    // Sovereignty (dispatch L3, SCOPE item 3): the stored (dragged or
    // restored) value wins VERBATIM — no clamp against `#board-area`'s
    // own `MIN_BOARD_PX` floor (the ui-5-3 restore-time clamp,
    // `sanitizeTreeControlRegionWidthPx`, is deleted; see this file's own
    // HISTORICAL note above). `outerRowSovereignDiagnostic` below
    // diagnoses a starved board instead of resisting the value here.
    return Math.max(0, Math.round(raw));
  });

  // Sovereignty diagnostic for the OUTER bar (dispatch L3): `board` vs
  // `wrapper` re-expressed as a `FeasibleLayout` region pair — `board`'s
  // own demand is `MIN_BOARD_PX`, uncapped above (an elastic region with
  // no declared `maxUseful`); `wrapper`'s stored-or-restored width is the
  // `SovereignOverride`. Empty until the row is measured and a stored
  // value exists (mirrors `effectiveTreeControlRegionWidthPx`'s own
  // not-yet-measured / never-dragged guards — no diagnostic is possible
  // in either case, since there's nothing sovereign to check yet).
  //
  // A PLAIN computed, deliberately with NO internal push watcher: the
  // OUTER bar's own width fact is LANDSCAPE-ONLY (this file's own header,
  // "W3 rewire" / App.vue's own "DISCLOSED NARROWING" — portrait has no
  // side-column concept for `treeControlRegionWidthPx` to mean anything
  // against). `rowWidthPx` measures `#split-workspace`'s FULL width in
  // EITHER class, so this diagnostic's own arithmetic stays well-defined
  // regardless of class, but a value carried over from an earlier
  // LANDSCAPE session (persisted, never cleared on a portrait resize —
  // see this file's own header, "treeControlRegionWidthPx itself is
  // untouched by a portrait session") would produce a SPURIOUS
  // "board starved" push in portrait if pushed unconditionally here — a
  // real regression an early build of this composable caught via a
  // layout-audit `viewport-escape`/target-size finding cascade (extra
  // system-log-panel rows shifting other chrome). `App.vue` — the only
  // module that actually knows the active screen class — owns the
  // landscape-gated push instead (see its own `outerRowSovereignPushGate`
  // note).
  const outerRowSovereignDiagnostic = computed(() => {
    const raw = store.session.ui.treeControlRegionWidthPx;
    if (rowWidthPx.value <= 0 || raw === undefined || !Number.isFinite(raw)) return [];
    const wrapperPx = Math.max(0, Math.round(raw));
    const boardPx = Math.max(0, Math.round(rowWidthPx.value - wrapperPx - RESIZER_WIDTH_PX));
    const demands = [
      measured({ region: 'board', axis: 'h' as const, min: px(MIN_BOARD_PX), preferred: px(MIN_BOARD_PX), maxUseful: null }),
    ];
    const solved = new Map<string, RegionAllotment<string>>([
      ['board', { region: 'board', axis: 'h', px: px(boardPx) }],
    ]);
    return resolveSovereignOverrides(
      demands,
      solved,
      [{ region: 'wrapper', axis: 'h' as const, px: px(wrapperPx), source: 'user-drag' as const }],
      'landscape',
      { widthPx: px(rowWidthPx.value), heightPx: px(0) },
    ).diagnostics;
  });

  // Phase 3 (resolution roadmap, audit finding R5): the tree panel's
  // UNSET (never-dragged) default width — a fraction of the SAME live
  // `rowWidthPx` this file already measures, floored at
  // `TREE_PANEL_MIN_WIDTH_PX`. See `computeTreePanelDefaultWidthPx`'s
  // own doc (`state/layout-model.ts`) for why this is a DEFAULT only:
  // `session.ui.treePanelWidthPx`, once dragged, is the sole write
  // channel and this value is never consulted again for that pane.
  const treePanelDefaultWidthPx = computed(() => computeTreePanelDefaultWidthPx(rowWidthPx.value));

  // W3: the INNER bar's own "effective width" — the SAME
  // stored-value-wins-verbatim-else-default precedence
  // `effectiveTreeControlRegionWidthPx` already applies to the OUTER
  // bar's fact, now applied to `treePanelWidthPx` via the SAME pure
  // function (`computeTreePanelBoundWidth`, state/layout-model.ts) the
  // pre-W3 App.vue template ternary called directly. `axisColumn` is
  // always `false` here — screen-class selection (row-vs-column
  // reorganization) is now a WHOLE-PROGRAM swap (which compiled
  // `LytProgram`/DOM-id map App.vue renders), not a per-pane CSS branch
  // this bound-width function needs to arbitrate; the `{mode:'full'}`
  // leg therefore never actually triggers from this call site, but the
  // function's own contract is preserved unchanged (import, not
  // reimplementation) rather than hand-inlining a narrower copy.
  //
  // Sovereignty (dispatch L3): the render-time reconciliation against the
  // OUTER region's live width (`computeTreePanelClampedWidthPx`, the
  // W3-fix corrective for the 900x600 clipping regression) is DELETED —
  // `App.vue`'s own `sideColumnLayout` (`useSideColumnLiveLayout`) is now
  // the sole owner of `tree`'s own REALIZED width (it reads
  // `store.session.ui.treePanelWidthPx` directly, not through this
  // composed value); this fact is retained for callers that only need the
  // stored-or-default precedence without the side-column-row reservation
  // App.vue's own solve additionally applies.
  const effectiveTreePanelWidthPx = computed<number>(() => {
    const bound = computeTreePanelBoundWidth({
      axisColumn: false,
      storedWidthPx: store.session.ui.treePanelWidthPx,
      workspaceWidthPx: rowWidthPx.value,
    });
    return bound.mode === 'fixed' ? bound.widthPx : treePanelDefaultWidthPx.value;
  });

  return {
    startResizeInner,
    startResizeOuter,
    effectiveTreeControlRegionWidthPx,
    effectiveTreePanelWidthPx,
    treePanelDefaultWidthPx,
    // Sovereignty (dispatch L3): the OUTER bar's own starvation
    // diagnostic — non-empty exactly when the stored/restored
    // `treeControlRegionWidthPx` starves `#board-area` below
    // `MIN_BOARD_PX`. Exposed (not just pushed as a side effect) so a
    // caller — a test, or a future UI surface — can read the CURRENT
    // diagnostic state directly rather than only observing the one-shot
    // system-message push.
    outerRowSovereignDiagnostic,
    // #split-workspace's own live width/height (Phase 1, resolution
    // roadmap): the SAME ResizeObserver-cached geometry the clamps
    // above already read — exposed so `state/layout-model.ts`'s
    // `useDeferredLayoutClass` can derive the axis/width LayoutClass
    // from it without a second observer on the same element (ADR-0010
    // imperative-escape discipline: one observer per measured
    // element).
    rowWidthPx,
    rowHeightPx,
    // Finish-pass wave A: `#tree-control-wrapper`'s own live width — see
    // this file's header comment at its own ResizeObserver above for the
    // full derivation.
    sideColumnWidthPx,
    // Row 2502/2503 review repair, finding 2 ("SCREEN-CLASS FREEZE") —
    // see `reattachObservers`'s own doc above.
    reattachObservers,
  };
}
