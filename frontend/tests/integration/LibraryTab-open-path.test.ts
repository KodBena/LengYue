/**
 * tests/integration/LibraryTab-open-path.test.ts
 *
 * Ledger row 1106 (commissioner adjudication overruling the single-
 * click-opens option explored earlier under ledger row 1015):
 * SELECT-PREVIEWS, EXPLICIT-OPEN. This suite mounts the real LibraryTab
 * (not just LibraryTable in isolation) to witness the wiring that
 * connects a row gesture to the parent-facing `open-library-game`
 * emit — the signal that ultimately reaches `useDirtyBoardGuard` and
 * can raise the confirm-load modal (pinned separately, at the
 * composable level, in `useDirtyBoardGuard.test.ts`):
 *
 *   - A plain click selects the row for preview only — no
 *     `open-library-game` emit, so nothing can load onto the board or
 *     trigger the modal from this gesture.
 *   - Double-click and Enter (the explicit-open gestures) both emit
 *     `open-library-game` with the fetched game.
 *   - Ctrl/Cmd-click and middle-click still emit the new-tab variant.
 *
 * Same service-boundary-fake convention as
 * `panel-content-two-col-reflow.test.ts` (`tests/CLAUDE.md`): mocks
 * `library-service.ts` so this test never touches the network.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import LibraryTab from '../../src/components/library/LibraryTab.vue';
import type { LibraryGame, LibraryGameListItem } from '../../src/types';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
});

afterEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  vi.clearAllMocks();
});

// vi.mock factories are hoisted above this file's own top-level
// consts, so the list-item/game fixtures are built inline here
// rather than referenced from module scope (a `ReferenceError:
// Cannot access '...' before initialization` otherwise).
const listItem: LibraryGameListItem = {
  id: 1 as never,
  clientGameId: 'lib-board-1' as never,
  playerWhite: 'Cho Hun-hyeon',
  playerBlack: 'Seo Pong-su',
  date: '1981-09-08',
  result: 'B+1.5',
  ruleset: 'Japanese',
  boardSize: 19,
  createdAt: '2026-01-01T00:00:00Z',
  displayOrdinal: 1 as never,
};

const fullGame: LibraryGame = {
  ...listItem,
  metadataExtra: {},
  rawContent: '(;FF[4]GM[1]SZ[19])',
};

vi.mock('../../src/services/library-service', () => ({
  libraryService: {
    listGames: vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          clientGameId: 'lib-board-1',
          playerWhite: 'Cho Hun-hyeon',
          playerBlack: 'Seo Pong-su',
          date: '1981-09-08',
          result: 'B+1.5',
          ruleset: 'Japanese',
          boardSize: 19,
          createdAt: '2026-01-01T00:00:00Z',
          displayOrdinal: 1,
        },
      ],
      totalCount: 1,
    }),
    listPlayers: vi.fn().mockResolvedValue([]),
    getGame: vi.fn().mockResolvedValue({
      id: 1,
      clientGameId: 'lib-board-1',
      playerWhite: 'Cho Hun-hyeon',
      playerBlack: 'Seo Pong-su',
      date: '1981-09-08',
      result: 'B+1.5',
      ruleset: 'Japanese',
      boardSize: 19,
      createdAt: '2026-01-01T00:00:00Z',
      displayOrdinal: 1,
      metadataExtra: {},
      rawContent: '(;FF[4]GM[1]SZ[19])',
    }),
    importGames: vi.fn().mockResolvedValue([]),
  },
}));

async function mountLibraryTab() {
  const wrapper = mount(LibraryTab, { global: { plugins: [i18n] } });
  // onMounted's query.refresh() + LibraryTable's own visible-range ->
  // ensureRange both resolve here, populating the one fake row.
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('LibraryTab — open-path wiring (ledger row 1106)', () => {
  it('a plain click on a row never emits open-library-game (select-only)', async () => {
    const wrapper = await mountLibraryTab();
    const row = wrapper.find('.library-row');
    expect(row.exists()).toBe(true);

    await row.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('open-library-game')).toBeFalsy();

    wrapper.unmount();
  });

  it('double-click on a row emits open-library-game with the fetched game', async () => {
    const wrapper = await mountLibraryTab();
    const row = wrapper.find('.library-row');

    await row.trigger('dblclick');
    await flushPromises();

    expect(wrapper.emitted('open-library-game')).toBeTruthy();
    expect(wrapper.emitted('open-library-game')![0]).toEqual([fullGame]);

    wrapper.unmount();
  });

  it('Enter on a row emits open-library-game with the fetched game', async () => {
    const wrapper = await mountLibraryTab();
    const row = wrapper.find('.library-row');

    await row.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('open-library-game')).toBeTruthy();
    expect(wrapper.emitted('open-library-game')![0]).toEqual([fullGame]);

    wrapper.unmount();
  });

  it('Ctrl-click emits open-library-game-new-tab, not open-library-game', async () => {
    const wrapper = await mountLibraryTab();
    const row = wrapper.find('.library-row');

    await row.trigger('click', { ctrlKey: true });
    await flushPromises();

    expect(wrapper.emitted('open-library-game-new-tab')).toBeTruthy();
    expect(wrapper.emitted('open-library-game-new-tab')![0]).toEqual([fullGame]);
    expect(wrapper.emitted('open-library-game')).toBeFalsy();

    wrapper.unmount();
  });
});
