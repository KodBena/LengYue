/**
 * src/types/library.ts
 *
 * SGF library domain: camel-case projections of the /library/* wire
 * shapes (list rows, the full game row, filters, import
 * inputs/outcomes, the sort vocabulary). The ACL is
 * `services/library-service.ts`. Carved from the single-file
 * `src/types.ts` (2026-06-10, history-lessons audit §3.15); bodies
 * are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardId, GameSourceId, GameDisplayOrdinal } from './ids';

// ── Value Objects (readonly preserved) — SGF library domain ───────────────────
//
// Camel-case domain projections of the /library/* wire shapes
// (LibraryGame, LibraryGameListItem, ListGamesResponse,
// ListPlayersResponse, ImportOutcome, plus the import request items).
// The ACL at `services/library-service.ts` translates between these
// and the generated `components['schemas']['*']` wire types in
// `types/backend.ts`. Branded ids (`GameSourceId`, `BoardId`)
// replace raw `number` / `string` at the boundary; the library row's
// primary key is the same `GameSourceId` the forest navigator uses
// (the library and forest are two views over the same `game_source`
// table), and the row's `client_game_id` UUID is the same `BoardId`
// that boards keyed-by-`client_game_id` use — so opening a library
// game on a board carries the brand through, and a subsequent
// card-mint dedups against the library row via the existing
// `get_or_create_game_source_by_client_id` path.
//
// Per ADR-0008's classification discipline: the sort column is a
// closed Literal union — the camelCase domain names map 1:1 to the
// snake_case wire vocabulary via the ACL. Invalid sort columns are
// 422'd by the backend's Pydantic validator; the frontend's type
// system rules them out at compile time.

export type LibrarySortColumn =
  | 'createdAt'
  | 'date'
  | 'playerWhite'
  | 'playerBlack'
  | 'result'
  | 'ruleset'
  | 'boardSize';

export type LibrarySortDirection = 'asc' | 'desc';

// Distinct-player view row — name + the number of games the player
// appears in across either colour. Backend computes the counts; the
// SPA renders a two-column accordion (name, count) and feeds names
// into the autocomplete suggest. Both surfaces consume the same
// frequency-ordered list.
export interface PlayerCount {
  readonly name: string;
  readonly count: number;
}

// One library row in the list view. Excludes `rawContent` — the SGF
// body ships only via the detail endpoint per the column-projection
// discipline (~2 KB/row × 100 rows would dwarf the metadata).
export interface LibraryGameListItem {
  readonly id: GameSourceId;
  // Per-user-id-enumeration design: no longer `BoardId | null` — the
  // "may be None for legacy rows" exception is closed (every
  // `game_source` row now mints a `client_game_id` at insert time,
  // and the migration backfills historical NULLs). See
  // `.claude/dispatch-reports/per-user-id-enumeration-design.md`,
  // Decision 4's disposition table.
  readonly clientGameId: BoardId;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly date: string | null;
  readonly result: string | null;
  readonly ruleset: string | null;
  readonly boardSize: number | null;
  readonly createdAt: string;  // ISO 8601 — leave as string at the ACL
  // Per-user, gaps-on-delete display ordinal — the library list's
  // row-numbering column. Never round-tripped as a reference.
  readonly displayOrdinal: GameDisplayOrdinal;
}

// Full library row including raw SGF body. Returned by GET
// /library/games/{id}; consumed by the preview pane and the
// "Open in board" flow. `metadataExtra` is the JSON-column blob —
// uppercase SGF property keys (KM, HA, EV, RO, …) plus the lowercase
// `source_path` provenance field stamped at import time.
export interface LibraryGame {
  readonly id: GameSourceId;
  // Per-user-id-enumeration design: see LibraryGameListItem's
  // identical note — no longer `BoardId | null`.
  readonly clientGameId: BoardId;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly date: string | null;
  readonly result: string | null;
  readonly ruleset: string | null;
  readonly boardSize: number | null;
  readonly metadataExtra: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly rawContent: string;
  readonly displayOrdinal: GameDisplayOrdinal;
}

// Filter predicates for GET /library/games. All optional; omitted
// fields don't constrain the query. Substring-match (`*Like`) on
// player names, lexicographic range on date string, exact match on
// result / ruleset / boardSize.
//
// Per ADR-0001 (state containers drop `readonly`): this is a
// reactive state container — `useLibraryQuery` holds it via
// Vue's `reactive(...)` and the SPA's filter inputs v-model
// fields on it directly to trigger refetches. Keep mutability
// honest at the type level.
export interface LibraryFilter {
  // Any-color player filter — ORs across player_white / player_black
  // on the backend. The "show me all of X's games regardless of
  // colour" affordance, distinct from the per-color filters below
  // which target one side specifically. All three filters AND
  // together when set simultaneously.
  playerLike: string | null;
  playerWhiteLike: string | null;
  playerBlackLike: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  resultEq: string | null;
  rulesetEq: string | null;
  boardSizeEq: number | null;
}

// Per-file input to the batch-import endpoint. `sourcePath` carries
// the directory-upload `File.webkitRelativePath` so the user's
// on-disk layout (`sgf_db/1996/cho-vs-lee.sgf`) survives into
// `metadataExtra.source_path` at the backend. `null` for single-file
// uploads and curl clients.
export interface LibraryImportInput {
  readonly rawContent: string;
  readonly sourcePath: string | null;
}

// Per-file outcome of a batch import. Discriminated union; the
// `status` field is the dispatch witness. `errored` carries the
// per-file failure message (malformed SGF, adapter SAVEPOINT
// failure, etc.) — the batch as a whole stays 200 OK and the
// remaining files are unaffected. `deduplicated.clientGameId` may
// be `null` for legacy rows that pre-date the dedup arc.
// Per-user-id-enumeration design: `deduplicated.clientGameId` is no
// longer `BoardId | null` — the legacy exception is closed the same
// way as `LibraryGameListItem.clientGameId` above.
export type LibraryImportOutcome =
  | { readonly status: 'created'; readonly gameId: GameSourceId; readonly clientGameId: BoardId; readonly displayOrdinal: GameDisplayOrdinal }
  | { readonly status: 'deduplicated'; readonly gameId: GameSourceId; readonly clientGameId: BoardId; readonly displayOrdinal: GameDisplayOrdinal }
  | { readonly status: 'errored'; readonly error: string };

// A parsed SGF file staged by the setup wizard's optional import step,
// not yet sent to the backend (commission rows 1404/1407/1464/1468:
// the wizard's import step is a PURE STAGING core — no backend/DB
// mutation before wizard finish — with the actual upload living in an
// imperative shell that commits only when the wizard finishes;
// cancelling/closing the wizard simply never calls that shell, so the
// staged plan evaporates with zero externally-visible effect). Owned
// by the wizard session (`useSetupWizard.ts`), not by
// `useLibraryImport.ts` — that composable stays the EFFECTFUL path the
// Library tab's own import UI uses unchanged. `fileName` is
// display-only (progress/list rendering); `input` is the exact wire
// payload `LibraryService.importGames` sends when the plan commits.
export interface StagedImportFile {
  readonly fileName: string;
  readonly input: LibraryImportInput;
}
