/**
 * src/composables/cards/useThumbnailCache.ts
 * Shared board-position cache as a Vue composable.
 *
 * The cache stores the replayed `BoardSnapshot` per node — the expensive
 * part. Two projections derive from it: the SVG string (`getThumbnailSvg` /
 * `getVariationThumbnail`, for the `v-html` thumbnail sinks — FloatingThumbnail,
 * LibraryPreviewPane, card thumbnails) and the snapshot itself (`getSnapshot` /
 * `getSnapshotSync`, read directly by the reactive MiniBoard component
 * consumers). Keying on nodeId alone (not `${nodeId}:${showMarker}`) —
 * showMarker is a render option, not data.
 *
 * The cache Map lives at module level so every call to
 * `useThumbnailCache()` returns functions that close over the
 * *same* cache instance. This makes the cache truly global
 * (singleton) while keeping the per-component API black-box.
 *
 * Cache lifetime is identity-scoped, with per-board purge on
 * board close. Entries are added by `getSnapshot` / `warmPath`
 * (keyed by `nodeId`) and dropped by:
 *
 *   - `purgeBoardThumbnails(boardId)` — invoked from `closeBoard`
 *     when a board exits the workspace (audit pair O4). Without
 *     it, the cache would accumulate snapshots for every
 *     closed board's nodes across the session.
 *   - `purgeAllThumbnails()` — invoked from `resetWorkspace` on
 *     identity flip (audit pair O9). Same memory-hygiene framing.
 *
 * NodeIds are UUID-style and don't collide across boards or
 * users, so both cleanups are memory hygiene rather than the
 * privacy concern that motivates the useCardThumbnail clear
 * (audit pair O10).
 *
 * Low-hanging performance win: lastWarmedPath guard prevents
 * re-warming identical paths.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { renderBoardToSvg } from '../../engine/board-renderer';
import type { BoardSnapshot } from '../../engine/board-geometry';
import { navigateTo } from '../../engine/navigator';
import type { BoardState, BoardId, NodeId } from '../../types';
import { getBoardSize } from '../../engine/util';
import { store } from '../../store';

// ── Module-level shared state (singleton cache) ────────────────────────────
// The cache stores the replayed BoardSnapshot — the expensive part — keyed by
// nodeId alone. The rendered SVG string is a cheap projection derived on
// demand (renderBoardToSvg), and the component consumers read the snapshot
// directly. showMarker is a render option, not data, so it no longer keys the
// cache (the snapshot carries `lastMove`; whether to draw the ring is the
// projection's choice).
const snapshotCache: Ref<Map<NodeId, BoardSnapshot>> = ref(new Map<NodeId, BoardSnapshot>());
const lastWarmedPath = ref<NodeId[]>([]);

// ── Private pure helper ────────────────────────────────────────────────────
// Replay the board to `nodeId` and capture the position as a BoardSnapshot.
// This is the single replay path every thumbnail surface shares.
async function generateSnapshot(
  nodeId: NodeId,
  boardId: BoardId,
): Promise<BoardSnapshot | null> {
  const rootBoard = store.boards.find(b => b.id === boardId);
  if (!rootBoard) return null;

  const tempState: BoardState = {
    ...rootBoard,
    stones: { ...rootBoard.stones },
    captures: { ...rootBoard.captures },
    nodes: Object.fromEntries(
      Object.entries(rootBoard.nodes).map(([id, node]) => [id, { ...node }])
    ),
  };
  navigateTo(tempState, nodeId);

  return {
    size: getBoardSize(tempState),
    stones: tempState.stones,
    lastMove: tempState.nodes[nodeId]?.move ?? null,
  };
}

// Cheap string projection of a snapshot for the v-html / ECharts-innerHTML
// consumers. uid scheme preserved so the output is identical to the prior
// string cache (gradient ids are uid-scoped, internal).
function snapshotToSvg(snap: BoardSnapshot, nodeId: NodeId, showMarker: boolean): string {
  return renderBoardToSvg({
    size: snap.size,
    stones: snap.stones,
    lastMove: snap.lastMove,
    showMarker,
    uid: `${nodeId.replace(/[^a-zA-Z0-9]/g, '')}${showMarker ? 'm' : 's'}`,
  });
}

/**
 * Drop every cached thumbnail for the given board's nodes. Called
 * from `closeBoard` when the board exits the workspace, so the
 * shared cache doesn't accumulate dead entries across the session.
 *
 * Walks the closing board's `nodes` keys (still readable here
 * because closeBoard runs this before splicing the board out of
 * `store.boards`) and deletes both the showMarker=true and
 * showMarker=false cache entries for each. NodeIds that aren't in
 * the cache are silently skipped — `Map.delete` on a missing key
 * is a no-op.
 *
 * Resource-ownership audit pair O4. See file header for the
 * identity-flip companion (purgeAllThumbnails / O9).
 */
