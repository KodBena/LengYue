/**
 * src/engine/stencil-cover-geometry.ts
 *
 * Pure board projection for the proxy's stencil-cover annotation:
 * - solved stencil placements become per-sign boundary paths;
 * - version-2 raw thresholded components become translucent palette fills
 *   with per-component status outlines.
 *
 * Raw components and solved placements are intentionally projected
 * independently. A coverage discrepancy must remain visible rather than
 * causing the raw cells to disappear with an invalid or incomplete cover.
 *
 * License: Public Domain (The Unlicense)
 */
import { boardGeometry, boardPointFromTopOrigin } from './board-geometry';
import type { BoardPoint } from './board-geometry';
import type {
  StencilCoverAnnotation,
  StencilCoverComponent,
  StencilCoverComponentStatus,
  StencilCoverRegionBase,
  KataGoArrayPoint,
} from './katago/types';

export interface StencilCoverRegionOutline {
  readonly path: string;
  readonly optimal: boolean;
}

export interface StencilCoverOutline {
  readonly positive: StencilCoverRegionOutline;
  readonly negative: StencilCoverRegionOutline;
}

export interface StencilCoverTintCell {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface StencilCoverComponentProjection {
  readonly id: string;
  readonly colorIndex: number;
  readonly cells: readonly StencilCoverTintCell[];
  readonly path: string;
  readonly tileCount: number;
  readonly optimal: boolean;
  readonly status: StencilCoverComponentStatus;
}

type BoundaryEdge =
  | { readonly orientation: 'vertical'; readonly line: number; readonly segment: number }
  | { readonly orientation: 'horizontal'; readonly line: number; readonly segment: number };

const CLUSTER_PALETTE_SIZE = 8;

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function addEdge(edges: Map<string, BoundaryEdge>, edge: BoundaryEdge): void {
  const key = edge.orientation + ':' + edge.line + ':' + edge.segment;
  if (!edges.has(key)) edges.set(key, edge);
}

function validPoint(point: unknown, size: number): point is KataGoArrayPoint {
  if (!Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point;
  return typeof x === 'number' && Number.isInteger(x)
    && typeof y === 'number' && Number.isInteger(y)
    && x >= 0 && x < size
    && y >= 0 && y < size;
}

function edgesToPath(edges: Map<string, BoundaryEdge>, size: number): string {
  const geometry = boardGeometry(size);
  const half = geometry.cell / 2;
  const commands: string[] = [];

  for (const edge of edges.values()) {
    if (edge.orientation === 'vertical') {
      const x = geometry.pad + (edge.line - 0.5) * geometry.cell;
      const centerY = geometry.toSVG({ x: 0, y: edge.segment }).y;
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
 * Build one boundary path for a signed region. Returns null for malformed,
 * overlapping, or out-of-board placement data rather than drawing a
 * plausible-looking partial cover. The shared occupancy set also ensures
 * positive and negative covers cannot claim the same board point.
 */
function regionBoundaryPath(
  region: StencilCoverRegionBase,
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

  for (const placement of region.placements) {
    if (
      !placement
      || typeof placement.stencil !== 'string'
      || placement.stencil.length === 0
      || !Array.isArray(placement.points)
      || placement.points.length === 0
    ) return null;

    const local = new Set<string>();
    const boardPoints: BoardPoint[] = [];
    for (const wirePoint of placement.points as readonly unknown[]) {
      if (!validPoint(wirePoint, size)) return null;
      const point = boardPointFromTopOrigin(wirePoint[0], wirePoint[1], size);
      const key = point.x + ',' + point.y;
      if (local.has(key) || occupiedAcrossSigns.has(key)) return null;
      local.add(key);
      occupiedAcrossSigns.add(key);
      boardPoints.push(point);
    }

    for (const point of boardPoints) {
      const { x, y } = point;
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

  return edgesToPath(edges, size);
}

/** True only when every cell belongs to one 4-connected component. */
function isFourConnected(indices: ReadonlySet<number>, size: number): boolean {
  if (indices.size === 0) return false;
  const first = indices.values().next().value;
  if (typeof first !== 'number') return false;
  const reached = new Set<number>();
  const pending = [first];
  while (pending.length > 0) {
    const point = pending.pop();
    if (point === undefined || reached.has(point)) continue;
    reached.add(point);
    const x = point % size;
    const neighbours = [
      ...(x > 0 ? [point - 1] : []),
      ...(x + 1 < size ? [point + 1] : []),
      ...(point >= size ? [point - size] : []),
      ...(point + size < size * size ? [point + size] : []),
    ];
    for (const neighbour of neighbours) {
      if (indices.has(neighbour) && !reached.has(neighbour)) pending.push(neighbour);
    }
  }
  return reached.size === indices.size;
}

/** External perimeter of one raw component; internal cell edges are omitted. */
function componentBoundaryPath(
  cells: readonly BoardPoint[],
  size: number,
): string {
  const occupied = new Set(cells.map(({ x, y }) => y * size + x));
  const edges = new Map<string, BoundaryEdge>();
  for (const { x, y } of cells) {
    const point = y * size + x;
    if (x === 0 || !occupied.has(point - 1)) {
      addEdge(edges, { orientation: 'vertical', line: x, segment: y });
    }
    if (x + 1 === size || !occupied.has(point + 1)) {
      addEdge(edges, { orientation: 'vertical', line: x + 1, segment: y });
    }
    if (y === 0 || !occupied.has(point - size)) {
      addEdge(edges, { orientation: 'horizontal', line: y, segment: x });
    }
    if (y + 1 === size || !occupied.has(point + size)) {
      addEdge(edges, { orientation: 'horizontal', line: y + 1, segment: x });
    }
  }
  return edgesToPath(edges, size);
}

/**
 * Color the component contact graph using a deterministic degeneracy ordering.
 * The graph is a minor of the 4-neighbour board grid (each validated connected
 * component is contracted to one vertex), hence planar and 5-degenerate.
 * Reverse removal order therefore needs at most six colors; the requested
 * eight-entry cluster palette leaves additional headroom.
 */
function assignClusterColors(adjacency: readonly ReadonlySet<number>[]): readonly number[] | null {
  const remaining = new Set(adjacency.map((_neighbors, index) => index));
  const removalOrder: number[] = [];

  while (remaining.size > 0) {
    let selected = -1;
    let selectedDegree = Number.POSITIVE_INFINITY;
    for (const candidate of remaining) {
      let degree = 0;
      for (const neighbor of adjacency[candidate]) {
        if (remaining.has(neighbor)) degree++;
      }
      if (degree < selectedDegree || (degree === selectedDegree && candidate < selected)) {
        selected = candidate;
        selectedDegree = degree;
      }
    }
    if (selected < 0) return null;
    removalOrder.push(selected);
    remaining.delete(selected);
  }

  const colors = adjacency.map(() => -1);
  for (let index = removalOrder.length - 1; index >= 0; index--) {
    const component = removalOrder[index];
    const used = new Set<number>();
    for (const neighbor of adjacency[component]) {
      if (colors[neighbor] >= 0) used.add(colors[neighbor]);
    }
    let color = -1;
    for (let candidate = 0; candidate < CLUSTER_PALETTE_SIZE; candidate++) {
      if (!used.has(candidate)) {
        color = candidate;
        break;
      }
    }
    if (color < 0) return null;
    colors[component] = color;
  }
  return colors;
}

/**
 * Project version-2 raw components independently of the solver's placements.
 * Returns null for legacy v1 or malformed component data; returns [] when a
 * valid annotation says no cells survived thresholding and policy masking.
 */
export function projectStencilCoverComponents(
  annotation: StencilCoverAnnotation | null | undefined,
  size: number,
): readonly StencilCoverComponentProjection[] | null {
  if (
    !annotation
    || annotation.version !== 2
    || annotation.width !== size
    || annotation.height !== size
    || !Number.isInteger(size)
    || size < 2
    || !Array.isArray(annotation.positive.components)
    || !Array.isArray(annotation.negative.components)
  ) return null;

  const entries: {
    readonly id: string;
    readonly component: StencilCoverComponent;
    readonly points: readonly BoardPoint[];
    readonly indices: ReadonlySet<number>;
  }[] = [];
  const ownerByCell = new Map<number, number>();

  const addRegion = (
    sign: 'positive' | 'negative',
    components: readonly StencilCoverComponent[],
  ): boolean => {
    for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
      const component = components[componentIndex];
      if (
        !component
        || !Array.isArray(component.cells)
        || component.cells.length === 0
        || !Number.isInteger(component.tileCount)
        || component.tileCount < 1
        || typeof component.optimal !== 'boolean'
        || !['fallback', 'optimal', 'feasible'].includes(component.status)
        || component.optimal !== (component.status === 'optimal')
      ) return false;

      const indices = new Set<number>();
      const boardPoints: BoardPoint[] = [];
      for (const wirePoint of component.cells as readonly unknown[]) {
        if (!validPoint(wirePoint, size)) return false;
        const point = boardPointFromTopOrigin(wirePoint[0], wirePoint[1], size);
        const index = point.y * size + point.x;
        if (indices.has(index) || ownerByCell.has(index)) return false;
        indices.add(index);
        boardPoints.push(point);
      }
      if (!isFourConnected(indices, size)) return false;

      const entryIndex = entries.length;
      for (const index of indices) ownerByCell.set(index, entryIndex);
      entries.push({
        id: sign + '-' + componentIndex,
        component,
        points: boardPoints,
        indices,
      });
    }
    return true;
  };

  if (!addRegion('positive', annotation.positive.components)) return null;
  if (!addRegion('negative', annotation.negative.components)) return null;

  const adjacency = entries.map(() => new Set<number>());
  for (let index = 0; index < entries.length; index++) {
    for (const cell of entries[index].indices) {
      const x = cell % size;
      const neighbours = [
        ...(x > 0 ? [cell - 1] : []),
        ...(x + 1 < size ? [cell + 1] : []),
        ...(cell >= size ? [cell - size] : []),
        ...(cell + size < size * size ? [cell + size] : []),
      ];
      for (const neighbour of neighbours) {
        const other = ownerByCell.get(neighbour);
        if (other !== undefined && other !== index) {
          adjacency[index].add(other);
          adjacency[other].add(index);
        }
      }
    }
  }

  const colors = assignClusterColors(adjacency);
  if (!colors) return null;

  const geometry = boardGeometry(size);
  const half = geometry.cell / 2;
  return entries.map((entry, index) => ({
    id: entry.id,
    colorIndex: colors[index],
    cells: entry.points.map(point => {
      const { x, y } = point;
      const center = geometry.toSVG(point);
      return {
        key: entry.id + ':' + x + ',' + y,
        x: center.x - half,
        y: center.y - half,
        size: geometry.cell,
      };
    }),
    path: componentBoundaryPath(entry.points, size),
    tileCount: entry.component.tileCount,
    optimal: entry.component.optimal,
    status: entry.component.status,
  }));
}

/**
 * Return signed cover boundary paths for one square board. Legacy v1
 * annotations retain their old outline behaviour; v2 adds raw components.
 */
export function projectStencilCoverOutline(
  annotation: StencilCoverAnnotation | null | undefined,
  size: number,
): StencilCoverOutline | null {
  if (
    !annotation
    || (annotation.version !== 1 && annotation.version !== 2)
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
