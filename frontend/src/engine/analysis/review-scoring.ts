/**
 * src/engine/analysis/review-scoring.ts
 *
 * Per-move delta scoring for the spaced-repetition review session —
 * the named extraction of the scoring half of ADR-0003's
 * `useReviewSession` seam ("the orchestration is portable; the
 * scoring extraction is not"). The logic is Go-bound (B3): it
 * resolves the user's just-played move to a per-colour move index
 * and looks up the proxy's `extra.{black,white}.deltas` enrichment
 * under that index.
 *
 * Band constraint (load-bearing): the enrichment read is taken as a
 * PARAMETER (`EnrichmentAccessor`) rather than importing the
 * analysis ledger — the engine band is services-clean, and an
 * `engine/ → services/` import here would be the band's first such
 * edge. The shape follows ADR-0003's takes-the-predicate-as-a-
 * parameter idiom (the persistence service takes the gating
 * predicate as a parameter; it doesn't import it).
 *
 * Lookup order is load-bearing (see the inline comments): the s_1
 * fast path first, then a scan of every node on the active path in
 * path order, first non-undefined value wins. A missing delta is a
 * structured failure (`kind: 'missing'`), never a silent default —
 * the historical 0.5 fallback scored every enrichment failure as a
 * "neutral" review and corrupted the Ebisu recall update (ADR-0002).
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, NodeId, StoneColor } from '../../types';
import type { Enrichment } from '../katago/types';

/**
 * Per-node read of the enrichment store, with the key (and the
 * store itself) bound by the caller. `useReviewSession` supplies
 * `nodeId => ledger.getEnrichment(keys.enrichedKey, nodeId)`;
 * tier-1 tests supply a plain map lookup.
 */
export type EnrichmentAccessor = (nodeId: NodeId) => Enrichment | null;

/**
 * Result of the per-move delta lookup. `missing` is the structured
 * loud-failure shape (ADR-0002): the caller owns the surfacing
 * (system message + session cancel in `useReviewSession`); this
 * module's contract is that it never substitutes a default score.
 */
export type PerMoveDeltaResult =
  | { readonly kind: 'found'; readonly delta: number }
  | { readonly kind: 'missing'; readonly color: StoneColor; readonly perColorIndex: number };

/**
 * Score the user's just-played review move against the per-colour
 * delta enrichment.
 *
 * Preconditions: `path` is the board's active variation path,
 * `s_1_id` is the node of the user's just-played move (minted by
 * `applyGoMove`, so it carries a `Move`), and `s_1_idx` is its
 * index on `path`.
 */
export function scorePerMoveDelta(
  nodes: BoardState['nodes'],
  path: readonly NodeId[],
  s_1_idx: number,
  s_1_id: NodeId,
  getEnrichment: EnrichmentAccessor,
): PerMoveDeltaResult {
  // Non-null assertion justified: s_1 is the node `applyGoMove`
  // minted for the user's just-played move, so `move` is present by
  // construction (see preconditions above). A caller violating that
  // throws here — fail-loud — rather than scoring a non-move node.
  const userColor = nodes[s_1_id].move!.color;
  const colorKey = userColor === 'B' ? 'black' : 'white';

  // Per-color local index for the user's just-played move. Black
  // moves are at full-path positions 1, 3, 5… (per-color indices 0,
  // 1, 2…); white moves are at 2, 4, 6…. The proxy keys
  // `extra.{color}.deltas` by per-color index strings ("0", "1", …);
  // see `composables/analysis/enriched-accumulator.ts` (its
  // per-player deltas ingestion) for the symmetric read on the
  // analysis tab and `engine/katago/types.ts::KataPlayerExtra.deltas`
  // for the contract.
  let colorMoveCount = 0;
  for (let i = 0; i <= s_1_idx; i++) {
    if (nodes[path[i]]?.move?.color === userColor) {
      colorMoveCount++;
    }
  }
  const n = colorMoveCount - 1;

  // Per-color delta lookup against the ENRICHMENT store (read via
  // the caller-bound accessor). The proxy attaches each
  // `[color].deltas` entry to whichever packet on the analyzed range
  // it chose — most commonly the s_0 packet (the position the move
  // was played FROM, since that's where the engine evaluated
  // alternatives), but we don't require that. Mirror the
  // analysis-tab pattern in
  // `composables/analysis/enriched-accumulator.ts`: try s_1 first,
  // then scan every node on the active path for the key `n`, taking
  // the first non-undefined value found. The fast-path covers the
  // historic case; the scan covers the s_0 case the prior
  // implementation silently missed (and the structured `missing`
  // result below catches the residue).
  let delta = getEnrichment(s_1_id)?.[colorKey]?.deltas?.[n];
  if (delta === undefined) {
    for (const nodeId of path) {
      const candidate = getEnrichment(nodeId)?.[colorKey]?.deltas?.[n];
      if (candidate !== undefined) {
        delta = candidate;
        break;
      }
    }
  }

  if (delta === undefined) {
    // ADR-0002: a missing per-move delta at the wire boundary is a
    // contract failure (proxy enrichment misconfiguration, palette
    // drift, narrow-range delta_fn that never fires, etc.). The
    // prior behaviour silently substituted 0.5 here, which scored
    // every failure as a "neutral" review and corrupted the Ebisu
    // recall update on every occurrence — exactly the discovered-
    // late-as-corrupted-data failure mode the tenet is shaped to
    // prevent. Return the structured miss; the caller surfaces it
    // and cancels the session before any score is persisted.
    return { kind: 'missing', color: userColor, perColorIndex: n };
  }

  return { kind: 'found', delta };
}
