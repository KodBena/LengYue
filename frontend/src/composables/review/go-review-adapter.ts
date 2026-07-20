/**
 * src/composables/review/go-review-adapter.ts
 * The Go concrete implementation of `ReviewDomainAdapter` — the seam
 * ADR-0003 already asked for `useReviewSession` to have, built here
 * (DI investigation §2.1). Every method body below is lifted
 * verbatim from `useReviewSession.ts`'s prior inline calls; this
 * file changes WHERE the Go-specific logic lives, not its behavior.
 * A generic-domain fork supplies a different adapter at the
 * composition point where `useReviewSession` is called instead of
 * editing this file.
 *
 * License: Public Domain (The Unlicense)
 */

// @ts-ignore
import sgf from '@sabaki/sgf';
import type { BoardState, RootToCurrentPath, RawAnalysis } from '../../types';
import { loadSgf } from '../../engine/sgf-loader';
import { getPath, navigateTo as navigatorNavigateTo } from '../../engine/navigator';
import { scorePerMoveDelta as engineScorePerMoveDelta } from '../../engine/analysis/review-scoring';
import type { EnrichmentAccessor } from '../../engine/analysis/review-scoring';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from '../board/use-move-suggestions';
import type { ReviewDomainAdapter } from './review-domain-adapter';

/** The concrete move-input shape `useReviewSession` passes today: a board coordinate. */
export interface GoMoveInput {
  x: number;
  y: number;
}

export const goReviewAdapter: ReviewDomainAdapter<BoardState, GoMoveInput> = {
  loadCardIntoBoard(canonicalContent) {
    const sabakiTrees = sgf.parse(canonicalContent);
    return loadSgf(sabakiTrees);
  },

  applyMove(state, move) {
    return applyGoMove(state, move.x, move.y);
  },

  getPathToNode(state, nodeId): RootToCurrentPath {
    return getPath(state.nodes, nodeId);
  },

  navigateTo(state, nodeId): void {
    navigatorNavigateTo(state, nodeId);
  },

  scorePerMoveDelta(state, path, moveIdx, moveNodeId, getEnrichment: EnrichmentAccessor) {
    return engineScorePerMoveDelta(state.nodes, path, moveIdx, moveNodeId, getEnrichment);
  },

  bestFollowThroughMove(packet: RawAnalysis): GoMoveInput | null {
    const bestMoveInfo = packet.moveInfos?.find(m => m.order === 0);
    if (!bestMoveInfo) return null;
    return gtpToBoard(bestMoveInfo.move);
  },
};
