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
 *   - CROSS-BOARD ISOLATION (review REJECT finding 1, `.claude/dispatch-
 *     reports/card-position-highlight-stageB-review.md`): switching
 *     board tabs within the same debounce window must not merge two
 *     boards' pending NodeIds into one flush. Before the fix, a single
 *     flat `pending`/`latestState` pair meant `serializeActivePath`
 *     threw on the stale board's NodeIds (absent from the new board's
 *     `state.nodes`), failing the WHOLE batch call and silently
 *     dropping the CURRENTLY-VIEWED board's own highlights too — not
 *     just the stale board's. Each board's request must resolve
 *     independently.
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

describe('useNodePositionHashes — cross-board isolation (review finding 1)', () => {
  it('a board switch inside the debounce window does not corrupt EITHER board\'s flush', async () => {
    // The reviewer's own repro shape, ported: two distinct BoardState
    // objects, both requested through the SAME composable instance (as
    // TreeWidget's long-lived setup() does across a tab switch) within
    // one 150ms debounce window.
    const boardA = createInitialBoard();
    const boardB = createInitialBoard();
    const HASH_A = 'a'.repeat(64) as ContentHash;
    const HASH_B = 'b'.repeat(64) as ContentHash;
    fakeBackendService.hashPositionsBatch.mockImplementation(async (rawContents: string[]) => {
      // Each board's root serializes to a distinct raw SGF string (a
      // fresh UUID-suffixed clientGameId doesn't affect serialization,
      // but the two calls are still distinguished by call order here).
      return rawContents.map(() =>
        fakeBackendService.hashPositionsBatch.mock.calls.length === 1 ? HASH_A : HASH_B,
      );
    });

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([boardA.rootNodeId], boardA); // user is on board A...
    requestHashFill([boardB.rootNodeId], boardB); // ...then switches to board B, still within 150ms
    await vi.advanceTimersByTimeAsync(150);

    // The CURRENTLY-VIEWED board (B) must not silently lose its
    // highlight fill because A's stale NodeId was still pending — this
    // is the exact failure the review's finding 1 describes: before the
    // fix, `serializeActivePath` throws on A's NodeId (absent from B's
    // `state.nodes` once `latestState` was clobbered to B), which fails
    // the WHOLE flush and leaves B's own root uncached too.
    expect(getCachedNodeHash(boardB.rootNodeId)).toBeDefined();
    expect(getCachedNodeHash(boardA.rootNodeId)).toBeDefined();
    // No spurious failure notice — both boards resolved cleanly.
    expect(store.engine.messages.length).toBe(0);
  });

  it('two boards requested in the same tick produce two separate single-item batch calls, not one merged call', async () => {
    // Fresh boards serialize to IDENTICAL raw content (same default
    // properties, no moves), so this test distinguishes the two boards
    // by CALL SHAPE (each call carries exactly one item) rather than by
    // parsing the SGF back out — a merged flush would instead produce
    // one call with two items (or, pre-fix, throw before any call).
    const boardA = createInitialBoard();
    const boardB = createInitialBoard();
    fakeBackendService.hashPositionsBatch.mockImplementation(
      async (rawContents: string[]) => rawContents.map(() => 'a'.repeat(64) as ContentHash),
    );

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([boardA.rootNodeId], boardA);
    requestHashFill([boardB.rootNodeId], boardB);
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(2);
    for (const call of fakeBackendService.hashPositionsBatch.mock.calls) {
      expect(call[0]).toHaveLength(1); // each board's own flush, never merged
    }
    expect(getCachedNodeHash(boardA.rootNodeId)).toBeDefined();
    expect(getCachedNodeHash(boardB.rootNodeId)).toBeDefined();
  });
});
