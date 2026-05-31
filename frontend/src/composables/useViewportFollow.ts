/**
 * src/composables/useViewportFollow.ts
 * Keep a scroll container centred on a moving target without polling layout
 * in the hot path.
 * License: Public Domain (The Unlicense)
 */
import { onMounted, onUnmounted, type Ref } from 'vue';

// Edge margin (px): a target within this distance of a viewport edge counts
// as out-of-bounds and triggers re-centering. Preserves the inline constant
// from TreeWidget's prior auto-center check.
// magic-literal: viewport-follow edge margin; no substrate token governs it.
const EDGE_MARGIN_PX = 50;

/**
 * Re-centre a scroll container on a moving target (`centerOn(x, y)`) without
 * reading layout geometry in the caller's hot path.
 *
 * The naive shape reads `el.scrollLeft` / `clientWidth` synchronously each
 * time the target moves. When the caller has just mutated the DOM (a tree
 * re-render on navigation, say), that read forces a *synchronous* reflow:
 * the browser must flush pending styles + layout to answer it. Per-navigation
 * that is layout thrashing — and deferring the read into `requestAnimationFrame`
 * does *not* help, because rAF callbacks run before the frame's style/layout
 * pass, so the pending mutation is still unlaid-out and the read forces the
 * flush anyway.
 *
 * The fix is to observe rather than poll. Scroll offset is cached from a
 * passive `scroll` listener (fires after the scroll is applied — already
 * laid out) and viewport dimensions from a `ResizeObserver` (fires after
 * layout). Both update at layout-clean times, so `centerOn` reads only
 * cached values and never forces a reflow. Orientation-agnostic: both axes
 * are cached and checked, so there is no "primary axis" to special-case.
 */
export function useViewportFollow(el: Ref<HTMLElement | null>) {
  let scrollX = 0;
  let scrollY = 0;
  let viewW = 0;
  let viewH = 0;

  // Reads in this handler are reflow-free: a `scroll` event fires after the
  // scroll position is settled, so the geometry is already current.
  const onScroll = () => {
    const node = el.value;
    if (!node) return;
    scrollX = node.scrollLeft;
    scrollY = node.scrollTop;
  };

  // Reads inside a ResizeObserver callback are reflow-free: it fires after
  // the layout pass that changed the size.
  let resizeObserver: ResizeObserver | null = null;
  const syncDims = () => {
    const node = el.value;
    if (!node) return;
    viewW = node.clientWidth;
    viewH = node.clientHeight;
  };

  onMounted(() => {
    const node = el.value;
    if (!node) return;
    // Seed both caches once at mount. This is the single live geometry read
    // in the composable's lifetime, and it is off the navigation hot path.
    syncDims();
    scrollX = node.scrollLeft;
    scrollY = node.scrollTop;
    node.addEventListener('scroll', onScroll, { passive: true });
    resizeObserver = new ResizeObserver(syncDims);
    resizeObserver.observe(node);
  });

  onUnmounted(() => {
    // Release the listener + observer the composable installed on `el`. Vue
    // does not clean these up — they live outside its reactivity graph.
    el.value?.removeEventListener('scroll', onScroll);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  /**
   * Centre the container on (x, y) iff that point lies within
   * `EDGE_MARGIN_PX` of a viewport edge. Reads only cached geometry; the
   * `scrollTo` is instant (default behaviour) so fast successive calls track
   * the target's leading edge rather than restarting a smooth animation that
   * never arrives.
   */
  function centerOn(x: number, y: number) {
    const node = el.value;
    if (!node) return;
    const outOfBounds =
      x < scrollX + EDGE_MARGIN_PX || x > scrollX + viewW - EDGE_MARGIN_PX ||
      y < scrollY + EDGE_MARGIN_PX || y > scrollY + viewH - EDGE_MARGIN_PX;
    if (!outOfBounds) return;
    node.scrollTo({ left: x - viewW / 2, top: y - viewH / 2 });
    // Optimistically advance the scroll cache to the requested target. The
    // authoritative `scroll` event will correct any clamping at the scroll
    // extents, but it fires asynchronously — without this, a second
    // `centerOn` in the same task would test against a pre-scroll offset.
    scrollX = x - viewW / 2;
    scrollY = y - viewH / 2;
  }

  return { centerOn };
}
