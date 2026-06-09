/**
 * tests/integration/useForestNavigation.test.ts
 *
 * Tier-3 tests for the per-board scoping of the Forest Directory navigator
 * selection (board-scope audit P0, schema 59). `forestNav.selection` is keyed
 * on the active board so a null/absent selection on one board can no longer
 * drive or clear another board's right pane; `forestNav.expanded` stays
 * workspace-global (the navigator tree is the user's whole library). Synthetic
 * board ids are used directly — the composable only indexes the selection map
 * by id, so no real board fixtures are needed.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { withSetup } from './with-setup';
import { useForestNavigation } from '../../src/composables/forest/useForestNavigation';
import { resetWorkspace, store } from '../../src/store';
import type { BoardId, CardId, ForestStat, GameSourceId, NavNodeId } from '../../src/types';

beforeEach(() => resetWorkspace());

describe('useForestNavigation — per-board selection (P0)', () => {
  it('keys selection by board: selecting on A does not affect B', () => {
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>('board-a' as BoardId);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));

    expect(nav.selection.value).toBeNull();
    nav.select({ kind: 'root', rootCardId: 5 as CardId });
    expect(nav.selection.value).toEqual({ kind: 'root', rootCardId: 5 });

    // Switch the active board; B has no selection of its own.
    boardIdRef.value = 'board-b' as BoardId;
    expect(nav.selection.value).toBeNull();

    // A's selection survived in the per-board map.
    boardIdRef.value = 'board-a' as BoardId;
    expect(nav.selection.value).toEqual({ kind: 'root', rootCardId: 5 });

    // The store holds it under A's key, not globally.
    expect(store.session.ui.forestNav.selection).toEqual({
      'board-a': { kind: 'root', rootCardId: 5 },
    });
  });

  it("select(null) clears only the active board's slot", () => {
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>('board-a' as BoardId);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));

    nav.select({ kind: 'game', gameSourceId: 1 as GameSourceId });
    expect(nav.selection.value).not.toBeNull();

    nav.select(null);
    expect(nav.selection.value).toBeNull();
    expect('board-a' in store.session.ui.forestNav.selection).toBe(false);
  });

  it('expansion stays workspace-global across board switches', () => {
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>('board-a' as BoardId);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));

    nav.toggle('game:1' as NavNodeId);
    expect(nav.expanded.value.has('game:1' as NavNodeId)).toBe(true);

    boardIdRef.value = 'board-b' as BoardId;
    // Expansion is global — unchanged by the board switch.
    expect(nav.expanded.value.has('game:1' as NavNodeId)).toBe(true);
  });

  it('select is a no-op when no board is active', () => {
    const roots = ref<ForestStat[]>([]);
    const boardIdRef = ref<BoardId | null>(null);
    const nav = withSetup(() => useForestNavigation(roots, boardIdRef));

    nav.select({ kind: 'root', rootCardId: 9 as CardId });
    expect(nav.selection.value).toBeNull();
    expect(store.session.ui.forestNav.selection).toEqual({});
  });
});
