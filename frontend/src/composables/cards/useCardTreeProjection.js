/**
 * src/composables/cards/useCardTreeProjection.ts
 *
 * Pure projection from a card-tree forest + active-set + manual-expand
 * state to the role-annotated render forest the CardTreeWidget hands
 * to ECharts. Implements the active/context/stub/bucket logic specified
 * in `docs/archive/notes/card-tree-frontend-spec.md` §"The display projection".
 *
 * ── Band (ADR-0003) ──────────────────────────────────────────────────────────
 * Truly domain-agnostic. The projection operates on `{id, children}`
 * over branded `CardId`; the algorithm has no Go-specific concepts,
 * no SGF awareness, no dependency on the analysis palette. A chess or
 * shogi adopter would import this composable unchanged.
 *
 * ── Reactivity ──────────────────────────────────────────────────────────────
 * Single `computed` over the three inputs (`forest`, `activeSet`,
 * `manualExpand`). No side-effects, no watchers; the widget owns the
 * manual-expand `ref` and mutates it on click. The composable returns
 * a `ComputedRef`, so the widget naturally re-projects on input change.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
// ── Manual-expand key scheme ─────────────────────────────────────────────────
const BUCKET_PREFIX = 'bucket:';
/**
 * Synthetic id for the bucket of cold leaves under `parentCardId`.
 * Distinct from any real card id (real ids stringify as bare digits;
 * bucket ids carry the `bucket:` prefix).
 */
export function bucketIdFor(parentCardId) {
    // Construction site for the bucket shape of the CardTreeExpandKey brand.
    return `${BUCKET_PREFIX}${parentCardId}`;
}
export function isBucketKey(key) {
    return key.startsWith(BUCKET_PREFIX);
}
/**
 * Manual-expand key for a real card id — the form the widget uses when
 * the user clicks a stub to expand it. A simple `String(cardId)`; the
 * helper exists so the call site is symmetric with `bucketIdFor`.
 */
export function cardExpandKeyFor(cardId) {
    // Construction site for the card shape of the CardTreeExpandKey brand.
    return String(cardId);
}
// ── Projection ───────────────────────────────────────────────────────────────
/**
 * Project a forest to the render-side shape. Pure; no side-effects.
 * Browse mode is derived from `activeSet.size === 0` per the spec.
 */
export function projectForest(forest, activeSet, manualExpand) {
    const browseMode = activeSet.size === 0;
    return forest.map(tree => projectTree(tree, activeSet, manualExpand, browseMode));
}
function projectTree(tree, activeSet, manualExpand, browseMode) {
    const hot = computeHotSet(tree.tree, activeSet);
    const root = projectNode(tree.tree, hot, activeSet, manualExpand, 
    /* isRoot */ true, browseMode);
    return {
        rootCardId: tree.rootCardId,
        gameSourceId: tree.gameSourceId,
        root,
        stats: {
            totalCardNodes: countAllNodes(tree.tree),
            activeCount: countActive(tree.tree, activeSet),
            renderedNodeCount: countRendered(root),
        },
    };
}
/**
 * Returns the set of node ids whose subtree contains an active node
 * (including the node itself if it is active). The closure of the
 * active set under ancestor-walk per spec §"Step 1 — Compute the hot
 * set".
 */
function computeHotSet(root, active) {
    const hot = new Set();
    walk(root);
    return hot;
    function walk(node) {
        let isHot = active.has(node.id);
        for (const c of node.children) {
            if (walk(c))
                isHot = true;
        }
        if (isHot)
            hot.add(node.id);
        return isHot;
    }
}
/**
 * Per-node projection. Implements spec §§"Step 2 — Decide what to
 * expand" and "Step 3 — Classify the children of each expanded node".
 *
 * The (b) condition — "hot AND ≥1 hot child" rather than just "hot" —
 * is the path-through invariant the spec calls out as the subtlest
 * point: an active leaf with cold descendants is hot but not warm,
 * and so renders as a stub (the user is signalled "matched here" via
 * the stub's `isHeadActive` flag and the standard "click to see").
 */
