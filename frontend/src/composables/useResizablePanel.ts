/**
 * src/composables/useResizablePanel.ts
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
 *     point (column.height). Past that, target keeps growing but
 *     aspect-ratio pins the rendered width — no visible change.
 *   - Drag left: target shrinks. Board shrinks. Saturates at
 *     `MIN_BOARD` (300px) at the low end.
 *
 * On mousedown, the drag origin is read from the column's current
 * rendered width (via `getBoundingClientRect`). This makes the
 * first delta visually continuous with what the user is looking
 * at, regardless of whether the persisted target was previously
 * set, undefined, or stale relative to the current window size.
 *
 * License: Public Domain (The Unlicense).
 */
import { onUnmounted, ref } from 'vue';
import { store } from '../store';

const MIN_BOARD = 300;
const MAX_BOARD = 4096;

export function useResizablePanel() {
  const isResizing = ref(false);
  let lastMouseX = 0;
  let dragOriginPx = 0;

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing.value = true;
    lastMouseX = e.clientX;

    const col = document.getElementById('board-column');
    if (col) {
      // Use the column's current rendered width as the drag origin
      // so the user's first delta lands exactly where they expect.
      dragOriginPx = Math.round(col.getBoundingClientRect().width);
    } else {
      // Fallback: persisted value, or a sensible mid-range default
      // if neither the DOM nor the store has anything to offer.
      dragOriginPx = store.session.ui.boardSquareMaxWidthPx ?? 600;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.classList.add('resizing');
  }

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return;
    const totalDelta = e.clientX - lastMouseX;
    const next = Math.max(MIN_BOARD, Math.min(dragOriginPx + totalDelta, MAX_BOARD));
    store.session.ui.boardSquareMaxWidthPx = next;
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

  return { startResize };
}
