/**
 * src/engine/tree.ts
 * Grid-based tree layout logic and tree graph transformations.
 */
/**
 * Produces a filtered view of the node graph.
 *
 * NEW SEMANTICS:
 * 1. The first child (index 0) is the "mainline" and is ALWAYS visible.
 * 2. Subsequent children (index 1..N) are "variations" and are only visible
 *    if `isExpanded(nodeId)` is true.
 */
export function filterToExpandedSubtree(nodes, isExpanded, rootId) {
    const result = {};
    function visit(nodeId) {
        const node = nodes[nodeId];
        if (!node)
            return;
        if (node.children.length <= 1) {
            // No siblings to hide, just pass through
            result[nodeId] = node;
        }
        else {
            const showVariations = isExpanded(nodeId);
            if (showVariations) {
                result[nodeId] = node;
            }
            else {
                // Prune everything except the mainline child
                result[nodeId] = { ...node, children: [node.children[0]] };
            }
        }
        // Recursively visit only the children that survived the filter
        for (const childId of result[nodeId].children) {
            visit(childId);
        }
    }
    visit(rootId);
    return result;
}
/**
 * Standard grid layout algorithm.
 * gy = depth from root (primary axis)
 * gx = branch track (secondary axis)
 */
export function computeLayout(nodes, rootId) {
    const positions = new Map();
    let maxTrack = 0;
    let maxDepth = 0;
    function assign(nodeId, track, depth) {
        const node = nodes[nodeId];
        if (!node)
            return;
        positions.set(nodeId, { gx: track, gy: depth });
        if (depth > maxDepth)
            maxDepth = depth;
        for (let i = 0; i < node.children.length; i++) {
            if (i === 0) {
                assign(node.children[i], track, depth + 1);
            }
            else {
                maxTrack++;
                assign(node.children[i], maxTrack, depth + 1);
            }
        }
    }
    assign(rootId, 0, 0);
    return {
        positions,
        cols: maxTrack + 1,
        rows: maxDepth + 1,
    };
}
