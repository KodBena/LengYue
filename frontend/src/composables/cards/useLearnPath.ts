/**
 * src/composables/cards/useLearnPath.ts
 *
 * "Learn this path" (wiki Wanted feature #8): auto-seed a card tree
 * beneath an already-minted anchor card by following the engine's
 * top-K ranked candidate moves to a given depth, for BOTH sides to
 * move. Pedagogical rationale (verbatim from the wiki item): the
 * perfect/best-move-only line is easy to memorise; what's hard is
 * handling deviations from either side, so seeding choices {1..K} at
 * every ply — not just the top choice — is the point.
 *
 * ── Ratified v1 constraints (ledger assumption row 660) ──────────────
 *
 *   1. "Second and third choice" comes from EXISTING analysis already
 *      in the analysis ledger. v1 does NOT drive new engine queries.
 *      A position on the walk that lacks recorded analysis is a
 *      FRONTIER: that branch stops there and the stop is reported —
 *      never silently truncated (ADR-0002). Other branches continue.
 *   2. The context tag is user-supplied, applied to every seeded card
 *      via the existing card-create wire's `tags` field (the same
 *      substrate `MintCardModal` uses) — no tag-DSL changes.
 *   3. Seeded cards mint through the EXISTING mint path
 *      (`useMinting().commitMint`, `backendService.createCard`).
 *
 * ── Ranking metric (commissioner clarification) ───────────────────────
 * "Should rank according to current palette and so on." Investigation
 * finding (see the DESIGN section of the dispatch report — this is a
 * genuine finding, not a convenience reading): `RawAnalysis.moveInfos`
 * — the ONLY per-sibling-candidate ranking the ledger holds — is keyed
 * by `RawKey`, which is palette-INDEPENDENT by construction
 * (`state/analysis-config.ts::deriveAnalysisKeys`; the ledger's raw/
 * enrichment split exists precisely so a palette swap does not re-key
 * raw data). The palette's `state_fns`/`deltas` enrichment is a
 * per-PLAYED-move, per-turn scalar (`KataExtra.state`,
 * `KataPlayerExtra.deltas`) — there is no per-sibling-candidate
 * palette-derived score anywhere in the ledger to sort by. Re-deriving
 * one client-side (evaluating `delta_fn`/`summary_fn` in JS against
 * every candidate) would duplicate the proxy's Python execution
 * semantics and is out of v1 scope per constraint 1 (no new
 * engine/enrichment work, existing ledger data only).
 *
 * v1's reading: "current palette" governs *which analysis identity* is
 * live — `activeAnalysisKeys.value.rawKey`, derived from the same
 * model/override/palette selection the user is currently looking at —
 * and within that bucket, ranking uses KataGo's own `order` field
 * (0 = engine's best move, 1 = second choice, 2 = third choice, …),
 * the only per-candidate ranking signal the raw store carries. This is
 * flagged as the single most load-bearing open design call in the
 * dispatch report for commissioner veto.
 *
 * ── Choice-1 inclusion ─────────────────────────────────────────────────
 * Ranks 1..K (KataGo `order` 0..K-1) are expanded at every node,
 * INCLUDING the top choice. The wiki text's "deviations from BOTH
 * sides" reads naturally as "seed the candidate set a player actually
 * has to recognise," which includes the main line, not just the
 * runners-up — K=3 (the UI default) then literally covers "the first,
 * second, and third choice."
 *
 * ── Precondition (documented v1 scope restriction) ────────────────────
 * The walk needs a `CardId` to parent the depth-1 seeded cards under.
 * The only client-side NodeId → CardId linkage that exists is
 * `BoardState.sourceCardId`, set on the board's ROOT node by the
 * card-load paths (`useDirtyBoardGuard`, `useReviewSession.loadCard`).
 * There is no mapping from an arbitrary mid-tree NodeId to a CardId.
 * v1 therefore requires the chosen node to be the board's root — i.e.
 * the affordance is invoked right after loading/reviewing the anchor
 * card, cursor at its own position — and fails loudly
 * (`LearnPathPreconditionError`) otherwise. Extending the mapping (so
 * "Learn this path" works from any mid-tree node with a known card) is
 * named as future work in the dispatch report, not built here.
 *
 * ── Existing-card dedup ────────────────────────────────────────────────
 * `insert_card` (backend/services/card_service.py) does NOT dedup at
 * the card level — only `get_or_create_position` dedups the
 * `normalized_position` row; two mints at the same position produce
 * two distinct `card` rows. So "a position already existing as a card
 * is skipped-with-notice" (constraint 3) is NOT automatic; v1
 * implements it here by fetching the anchor's already-minted
 * descendant subtree (`resolveRoots` + `fetchTreeByRoot`) and
 * comparing each candidate's `serializeActivePath` output against
 * existing descendants' `canonicalContent` by exact string equality.
 * This is sound within one lineage tree: every card's canonicalContent
 * is root→its-own-position (`serializeActivePath`'s documented shape),
 * so identical move sequences from the same root produce byte-
 * identical SGF — UNLESS a compared sibling was minted with a
 * different mint-time komi calibration (`calibrateKomiOnDraft`
 * rewrites `KM`), which would make the same position's SGF differ.
 * Documented limitation, not engineered around in v1.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — speaks NodeId /
 * BoardState / CardId / the ledger.
 *
 * License: Public Domain (The Unlicense)
 */
