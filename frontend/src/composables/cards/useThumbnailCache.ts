/**
 * src/composables/cards/useThumbnailCache.ts
 * Fill/projection API over the shared board-thumbnail snapshot cache.
 *
 * The cache itself — together with the rest of the shared thumbnail
 * render resources and their invalidation surface (board close /
 * identity flip / the caller-less node-content hook) — is owned by the
 * sibling module `thumbnail-render-resources.ts`; this composable owns
 * the derivations over it: the replay that fills it (`getSnapshot` /
 * `warmPath`), the synchronous read (`getSnapshotSync`), and the
 * variation A/B/C label derivation (`variationMarkerLabels`, for the
 * floating variation preview).
 *
 * The SVG-string projection (`getThumbnailSvg` / its private
 * `snapshotToSvg`) was retired with item
 * `preview-snapshot-shared-composable`: it lost its last production
 * consumer when PR #424 removed the async-write hover handlers
 * (`useChartNavigation.handleMainHover` / `handlePlayerHover`), and every
 * remaining thumbnail surface renders the reactive `BoardSnapshot` via
 * `MiniBoard` rather than a `v-html` SVG string.
 *
 * Keying is on nodeId alone (not `${nodeId}:${showMarker}`) — showMarker
 * is a render option, not data: the snapshot carries `lastMove`, and
 * whether to draw the ring is the projection's choice.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardSnapshot } from '../../engine/board-geometry';
import { navigateTo } from '../../engine/navigator';
import type { BoardState, BoardId, NodeId } from '../../types';
import { getBoardSize } from '../../engine/util';
import { store } from '../../store';
import {
  cacheSnapshot,
  getCachedSnapshot,
  isPathWarm,
  markPathWarm,
} from './thumbnail-render-resources';

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

// ── Public black-box contract ──────────────────────────────────────────────
/**
 * ─── Branded-type signature discipline ───────────────────────────────────────
 * The previous public API took `nodeId: string` and `boardId: string`
 * everywhere, which was a signature lie — every actual caller passes
 * branded values. The branded API matches the actual contract; callers
 * see compile-time errors if they pass plain strings (which they shouldn't
 * be doing in the first place).
 *
 * Internal Record indexing on `tempState.nodes[nodeId]` is type-safe
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
    const cached = getCachedSnapshot(nodeId);
    if (cached) return cached;
    const snap = await generateSnapshot(nodeId, boardId);
    if (snap) cacheSnapshot(nodeId, snap);
    return snap;
  }

  /** Synchronous cache read; null on miss (caller decides whether to warm). */
  function getSnapshotSync(nodeId: NodeId): BoardSnapshot | null {
    return getCachedSnapshot(nodeId);
  }

  /** Warm every node on a path (the low-hanging perf win: an identical
   *  re-warm short-circuits on the owner module's warmed-path guard). */
  async function warmPath(nodeIds: NodeId[], boardId: BoardId): Promise<void> {
    if (isPathWarm(nodeIds)) return;
    markPathWarm(nodeIds);
    await Promise.all(
      nodeIds.map(id => getSnapshot(id, boardId))
    );
  }

  /**
   * Variation A/B/C labels for a node: one letter per child, placed at
   * each child's next-move point. Child moves are tree-structural, so the
   * labels read off the live board's nodes synchronously — no replay, no
   * cache involvement. The floating variation preview composes these onto
   * the node's cached snapshot (`{ ...snap, markerLabels }`); both
   * MiniBoard renderers draw `markerLabels` natively.
   */
  function variationMarkerLabels(nodeId: NodeId, boardId: BoardId): Record<string, string> {
    const rootBoard = store.boards.find(b => b.id === boardId);
    // Board gone mid-hover (closed under the pointer): no labels is the
    // honest empty result, mirroring the prior projection's '' return.
    if (!rootBoard) return {};
    const node = rootBoard.nodes[nodeId];
    const markerLabels: Record<string, string> = {};
    node.children.forEach((childId: NodeId, i: number) => {
      const child = rootBoard.nodes[childId];
      if (child.move && child.move.type === 'place') {
        markerLabels[`${child.move.x},${child.move.y}`] = String.fromCharCode(65 + i); // A, B, C...
      }
    });
    return markerLabels;
  }

  return {
    getSnapshot,
    getSnapshotSync,
    variationMarkerLabels,
    warmPath,
  } as const;
}
