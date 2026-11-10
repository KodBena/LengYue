/**
 * src/engine/board-geometry.ts
 * Single source of truth for Go-board rendering geometry and the position
 * primitive every board renderer projects from.
 *
 * Two renderers consume this: `renderBoardToSvg` (string projection, for
 * `v-html` / ECharts-innerHTML contexts) and the reactive Vue components
 * (`MiniBoard` thumbnails, `BoardDisplay` main board). They previously each
 * re-implemented the `pad / cell / stoneR / toSVG` math and the grid loop;
 * sharing this module is what keeps the string and component projections
 * from drifting visually.
 *
 * License: Public Domain (The Unlicense)
 */
import { BOARD_PX, STONE_RADIUS_RATIO } from './constants';
import type { StoneColor, Move, Point } from '../types';

/**
 * A single move in a principal-variation sequence, ready for rendering —
 * the shape both the main board's animated PV overlay
 * (`composables/board/use-pv-animation.ts`, which imports and re-exports
 * this exact type as `PvMove` for its own long-established call sites)
 * and the thumbnail family below project from. Homed in the engine layer
 * (alongside `BoardSnapshot`, which now carries it) rather than in the
 * composable that first needed it: `board-geometry.ts` sits BELOW
 * `composables/` in this codebase's layering (`frontend/CLAUDE.md`
 * "Architectural shape" — composables depend on engine, never the
 * reverse), so `BoardSnapshot.pv` cannot reference a type declared in a
 * composable without an upward import. One definition, engine-owned;
 * the composable re-exports rather than re-declaring.
 */
export interface PvVariationMove {
  x: number;
  y: number;
  color: StoneColor;
  /** 1-indexed position in the PV; the displayed move-number label. */
  moveNumber: number;
}

/**
 * A replayed board position — the one data primitive every thumbnail
 * renderer projects from. The cache stores this (not a rendered string);
 * the string projection (`renderBoardToSvg`) and the component projection
 * (`MiniBoard`) both read it.
 */
export interface BoardSnapshot {
  size: number;
  stones: Record<string, StoneColor>;
  /** Last move played into this position; drives the optional ring marker. */
  lastMove?: Move | null;
  /** "x,y" -> short label (e.g. "A", "B") for variation-branch thumbnails. */
  markerLabels?: Record<string, string>;
  /**
   * Best-move principal variation from this position, in play order —
   * the same analysis source (`useMoveSuggestions.buildPvMoves`) the
   * main board's PV overlay (`MoveSuggestions.vue`) reads, populated by
   * `PreviewBoardPanel.vue`. Absent (undefined) when no analysis packet
   * covers this position — the honest empty state, never a fabricated
   * empty array standing in for "no data yet" vs. "genuinely no PV".
   */
  pv?: readonly PvVariationMove[];
}

/**
 * Translate a top-origin row/column coordinate (KataGo board arrays and
 * stencil-cover wire annotations) into the SPA's bottom-origin Point.
 * This is the single orientation boundary shared by all such consumers.
 */
export function boardPointFromTopOrigin(
  column: number,
  rowFromTop: number,
  size: number,
): Point {
  if (
    !Number.isInteger(size) || size < 1
    || !Number.isInteger(column) || column < 0 || column >= size
    || !Number.isInteger(rowFromTop) || rowFromTop < 0 || rowFromTop >= size
  ) {
    throw new RangeError(
      `top-origin board coordinate (${column}, ${rowFromTop}) is outside a ${size}×${size} board`,
    );
  }
  return { x: column, y: size - 1 - rowFromTop };
}

/**
 * Inner-board coordinate math for a given board size. Coordinates are
 * inner-board-relative: `BoardDisplay` translates its playing-area group by
 * `LABEL_BAND` in its own template (it draws coordinate labels around the
 * board), while the thumbnail renderers use `BOARD_PX` directly with no band.
 * `pad` is the inset from the playable-area edge to the first grid line —
 * one cell wide, by Go-board convention.
 */
export interface BoardGeometry {
  pad: number;
  cell: number;
  stoneR: number;
  /** Internal bottom-origin point to inner-board SVG coordinates (SVG y increases downward). */
  toSVG(point: Point): { x: number; y: number };
}

export function boardGeometry(size: number): BoardGeometry {
  const pad = BOARD_PX / (size + 1);
  const cell = (BOARD_PX - 2 * pad) / (size - 1);
  const stoneR = cell * STONE_RADIUS_RATIO;
  const toSVG = (point: Point) => ({
    x: pad + point.x * cell,
    y: pad + (size - 1 - point.y) * cell,
  });
  return { pad, cell, stoneR, toSVG };
}

/** A single grid-line segment in inner-board SVG coordinates. */
export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The board's grid: `size` verticals + `size` horizontals, inner-board
 * coordinates. Shared by both renderers so the line set is identical.
 */
export function gridLines(size: number): GridLine[] {
  const { pad, cell } = boardGeometry(size);
  const end = pad + (size - 1) * cell;
  const out: GridLine[] = [];
  for (let i = 0; i < size; i++) {
    const pos = pad + i * cell;
    out.push({ x1: pos, y1: pad, x2: pos, y2: end }); // vertical
    out.push({ x1: pad, y1: pos, x2: end, y2: pos }); // horizontal
  }
  return out;
}
