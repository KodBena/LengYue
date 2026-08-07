/**
 * src/composables/chrome/useVirtualList.ts
 *
 * Minimal fixed-height vertical virtual-list windower. Given a reactive item
 * source, a fixed item height, and the scroll-container element, it exposes the
 * visible slice plus the top/bottom spacer heights that preserve the scrollbar
 * geometry — so a caller renders O(viewport) items instead of O(N) regardless
 * of list length.
 *
 * Why this exists: the board-tab rail (`SidebarWidget`) rendered ALL N
 * `BoardTab`s at once — ~800 DOM nodes each, so ~185k live nodes at 230 boards,
 * with the attendant layout/reflow cost and a large detached-subtree population
 * for the GC to chase on close (the close-at-scale postmortem's space + leak
 * findings). Only ~a dozen tabs are ever visible; this windows the render to
 * them.
 *
 * Scope is deliberately the FIXED-height case (every item the same height): the
 * board tabs are uniform, so the window is pure arithmetic on `scrollTop` and
 * the viewport height — no per-item measurement, no resize-of-items bookkeeping.
 * A variable-height generalisation is a different composable; this one refuses
 * to pretend it handles that case.
 *
 * Resource ownership (ADR-0010 imperative-escape discipline): the scroll
 * listener and the `ResizeObserver` registered on the container in `onMounted`
 * are released in `onUnmounted`. The scroll handler is rAF-coalesced — one
 * `scrollTop` read per frame, not per scroll event — so a fling does not run the
 * window recompute hundreds of times a second.
 *
 * Domain band (ADR-0003): truly agnostic (B1). It speaks only of items,
 * heights, and scroll offsets; nothing game-, board-, or Go-coupled.
 *
 * License: Public Domain (The Unlicense)
 */
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  type Ref,
  type ComputedRef,
} from 'vue';

export interface VirtualWindow<T> {
  /** Absolute index of the first rendered item. */
  readonly start: number;
  /** Absolute index one past the last rendered item. */
  readonly end: number;
  /** The rendered slice, `items.slice(start, end)`. */
  readonly items: readonly T[];
}

export interface UseVirtualListOptions<T> {
  /** Reactive item source (read inside a computed, so it tracks). */
  readonly items: () => readonly T[];
  /** Fixed per-item height in px (reactive: pass a measured ref's getter). */
  readonly itemHeight: () => number;
  /** The scroll-container element (the `overflow-y:auto` ancestor). */
  readonly containerRef: Ref<HTMLElement | null>;
  /** Extra items rendered above and below the viewport (anti-flash). Default 4. */
  readonly overscan?: number;
}

export interface UseVirtualListReturn<T> {
  readonly window: ComputedRef<VirtualWindow<T>>;
  /** Spacer height above the slice = `start * itemHeight`. */
  readonly topPadPx: ComputedRef<number>;
  /** Spacer height below the slice = `(length - end) * itemHeight`. */
  readonly bottomPadPx: ComputedRef<number>;
  /** Scroll item `index` just into view (no-op if already visible). */
  readonly scrollToIndex: (index: number) => void;
}

export function useVirtualList<T>(opts: UseVirtualListOptions<T>): UseVirtualListReturn<T> {
  const overscan = opts.overscan ?? 4;
  const scrollTop = ref(0);
  const viewportH = ref(0);

  // rAF-coalesced scroll: collapse a burst of scroll events to one scrollTop
  // read per frame (the window recompute is cheap, but not free per event).
  let scheduled = false;
  function onScroll(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const el = opts.containerRef.value;
      if (el) scrollTop.value = el.scrollTop;
    });
  }

  let resizeObs: ResizeObserver | null = null;
  onMounted(() => {
    const el = opts.containerRef.value;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    resizeObs = new ResizeObserver(() => {
      // Post-layout read inside the RO callback — no forced reflow.
      viewportH.value = el.clientHeight;
    });
    resizeObs.observe(el);
    viewportH.value = el.clientHeight;
    scrollTop.value = el.scrollTop;
  });

  onUnmounted(() => {
    const el = opts.containerRef.value;
    if (el) el.removeEventListener('scroll', onScroll);
    resizeObs?.disconnect();
    resizeObs = null;
  });

  const window = computed<VirtualWindow<T>>(() => {
    const items = opts.items();
    const h = Math.max(1, opts.itemHeight());
    const n = items.length;
    const start = Math.max(0, Math.floor(scrollTop.value / h) - overscan);
    const visible = Math.ceil((viewportH.value || 0) / h) + overscan * 2;
    const end = Math.min(n, start + visible);
    return { start, end, items: items.slice(start, end) };
  });

  const topPadPx = computed(() => window.value.start * opts.itemHeight());
  const bottomPadPx = computed(
    () => (opts.items().length - window.value.end) * opts.itemHeight(),
  );

  function scrollToIndex(index: number): void {
    const el = opts.containerRef.value;
    if (!el) return;
    const h = opts.itemHeight();
    const top = index * h;
    const bottom = top + h;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }

  return { window, topPadPx, bottomPadPx, scrollToIndex };
}
