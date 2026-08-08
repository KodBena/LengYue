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
 *   OUTER bar (`#resizer-outer`, between `#board-column` and
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
 * CSS, no JS derivation at all) and `#board-column` is ALWAYS `flex:
 * 1 1 auto` in the outer row (App.vue) — both fully derived, never a
 * second writer for either persisted fact.
 *
 * ── Why TRUE nesting, not a flatter derivation (the geometric fix
 *    behind the live diagnostic) ──────────────────────────────────
 * An earlier shape of this rearch treated the row as one flat list
 * and derived `#board-column`'s width in JS from the OTHER panes'
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
 * `#resizer-outer`'s position depends only on `#board-column`'s width
 * in the OUTER row, which absorbs the complement against the
 * wrapper's OWN width (directly dragged by the outer bar) — the
 * dragged quantity (wrapper width) and the absorber (`#board-column`)
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
 * `#board-column` down to a sliver — reported as "the board comes
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
 * ── Board-column width cap: don't strand width the board can't use
 *    (commission row 848, "space should not be wasted") ─────────────
 * `#board-column` is a HEIGHT-bound square (App.vue's `#board-square`:
 * `height: 100%; aspect-ratio: 1/1`) — its rendered width is capped at
 * the row's own height (`#split-workspace`'s live height, the exact
 * same element the width clamp above already observes), never wider,
 * regardless of how much ROW width `#board-column`'s `flex: 1 1 auto`
 * would otherwise let it claim. Left uncapped, the NO-EXPLICIT-WIDTH
 * flex-fill branch (App.vue: `#tree-control-wrapper`'s `flex: '1 1
 * 0'`, engaged whenever `treeControlRegionWidthPx` has never been
 * dragged/restored) splits free row space between the two flex-grow
 * parties by their grow factor alone — `#board-column` claims its
 * "share" even past the point its own square can render into it,
 * which becomes dead centered margin around the square (`#board-
 * square`'s `align-self: center`), while `#control-panel` starves at
 * its floor. `boardColumnMaxWidthPx` (returned below) is a `max-width`
 * cap so the standard CSS flex algorithm freezes `#board-column` at
 * its actual usable width once it hits that ceiling and hands the
 * REMAINING free space to `#tree-control-wrapper`'s own `flex-grow`
 * instead — no JS-computed complement, no second writer for either
 * pane's width, same "let native flexbox redistribute past a frozen
 * item" mechanism the rest of this file relies on, just applied to
 * the OUTER pair instead of the inner one.
 *
 * Deliberately governs ONLY the flex-fill branch — see
 * `boardColumnMaxWidthPx`'s own doc for why an explicit (dragged or
 * restored) `treeControlRegionWidthPx` already leaves `#board-column`
 * with exactly the row's remaining share and needs no additional cap.
 * `rowHeightPx` reuses the SAME `#split-workspace` ResizeObserver the
 * width clamp above already maintains (one observer, two dimensions
 * off one `getBoundingClientRect()` read, per the imperative-escape
 * discipline's "measured once on resize, never on the hot path").
 * `computeBoardColumnMaxWidthPx` is a pure function so the cap is
 * unit-testable without mounting anything, matching
 * `sanitizeTreeControlRegionWidthPx`'s shape. When the board is
 * WIDTH-bound instead (a tall/narrow viewport, or the row is narrower
 * than its own height) the cap is simply non-binding — `rowHeightPx`
 * exceeds the available row width, so `#board-column` never reaches
 * it and keeps claiming freed space exactly as before; the un-height-
 * bound case is unchanged by construction, not by a separate branch.
 *
 * License: Public Domain (The Unlicense).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { store, touchSession } from '../../store';

// The board's own floor. The OUTER bar's upper clamp is derived so
// the board can never be squeezed narrower than this.
export const MIN_BOARD_PX = 300;

// magic-literal: mirrors #control-panel's min-width (App.vue) — the
// tab-strip-legibility floor documented at that call site. Used here
// only to derive the INNER bar's upper clamp (tree can't grow so
// wide it squeezes control below this floor).
export const CONTROL_PANEL_MIN_WIDTH_PX = 220;

// magic-literal: the tree panel's historical fixed width (pre-
// amendment `#vue-tree-panel { width: 140px }`). Kept as the FLOOR
// rather than picking a smaller number: no prior data point validates
// the tree/game-navigator widget rendering sensibly below 140px.
export const TREE_PANEL_MIN_WIDTH_PX = 140;

// The wrapper's own floor: it must fit at least the tree floor + the
// inner resizer + the control-panel floor. Derived, not independently
// chosen, so the three constants can't drift apart.
export const WRAPPER_MIN_WIDTH_PX = TREE_PANEL_MIN_WIDTH_PX + 4 + CONTROL_PANEL_MIN_WIDTH_PX;

// Each resizer bar's own rendered width (App.vue `.panel-resizer`).
export const RESIZER_WIDTH_PX = 4;

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
 * `#resizer-outer`'s RIGHT (`#board-column`, then the bar, then the
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

/**
 * ui-5-3 restore-time clamp: re-derives `startResizeOuter`'s own
 * `regionMaxWidthPx` bound (`rowWidthPx - MIN_BOARD_PX -
 * RESIZER_WIDTH_PX`, floored at `WRAPPER_MIN_WIDTH_PX`) from the row's
 * CURRENT live width, and clamps a persisted `rawWidthPx` against it
 * via `computeTreeControlRegionWidthPx` at zero displacement (`next =
 * dragOriginPx`, i.e. the raw value itself, then clamped) — so a
 * hydrated width that was saved against a DIFFERENT (usually wider)
 * viewport, or is otherwise stale/migrated/garbage, can never leave
 * `#board-column` narrower than `MIN_BOARD_PX`. `undefined` in ⇒
 * `undefined` out: a workspace whose OUTER bar has never been dragged
 * keeps its `flex: 1 1 0` default (App.vue) unchanged — fresh installs
 * are unaffected by this clamp.
 */
/**
 * Fresh-profile / never-dragged floor for `#tree-control-wrapper`
 * (App.vue's `flex: '1 1 0'` branch — `effectiveTreeControlRegionWidthPx
 * === undefined`, i.e. `session.ui.treeControlRegionWidthPx` has never
 * been set by a drag or a restored save). That branch previously carried
 * NO width floor of its own: the wrapper's CSS `min-width: 0` (needed so
 * the drag/restore branches above can shrink it to an explicit px width
 * smaller than its content) also applies here, where there is no
 * explicit width — so on a first paint whose available row space (after
 * `#board-column`'s flex-fill share) is narrower than the wrapper's
 * actual content floor, `#control-panel` overflows past the wrapper's
 * own box and off the viewport's right edge. Witnessed live at a
 * 1366×768 first paint: `#control-panel`'s rendered right edge sat
 * ~53px past the 1366px viewport (commissioner-witnessed clipped Cards
 * tab header + half-offscreen action buttons at ~1920 window widths
 * that weren't fully maximized/full-1920, ledger row 802).
 *
 * The floor mirrors exactly what IS visible inside the wrapper on this
 * paint — `WRAPPER_MIN_WIDTH_PX` (tree + inner resizer + control) when
 * the tree panel is also expanded, or just `CONTROL_PANEL_MIN_WIDTH_PX`
 * when the tree is collapsed and the wrapper holds only the control
 * panel — so a tree-collapsed first paint doesn't reserve room for a
 * tree panel that isn't rendered (over-clamping regression). This is a
 * DEFAULT/floor fix only: once the user drags either bar, or a saved
 * width restores, `effectiveTreeControlRegionWidthPx` takes over via the
 * explicit-width branch above (already floored at `WRAPPER_MIN_WIDTH_PX`
 * by `computeTreeControlRegionWidthPx` / `sanitizeTreeControlRegionWidthPx`),
 * and this floor no longer applies.
 */
export function freshTreeControlWrapperFloorPx(treeExpanded: boolean): number {
  return treeExpanded ? WRAPPER_MIN_WIDTH_PX : CONTROL_PANEL_MIN_WIDTH_PX;
}

export function sanitizeTreeControlRegionWidthPx(
  rawWidthPx: number | undefined,
  rowWidthPx: number,
): number | undefined {
  // Non-finite (NaN/±Infinity) persisted values — reachable via
  // updateFromRemote's unvalidated deepMerge — would NaN-poison the
  // Math.min/max clamp below and reach App.vue's :style as an invalid
  // CSS length: the exact minimized-board symptom this clamp exists to
  // close (review BLOCKER, ui-5-3-restore-clamp-review.md finding 1).
  // Treated as never-dragged: the flex default is the safe layout.
  if (rawWidthPx === undefined || !Number.isFinite(rawWidthPx)) return undefined;
  const maxRegionWidthPx = Math.max(
    WRAPPER_MIN_WIDTH_PX,
    Math.round(rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX),
  );
  return computeTreeControlRegionWidthPx(rawWidthPx, 0, maxRegionWidthPx);
}

/**
 * Board-column width cap (see this file's header, "Board-column width
 * cap"). `#board-square`'s width is derived from its own HEIGHT
 * (`height: 100%; aspect-ratio: 1/1`), and its height is `#board-
 * column`'s own height, which is `#split-workspace`'s (the row's) live
 * height — so the row's height IS the board's usable-width ceiling.
 * `rowHeightPx <= 0` (not yet measured) returns `undefined` — the
 * "don't cap before we know" default that mirrors
 * `sanitizeTreeControlRegionWidthPx`'s own not-yet-measured branch in
 * `effectiveTreeControlRegionWidthPx`, so a pre-measurement render
 * doesn't spuriously squeeze `#board-column` to its floor.
 */
export function computeBoardColumnMaxWidthPx(rowHeightPx: number): number | undefined {
  if (!Number.isFinite(rowHeightPx) || rowHeightPx <= 0) return undefined;
  return Math.max(MIN_BOARD_PX, Math.round(rowHeightPx));
}

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
      treeMaxWidthPx = Math.max(
        TREE_PANEL_MIN_WIDTH_PX,
        Math.round(wrapperWidthPx - CONTROL_PANEL_MIN_WIDTH_PX - RESIZER_WIDTH_PX),
      );
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
      regionMaxWidthPx = Math.max(
        WRAPPER_MIN_WIDTH_PX,
        Math.round(rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX),
      );
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

  // ── Restore-time board-visibility clamp (ui-5-3) + board-column
  //    width-cap geometry (commission row 848) ───────────────────────
  // See this file's header, "Restore-time board-visibility clamp" and
  // "Board-column width cap", for the full rationale of each. Both
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
  function attachRowObserver(): boolean {
    const row = document.getElementById('split-workspace');
    if (!row) return false;
    measureRowDims();
    if (typeof ResizeObserver !== 'undefined' && rowObserver === null) {
      rowObserver = new ResizeObserver(measureRowDims);
      rowObserver.observe(row);
    }
    return true;
  }

  onMounted(() => {
    if (attachRowObserver()) return;
    // Element not in the DOM yet (cold-load gate): attach one tick
    // after the workspace actually renders. The watcher stops itself
    // once attached; onUnmounted's disconnect handles the observer.
    const stopWatch = watch(
      () => store.workspaceLoadState.kind,
      (kind) => {
        if (kind !== 'loaded') return;
        void nextTick(() => {
          if (attachRowObserver()) stopWatch();
        });
      },
      { immediate: true },
    );
  });

  onUnmounted(() => {
    rowObserver?.disconnect();
    rowObserver = null;
  });

  const effectiveTreeControlRegionWidthPx = computed(() => {
    const raw = store.session.ui.treeControlRegionWidthPx;
    // Geometry not yet known (observer not attached — pre-load, or the
    // one tick between load and attach): clamping against a fantasy
    // width of 0 would pin the region to its minimum. Pass the value
    // through with only the non-finite guard; the real clamp engages
    // as soon as the row is measured.
    if (rowWidthPx.value <= 0) {
      return raw !== undefined && Number.isFinite(raw) ? raw : undefined;
    }
    return sanitizeTreeControlRegionWidthPx(raw, rowWidthPx.value);
  });

  // Fresh-profile floor for the flex-fill branch (see
  // `freshTreeControlWrapperFloorPx`'s doc above) — recomputed off
  // `treeExpanded` so a tree-collapsed first paint doesn't over-reserve.
  const freshTreeControlWrapperMinWidthPx = computed(() =>
    freshTreeControlWrapperFloorPx(store.session.ui.treeExpanded),
  );

  // Board-column width cap (see this file's header, "Board-column
  // width cap", commission row 848). Governs ONLY the NO-EXPLICIT-
  // WIDTH flex-fill branch — `controlsExpanded` false means there is
  // no competing `#tree-control-wrapper` flex-grow party to hand slack
  // to (the wrapper isn't rendered), and
  // `effectiveTreeControlRegionWidthPx !== undefined` means the OUTER
  // bar's own drag/restore already gives the wrapper an explicit
  // width, leaving `#board-column` with exactly the row's remaining
  // share — nothing left to cap. `undefined` in either case means "no
  // max-width style", i.e. App.vue falls back to the pre-existing
  // uncapped `flex: 1 1 auto` behaviour.
  const boardColumnMaxWidthPx = computed(() => {
    if (!store.session.ui.controlsExpanded) return undefined;
    if (effectiveTreeControlRegionWidthPx.value !== undefined) return undefined;
    return computeBoardColumnMaxWidthPx(rowHeightPx.value);
  });

  return {
    startResizeInner,
    startResizeOuter,
    effectiveTreeControlRegionWidthPx,
    freshTreeControlWrapperMinWidthPx,
    boardColumnMaxWidthPx,
  };
}
