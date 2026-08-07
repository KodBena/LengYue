/**
 * tests/unit/engine/nav-tree-generator.ts
 *
 * Deterministic, seeded random game-tree generator for the
 * property-based navigator-algebra tests
 * (`navigator-algebra.test.ts`). No `fast-check` dependency exists in
 * this repo (checked before writing this — `package.json` has no
 * `fast-check` entry, `node_modules/fast-check` absent) and the
 * dispatch instructions are explicit: write a small seeded generator
 * by hand rather than adding a property-testing dependency without
 * adjudication. This file is that generator.
 *
 * ── Determinism ──────────────────────────────────────────────────
 * `mulberry32` is a tiny, well-known deterministic PRNG (32-bit
 * state, one multiply-heavy mix per call) seeded by a plain number —
 * no `Math.random()` anywhere in this file. Two calls with the same
 * seed produce the exact same tree, satisfying the "no Math.random
 * without seed" requirement and making a failing property test
 * reproducible by its seed alone.
 *
 * ── Why the coordinates are non-adjacent by construction ─────────
 * Generated trees are turned into real SGF text and loaded through
 * `loadSgf` (the same path production code takes), so the rules
 * engine (`validateMove`) runs during hydration. Two *adjacent*
 * stones can interact (capture, suicide, ko) in ways that would
 * either mutate the tree structure the test expects (a captured
 * stone disappearing) or trigger `sgf-loader.ts`'s per-node
 * `console.warn` skip path (an illegal move), neither of which this
 * generator wants to reason about — the property tests are about
 * navigation algebra, not Go rules. Every generated move's (x, y) is
 * drawn from the EVEN-only lattice {0, 2, 4, ..., 18} on both axes:
 * any two distinct lattice points differ by at least 2 in at least
 * one axis, which is greater than the orthogonal-adjacency distance
 * of 1 — so no two generated stones are ever adjacent, which makes
 * capture, suicide, and ko structurally impossible regardless of
 * color assignment. Coordinates are drawn from a single shuffled
 * pool with no replacement, so no two nodes ever share a point
 * either (the "occupied point" illegal-move class). Both illegal-
 * move classes `validateMove` checks are foreclosed by construction,
 * not by chance.
 *
 * License: Public Domain (The Unlicense)
 */

// ── Seeded PRNG ────────────────────────────────────────────────────────────

/** mulberry32: deterministic, seeded, [0, 1) uniform. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, maxExclusive: number): number {
  return Math.floor(rand() * maxExclusive);
}

// ── Tree spec ────────────────────────────────────────────────────────────

/** A bare shape spec — no move/coordinate data yet, just branching. */
export interface TreeSpec {
  children: TreeSpec[];
}

/**
 * Generates a random `TreeSpec` up to `maxDepth` plies. No attempt to
 * guarantee a fork exists anywhere — callers that need "a fork
 * reachable from this start node" filter on that fact using the real
 * `BoardState` after generation (see `navigator-algebra.test.ts`'s
 * property tests, which sample many (seed, node) pairs and only
 * assert once the precondition holds).
 *
 * Child count is biased to at least 1 while well short of `maxDepth`
 * (`randInt(maxBranch) + 1`, i.e. 1..maxBranch) so a tree doesn't
 * fizzle out into a single bare root on an unlucky roll — a real risk
 * at an unbiased 0..maxBranch draw: seed 7 at `maxBranch=3` rolled 0
 * children at the ROOT (25% chance per roll), producing a one-node
 * tree with zero forks — a vacuous input for every property test
 * below, witnessed directly while authoring these tests. Only within
 * 2 plies of `maxDepth` does 0 become possible again (`randInt(maxBranch
 * + 1)`, i.e. 0..maxBranch), so trees still terminate in genuine
 * leaves rather than being forced to fill every level to the ceiling.
 */
export function generateTreeSpec(
  rand: () => number,
  maxDepth: number,
  maxBranch: number,
  depth = 0,
): TreeSpec {
  if (depth >= maxDepth) return { children: [] };
  const nearCeiling = depth >= maxDepth - 2;
  const childCount = nearCeiling
    ? randInt(rand, maxBranch + 1) // 0..maxBranch — allow natural leaves near the end
    : randInt(rand, maxBranch) + 1; // 1..maxBranch — keep the tree growing
  const children: TreeSpec[] = [];
  for (let i = 0; i < childCount; i++) {
    children.push(generateTreeSpec(rand, maxDepth, maxBranch, depth + 1));
  }
  return { children };
}

