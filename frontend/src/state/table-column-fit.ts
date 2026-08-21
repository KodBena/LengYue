/**
 * src/state/table-column-fit.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928). Root-causes audit
 * findings R1 ("Result column renders 3.1px of its 80px", "Analysis
 * range panel" clipped by `overflow-x: hidden`) and L2 ("the two most
 * important columns in a Go game library render at zero pixels wide
 * … the header renders as the concatenated string 'BlackWhiteDate'").
 * Both findings share one root cause: column width was an ad-hoc CSS
 * grid track (`grid-template-columns: 40px 1fr 1fr 110px 80px`) with
 * no floor and no fallback, so a container narrower than the sum of
 * its fixed tracks divides the deficit across every column instead of
 * refusing to under-render any one of them.
 *
 * This module is the ADR-0000 type this defect was missing: a
 * `TableColumnSpec` is DECLARED DATA (key + minWidth + priority, one
 * home per table — see `library-table-columns.ts` and
 * `analysis-interval-table-columns.ts`), and `fitColumns` is a PURE,
 * TOTAL function of that spec plus a measured available width. Its
 * postcondition is the shape the audit's fix asked for by construction:
 * every column in `visible` renders at >= its own `minWidth`, or it is
 * in `dropped` — there is no third state, so "0px-but-present" (L2's
 * finding) is unrepresentable through this function. Consumers make
 * a dropped column's existence VISIBLE (a "+N more" indicator) rather
 * than silently clipping it away.
 *
 * License: Public Domain (The Unlicense)
 */

export interface TableColumnSpec<K extends string = string> {
  /** Stable identity for the column — also the row-data lookup key. */
  readonly key: K;
  /** Human-readable header label. */
  readonly label: string;
  /**
   * The floor, in px, below which this column must not render. A
   * column is never given less than this — `fitColumns` drops it
   * whole instead (see this module's header).
   */
  readonly minWidth: number;
  /**
   * Importance rank: LOWER priority columns are dropped FIRST when
   * width is tight. Not required to be contiguous or unique, but a
   * tie is broken deterministically (see `fitColumns`) so drop order
   * is reproducible across renders of the same spec.
   */
  readonly priority: number;
}

export interface ColumnFit<K extends string = string, C extends TableColumnSpec<K> = TableColumnSpec<K>> {
  /** Columns to render, in the SPEC's original order (not priority order). */
  readonly visible: readonly C[];
  /** Columns dropped, in the SPEC's original order. */
  readonly dropped: readonly C[];
}

/**
 * Total function: available width + column spec -> which columns
 * render, which drop. Never returns a column at less than its own
 * `minWidth`; never silently truncates.
 *
 * Fit test: the visible set's minWidth sum, plus `gapPx` between each
 * pair of visible columns, plus (when anything was dropped) one more
 * gap and `indicatorWidthPx` for the "+N more" affordance, must not
 * exceed `availableWidthPx`. Starting from "show everything," columns
 * are dropped one at a time in ascending-priority order (ties broken
 * by dropping the LATER original-order column first — an arbitrary
 * but deterministic rule so two equal-priority columns don't drop
 * together non-deterministically) until the fit test passes or every
 * column is gone.
 *
 * Non-finite / non-positive `availableWidthPx` (not yet measured) is
 * treated as zero width — every column drops. This is deliberately
 * the SAME "no measurement yet, assume the tightest case" posture
 * `deriveAxis`/`deriveWidthClass` in `layout-model.ts` use for
 * unmeasured geometry, rather than guessing "show everything."
 */
export function fitColumns<K extends string, C extends TableColumnSpec<K> = TableColumnSpec<K>>(
  availableWidthPx: number,
  columns: readonly C[],
  gapPx: number,
  indicatorWidthPx = 0,
): ColumnFit<K, C> {
  const width = Number.isFinite(availableWidthPx) && availableWidthPx > 0 ? availableWidthPx : 0;

  if (columns.length === 0) {
    return { visible: [], dropped: [] };
  }

  // Drop order: ascending priority, ties broken by descending original
  // index (later columns in the spec's own order drop first on a tie).
  const dropOrder = columns
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = columns[a]!.priority;
      const pb = columns[b]!.priority;
      if (pa !== pb) return pa - pb;
      return b - a;
    });

  const droppedIndices = new Set<number>();

  function widthOfKept(): number {
    const kept = columns.filter((_, i) => !droppedIndices.has(i));
    if (kept.length === 0) {
      return droppedIndices.size > 0 ? indicatorWidthPx : 0;
    }
    const columnsWidth = kept.reduce((sum, c) => sum + c.minWidth, 0) + gapPx * (kept.length - 1);
    if (droppedIndices.size === 0) return columnsWidth;
    // Something is dropped: the "+N more" indicator occupies one more
    // track, separated from the last visible column by one more gap.
    return columnsWidth + gapPx + indicatorWidthPx;
  }

  let cursor = 0;
  while (widthOfKept() > width && cursor < dropOrder.length) {
    droppedIndices.add(dropOrder[cursor]!);
    cursor++;
  }

  const visible = columns.filter((_, i) => !droppedIndices.has(i));
  const dropped = columns.filter((_, i) => droppedIndices.has(i));
  return { visible, dropped };
}
