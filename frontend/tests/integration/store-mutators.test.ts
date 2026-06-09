/**
 * tests/integration/store-mutators.test.ts
 *
 * Tier-3 (composable / store integration) tests for the two
 * load-bearing workspace mutators in `src/store/index.ts` —
 * `closeBoard` and `resetWorkspace`. Both are the post-resource-
 * ownership-audit worked examples named in `frontend/CLAUDE.md`'s
 * §"Resource ownership at mutation sites"; their cleanup chains
 * are the canonical reference future contributors read before
 * extending either function or introducing a similar mutator.
 *
 * The audit pairs (O1–O13 in
 * `docs/notes/resource-ownership-audit-plan.md`) record each
 * external resource a board owns and the cleanup that releases
 * it on board close / identity flip. Bugs in this layer are
 * silent — a missed cleanup leaks the resource until the user
 * closes another tab / logs out, manifesting as
 * "store keeps growing" or, in the privacy-relevant pairs (O10,
 * O12), as cross-identity card-tree or card-thumbnail leakage.
 *
 * The tests below pin every cleanup-call wired into closeBoard
 * and resetWorkspace as a record-and-verify spy. The fakes /
 * vi.mocked module replacements are wired so the spies record
 * the call shape without invoking the real network or DOM
 * dependencies.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Service mocks (network boundaries).
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

// Composable-exported cleanup functions. Replace each with a
// vi.fn() spy; resetWorkspace and closeBoard call these as part
// of their cleanup chain, and the assertion is on call shape.
vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
  useThumbnailCache: () => ({
    getThumbnailSvg: vi.fn(),
    getVariationThumbnail: vi.fn(),
    getSync: vi.fn(),
    warmPath: vi.fn(),
  }),
}));

vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import {
  store,
  addBoard,
  closeBoard,
  resetWorkspace,
  identityScopedCacheLabels,
  boardScopedStoreCellLabels,
} from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { defaultKnownTags } from '../../src/store/defaults';
import { ledger } from '../../src/services/analysis-ledger';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import {
  fakeAnalysisPersistenceService,
  resetFakeAnalysisPersistenceService,
} from '../fakes/analysis-persistence-service';
import { clearCardThumbnailCache } from '../../src/composables/cards/useCardThumbnail';
import {
  purgeBoardThumbnails,
  purgeAllThumbnails,
} from '../../src/composables/cards/useThumbnailCache';
import {
  removeBoardCardTree,
  clearAllBoardCardTrees,
} from '../../src/composables/cards/board-card-trees';
import type { BoardId, CardId, NavNodeId } from '../../src/types';

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(clearCardThumbnailCache).mockReset();
  vi.mocked(purgeBoardThumbnails).mockReset();
  vi.mocked(purgeAllThumbnails).mockReset();
  vi.mocked(removeBoardCardTree).mockReset();
  vi.mocked(clearAllBoardCardTrees).mockReset();
  resetWorkspace();
  // Clear the post-reset baseline so per-test assertions are
  // honest. resetWorkspace itself fires every cleanup spy once.
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(clearCardThumbnailCache).mockReset();
  vi.mocked(purgeBoardThumbnails).mockReset();
  vi.mocked(purgeAllThumbnails).mockReset();
  vi.mocked(removeBoardCardTree).mockReset();
  vi.mocked(clearAllBoardCardTrees).mockReset();
});

describe('closeBoard — resource-ownership cleanup chain', () => {
  it('fires every per-board cleanup on the closing board\'s BoardId', () => {
    // Add a second board so closeBoard exercises the splice
    // branch (rather than the "last-board → spawn a fresh blank"
    // branch).
    const second = createInitialBoard();
    addBoard(second);

    // Pre-populate the per-board dictionaries so the deletes have
    // observable effects.
    store.session.reviews[second.id] = {
      status: 'IDLE',
      queue: [],
      currentIndex: -1,
      startingNodeId: null,
      userMovesCount: 0,
      userMoveScores: [],
      visitsOverride: null,
    };
    store.engine.activeMode[second.id] = 'none';

    // Spy on the ledger's purgeBoard — it's a real module-scope
    // singleton; vi.spyOn lets us record the call without
    // replacing behaviour.
    const purgeBoardSpy = vi.spyOn(ledger, 'purgeBoard');

    closeBoard(second.id);

    // Service calls (audit O1, O13).
    expect(fakeAnalysisService.stopBoardAnalysis).toHaveBeenCalledWith(second.id);
    expect(purgeBoardSpy).toHaveBeenCalledWith(second.id);
    expect(fakeAnalysisPersistenceService.discard).toHaveBeenCalledWith(second.id);

    // Per-board dictionary deletes (audit O2, O3).
    expect(store.session.reviews[second.id]).toBeUndefined();
    expect(store.engine.activeMode[second.id]).toBeUndefined();

    // Composable-exported cleanups (audit O4, O5, O12).
    // abortBoardReview is called via the real composable export;
    // its observable effect is the abort firing on the in-flight
    // wait — already covered in
    // useReviewSession.test.ts's "closeBoard fires …" path. Here
    // we focus on the spies that record specifically for closeBoard.
    expect(purgeBoardThumbnails).toHaveBeenCalledWith(second.id);
    expect(removeBoardCardTree).toHaveBeenCalledWith(second.id);

    // The board has been removed from store.boards.
    const remaining = store.boards.find(b => b.id === second.id);
    expect(remaining).toBeUndefined();

    purgeBoardSpy.mockRestore();
  });

  it('spawns a fresh blank board when closing the only remaining board', () => {
    // Default state has one board; close it and the last-board
    // branch fires: store.boards becomes [createInitialBoard()].
    const onlyBoard = store.boards[0];
    const onlyId: BoardId = onlyBoard.id;

    closeBoard(onlyId);

    expect(store.boards).toHaveLength(1);
    // The replacement is a fresh board, not the closed one — the
    // BoardId is freshly minted by createInitialBoard.
    expect(store.boards[0].id).not.toBe(onlyId);
    expect(store.activeBoardIndex).toBe(0);
  });

  it('decrements activeBoardIndex when closing a board before the cursor', () => {
    // Three boards: the default + two more. Set activeBoardIndex
    // to 2 (the third board). Closing the first should shift
    // activeBoardIndex down to 1.
    const second = createInitialBoard();
    const third = createInitialBoard();
    addBoard(second);
    addBoard(third);
    expect(store.boards).toHaveLength(3);
    store.activeBoardIndex = 2;

    closeBoard(store.boards[0].id);

    expect(store.boards).toHaveLength(2);
    expect(store.activeBoardIndex).toBe(1);
  });
});

describe('closeBoard — board-scoped store-cell registry (P1b)', () => {
  // The registry collapses the per-board store-cell deletes; these tests verify
  // it drains correctly + per-board and tripwire its coverage list. They do NOT
  // independently enumerate the store's per-board fields (TS can't), so they
  // catch a forgotten teardown only via the deliberate coverage-list update —
  // see frontend/docs/notes/board-scope.md (board-scope audit P1b).

  it('the board-scoped store-cell registry covers exactly the known cells', () => {
    // Fails the moment a per-board store cell is added to or removed from
    // BOARD_SCOPED_STORE_CELLS without a deliberate update here, so a teardown
    // can't be silently dropped (a tombstone leak) nor a cell un-registered.
    expect(boardScopedStoreCellLabels()).toEqual([
      'session.reviews',
      'engine.activeMode',
      'session.ui.cardTreeNav',
      'session.ui.forestNav.selection',
    ]);
  });

  it('closing one board clears every store cell for that board and only that board', () => {
    // Two boards, both with every per-board store cell populated.
    const a = store.boards[0].id;
    const b = createInitialBoard();
    addBoard(b);

    for (const id of [a, b.id]) {
      store.session.reviews[id] = {
        status: 'IDLE',
        queue: [],
        currentIndex: -1,
        startingNodeId: null,
        userMovesCount: 0,
        userMoveScores: [],
        visitsOverride: null,
      };
      store.engine.activeMode[id] = 'none';
      store.session.ui.cardTreeNav[id] = { manuallyExpanded: [] };
      store.session.ui.forestNav.selection[id] = { kind: 'root', rootCardId: 1 as CardId };
    }

    closeBoard(b.id);

    // Every store cell for the closed board is gone.
    expect(store.session.reviews[b.id]).toBeUndefined();
    expect(store.engine.activeMode[b.id]).toBeUndefined();
    expect(store.session.ui.cardTreeNav[b.id]).toBeUndefined();
    expect(store.session.ui.forestNav.selection[b.id]).toBeUndefined();

    // The surviving board's cells are intact.
    expect(store.session.reviews[a]).toBeDefined();
    expect(store.engine.activeMode[a]).toBe('none');
    expect(store.session.ui.cardTreeNav[a]).toEqual({ manuallyExpanded: [] });
    expect(store.session.ui.forestNav.selection[a]).toEqual({ kind: 'root', rootCardId: 1 });
  });

  it('closing a board never touches the workspace-global forestNav.expanded', () => {
    store.session.ui.forestNav.expanded = ['game:1' as NavNodeId];
    closeBoard(store.boards[0].id); // last board → spawns a fresh blank
    expect(store.session.ui.forestNav.expanded).toEqual(['game:1']);
  });
});

describe('resetWorkspace — identity-flip cleanup chain', () => {
  it('fires every workspace-wide cleanup once', () => {
    // Add a board and seed some state to verify the reset
    // actually clears it.
    const second = createInitialBoard();
    addBoard(second);
    store.session.reviews[second.id] = {
      status: 'AWAITING_MOVE',
      queue: [],
      currentIndex: -1,
      startingNodeId: null,
      userMovesCount: 5,
      userMoveScores: [0.1, 0.2, 0.3, 0.4, 0.5],
      visitsOverride: 800,
    };
    store.session.ui.showMoveSuggestions = false;

    const purgeAllSpy = vi.spyOn(ledger, 'purgeAll');

    resetWorkspace();

    // Service calls (audit O7, O13).
    expect(fakeAnalysisService.stopAllBoardAnalyses).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisPersistenceService.forgetAll).toHaveBeenCalledTimes(1);

    // Module-scope cache clears (audit O8, O9, O10, O12).
    expect(purgeAllSpy).toHaveBeenCalledTimes(1);
    expect(purgeAllThumbnails).toHaveBeenCalledTimes(1);
    expect(clearCardThumbnailCache).toHaveBeenCalledTimes(1);
    expect(clearAllBoardCardTrees).toHaveBeenCalledTimes(1);

    // Workspace state itself reset to a single fresh board.
    expect(store.boards).toHaveLength(1);
    expect(store.activeBoardIndex).toBe(0);
    expect(store.session.reviews).toEqual({});
    // The default-session UI shape is restored.
    expect(store.session.ui.showMoveSuggestions).toBe(true);

    purgeAllSpy.mockRestore();
  });

  it('preserves store.engine across the reset (intentional, see resetWorkspace docstring)', () => {
    // The docstring records that store.engine is intentionally
    // preserved: under today's local-machine deployment the WS
    // URL is not user-keyed, so the live KataGo connection
    // remains honestly applicable to any user.
    store.engine.status = 'connected';

    resetWorkspace();

    // status is preserved across the reset; the per-board
    // activeMode dictionary is wiped (it's keyed by BoardIds
    // belonging to the prior identity).
    expect(store.engine.status).toBe('connected');
  });
});

describe('resetWorkspace — tenancy: knownTags + the identity-scoped-cache registry', () => {
  it('re-seeds store.knownTags to defaults on identity-out (no prior-user dictionary leak)', () => {
    // Simulate the prior identity having a populated, non-default tag
    // dictionary; after the flip it must NOT carry into the next session.
    store.knownTags = ['prior-user-secret-tag', '$mistake'];

    resetWorkspace();

    expect(store.knownTags).toEqual(defaultKnownTags);
    // Fresh array identity (cloned, not the module-level default).
    expect(store.knownTags).not.toBe(defaultKnownTags);
  });

  it('the identity-scoped-cache registry covers exactly the known caches', () => {
    // The registry is the single place identity-scoped MODULE caches
    // register their clear; resetWorkspace drains it. This guard fails
    // the moment a cache is added to or removed from the registry
    // without a deliberate update here — so a clear can't be silently
    // dropped (a cross-tenant leak) nor a cache silently un-registered.
    const labels = identityScopedCacheLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        'analysis:active-board-analyses',
        'analysis-ledger',
        'stability-trajectories',
        'board-thumbnails',
        'card-thumbnails',
        'board-card-trees',
        'analysis-bundle-summaries',
      ]),
    );
    expect(labels).toHaveLength(7);
  });
});
