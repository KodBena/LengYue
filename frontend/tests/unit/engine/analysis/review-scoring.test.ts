/**
 * tests/unit/engine/analysis/review-scoring.test.ts
 *
 * Tier-1 (pure logic) tests for `scorePerMoveDelta` — the named
 * review-scoring seam extracted from `useReviewSession`
 * (history-lessons audit §3.17; ADR-0003's "the orchestration is
 * portable; the scoring extraction is not"). No DOM, no fakes, no
 * Vue reactivity: the enrichment accessor is a plain map lookup,
 * exactly the parameterisation the seam exists to enable.
 *
 * Pinned behaviour (the lookup order is load-bearing):
 *   - per-colour indexing — the user's move resolves to a
 *     PER-COLOUR index ("0", "1", …), not a full-path index, and
 *     reads only its own colour's `deltas` record;
 *   - the s_1 fast path — when s_1 carries the delta, no path scan
 *     runs;
 *   - the path-scan fallback — when s_1 lacks the delta, the scan
 *     walks the active path IN PATH ORDER and the first
 *     non-undefined value wins;
 *   - the loud-failure branch — a missing delta is a structured
 *     `{ kind: 'missing' }` result, NEVER a silent 0.5 default (the
 *     historical fallback that scored every enrichment failure as a
 *     "neutral" review and corrupted the Ebisu recall update;
 *     ADR-0002).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi } from 'vitest';

import { scorePerMoveDelta } from '../../../../src/engine/analysis/review-scoring';
import type { EnrichmentAccessor } from '../../../../src/engine/analysis/review-scoring';
import type { BoardState, GameNode, NodeId, RootToCurrentPath, StoneColor } from '../../../../src/types';
import type { Enrichment } from '../../../../src/engine/katago/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal GameNode for the scoring walk — only `move.color`
 * is read; everything else is structural filler. The `as NodeId`
 * cast is the standard test-fixture mint (same shape as `1 as CardId`
 * in the integration suites): unit fixtures construct ids directly
 * rather than running the SGF loader.
 */
function makeNode(id: string, color: StoneColor | null): GameNode {
  return {
    id: id as NodeId,
    parent: null,
    children: [],
    activeChildIndex: 0,
    properties: {},
    move: color ? { x: 0, y: 0, color, type: 'place' } : null,
  };
}

/**
 * Build a path fixture from a colour sequence. Index 0 is the root
 * (pass `null` — no move) and the last entry is the just-played move,
 * matching the root→current shape `scorePerMoveDelta` now requires
 * (branded-path-types arc). Returns node ids 'n0', 'n1', … in path
 * order. The `as RootToCurrentPath` cast is the standard test-fixture
 * mint, same shape as `makeNode`'s `as NodeId` above.
 */
function makeFixture(colors: readonly (StoneColor | null)[]): {
  nodes: BoardState['nodes'];
  path: RootToCurrentPath;
} {
  const nodes: BoardState['nodes'] = {};
  const path: NodeId[] = [];
  colors.forEach((color, i) => {
    const node = makeNode(`n${i}`, color);
    nodes[node.id] = node;
    path.push(node.id);
  });
  return { nodes, path: path as RootToCurrentPath };
}

/** Accessor over a plain per-node enrichment map (null when absent). */
function accessorFor(byNode: Record<string, Enrichment>): EnrichmentAccessor {
  return nodeId => byNode[nodeId] ?? null;
}

// ── Per-colour indexing ──────────────────────────────────────────────────────

describe('scorePerMoveDelta — per-colour indexing', () => {
  it('resolves a black move to its per-colour index and reads black.deltas', () => {
    // Path: root, B, W, B — the user's move (s_1 = n3) is the SECOND
    // black move: full-path index 3, per-colour index 1. The fixture
    // plants decoys under black '0' (wrong index) and white '1'
    // (wrong colour) so only the correct (colour, index) pair can
    // produce 0.7.
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);
    const enrichment: Record<string, Enrichment> = {
      n3: {
        black: { deltas: { '0': 0.1, '1': 0.7 } },
        white: { deltas: { '1': 0.9 } },
      },
    };

    const result = scorePerMoveDelta(nodes, path, 3, path[3], accessorFor(enrichment));

    expect(result).toEqual({ kind: 'found', delta: 0.7 });
  });

  it('resolves a white move to its per-colour index and reads white.deltas', () => {
    // Path: root, B, W, B, W — the user's move (s_1 = n4) is the
    // SECOND white move: full-path index 4, per-colour index 1.
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B', 'W']);
    const enrichment: Record<string, Enrichment> = {
      n4: {
        black: { deltas: { '1': 0.8 } },
        white: { deltas: { '0': 0.05, '1': 0.3 } },
      },
    };

    const result = scorePerMoveDelta(nodes, path, 4, path[4], accessorFor(enrichment));

    expect(result).toEqual({ kind: 'found', delta: 0.3 });
  });

  it('does not read the other colour\'s deltas — a white-only entry is a miss for a black move', () => {
    // The wrong-colour record carries exactly the index the lookup
    // wants; selecting it anyway would be the colour-confusion bug
    // the per-colour indexing exists to prevent.
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);
    const enrichment: Record<string, Enrichment> = {
      n3: { white: { deltas: { '1': 0.9 } } },
    };

    const result = scorePerMoveDelta(nodes, path, 3, path[3], accessorFor(enrichment));

    expect(result).toEqual({ kind: 'missing', color: 'B', perColorIndex: 1 });
  });
});

