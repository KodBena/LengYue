/**
 * src/composables/useChartNavigation.ts
 * Pure black-box navigation + thumbnail handler for all analysis charts.
 * Centralises the only remaining business logic that was duplicated across panels.
 * License: Public Domain (The Unlicense)
 */

import { useThumbnailCache } from './useThumbnailCache';
import { colorMoveToPly } from './useTriangularHeatmap';
import { mutateBoard } from '../store';
import { navigateTo } from '../engine/navigator';
import type { Ref } from 'vue';
import type { BoardId, ColorMoveIndex, NodeId } from '../types';

/**
 * Composable for chart-driven board navigation.
 *
 * ─── Branded-type signature discipline ───────────────────────────────────────
 * Both `variationPath` and `boardId` are typed with their branded forms
 * (`Ref<NodeId[]>` and `BoardId`) rather than the loose `string`/`string[]`
 * the previous signature accepted. The previous loose signature was a
 * "signature lie": every actual call site passed branded values, but the
 * compiler accepted strings. The branded signature pushes the cast burden
 * (if any) up to the caller, which knows where the value came from and can
 * justify the cast at its source.
 *
 * In practice no caller needs new casts — they were all passing branded
 * values already; only the signature was loose.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function useChartNavigation(variationPath: Ref<NodeId[]>, boardId: BoardId) {
  const { getThumbnailSvg } = useThumbnailCache();

  // ── Main chart (turn-indexed) ─────────────────────────────────────────────
  function handleMainClick(turnIdx: number) {
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
  }

  async function handleMainHover(turnIdx: number, previewRef: { value: string }) {
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      previewRef.value = await getThumbnailSvg(nodeId, boardId, false);
    }
  }

  // ── Player panels (move-indexed) ──────────────────────────────────────────
  // moveIdx is branded ColorMoveIndex; the brand pair forces callers to
  // commit to the colour-local interpretation rather than passing a bare
  // number that could be a PlyIndex by mistake.
  //
  // Asymmetry note: click navigates to the position BEFORE the move (so
  // the user sees the situation the player faced), hover previews the
  // position AFTER (the result of the move). Click is `colorMoveToPly`
  // minus one; hover is `colorMoveToPly` directly. The two routes share
  // the cmi → ply conversion but diverge by one ply for UX reasons.
  function handlePlayerClick(playerColor: 'B' | 'W', moveIdx: ColorMoveIndex) {
    const turnIdx = colorMoveToPly(moveIdx, playerColor) - 1;
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
  }

  async function handlePlayerHover(
    playerColor: 'B' | 'W',
    moveIdx: ColorMoveIndex,
    previewRef: { value: string }
  ) {
    const nodeIdx = colorMoveToPly(moveIdx, playerColor);
    const nodeId = variationPath.value[nodeIdx];
    if (nodeId) {
      previewRef.value = await getThumbnailSvg(nodeId, boardId, true);
    }
  }

  return {
    handleMainClick,
    handleMainHover,
    handlePlayerClick,
    handlePlayerHover,
  } as const;
}
