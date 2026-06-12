/**
 * src/composables/forest/useTreeLayout.ts
 *
 * Pluggable Tree Layout Composable.
 *
 * ## Reactivity
 *
 * `watchEffect` is used instead of `watch` so that all reactive reads made
 * during layout computation are automatically tracked as dependencies. This
 * covers two sources:
 *   1. `nodesRef.value`                 — the node graph (structural changes)
 *   2. `expansion.expandedNodes.value`  — the expansion set (UI state changes)
 *
 * License: Public Domain (The Unlicense)
 */
import { shallowRef, watchEffect, markRaw } from 'vue';
import { computeLayout, filterToExpandedSubtree, } from '../../engine/tree';
export const gridTreeLayout = computeLayout;
const EMPTY_LAYOUT = {
    positions: new Map(),
    cols: 1,
    rows: 1,
};
/**
 * Returns a reactive `LayoutResult` that recomputes whenever the node graph
 * or expansion state changes.
 */
export function useTreeLayout(nodesRef, algorithm = gridTreeLayout, expansion) {
    const layout = shallowRef(markRaw({ ...EMPTY_LAYOUT }));
    watchEffect(() => {
        const nodes = nodesRef.value;
        // Read the expansion set to register it as a reactive dependency.
        // `void` signals intent: we care about the tracking side-effect, not the value.
        // FIX: Updated from collapsedNodes to expandedNodes to match the new semantics.
        void expansion?.expandedNodes.value;
        const rootId = Object.values(nodes).find(n => n.parent === null)?.id;
        if (!rootId) {
            layout.value = markRaw({ ...EMPTY_LAYOUT });
            return;
        }
        const nodesToLayout = expansion
            ? filterToExpandedSubtree(nodes, expansion.isExpanded, rootId)
            : nodes;
        layout.value = markRaw(algorithm(nodesToLayout, rootId));
    });
    return { layout };
}
