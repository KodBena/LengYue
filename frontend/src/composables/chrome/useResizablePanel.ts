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
 * License: Public Domain (The Unlicense).
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
export function sanitizeTreeControlRegionWidthPx(
  rawWidthPx: number | undefined,
  rowWidthPx: number,
): number | undefined {
  if (rawWidthPx === undefined) return undefined;
  const maxRegionWidthPx = Math.max(
    WRAPPER_MIN_WIDTH_PX,
    Math.round(rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX),
  );
  return computeTreeControlRegionWidthPx(rawWidthPx, 0, maxRegionWidthPx);
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

  // ── Restore-time board-visibility clamp (ui-5-3) ──────────────────
  // See this file's header, "Restore-time board-visibility clamp",
  // for the full rationale. `rowWidthPx` is `#split-workspace`'s own
  // live width — independent of how its children (board / wrapper)
  // currently divide it, so measuring it is never circular with the
  // clamp derived from it. ResizeObserver-cached geometry per
  // `frontend/CLAUDE.md`'s imperative-escape pattern: measured once on
  // mount, refreshed only on an actual resize of the row, released on
  // unmount.
  const rowWidthPx = ref(0);
  let rowObserver: ResizeObserver | null = null;

  function measureRowWidth() {
    const row = document.getElementById('split-workspace');
    if (row) rowWidthPx.value = Math.round(row.getBoundingClientRect().width);
  }

  onMounted(() => {
    measureRowWidth();
    const row = document.getElementById('split-workspace');
    if (row && typeof ResizeObserver !== 'undefined') {
      rowObserver = new ResizeObserver(measureRowWidth);
      rowObserver.observe(row);
    }
  });

  onUnmounted(() => {
    rowObserver?.disconnect();
    rowObserver = null;
  });

  const effectiveTreeControlRegionWidthPx = computed(() =>
    sanitizeTreeControlRegionWidthPx(store.session.ui.treeControlRegionWidthPx, rowWidthPx.value),
  );

  return { startResizeInner, startResizeOuter, effectiveTreeControlRegionWidthPx };
}
