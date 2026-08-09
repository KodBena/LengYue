/**
 * tests/unit/composables/batch-mint-core-ordering.test.ts
 *
 * Property-style coverage for `batch-mint-core.ts`'s earlier-index
 * ordering invariant, over GENERATED trees and random selections —
 * the fixed 6-node example in `batch-mint-core.test.ts` pins the
 * mechanism's SHAPE; this file pins that it holds generally, not just
 * on that one hand-picked tree.
 *
 * Reuses this repo's existing seeded-generator precedent
 * (`tests/unit/engine/nav-tree-generator.ts`'s `mulberry32` PRNG +
 * `generateTreeSpec`) rather than adding a property-testing dependency
 * (no `fast-check` in this repo — same reasoning that generator's own
 * header documents). `generateTreeSpec`/`TreeSpec` are structural only
 * (branching shape, no move/coordinate data) — `treeSpecToNodes` below
 * is this file's own lightweight conversion straight to
 * `Record<NodeId, GameNode>`, skipping `nav-tree-generator.ts`'s own
 * SGF-rendering + `loadSgf` path entirely: `batch-mint-core.ts` reads
 * only `.id`/`.parent`/`.children`, never move content or Go legality,
 * so there is nothing for a real SGF round-trip to buy here.
 *
 * Invariant under test, for many (seed, tree, random-selection)
 * combinations: every selected ancestor's batch index precedes every
 * selected descendant's, and every `{batch_index}` reference
 * `resolveBatchAncestorRef` returns points strictly to an EARLIER
 * index than the node making the reference — the wire contract's own
 * "batch_index refers only to EARLIER indices" rule
 * (`backend/schemas/card.py::ParentRefBatchIndex`).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  orderSelectionForBatch,
  resolveBatchAncestorRef,
  filterUncardedSelection,
  type UncardedNodeId,
} from '../../../src/composables/cards/batch-mint-core';
import { mulberry32, generateTreeSpec, type TreeSpec } from '../../unit/engine/nav-tree-generator';
import { asNodeId } from '../../../src/store/board-factory';
import type { ContentHash, GameNode, NodeId } from '../../../src/types';

/**
 * Converts a bare `TreeSpec` (branching shape only) into a
 * `Record<NodeId, GameNode>` + its root id — a direct structural
 * mint, no SGF/rules involved (see file header for why that's sound
 * here). NodeIds are minted `n0`, `n1`, ... in the SAME preorder the
 * conversion walks, purely as stable, readable identifiers for test
 * failure output — `orderSelectionForBatch`'s own preorder walk is
 * the property under test, not assumed by this numbering.
 */
function treeSpecToNodes(spec: TreeSpec): { nodes: Record<NodeId, GameNode>; rootNodeId: NodeId } {
  const nodes: Record<NodeId, GameNode> = {};
  let counter = 0;
  function build(node: TreeSpec, parent: NodeId | null): NodeId {
    const id = asNodeId(`n${counter++}`);
    const childIds = node.children.map(child => build(child, id));
    nodes[id] = {
      id,
      parent,
      children: childIds,
      activeChildIndex: 0,
      properties: {},
      move: parent ? { x: 0, y: 0, color: 'B', type: 'place' } : undefined,
    };
    return id;
  }
  const rootNodeId = build(spec, null);
  return { nodes, rootNodeId };
}

/** All NodeIds in `nodes`, for random-subset selection. */
function allNodeIds(nodes: Record<NodeId, GameNode>): NodeId[] {
  return Object.keys(nodes) as NodeId[];
}

/** Walks `nodes[id].parent` up to (not including) the root; used by the invariant checks below, independent of `resolveBatchAncestorRef`'s own implementation. */
function ancestorsOf(nodes: Record<NodeId, GameNode>, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let cur = nodes[id]?.parent ?? null;
  while (cur !== null) {
    out.push(cur);
    cur = nodes[cur]?.parent ?? null;
  }
  return out;
}

const SEEDS = [1, 2, 3, 7, 42, 1000, 99999, 123456];

