/**
 * tests/unit/engine/stencil-cover-geometry.test.ts
 *
 * Pure tests for projecting raw thresholded components and solved stencil
 * placements into board SVG geometry. No DOM, Vue, or solver dependency.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, expect, it } from 'vitest';
import { boardGeometry } from '../../../src/engine/board-geometry';
import { decodeBoardArray } from '../../../src/engine/util';
import {
  projectStencilCoverComponents,
  projectStencilCoverOutline,
} from '../../../src/engine/stencil-cover-geometry';
import type {
  StencilCoverAnnotation,
  StencilCoverComponent,
  StencilCoverRegion,
} from '../../../src/engine/katago/types';

function component(
  cells: readonly (readonly [number, number])[],
  status: StencilCoverComponent['status'] = 'optimal',
  tileCount = 1,
): StencilCoverComponent {
  return {
    cells,
    tileCount,
    optimal: status === 'optimal',
    status,
  };
}

function region(
  placements: StencilCoverRegion['placements'],
  optimal = true,
  components?: readonly StencilCoverComponent[],
): StencilCoverRegion {
  const cells = new Map<string, readonly [number, number]>();
  for (const placement of placements) {
    for (const point of placement.points) cells.set(point.join(','), point);
  }
  const derived = cells.size === 0
    ? []
    : [component([...cells.values()], optimal ? 'optimal' : 'feasible', placements.length)];
  return {
    placements,
    components: components ?? derived,
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
    version: 2,
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
  });

  it('keeps each stencil perimeter closed when adjacent stencils meet', () => {
    const result = projectStencilCoverOutline(
      annotation(region([
        { stencil: '1x1', points: [[3, 4]] },
        { stencil: '1x1', points: [[4, 4]] },
      ])),
      9,
    );
    expect(segmentCount(result!.positive.path)).toBe(7);
  });

  it('suppresses internal edges inside one multi-cell stencil', () => {
    const result = projectStencilCoverOutline(
      annotation(region([{ stencil: '1x2', points: [[3, 4], [4, 4]] }])),
      9,
    );
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

  it('carries non-optimal status to the outline styling contract', () => {
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
    expect(projectStencilCoverOutline(
      annotation(region([{ stencil: '1x1', points: [[9, 4]] }])),
      9,
    )).toBeNull();
    expect(projectStencilCoverOutline(annotation(region([])), 13)).toBeNull();
  });
});

describe('KataGo row-major orientation boundary', () => {
  it('maps every top-origin wire cell to the same bottom-origin point as decodeBoardArray', () => {
    const size = 9;
    const geometry = boardGeometry(size);
    const half = geometry.cell / 2;
    const format = (value: number): string => Number(value.toFixed(3)).toString();

    // Quantify over the entire coordinate class; a central or symmetric
    // fixture would not catch a vertical reflection.
    for (let rowFromTop = 0; rowFromTop < size; rowFromTop++) {
      for (let column = 0; column < size; column++) {
        const flatIndex = rowFromTop * size + column;
        const values = Array<number>(size * size).fill(0);
        values[flatIndex] = 1;
        const decoded = decodeBoardArray(values, size)
          .find(({ value }) => value === 1);
        expect(decoded, `decoded cell ${column},${rowFromTop}`).toBeDefined();

        const point = [column, rowFromTop] as const;
        const value = annotation(region(
          [{ stencil: '1x1', points: [point] }],
          true,
          [component([point])],
        ));
        const projected = projectStencilCoverComponents(value, size);
        const outline = projectStencilCoverOutline(value, size);
        expect(projected).toHaveLength(1);
        expect(outline?.positive.path).toBeTruthy();

        const expected = geometry.toSVG({ x: decoded!.x, y: decoded!.y });
        const tintCell = projected![0].cells[0];
        expect(tintCell.x + half).toBeCloseTo(expected.x, 6);
        expect(tintCell.y + half).toBeCloseTo(expected.y, 6);

        const leftEdgeX = geometry.pad + (column - 0.5) * geometry.cell;
        const expectedLeftEdge = `M${format(leftEdgeX)} ${format(expected.y - half)}L${format(leftEdgeX)} ${format(expected.y + half)}`;
        expect(outline!.positive.path).toContain(expectedLeftEdge);
      }
    }
  });
});

describe('projectStencilCoverComponents', () => {
  it('tints raw thresholded cells even when the placement cover leaves one uncovered', () => {
    const raw = component([[2, 2], [3, 2]], 'fallback', 1);
    const value = annotation(region(
      [{ stencil: '1x1', points: [[2, 2]] }],
      false,
      [raw],
    ));
    const projected = projectStencilCoverComponents(value, 9);
    const outline = projectStencilCoverOutline(value, 9);

    expect(projected).toHaveLength(1);
    expect(projected?.[0].cells).toHaveLength(2);
    expect(projected?.[0].status).toBe('fallback');
    expect(projected?.[0].colorIndex).toBeGreaterThanOrEqual(0);
    expect(outline?.positive.path).toBeTruthy();
    expect(segmentCount(outline!.positive.path)).toBe(4);
  });

  it('assigns different cluster-8 colors to every pair of neighboring regions', () => {
    const value = annotation(
      region([], true, [component([[1, 1]])]),
      region([], true, [
        component([[2, 1]]),
        component([[7, 7]]),
      ]),
    );
    const projected = projectStencilCoverComponents(value, 9);
    expect(projected).toHaveLength(3);

    const byId = new Map(projected!.map(entry => [entry.id, entry]));
    expect(byId.get('positive-0')!.colorIndex)
      .not.toBe(byId.get('negative-0')!.colorIndex);
    expect(byId.get('positive-0')!.colorIndex)
      .toBe(byId.get('negative-1')!.colorIndex);
  });

  it('keeps per-component solver outcomes available to the renderer', () => {
    const value = annotation(
      region([], true, [
        component([[1, 1]], 'optimal'),
        component([[4, 4]], 'feasible'),
      ]),
    );
    const projected = projectStencilCoverComponents(value, 9);
    expect(projected?.map(entry => entry.status)).toEqual(['optimal', 'feasible']);
    expect(projected?.map(entry => entry.tileCount)).toEqual([1, 1]);
  });

  it('returns an empty list when a valid v2 annotation has no thresholded cells', () => {
    expect(projectStencilCoverComponents(annotation(region([])), 9)).toEqual([]);
  });

  it('rejects disconnected or overlapping raw component cells', () => {
    const disconnected = annotation(
      region([], true, [component([[1, 1], [3, 1]])]),
    );
    expect(projectStencilCoverComponents(disconnected, 9)).toBeNull();

    const overlapping = annotation(
      region([], true, [component([[1, 1]])]),
      region([], true, [component([[1, 1]])]),
    );
    expect(projectStencilCoverComponents(overlapping, 9)).toBeNull();
  });

  it('does not invent raw cells for a legacy v1 annotation', () => {
    const legacy = {
      version: 1 as const,
      threshold: 0.6,
      width: 9,
      height: 9,
      positive: {
        placements: [],
        tileCount: 0,
        optimal: true,
        status: 'empty' as const,
      },
      negative: {
        placements: [],
        tileCount: 0,
        optimal: true,
        status: 'empty' as const,
      },
      optimal: true,
    };
    expect(projectStencilCoverComponents(legacy, 9)).toBeNull();
  });
});
