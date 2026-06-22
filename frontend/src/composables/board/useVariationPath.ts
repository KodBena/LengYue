/**
 * src/composables/board/useVariationPath.ts
 * Reactively tracks the full active game line: root → active leaf.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef } from 'vue';
import { boardsById } from '../../store';
import { getActiveVariationPath } from '../../engine/util';
import type { BoardId, BoardState, NodeId, RootToLeafPath } from '../../types';

// Branded-type signature: `getActiveVariationPath` returns `RootToLeafPath`
// (a branded `NodeId[]` — every element is a key in `board.nodes` by
// construction, and the path-shape brand records this is the WHOLE active
// line, not root→cursor). Exposing `ComputedRef<RootToLeafPath>` propagates
// the brand through the consumer graph (`useAnalysisProjection`, `BoardTab`,
// `useEnrichedData`, …) so per-site `as NodeId` casts retire.

/**
 * Core: walk a board's active line root→leaf, fingerprint-memoed (returns a
 * stable array ref while the path *content* is unchanged). Depends ONLY on the
 * board the getter returns — NOT on the all-boards index — so a consumer that
 * already holds its board object (BoardTab via `props.state`) does not re-walk
 * when an UNRELATED board changes.
 *
 * This is load-bearing at scale. Routing the N per-tab path computeds through
 * `boardsById` (the id wrapper below) made every one of them invalidate on
 * every board-set change — INCLUDING any close — so a single close re-walked
 * all N paths: O(N²) of reactive node reads over the run, which a CPU profile
 * (2026-06-22) measured as ≈ half the `close-at-scale` close phase
 * (`getActiveVariationPath` self-time plus the reactive `get` trap it drives).
 * Sourcing from the held board object cuts a sibling-close's path re-walk to
 * zero.
 */
export function useVariationPathFor(getBoard: () => BoardState | null): ComputedRef<RootToLeafPath> {
  let prevFingerprint = '';
  // Brand mint, justified: the empty path (no board) is vacuously a root→leaf
  // line; it is also the memo's initial slot, only replaced by producer-minted
  // paths below.
  let prevPath: RootToLeafPath = [] as NodeId[] as RootToLeafPath;
  return computed(() => {
    const board = getBoard();
    // Brand mint, justified: vacuously root→leaf (no board, no line).
    if (!board) return [] as NodeId[] as RootToLeafPath;
    const path = getActiveVariationPath(board);
    const fingerprint = path.join(',');
    if (fingerprint === prevFingerprint) return prevPath;
    prevFingerprint = fingerprint;
    prevPath = path;
    return path;
  });
}

/**
 * Id-resolving wrapper: O(1) board lookup via the derived `boardsById` index,
 * then the core walk. For SINGLE-instance consumers (the active-board chart /
 * projection composables) the `boardsById` dependency is correct — they
 * invalidate O(1) per board-set change. The MANY-instance consumer (BoardTab,
 * one per open board) must NOT use this wrapper — it reintroduces the O(N²) the
 * core's docstring describes; BoardTab calls `useVariationPathFor(() =>
 * props.state)` against the board object it already holds.
 */
export function useVariationPath(getBoardId: () => BoardId): ComputedRef<RootToLeafPath> {
  return useVariationPathFor(() => boardsById.value[getBoardId()] ?? null);
}
