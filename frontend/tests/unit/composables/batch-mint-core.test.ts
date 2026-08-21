/**
 * tests/unit/composables/batch-mint-core.test.ts
 *
 * Tier-1 (pure-logic) tests for `batch-mint-core.ts` — the batch
 * card-minting affordance's payload builder (commissioner-designed,
 * ledger rows 926/957/1008). Pure function of a board + a selection
 * Set; no DOM, no fakes, no store.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  orderSelectionForBatch,
  resolveBatchAncestorRef,
  buildBatchMintPayload,
  filterUncardedSelection,
  type UncardedNodeId,
} from '../../../src/composables/cards/batch-mint-core';
import { createInitialBoard, asNodeId } from '../../../src/store/board-factory';
import type { BoardState, ContentHash, GameNode, NodeId } from '../../../src/types';

/**
 * Test-only shortcut: brand a plain `NodeId` set as `UncardedNodeId`
 * via the REAL constructor (`filterUncardedSelection`) with an empty
 * known-hashes set, so every id passes through unfiltered. Used by
 * the `buildBatchMintPayload` tests below, which are about ordering/
 * parent_ref resolution, not the exclusion filter itself (that has
 * its own dedicated describe block further down).
 */
function asUncarded(ids: NodeId[]): ReadonlySet<UncardedNodeId> {
  return filterUncardedSelection(new Set(ids), () => undefined, new Set()).ids;
}

/**
 * Builds a synthetic tree over a fresh `createInitialBoard()` skeleton:
 *
 *        root
 *       /    \
 *      a      e
 *     / \
 *    b   d
 *    |
 *    c
 *
 * Every node carries a trivial `properties` blob (`{B: ['']}`) so
 * `serializeActivePath` has something non-empty to emit per node —
 * the actual SGF content isn't the property under test here (that's
 * `sgf-writer.test.ts`'s job); only STRUCTURE (ordering, parent_ref
 * resolution) is.
 */
function buildTree(): { board: BoardState; ids: Record<'root' | 'a' | 'b' | 'c' | 'd' | 'e', NodeId> } {
  const board = createInitialBoard();
  const root = board.rootNodeId;
  const ids = {
    root,
    a: asNodeId('a'),
    b: asNodeId('b'),
    c: asNodeId('c'),
    d: asNodeId('d'),
    e: asNodeId('e'),
  };

  function mk(id: NodeId, parent: NodeId | null): GameNode {
    return {
      id,
      parent,
      children: [],
      activeChildIndex: 0,
      properties: { B: [''] },
      move: parent ? { x: 0, y: 0, color: 'B', type: 'place' } : undefined,
    };
  }

  board.nodes[root].children = [ids.a, ids.e];
  board.nodes[ids.a] = mk(ids.a, root);
  board.nodes[ids.e] = mk(ids.e, root);
  board.nodes[ids.a].children = [ids.b, ids.d];
  board.nodes[ids.b] = mk(ids.b, ids.a);
  board.nodes[ids.d] = mk(ids.d, ids.a);
  board.nodes[ids.b].children = [ids.c];
  board.nodes[ids.c] = mk(ids.c, ids.b);

  return { board, ids };
}

describe('orderSelectionForBatch — preorder, ancestors before descendants', () => {
  it('returns selected nodes in root-to-leaf (preorder) order regardless of Set insertion order', () => {
    const { board, ids } = buildTree();
    // Insertion order deliberately scrambled — the function must not
    // depend on Set iteration order for correctness.
    const selected = new Set<NodeId>([ids.c, ids.a, ids.e, ids.b]);
    const order = orderSelectionForBatch(board.nodes, board.rootNodeId, selected);
    expect(order).toEqual([ids.a, ids.b, ids.c, ids.e]);
  });

  it('excludes unselected nodes entirely', () => {
    const { board, ids } = buildTree();
    const selected = new Set<NodeId>([ids.b, ids.d]);
    const order = orderSelectionForBatch(board.nodes, board.rootNodeId, selected);
    expect(order).toEqual([ids.b, ids.d]);
  });

  it('returns an empty array for an empty selection', () => {
    const { board } = buildTree();
    expect(orderSelectionForBatch(board.nodes, board.rootNodeId, new Set())).toEqual([]);
  });

  it('handles the root itself being selected', () => {
    const { board, ids } = buildTree();
    const selected = new Set<NodeId>([ids.root, ids.c]);
    const order = orderSelectionForBatch(board.nodes, board.rootNodeId, selected);
    expect(order).toEqual([ids.root, ids.c]);
  });
});

