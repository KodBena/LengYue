/**
 * src/composables/analysis/useChartNavigation.ts
 * Pure black-box click-navigation for all analysis charts.
 * Centralises the only remaining business logic that was duplicated across panels.
 *
 * Scope note: the chart panels own their hover-preview wiring locally (a
 * synchronous index→nodeId lookup + a fire-and-forget cache warm + an
 * accessor over `getSnapshotSync`, the #365 / PR #413 cured shape). The
 * old `handleMainHover` / `handlePlayerHover` here wrote an awaited
 * `getThumbnailSvg` result into a caller-supplied preview ref; they were
 * the last instance of the async-write-into-a-preview-ref shape and had
 * zero live consumers once the panels migrated, so they were removed
 * (item `chart-panel-preview-migration`).
 *
 * License: Public Domain (The Unlicense)
 */

import { colorMoveToPly } from './useTriangularHeatmap';
import { mutateBoard } from '../../store';
import { navigateTo } from '../../engine/navigator';
import type { Ref } from 'vue';
import type { BoardId, ColorMoveIndex, RootToLeafPath } from '../../types';

/**
 * Composable for chart-driven board navigation.
 *
 * ─── Branded-type signature discipline ───────────────────────────────────────
 * Both `variationPath` and `boardId` are typed with their branded forms
 * (`Ref<RootToLeafPath>` and `BoardId`) rather than the loose
 * `string`/`string[]` the original signature accepted. The loose signature
 * was a "signature lie": every actual call site passed branded values, but
 * the compiler accepted strings. The branded signature pushes the cast
 * burden (if any) up to the caller, which knows where the value came from
 * and can justify the cast at its source. The path-shape brand
 * (branded-path-types arc, history-lessons audit §3.4) additionally
 * records that chart x-axes index the WHOLE active line — root→leaf —
 * not the root→cursor prefix.
 *
 * In practice no caller needs new casts — they were all passing branded
 * values already; only the signature was loose.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function useChartNavigation(variationPath: Ref<RootToLeafPath>, boardId: BoardId) {
  // ── Main chart (turn-indexed) ─────────────────────────────────────────────
  function handleMainClick(turnIdx: number) {
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
  }

  // ── Player panels (move-indexed) ──────────────────────────────────────────
  // moveIdx is branded ColorMoveIndex; the brand pair forces callers to
  // commit to the colour-local interpretation rather than passing a bare
  // number that could be a PlyIndex by mistake.
  //
  // Click navigates to the position BEFORE the move (so the user sees the
  // situation the player faced), hence `colorMoveToPly` minus one. The
  // symmetric AFTER-the-move preview the panels show on hover is derived
  // panel-side (the cured hover shape; see the module header), not here.
  function handlePlayerClick(playerColor: 'B' | 'W', moveIdx: ColorMoveIndex) {
    const turnIdx = colorMoveToPly(moveIdx, playerColor) - 1;
    const nodeId = variationPath.value[turnIdx];
    if (nodeId) {
      mutateBoard(boardId, draft => navigateTo(draft, nodeId));
    }
  }

  return {
    handleMainClick,
    handlePlayerClick,
  } as const;
}
