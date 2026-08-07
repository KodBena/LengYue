/**
 * tests/integration/node-position-hashes.test.ts
 *
 * Coverage for the node-position-hashes state module
 * (`src/state/node-position-hashes.ts`) — the per-node reactive
 * `NodeId -> ContentHash` cache from card-position-annotations Stage B
 * (`.claude/dispatch-reports/card-position-annotations-design.md`, §4/§6).
 *
 * Pinned behaviours:
 *   - cache + read round-trips, reactive Map fill (mirrors
 *     thumbnail-render-resources.test.ts's snapshot-cache reactivity pin).
 *   - `purgeBoardNodeHashes` drops the board-owned entries and leaves
 *     foreign ones (audit pair O4 shape, same as `purgeBoardThumbnails`).
 *   - `purgeAllNodeHashes` clears every entry (audit pair O9 shape).
 *
 * The identity-flip / board-close WIRING — that `resetWorkspace` /
 * `closeBoard` actually drive this module's purges via the teardown
 * registry — is pinned separately in `teardown-registry-completeness.test.ts`
 * and `auth-lifecycle.test.ts` (both updated in this change to cover the
 * new `node-position-hashes` / `node-position-hashes:purge-board` handlers).
 * This file is deliberately narrower: direct coverage of the module's own
 * read/write/purge contract.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computed } from 'vue';
import {
  cacheNodeHash,
  getCachedNodeHash,
  hasCachedNodeHash,
  nodeHashCount,
  purgeAllNodeHashes,
  purgeBoardNodeHashes,
} from '../../src/state/node-position-hashes';
import { store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import type { BoardId, ContentHash, NodeId } from '../../src/types';

function nid(s: string): NodeId {
  return s as NodeId; // test-fixture brand mint
}

function bid(s: string): BoardId {
  return s as BoardId; // test-fixture brand mint
}

const HASH_A = 'a'.repeat(64) as ContentHash;
const HASH_B = 'b'.repeat(64) as ContentHash;

beforeEach(() => {
  purgeAllNodeHashes();
});

describe('node-position-hashes — cache / read', () => {
  it('getCachedNodeHash returns undefined for an unhashed node', () => {
    const id = nid('node-unhashed');
    expect(getCachedNodeHash(id)).toBeUndefined();
    expect(hasCachedNodeHash(id)).toBe(false);
  });

  it('caches and reads back a node hash', () => {
    const id = nid('node-a');
    cacheNodeHash(id, HASH_A);
    expect(getCachedNodeHash(id)).toBe(HASH_A);
    expect(hasCachedNodeHash(id)).toBe(true);
  });

  it('a computed over getCachedNodeHash fills when the cache warms that key (ref(Map) collection reactivity)', () => {
    // Same reactivity contract thumbnail-render-resources.test.ts pins for
    // getCachedSnapshot: a consumer reading the cache inside a `computed`
    // must re-evaluate off the later `.set()` alone.
    const id = nid('node-reactive-fill');
    const seen = computed(() => getCachedNodeHash(id));
    expect(seen.value).toBeUndefined();

    cacheNodeHash(id, HASH_A);
    expect(seen.value).toBe(HASH_A);
  });

  it('tracks multiple distinct nodes independently', () => {
    const a = nid('node-a');
    const b = nid('node-b');
    cacheNodeHash(a, HASH_A);
    cacheNodeHash(b, HASH_B);
    expect(getCachedNodeHash(a)).toBe(HASH_A);
    expect(getCachedNodeHash(b)).toBe(HASH_B);
    expect(nodeHashCount()).toBe(2);
  });
});

describe('node-position-hashes — purgeBoardNodeHashes (audit pair O4 shape)', () => {
  it('drops the board-owned entries and leaves foreign ones', () => {
    const board = createInitialBoard();
    const foreign = nid('node-foreign');
    store.boards.push(board);
    try {
      cacheNodeHash(board.rootNodeId, HASH_A);
      cacheNodeHash(foreign, HASH_B);

      purgeBoardNodeHashes(board.id);

      expect(getCachedNodeHash(board.rootNodeId)).toBeUndefined();
      expect(getCachedNodeHash(foreign)).toBe(HASH_B);
    } finally {
      // Failure-safe teardown: remove the pushed board even when an
      // assertion above throws, so later tests see a clean store.
      store.boards.splice(store.boards.indexOf(board), 1);
    }
  });

  it('is a no-op for a boardId not present in store.boards', () => {
    const id = nid('node-untouched');
    cacheNodeHash(id, HASH_A);
    purgeBoardNodeHashes(bid('nonexistent-board-id'));
    expect(getCachedNodeHash(id)).toBe(HASH_A);
  });
});

describe('node-position-hashes — purgeAllNodeHashes (audit pair O9 shape)', () => {
  it('clears every recorded entry', () => {
    cacheNodeHash(nid('node-a'), HASH_A);
    cacheNodeHash(nid('node-b'), HASH_B);
    expect(nodeHashCount()).toBe(2);

    purgeAllNodeHashes();

    expect(nodeHashCount()).toBe(0);
  });
});