describe('resolveBatchAncestorRef — nearest selected ancestor, earlier-index-only', () => {
  it('resolves to the NEAREST selected ancestor, not a farther one', () => {
    const { board, ids } = buildTree();
    // a, b, c all selected — c's nearest selected ancestor is b, not a.
    const order = [ids.a, ids.b, ids.c];
    const indexByNodeId = new Map(order.map((id, i) => [id, i]));
    expect(resolveBatchAncestorRef(board.nodes, ids.c, indexByNodeId)).toEqual({ batch_index: 1 }); // b
    expect(resolveBatchAncestorRef(board.nodes, ids.b, indexByNodeId)).toEqual({ batch_index: 0 }); // a
  });

  it('skips an UNSELECTED intermediate ancestor to find the nearest selected one further up', () => {
    const { board, ids } = buildTree();
    // a and c selected, b (c's direct parent) is NOT selected — c's
    // nearest SELECTED ancestor is a (skipping over b).
    const order = [ids.a, ids.c];
    const indexByNodeId = new Map(order.map((id, i) => [id, i]));
    expect(resolveBatchAncestorRef(board.nodes, ids.c, indexByNodeId)).toEqual({ batch_index: 0 });
  });

  it('returns null when no ancestor up to the root is selected', () => {
    const { board, ids } = buildTree();
    const indexByNodeId = new Map<NodeId, number>(); // nothing else selected
    expect(resolveBatchAncestorRef(board.nodes, ids.c, indexByNodeId)).toBeNull();
  });
});

describe('buildBatchMintPayload — parent_ref resolution end to end', () => {
  it('ancestor-in-selection -> batch_index; not-in-selection -> the fallback (board lineage)', () => {
    const { board, ids } = buildTree();
    // a and c selected; b (c's tree parent) and e are NOT.
    const selectedNodeIds = asUncarded([ids.a, ids.c]);
    const result = buildBatchMintPayload({
      board,
      selectedNodeIds,
      fallbackParentRef: { card_id: 42 },
      numMoves: 12,
      gradingParameter: { data: {} },
      tags: ['fight'],
    });

    expect(result.nodeOrder).toEqual([ids.a, ids.c]);
    // a has no selected ancestor -> falls back to the board's own lineage.
    expect(result.cards[0].parent_ref).toEqual({ card_id: 42 });
    expect(result.cards[0].game_metadata).toBeUndefined();
    // c's nearest selected ancestor is a, at index 0 in THIS batch.
    expect(result.cards[1].parent_ref).toEqual({ batch_index: 0 });

    // Shared settings applied uniformly to every card in the batch.
    for (const card of result.cards) {
      expect(card.num_moves).toBe(12);
      expect(card.tags).toEqual(['fight']);
      expect(card.grading_parameter).toEqual({ data: {} });
    }
  });

  it('a root mint (fallbackParentRef null) carries game_metadata only on members with no in-batch ancestor', () => {
    const { board, ids } = buildTree();
    const selectedNodeIds = asUncarded([ids.a, ids.b]);
    const gameMetadata = { description: 'g', client_game_id: 'cgid' };
    const result = buildBatchMintPayload({
      board,
      selectedNodeIds,
      fallbackParentRef: null,
      fallbackGameMetadata: gameMetadata,
      numMoves: 5,
      gradingParameter: null,
      tags: [],
    });

    expect(result.cards[0].parent_ref).toBeNull();
    expect(result.cards[0].game_metadata).toEqual(gameMetadata);
    // b's ancestor (a) IS in the batch — parent_ref is batch_index, and
    // game_metadata must NOT also be set (the wire's XOR rule).
    expect(result.cards[1].parent_ref).toEqual({ batch_index: 0 });
    expect(result.cards[1].game_metadata).toBeUndefined();
  });

  it('a single-node selection (the size-1 batch case) still resolves via the fallback, not a special case', () => {
    const { board, ids } = buildTree();
    const result = buildBatchMintPayload({
      board,
      selectedNodeIds: asUncarded([ids.d]),
      fallbackParentRef: { card_id: 7 },
      numMoves: 1,
      gradingParameter: null,
      tags: [],
    });
    expect(result.nodeOrder).toEqual([ids.d]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].parent_ref).toEqual({ card_id: 7 });
  });

  it('duplicate raw_content across two selected nodes is permitted (no dedup in the builder)', () => {
    // Two DIFFERENT nodes can carry the same serialized SGF (e.g. two
    // passes at the same depth) — the wire contract explicitly permits
    // duplicates in a batch (treated as the single-mint path treats
    // them); the builder must not silently collapse or drop either.
    const { board, ids } = buildTree();
    const result = buildBatchMintPayload({
      board,
      selectedNodeIds: asUncarded([ids.b, ids.d]), // siblings — same parent, same move shape
      fallbackParentRef: { card_id: 1 },
      numMoves: 1,
      gradingParameter: null,
      tags: [],
    });
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].raw_content).toBe(result.cards[1].raw_content);
  });
});

