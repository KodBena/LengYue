/**
 * tests/unit/composables/tree-review-marker.test.ts
 *
 * Tier-1 (pure logic) coverage for `isReviewStartNode`
 * (`src/composables/forest/tree-review-marker.ts`) — the derivation
 * behind `TreeWidget`'s "review start" marker (wanted-feature 4,
 * ledger row 524's re-adjudicated build). No DOM, no store, no Vue
 * reactivity: plain `NodeId`/`null`/`undefined` inputs to a boolean
 * output, mirroring the `logic.test.ts` shape this tier is named for.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { isReviewStartNode } from '../../../src/composables/forest/tree-review-marker';
import type { NodeId } from '../../../src/types';

const NODE_A = 'node-a' as NodeId;
const NODE_B = 'node-b' as NodeId;

describe('isReviewStartNode', () => {
  it('is true when the node id matches the active review session\'s starting node', () => {
    expect(isReviewStartNode(NODE_A, NODE_A)).toBe(true);
  });

  it('is false when the node id differs from the starting node', () => {
    expect(isReviewStartNode(NODE_A, NODE_B)).toBe(false);
  });

  it('is false when no review session is active (startNodeId is null)', () => {
    expect(isReviewStartNode(NODE_A, null)).toBe(false);
  });

  it('is false when startNodeId is undefined (prop omitted)', () => {
    expect(isReviewStartNode(NODE_A, undefined)).toBe(false);
  });

  it('marks exactly one node true across a set — a card has exactly one start', () => {
    const nodes = [NODE_A, NODE_B, 'node-c' as NodeId];
    const matches = nodes.filter(id => isReviewStartNode(id, NODE_B));
    expect(matches).toEqual([NODE_B]);
  });
});
