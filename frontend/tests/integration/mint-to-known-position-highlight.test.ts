/**
 * tests/integration/mint-to-known-position-highlight.test.ts
 *
 * The Stage B "mint -> highlight appears" acceptance handle
 * (`.claude/dispatch-reports/card-position-annotations-design.md`,
 * §6 Stage-B criteria; commission row 525's TESTS section: "integration
 * test (mint->highlight-appears)"). Wires the three Stage-A/B pieces
 * end to end at the composable layer — `useMinting.commitMint`
 * (Stage A, records known-positions), `useNodePositionHashes.
 * requestHashFill` (Stage B, fills the per-node hash cache), and
 * `useKnownPositionNodes.activeBoardKnownPositionNodeIds` (Stage B,
 * the derived Set TreeWidget's marker prop consumes) — without
 * mounting TreeWidget itself (component-level DOM tests are out of
 * scope per `frontend/tests/CLAUDE.md`; the live Playwright witness
 * covers the actual rendered marker).
 *
 * Scenario: a board's root node is hashed (Stage B fill) BEFORE any
 * card exists at that position — the highlight set correctly excludes
 * it. A mint against the identical content then lands (Stage A,
 * `commitMint`), and the SAME already-cached node — with no re-fetch
 * of its hash — becomes part of the highlight set purely because
 * known-positions gained the entry. This is the "reactive to mint...
 * without reload" contract named in the commission.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { useMinting } from '../../src/composables/review/useMinting';
import { useNodePositionHashes } from '../../src/composables/cards/useNodePositionHashes';
import { useKnownPositionNodes } from '../../src/composables/board/useKnownPositionNodes';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { purgeKnownPositions } from '../../src/state/known-positions';
import { purgeAllNodeHashes } from '../../src/state/node-position-hashes';
import { store, addBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import type { CardCreatePayload, ContentHash } from '../../src/types';

const POSITION_HASH = 'c'.repeat(64) as ContentHash;
const RAW_CONTENT = '(;FF[4]SZ[19];B[pd])';

beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspace();
  resetFakeBackendService();
  purgeKnownPositions();
  purgeAllNodeHashes();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mint -> known-position highlight (Stage A + Stage B wiring)', () => {
  it('a node hashed before any matching card exists is excluded, then included once the mint lands', async () => {
    const board = createInitialBoard();
    addBoard(board);

    // Stage B: the tree-node fill runs first (TreeWidget's viewport-driven
    // watcher would have already asked for this node's hash by the time
    // the user opens the mint dialog on it).
    fakeBackendService.hashPositionsBatch.mockResolvedValue([POSITION_HASH]);
    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    // No card owns this position yet — excluded even though the hash is cached.
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);

    // Stage A: the user mints a card from the identical content.
    const NEW_CARD_ID = 123;
    fakeBackendService.createCard.mockResolvedValue(NEW_CARD_ID);
    fakeBackendService.hashPosition.mockResolvedValue(POSITION_HASH);
    const { commitMint } = useMinting();
    const payload: CardCreatePayload = {
      raw_content: RAW_CONTENT,
      num_moves: 2,
      tags: [],
      grading_parameter: { data: { default_visits: 1000 } },
      game_metadata: {},
    };
    await commitMint(payload);

    // The highlight appears WITHOUT any additional hash-batch call — the
    // node-position-hashes cache entry from the earlier fill is reused
    // unchanged; only known-positions gained an entry.
    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(1);
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);
  });

  it('deleting the known-position mapping removes the highlight without reload', async () => {
    const board = createInitialBoard();
    addBoard(board);

    fakeBackendService.hashPositionsBatch.mockResolvedValue([POSITION_HASH]);
    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);

    fakeBackendService.createCard.mockResolvedValue(456);
    fakeBackendService.hashPosition.mockResolvedValue(POSITION_HASH);
    const { commitMint } = useMinting();
    await commitMint({
      raw_content: RAW_CONTENT,
      num_moves: 2,
      tags: [],
      grading_parameter: { data: { default_visits: 1000 } },
      game_metadata: {},
    });

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);

    // "Deletion" surrogate — this codebase has no card-delete flow yet
    // (per card-hash-stageA-build.md's own "Known gaps" note); the
    // reactive-drop path known-positions actually exercises today is the
    // identity-flip purge, which this asserts drives the same "no reload
    // needed" behaviour the design's C-posture requires.
    purgeKnownPositions();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);
  });
});
