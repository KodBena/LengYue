/**
 * src/composables/useThumbnailCache.ts
 * Pure, shared thumbnail cache as a Vue composable.
 * 
 * The cache Map lives at module level so every call to useThumbnailCache()
 * returns functions that close over the *same* cache instance.
 * This makes the cache truly global while keeping the API black-box and pure.
 * 
 * Low-hanging performance win: lastWarmedPath guard prevents re-warming identical paths.
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { renderBoardToSvg } from '../engine/board-renderer';
import { navigateTo } from '../engine/navigator';
import type { BoardState, BoardId, NodeId } from '../types';
import { getBoardSize } from '../engine/util';
import { store } from '../store';

// ── Module-level shared state (singleton cache) ────────────────────────────
const cache: Ref<Map<string, string>> = ref(new Map<string, string>());
const lastWarmedPath = ref<NodeId[]>([]);

// ── Private pure helper ────────────────────────────────────────────────────
async function generateThumbnail(
  nodeId: NodeId,
  boardId: BoardId,
  showMarker: boolean
): Promise<string> {
  const rootBoard = store.boards.find(b => b.id === boardId);
  if (!rootBoard) return '';

  const tempState: BoardState = {
    ...rootBoard,
    stones: { ...rootBoard.stones },
    captures: { ...rootBoard.captures },
    nodes: Object.fromEntries(
      Object.entries(rootBoard.nodes).map(([id, node]) => [id, { ...node }])
    ),
  };
  navigateTo(tempState, nodeId);

  const size = getBoardSize(tempState);
  return renderBoardToSvg({
    size,
    stones: tempState.stones,
    lastMove: tempState.nodes[nodeId]?.move,
    showMarker,
    uid: `${nodeId.replace(/[^a-zA-Z0-9]/g, '')}${showMarker ? 'm' : 's'}`,
  });
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
  async function getThumbnailSvg(
    nodeId: NodeId,
    boardId: BoardId,
    showMarker: boolean
  ): Promise<string> {
    const key = `${nodeId}:${showMarker}`;
    if (cache.value.has(key)) return cache.value.get(key)!;

    const svg = await generateThumbnail(nodeId, boardId, showMarker);
    cache.value.set(key, svg);
    return svg;
  }

  function getSync(nodeId: NodeId, showMarker: boolean): string {
    const key = `${nodeId}:${showMarker}`;
    return cache.value.get(key) ?? '';
  }

  async function warmPath(nodeIds: NodeId[], boardId: BoardId): Promise<void> {
    if (nodeIds.length === lastWarmedPath.value.length &&
        nodeIds.every((id, i) => id === lastWarmedPath.value[i])) {
      return;
    }

    lastWarmedPath.value = [...nodeIds];

    await Promise.all(
      nodeIds.map(id => getThumbnailSvg(id, boardId, false))
    );
  }

  async function getVariationThumbnail(nodeId: NodeId, boardId: BoardId): Promise<string> {
    const rootBoard = store.boards.find(b => b.id === boardId);
    if (!rootBoard) return '';

    const tempState: BoardState = { ...rootBoard, stones: { ...rootBoard.stones }, captures: { ...rootBoard.captures }, nodes: { ...rootBoard.nodes } };
    navigateTo(tempState, nodeId);
    
    const size = getBoardSize(tempState);
    const node = tempState.nodes[nodeId];
    const markerLabels: Record<string, string> = {};

    // Implicit-any fix: forEach's callback parameters are now typed.
    // `childId` is `NodeId` (children is NodeId[]) and `i` is `number`.
    node.children.forEach((childId: NodeId, i: number) => {
      const child = tempState.nodes[childId];
      if (child.move && child.move.type === 'place') {
        const key = `${child.move.x},${child.move.y}`;
        markerLabels[key] = String.fromCharCode(65 + i); // A, B, C...
      }
    });

    return renderBoardToSvg({
      size,
      stones: tempState.stones,
      showMarker: false,
      uid: `var-${nodeId}`,
      markerLabels
    });
  }
  return {
    getThumbnailSvg,
    getVariationThumbnail,
    getSync,
    warmPath,
  } as const;
}
