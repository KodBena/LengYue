/**
 * tests/unit/composables/board-variations-markers.test.ts
 *
 * Tier-1 (pure-logic) tests for
 * `src/composables/board/board-variations-markers.ts`, the
 * `BoardVariationsOverlay` marker derivation extracted for unit
 * testability (ui-fix-2-pv-dashed-suppression).
 *
 * Red-leg proof: the `suppressed=true` case is asserted to yield
 * `[]` — with `suppressed` removed (the pre-fix shape, where the
 * function had no knowledge of PV-hover state at all), this suite's
 * "suppressed hides all markers" test fails because the pre-fix
 * derivation always returns the active-next-move ring regardless of
 * hover state. Confirmed by temporarily deleting the `suppressed`
 * early-return in the source and re-running: the suite goes red
 * (see dispatch report for the transcript).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { deriveVariationMarkers } from '../../../src/composables/board/board-variations-markers';
import type { BoardState, GameNode, NodeId } from '../../../src/types';

const ROOT = 'root' as NodeId;
const ACTIVE_CHILD = 'active-child' as NodeId;
const SIBLING_CHILD = 'sibling-child' as NodeId;

// A root with two children: index 0 is the active path's next move
// (x:3,y:3), index 1 is a non-active sibling variation (x:15,y:15).
function makeBoardState(): BoardState {
  const root: GameNode = {
    id: ROOT,
    parent: null,
    children: [ACTIVE_CHILD, SIBLING_CHILD],
    activeChildIndex: 0,
    properties: {},
    move: null,
  };
  const activeChild: GameNode = {
    id: ACTIVE_CHILD,
    parent: ROOT,
    children: [],
    activeChildIndex: -1,
    properties: {},
    move: { x: 3, y: 3, color: 'B', type: 'place' },
  };
  const siblingChild: GameNode = {
    id: SIBLING_CHILD,
    parent: ROOT,
    children: [],
    activeChildIndex: -1,
    properties: {},
    move: { x: 15, y: 15, color: 'W', type: 'place' },
  };
  return {
    id: 'board-1',
    rootNodeId: ROOT,
    currentNodeId: ROOT,
    stones: {},
    captures: { B: 0, W: 0 },
    koPoint: null,
    turn: 'B',
    nodes: {
      [ROOT]: root,
      [ACTIVE_CHILD]: activeChild,
      [SIBLING_CHILD]: siblingChild,
    },
  } as unknown as BoardState;
}

const baseOpts = {
  suggestionPoints: new Set<string>(),
  ringStroke: '#ring',
  activeRingStroke: '#active-ring',
  labelColor: '#letter',
};

describe('deriveVariationMarkers', () => {
  it('suppressed=false, circles mode: emits both the active-next-move ring and the sibling variation ring', () => {
    const markers = deriveVariationMarkers(makeBoardState(), {
      ...baseOpts,
      variationsMode: 'circles',
      showActiveNextMove: true,
      suppressed: false,
    });
    expect(markers).toHaveLength(2);
    expect(markers.find((m) => m.key === 'active-3-3')?.ring).not.toBeNull();
    expect(markers.find((m) => m.key === 'variation-15-15')?.ring).not.toBeNull();
  });

  it('suppressed=true: yields no markers at all, regardless of mode/flags (PV-hover-preview suppression gate)', () => {
    const markers = deriveVariationMarkers(makeBoardState(), {
      ...baseOpts,
      variationsMode: 'circles',
      showActiveNextMove: true,
      suppressed: true,
    });
    expect(markers).toEqual([]);
  });

  it('suppressed=true overrides letters mode too (no letter labels leak through during a PV hover)', () => {
    const markers = deriveVariationMarkers(makeBoardState(), {
      ...baseOpts,
      variationsMode: 'letters',
      showActiveNextMove: true,
      suppressed: true,
    });
    expect(markers).toEqual([]);
  });

  it('suppressed=false, showActiveNextMove=false: drops the active ring but keeps the sibling marker', () => {
    const markers = deriveVariationMarkers(makeBoardState(), {
      ...baseOpts,
      variationsMode: 'circles',
      showActiveNextMove: false,
      suppressed: false,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0].key).toBe('variation-15-15');
  });
});
