/**
 * tests/integration/useForestBrowsePolicy.test.ts
 *
 * Tier-3 tests for the Forest Directory browse policy. The policy translates
 * the navigator selection into a fetch/clear on the active board's card-tree
 * slot. Slot OWNERSHIP — which producer's content `clearBrowse` may clear —
 * lives in `useCardTreeData.clearBrowse` and is tested in
 * `useCardTreeData.test.ts`; here we pin only that the policy dispatches the
 * right call per selection kind.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi } from 'vitest';
import { ref, computed, type Ref } from 'vue';
import { withSetup } from './with-setup';
import { useForestBrowsePolicy } from '../../src/composables/forest/useForestBrowsePolicy';
import type { ForestNavigation } from '../../src/composables/forest/useForestNavigation';
import type { CardTreeData } from '../../src/composables/cards/useCardTreeData';
import type { CardId, GameSourceId, NavSelection } from '../../src/types';

// Partial fakes: the policy reads only `nav.selection` / `nav.nodes` and calls
// `tree.clearBrowse` / `loadBrowse` / `loadBrowseForest`. The casts expose
// exactly that subset (ADR-0002 — justified by the policy's actual surface).
function makeTree() {
  return {
    clearBrowse: vi.fn(),
    loadBrowse: vi.fn(async () => {}),
    loadBrowseForest: vi.fn(async () => {}),
  };
}
function makeNav(selection: Ref<NavSelection | null>, nodes: unknown[] = []): ForestNavigation {
  return {
    selection: computed(() => selection.value),
    nodes: computed(() => nodes),
  } as unknown as ForestNavigation;
}
function run(tree: ReturnType<typeof makeTree>, selection: Ref<NavSelection | null>, nodes: unknown[] = []): void {
  withSetup(() =>
    useForestBrowsePolicy(makeNav(selection, nodes), tree as unknown as CardTreeData, ref<string | null>(null)),
  );
}

describe('useForestBrowsePolicy — selection dispatch', () => {
  it('a null selection clears the right pane (clearBrowse)', () => {
    const tree = makeTree();
    run(tree, ref<NavSelection | null>(null));
    expect(tree.clearBrowse).toHaveBeenCalledTimes(1);
    expect(tree.loadBrowse).not.toHaveBeenCalled();
  });

  it('a root selection single-loads via loadBrowse', () => {
    const tree = makeTree();
    run(tree, ref<NavSelection | null>({ kind: 'root', rootCardId: 5 as CardId }));
    expect(tree.loadBrowse).toHaveBeenCalledWith(5);
    expect(tree.clearBrowse).not.toHaveBeenCalled();
  });

  it('a game selection within the cap multi-loads via loadBrowseForest', () => {
    const tree = makeTree();
    const game = {
      kind: 'game',
      nodeId: 'game:1',
      gameSourceId: 1 as GameSourceId,
      roots: [{ rootCardId: 7 as CardId }, { rootCardId: 8 as CardId }],
    };
    run(tree, ref<NavSelection | null>({ kind: 'game', gameSourceId: 1 as GameSourceId }), [game]);
    expect(tree.loadBrowseForest).toHaveBeenCalledWith([7, 8]);
    expect(tree.clearBrowse).not.toHaveBeenCalled();
  });
});