import { store } from '../../store';
import { backendService } from '../../services/backend-service';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { serializeActivePath } from '../../engine/sgf-writer';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from '../board/use-move-suggestions';
import { compileMintGradingParameter, useMinting } from '../review/useMinting';
import type {
  BoardId,
  BoardState,
  CardId,
  CardLineageNode,
  CardCreatePayload,
  NodeId,
  StoneColor,
} from '../../types';

export class LearnPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LearnPathError';
  }
}

/** Raised when the chosen node isn't the anchor-card-loaded root (see the precondition note above). */
export class LearnPathPreconditionError extends LearnPathError {
  constructor(message: string) {
    super(message);
    this.name = 'LearnPathPreconditionError';
  }
}

export interface LearnPathParams {
  readonly boardId: BoardId;
  /** Plies to expand beyond the anchor. >= 1. */
  readonly depth: number;
  /** Candidate ranks {1..K} expanded per node (K includes the top choice). >= 1. */
  readonly topK: number;
  /** User-supplied context tag, applied to every seeded card. Non-empty after trim. */
  readonly tag: string;
}

export interface LearnPathMove {
  readonly x: number;
  readonly y: number;
  readonly color: StoneColor;
}

export interface LearnPathSeeded {
  readonly cardId: CardId;
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
  readonly move: LearnPathMove;
}

export interface LearnPathSkippedExisting {
  readonly reason: 'existing-card';
  readonly existingCardId: CardId;
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
  readonly move: LearnPathMove;
}

export interface LearnPathSkippedUnplayable {
  readonly reason: 'unplayable-move';
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
}

export type LearnPathSkipped = LearnPathSkippedExisting | LearnPathSkippedUnplayable;

export interface LearnPathFrontier {
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly nodeId: NodeId;
}

export interface LearnPathResult {
  readonly tag: string;
  readonly seeded: readonly LearnPathSeeded[];
  readonly skipped: readonly LearnPathSkipped[];
  readonly frontiers: readonly LearnPathFrontier[];
}

interface WalkFrontier {
  readonly state: BoardState;
  readonly parentCardId: CardId;
  readonly plyDepth: number;
}

/** DFS for a node matching `cardId` within a `CardLineageNode` tree. */
function findLineageNode(node: CardLineageNode, cardId: CardId): CardLineageNode | null {
  if (node.id === cardId) return node;
  for (const child of node.children) {
    const found = findLineageNode(child, cardId);
    if (found) return found;
  }
  return null;
}

/** Collect every CardId in the subtree, excluding `node` itself. */
function collectDescendantIds(node: CardLineageNode, out: CardId[]): void {
  for (const child of node.children) {
    out.push(child.id);
    collectDescendantIds(child, out);
  }
}

