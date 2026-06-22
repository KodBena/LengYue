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

// ── Teardown-registry mocking (ADR-0012 dependency inversion) ─────────────────
// closeBoard / resetWorkspace no longer import the resource owners to drive
// their cleanup — each owner registers its teardown handler at module init and
// the store calls the registry (`runBoardCloseHandlers` /
// `runWorkspaceResetHandlers`). So a `vi.mock` that replaces an owner module
// wholesale ALSO removes that owner's registration (the mocked module body
// never runs), and closeBoard would then drive NO cleanup for that owner.
//
// To keep these behaviour tests pinning the per-owner cleanup calls, each
// owner-module mock factory below ALSO registers a delegating teardown handler
// (same label + TeardownOrder band as production) that calls the fake/spy. The
// real un-mocked owners (analysis-ledger, stability-trajectory-store,
// useReviewSession) self-register via their real module bodies when the
// `teardown-registrations` bootstrap loads them. The completeness assertions
// below pin that the FULL production label set is present and correctly
// ordered (a forgotten owner — real or faked — fails loudly), and the per-owner
// call assertions pin that closeBoard drives each handler. Factories register
// via dynamic `await import` because vi.mock factories cannot close over
// outer-scope bindings (hoisting).

// Service mocks (network boundaries).
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  const { registerBoardCloseHandler, registerWorkspaceResetHandler, TeardownOrder } =
    await import('../../src/store/teardown-registry');
  // Engine-stop — must run before the ledger purge (ENGINE_STOP < LEDGER_PURGE).
  registerBoardCloseHandler({
    label: 'analysis-service:stop',
    order: TeardownOrder.ENGINE_STOP,
    run: (boardId) => fakeAnalysisService.stopBoardAnalysis(boardId),
  });
  registerWorkspaceResetHandler({
    label: 'analysis:active-board-analyses',
    order: TeardownOrder.ENGINE_STOP,
    run: () => fakeAnalysisService.stopAllBoardAnalyses(),
  });
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  const { registerBoardCloseHandler, registerWorkspaceResetHandler } =
    await import('../../src/store/teardown-registry');
  registerBoardCloseHandler({
    label: 'analysis-persistence:discard',
    run: (boardId) =>
      fakeAnalysisPersistenceService
        .discard(boardId)
        .catch(() => { /* mirrors production's fire-and-forget swallow */ }),
  });
  registerWorkspaceResetHandler({
    label: 'analysis-bundle-summaries',
    run: () => fakeAnalysisPersistenceService.forgetAll(),
  });
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

// Composable-exported cleanup functions. Replace each with a
// vi.fn() spy; the registry's board-close / workspace-reset handlers call
// these, and the assertion is on call shape. Each factory registers its
// delegating handler (same labels/order as production).
vi.mock('../../src/composables/cards/useCardThumbnail', async () => {
  const { registerWorkspaceResetHandler } = await import('../../src/store/teardown-registry');
  const clearCardThumbnailCache = vi.fn();
  registerWorkspaceResetHandler({ label: 'card-thumbnails', run: () => clearCardThumbnailCache() });
  return { clearCardThumbnailCache, getCardThumbnailSync: vi.fn(() => '') };
});

// The board-thumbnail purge surface lives in its owner module
// (thumbnail-render-resources.ts, the render-lifecycle consolidation).
vi.mock('../../src/composables/cards/thumbnail-render-resources', async () => {
  const { registerBoardCloseHandler, registerWorkspaceResetHandler } =
    await import('../../src/store/teardown-registry');
  const purgeBoardThumbnails = vi.fn();
  const purgeAllThumbnails = vi.fn();
  registerBoardCloseHandler({ label: 'thumbnails:purge-board', run: (boardId) => purgeBoardThumbnails(boardId) });
  registerWorkspaceResetHandler({ label: 'board-thumbnails', run: () => purgeAllThumbnails() });
  return { purgeBoardThumbnails, purgeAllThumbnails };
});

vi.mock('../../src/composables/cards/board-card-trees', async () => {
  const { registerBoardCloseHandler, registerWorkspaceResetHandler } =
    await import('../../src/store/teardown-registry');
  const removeBoardCardTree = vi.fn();
  const clearAllBoardCardTrees = vi.fn();
  registerBoardCloseHandler({ label: 'board-card-trees:remove', run: (boardId) => removeBoardCardTree(boardId) });
  registerWorkspaceResetHandler({ label: 'board-card-trees', run: () => clearAllBoardCardTrees() });
  return {
    removeBoardCardTree,
    clearAllBoardCardTrees,
    getOrCreateBoardCardTree: vi.fn(),
    getBoardCardTree: vi.fn(() => null),
  };
});

// Load every owner so its teardown handler registers (real owners via their
// real module body; mocked owners via the factories above). Must precede the
// store import-driven mutators using the registry.
import '../../src/store/teardown-registrations';

