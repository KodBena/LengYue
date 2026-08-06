/**
 * tests/unit/composables/analysis/branch-range-key.test.ts
 *
 * Tier-1 (pure-logic) tests for
 * `src/composables/analysis/branch-range-key.ts::deriveBranchRangeKey`
 * — the sole factory for `BranchRangeKey`, the branch-stem identity
 * analysis-range memory is keyed by (design proposal §1, Candidate C;
 * commissioner adjudication, ledger rows 112/119).
 *
 * Pure function of a `RootToLeafPath` and a node table; no DOM, no
 * fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { deriveBranchRangeKey } from '../../../../src/composables/analysis/branch-range-key';
import type { GameNode, NodeId, RootToLeafPath } from '../../../../src/types/game';

// Minimal GameNode fixture builder — only the fields deriveBranchRangeKey
// reads (`children`) are load-bearing; the rest are structurally required
// but not exercised.
function node(id: string, children: string[]): GameNode {
  return {
    id: id as NodeId,
    parent: null,
    children: children as NodeId[],
    activeChildIndex: 0,
    properties: {},
    move: null,
  };
}

function path(...ids: string[]): RootToLeafPath {
  return ids as NodeId[] as RootToLeafPath;
}

describe('deriveBranchRangeKey', () => {
  it('is empty for the empty path (no board resolved)', () => {
    expect(deriveBranchRangeKey(path(), {})).toBe('');
  });

  it('single-child nodes contribute nothing to the key', () => {
    // A straight mainline: root -> a -> b -> c, no node has more than
    // one child. Extending it further (still one child each) must not
    // change the key.
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['a']),
      a: node('a', ['b']),
      b: node('b', ['c']),
      c: node('c', []),
    } as unknown as Record<NodeId, GameNode>;

    const key = deriveBranchRangeKey(path('root', 'a', 'b', 'c'), nodes);
    expect(key).toBe('');

    // Extend the mainline by one more single-child node.
    const nodesExtended: Record<NodeId, GameNode> = {
      ...nodes,
      c: node('c', ['d']),
      d: node('d', []),
    } as unknown as Record<NodeId, GameNode>;
    const keyExtended = deriveBranchRangeKey(path('root', 'a', 'b', 'c', 'd'), nodesExtended);
    expect(keyExtended).toBe(key);
  });

  it('a fork choice changes the key from that point, and only from that point', () => {
    // root -> fork -> {left, right}; left -> leafL, right -> leafR.
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['fork']),
      fork: node('fork', ['left', 'right']),
      left: node('left', ['leafL']),
      right: node('right', ['leafR']),
      leafL: node('leafL', []),
      leafR: node('leafR', []),
    } as unknown as Record<NodeId, GameNode>;

    const keyLeft = deriveBranchRangeKey(path('root', 'fork', 'left', 'leafL'), nodes);
    const keyRight = deriveBranchRangeKey(path('root', 'fork', 'right', 'leafR'), nodes);

    expect(keyLeft).not.toBe(keyRight);
    expect(keyLeft).toBe('fork:left');
    expect(keyRight).toBe('fork:right');
  });

  it('two variation paths sharing a prefix before a fork produce keys that diverge only after the fork', () => {
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['a']),
      a: node('a', ['fork']),
      fork: node('fork', ['left', 'right']),
      left: node('left', []),
      right: node('right', []),
    } as unknown as Record<NodeId, GameNode>;

    const keyLeft = deriveBranchRangeKey(path('root', 'a', 'fork', 'left'), nodes);
    const keyRight = deriveBranchRangeKey(path('root', 'a', 'fork', 'right'), nodes);

    // The shared single-child prefix (root -> a -> fork) contributes
    // nothing; only the fork's own choice differs.
    expect(keyLeft).toBe('fork:left');
    expect(keyRight).toBe('fork:right');
  });

  it('is stable (deterministic) across repeated calls with the same path — cursor movement within a line does not change RootToLeafPath', () => {
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['fork']),
      fork: node('fork', ['left', 'right']),
      left: node('left', ['leaf']),
      right: node('right', []),
      leaf: node('leaf', []),
    } as unknown as Record<NodeId, GameNode>;

    const p = path('root', 'fork', 'left', 'leaf');
    const first = deriveBranchRangeKey(p, nodes);
    const second = deriveBranchRangeKey(p, nodes);
    const third = deriveBranchRangeKey(p, nodes);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).toBe('fork:left');
  });

  it('handles a fork deep in the line (near the leaf, not near the root)', () => {
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['a']),
      a: node('a', ['b']),
      b: node('b', ['fork']),
      fork: node('fork', ['x', 'y']),
      x: node('x', []),
      y: node('y', []),
    } as unknown as Record<NodeId, GameNode>;

    const key = deriveBranchRangeKey(path('root', 'a', 'b', 'fork', 'x'), nodes);
    expect(key).toBe('fork:x');
  });

  it('accumulates multiple decision points along one line, in order', () => {
    const nodes: Record<NodeId, GameNode> = {
      root: node('root', ['fork1']),
      fork1: node('fork1', ['a', 'b']),
      a: node('a', ['fork2']),
      fork2: node('fork2', ['c', 'd']),
      c: node('c', []),
      d: node('d', []),
      b: node('b', []),
    } as unknown as Record<NodeId, GameNode>;

    const key = deriveBranchRangeKey(path('root', 'fork1', 'a', 'fork2', 'c'), nodes);
    expect(key).toBe('fork1:a|fork2:c');
  });
});