export function purgeBoardThumbnails(boardId: BoardId): void {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) return;
  for (const nodeId of Object.keys(board.nodes) as NodeId[]) {
    snapshotCache.value.delete(nodeId);
  }
}

/**
 * Drop every cached thumbnail. Called from `resetWorkspace` on
 * identity flip so the prior identity's renders don't accumulate
 * in the singleton across the session boundary. Also clears
 * `lastWarmedPath` so the next identity's first warmPath call
 * actually warms (rather than short-circuiting on a stale
 * fingerprint match).
 *
 * Resource-ownership audit pair O9. NodeIds are UUID-style and
 * don't collide across users — this is memory hygiene, not a
 * privacy concern (cf. clearCardThumbnailCache / O10 where the
 * raw-CardId collision motivates the cleanup).
 */
export function purgeAllThumbnails(): void {
  snapshotCache.value.clear();
  lastWarmedPath.value = [];
}

// ── Public black-box contract ──────────────────────────────────────────────
/**
 * ─── Branded-type signature discipline ───────────────────────────────────────
 * The previous public API took `nodeId: string` and `boardId: string`
 * everywhere, which was a signature lie — every actual caller passes
 * branded values. The branded API matches the actual contract; callers
 * see compile-time errors if they pass plain strings (which they shouldn't
 * be doing in the first place).
 *
 * Internal Record indexing on `tempState.nodes[nodeId]` is now type-safe
 * because `nodeId: NodeId` matches the record's key type.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function useThumbnailCache() {
  /**
   * The position primitive (cache-or-replay). Component consumers
   * (MiniBoard via ChartPreviewBox / the heatmap preview window) read this
   * directly and render reactively — no SVG string, no v-html.
   */
  async function getSnapshot(nodeId: NodeId, boardId: BoardId): Promise<BoardSnapshot | null> {
    const cached = snapshotCache.value.get(nodeId);
    if (cached) return cached;
    const snap = await generateSnapshot(nodeId, boardId);
    if (snap) snapshotCache.value.set(nodeId, snap);
    return snap;
  }

  /** Synchronous cache read; null on miss (caller decides whether to warm). */
  function getSnapshotSync(nodeId: NodeId): BoardSnapshot | null {
    return snapshotCache.value.get(nodeId) ?? null;
  }

  async function getThumbnailSvg(
    nodeId: NodeId,
    boardId: BoardId,
    showMarker: boolean
  ): Promise<string> {
    const snap = await getSnapshot(nodeId, boardId);
    return snap ? snapshotToSvg(snap, nodeId, showMarker) : '';
  }

  async function warmPath(nodeIds: NodeId[], boardId: BoardId): Promise<void> {
    if (nodeIds.length === lastWarmedPath.value.length &&
        nodeIds.every((id, i) => id === lastWarmedPath.value[i])) {
      return;
    }

    lastWarmedPath.value = [...nodeIds];

    await Promise.all(
      nodeIds.map(id => getSnapshot(id, boardId))
    );
  }

  async function getVariationThumbnail(nodeId: NodeId, boardId: BoardId): Promise<string> {
    const snap = await getSnapshot(nodeId, boardId);
    const rootBoard = store.boards.find(b => b.id === boardId);
    if (!snap || !rootBoard) return '';

    // Variation thumbnail = the node's position (the cached snapshot) plus
    // A/B/C labels at each child's next-move point. Child moves are tree-
    // structural, so the labels read off the live board's nodes — no second
    // replay.
    const node = rootBoard.nodes[nodeId];
    const markerLabels: Record<string, string> = {};
    node.children.forEach((childId: NodeId, i: number) => {
      const child = rootBoard.nodes[childId];
      if (child.move && child.move.type === 'place') {
        markerLabels[`${child.move.x},${child.move.y}`] = String.fromCharCode(65 + i); // A, B, C...
      }
    });

    return renderBoardToSvg({
      size: snap.size,
      stones: snap.stones,
      showMarker: false,
      uid: `var-${nodeId}`,
      markerLabels,
    });
  }

  return {
    getSnapshot,
    getSnapshotSync,
    getThumbnailSvg,
    getVariationThumbnail,
    warmPath,
  } as const;
}
