/**
 * src/composables/useChartNavigation.ts
 * Pure black-box navigation + thumbnail handler for all analysis charts.
 * Centralises the only remaining business logic that was duplicated across panels.
 * License: Public Domain (The Unlicense)
 */

import { useThumbnailCache } from './useThumbnailCache';
import { mutateBoard } from '../store';
import { navigateTo } from '../engine/navigator';
import type { Ref } from 'vue';
import type { BoardId, NodeId } from '../types';

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
  function handlePlayerClick(playerColor: 'B' | 'W', moveIdx: number) {
    const offset = playerColor === 'B' ? 0 : 1;
    const turnIdx = moveIdx * 2 + offset;
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
  }

  async function handlePlayerHover(
    playerColor: 'B' | 'W',
    moveIdx: number,
    previewRef: { value: string }
  ) {
    const offset = playerColor === 'B' ? 0 : 1;
    const nodeIdx = moveIdx * 2 + offset + 1; // position AFTER the move
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
