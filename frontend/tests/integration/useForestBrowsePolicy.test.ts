/**
 * tests/integration/useForestBrowsePolicy.test.ts
 *
 * Tier-3 tests for the Forest Directory browse policy's review-ownership
 * gate. The per-board card-tree slot has two producers — the review session
 * (`seedFromQueue`) and this browse policy. The gate is the arbitration that
 * keeps a null/absent navigator selection from clearing a slot a running
 * review owns (the card-metadata-during-review bug): tabbing the cards tab
 * away and back remounts ForestDirectory, re-firing the policy's
 * `immediate: true` watch with a null selection; without the gate that clear
 * wiped the review forest `seedFromQueue` had restored.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi } from 'vitest';
import { ref, computed, nextTick, type Ref } from 'vue';
import { withSetup } from './with-setup';
import { useForestBrowsePolicy } from '../../src/composables/forest/useForestBrowsePolicy';
import type { ForestNavigation } from '../../src/composables/forest/useForestNavigation';
import type { CardTreeData } from '../../src/composables/cards/useCardTreeData';
import type { CardId, NavSelection } from '../../src/types';

// Partial fakes: the policy reads only `nav.selection` / `nav.nodes` and calls
// `tree.clearBrowse` / `loadBrowse` / `loadBrowseForest`. The casts expose
// exactly that subset; the rest of each interface is unused here (ADR-0002 —
// the cast is justified by the policy's actual surface, which the tests pin).
function makeNav(selection: Ref<NavSelection | null>): ForestNavigation {
  return {
    selection: computed(() => selection.value),
    nodes: computed(() => []),
  } as unknown as ForestNavigation;
}

function makeTree() {
  return {
    clearBrowse: vi.fn(),
    loadBrowse: vi.fn(async () => {}),
    loadBrowseForest: vi.fn(async () => {}),
  };
}

function runPolicy(
  tree: ReturnType<typeof makeTree>,
  selection: Ref<NavSelection | null>,
  isReviewActive: Ref<boolean>,
): void {
  withSetup(() =>
    useForestBrowsePolicy(
      makeNav(selection),
      tree as unknown as CardTreeData,
      ref<string | null>(null),
      isReviewActive,
    ),
  );
}

describe('useForestBrowsePolicy — review-ownership gate', () => {
  it('does not clear the slot on a null selection while a review owns it', () => {
    const tree = makeTree();
    // immediate watch fires with sel=null and review active → slot left intact.
    runPolicy(tree, ref<NavSelection | null>(null), ref(true));
    expect(tree.clearBrowse).not.toHaveBeenCalled();
  });

  it('clears the slot on a null selection when no review is active (control)', () => {
    const tree = makeTree();
    runPolicy(tree, ref<NavSelection | null>(null), ref(false));
    expect(tree.clearBrowse).toHaveBeenCalledTimes(1);
  });

  it('clears once a review ends with the selection still null', async () => {
    const tree = makeTree();
    const isReviewActive = ref(true);
    runPolicy(tree, ref<NavSelection | null>(null), isReviewActive);
    expect(tree.clearBrowse).not.toHaveBeenCalled();

    isReviewActive.value = false; // review ends; the now-orphaned forest clears
    await nextTick();
    expect(tree.clearBrowse).toHaveBeenCalledTimes(1);
  });

  it('still loads an explicit selection during a review (gate guards only the null clear)', () => {
    const tree = makeTree();
    runPolicy(tree, ref<NavSelection | null>({ kind: 'root', rootCardId: 5 as CardId }), ref(true));
    expect(tree.loadBrowse).toHaveBeenCalledWith(5);
    expect(tree.clearBrowse).not.toHaveBeenCalled();
  });
});