// ── Lookup order (load-bearing) ──────────────────────────────────────────────

describe('scorePerMoveDelta — s_1 fast path and path-scan order', () => {
  it('takes the s_1 fast path when s_1 carries the delta — no path scan runs', () => {
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);
    const enrichment: Record<string, Enrichment> = {
      // Both s_1 and the root carry the key; the fast path must win
      // without ever consulting the root.
      n3: { black: { deltas: { '1': 0.6 } } },
      n0: { black: { deltas: { '1': 0.2 } } },
    };
    const accessor = vi.fn(accessorFor(enrichment));

    const result = scorePerMoveDelta(nodes, path, 3, path[3], accessor);

    expect(result).toEqual({ kind: 'found', delta: 0.6 });
    // Exactly one read — s_1 — pins that the scan never started.
    expect(accessor.mock.calls.map(c => c[0])).toEqual(['n3']);
  });

  it('falls back to the path scan in PATH ORDER when s_1 lacks the delta — first hit wins', () => {
    // s_1 (n3) has no deltas; n1 and n2 both carry the key with
    // different values. Path order means n1's 0.25 wins — taking
    // n2's 0.75 would be the reordering defect the inline comments
    // call load-bearing.
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);
    const enrichment: Record<string, Enrichment> = {
      n1: { black: { deltas: { '1': 0.25 } } },
      n2: { black: { deltas: { '1': 0.75 } } },
    };
    const accessor = vi.fn(accessorFor(enrichment));

    const result = scorePerMoveDelta(nodes, path, 3, path[3], accessor);

    expect(result).toEqual({ kind: 'found', delta: 0.25 });
    // Read sequence pins the whole order: s_1 fast path first, then
    // the scan from path[0], stopping at the first hit (n1) — n2 and
    // n3 are never re-read.
    expect(accessor.mock.calls.map(c => c[0])).toEqual(['n3', 'n0', 'n1']);
  });

  it('treats a present delta of 0 as found — the comparison is against undefined, not falsiness', () => {
    // A 0.0 delta is a legitimate (worst) score. A regression to a
    // truthiness check would skip it and mis-route to the scan /
    // missing branch.
    const { nodes, path } = makeFixture([null, 'B']);
    const enrichment: Record<string, Enrichment> = {
      n0: { black: { deltas: { '0': 0 } } },
    };

    const result = scorePerMoveDelta(nodes, path, 1, path[1], accessorFor(enrichment));

    expect(result).toEqual({ kind: 'found', delta: 0 });
  });
});

// ── Loud failure (ADR-0002) ──────────────────────────────────────────────────

describe('scorePerMoveDelta — missing delta is a structured failure', () => {
  it('returns the structured miss with colour and per-colour index when no node carries the delta', () => {
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);

    const result = scorePerMoveDelta(nodes, path, 3, path[3], () => null);

    expect(result).toEqual({ kind: 'missing', color: 'B', perColorIndex: 1 });
  });

  it('does NOT silently default to 0.5 — the historical corruption shape', () => {
    // The pre-fix implementation substituted delta = 0.5 here, which
    // scored every enrichment failure as a "neutral" review and
    // corrupted the Ebisu recall update on every occurrence. The
    // seam's contract is that a missing delta NEVER surfaces as a
    // found score — of 0.5 or anything else.
    const { nodes, path } = makeFixture([null, 'B', 'W', 'B']);
    const empty: Record<string, Enrichment> = {
      // Enrichment exists but carries no deltas record at all — the
      // "analysis came back without enrichment" wire shape.
      n3: {},
      n0: { black: {} },
    };

    const result = scorePerMoveDelta(nodes, path, 3, path[3], accessorFor(empty));

    expect(result.kind).toBe('missing');
    expect(result).not.toEqual({ kind: 'found', delta: 0.5 });
  });
});