export function useLearnPath() {
  const { commitMint } = useMinting();

  /**
   * Fetches the anchor's already-minted descendants and returns a map
   * of `canonicalContent → CardId` for the existing-card dedup check.
   * Throws `LearnPathError` if the anchor can't be resolved to a game
   * tree the caller owns — a resolve failure means we cannot honestly
   * claim dedup coverage, so per ADR-0002 the walk refuses rather than
   * silently minting possible duplicates.
   */
  async function loadExistingDescendantContent(
    anchorCardId: CardId,
  ): Promise<Map<string, CardId>> {
    const resolved = await backendService.resolveRoots([anchorCardId]);
    const group = resolved.roots.find(r => r.cardIdsInTree.includes(anchorCardId));
    if (!group) {
      throw new LearnPathError(
        `Learn this path: anchor card ${anchorCardId} could not be resolved to an owned game tree ` +
        `(resolve-roots reported it unmatched); refusing to seed without existing-card dedup coverage.`,
      );
    }
    const tree = await backendService.fetchTreeByRoot(group.rootCardId);
    const anchorNode = findLineageNode(tree.tree, anchorCardId);
    if (!anchorNode) {
      throw new LearnPathError(
        `Learn this path: anchor card ${anchorCardId} was not found in its own resolved tree ` +
        `(root ${group.rootCardId}) — the lineage read is inconsistent with resolve-roots.`,
      );
    }
    const descendantIds: CardId[] = [];
    collectDescendantIds(anchorNode, descendantIds);
    const cards = await Promise.all(descendantIds.map(id => backendService.fetchCard(id)));
    const byContent = new Map<string, CardId>();
    for (const card of cards) byContent.set(card.canonicalContent, card.id);
    return byContent;
  }

  function buildSeedPayload(rawSgf: string, parentCardId: CardId, tag: string): CardCreatePayload {
    return {
      raw_content: rawSgf,
      num_moves: store.profile.settings.minting.defaultNumMoves,
      grading_parameter: compileMintGradingParameter(),
      tags: [tag],
      // CardId brand-strip to the wire's raw number — same justified
      // cast as useMinting.prepareDraft (CardId = Brand<number, 'CardId'>,
      // erases at runtime).
      parent_card_id: parentCardId as unknown as number,
      game_metadata: undefined,
    };
  }

  /**
   * Runs the walk and mints the seeded cards. See the module header for
   * the full design (ranking metric, choice-1 inclusion, precondition,
   * dedup). Params are validated up front; every other failure surfaces
   * as a structured, partial `LearnPathResult` (frontiers array) rather
   * than an abort, so branches that DID find analysis still get seeded
   * even when a sibling branch's analysis is missing.
   */
  async function runLearnPath(params: LearnPathParams): Promise<LearnPathResult> {
    if (params.depth < 1) throw new LearnPathError('Learn this path: depth must be >= 1.');
    if (params.topK < 1) throw new LearnPathError('Learn this path: topK must be >= 1.');
    const tag = params.tag.trim();
    if (!tag) throw new LearnPathError('Learn this path: a context tag is required.');

    const board = store.boards.find(b => b.id === params.boardId);
    if (!board) throw new LearnPathError(`Learn this path: board ${params.boardId} not found.`);
    if (board.sourceCardId === undefined) {
      throw new LearnPathPreconditionError(
        'Learn this path requires a board loaded from a card (no sourceCardId on this board). ' +
        'Load or review the anchor card first.',
      );
    }
    if (board.currentNodeId !== board.rootNodeId) {
      throw new LearnPathPreconditionError(
        'Learn this path must be invoked at the loaded card\'s own position (cursor at the board root). ' +
        'Navigate back to the card\'s position and try again.',
      );
    }
    const anchorCardId = board.sourceCardId;

    const existingContent = await loadExistingDescendantContent(anchorCardId);

    const seeded: LearnPathSeeded[] = [];
    const skipped: LearnPathSkipped[] = [];
    const frontiers: LearnPathFrontier[] = [];

    // Working copy: `applyGoMove` never mutates in place (spreads a new
    // BoardState per call, ADR-0001), so operating on the live reactive
    // board object here and never assigning results back is safe — no
    // side effect on the user's actual board/cursor/dirty state.
    let queue: WalkFrontier[] = [{ state: board, parentCardId: anchorCardId, plyDepth: 0 }];

    while (queue.length > 0) {
      const next: WalkFrontier[] = [];
      for (const frontier of queue) {
        if (frontier.plyDepth >= params.depth) continue;

        const raw = ledger.getRaw(activeAnalysisKeys.value.rawKey, frontier.state.currentNodeId);
        if (!raw || !raw.moveInfos || raw.moveInfos.length === 0) {
          // Constraint 1: fail loudly, but as a reported stop — not a
          // thrown abort — so sibling branches with recorded analysis
          // still seed. See the module header's "Ranking metric" note
          // for why this reading was chosen.
          frontiers.push({
            parentCardId: frontier.parentCardId,
            plyDepth: frontier.plyDepth,
            nodeId: frontier.state.currentNodeId,
          });
          continue;
        }

        const ranked = [...raw.moveInfos]
          .sort((a, b) => a.order - b.order)
          .slice(0, params.topK);

        for (let i = 0; i < ranked.length; i++) {
          const info = ranked[i];
          const rank = i + 1;
          const plyDepth = frontier.plyDepth + 1;
          const coords = gtpToBoard(info.move);
          if (!coords) {
            // Pass (or another unplayable GTP token) — applyGoMove has
            // no placement to make. Recorded, not silently dropped.
            skipped.push({ reason: 'unplayable-move', parentCardId: frontier.parentCardId, plyDepth, rank });
            continue;
          }

          const move: LearnPathMove = { x: coords.x, y: coords.y, color: frontier.state.turn };
          const nextState = applyGoMove(frontier.state, coords.x, coords.y);
          if (!nextState) {
            // Defensive: a move the search engine reported should always
            // be legal against this exact position. Treated the same as
            // an unplayable move rather than aborting the whole walk.
            skipped.push({ reason: 'unplayable-move', parentCardId: frontier.parentCardId, plyDepth, rank });
            continue;
          }

          const candidateSgf = serializeActivePath(nextState);
          const existingCardId = existingContent.get(candidateSgf);

          if (existingCardId !== undefined) {
            skipped.push({
              reason: 'existing-card',
              existingCardId,
              parentCardId: frontier.parentCardId,
              plyDepth,
              rank,
              move,
            });
            next.push({ state: nextState, parentCardId: existingCardId, plyDepth });
            continue;
          }

          const payload = buildSeedPayload(candidateSgf, frontier.parentCardId, tag);
          // CardId brand mint: commitMint (→ backendService.createCard)
          // returns the wire's raw numeric id; ACL brand mint at this
          // call site, mirroring backend-service.ts's other Band-2 mints.
          const newCardId = await commitMint(payload) as CardId;
          seeded.push({ cardId: newCardId, parentCardId: frontier.parentCardId, plyDepth, rank, move });
          next.push({ state: nextState, parentCardId: newCardId, plyDepth });
        }
      }
      queue = next;
    }

    return { tag, seeded, skipped, frontiers };
  }

  return { runLearnPath };
}
