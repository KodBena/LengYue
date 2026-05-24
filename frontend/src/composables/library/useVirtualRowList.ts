/**
 * src/composables/library/useVirtualRowList.ts
 *
 * Tiny fixed-row-height virtual-scroll primitive. Pure logic over
 * reactive inputs: given a total row count, a fixed row height, a
 * container height, and a scroll position, computes which row
 * indices need to be rendered and how tall the leading spacer
 * should be to keep the scrollbar honest.
 *
 * No DOM access, no event listeners — the consuming component is
 * the boundary that observes `scroll` and `ResizeObserver` events
 * and feeds the resulting reactive refs in. This composable is
 * trivially unit-testable in isolation; the rendering component
 * is the only place that needs jsdom.
 *
 * Why roll our own rather than pulling `@tanstack/vue-virtual` or
 * `vue-virtual-scroller`: ~50 lines of logic, no transitive
 * dependencies, zero supply-chain surface. The XZ-utils backdoor
 * (2024) made the structural case against single-maintainer
 * trust-chain risk concrete; for primitives this small, npm
 * dependency exposure is a worse trade than the integration cost
 * of writing it ourselves.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';

export interface VirtualRowList {
  /** First row index to render (inclusive). */
  readonly visibleStart: ComputedRef<number>;

  /**
   * Row index past the last one to render (exclusive). The
   * convention matches `Array.slice(start, end)` semantics so
   * the consuming component can iterate `for (i = start; i <
   * end; i++)` without an off-by-one.
   */
  readonly visibleEnd: ComputedRef<number>;

  /**
   * Pixel height of the leading spacer — the space above
   * `visibleStart`'s row that keeps the scroll position aligned
   * with the row offset. The component applies this as
   * `transform: translateY(-topSpacerPx)` on the row container
   * inside a parent of height `totalHeightPx`, or as a leading
   * blank `<div>` of this height.
   */
  readonly topSpacerPx: ComputedRef<number>;

  /**
   * Total scrollable height in pixels. The component sets the
   * scroll container's content to this height so the native
   * scrollbar reflects the full row count.
   */
  readonly totalHeightPx: ComputedRef<number>;
}

export interface VirtualRowListOptions {
  /** Total rows that exist; `null` means "not yet loaded". */
  totalCount: Readonly<Ref<number | null>>;

  /**
   * Fixed pixel height per row. Constant — the primitive
   * deliberately doesn't support variable row heights, which is
   * what saves the ~500 lines of code that buys.
   */
  rowHeightPx: number;

  /** Scroll container's `clientHeight` — width of the visible window. */
  containerHeightPx: Readonly<Ref<number>>;

  /** Scroll container's `scrollTop`. */
  scrollTopPx: Readonly<Ref<number>>;

  /**
   * Rows to render above and below the strict visible window.
   * Larger values reduce blank-row flashes during fast scrolls
   * at the cost of rendering more DOM nodes. Default 5 — small
   * enough that even at 25k rows the rendered count stays in
   * the low tens.
   */
  overscan?: number;
}

const DEFAULT_OVERSCAN = 5;

export function useVirtualRowList(opts: VirtualRowListOptions): VirtualRowList {
  const overscan = opts.overscan ?? DEFAULT_OVERSCAN;

  const visibleStart = computed(() => {
    const total = opts.totalCount.value ?? 0;
    if (total === 0) return 0;
    const firstFullyVisible = Math.floor(opts.scrollTopPx.value / opts.rowHeightPx);
    return Math.max(0, firstFullyVisible - overscan);
  });

  const visibleEnd = computed(() => {
    const total = opts.totalCount.value ?? 0;
    if (total === 0) return 0;
    const visibleRowCount = Math.ceil(opts.containerHeightPx.value / opts.rowHeightPx);
    const firstFullyVisible = Math.floor(opts.scrollTopPx.value / opts.rowHeightPx);
    const rawEnd = firstFullyVisible + visibleRowCount + overscan;
    return Math.min(total, rawEnd);
  });

  const topSpacerPx = computed(() => visibleStart.value * opts.rowHeightPx);

  const totalHeightPx = computed(() => (opts.totalCount.value ?? 0) * opts.rowHeightPx);

  return { visibleStart, visibleEnd, topSpacerPx, totalHeightPx };
}
