/**
 * tests/integration/useAnalysisTimeline-branch-range-memory.test.ts
 *
 * Tier-3 (composable integration) tests for the branch-range-memory fix
 * to `useAnalysisTimeline` (design proposal §1, Candidate C;
 * commissioner adjudication, ledger rows 112/119): the analysis-chart
 * selection range is now keyed per branch-stem
 * (`BranchRangeKey` — `composables/analysis/branch-range-key.ts`) via
 * `BoardState.analysisRanges`, instead of a single per-board slot.
 *
 * Drives `useAnalysisTimeline` against a real store + real navigator +
 * a forked fixture tree (two variations from a common fork node),
 * switching the active branch via `mutateBoard` + `navigateTo` — the
 * production path a tree-widget click drives.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Mock the persistence + analysis services to keep resetWorkspace and
// analyzeSelection off the network — same preamble as
// useAnalysisProjection.test.ts.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { navigateTo } from '../../src/engine/navigator';
import { useVariationPath } from '../../src/composables/board/useVariationPath';
import { useAnalysisTimeline } from '../../src/composables/analysis/useAnalysisTimeline';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, NodeId } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
});

function setup(source: string): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return { boardId: board.id, board };
}

/** Node ids, in tree order, keyed by the move property that placed them. */
function findNodeByMove(board: BoardState, sgfCoordProp: 'B' | 'W', value: string): NodeId {
  for (const node of Object.values(board.nodes)) {
    if (node.properties[sgfCoordProp]?.[0] === value) return node.id;
  }
  throw new Error(`no node found for ${sgfCoordProp}[${value}]`);
}

// Two branches forking after B[pd];W[dp]: variation 0 (mainline, index
// order = SGF appearance order) continues B[pp];W[dd]; variation 1
// continues B[cc];W[ce]. `activeChildIndex` defaults to 0 at load, so
// the fixture starts on branch A (the B[pp]/W[dd] line).
const FORKED_SGF =
  '(;FF[4]GM[1]SZ[19];B[pd];W[dp](;B[pp];W[dd])(;B[cc];W[ce]))';

describe('useAnalysisTimeline — branch-range memory (Candidate C keying)', () => {
  it('a range set on branch A is unaffected by visiting branch B and is restored exactly on return to A', async () => {
    // This is the defect-foreclosing test: it fails if the keying is
    // removed (i.e. reverting to the single-slot `analysisRange`
    // behavior clamps/clobbers branch A's range on the switch to B).
    const { boardId, board } = setup(FORKED_SGF);
    const variationPath = useVariationPath(() => boardId);
    const timeline = withSetup(() => useAnalysisTimeline(variationPath, boardId));
    await flushPromises(); // settle the immediate-watch default seed for branch A

    // Starts on branch A (B[pp];W[dd]) — path length 5 (root + 4 plies).
    expect(variationPath.value).toHaveLength(5);

    // Set a custom range on branch A.
    timeline.setSelectionRange([1, 3] as [any, any]);
    expect(timeline.selectionRange.value).toEqual([1, 3]);

    // Switch to branch B: navigate to a node on the B[cc];W[ce] line.
    const ceNodeId = findNodeByMove(board, 'W', 'ce');
    mutateBoard(boardId, draft => navigateTo(draft, ceNodeId));
    await flushPromises(); // settle the (branch-key, length) watch's reseed for B

    // Branch B has never been visited — it gets its own default
    // fit-to-path range, NOT branch A's clamped-down [1,3].
    expect(variationPath.value).toHaveLength(5);
    expect(timeline.selectionRange.value).toEqual([0, 4]);

    // Switch back to branch A.
    const ddNodeId = findNodeByMove(board, 'W', 'dd');
    mutateBoard(boardId, draft => navigateTo(draft, ddNodeId));
    await flushPromises();

    // Branch A's custom range is restored exactly — it was never
    // touched while B was active.
    expect(timeline.selectionRange.value).toEqual([1, 3]);
  });

  it('extending the mainline (no fork revisited) preserves the prior range, clamped (regression guard)', async () => {
    const { boardId } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const variationPath = useVariationPath(() => boardId);
    const timeline = withSetup(() => useAnalysisTimeline(variationPath, boardId));
    await flushPromises();

    // Default fit-to-path seed over the initial 4-node path.
    expect(variationPath.value).toHaveLength(4);
    expect(timeline.selectionRange.value).toEqual([0, 3]);

    // Narrow the range by hand.
    timeline.setSelectionRange([1, 2] as [any, any]);
    expect(timeline.selectionRange.value).toEqual([1, 2]);

    // Extend the mainline by one more ply (single-child growth, no fork
    // ever touched — the branch key must stay unchanged). Extend from
    // the ACTIVE PATH's leaf (`variationPath`'s last element), not
    // `currentNodeId` — a fresh SGF load leaves the cursor at the root
    // (RootToCurrentPath and RootToLeafPath diverge exactly here; see
    // `types/game.ts`'s brand-pair doc comment).
    mutateBoard(boardId, draft => {
      const leafId = variationPath.value[variationPath.value.length - 1];
      const leaf = draft.nodes[leafId];
      const newId = 'w-dd' as NodeId;
      draft.nodes[newId] = {
        id: newId,
        parent: leafId,
        children: [],
        activeChildIndex: 0,
        properties: { W: ['dd'] },
        move: { x: 3, y: 3, color: 'W', type: 'place' },
      };
      leaf.children.push(newId);
      leaf.activeChildIndex = leaf.children.length - 1;
      draft.currentNodeId = newId;
    });
    await flushPromises();

    expect(variationPath.value).toHaveLength(5);
    // The prior [1,2] selection is preserved (still within bounds — no
    // clamp needed at either end since 2 < 5).
    expect(timeline.selectionRange.value).toEqual([1, 2]);
  });
});
