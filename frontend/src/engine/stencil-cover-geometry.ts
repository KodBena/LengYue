/**
 * src/engine/stencil-cover-geometry.ts
 *
 * Projects the proxy's signed stencil placements into board-aligned SVG
 * boundary paths. Each colour gets one path, regardless of tile count; shared
 * edges between adjacent tiles are emitted once so internal tiling seams are
 * preserved without double-width strokes.
 *
 * Rendering projection only. It does not recompute regions, solve covers, or
 * reinterpret dead-stone / policy masks.
 *
 * License: Public Domain (The Unlicense)
 */
import { boardGeometry } from './board-geometry';
import type {
  StencilCoverAnnotation,
  StencilCoverPlacement,
  StencilCoverRegion,
} from './katago/types';

export interface StencilCoverRegionOutline {
  readonly path: string;
  readonly optimal: boolean;
}

export interface StencilCoverOutline {
  readonly positive: StencilCoverRegionOutline;
  readonly negative: StencilCoverRegionOutline;
}

type BoundaryEdge =
  | { readonly orientation: 'vertical'; readonly line: number; readonly segment: number }
  | { readonly orientation: 'horizontal'; readonly line: number; readonly segment: number };

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function addEdge(edges: Map<string, BoundaryEdge>, edge: BoundaryEdge): void {
  const key = edge.orientation + ':' + edge.line + ':' + edge.segment;
  if (!edges.has(key)) edges.set(key, edge);
}

function validPoint(point: unknown, size: number): point is readonly [number, number] {
  if (!Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point;
  return typeof x === 'number' && Number.isInteger(x)
    && typeof y === 'number' && Number.isInteger(y)
    && x >= 0 && x < size
    && y >= 0 && y < size;
}

/**
 * Build one boundary path for a signed region. Returns null for malformed,
 * overlapping, or out-of-board placement data rather than drawing a
 * plausible-looking partial cover. The shared occupancy set also ensures
 * positive and negative covers cannot claim the same board point.
 */
function regionBoundaryPath(
  region: StencilCoverRegion,
  size: number,
  occupiedAcrossSigns: Set<string>,
): string | null {
  if (
    !region
    || !Array.isArray(region.placements)
    || !Number.isInteger(region.tileCount)
    || region.tileCount !== region.placements.length
    || typeof region.optimal !== 'boolean'
    || !['empty', 'fallback', 'optimal', 'feasible'].includes(region.status)
  ) return null;

  const edges = new Map<string, BoundaryEdge>();

  for (const placement of region.placements as readonly StencilCoverPlacement[]) {
    if (
      !placement
      || typeof placement.stencil !== 'string'
      || placement.stencil.length === 0
      || !Array.isArray(placement.points)
      || placement.points.length === 0
    ) return null;

    const local = new Set<string>();
    for (const point of placement.points as readonly unknown[]) {
      if (!validPoint(point, size)) return null;
      const [x, y] = point;
      const key = x + ',' + y;
      if (local.has(key) || occupiedAcrossSigns.has(key)) return null;
      local.add(key);
      occupiedAcrossSigns.add(key);
    }

    for (const point of placement.points) {
      const [x, y] = point;
      // Board y increases upward. Edge identifiers are integer grid-line
      // indices, shared by the two cells on either side of each edge.
      if (!local.has((x - 1) + ',' + y)) {
        addEdge(edges, { orientation: 'vertical', line: x, segment: y });
      }
      if (!local.has((x + 1) + ',' + y)) {
        addEdge(edges, { orientation: 'vertical', line: x + 1, segment: y });
      }
      if (!local.has(x + ',' + (y - 1))) {
        addEdge(edges, { orientation: 'horizontal', line: y, segment: x });
      }
      if (!local.has(x + ',' + (y + 1))) {
        addEdge(edges, { orientation: 'horizontal', line: y + 1, segment: x });
      }
    }
  }

  const geometry = boardGeometry(size);
  const half = geometry.cell / 2;
  const commands: string[] = [];

  for (const edge of edges.values()) {
    if (edge.orientation === 'vertical') {
      const x = geometry.pad + (edge.line - 0.5) * geometry.cell;
      const centerY = geometry.toSVG(0, edge.segment).y;
      commands.push(
        'M' + format(x) + ' ' + format(centerY - half)
        + 'L' + format(x) + ' ' + format(centerY + half),
      );
    } else {
      const centerX = geometry.pad + edge.segment * geometry.cell;
      const y = geometry.pad + (size - edge.line - 0.5) * geometry.cell;
      commands.push(
        'M' + format(centerX - half) + ' ' + format(y)
        + 'L' + format(centerX + half) + ' ' + format(y),
      );
    }
  }

  return commands.join('');
}

/**
 * Return signed cover boundary paths for one square board. Annotation shape,
 * board dimensions, placement coordinates, and exact-cover non-overlap are
 * checked before any path is emitted.
 */
export function projectStencilCoverOutline(
  annotation: StencilCoverAnnotation | null | undefined,
  size: number,
): StencilCoverOutline | null {
  if (
    !annotation
    || annotation.version !== 1
    || annotation.width !== size
    || annotation.height !== size
    || !Number.isInteger(size)
    || size < 2
  ) return null;

  const occupiedAcrossSigns = new Set<string>();
  const positive = regionBoundaryPath(annotation.positive, size, occupiedAcrossSigns);
  if (positive === null) return null;
  const negative = regionBoundaryPath(annotation.negative, size, occupiedAcrossSigns);
  if (negative === null) return null;

  return {
    positive: { path: positive, optimal: annotation.positive.optimal },
    negative: { path: negative, optimal: annotation.negative.optimal },
  };
}
