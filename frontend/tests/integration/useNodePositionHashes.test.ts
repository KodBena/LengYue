/**
 * tests/integration/useNodePositionHashes.test.ts
 *
 * Tier-3 composable-integration coverage for the Stage B fill-
 * orchestration composable
 * (`src/composables/cards/useNodePositionHashes.ts`;
 * `.claude/dispatch-reports/card-position-annotations-design.md`,
 * §5 "Cost at 250+ nodes"). Drives `requestHashFill` against
 * `fakeBackendService.hashPositionsBatch` (the `POST
 * /positions/hash-batch` boundary) and the REAL node-position-hashes
 * state module.
 *
 * Pinned behaviours:
 *   - Requests debounce/coalesce: several `requestHashFill` calls within
 *     the 150ms window produce exactly ONE `hashPositionsBatch` call
 *     covering the union of requested NodeIds.
 *   - Already-cached NodeIds are excluded from the batch (no redundant
 *     re-request — the "repeated re-render triggers zero additional
 *     calls" acceptance handle from the design's §6 Stage-B criteria).
 *   - A successful flush caches every returned hash, index-aligned.
 *   - A failed flush caches NOTHING (ADR-0002 failure honesty — no
 *     stale/partial cache write) and surfaces exactly ONE
 *     `pushSystemMessage('warning', ...)` notice even across several
 *     failing debounce windows (the "surfaces once" throttle); a later
 *     SUCCESSFUL flush resets the throttle so a fresh failure notifies
 *     again.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { useNodePositionHashes } from '../../src/composables/cards/useNodePositionHashes';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import {
  getCachedNodeHash,
  purgeAllNodeHashes,
  cacheNodeHash,
} from '../../src/state/node-position-hashes';
import { store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import type { ContentHash } from '../../src/types';

const HASH_ROOT = 'a'.repeat(64) as ContentHash;

beforeEach(() => {
  vi.useFakeTimers();
  resetFakeBackendService();
  purgeAllNodeHashes();
  store.engine.messages.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNodePositionHashes — debounce / coalesce', () => {
  it('several requestHashFill calls within the debounce window produce one batch call', async () => {
    const board = createInitialBoard();
    fakeBackendService.hashPositionsBatch.mockResolvedValue([HASH_ROOT]);

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    requestHashFill([board.rootNodeId], board); // same id, still pending — no-op re-add
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(1);
    expect(getCachedNodeHash(board.rootNodeId)).toBe(HASH_ROOT);
  });

  it('does not request a NodeId whose hash is already cached', async () => {
    const board = createInitialBoard();
    cacheNodeHash(board.rootNodeId, HASH_ROOT);

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).not.toHaveBeenCalled();
  });
});

describe('useNodePositionHashes — failure honesty (ADR-0002)', () => {
  it('a failed batch call caches nothing and surfaces exactly one notice', async () => {
    const board = createInitialBoard();
    fakeBackendService.hashPositionsBatch.mockRejectedValue(new Error('network down'));

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);

    expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined();
    expect(store.engine.messages.length).toBe(1);
    expect(store.engine.messages[0]?.type).toBe('warning');
  });

  it('does not re-notify across repeated failing windows, but does after a recovery', async () => {
    const board = createInitialBoard();
    fakeBackendService.hashPositionsBatch.mockRejectedValue(new Error('still down'));

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);
    expect(store.engine.messages.length).toBe(1); // first failure notifies

    // A second, still-uncached node fails in a later window — still
    // within the same unresolved episode, so no second notice. (Reuses
    // rootNodeId — the cache write never happened, so it's still a
    // valid "uncached" request.)
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);
    expect(store.engine.messages.length).toBe(1); // throttled

    // Recovery: a successful flush resets the throttle.
    fakeBackendService.hashPositionsBatch.mockResolvedValueOnce([HASH_ROOT]);
    purgeAllNodeHashes(); // undo the successful cache write so the next request isn't skipped
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);
    expect(store.engine.messages.length).toBe(1); // unchanged — this window succeeded
    expect(getCachedNodeHash(board.rootNodeId)).toBe(HASH_ROOT);

    // A fresh failure after the recovery notifies again.
    purgeAllNodeHashes();
    fakeBackendService.hashPositionsBatch.mockRejectedValue(new Error('down again'));
    requestHashFill([board.rootNodeId], board);
    await vi.advanceTimersByTimeAsync(150);
    expect(store.engine.messages.length).toBe(2);
  });
});
