/**
 * tests/integration/library/useLibraryPreview.test.ts
 *
 * Integration tests for `useLibraryPreview`. Drives the
 * composable against a mocked `libraryService.getGame`, covering:
 *
 *   - Selection change triggers getGame + SGF parse.
 *   - parsedBoard + variationPath populate after the parse.
 *   - Scrub position navigates the parsed board.
 *   - Selection clear resets everything.
 *   - Race protection: rapid selection changes only commit the
 *     latest fetch's result.
 *   - Malformed SGF surfaces as null parsedBoard without crashing.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';

vi.mock('../../../src/services/library-service', () => {
  return {
    libraryService: {
      getGame: vi.fn(),
    },
  };
});

import { libraryService } from '../../../src/services/library-service';
import { useLibraryPreview } from '../../../src/composables/library/useLibraryPreview';
import type { LibraryGame, LibraryGameListItem } from '../../../src/types';

const mockGet = vi.mocked(libraryService.getGame);

function makeListItem(id: number): LibraryGameListItem {
  return {
    id: id as never,
    clientGameId: '11111111-2222-3333-4444-555555555555' as never,
    playerWhite: 'Alice',
    playerBlack: 'Bob',
    date: '2024-01-01',
    result: 'B+R',
    ruleset: 'Japanese',
    boardSize: 19,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeGame(id: number, rawContent: string): LibraryGame {
  return {
    id: id as never,
    clientGameId: '11111111-2222-3333-4444-555555555555' as never,
    playerWhite: 'Alice',
    playerBlack: 'Bob',
    date: '2024-01-01',
    result: 'B+R',
    ruleset: 'Japanese',
    boardSize: 19,
    metadataExtra: {},
    createdAt: '2026-01-01T00:00:00Z',
    rawContent,
  };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('useLibraryPreview — initial state', () => {
  it('starts with everything null/empty', () => {
    const p = useLibraryPreview();
    expect(p.selectedRow.value).toBeNull();
    expect(p.selectedGame.value).toBeNull();
    expect(p.parsedBoard.value).toBeNull();
    expect(p.variationPath.value).toEqual([]);
    expect(p.totalMoves.value).toBe(0);
  });
});

describe('useLibraryPreview — selection drives fetch + parse', () => {
  it('fetches the row and parses its rawContent on selection', async () => {
    const sgfBody = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[qq])';
    mockGet.mockResolvedValueOnce(makeGame(7, sgfBody));
    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(7);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(p.selectedGame.value?.rawContent).toBe(sgfBody);
    expect(p.parsedBoard.value).not.toBeNull();
    // Main line: root + 3 moves = 4 nodes; totalMoves = 3.
    expect(p.totalMoves.value).toBe(3);
  });

  it('clears state when selection is set to null', async () => {
    mockGet.mockResolvedValueOnce(makeGame(7, '(;FF[4]SZ[19];B[pd])'));
    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(7);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(p.parsedBoard.value).not.toBeNull();

    p.selectedRow.value = null;
    await nextTick();
    expect(p.selectedGame.value).toBeNull();
    expect(p.parsedBoard.value).toBeNull();
    expect(p.variationPath.value).toEqual([]);
  });

  it('does not crash when SGF parse degenerates (no moves in body)', async () => {
    // The @sabaki/sgf parser is permissive: non-SGF input yields an
    // empty tree rather than throwing. Either parsedBoard is null
    // (genuine throw caught by the composable) or a valid-but-
    // empty board state. What we pin is "no exception escapes" and
    // selectedGame is preserved either way.
    mockGet.mockResolvedValueOnce(makeGame(9, 'not an sgf at all'));
    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(9);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(p.selectedGame.value).not.toBeNull();
    // totalMoves stays 0 for empty parses (no moves played).
    expect(p.totalMoves.value).toBe(0);
  });

  it('handles a getGame returning null (e.g. cross-tenant 404)', async () => {
    mockGet.mockResolvedValueOnce(null);
    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(99);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(p.selectedGame.value).toBeNull();
    expect(p.parsedBoard.value).toBeNull();
  });
});

describe('useLibraryPreview — scrub navigates the board', () => {
  it('moves currentNodeId along the variation path', async () => {
    const sgfBody = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[qq])';
    mockGet.mockResolvedValueOnce(makeGame(1, sgfBody));
    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(1);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));

    const path = p.variationPath.value;
    expect(path.length).toBe(4);  // root + 3 moves

    p.scrubPosition.value = 2;
    await nextTick();
    expect(p.parsedBoard.value?.currentNodeId).toBe(path[2]);
  });
});

describe('useLibraryPreview — race protection', () => {
  it('drops a stale fetch result when a newer selection has fired', async () => {
    let resolveFirst: (v: LibraryGame | null) => void;
    mockGet
      .mockReturnValueOnce(
        new Promise(r => { resolveFirst = r; }) as Promise<LibraryGame | null>,
      )
      .mockResolvedValueOnce(makeGame(2, '(;FF[4]GM[1]SZ[19];B[aa])'));

    const p = useLibraryPreview();
    p.selectedRow.value = makeListItem(1);
    await nextTick();
    // Second selection before the first resolves.
    p.selectedRow.value = makeListItem(2);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    // Resolve the stale first fetch after the second has committed.
    resolveFirst!(makeGame(1, '(;FF[4]GM[1]SZ[19];B[bb])'));
    await new Promise(r => setTimeout(r, 0));
    // The committed game should be the second.
    expect(p.selectedGame.value?.rawContent).toContain('B[aa]');
  });
});
