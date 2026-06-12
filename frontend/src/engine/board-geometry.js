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
export function boardGeometry(size) {
    const pad = BOARD_PX / (size + 1);
    const cell = (BOARD_PX - 2 * pad) / (size - 1);
    const stoneR = cell * STONE_RADIUS_RATIO;
    const toSVG = (bx, by) => ({
        x: pad + bx * cell,
        y: pad + (size - 1 - by) * cell,
    });
    return { pad, cell, stoneR, toSVG };
}
/**
 * The board's grid: `size` verticals + `size` horizontals, inner-board
 * coordinates. Shared by both renderers so the line set is identical.
 */
export function gridLines(size) {
    const { pad, cell } = boardGeometry(size);
    const end = pad + (size - 1) * cell;
    const out = [];
    for (let i = 0; i < size; i++) {
        const pos = pad + i * cell;
        out.push({ x1: pos, y1: pad, x2: pos, y2: end }); // vertical
        out.push({ x1: pad, y1: pos, x2: end, y2: pos }); // horizontal
    }
    return out;
}
