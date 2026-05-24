/**
 * tests/unit/services/library-service.test.ts
 *
 * Tier-1 (pure-logic) and Tier-2 (effect-orchestration) tests for
 * the `LibraryService` ACL. The pure parts (snake_case ↔ camelCase
 * projection, sort-vocabulary map, exhaustiveness on the import-
 * outcome discriminator) and the orchestration parts (chunking
 * imports at `IMPORT_CHUNK_SIZE`, threading `onProgress`, null on
 * 404) are exercised through the service's public surface with
 * `api.request` mocked.
 *
 * `api.request` is mocked at module load via `vi.mock` so the
 * service singleton runs under the test's spy. Per-test reset via
 * `mockReset` in `beforeEach`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock — replaces the api singleton before the service
// module loads.
vi.mock('../../../src/services/api-client', () => {
  return {
    api: {
      request: vi.fn(),
    },
  };
});

import { api } from '../../../src/services/api-client';
import {
  LibraryService,
  IMPORT_CHUNK_SIZE,
  type ListGamesQuery,
  type ImportProgress,
} from '../../../src/services/library-service';
import type {
  LibraryFilter,
  LibraryImportInput,
} from '../../../src/types';

const mockRequest = vi.mocked(api.request);

const EMPTY_FILTER: LibraryFilter = {
  playerWhiteLike: null,
  playerBlackLike: null,
  dateFrom: null,
  dateTo: null,
  resultEq: null,
  rulesetEq: null,
  boardSizeEq: null,
};

const BASE_QUERY: ListGamesQuery = {
  sort: 'createdAt',
  direction: 'desc',
  filter: EMPTY_FILTER,
  offset: 0,
  limit: 100,
};

beforeEach(() => {
  mockRequest.mockReset();
});

// ─── listGames: URL composition + projection ────────────────────────────────

describe('LibraryService.listGames', () => {
  it('maps camelCase sort to snake_case wire vocabulary', async () => {
    mockRequest.mockResolvedValueOnce({ rows: [], total_count: 0 });
    const svc = new LibraryService();
    await svc.listGames({ ...BASE_QUERY, sort: 'playerWhite' });

    const [method, url] = mockRequest.mock.calls[0];
    expect(method).toBe('GET');
    expect(url).toContain('sort=player_white');
  });

  it('emits filter params only when set', async () => {
    mockRequest.mockResolvedValueOnce({ rows: [], total_count: 0 });
    const svc = new LibraryService();
    await svc.listGames({
      ...BASE_QUERY,
      filter: {
        ...EMPTY_FILTER,
        playerWhiteLike: 'Cho',
        boardSizeEq: 19,
      },
    });

    const url = mockRequest.mock.calls[0][1];
    expect(url).toContain('player_white_like=Cho');
    expect(url).toContain('board_size_eq=19');
    expect(url).not.toContain('player_black_like');
    expect(url).not.toContain('date_from');
  });

  it('projects rows to camelCase domain types with branded ids', async () => {
    mockRequest.mockResolvedValueOnce({
      rows: [{
        id: 42,
        client_game_id: '11111111-2222-3333-4444-555555555555',
        player_white: 'Alice',
        player_black: 'Bob',
        date: '2024-01-01',
        result: 'B+R',
        ruleset: 'Japanese',
        board_size: 19,
        created_at: '2026-05-24T00:00:00Z',
      }],
      total_count: 1,
    });
    const svc = new LibraryService();
    const result = await svc.listGames(BASE_QUERY);

    expect(result.totalCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.id).toBe(42);
    expect(row.clientGameId).toBe('11111111-2222-3333-4444-555555555555');
    expect(row.playerWhite).toBe('Alice');
    expect(row.boardSize).toBe(19);
    expect(row.createdAt).toBe('2026-05-24T00:00:00Z');
  });

  it('preserves null clientGameId on legacy rows', async () => {
    mockRequest.mockResolvedValueOnce({
      rows: [{
        id: 1,
        client_game_id: null,
        player_white: null,
        player_black: null,
        date: null,
        result: null,
        ruleset: null,
        board_size: null,
        created_at: '2026-05-24T00:00:00Z',
      }],
      total_count: 1,
    });
    const svc = new LibraryService();
    const result = await svc.listGames(BASE_QUERY);
    expect(result.rows[0].clientGameId).toBeNull();
  });
});

// ─── getGame: 404-not-403 + projection ──────────────────────────────────────

describe('LibraryService.getGame', () => {
  it('returns null on 404', async () => {
    mockRequest.mockRejectedValueOnce(new Error('API Error 404: Library game not found'));
    const svc = new LibraryService();
    const result = await svc.getGame(999 as never);
    expect(result).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    mockRequest.mockRejectedValueOnce(new Error('API Error 500: oops'));
    const svc = new LibraryService();
    await expect(svc.getGame(1 as never)).rejects.toThrow(/500/);
  });

  it('projects detail row including rawContent and metadataExtra', async () => {
    mockRequest.mockResolvedValueOnce({
      id: 7,
      client_game_id: '11111111-2222-3333-4444-555555555555',
      player_white: 'Alice',
      player_black: 'Bob',
      date: null,
      result: null,
      ruleset: null,
      board_size: 19,
      metadata_extra: { KM: '6.5', source_path: 'sgf_db/1996/x.sgf' },
      created_at: '2026-05-24T00:00:00Z',
      raw_content: '(;FF[4]C[A])',
    });
    const svc = new LibraryService();
    const game = await svc.getGame(7 as never);
    expect(game).not.toBeNull();
    expect(game!.rawContent).toBe('(;FF[4]C[A])');
    expect(game!.metadataExtra.source_path).toBe('sgf_db/1996/x.sgf');
    expect(game!.metadataExtra.KM).toBe('6.5');
  });
});

// ─── deleteGame ─────────────────────────────────────────────────────────────

describe('LibraryService.deleteGame', () => {
  it('issues a DELETE to /library/games/{id}', async () => {
    mockRequest.mockResolvedValueOnce(undefined);
    const svc = new LibraryService();
    await svc.deleteGame(42 as never);
    const [method, url] = mockRequest.mock.calls[0];
    expect(method).toBe('DELETE');
    expect(url).toBe('/library/games/42');
  });
});

// ─── listPlayers ────────────────────────────────────────────────────────────

describe('LibraryService.listPlayers', () => {
  it('returns the players array from the wire response', async () => {
    mockRequest.mockResolvedValueOnce({ players: ['Bob', 'Alice', 'Carol'] });
    const svc = new LibraryService();
    const result = await svc.listPlayers();
    expect(result).toEqual(['Bob', 'Alice', 'Carol']);
  });
});

// ─── importGames: chunking + progress + outcome projection ──────────────────

describe('LibraryService.importGames', () => {
  it('returns empty list without hitting the network on empty input', async () => {
    const svc = new LibraryService();
    const result = await svc.importGames([]);
    expect(result).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('issues one request for inputs at or below chunk size', async () => {
    mockRequest.mockResolvedValueOnce({
      outcomes: [{
        status: 'created',
        game_id: 1,
        client_game_id: '11111111-2222-3333-4444-555555555555',
      }],
    });
    const svc = new LibraryService();
    const inputs: LibraryImportInput[] = [
      { rawContent: 'sgf', sourcePath: null },
    ];
    const result = await svc.importGames(inputs);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('created');
  });

  it('chunks inputs above IMPORT_CHUNK_SIZE into multiple requests', async () => {
    // Build IMPORT_CHUNK_SIZE + 1 inputs → 2 chunks.
    const inputs: LibraryImportInput[] = Array.from(
      { length: IMPORT_CHUNK_SIZE + 1 },
      (_, i) => ({ rawContent: `sgf-${i}`, sourcePath: null }),
    );
    mockRequest.mockResolvedValue({
      outcomes: [{
        status: 'created',
        game_id: 1,
        client_game_id: '11111111-2222-3333-4444-555555555555',
      }],
    });

    const svc = new LibraryService();
    await svc.importGames(inputs);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('fires onProgress once per chunk with chunkIndex and totalChunks', async () => {
    const inputs: LibraryImportInput[] = Array.from(
      { length: IMPORT_CHUNK_SIZE * 2 },
      (_, i) => ({ rawContent: `sgf-${i}`, sourcePath: null }),
    );
    mockRequest.mockResolvedValue({
      outcomes: [{ status: 'errored', error: 'x' }],
    });

    const svc = new LibraryService();
    const progressEvents: ImportProgress[] = [];
    await svc.importGames(inputs, p => progressEvents.push(p));

    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0].chunkIndex).toBe(0);
    expect(progressEvents[0].totalChunks).toBe(2);
    expect(progressEvents[1].chunkIndex).toBe(1);
    expect(progressEvents[1].totalChunks).toBe(2);
  });

  it('forwards source_path on the wire when provided', async () => {
    mockRequest.mockResolvedValueOnce({ outcomes: [] });
    const svc = new LibraryService();
    await svc.importGames([
      { rawContent: 'sgf-A', sourcePath: 'sgf_db/1996/x.sgf' },
      { rawContent: 'sgf-B', sourcePath: null },
    ]);
    const body = mockRequest.mock.calls[0][2] as { games: Array<{ raw_content: string; source_path: string | null }> };
    expect(body.games[0].source_path).toBe('sgf_db/1996/x.sgf');
    expect(body.games[1].source_path).toBeNull();
  });

  it('projects all three outcome variants to discriminated domain types', async () => {
    mockRequest.mockResolvedValueOnce({
      outcomes: [
        { status: 'created', game_id: 1, client_game_id: 'aaaaaaaa-1111-2222-3333-444444444444' },
        { status: 'deduplicated', game_id: 2, client_game_id: null },
        { status: 'errored', error: 'malformed' },
      ],
    });
    const svc = new LibraryService();
    const result = await svc.importGames([
      { rawContent: 'a', sourcePath: null },
      { rawContent: 'a', sourcePath: null },
      { rawContent: 'bad', sourcePath: null },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('created');
    expect(result[1].status).toBe('deduplicated');
    if (result[1].status === 'deduplicated') {
      expect(result[1].clientGameId).toBeNull();
    }
    expect(result[2].status).toBe('errored');
    if (result[2].status === 'errored') {
      expect(result[2].error).toBe('malformed');
    }
  });

  it('preserves outcome order across chunks', async () => {
    // Two chunks of 1 SGF each; outcomes carry their game_id so we
    // can confirm order across the chunk boundary.
    const inputs: LibraryImportInput[] = Array.from(
      { length: IMPORT_CHUNK_SIZE + 1 },
      (_, i) => ({ rawContent: `sgf-${i}`, sourcePath: null }),
    );
    let callCount = 0;
    mockRequest.mockImplementation(async () => {
      callCount++;
      return {
        outcomes: [{
          status: 'created',
          game_id: callCount,
          client_game_id: '11111111-2222-3333-4444-555555555555',
        }],
      };
    });

    const svc = new LibraryService();
    // First chunk has IMPORT_CHUNK_SIZE outcomes, second has 1.
    mockRequest.mockReset();
    mockRequest
      .mockResolvedValueOnce({
        outcomes: Array.from({ length: IMPORT_CHUNK_SIZE }, (_, i) => ({
          status: 'created',
          game_id: 100 + i,
          client_game_id: '11111111-2222-3333-4444-555555555555',
        })),
      })
      .mockResolvedValueOnce({
        outcomes: [{
          status: 'created',
          game_id: 999,
          client_game_id: '11111111-2222-3333-4444-555555555555',
        }],
      });

    const result = await svc.importGames(inputs);
    expect(result).toHaveLength(IMPORT_CHUNK_SIZE + 1);
    if (result[0].status === 'created') expect(result[0].gameId).toBe(100);
    if (result[IMPORT_CHUNK_SIZE].status === 'created') {
      expect(result[IMPORT_CHUNK_SIZE].gameId).toBe(999);
    }
  });
});
