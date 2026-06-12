/**
 * src/composables/cards/usePreviewSnapshot.ts
 *
 * The cured hover-preview quartet, single-sourced.
 *
 * Several analysis surfaces show a board thumbnail for a hovered / docked
 * node. The race-free shape they all converged on (PR #413 / #424, mirrored
 * from `TreeWidget.onToggleEnter`) is one invariant over every writer of the
 * visible preview slot:
 *
 *   > The visible preview ref is written only SYNCHRONOUSLY; the only async
 *   > work is a fire-and-forget cache WARM that writes the shared (reactive)
 *   > snapshot cache, never the gate.
 *
 * Holding the *target node* (not an awaited snapshot) in the gate, and
 * deriving the displayed snapshot through `getSnapshotSync` in an accessor,
 * moves the only async write off the gate and onto the shared cache. A late
 * cache-miss resolve can therefore FILL a still-targeted thumbnail but can
 * never RESURRECT a node a leave-time reset already cleared — the
 * content-resurrection race the migration closed. (The old
 * `preview.value = await getSnapshot(...)` shape was last-write-wins on the
 * VISIBLE state, so a late resolve landing after a leave-time reset
 * repopulated the docked preview with the stale hovered position.)
 *
 * This composable is the shared unit the cured quartet was hand-copied into
 * before extraction (item `preview-snapshot-shared-composable`, promoted from
 * the PR #424 worklog's "duplication, not extraction" not-filed marker). Two
 * call shapes:
 *
 *   - `usePreviewSnapshot(boardId)` returns the full quartet — a
 *     synchronously-written `previewNode` gate, an accessor over the cache,
 *     `showPreview(nodeId)` (set-then-warm), and `reset()` (clear). The
 *     analysis chart panels (`ScoreLeadPanel`, `MergedDeltaPanel`) own a gate
 *     and consume this whole.
 *
 *   - `warmSnapshotAccessor` is the gate-less sub-unit: warm the cache for a
 *     node fire-and-forget and return a `() => BoardSnapshot | null` accessor
 *     over `getSnapshotSync(nodeId)`. A host whose visible gate is owned
 *     elsewhere (TreeWidget, whose gate lives in the `FloatingThumbnail`
 *     child and is set imperatively via `show()`/`hide()`) reuses only this —
 *     the warm-plus-accessor pair the panels and the tree genuinely share —
 *     without relocating its gate.
 *
 * Note on `boardId`: the accessor keys the cache read on the *target node*
 * captured at `showPreview` time. A board-keyed surface whose displayed node
 * is the board's *live* current node (the `SidebarWidget` docked rail
 * preview) is a different data shape (gate = `BoardId`, snapshot derived via
 * `board.currentNodeId`) and is not served by this unit — see the migration
 * note in the worklog.
 *
 * The cold-cache first-hover flicker (an empty frame for the window between
 * the synchronous gate write and the warm landing, when `getSnapshotSync`
 * returns null on a miss) is an accepted property of the whole cured family,
 * uniform across surfaces — not a defect this unit introduces.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref } from 'vue';
import { useThumbnailCache } from './useThumbnailCache';
/**
 * The cured preview-snapshot quartet for a host that owns its gate.
 *
 * `boardId` is the board the warmed nodes belong to; it is captured once (the
 * chart panels source a stable `BoardId` from their `AnalysisContext`).
 */
export function usePreviewSnapshot(boardId) {
    const { getSnapshot, getSnapshotSync } = useThumbnailCache();
    // The gate holds the target node, written SYNCHRONOUSLY from the
    // hover/leave continuations — never an awaited snapshot.
    const previewNode = ref(null);
    const getPreview = () => previewNode.value ? getSnapshotSync(previewNode.value) : null;
    function showPreview(nodeId) {
        previewNode.value = nodeId;
        void getSnapshot(nodeId, boardId);
    }
    function reset() {
        previewNode.value = null;
    }
    return { previewNode, getPreview, showPreview, reset };
}
/**
 * The gate-less sub-unit: warm the cache for `nodeId` fire-and-forget and
 * return the synchronous accessor over it. For a host whose visible gate is
 * owned elsewhere (TreeWidget → `FloatingThumbnail`'s `show()`/`hide()`),
 * which reuses only the warm-plus-accessor pair, decorating the returned
 * snapshot itself (e.g. with variation marker labels) in its own closure.
 */
export function warmSnapshotAccessor(nodeId, boardId) {
    const { getSnapshot, getSnapshotSync } = useThumbnailCache();
    // Cache-only write; the visible gate (the child's `visible`/`source`) is
    // set synchronously by the caller, so a late resolve cannot resurrect it.
    void getSnapshot(nodeId, boardId);
    return () => getSnapshotSync(nodeId);
}
