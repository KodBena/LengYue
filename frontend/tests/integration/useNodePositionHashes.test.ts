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
 *   - EVICTION ON BOARD CLOSE (re-review REJECT, eviction gap,
 *     `.claude/dispatch-reports/card-position-highlight-stageB-rereview.md`
 *     §3): a board closed mid-debounce must not resurrect a purged
 *     `node-position-hashes.ts` cache entry when its orphaned timer (or
 *     an in-flight fetch already past its `await`) later resolves.
 *     Ported from the re-reviewer's own fake-timer probe.
 *   - CHUNKED FLUSH (ledger row 637, `.claude/dispatch-reports/hash-
 *     batch-chunking-fix.md`): a pending set over `HASH_BATCH_MAX_ITEMS`
 *     (200, mirroring backend `config.POSITIONS_HASH_BATCH_MAX`) is
 *     split into `ceil(N/200)` sequential `hashPositionsBatch` calls,
 *     each correctly partitioned. A chunk that fails leaves every
 *     EARLIER chunk's results cached (they're correct), fires the
 *     existing once-per-episode notice, and stops the loop; a later
 *     fill naturally retries only the still-uncached gap. A board close
 *     mid-sequence stops the loop (no further chunks issued) and
 *     discards results the same way the single-request eviction guard
 *     already did.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

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
import { store, closeBoard, addBoard } from '../../src/store';
import { createInitialBoard, asNodeId, uuid } from '../../src/store/board-factory';
import type { BoardState, ContentHash, NodeId } from '../../src/types';

const HASH_ROOT = 'a'.repeat(64) as ContentHash;

// Mirrors the composable's own HASH_BATCH_MAX_ITEMS (not exported —
// module-private by design; this constant is the test's own
// independent statement of the same cap, so a drift between the two
// shows up as a test failure rather than a tautology).
const HASH_BATCH_MAX_ITEMS = 200;

// Extends `board` with `count` extra nodes, all direct children of the
// root, so `serializeActivePath`/`getPath` resolves each one (a short
// root->node path) without needing a deep chain. Returns the full list
// of NodeIds (root included) available to request hashes for.
function addSiblingNodes(board: BoardState, count: number): NodeId[] {
  const ids: NodeId[] = [board.rootNodeId];
  const root = board.nodes[board.rootNodeId];
  for (let i = 0; i < count; i++) {
    const id = asNodeId('sib-' + uuid());
    board.nodes[id] = {
      id,
      parent: board.rootNodeId,
      children: [],
      activeChildIndex: 0,
      properties: {},
      move: { color: i % 2 === 0 ? 'B' : 'W', type: 'pass', x: 0, y: 0 },
    };
    root.children.push(id);
    ids.push(id);
  }
  return ids;
}

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

describe('useNodePositionHashes — eviction on board close (re-review REJECT, eviction gap)', () => {
  it('cancels the pending debounce timer on close, so it never fires and never resurrects the purged cache entry', async () => {
    // Ported from the re-reviewer's own probe
    // (`.claude/dispatch-reports/card-position-highlight-stageB-rereview.md`
    // §3): a board closed WHILE its fill is still inside the 150ms
    // debounce window must not have its orphaned timer later write back
    // into the (already purged) node-position-hashes.ts cache.
    const board = createInitialBoard();
    addBoard(board);
    fakeBackendService.hashPositionsBatch.mockResolvedValue([HASH_ROOT]);

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);

    closeBoard(board.id); // purgeBoardNodeHashes runs synchronously, board still in store.boards
    expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined(); // confirmed purged

    await vi.advanceTimersByTimeAsync(150); // the debounce window elapses

    // RED (pre-fix) behaviour: the orphaned timer fires, flush() runs
    // against the detached-but-intact BoardState, and cacheNodeHash
    // resurrects the entry. GREEN (post-fix): the board-close handler
    // cancelled the timer, so it never fires at all.
    expect(fakeBackendService.hashPositionsBatch).not.toHaveBeenCalled();
    expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined();
  });

  it('discards an in-flight fetch\'s result for a board that closed while the fetch was outstanding (in-flight variant)', async () => {
    // The disclosed gap's async-landing half: `clearTimeout` alone
    // cannot reach a fetch already past its `await` when the board
    // closes. The `flush` continuation must itself notice the board is
    // gone and discard the result rather than caching it.
    const board = createInitialBoard();
    addBoard(board);
    let resolveBatch!: (hashes: ContentHash[]) => void;
    fakeBackendService.hashPositionsBatch.mockImplementation(
      () => new Promise<ContentHash[]>((resolve) => { resolveBatch = resolve; }),
    );

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill([board.rootNodeId], board);

    await vi.advanceTimersByTimeAsync(150); // debounce fires; flush() is now awaiting the fetch
    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(1);

    closeBoard(board.id); // purge runs; perBoard's entry for this board is dropped mid-flight
    expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined();

    resolveBatch([HASH_ROOT]); // the in-flight fetch lands AFTER the board closed
    await flushPromises();

    // Must STAY purged — the landing guard in `flush` discards the
    // late result instead of writing it back into a closed board's slot.
    expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined();
  });
});