import {
  store,
  addBoard,
  closeBoard,
  resetWorkspace,
  boardScopedStoreCellLabels,
} from '../../src/store';
import {
  registeredBoardCloseLabels,
  registeredWorkspaceResetLabels,
} from '../../src/store/teardown-registry';
import { createInitialBoard } from '../../src/store/board-factory';
import { defaultKnownTags } from '../../src/store/defaults';
import { ledger } from '../../src/state/analysis-ledger';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import {
  fakeAnalysisPersistenceService,
  resetFakeAnalysisPersistenceService,
  realServiceStorageThrow,
  seedFakeSummary,
} from '../fakes/analysis-persistence-service';
import type { AnalysisBundleSummary } from '../../src/services/analysis-bundle';
import { clearCardThumbnailCache } from '../../src/composables/cards/useCardThumbnail';
import {
  purgeBoardThumbnails,
  purgeAllThumbnails,
} from '../../src/composables/cards/thumbnail-render-resources';
import {
  removeBoardCardTree,
  clearAllBoardCardTrees,
} from '../../src/composables/cards/board-card-trees';
import type { BoardId, CardId, NavNodeId, NodeId } from '../../src/types';

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

    // Snapshot the closing board's node ids before the close: closeBoard
    // hands these to ledger.purgeNodes (the inverted per-board purge — the
    // ledger no longer reaches up into the store), so this is the load-
    // bearing assertion that the RIGHT nodes are passed.
    const closingNodeIds = Object.keys(second.nodes) as NodeId[];

    // Spy on the ledger's purgeNodes — it's a real module-scope
    // singleton; vi.spyOn lets us record the call without
    // replacing behaviour.
    const purgeNodesSpy = vi.spyOn(ledger, 'purgeNodes');

    closeBoard(second.id);

    // Service calls (audit O1, O13).
    expect(fakeAnalysisService.stopBoardAnalysis).toHaveBeenCalledWith(second.id);
    expect(purgeNodesSpy).toHaveBeenCalledWith(closingNodeIds);
    expect(fakeAnalysisPersistenceService.discard).toHaveBeenCalledWith(second.id);

    // Per-board dictionary delete (audit O2). O3 was the engine.activeMode
    // tombstone, removed with the activeMode projection (work-status item
    // drop-engine-activemode).
    expect(store.session.reviews[second.id]).toBeUndefined();

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

    purgeNodesSpy.mockRestore();
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
      store.session.ui.cardTreeNav[id] = { manuallyExpanded: [] };
      store.session.ui.forestNav.selection[id] = { kind: 'root', rootCardId: 1 as CardId };
    }

    closeBoard(b.id);

    // Every store cell for the closed board is gone.
    expect(store.session.reviews[b.id]).toBeUndefined();
    expect(store.session.ui.cardTreeNav[b.id]).toBeUndefined();
    expect(store.session.ui.forestNav.selection[b.id]).toBeUndefined();

    // The surviving board's cells are intact.
    expect(store.session.reviews[a]).toBeDefined();
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

    // status is preserved across the reset.
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

  it('resetWorkspace drives the registry path (every workspace-reset spy fires once)', () => {
    // NOTE: this suite mocks 5 owners and each mock factory re-registers a
    // delegating handler, so the registered LABEL SET here reflects the mocks,
    // not production — asserting the full set here would be CIRCULAR (it would
    // read back what the mocks wrote). The production-completeness guarantee
    // therefore lives in `teardown-registry-completeness.test.ts`, which loads
    // the REAL owners un-mocked. What is real HERE is that resetWorkspace runs
    // the registry and the registry drives each handler — proven by the spy
    // assertions in the resetWorkspace suite below (stopAllBoardAnalyses,
    // forgetAll, ledger.purgeAll, purgeAllThumbnails, clearCardThumbnailCache,
    // clearAllBoardCardTrees all fire once). This assertion pins that the
    // workspace-reset registry is non-empty and includes the engine-stop first,
    // i.e. the path is wired (a smoke check, not the completeness guarantee).
    const labels = [...registeredWorkspaceResetLabels()];
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toBe('analysis:active-board-analyses'); // ENGINE_STOP band runs first
  });
});

describe('closeBoard — teardown registry path (smoke; real completeness is in the un-mocked suite)', () => {
  // The COMPLETE board-close / workspace-reset registration sets — that every
  // real owner registers, with the right label and TeardownOrder band — are
  // pinned in `teardown-registry-completeness.test.ts` (un-mocked, against the
  // real owner modules). They CANNOT be pinned here: this suite vi.mocks 5
  // owners whose mock factories re-register delegating handlers, so the set
  // read back here is the mocks' set, not production's (a circular assertion;
  // out-of-frame audit 2026-06-22). What IS real here is that closeBoard runs
  // the registry and the registry drives each handler — the per-owner spy
  // assertions in the closeBoard suite above (stopBoardAnalysis, ledger.purgeNodes,
  // discard, purgeBoardThumbnails, removeBoardCardTree). This is the smoke check
  // that the board-close path is wired and engine-stop-ordered.
  it('the board-close registry is wired with the engine stop ordered first', () => {
    const labels = [...registeredBoardCloseLabels()];
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toBe('analysis-service:stop'); // ENGINE_STOP band runs first
    expect(labels.indexOf('analysis-service:stop')).toBeLessThan(
      labels.indexOf('analysis-ledger:purge'),
    );
  });
});

