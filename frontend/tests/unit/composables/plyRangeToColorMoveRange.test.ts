/**
 * tests/unit/composables/plyRangeToColorMoveRange.test.ts
 *
 * Tier-1 pure-logic coverage for `plyRangeToColorMoveRange`
 * (`src/composables/analysis/useTriangularHeatmap.ts`) — the reverse
 * of `colorMoveToPly`, and the projection `useIntervalSummary` uses to
 * look an absolute ply-range selection up in the multiresolution
 * heatmap's own (colour-local) matrix. Pinning the forward/reverse
 * round trip here is what lets the integration test
 * (`tests/integration/useIntervalSummary.test.ts`) trust that an exact
 * cell lookup is the right kernel-reuse strategy, not a coincidence.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  colorMoveToPly,
  plyRangeToColorMoveRange,
} from '../../../src/composables/analysis/useTriangularHeatmap';
import type { ColorMoveIndex, PlyIndex } from '../../../src/types';

describe('plyRangeToColorMoveRange', () => {
  it('round-trips exactly through colorMoveToPly for a single colour (a heatmap-cell-click selection)', () => {
    // MultiresolutionIntervalPanel.handleCellClick builds a selectionRange
    // exactly this way: colorMoveToPly(cell.s, color) .. colorMoveToPly(cell.t, color).
    const s = 2 as ColorMoveIndex;
    const t = 5 as ColorMoveIndex;
    const startPly = colorMoveToPly(s, 'B');
    const endPly = colorMoveToPly(t, 'B');

    expect(plyRangeToColorMoveRange(startPly, endPly, 'B')).toEqual([s, t]);
  });

  it('projects a ply range spanning both colours onto the largest fully-contained sub-range per colour', () => {
    // Ply range [1, 6]: Black moves at ply 1, 3, 5 (colour-local 0, 1, 2);
    // White moves at ply 2, 4, 6 (colour-local 0, 1, 2). Both colours are
    // fully covered, so both project to [0, 2].
    const range = [1, 6] as [PlyIndex, PlyIndex];
    expect(plyRangeToColorMoveRange(range[0], range[1], 'B')).toEqual([0, 2]);
    expect(plyRangeToColorMoveRange(range[0], range[1], 'W')).toEqual([0, 2]);
  });

  it('excludes a colour move only partially inside the ply range', () => {
    // Ply range [1, 5]: Black's moves at ply 1, 3, 5 are fully inside → [0, 2].
    // White's moves are at ply 2, 4; ply 6 (White's 3rd) is outside, but so is
    // any White move beyond ply 5 — White's fully-contained run is [0, 1].
    const range = [1, 5] as [PlyIndex, PlyIndex];
    expect(plyRangeToColorMoveRange(range[0], range[1], 'B')).toEqual([0, 2]);
    expect(plyRangeToColorMoveRange(range[0], range[1], 'W')).toEqual([0, 1]);
  });

  it('returns null when the ply range contains none of the colour\'s moves', () => {
    // Ply range [1, 1] is Black's first move only; White has no move in it.
    const range = [1, 1] as [PlyIndex, PlyIndex];
    expect(plyRangeToColorMoveRange(range[0], range[1], 'W')).toBeNull();
  });

  it('returns null for the empty root selection [0, 0]', () => {
    const range = [0, 0] as [PlyIndex, PlyIndex];
    expect(plyRangeToColorMoveRange(range[0], range[1], 'B')).toBeNull();
    expect(plyRangeToColorMoveRange(range[0], range[1], 'W')).toBeNull();
  });
});
