/**
 * src/composables/perf/fixtures.ts
 *
 * Deterministic SGF fixtures for performance scenarios. A measured pass
 * wants a long, reproducible main line with no backend/network variance
 * in the capture — so the default is a *generated* game rather than a
 * library fetch (the library path stays available via
 * `ScenarioContext.loadLibraryGameById` for realism scenarios).
 *
 * `buildSpacedFixtureSgf` lays alternating B/W stones on an even-spaced
 * grid (every other point in each axis), so no two stones are ever
 * orthogonally adjacent — guaranteed legal, no captures, no ko, for as
 * many moves as the grid holds (100 on 19×19). That gives a deep main
 * line for autonav to walk and a wide turn range for `analyzeRange`,
 * without hand-authoring (and possibly mis-authoring) a real game.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — emits SGF move
 * vocabulary. Dev-only fixture data; makes no perf *claim* (ADR-0009).
 *
 * License: Public Domain (The Unlicense)
 */
// magic-literal: SGF coordinate alphabet — column/row letters a..s map to
// board indices 0..18 (standard SGF point encoding for a 19×19 board).
const SGF_COORDS = 'abcdefghijklmnopqrs';
// magic-literal: 19×19 — LengYue's only board size for generated fixtures.
const BOARD_SIZE = 19;
// magic-literal: grid stride. Stride 2 guarantees no two placed stones are
// orthogonally adjacent (nearest same-grid points are 2 apart), so every
// placement is legal and never captures. Yields ⌈19/2⌉² = 100 points.
const GRID_STRIDE = 2;
/**
 * Build an SGF whose main line places `maxMoves` alternating B/W stones on
 * the even-spaced grid. Caps at the grid's capacity (100 on 19×19). The
 * stones never interact, so the game is legal for the full length.
 */
export function buildSpacedFixtureSgf(maxMoves = 100) {
    const points = [];
    for (let y = 0; y < BOARD_SIZE; y += GRID_STRIDE) {
        for (let x = 0; x < BOARD_SIZE; x += GRID_STRIDE) {
            points.push(`${SGF_COORDS[x]}${SGF_COORDS[y]}`);
        }
    }
    const count = Math.min(maxMoves, points.length);
    let body = '';
    for (let i = 0; i < count; i++) {
        const color = i % 2 === 0 ? 'B' : 'W';
        body += `;${color}[${points[i]}]`;
    }
    return `(;FF[4]GM[1]SZ[${BOARD_SIZE}]${body})`;
}
/** Default fixture: a full 100-move spaced game. */
export const DEFAULT_FIXTURE_SGF = buildSpacedFixtureSgf();
