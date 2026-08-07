/**
 * tests/integration/useKnownPositionNodes.test.ts
 *
 * Tier-3 coverage for the Stage B composition-layer derivation
 * (`src/composables/board/useKnownPositionNodes.ts`;
 * `.claude/dispatch-reports/card-position-annotations-design.md`, §4)
 * — `activeBoardKnownPositionNodeIds`, the membership Set TreeWidget's
 * `knownPositionNodeIds` prop renders (mirrors
 * `usePlayVsEngine.test.ts`'s coverage of the sibling
 * `activeBoardGameHeadIds`).
 *
 * Pinned behaviours:
 *   - A node whose hash is cached AND known (present in
 *     known-positions) is in the set.
 *   - A node whose hash is cached but NOT known is absent.
 *   - A node whose hash is not yet cached is absent (not "known-false"
 *     — see the composable's header on the "fill lazily" posture).
 *   - The Set updates reactively when a later fill lands
 *     (node-position-hashes gains an entry) or when known-positions
 *     changes (a mint / purge), with no re-fetch required — this is
 *     the "reactive to mint/delete without reload" acceptance handle.
 *   - No active board -> undefined.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { useKnownPositionNodes } from '../../src/composables/board/useKnownPositionNodes';
import { store, addBoard, resetWorkspace } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { cacheNodeHash, purgeAllNodeHashes } from '../../src/state/node-position-hashes';
import { recordKnownPosition, purgeKnownPositions } from '../../src/state/known-positions';
import type { CardId, ContentHash } from '../../src/types';

const HASH_KNOWN = 'a'.repeat(64) as ContentHash;
const HASH_UNKNOWN = 'b'.repeat(64) as ContentHash;
const CARD_1 = 1 as CardId;

beforeEach(() => {
  resetWorkspace();
  purgeAllNodeHashes();
  purgeKnownPositions();
});

describe('useKnownPositionNodes — activeBoardKnownPositionNodeIds', () => {
  it('is undefined with no active board', () => {
    // resetWorkspace() always leaves at least one default board open (the
    // app's deployment model — see resetWorkspace's own docstring); the
    // "no active board" state is represented directly here.
    store.boards = [];
    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value).toBeUndefined();
  });

  it('includes a node whose cached hash is a known position', () => {
    const board = createInitialBoard();
    addBoard(board);
    cacheNodeHash(board.rootNodeId, HASH_KNOWN);
    recordKnownPosition(HASH_KNOWN, CARD_1);

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);
  });

  it('excludes a node whose cached hash is NOT a known position', () => {
    const board = createInitialBoard();
    addBoard(board);
    cacheNodeHash(board.rootNodeId, HASH_UNKNOWN);
    // known-positions has no entry for HASH_UNKNOWN.

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);
  });

  it('excludes a node whose hash has not been fetched yet (absent, not known-false)', () => {
    const board = createInitialBoard();
    addBoard(board);
    // No cacheNodeHash call — the fill hasn't landed.
    recordKnownPosition(HASH_KNOWN, CARD_1); // even if this WOULD match once fetched

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);
  });

  it('updates reactively when a later fill lands (no re-fetch of this computed)', () => {
    const board = createInitialBoard();
    addBoard(board);
    recordKnownPosition(HASH_KNOWN, CARD_1);

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);

    cacheNodeHash(board.rootNodeId, HASH_KNOWN); // the fill "lands"
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);
  });

  it('updates reactively when known-positions changes (mint) with no reload', () => {
    const board = createInitialBoard();
    addBoard(board);
    cacheNodeHash(board.rootNodeId, HASH_KNOWN);

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);

    recordKnownPosition(HASH_KNOWN, CARD_1); // "mint" — this position is now owned
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);
  });

  it('updates reactively when known-positions is purged (identity-flip / delete-equivalent)', () => {
    const board = createInitialBoard();
    addBoard(board);
    cacheNodeHash(board.rootNodeId, HASH_KNOWN);
    recordKnownPosition(HASH_KNOWN, CARD_1);

    const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(true);

    purgeKnownPositions();
    expect(activeBoardKnownPositionNodeIds.value?.has(board.rootNodeId)).toBe(false);
  });
});