// ── SGF coordinate pool ────────────────────────────────────────────────────

const EVEN_COORDS: number[] = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]; // 10 values

/** Fisher-Yates over the full 10×10 even-lattice, seeded. */
function shuffledCoordPool(rand: () => number): string[] {
  const pool: string[] = [];
  for (const x of EVEN_COORDS) {
    for (const y of EVEN_COORDS) {
      pool.push(String.fromCharCode(97 + x) + String.fromCharCode(97 + y));
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * Counts every non-root node in `spec` (the nodes that will need a
 * move coordinate) — used to size-check the coordinate pool up front
 * so a too-large tree fails loudly at generation time instead of
 * silently reusing a coordinate (which would trigger the
 * "occupied point" illegal-move path this generator exists to
 * avoid).
 */
function countMoveNodes(spec: TreeSpec): number {
  let count = 0;
  for (const child of spec.children) {
    count += 1 + countMoveNodes(child);
  }
  return count;
}

/**
 * Renders `spec` as SGF source text, walking depth-first and
 * assigning the next unused coordinate from `pool` to each non-root
 * node. Colors alternate by depth (B at odd depth, W at even) purely
 * for readability in a failing test's dumped SGF — `validateMove`
 * does not check whose "turn" a move is on (only occupancy/suicide/
 * ko), so this has no bearing on legality.
 *
 * Returns both the SGF string and `pathToNode`: a map from a
 * dot-joined child-index path (`""` for root, `"0"` for the root's
 * first child, `"0.1"` for that child's second child, ...) to the
 * coordinate string minted for it — NOT to a `NodeId` (those are
 * minted fresh, opaque, at `loadSgf` time). Callers resolve a path to
 * an actual `NodeId` by walking `board.nodes[...].children[idx]` from
 * `board.rootNodeId`, which is sound because `transform`
 * (`sgf-loader.ts`) preserves child order 1:1 from the parsed SGF.
 */
export function renderSgf(spec: TreeSpec, rand: () => number): { sgf: string; nodeCount: number } {
  const moveNodeCount = countMoveNodes(spec);
  const pool = shuffledCoordPool(rand);
  if (moveNodeCount > pool.length) {
    throw new Error(
      `nav-tree-generator: generated tree has ${moveNodeCount} move nodes, exceeding the ` +
      `${pool.length}-coordinate even-lattice pool. Lower maxDepth/maxBranch in the caller.`,
    );
  }

  let cursor = 0;
  function render(node: TreeSpec, depth: number, isRoot: boolean): string {
    let s = ';';
    if (isRoot) {
      s += 'FF[4]GM[1]SZ[19]';
    } else {
      const color = depth % 2 === 1 ? 'B' : 'W';
      const coord = pool[cursor++];
      s += `${color}[${coord}]`;
    }
    if (node.children.length === 0) return s;
    if (node.children.length === 1) {
      return s + render(node.children[0], depth + 1, false);
    }
    return s + node.children.map(c => '(' + render(c, depth + 1, false) + ')').join('');
  }

  return { sgf: '(' + render(spec, 0, true) + ')', nodeCount: moveNodeCount };
}

// ── Path resolution ────────────────────────────────────────────────────────

import type { BoardState, NodeId } from '../../../src/types';

/**
 * Every dot-joined child-index path reachable in `spec`, including
 * `""` for the root. Order matches a pre-order walk; callers pick a
 * random entry (via the SAME seeded `rand`) to select a start node
 * for a property test, so which path is picked is itself
 * reproducible from the seed.
 */
export function allPaths(spec: TreeSpec, prefix = ''): string[] {
  const out = [prefix];
  spec.children.forEach((child, i) => {
    out.push(...allPaths(child, prefix === '' ? String(i) : `${prefix}.${i}`));
  });
  return out;
}

/** Resolves a dot-joined child-index path to the loaded board's NodeId. */
export function resolvePath(board: BoardState, path: string): NodeId {
  if (path === '') return board.rootNodeId;
  let id = board.rootNodeId;
  for (const segment of path.split('.')) {
    const idx = Number(segment);
    id = board.nodes[id].children[idx];
  }
  return id;
}
