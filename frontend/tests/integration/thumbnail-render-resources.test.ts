/**
 * tests/integration/thumbnail-render-resources.test.ts
 *
 * Pins the contracts of the shared thumbnail render-resource owner module
 * (`src/composables/cards/thumbnail-render-resources.ts`) — the module the
 * render-lifecycle consolidation introduced so that "shared across every
 * instance" is structural rather than a comment's claim:
 *
 *   - the load-bearing `ref(Map)` collection reactivity of the snapshot
 *     cache (the mechanism the docked sidebar pane's, ChartPreviewBox's,
 *     and FloatingThumbnail's fill-on-warm all rest on — previously only
 *     asserted by a comment; PR #365's out-of-frame audit finding 3);
 *   - the invalidation surface: the caller-less `invalidateNodeSnapshots`
 *     hook (the applySetup obligation), the board-close purge (audit pair
 *     O4), and the identity-flip purge (audit pair O9, including the
 *     warmed-path-guard reset);
 *   - the paint layer's genuinely-shared semantics: one wood texture load
 *     per session (the texture-flash class), one sprite per
 *     (colour, device-pixel-radius) key.
 *
 * Module-scope state persists across tests within this file; tests that
 * depend on a clean cache call `purgeAllThumbnails()` up front, and the
 * wood sequence (one-shot by design — there is deliberately no reset
 * export for a session-static asset) runs as a single sequential test.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computed } from 'vue';
import {
  addWoodWaiter,
  cacheSnapshot,
  ensureWood,
  getCachedSnapshot,
  getWoodIfReady,
  invalidateNodeSnapshots,
  isPathWarm,
  markPathWarm,
  purgeAllThumbnails,
  purgeBoardThumbnails,
  removeWoodWaiter,
  stoneSprite,
} from '../../src/composables/cards/thumbnail-render-resources';
import { store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import type { BoardSnapshot } from '../../src/engine/board-geometry';
import type { NodeId } from '../../src/types';

function nid(s: string): NodeId {
  // Test-fixture brand mint (the standard fixture shape, cf. the
  // RootToCurrentPath fixture mint noted in IDENTIFIERS.md).
  return s as NodeId;
}

function snap(size = 9): BoardSnapshot {
  return { size, stones: { '2,2': 'B' }, lastMove: null };
}

describe('snapshot cache — reactivity and invalidation surface', () => {
  beforeEach(() => {
    purgeAllThumbnails();
  });

  it('a computed over getCachedSnapshot fills when the cache warms that key (ref(Map) collection reactivity)', () => {
    const id = nid('node-reactive-fill');
    const seen = computed(() => getCachedSnapshot(id));
    expect(seen.value).toBeNull();

    const s = snap();
    cacheSnapshot(id, s);
    // The computed must re-evaluate off the Map mutation alone — this is
    // the invariant the reactive preview consumers (docked pane,
    // ChartPreviewBox, FloatingThumbnail) rest on. A plain/markRaw Map
    // would leave `seen` permanently null. Deep equality, not identity:
    // a read through the reactive Map yields Vue's reactive proxy of the
    // stored snapshot.
    expect(seen.value).toStrictEqual(s);
  });

  it('invalidateNodeSnapshots (the caller-less applySetup hook) drops exactly the named nodes', () => {
    const a = nid('node-a');
    const b = nid('node-b');
    cacheSnapshot(a, snap());
    cacheSnapshot(b, snap());

    invalidateNodeSnapshots([a]);

    expect(getCachedSnapshot(a)).toBeNull();
    expect(getCachedSnapshot(b)).not.toBeNull();
  });

  it('purgeBoardThumbnails drops the board-owned entries and leaves foreign ones (audit pair O4)', () => {
    const board = createInitialBoard();
    const foreign = nid('node-foreign');
    store.boards.push(board);
    try {
      cacheSnapshot(board.rootNodeId, snap(19));
      cacheSnapshot(foreign, snap());

      purgeBoardThumbnails(board.id);

      expect(getCachedSnapshot(board.rootNodeId)).toBeNull();
      expect(getCachedSnapshot(foreign)).not.toBeNull();
    } finally {
      // Failure-safe teardown: remove the pushed board even when an
      // assertion above throws, so later tests see a clean store.
      store.boards.splice(store.boards.indexOf(board), 1);
    }
  });

  it('purgeAllThumbnails clears the cache AND resets the warmed-path guard (audit pair O9)', () => {
    const a = nid('node-a');
    cacheSnapshot(a, snap());
    markPathWarm([a]);
    expect(isPathWarm([a])).toBe(true);

    purgeAllThumbnails();

    expect(getCachedSnapshot(a)).toBeNull();
    // Without the guard reset, the next identity's first warm of the same
    // path shape would short-circuit on a stale fingerprint.
    expect(isPathWarm([a])).toBe(false);
  });

  it('isPathWarm matches only the exact last-warmed path', () => {
    const a = nid('node-a');
    const b = nid('node-b');
    markPathWarm([a, b]);
    expect(isPathWarm([a, b])).toBe(true);
    expect(isPathWarm([a])).toBe(false);
    expect(isPathWarm([b, a])).toBe(false);
  });
});

describe('paint layer — wood texture (one decode per session)', () => {
  // jsdom's Image never fires onload (no network); a capturing fake stands
  // in so the test can drive the decode transition explicitly.
  class FakeImage {
    static instances: FakeImage[] = [];
    onload: (() => void) | null = null;
    src = '';
    naturalWidth = 4;
    naturalHeight = 4;
    constructor() {
      FakeImage.instances.push(this);
    }
  }

  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads once, notifies waiters on decode, and is shared thereafter', () => {
    // Wood state is session-static module state with deliberately no reset
    // export, so the whole arc is one sequential test.
    expect(getWoodIfReady()).toBeNull();

    const waiter = vi.fn();
    addWoodWaiter(waiter);

    ensureWood();
    ensureWood(); // idempotent — must NOT construct a second Image
    expect(FakeImage.instances.length).toBe(1);
    expect(getWoodIfReady()).toBeNull(); // not decoded yet

    FakeImage.instances[0].onload?.();
    expect(waiter).toHaveBeenCalledTimes(1);
    // Vitest types the stubbed-global instance loosely; the identity check
    // is on the object, so the unknown-hop is test-local and safe.
    expect(getWoodIfReady()).toBe(FakeImage.instances[0] as unknown as HTMLImageElement);

    // A waiter removed per the add/remove ownership pair no longer fires.
    removeWoodWaiter(waiter);
    FakeImage.instances[0].onload?.();
    expect(waiter).toHaveBeenCalledTimes(1);

    // Later consumers (the remount-per-hover lifecycle) see the texture
    // immediately — ensureWood stays a no-op.
    ensureWood();
    expect(FakeImage.instances.length).toBe(1);
    expect(getWoodIfReady()).not.toBeNull();
  });
});

describe('paint layer — stone sprites (one per colour × device-pixel radius)', () => {
  beforeEach(() => {
    // jsdom has no 2D canvas backend (getContext returns null); a minimal
    // recording context is enough — the assertions are on cache identity,
    // not pixels.
    const fakeCtx = {
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      fillStyle: null as unknown,
      lineWidth: 0,
      strokeStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      // Test-only stand-in: the sprite painter uses a small subset of the
      // 2D context; jsdom offers none at all.
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the same canvas for the same (colour, rpx) key and distinct canvases across keys', () => {
    const b10a = stoneSprite('B', 10);
    const b10b = stoneSprite('B', 10);
    const w10 = stoneSprite('W', 10);
    const b12 = stoneSprite('B', 12);

    expect(b10b).toBe(b10a); // shared across calls — and thus across component instances
    expect(w10).not.toBe(b10a); // colour is a key leg
    expect(b12).not.toBe(b10a); // device-pixel radius is a key leg
  });
});
