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
const DEFAULT_OVERSCAN = 5;
export function useVirtualRowList(opts) {
    const overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    const visibleStart = computed(() => {
        const total = opts.totalCount.value ?? 0;
        if (total === 0)
            return 0;
        const firstFullyVisible = Math.floor(opts.scrollTopPx.value / opts.rowHeightPx);
        return Math.max(0, firstFullyVisible - overscan);
    });
    const visibleEnd = computed(() => {
        const total = opts.totalCount.value ?? 0;
        if (total === 0)
            return 0;
        const visibleRowCount = Math.ceil(opts.containerHeightPx.value / opts.rowHeightPx);
        const firstFullyVisible = Math.floor(opts.scrollTopPx.value / opts.rowHeightPx);
        const rawEnd = firstFullyVisible + visibleRowCount + overscan;
        return Math.min(total, rawEnd);
    });
    const topSpacerPx = computed(() => visibleStart.value * opts.rowHeightPx);
    const totalHeightPx = computed(() => (opts.totalCount.value ?? 0) * opts.rowHeightPx);
    return { visibleStart, visibleEnd, topSpacerPx, totalHeightPx };
}
