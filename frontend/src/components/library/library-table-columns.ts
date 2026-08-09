/**
 * src/components/library/library-table-columns.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928, audit finding L2): SINGLE
 * HOME for the Library table's column geometry. Was a bare
 * `grid-template-columns: 40px 1fr 1fr 110px 80px` literal in
 * `LibraryTable.vue`'s scoped CSS with no floor — the audit's own
 * finding was that a container narrower than that fixed-track sum
 * divided the deficit across every column instead of refusing to
 * under-render one: the two player-name columns measured 0px wide
 * (scrollWidth 70/58) while the header text literally concatenated
 * into "BlackWhiteDate".
 *
 * `LibraryColumnSpec` extends `TableColumnSpec` with `grow` — whether
 * the column should absorb extra width once visible (today: only the
 * two player-name columns, matching the original `1fr` tracks) —
 * because `LibraryTable.vue`'s renderer needs that fact to build its
 * `grid-template-columns` and there is no other legitimate home for
 * it once the track list itself is spec-driven (ADR-0012: one home
 * per fact — scattering `grow` back into the template would just
 * relocate the drift risk the spec exists to close).
 *
 * License: Public Domain (The Unlicense)
 */
import type { TableColumnSpec } from '../../state/table-column-fit';

export type LibraryColumnKey = 'ordinal' | 'playerBlack' | 'playerWhite' | 'date' | 'result';

export interface LibraryColumnSpec extends TableColumnSpec<LibraryColumnKey> {
  /** Absorbs extra width beyond `minWidth` once visible (a `1fr`-style track). */
  readonly grow: boolean;
}

// assumption (not spec-given): minWidth floors. Reverse-derived from
// the audit's own live measurements (L2: player-name scrollWidth
// 70/58 for the sampled row) rounded up to a legible floor, plus the
// PRE-EXISTING fixed-track widths for date/result/ordinal (the audit
// never flagged those as too narrow, only as un-droppable).
//
// Priority: LOWER drops first. Player names are the two facts a Go
// game library exists to show (L2's own framing — "28,847 games, not
// one player name visible") so they are ranked to survive longest;
// the display ordinal is the cheapest to lose (it's inferable from
// scroll position and the row count) so it drops first even though
// it costs the least width — priority is about IMPORTANCE, not about
// space reclaimed per drop.
export const LIBRARY_TABLE_COLUMNS: readonly LibraryColumnSpec[] = [
  { key: 'ordinal', label: '#', minWidth: 32, priority: 1, grow: false },
  { key: 'playerBlack', label: 'Black', minWidth: 80, priority: 5, grow: true },
  { key: 'playerWhite', label: 'White', minWidth: 80, priority: 4, grow: true },
  { key: 'date', label: 'Date', minWidth: 84, priority: 3, grow: false },
  { key: 'result', label: 'Result', minWidth: 56, priority: 2, grow: false },
];

// assumption (not spec-given): the gap between grid tracks (real
// token, `--space-default` = 8px — the previous CSS referenced the
// undefined `--space-tiny`/`--space-small` tokens, which the standing
// rules forbid reaching for in NEW CSS; see this file's sibling edit
// in `LibraryTable.vue`).
export const LIBRARY_TABLE_GAP_PX = 8;

// assumption (not spec-given): the "+N more" elision indicator's own
// track width — wide enough for "+5 more" at the table's body font
// size without wrapping.
export const LIBRARY_TABLE_INDICATOR_WIDTH_PX = 64;
