/**
 * tests/unit/engine/stencil-cover-geometry.test.ts
 *
 * Pure tests for projection of proxy stencil placements into board SVG
 * boundaries. No DOM, Vue, or solver dependency.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, expect, it } from 'vitest';
import { projectStencilCoverOutline } from '../../../src/engine/stencil-cover-geometry';
import type { StencilCoverAnnotation, StencilCoverRegion } from '../../../src/engine/katago/types';

function region(
  placements: StencilCoverRegion['placements'],
  optimal = true,
): StencilCoverRegion {
  return {
    placements,
    tileCount: placements.length,
    optimal,
    status: placements.length === 0 ? 'empty' : (optimal ? 'optimal' : 'feasible'),
  };
}

function annotation(
  positive: StencilCoverRegion,
  negative: StencilCoverRegion = region([]),
): StencilCoverAnnotation {
  return {
    version: 1,
    threshold: 0.6,
    width: 9,
    height: 9,
    positive,
    negative,
    optimal: positive.optimal && negative.optimal,
  };
}

function segmentCount(path: string): number {
  return (path.match(/M/g) ?? []).length;
}

describe('projectStencilCoverOutline', () => {
  it('draws all four outer edges of a singleton stencil, including the below-threshold-facing perimeter', () => {
    const result = projectStencilCoverOutline(
      annotation(region([{ stencil: '1x1', points: [[4, 4]] }])),
      9,
    );
    expect(result?.positive.path).toBeTruthy();
    expect(segmentCount(result!.positive.path)).toBe(4);
    // A closed perimeter, not a contour clipped to neighbouring owned points.
  });

  it('keeps each stencil perimeter closed when adjacent stencils meet', () => {
    const result = projectStencilCoverOutline(
      annotation(region([
        { stencil: '1x1', points: [[3, 4]] },
        { stencil: '1x1', points: [[4, 4]] },
      ])),
      9,
    );
    // Four edges per singleton, with the common edge emitted only once.
    expect(segmentCount(result!.positive.path)).toBe(7);
  });

  it('suppresses internal edges inside one multi-cell stencil', () => {
    const result = projectStencilCoverOutline(
      annotation(region([{ stencil: '1x2', points: [[3, 4], [4, 4]] }])),
      9,
    );
    // A 1x2 tile is one six-segment rectangle, not two outlined cells.
    expect(segmentCount(result!.positive.path)).toBe(6);
  });

  it('keeps positive and negative regions as separate paths', () => {
    const result = projectStencilCoverOutline(
      annotation(
        region([{ stencil: '1x1', points: [[2, 2]] }]),
        region([{ stencil: '1x1', points: [[6, 6]] }]),
      ),
      9,
    );
    expect(segmentCount(result!.positive.path)).toBe(4);
    expect(segmentCount(result!.negative.path)).toBe(4);
  });

  it('carries the non-optimal status to the overlay styling contract', () => {
    const result = projectStencilCoverOutline(
      annotation(region([{ stencil: '1x1', points: [[4, 4]] }], false)),
      9,
    );
    expect(result?.positive.optimal).toBe(false);
  });

  it('renders an empty cover as an empty path', () => {
    const result = projectStencilCoverOutline(annotation(region([])), 9);
    expect(result).toEqual({
      positive: { path: '', optimal: true },
      negative: { path: '', optimal: true },
    });
  });

  it('rejects overlap within a signed region rather than drawing an invalid cover', () => {
    const result = projectStencilCoverOutline(
      annotation(region([
        { stencil: '1x1', points: [[4, 4]] },
        { stencil: '1x1', points: [[4, 4]] },
      ])),
      9,
    );
    expect(result).toBeNull();
  });

  it('rejects overlap between positive and negative ownership regions', () => {
    const result = projectStencilCoverOutline(
      annotation(
        region([{ stencil: '1x1', points: [[4, 4]] }]),
        region([{ stencil: '1x1', points: [[4, 4]] }]),
      ),
      9,
    );
    expect(result).toBeNull();
  });

  it('rejects out-of-board coordinates and mismatched board dimensions', () => {
    const badPoint = annotation(region([{ stencil: '1x1', points: [[9, 4]] }]));
    expect(projectStencilCoverOutline(badPoint, 9)).toBeNull();
    expect(projectStencilCoverOutline(annotation(region([])), 13)).toBeNull();
  });
});