describe('useNodePositionHashes — chunked flush (ledger row 637)', () => {
  it('a fill over HASH_BATCH_MAX_ITEMS issues ceil(N/200) requests with correct partitioning and all results cached', async () => {
    // 250 total ids (root + 249 siblings) -> ceil(250/200) = 2 chunks:
    // 200 + 50. Before this fix, this was ONE request of 250 items,
    // which the real backend would 413 (over config.POSITIONS_HASH_BATCH_MAX).
    const board = createInitialBoard();
    const ids = addSiblingNodes(board, HASH_BATCH_MAX_ITEMS + 49); // 250 total
    expect(ids.length).toBe(250);

    let callCount = 0;
    fakeBackendService.hashPositionsBatch.mockImplementation(async (raw: string[]) => {
      callCount++;
      return raw.map((_, i) => `h${callCount}-${i}`) as unknown as ContentHash[];
    });

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill(ids, board);
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(2);
    const callLengths = fakeBackendService.hashPositionsBatch.mock.calls.map(
      (call) => (call[0] as string[]).length,
    );
    expect(callLengths).toEqual([200, 50]); // correct partitioning, in order
    expect(callLengths.reduce((a, b) => a + b, 0)).toBe(ids.length);

    // Every id landed in the cache — no gap, no duplicate loss.
    for (const id of ids) {
      expect(getCachedNodeHash(id)).toBeDefined();
    }
  });

  it('a mid-sequence chunk failure keeps the earlier chunk\'s results, notifies once, and a later fill retries only the gap', async () => {
    const board = createInitialBoard();
    const ids = addSiblingNodes(board, HASH_BATCH_MAX_ITEMS + 49); // 250 total: chunks of 200, 50

    fakeBackendService.hashPositionsBatch
      .mockImplementationOnce(async (raw: string[]) => raw.map(() => HASH_ROOT)) // chunk 1 (200) succeeds
      .mockImplementationOnce(async () => { throw new Error('chunk 2 network down'); }); // chunk 2 (50) fails

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill(ids, board);
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(2);
    const firstChunkIds = ids.slice(0, HASH_BATCH_MAX_ITEMS);
    const secondChunkIds = ids.slice(HASH_BATCH_MAX_ITEMS);
    for (const id of firstChunkIds) {
      expect(getCachedNodeHash(id)).toBe(HASH_ROOT); // earlier chunk's results kept
    }
    for (const id of secondChunkIds) {
      expect(getCachedNodeHash(id)).toBeUndefined(); // failed chunk cached nothing
    }
    expect(store.engine.messages.length).toBe(1); // notice fires once for the episode

    // A later fill (TreeWidget's watch re-firing with the same node
    // list, as it does on every nodeList recompute) must retry ONLY the
    // uncached gap — the 50 ids from the failed second chunk.
    fakeBackendService.hashPositionsBatch.mockImplementationOnce(
      async (raw: string[]) => raw.map(() => HASH_ROOT),
    );
    requestHashFill(ids, board);
    await vi.advanceTimersByTimeAsync(150);

    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(3);
    const retryCall = fakeBackendService.hashPositionsBatch.mock.calls[2][0] as string[];
    expect(retryCall).toHaveLength(50); // only the gap, not the whole 250 again
    for (const id of secondChunkIds) {
      expect(getCachedNodeHash(id)).toBe(HASH_ROOT);
    }
    expect(store.engine.messages.length).toBe(1); // recovered — no extra notice
  });

  it('a board close between chunks stops issuing further chunks and never resurrects a purged entry', async () => {
    // 450 ids -> 3 chunks: 200, 200, 50. The board closes as a side
    // effect of chunk 2's request landing (modelling a close that
    // arrives while chunk 2's fetch is outstanding) — `closeBoard`
    // synchronously purges EVERY node-hash entry for this board
    // (`purgeBoardNodeHashes`, unchanged pre-existing behaviour: a
    // close always wipes the whole board's cache, not just the
    // in-flight chunk), so chunk 1's already-landed results are wiped
    // by the close itself, same as any other cache entry for a closed
    // board. What this fix is responsible for: chunk 2's late result
    // must not be written back over the purge, and chunk 3 — the
    // "remaining chunk" — must never be dispatched at all.
    const board = createInitialBoard();
    addBoard(board);
    const ids = addSiblingNodes(board, 2 * HASH_BATCH_MAX_ITEMS + 49); // 450 total

    fakeBackendService.hashPositionsBatch
      .mockImplementationOnce(async (raw: string[]) => raw.map(() => HASH_ROOT)) // chunk 1 (200) succeeds
      .mockImplementationOnce(async (raw: string[]) => {
        closeBoard(board.id); // board closes while chunk 2's request is in flight
        return raw.map(() => HASH_ROOT);
      })
      .mockImplementationOnce(async () => {
        throw new Error('chunk 3 must never be dispatched');
      });

    const { requestHashFill } = useNodePositionHashes();
    requestHashFill(ids, board);
    await vi.advanceTimersByTimeAsync(150);

    // Chunk 3 was never issued — the loop's per-chunk board-close guard
    // stopped it before dispatch.
    expect(fakeBackendService.hashPositionsBatch).toHaveBeenCalledTimes(2);

    // Every id — including chunk 1's, already landed before the close —
    // stays purged. `closeBoard`'s synchronous purge is authoritative;
    // nothing after it (chunk 2's late-landing result, or a chunk 3
    // that must never even be sent) may write back into the cache.
    for (const id of ids) {
      expect(getCachedNodeHash(id)).toBeUndefined();
    }
  });
});
