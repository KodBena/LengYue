/**
 * src/composables/cards/batch-mint-core.ts
 *
 * Pure core (ADR-0012 P9: functional-core/imperative-shell) for the
 * batch card-minting affordance (commissioner-designed, ledger rows
 * 926/957/1008). Everything here is a pure function of its arguments
 * — no store reads, no I/O, no Vue reactivity — so it is exercised
 * directly by unit tests without mounting a component or mocking
 * `fetch`.
 *
 * Wire contract (already live on the backend, ledger rows 884/885/886
 * — see `backend/schemas/card.py::BatchCardItem`/`CardBatchCreateRequest`):
 * `POST /cards/batch` takes `{cards: [CardCreate-shaped item + parent_ref]}`
 * where `parent_ref` is `null` (root — pairs with `game_metadata`) |
 * `{card_id}` (branch off an existing, already-minted card) |
 * `{batch_index}` (branch off an EARLIER member of this same batch —
 * a forward or self reference is rejected backend-side). The response
 * is `{card_ids: [...]}` in request order.
 *
 * `orderSelectionForBatch` walks the board's tree in preorder
 * (root → leaves) so that any selected ancestor is placed before its
 * selected descendant — the batch's own ordering invariant
 * (`batch_index` may only reference an earlier index) falls out of
 * tree preorder for free, no separate topological sort needed.
 *
 * `resolveBatchParentRef` implements the ratified rule (spec point 3):
 * when a selected node's NEAREST tree-structural ancestor is ALSO in
 * this batch, link via `{batch_index}` to that ancestor's own entry;
 * otherwise fall back to whatever `fallbackParentRef` the caller
 * supplies — the SAME parent resolution `useMinting.prepareDraft` uses
 * for a single mint today (a board's `sourceCardId`, or `null` for a
 * fresh root), never a different rule for the batch case.
 *
 * License: Public Domain (The Unlicense)
 */
import { serializeActivePath } from '../../engine/sgf-writer';
import type {
  BoardState,
  CardBatchParentRef,
  BatchCardItemPayload,
  GameMetadataPayload,
  NodeId,
} from '../../types';

/**
 * Preorder (root → leaves, depth-first) walk of `nodes` starting at
 * `rootNodeId`, collecting only the ids present in `selected`. A
 * selected ancestor always appears before any of its selected
 * descendants in the returned array — the ordering property the
 * batch wire contract's `batch_index` (earlier-indices-only) needs.
 */
export function orderSelectionForBatch(
  nodes: BoardState['nodes'],
  rootNodeId: NodeId,
  selected: ReadonlySet<NodeId>,
): NodeId[] {
  const out: NodeId[] = [];
  // Explicit stack, not recursion: a pathologically deep game tree
  // (thousands of plies of one long variation) would otherwise risk a
  // stack-depth failure on a walk with no other reason to be
  // recursive — the existing `serializeSubtree` in sgf-writer.ts
  // accepts that risk for its own (much shorter, single-purpose)
  // recursion, but this walk has no such precedent to match and an
  // iterative form costs nothing extra to write.
  const stack: NodeId[] = [rootNodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (selected.has(id)) out.push(id);
    const node = nodes[id];
    if (!node) continue;
    // Push children in reverse so the stack pops them in original
    // (left-to-right) order — preorder, not just "depth-first in some
    // order".
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }
  return out;
}

/**
 * Resolves `nodeId`'s parent_ref against the batch's own membership:
 * walks up `nodes[nodeId].parent` until it finds an ancestor present
 * in `indexByNodeId` (i.e. an ancestor that is ALSO selected and has
 * already been placed earlier in the batch), returning
 * `{batch_index}` for it. Returns `null` (no batch-internal ancestor)
 * when the walk reaches the root without a hit — the caller falls
 * back to `fallbackParentRef` in that case.
 */
export function resolveBatchAncestorRef(
  nodes: BoardState['nodes'],
  nodeId: NodeId,
  indexByNodeId: ReadonlyMap<NodeId, number>,
): { readonly batch_index: number } | null {
  let cur = nodes[nodeId]?.parent ?? null;
  while (cur !== null) {
    const idx = indexByNodeId.get(cur);
    if (idx !== undefined) return { batch_index: idx };
    cur = nodes[cur]?.parent ?? null;
  }
  return null;
}

export interface BuildBatchMintPayloadParams {
  readonly board: BoardState;
  readonly selectedNodeIds: ReadonlySet<NodeId>;
  /** Same parent resolution `useMinting.prepareDraft` uses today — `{card_id}` when the board has a `sourceCardId`, `null` (root) otherwise. */
  readonly fallbackParentRef: CardBatchParentRef | null;
  /** Only used when `fallbackParentRef` is `null` (a root mint) — mirrors `prepareDraft`'s own `game_metadata` construction. */
  readonly fallbackGameMetadata?: GameMetadataPayload;
  readonly numMoves: number;
  readonly gradingParameter: Record<string, unknown> | null;
  readonly tags: readonly string[];
}

export interface BuildBatchMintPayloadResult {
  /** The `{cards: [...]}` request body for `POST /cards/batch`, in the SAME order as `nodeOrder`. */
  readonly cards: readonly BatchCardItemPayload[];
  /** `nodeOrder[i]` is the NodeId `cards[i]` was built from — the caller's key for mapping the response's `card_ids[i]` back to a tree position. */
  readonly nodeOrder: readonly NodeId[];
}

/**
 * Builds one `POST /cards/batch` request body from a board and its
 * current mint-selection. `selectedNodeIds` may be a SINGLE node —
 * there is no size-1 special case here; the empty-selection
 * degenerate case (today's single-mint behavior, `POST /cards/`) is
 * handled by the caller (`MintCardModal.vue`), which never calls this
 * function with an empty set.
 */
export function buildBatchMintPayload(params: BuildBatchMintPayloadParams): BuildBatchMintPayloadResult {
  const { board, selectedNodeIds, fallbackParentRef, fallbackGameMetadata, numMoves, gradingParameter, tags } = params;
  const nodeOrder = orderSelectionForBatch(board.nodes, board.rootNodeId, selectedNodeIds);
  const indexByNodeId = new Map<NodeId, number>(nodeOrder.map((id, i) => [id, i]));

  const cards: BatchCardItemPayload[] = nodeOrder.map(nodeId => {
    const ancestorRef = resolveBatchAncestorRef(board.nodes, nodeId, indexByNodeId);
    const parent_ref = ancestorRef ?? fallbackParentRef;
    return {
      raw_content: serializeActivePath(board, nodeId),
      num_moves: numMoves,
      grading_parameter: gradingParameter,
      tags: [...tags],
      parent_ref,
      game_metadata: parent_ref === null ? fallbackGameMetadata : undefined,
    };
  });

  return { cards, nodeOrder };
}
