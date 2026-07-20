/**
 * src/composables/review/review-domain-adapter.ts
 * Port (ADR-0012 P2 seam): the domain-specific behavior
 * `useReviewSession`'s orchestration drives, extracted so the state
 * machine, abort/teardown/timeout machinery, i18n messages, and
 * queue/currentCard projections stay domain-agnostic. Every method
 * below replaces one of the Go-specific calls `useReviewSession`
 * used to inline directly (DI investigation
 * `docs/notes/design/di-refactor-entanglement-investigation-2026-07-20.md`
 * §2.1 / §2.5).
 *
 * `TBoardState`/`TMoveInput` are left as bare type parameters here
 * (the port shape §2.1 sketched), but this step does NOT generalize
 * `useReviewSession` itself over them — it is instantiated concretely
 * as `ReviewDomainAdapter<BoardState, GoMoveInput>` today via
 * `goReviewAdapter` (go-review-adapter.ts). Making the composable
 * generic over the domain is deferred to a later step (§2.1's own
 * caveat: DI supplies the injection point, not the type
 * generalization — both are needed together, but not in one step).
 *
 * License: Public Domain (The Unlicense)
 */

import type { NodeId, RootToCurrentPath, RawAnalysis } from '../../types';
import type { EnrichmentAccessor, PerMoveDeltaResult } from '../../engine/analysis/review-scoring';

export interface ReviewDomainAdapter<TBoardState, TMoveInput> {
  /** `sgf.parse` + `loadSgf` today — parses a card's canonical SGF content into a fresh board state. */
  loadCardIntoBoard(canonicalContent: string): TBoardState;

  /** `applyGoMove` today — applies one move to `state`, returning the next state or `null` on an illegal move. */
  applyMove(state: TBoardState, move: TMoveInput): TBoardState | null;

  /** `getPath` (`engine/navigator.ts`) today — root→`nodeId` lineage. */
  getPathToNode(state: TBoardState, nodeId: NodeId): RootToCurrentPath;

  /** `navigateTo` (`engine/navigator.ts`) today — LCA-diff replay to `nodeId`, in place on `state`. */
  navigateTo(state: TBoardState, nodeId: NodeId): void;

  /** `scorePerMoveDelta` (`engine/analysis/review-scoring.ts`) today — per-move grading against the enrichment store. */
  scorePerMoveDelta(
    state: TBoardState,
    path: RootToCurrentPath,
    moveIdx: number,
    moveNodeId: NodeId,
    getEnrichment: EnrichmentAccessor,
  ): PerMoveDeltaResult;

  /** `gtpToBoard` + the `moveInfos.find(order === 0)` read today — the engine's best-move follow-through, if any. */
  bestFollowThroughMove(packet: RawAnalysis): TMoveInput | null;
}
