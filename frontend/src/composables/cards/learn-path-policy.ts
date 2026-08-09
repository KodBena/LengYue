/**
 * src/composables/cards/learn-path-policy.ts
 *
 * The exploration-policy seam for "Learn this path" (wiki #8). Pure,
 * typed, no I/O: given a node's raw candidate `moveInfos` and a config,
 * decide which candidates to expand and in what order, which of those
 * are the "spine" (the best-move reference line, never carded) vs.
 * "deviation" (carded, recursively expanded as their own subtree), and
 * how deep the walk continues. `useLearnPath.ts` (the effectful walk
 * engine — ledger reads, live tree mutation, marking mintable
 * positions for the batch card-minting affordance, ledger rows
 * 926/957/1008) depends on this module, never the reverse.
 *
 * Ratified semantics (ledger rows 706-708, superseding this feature's
 * original v1 shipped design after commissioner review of the dispatch
 * report's design flag):
 *
 *   - Row 706 (confirms the v1 reading): candidates rank by KataGo's
 *     own `moveInfos[].order`, ascending — smaller is better. Ties
 *     (equal `order`) break by original array position, so ranking is
 *     deterministically stable independent of JS engine sort-stability
 *     guarantees (spec-guaranteed since ES2019, but pinned explicitly
 *     here rather than relied upon implicitly).
 *   - Row 707: rank 1 (`order` 0, the engine's best move) is the SPINE
 *     — descended first at every step to form a single reference line.
 *     No card is ever minted for a spine position.
 *   - Row 708: ranks 2..K are DEVIATIONS. Each is itself the root of a
 *     recursively-expanded subtree — the same spine-first rule applies
 *     *within* a deviation's own subtree (its own best continuation is
 *     its own spine, not carded; ITS deviations recurse again).
 *
 * `LearnPathPolicy` is the seam a future user-selectable policy DSL
 * (under design consideration, not built here — row: orchestrator,
 * type-driven) plugs into: `spineFirstPolicy` below is the sole
 * concrete implementation today, but `useLearnPath.explore` accepts
 * any `LearnPathPolicy` via an optional param, defaulting to it. A
 * DSL-backed policy would compile to this same interface — nothing in
 * the walk engine assumes `spineFirstPolicy`'s specific
 * spine/deviation split beyond what `RankedCandidate.role` exposes.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — the policy shape is
 * generic (any per-node ranked-candidate walk), but `KataMoveInfo` ties
 * it to the KataGo analysis vocabulary.
 *
 * License: Public Domain (The Unlicense)
 */
import type { KataMoveInfo } from '../../engine/katago/types';

/** Depth (plies) and breadth (candidates per node) for a walk. */
export interface LearnPathPolicyConfig {
  /** Plies to expand beyond the anchor / a deviation's own root. >= 1. */
  readonly depth: number;
  /** Candidates {1..K} expanded per node, rank 1 = the spine. >= 1. */
  readonly topK: number;
}

/** `'spine'` — the best-move reference line (never carded). `'deviation'` — a carded, recursively-expanded branch. */
export type LearnPathRole = 'spine' | 'deviation';

/** One ranked, role-tagged candidate at a node — the policy's per-candidate verdict. */
export interface RankedCandidate {
  readonly info: KataMoveInfo;
  /** 1-based rank within this node's expansion, ascending by `order` (rank 1 = best). */
  readonly rank: number;
  readonly role: LearnPathRole;
}

/**
 * A pluggable exploration policy. Pure: no ledger reads, no board
 * mutation, no minting — `useLearnPath`'s walk engine is the sole
 * effectful consumer.
 */
export interface LearnPathPolicy {
  /**
   * Rank and role-tag a node's candidates. Returns AT MOST
   * `config.topK` entries, ordered rank-ascending (index 0 is always
   * explored/recursed into first by the walk engine — this ordering IS
   * the "spine drawn before its deviations" live-growth guarantee, not
   * an engine-side re-sort).
   */
  rankCandidates(moveInfos: readonly KataMoveInfo[], config: LearnPathPolicyConfig): RankedCandidate[];
  /** Whether the walk recurses past a position reached via `role`, at the position's own `plyDepth`. */
  shouldRecurse(role: LearnPathRole, plyDepth: number, config: LearnPathPolicyConfig): boolean;
  /** Whether a position reached via `role` is a minting candidate. */
  isCardEligible(role: LearnPathRole): boolean;
}

/**
 * The ratified v1 policy (rows 706-708): rank ascending by `order`
 * (stable on ties via original-index tiebreak), rank 1 is the
 * uncarded spine, ranks 2..K are carded deviations, and the walk
 * continues for both roles until `config.depth` plies are used.
 */
export const spineFirstPolicy: LearnPathPolicy = {
  rankCandidates(moveInfos, config) {
    return moveInfos
      .map((info, originalIndex) => ({ info, originalIndex }))
      // Row 706: ascending by `order`; ties broken by original array
      // position so ranking never depends on engine sort-stability.
      .sort((a, b) => (a.info.order - b.info.order) || (a.originalIndex - b.originalIndex))
      .slice(0, config.topK)
      .map(({ info }, i) => ({
        info,
        rank: i + 1,
        // Cast: the ternary's arms are the literal union's only two
        // members, but TS widens a computed conditional to `string`
        // rather than narrowing to `LearnPathRole` — sound by
        // construction (row 707: index 0 is always the spine).
        role: (i === 0 ? 'spine' : 'deviation') as LearnPathRole,
      }));
  },
  shouldRecurse(_role, plyDepth, config) {
    return plyDepth < config.depth;
  },
  isCardEligible(role) {
    return role !== 'spine';
  },
};
