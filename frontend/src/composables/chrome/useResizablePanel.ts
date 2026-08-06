/**
 * src/composables/chrome/useResizablePanel.ts
 *
 * The horizontal resize-bar between the tree panel and the control
 * panel. Per release-scope item 7's "use the resizer to control the
 * board square" model, the drag mutates
 * `store.session.ui.boardSquareMaxWidthPx` — a user-set upper bound
 * on the square board's width. The board column sizes itself via
 * `aspect-ratio: 1/1` (width derived from height); this cap lets
 * the user shrink the board below that natural max so the control
 * panel can have more horizontal room. The mapping is piecewise-
 * linear and clipped:
 *
 *   - Drag right: target grows. Board grows up to the saturation
 *     point (column.height). Past that (ui-fix-56, Defect 5), the
 *     board itself stops changing — aspect-ratio pins the rendered
 *     width — but the drag keeps having a *visible* effect: it
 *     shrinks `#control-panel`'s explicit width instead
 *     (`controlPanelWidthPx`), down to `CONTROL_PANEL_MIN_WIDTH_PX`.
 *     The freed strip shows up as centered margin around the maxed
 *     board via `#split-workspace`'s conditional
 *     `justify-content: center` (App.vue), the same mechanism
 *     Defect 6 uses when the control panel is toggled off — which is
 *     also what makes the resizer bar itself track the cursor past
 *     saturation: it sits between the tree panel and the control
 *     panel inside that centered block, so as the block's total
 *     width shrinks, centering pushes the whole block (board
 *     included) rightward, carrying the resizer with it.
 *   - Drag left: target shrinks. Board shrinks. Saturates at
 *     `MIN_BOARD` (300px) at the low end. `controlPanelWidthPx`
 *     reverts to `undefined` the moment `next` drops back to or
 *     below the saturation point, handing control-panel sizing back
 *     to its default `flex: 1 1 0` fill — byte-identical to the
 *     pre-ui-fix-56 behavior for the whole below-saturation range.
 *
 * On mousedown, the drag origin is read from the column's current
 * rendered width (via `getBoundingClientRect`). This makes the
 * first delta visually continuous with what the user is looking
 * at, regardless of whether the persisted target was previously
 * set, undefined, or stale relative to the current window size.
 * The saturation point and the row's "other fixed width" (tree
 * panel + resizer + borders — everything in `#split-workspace`
 * besides the board column and the control panel) are likewise
 * measured once at drag start, not on every `mousemove` — a
 * `mousemove`-time `getBoundingClientRect` read would force a
 * synchronous reflow on the hot path (the same
 * ResizeObserver-cached-geometry discipline `frontend/CLAUDE.md`'s
 * imperative-escape pattern names for other hot paths). The two
 * pure math steps derived from those measurements
 * (`computeBoardTargetPx`, `computeControlPanelWidthPx`) are
 * exported separately so the drag math is unit-testable without a
 * DOM.
 *
 * `controlPanelWidthPx` is deliberately **not** persisted to the
 * store: it is a derived, session-local render hint (the row's
 * available width is itself a runtime/DOM fact that can change
 * between sessions), not a piece of durable user intent the way
 * `boardSquareMaxWidthPx` is. On reload it starts `undefined`
 * (control panel back to its default flex fill) until the user
 * drags again.
 *
 * License: Public Domain (The Unlicense).
 */
import { onUnmounted, ref } from 'vue';
import { store, touchSession } from '../../store';

const MIN_BOARD = 300;
const MAX_BOARD = 4096;

// magic-literal: mirrors App.vue's own #control-panel min-width
// (the tab-strip-legibility floor documented at that call site).
// Exported so App.vue can bind the same value instead of a second
// hardcoded '220px' literal drifting out of sync with this one.
export const CONTROL_PANEL_MIN_WIDTH_PX = 220;

/**
 * Pure drag-math: the next `boardSquareMaxWidthPx` target for a
 * given drag origin and cumulative mouse delta, clamped to
 * [MIN_BOARD, MAX_BOARD]. No DOM, no store — a plain function of
 * its inputs so it's directly unit-testable.
 */
export function computeBoardTargetPx(dragOriginPx: number, totalDeltaPx: number): number {
  return Math.max(MIN_BOARD, Math.min(dragOriginPx + totalDeltaPx, MAX_BOARD));
}

/**
 * Pure post-saturation math for Defect 5 (ui-fix-56): given the
 * current board target, the board's own height-driven saturation
 * width, and the row geometry measured once at drag start, returns
 * the explicit width `#control-panel` should render at, or
 * `undefined` when the board hasn't reached saturation (below
 * saturation, `#control-panel` keeps its default `flex: 1 1 0`
 * fill — this function must return `undefined` for every input
 * where `targetPx <= boardColumnSaturationPx`, which is what keeps
 * that range byte-identical to pre-fix behavior).
 *
 * `rowWidthAtDragStartPx === 0` is the "couldn't measure the row at
 * drag start" sentinel (missing `#split-workspace` or
 * `#control-panel` element) — treated the same as "not saturated":
 * no shrink math without real geometry to derive it from.
 */
