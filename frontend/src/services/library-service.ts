/**
 * src/services/library-service.ts
 *
 * HTTP boundary for the SGF library — five verbs over the
 * /library endpoints. Single ACL: snake_case wire shapes from the
 * generated OpenAPI bindings (`src/types/backend.ts`) become
 * camelCase, branded domain types from `src/types.ts`. Raw
 * numbers become `GameSourceId`; raw UUID strings become
 * `BoardId`. The library row's `client_game_id` IS the same
 * `BoardId` a board lifetime keys on, so the brand carries
 * through to the card-mint integration path via the existing
 * `get_or_create_game_source_by_client_id` dedup.
 *
 * `importGames` is the only verb with non-trivial orchestration:
 * client-side chunking at IMPORT_CHUNK_SIZE keeps each request
 * fit-for-purpose under the backend's per-request cap
 * (`SGF_LIBRARY_IMPORT_BATCH_MAX`), and an optional
 * `onProgress` callback lets the SPA render "imported N / M"
 * progress during a long upload (the project author's case:
 * 24,729 SGFs from ~/w/vdc/sgf_db = 25 chunks).
 *
 * No reactive state owned here. The library list buffer, the
 * player-suggest cache, and the import-progress observable
 * all live in F3 composables that compose this service; the
 * ACL stays stateless.
 *
 * License: Public Domain (The Unlicense)
 */

import { api, ApiError } from './api-client';
import { asBoardId } from '../store/board-factory';
import type {
  GameSourceId,
  LibraryFilter,
  LibraryGame,
  LibraryGameListItem,
  LibraryImportInput,
  LibraryImportOutcome,
  LibrarySortColumn,
  LibrarySortDirection,
  PlayerCount,
} from '../types';
import type { components } from '../types/backend';

// ── Wire-type aliases ────────────────────────────────────────────────────────

type LibraryGameWire = components['schemas']['LibraryGame'];
type LibraryGameListItemWire = components['schemas']['LibraryGameListItem'];
type ImportGameItemWire = components['schemas']['ImportGameItem'];
type ImportGamesRequestWire = components['schemas']['ImportGamesRequest'];
type ImportGamesResponseWire = components['schemas']['ImportGamesResponse'];
type ListGamesResponseWire = components['schemas']['ListGamesResponse'];
type ListPlayersResponseWire = components['schemas']['ListPlayersResponse'];
type ImportOutcomeWire = ImportGamesResponseWire['outcomes'][number];

// Wire-side sort enum (snake_case). Closed Literal vocabulary
// matching the backend's GameListSort.
type LibrarySortWire =
  | 'created_at'
  | 'date'
  | 'player_white'
  | 'player_black'
  | 'result'
  | 'ruleset'
  | 'board_size';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Client-side import chunk size. Mirrors the backend's
 * `SGF_LIBRARY_IMPORT_BATCH_MAX` (1000) so each chunk fits in
 * one request without triggering 413 batch_too_large. Tracked
 * alongside the backend constant rather than fetched at runtime
 * — the wire contract is the gate, and the SPA bundle is the
 * artifact users build against the backend version they're
 * consuming.
 */
export const IMPORT_CHUNK_SIZE = 1000;

// ── Wire ↔ domain projections ────────────────────────────────────────────────

const SORT_TO_WIRE: Record<LibrarySortColumn, LibrarySortWire> = {
  createdAt: 'created_at',
  date: 'date',
  playerWhite: 'player_white',
  playerBlack: 'player_black',
  result: 'result',
  ruleset: 'ruleset',
  boardSize: 'board_size',
};

function fromWireGameListItem(wire: LibraryGameListItemWire): LibraryGameListItem {
  return {
    id: wire.id as GameSourceId,
    clientGameId: wire.client_game_id !== null ? asBoardId(wire.client_game_id) : null,
    playerWhite: wire.player_white,
    playerBlack: wire.player_black,
    date: wire.date,
    result: wire.result,
    ruleset: wire.ruleset,
    boardSize: wire.board_size,
    createdAt: wire.created_at,
  };
}

