/**
 * src/composables/forest/useTreeExpansion.ts
 *
 * Expansion state logic: Default = Variations Hidden.
 *
 * UX invariant the composable enforces (via `ensureVisible`): the
 * board's current node is always visible in the tree. Callers (today
 * just `TreeWidget`) invoke `ensureVisible` on mount and on every
 * `currentNodeId` change; the walk-up adds every ancestor to the
 * expansion set so no collapsed-variation toggle can hide the
 * currently-displayed node. This composes the SPA-reload case
 * (initial mount with a mid-variation currentNodeId) and the
 * multi-step navigation case (PV paste, where Vue's reactive batching
 * means only the leaf of the new branch fires the watcher) under the
 * same primitive.
 *
 * Union semantics, not replacement: `ensureVisible` adds ancestors to
 * the existing expanded set rather than replacing it. Variations the
 * user had previously revealed stay revealed.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref } from 'vue';
export function useTreeExpansion() {
    // Tracks nodes whose variations ARE showing. Default empty =
    // all variations collapsed.
    const expandedNodes = ref(new Set());
    const isExpanded = (nodeId) => expandedNodes.value.has(nodeId);
    const toggle = (nodeId) => {
        const next = new Set(expandedNodes.value);
        if (next.has(nodeId)) {
            next.delete(nodeId);
        }
        else {
            next.add(nodeId);
        }
        expandedNodes.value = next;
    };
    const expandMany = (nodeIds) => {
        const next = new Set(expandedNodes.value);
        for (const id of nodeIds)
            next.add(id);
        expandedNodes.value = next;
    };
    const collapseAll = () => {
        expandedNodes.value = new Set();
    };
    const ensureVisible = (nodes, nodeId) => {
        const ancestors = [];
        let cur = nodes[nodeId]?.parent ?? null;
        // Annotated exemption (local/hand-rolled-path-walk): collects the strict
        // ancestor list (parent→root, excluding nodeId itself) as a bare
        // `NodeId[]`. getPath gives the inclusive root→target path; deriving the
        // strict-ancestor slice from it is sound but a behaviour-adjacent change
        // to this perf-load-bearing `ensureVisible` guard (the ADR-0010 nav-cost
        // fix), so it is named-as-debt for the path-consolidation arc.
        // eslint-disable-next-line local/hand-rolled-path-walk -- ensureVisible perf guard; derive the ancestor slice from getPath in the path-consolidation arc
        while (cur) {
            ancestors.push(cur);
            cur = nodes[cur]?.parent ?? null;
        }
        if (ancestors.length === 0)
            return;
        // Only reassign when an ancestor is actually missing. The previous
        // unconditional `new Set` reassignment fired the `expandedNodes` dep on
        // every call — including linear navigation (mainline descent), where
        // every ancestor is already expanded — which recomputed the entire tree
        // layout via useTreeLayout's watchEffect on each nav step, and defeated
        // TreeWidget's edge/node memos (the recomputed layout handed them fresh
        // array refs). On the common path this now returns without touching the
        // ref, so the layout stays stable and the memos skip. Lateral nav into a
        // collapsed variation still expands (an ancestor is genuinely absent).
        const current = expandedNodes.value;
        if (ancestors.every(id => current.has(id)))
            return;
        const next = new Set(current);
        for (const id of ancestors)
            next.add(id);
        expandedNodes.value = next;
    };
    return { expandedNodes, isExpanded, toggle, expandMany, collapseAll, ensureVisible };
}
