/**
 * tests/integration/useCardTreeData.test.ts
 *
 * Tier-3 tests for the card-tree slot's producer ownership. The slot has three
 * producers — the deck pipeline (`runPipeline`), the review session
 * (`seedFromQueue`), both stamping `source: 'matched'`, and the navigator
 * browse (`loadBrowse`/`loadBrowseForest`), stamping `source: 'browse'` — but
 * one clearer: the browse policy's null-selection `clearBrowse`. The fix is
 * that `clearBrowse` clears ONLY browse-owned content, so a slot a pipeline or
 * review owns survives the unmount/remount-driven null-clear (the forest
 * vanishing on tab-away/back, for BOTH card-metadata-during-review and
 * pipeline-preview). See `frontend/docs/notes/board-scope.md`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed } from 'vue';

// useCardTreeData imports the backend-service singleton at module load; the
// producers (not exercised here — we set the slot directly) are its only
// callers, so a stub surface keeps the test off the network.
vi.mock('../../src/services/backend-service', () => ({
  backendService: { fetchTreeByRoot: vi.fn(), queryForest: vi.fn(), resolveRoots: vi.fn() },
}));

import { withSetup } from './with-setup';
import { useCardTreeData } from '../../src/composables/cards/useCardTreeData';
import {
  getOrCreateBoardCardTree,
  clearAllBoardCardTrees,
  type ForestSource,
} from '../../src/composables/cards/board-card-trees';
import type { BoardId, CardLineageTree } from '../../src/types';

const BOARD = 'board-a' as BoardId;
const FAKE_TREE = { rootCardId: 1 } as unknown as CardLineageTree;

beforeEach(() => clearAllBoardCardTrees());

function seedSlot(source: ForestSource): void {
  const slot = getOrCreateBoardCardTree(BOARD);
  slot.forest = [FAKE_TREE];
  slot.source = source;
}

describe('useCardTreeData.clearBrowse — producer ownership', () => {
  it("does NOT clear a slot the pipeline/review owns ('matched')", () => {
    const tree = withSetup(() => useCardTreeData(computed(() => BOARD)));
    seedSlot('matched');
    tree.clearBrowse();
    // The null-selection clear leaves pipeline/review content intact — the fix.
    expect(getOrCreateBoardCardTree(BOARD).forest).toHaveLength(1);
    expect(getOrCreateBoardCardTree(BOARD).source).toBe('matched');
  });

  it("clears a browse-owned slot ('browse') and drops its ownership", () => {
    const tree = withSetup(() => useCardTreeData(computed(() => BOARD)));
    seedSlot('browse');
    tree.clearBrowse();
    expect(getOrCreateBoardCardTree(BOARD).forest).toHaveLength(0);
    expect(getOrCreateBoardCardTree(BOARD).source).toBeNull();
  });

  it('is a safe no-op on an empty (null-source) slot', () => {
    const tree = withSetup(() => useCardTreeData(computed(() => BOARD)));
    getOrCreateBoardCardTree(BOARD); // empty, source null
    expect(() => tree.clearBrowse()).not.toThrow();
    expect(getOrCreateBoardCardTree(BOARD).forest).toHaveLength(0);
  });
});