function projectNode(node, hot, active, manualExpand, isRoot, browseMode) {
    const isActive = active.has(node.id);
    const hasChildren = node.children.length > 0;
    // True leaf — render as a card; no expand decision applies.
    if (!hasChildren) {
        return {
            kind: 'card',
            cardId: node.id,
            role: isActive ? 'active' : 'context',
            children: [],
        };
    }
    const isHot = hot.has(node.id);
    const hasHotChild = node.children.some(c => hot.has(c.id));
    const cardKey = cardExpandKeyFor(node.id);
    const expand = manualExpand.has(cardKey) ||
        (isHot && hasHotChild) ||
        (browseMode && isRoot);
    if (!expand) {
        return {
            kind: 'stub',
            cardId: node.id,
            role: 'stub',
            subtreeSize: countAllNodes(node),
            isHeadActive: isActive,
        };
    }
    // Expanded: classify children into the three buckets per spec.
    const hotChildren = [];
    const coldInternals = [];
    const coldLeaves = [];
    for (const c of node.children) {
        if (hot.has(c.id))
            hotChildren.push(c);
        else if (c.children.length > 0)
            coldInternals.push(c);
        else
            coldLeaves.push(c);
    }
    // Render order: hot first, then cold internals as stubs, then the
    // bucket last (spec §"useful ordering convention").
    const rendered = [];
    for (const c of hotChildren) {
        rendered.push(projectNode(c, hot, active, manualExpand, /* isRoot */ false, browseMode));
    }
    for (const c of coldInternals) {
        if (manualExpand.has(cardExpandKeyFor(c.id))) {
            rendered.push(projectNode(c, hot, active, manualExpand, false, browseMode));
        }
        else {
            rendered.push({
                kind: 'stub',
                cardId: c.id,
                role: 'stub',
                subtreeSize: countAllNodes(c),
                isHeadActive: active.has(c.id),
            });
        }
    }
    if (coldLeaves.length > 0) {
        const bId = bucketIdFor(node.id);
        if (manualExpand.has(bId)) {
            // Expanded bucket: each cold leaf becomes its own quiet terminal
            // node. Spec §"Node roles" enumerates four roles; cold leaves
            // exposed via bucket-expansion don't fit "active/stub/bucket",
            // so they take the 'context' role — quiet default treatment.
            // The formal context definition ("has at least one active
            // descendant") is loosened pragmatically for this case; the
            // visual treatment matches.
            for (const cl of coldLeaves) {
                rendered.push({
                    kind: 'card',
                    cardId: cl.id,
                    role: active.has(cl.id) ? 'active' : 'context',
                    children: [],
                });
            }
        }
        else {
            rendered.push({
                kind: 'bucket',
                bucketId: bId,
                parentCardId: node.id,
                childCardIds: coldLeaves.map(c => c.id),
                role: 'bucket',
            });
        }
    }
    return {
        kind: 'card',
        cardId: node.id,
        role: isActive ? 'active' : 'context',
        children: rendered,
    };
}
// ── Walk helpers (exported for widget consumers) ─────────────────────────────
/**
 * Visits every render-time card node (skipping stubs and buckets).
 * Used by the widget for lazy thumbnail-data hydration.
 */
export function forEachCardNode(node, fn) {
    if (node.kind !== 'card')
        return;
    fn(node.cardId, node.role);
    for (const c of node.children)
        forEachCardNode(c, fn);
}
// ── Counting helpers ─────────────────────────────────────────────────────────
function countAllNodes(node) {
    let n = 1;
    for (const c of node.children)
        n += countAllNodes(c);
    return n;
}
function countActive(node, active) {
    let n = active.has(node.id) ? 1 : 0;
    for (const c of node.children)
        n += countActive(c, active);
    return n;
}
function countRendered(node) {
    if (node.kind === 'card') {
        let n = 1;
        for (const c of node.children)
            n += countRendered(c);
        return n;
    }
    // stub and bucket each occupy one ECharts node; their underlying
    // contents are summarized, not rendered.
    return 1;
}
// ── Composable wrapper ───────────────────────────────────────────────────────
/**
 * Reactive wrapper around `projectForest`. The widget passes its
 * three input refs; the composable returns a `ComputedRef` that
 * re-projects whenever any of them changes.
 *
 * The forest, active set, and manual-expand set are all owned by the
 * widget (or its consumer); this composable is read-only over them.
 */
export function useCardTreeProjection(forestRef, activeSetRef, manualExpandRef) {
    const renderForest = computed(() => projectForest(forestRef.value, activeSetRef.value, manualExpandRef.value));
    return { renderForest };
}