export function computeControlPanelWidthPx(
  targetPx: number,
  boardColumnSaturationPx: number,
  rowWidthAtDragStartPx: number,
  otherFixedWidthAtDragStartPx: number,
): number | undefined {
  if (rowWidthAtDragStartPx === 0 || targetPx <= boardColumnSaturationPx) {
    return undefined;
  }
  const overshootPx = targetPx - boardColumnSaturationPx;
  const naturalPanelWidthPx =
    rowWidthAtDragStartPx - otherFixedWidthAtDragStartPx - boardColumnSaturationPx;
  return Math.max(CONTROL_PANEL_MIN_WIDTH_PX, Math.round(naturalPanelWidthPx - overshootPx));
}

export function useResizablePanel() {
  const isResizing = ref(false);
  // Defect 5 (ui-fix-56): explicit #control-panel width past board
  // saturation, or undefined below it. See computeControlPanelWidthPx.
  const controlPanelWidthPx = ref<number | undefined>(undefined);

  let lastMouseX = 0;
  let dragOriginPx = 0;
  // The board's own height-driven width ceiling (aspect-ratio: 1/1
  // against the column's rendered height), measured once at drag
  // start.
  let boardColumnSaturationPx = MAX_BOARD;
  // Row geometry measured once at drag start; see
  // computeControlPanelWidthPx's doc for how these combine.
  let rowWidthAtDragStartPx = 0;
  let otherFixedWidthAtDragStartPx = 0;

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing.value = true;
    lastMouseX = e.clientX;
    // Reset to the default flex-fill shape at the start of every
    // drag; onMouseMove re-derives it from this drag's own
    // measurements before the first store write.
    controlPanelWidthPx.value = undefined;

    const col = document.getElementById('board-column');
    if (col) {
      const colRect = col.getBoundingClientRect();
      // Use the column's current rendered width as the drag origin
      // so the user's first delta lands exactly where they expect.
      dragOriginPx = Math.round(colRect.width);
      boardColumnSaturationPx = Math.round(colRect.height);
    } else {
      // Fallback: persisted value, or a sensible mid-range default
      // if neither the DOM nor the store has anything to offer.
      dragOriginPx = store.session.ui.boardSquareMaxWidthPx ?? 600;
      boardColumnSaturationPx = MAX_BOARD;
    }

    const row = document.getElementById('split-workspace');
    const panel = document.getElementById('control-panel');
    if (row && panel) {
      const rowWidthPx = Math.round(row.getBoundingClientRect().width);
      const panelWidthPx = Math.round(panel.getBoundingClientRect().width);
      rowWidthAtDragStartPx = rowWidthPx;
      otherFixedWidthAtDragStartPx = rowWidthPx - dragOriginPx - panelWidthPx;
    } else {
      // No control panel currently in the row (e.g. dragging isn't
      // actually reachable without it — .panel-resizer is v-show
      // gated on controlsExpanded — but fail safe rather than throw):
      // the "couldn't measure" sentinel, see computeControlPanelWidthPx.
      rowWidthAtDragStartPx = 0;
      otherFixedWidthAtDragStartPx = 0;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.classList.add('resizing');
  }

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return;
    const totalDelta = e.clientX - lastMouseX;
    const next = computeBoardTargetPx(dragOriginPx, totalDelta);
    store.session.ui.boardSquareMaxWidthPx = next;
    // `boardSquareMaxWidthPx` is persisted session UI state; bump the session
    // counter so SyncService schedules a (debounced) save. The per-move bumps
    // coalesce into one PUT after the drag settles, exactly as the prior deep
    // `store.session` watch did. See `sessionVersion` in `store/index.ts`.
    // (`controlPanelWidthPx` below is deliberately NOT persisted — see the
    // file header — so the bump covers only the board-target write above.)
    touchSession();
    controlPanelWidthPx.value = computeControlPanelWidthPx(
      next,
      boardColumnSaturationPx,
      rowWidthAtDragStartPx,
      otherFixedWidthAtDragStartPx,
    );
  }

  function stopResize() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.classList.remove('resizing');
  }

  // If the host SFC unmounts mid-drag (HMR, route change), the
  // document-level mousemove / mouseup listeners would persist and
  // body.classList would keep the 'resizing' class. stopResize is
  // idempotent — safe to call when no drag is in flight, removeEvent-
  // Listener is a no-op for unattached handlers, classList.remove is
  // a no-op for an absent class. Mirrors HorizontalTimelineVisualizer's
  // onUnmounted(() => stopDragging()) pattern.
  onUnmounted(stopResize);

  return { startResize, controlPanelWidthPx };
}