describe('filterUncardedSelection — pre-existing-card exclusion (commissioner ruling, ledger row 1063)', () => {
  const HASH_A = 'hash-a' as ContentHash;
  const HASH_B = 'hash-b' as ContentHash;

  it('excludes a selected node whose hash IS in the known set', () => {
    const { ids } = buildTree();
    const hashOf = (id: NodeId) => (id === ids.a ? HASH_A : undefined);
    const result = filterUncardedSelection(new Set([ids.a, ids.b]), hashOf, new Set([HASH_A]));

    expect(result.ids.has(ids.a as UncardedNodeId)).toBe(false);
    expect(result.ids.has(ids.b as UncardedNodeId)).toBe(true);
    expect(result.excludedAsKnown).toEqual([ids.a]);
  });

  it('includes a selected node whose hash is NOT in the known set', () => {
    const { ids } = buildTree();
    const hashOf = () => HASH_B;
    const result = filterUncardedSelection(new Set([ids.a]), hashOf, new Set([HASH_A]));

    expect(result.ids.has(ids.a as UncardedNodeId)).toBe(true);
    expect(result.excludedAsKnown).toEqual([]);
  });

  it('a cache-miss (hashOf returns undefined) is treated as UNCARDED — included, not excluded (accepted-cost posture, same as useKnownPositionNodes)', () => {
    const { ids } = buildTree();
    const result = filterUncardedSelection(new Set([ids.a]), () => undefined, new Set([HASH_A]));

    expect(result.ids.has(ids.a as UncardedNodeId)).toBe(true);
    expect(result.excludedAsKnown).toEqual([]);
  });

  it('an entirely-known selection filters down to an empty result — the "nothing left to mint" case', () => {
    const { ids } = buildTree();
    const hashOf = () => HASH_A;
    const result = filterUncardedSelection(new Set([ids.a, ids.b, ids.c]), hashOf, new Set([HASH_A]));

    expect(result.ids.size).toBe(0);
    expect(result.excludedAsKnown).toEqual([ids.a, ids.b, ids.c]);
  });

  it('an empty known-hashes set excludes nothing', () => {
    const { ids } = buildTree();
    const hashOf = () => HASH_A;
    const result = filterUncardedSelection(new Set([ids.a, ids.b]), hashOf, new Set());

    expect(result.ids.size).toBe(2);
    expect(result.excludedAsKnown).toEqual([]);
  });
});
