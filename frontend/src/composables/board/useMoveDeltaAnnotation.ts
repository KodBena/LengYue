/**
 * src/composables/board/useMoveDeltaAnnotation.ts
 *
 * Board-overlay data for wiki Wanted #7 / #7.1: when the cursor sits on a
 * node whose delta (vs its parent) exists in the analysis ledger, surface
 * the just-played move's point, its delta, and the child's visit count —
 * or `null` (absence, never a zero placeholder) when the ledger doesn't
 * hold both evaluations yet.
 *
 * ── Reuse, not reinvention ──────────────────────────────────────────────
 * The delta VALUE is read from `useEnrichedData`'s materialised
 * `deltaSeries.{black,white}` — the exact derivation `MergedDeltaPanel.vue`
 * and `useMistakeFinder` already chart/threshold against (last-path-order
 * arbitration over the proxy's `extra.{color}.deltas`, per
 * `enriched-accumulator.ts`'s header). This composable does not compute a
 * delta itself; it locates the current node's entry in that same series via
 * `plyToColorMove` (`useTriangularHeatmap.ts`'s named inverse of
 * `colorMoveToPly`) and reads it. `perPlayer` mode reuses the identical
 * value — the "per-player score delta" #7.1 asks for is the same
 * palette-defined delta, framed with the mover's colour; there is no
 * second formula.
 *
 * ── Read-locality (ADR-0010) ─────────────────────────────────────────────
 * This composable subscribes to per-packet ledger state (via
 * `useEnrichedData`). It exists to be called from a display LEAF
 * (`BoardDeltaAnnotation.vue`), not from `BoardWidget` (a composition
 * node) — the leaf receives only `state: BoardState` + a `currentNodeId`
 * accessor (both nav-rate, not packet-rate) as props and instantiates this
 * composable itself, so the per-packet re-render is confined to the leaf.
 *
 * `getBoard` is taken as an accessor over an already-held `BoardState`
 * (not a `BoardId` resolved via the `boardsById` index) for the same
 * reason `BoardTab.vue` calls `useVariationPathFor(() => props.state)`
 * rather than `useVariationPath(() => boardId)`: this composable is
 * instantiated once per open board (a many-instance consumer), and the
 * id-resolving wrapper's `boardsById` dependency invalidates every
 * instance on any unrelated board-set change — the O(N²) trap
 * `useVariationPath.ts`'s docstring documents. `useAnalysisProjection`
 * (single-instance, only the active board's Analysis tab) is the
 * consumer for which that wrapper is correct.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type ComputedRef } from 'vue';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { useVariationPathFor } from './useVariationPath';
import { useEnrichedData } from '../analysis/useEnrichedData';
import { plyToColorMove } from '../analysis/useTriangularHeatmap';
import type { BoardState, NodeId, PlyIndex, Point, StoneColor } from '../../types';

export interface MoveDeltaAnnotation {
  readonly point: Point;
  readonly color: StoneColor;
  readonly delta: number;
  readonly visits: number;
}

/**
 * @param getBoard         Accessor over the already-held `BoardState` (see
 *                          the many-instance note above).
 * @param getCurrentNodeId Accessor (not a `Ref`) so the leaf establishes the
 *                          subscription inside its own tracking scope — see
 *                          the read-locality note above.
 */
export function useMoveDeltaAnnotation(
  getBoard: () => BoardState | null,
  getCurrentNodeId: () => NodeId,
): ComputedRef<MoveDeltaAnnotation | null> {
  const variationPath = useVariationPathFor(getBoard);
  const enriched = useEnrichedData(variationPath);

  return computed<MoveDeltaAnnotation | null>(() => {
    const board = getBoard();
    if (!board) return null;

    const nodeId = getCurrentNodeId();
    const node = board.nodes[nodeId];
    // Root / pass nodes played no stone — nothing to annotate.
    if (!node?.move || node.move.type !== 'place') return null;

    const plyIdx = variationPath.value.indexOf(nodeId);
    if (plyIdx === -1) return null; // current node off the active line (transient mid-navigation)

    const color = node.move.color;
    const colorLocalIdx = plyToColorMove(plyIdx as PlyIndex, color); // brand mint: node's own position on the active line

    const series = color === 'B' ? enriched.value.deltaSeries.black : enriched.value.deltaSeries.white;
    // brand erase ColorMoveIndex → number: `s.data`'s key `k` is a raw
    // numeric colour-local index (see useAnalysisContext.ts's "Mapping
    // anchor" doc on EnrichedSeries.data), so the branded colorLocalIdx
    // must be erased to compare against it — the same erasure
    // valuesFromSeriesInRange's sibling reads perform.
    const entry = series[0]?.data.find(([k]) => k === (colorLocalIdx as number));
    const delta = entry?.[1];
    // Absence contract: no delta in the ledger yet (parent and/or child not
    // both evaluated) renders nothing — never a zero placeholder (ADR-0002:
    // a substituted default here would be indistinguishable from a real
    // zero-delta move).
    if (delta === null || delta === undefined) return null;

    const rawKey = activeAnalysisKeys.value.rawKey;
    const visits = rawKey ? ledger.getRaw(rawKey, nodeId)?.rootInfo?.visits : undefined;
    if (visits === null || visits === undefined) return null;

    return { point: { x: node.move.x, y: node.move.y }, color, delta, visits };
  });
}