describe('batch-mint-core ordering invariant — generated trees, random selections', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: every selected ancestor precedes every selected descendant; every batch_index reference is strictly earlier`, () => {
      const rand = mulberry32(seed);
      const spec = generateTreeSpec(rand, /* maxDepth */ 6, /* maxBranch */ 3);
      const { nodes, rootNodeId } = treeSpecToNodes(spec);
      const ids = allNodeIds(nodes);

      // Random subset selection: each node independently included at
      // ~50% (same seeded `rand`, so reproducible per seed). Skew
      // toward a non-trivial selection size by retrying once if the
      // draw came up empty or full (both degenerate for this
      // invariant) — bounded retry, not a loop that could hang.
      let selected = new Set<NodeId>();
      for (let attempt = 0; attempt < 5; attempt++) {
        selected = new Set(ids.filter(() => rand() < 0.5));
        if (selected.size > 1 && selected.size < ids.length) break;
      }
      if (selected.size < 2) return; // vacuous for this tree/seed — no ancestor/descendant pair possible

      const nodeOrder = orderSelectionForBatch(nodes, rootNodeId, selected);
      expect(nodeOrder.length).toBe(selected.size);
      expect(new Set(nodeOrder)).toEqual(selected); // exactly the selected ids, no more/fewer

      const indexByNodeId = new Map<NodeId, number>(nodeOrder.map((id, i) => [id, i]));

      for (const id of nodeOrder) {
        const ownIndex = indexByNodeId.get(id)!;

        // Property 1: every SELECTED ancestor of `id` (regardless of
        // whether it's the nearest one) appears at a strictly earlier
        // index — preorder's own ancestor-before-descendant guarantee,
        // checked independently of `orderSelectionForBatch`'s
        // implementation via a plain parent-chain walk.
        for (const ancestor of ancestorsOf(nodes, id)) {
          if (selected.has(ancestor)) {
            expect(indexByNodeId.get(ancestor)!).toBeLessThan(ownIndex);
          }
        }

        // Property 2: resolveBatchAncestorRef's own {batch_index}
        // reference (when present) points strictly earlier than `id`'s
        // own index — the wire contract's literal invariant.
        const ref = resolveBatchAncestorRef(nodes, id, indexByNodeId);
        if (ref !== null) {
          expect(ref.batch_index).toBeLessThan(ownIndex);
          expect(ref.batch_index).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }
});

/**
 * `filterUncardedSelection` property (commissioner ruling, ledger row
 * 1063): "no payload element's hash is in the known set" — for
 * generated trees, a random selection, and a random "known hashes"
 * subset, the ids `filterUncardedSelection` ADMITS never resolve (via
 * the SAME `hashOf` the constructor itself was given) to a hash that
 * was in the known set; conversely every EXCLUDED id's hash IS in the
 * known set — the filter neither over- nor under-excludes.
 */
describe('filterUncardedSelection property — generated trees, random selections, random known-hash subsets', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: no admitted id's hash is in the known set; every excluded id's hash is`, () => {
      const rand = mulberry32(seed);
      const spec = generateTreeSpec(rand, /* maxDepth */ 6, /* maxBranch */ 3);
      const { nodes } = treeSpecToNodes(spec);
      const ids = allNodeIds(nodes);

      const selected = new Set(ids.filter(() => rand() < 0.6));
      if (selected.size === 0) return; // vacuous for this seed

      // Synthetic per-node hash: one distinct hash per id (deterministic,
      // seed-independent — the CONTENT doesn't matter, only membership).
      const hashById = new Map<NodeId, ContentHash>(ids.map(id => [id, `hash-${id}` as ContentHash]));
      // A random subset of ALL node hashes (not just selected ones — a
      // known-hash set is populated from the user's whole card
      // collection, unrelated to what's currently selected) stands in
      // for "already has a card".
      const knownHashes = new Set<ContentHash>(
        ids.filter(() => rand() < 0.4).map(id => hashById.get(id)!),
      );
      const hashOf = (id: NodeId) => hashById.get(id);

      const result = filterUncardedSelection(selected, hashOf, knownHashes);

      for (const admitted of result.ids) {
        expect(knownHashes.has(hashOf(admitted)!)).toBe(false);
      }
      for (const excluded of result.excludedAsKnown) {
        expect(knownHashes.has(hashOf(excluded)!)).toBe(true);
      }
      // Partition property: admitted + excluded === selected, disjoint, no drops/dupes.
      expect(result.ids.size + result.excludedAsKnown.length).toBe(selected.size);
      const excludedSet = new Set(result.excludedAsKnown);
      for (const id of selected) {
        expect(result.ids.has(id as UncardedNodeId) || excludedSet.has(id)).toBe(true);
      }
    });
  }
});