function fromWireGame(wire: LibraryGameWire): LibraryGame {
  return {
    id: wire.id as GameSourceId,
    clientGameId: wire.client_game_id !== null ? asBoardId(wire.client_game_id) : null,
    playerWhite: wire.player_white,
    playerBlack: wire.player_black,
    date: wire.date,
    result: wire.result,
    ruleset: wire.ruleset,
    boardSize: wire.board_size,
    metadataExtra: wire.metadata_extra,
    createdAt: wire.created_at,
    rawContent: wire.raw_content,
  };
}

function toWireImportItem(input: LibraryImportInput): ImportGameItemWire {
  return {
    raw_content: input.rawContent,
    source_path: input.sourcePath,
  };
}

function fromWireImportOutcome(wire: ImportOutcomeWire): LibraryImportOutcome {
  switch (wire.status) {
    case 'created':
      return {
        status: 'created',
        gameId: wire.game_id as GameSourceId,
        clientGameId: asBoardId(wire.client_game_id),
      };
    case 'deduplicated':
      return {
        status: 'deduplicated',
        gameId: wire.game_id as GameSourceId,
        clientGameId: wire.client_game_id !== null ? asBoardId(wire.client_game_id) : null,
      };
    case 'errored':
      return {
        status: 'errored',
        error: wire.error,
      };
    default: {
      // Exhaustiveness check: a future wire variant added without a
      // corresponding `case` here fails to typecheck at this line and
      // throws at runtime per ADR-0002.
      const _exhaustive: never = wire;
      throw new Error(
        `Unknown ImportOutcome variant: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

// ── Public surface ───────────────────────────────────────────────────────────

export interface ListGamesQuery {
  readonly sort: LibrarySortColumn;
  readonly direction: LibrarySortDirection;
  readonly filter: LibraryFilter;
  readonly offset: number;
  readonly limit: number;
}

export interface ListGamesResult {
  readonly rows: readonly LibraryGameListItem[];
  readonly totalCount: number;
}

export interface ImportProgress {
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly chunkOutcomes: readonly LibraryImportOutcome[];
}

// 404 on GET /library/games/{id} is the routine "no such row OR
// cross-tenant" case — the 404-not-403 invariant. Silenced from
// the system-log push (the api-client still throws so `getGame`
// can return `null`).
const GET_GAME_SILENT = [404] as const;

export class LibraryService {
  /**
   * Paginated list of the caller's library, with sort + filter
   * + total_count. List rows exclude `rawContent` per the
   * column-projection discipline; the SPA fetches per-row body
   * on demand via `getGame` for the preview pane.
   */
  public async listGames(query: ListGamesQuery): Promise<ListGamesResult> {
    const params = new URLSearchParams();
    params.set('sort', SORT_TO_WIRE[query.sort]);
    params.set('direction', query.direction);
    const f = query.filter;
    if (f.playerLike !== null) params.set('player_like', f.playerLike);
    if (f.playerWhiteLike !== null) params.set('player_white_like', f.playerWhiteLike);
    if (f.playerBlackLike !== null) params.set('player_black_like', f.playerBlackLike);
    if (f.dateFrom !== null) params.set('date_from', f.dateFrom);
    if (f.dateTo !== null) params.set('date_to', f.dateTo);
    if (f.resultEq !== null) params.set('result_eq', f.resultEq);
    if (f.rulesetEq !== null) params.set('ruleset_eq', f.rulesetEq);
    if (f.boardSizeEq !== null) params.set('board_size_eq', String(f.boardSizeEq));
    params.set('offset', String(query.offset));
    params.set('limit', String(query.limit));

    const wire = await api.request<ListGamesResponseWire>(
      'GET',
      `/library/games?${params.toString()}`,
    );
    return {
      rows: wire.rows.map(fromWireGameListItem),
      totalCount: wire.total_count,
    };
  }

  /**
   * Fetch one library game's full row, including `rawContent`.
   * Returns `null` on 404 (row absent OR cross-tenant — the
   * caller cannot distinguish, per the 404-not-403 invariant);
   * other failures rethrow as the api-client's generic Error.
   */
  public async getGame(gameId: GameSourceId): Promise<LibraryGame | null> {
    try {
      const wire = await api.request<LibraryGameWire>(
        'GET',
        `/library/games/${gameId}`,
        undefined,
        { silentStatuses: GET_GAME_SILENT },
      );
      return fromWireGame(wire);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Delete one library game. The backend returns 204 on success
   * and 404 on miss/cross-tenant. Cascade behaviour on dependent
   * card_source rows is ON DELETE SET NULL (backend schema) —
   * cards minted from this game survive the delete with their
   * `game_source_id` nulled out.
   */
  public async deleteGame(gameId: GameSourceId): Promise<void> {
    await api.request<void>(
      'DELETE',
      `/library/games/${gameId}`,
    );
  }

  /**
   * Distinct player-name set across the caller's library,
   * frequency-ordered (most-common first; alphabetical ties).
   * Drives the SPA's filter-input autocomplete — fetched once
   * on Library tab mount, held in-memory by the F3 composable
   * (deliberately not in the persisted workspace document;
   * workspace is user-authored state, library players are
   * imported data). The F3 composable re-fetches after an
   * import completes.
   */
  public async listPlayers(): Promise<readonly PlayerCount[]> {
    const wire = await api.request<ListPlayersResponseWire>(
      'GET',
      '/library/players',
    );
    // Wire shape is structurally identical to PlayerCount — same
    // field names, same types — so no projection is needed beyond
    // typing the result. Both surfaces consume the same array.
    return wire.players;
  }

  /**
   * Batch import. Chunks `inputs` at `IMPORT_CHUNK_SIZE` so each
   * request fits the backend's per-request cap. Returns the
   * flattened outcomes in input order; the optional `onProgress`
   * callback fires once per chunk so a UI surface can render
   * progressive "imported N / M" feedback during a multi-chunk
   * upload.
   *
   * The per-file outcomes (`created` / `deduplicated` /
   * `errored`) are the backend's contract — a malformed SGF in
   * one position produces an `errored` outcome at that index
   * without failing the chunk. Chunk-level failure (network
   * error, 4xx other than the per-file errors) throws from the
   * underlying `api.request` and abandons the remainder of the
   * batch; outcomes from chunks that already completed remain
   * in the returned list up to the failure point.
   *
   * Empty `inputs` returns an empty list (the natural no-op).
   */
  public async importGames(
    inputs: readonly LibraryImportInput[],
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<readonly LibraryImportOutcome[]> {
    if (inputs.length === 0) return [];

    const chunks: LibraryImportInput[][] = [];
    for (let i = 0; i < inputs.length; i += IMPORT_CHUNK_SIZE) {
      chunks.push(inputs.slice(i, i + IMPORT_CHUNK_SIZE));
    }

    const all: LibraryImportOutcome[] = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const body: ImportGamesRequestWire = {
        games: chunk.map(toWireImportItem),
      };
      const wire = await api.request<ImportGamesResponseWire>(
        'POST',
        '/library/games/import',
        body,
      );
      const outcomes = wire.outcomes.map(fromWireImportOutcome);
      all.push(...outcomes);
      onProgress?.({
        chunkIndex,
        totalChunks: chunks.length,
        chunkOutcomes: outcomes,
      });
    }
    return all;
  }
}

/**
 * Singleton instance. Matches the existing service-singleton
 * pattern (`AnalysisPersistenceService`, `BackendService`).
 * Tests construct their own instance with a fake `api` (or
 * mock `api.request`) to exercise the ACL in isolation.
 */
export const libraryService = new LibraryService();