describe('closeBoard — persistence-service board-keyed drain (persistence-board-keyed-drain)', () => {
  // The analysis-persistence service holds three board-keyed reactive
  // Maps: `summaries`, `dirtyVersions`, `autoSaveErrors`. closeBoard's
  // teardown calls `discard(boardId)`, which routes the local release
  // through `forgetBoard` — draining all three for the closing board.
  // The 2026-06-11 debt second-opinion review found the prior shape
  // drained only `summaries`, leaking a number + a small POJO per
  // closed board until the next identity-flip `forgetAll`. These tests
  // pin the three-Map drain and its per-board precision.

  function aSummary(boardId: BoardId): AnalysisBundleSummary {
    return {
      boardId,
      recordCount: 7,
      storedScheme: 'json-projected-v1',
      storedByteSize: 1024,
      updatedAt: '2026-06-11T00:00:00Z',
      uncompressedByteSize: 2048,
      formatDescriptor: null,
    };
  }

  // A real storage-error shape (the same structural union the real
  // service throws), derived through the production parser so the
  // entry the fake holds matches what production would.
  const QUOTA_ERROR = realServiceStorageThrow(
    413,
    '{"detail":{"kind":"user_quota_exceeded","current_bytes":900,"quota_bytes":500,"detail":"quota full"}}',
  );

  it('drains all three board-keyed maps for the closed board', () => {
    const second = createInitialBoard();
    addBoard(second);

    // Populate every board-keyed map for the closing board.
    seedFakeSummary(second.id, aSummary(second.id));
    fakeAnalysisPersistenceService.markDirty(second.id);
    fakeAnalysisPersistenceService.markDirty(second.id);
    fakeAnalysisPersistenceService.setAutoSaveError(second.id, QUOTA_ERROR);

    // Sanity: all three are present before close.
    expect(fakeAnalysisPersistenceService.summaryFor(second.id)).toBeDefined();
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(second.id)).toBe(2);
    // Reactive-Map reads return a reactive proxy of the stored object,
    // so compare by value (toEqual), not reference (toBe).
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(second.id)).toEqual(QUOTA_ERROR);

    closeBoard(second.id);

    // discard() ran and drained all three (forgetBoard subsumed by it).
    expect(fakeAnalysisPersistenceService.discard).toHaveBeenCalledWith(second.id);
    expect(fakeAnalysisPersistenceService.summaryFor(second.id)).toBeUndefined();
    // Absent dirty entry reads back as 0 (the `?? 0` fallback), the
    // same as a board the service never saw.
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(second.id)).toBe(0);
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(second.id)).toBeUndefined();
  });

  it('leaves other boards\' entries intact when one board closes', () => {
    const a = store.boards[0].id;
    const b = createInitialBoard();
    addBoard(b);

    for (const id of [a, b.id]) {
      seedFakeSummary(id, aSummary(id));
      fakeAnalysisPersistenceService.markDirty(id);
      fakeAnalysisPersistenceService.setAutoSaveError(id, QUOTA_ERROR);
    }

    closeBoard(b.id);

    // The closed board's entries are gone.
    expect(fakeAnalysisPersistenceService.summaryFor(b.id)).toBeUndefined();
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(b.id)).toBe(0);
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(b.id)).toBeUndefined();

    // The surviving board's entries are untouched.
    expect(fakeAnalysisPersistenceService.summaryFor(a)).toBeDefined();
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(a)).toBe(1);
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(a)).toEqual(QUOTA_ERROR);
  });

  it('resetWorkspace still drains every board\'s entries via forgetAll (unchanged)', () => {
    const second = createInitialBoard();
    addBoard(second);

    for (const id of [store.boards[0].id, second.id]) {
      seedFakeSummary(id, aSummary(id));
      fakeAnalysisPersistenceService.markDirty(id);
      fakeAnalysisPersistenceService.setAutoSaveError(id, QUOTA_ERROR);
    }
    const ids = store.boards.map(b => b.id);

    resetWorkspace();

    // forgetAll fired (the registry drain) and cleared all three maps
    // for every board — the identity-flip path is unchanged.
    expect(fakeAnalysisPersistenceService.forgetAll).toHaveBeenCalledTimes(1);
    for (const id of ids) {
      expect(fakeAnalysisPersistenceService.summaryFor(id)).toBeUndefined();
      expect(fakeAnalysisPersistenceService.dirtyVersionFor(id)).toBe(0);
      expect(fakeAnalysisPersistenceService.autoSaveErrorFor(id)).toBeUndefined();
    }
  });
});
