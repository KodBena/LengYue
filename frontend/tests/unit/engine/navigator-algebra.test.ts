/**
 * tests/unit/engine/navigator-algebra.test.ts
 *
 * Tier-1 (pure-logic) tests for the variation-navigation algebra
 * adjudicated 2026-08-06 (ledger rows 483/494/497,
 * `.claude/dispatch-reports/nav-algebra-diagnosis.md`, option 3 —
 * "memory-qualified L1", final, not to be redesigned).
 *
 * Three groups:
 *   1. The diagnosis's own truth table (fixtures A and B), ported
 *      from the read-only diagnosis's scratch tests with the 11
 *      defect rows' assertions flipped to the now-lawful outcome —
 *      this is the closest thing to a literal before/after diff the
 *      diagnosis produced.
 *   2. Regression locks for the maintainer's three verbatim complaint
 *      scenarios (a)/(b)/(c), each naming the complaint it closes.
 *   3. Property-based tests over randomly generated trees
 *      (`nav-tree-generator.ts`) for laws L1-L5.
 *
 * `navigateVariation` / `navigateToggleMainLine`'s `main` unit tests
 * (the pre-existing sibling-switch/no-op/toggle-memory coverage) live
 * in `navigator.test.ts`, which this file complements rather than
 * duplicates — this file exists to pin the ALGEBRA (the fork-frame
 * fix and the L4 loud-no-op contract) as its own dedicated, clearly
 * labeled surface, per the dispatch's "tests... encode the ADOPTED
 * algebra" instruction and ADR-0021 (the laws ARE the spec).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../../src/engine/sgf-loader';
import {
  navigateTo,
  navigateVariation,
  navigateToggleMainLine,
} from '../../../src/engine/navigator';
import type { BranchSwitchOutcome } from '../../../src/engine/navigator';
import type { BoardState, GameNode, NodeId } from '../../../src/types';
import {
  mulberry32,
  generateTreeSpec,
  renderSgf,
  allPaths,
  resolvePath,
} from './nav-tree-generator';

function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

// ── Fixture A — the maintainer's exact shape ────────────────────────────────
//
// R -- M1(fork,2ch) -- A(main,1ch) -- A2(leaf)
//                   \-- B(branch head, ITSELF a fork,2ch) -- B0(leaf)
//                                                          \-- B1(leaf)
const FIXTURE_A =
  '(;FF[4]GM[1]SZ[19]' +
  ';B[pd]' + // M1
  '(;W[dp];B[qq])' + // A -> A2
  '(;W[pp](;B[dq])(;B[fq]))' + // B -> B0 / B1
  ')';

function idsA(board: BoardState) {
  const R = board.rootNodeId;
  const M1 = board.nodes[R].children[0];
  const A = board.nodes[M1].children[0];
  const A2 = board.nodes[A].children[0];
  const B = board.nodes[M1].children[1];
  const B0 = board.nodes[B].children[0];
  const B1 = board.nodes[B].children[1];
  return { R, M1, A, A2, B, B0, B1 };
}

// ── Fixture B — deeper tree with cousins (isolates the bug's true trigger:
// a branch head that is ALSO itself a fork, vs. one that isn't) ────────────
//
// R -- G1(fork,2ch) -- X(main,1ch) -- X1(fork,2ch) -- X1a(leaf)
//                                                   \- X1b(leaf)
//                   \- Y(branch head, NOT itself a fork,1ch) -- Y1(leaf)
const FIXTURE_B =
  '(;FF[4]GM[1]SZ[19]' +
  ';B[pd]' + // G1
  '(;W[dp]' + //   X
  '(;B[qq](;W[jj])(;W[kk]))' + //   X -> X1 -> X1a/X1b
  ')' +
  '(;W[pp]' + //   Y (branch head, NOT itself a fork)
  ';B[dq]' + //   Y -> Y1
  ')' +
  ')';

function idsB(board: BoardState) {
  const R = board.rootNodeId;
  const G1 = board.nodes[R].children[0];
  const X = board.nodes[G1].children[0];
  const Y = board.nodes[G1].children[1];
  const X1 = board.nodes[X].children[0];
  const X1a = board.nodes[X1].children[0];
  const X1b = board.nodes[X1].children[1];
  const Y1 = board.nodes[Y].children[0];
  return { R, G1, X, Y, X1, X1a, X1b, Y1 };
}

// ── Group 1: the diagnosis's truth table, adopted-algebra expectations ─────

describe('TRUTH TABLE (adopted algebra) — fixture A', () => {
  it('row 1 (was: right from M1 lands on B, "correct by coincidence"): standing exactly ON the fork M1 is now a LOUD no-op — no ancestor fork exists above M1 to supply a breadth frame', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.M1);
    const before = board.currentNodeId;
    const outcome = navigateVariation(board, +1);
    expect(board.currentNodeId).toBe(before);
    expect(outcome).toEqual({ ok: false, reason: 'no-fork' });
  });

  it('row 2 FIXED (was: right from B lands on CHILD B1 — depth-as-breadth, complaint (b)): right from B is now a LOUD out-of-range no-op — B is resolved in M1\'s breadth frame (B is M1\'s LAST child), not its own', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const before = board.currentNodeId;
    const outcome = navigateVariation(board, +1);
    expect(board.currentNodeId).toBe(before); // never descends into B1
    expect(outcome).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('row 3 FIXED (was: left from B silently no-ops instead of orienting to the main line, complaint (c)): left from B now SUCCEEDS and lands on A (unvisited branch head) — the main line, per L3 orientation', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const outcome = navigateVariation(board, -1);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.A);
  });

  it('row 4 FIXED (was: right(->B1) then left lands on B0, not back on B — complaint (a) verbatim): right from B no longer succeeds at all, so the complaint\'s own first step is foreclosed', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const rightOutcome = navigateVariation(board, +1);
    expect(rightOutcome.ok).toBe(false); // was the first half of the complaint; now a no-op
    expect(board.currentNodeId).toBe(N.B); // never left B
  });

  it('row 5 FIXED (was: right-from-A2-then-left stayed at B, never returned): A2 -right-> B(unvisited head) -left-> A2 exactly — L1 memory-qualified round trip', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.A2);
    const right = navigateVariation(board, +1);
    expect(right).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.B); // B never visited before -> lands on its head
    const left = navigateVariation(board, -1);
    expect(left).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.A2); // exact round trip: A2's own remembered position on A
  });

  it('row 6 UNCHANGED-BY-DESIGN (memory/closure crux, L5 over L2 depth): visiting B1 then switching from A2 lands DIRECTLY on B1, two generations below branch head B — intentional per the adjudicated algebra (option 3), not a defect', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B1); // writes B.lastVisitedDescendant = B1
    navigateTo(board, N.A2); // back to the main line
    const outcome = navigateVariation(board, +1);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.B1); // memory (L5) wins over "land on the branch head"
  });

  it('row 7 FIXED (was: toggle at B never reaches the main line A at all): toggle at B now reaches A — toggle shares the SAME parent-first fork walk as navigateVariation', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const memory = new Map<string, number>();
    const outcome = navigateToggleMainLine(board, memory);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.A);
  });
});

describe('TRUTH TABLE (adopted algebra) — fixture B (cousins, non-fork branch head — the contrast fixture)', () => {
  it('row B1 UNCHANGED: from X1a (fork two levels below G1), right cycles locally to X1b — was never buggy (X1a has 0 children, self-check never mattered)', () => {
    const board = load(FIXTURE_B);
    const N = idsB(board);
    navigateTo(board, N.X1a);
    const outcome = navigateVariation(board, +1);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.X1b);
  });

  it('row B2 UNCHANGED: from Y1 (child of non-forking branch head Y), left walks past Y to G1 and lands on X', () => {
    const board = load(FIXTURE_B);
    const N = idsB(board);
    navigateTo(board, N.Y1);
    const outcome = navigateVariation(board, -1);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.X);
  });

  it('row B3 UNCHANGED (the pre-existing-correct contrast case): from Y itself (branch head, NOT itself a fork — only 1 child), left correctly reaches X — proves the bug was specific to a SELF-forking branch head, not branch heads generally', () => {
    const board = load(FIXTURE_B);
    const N = idsB(board);
    navigateTo(board, N.Y);
    const outcome = navigateVariation(board, -1);
    expect(outcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.X);
  });

  it('standing exactly ON the true root fork G1 is a LOUD no-op — same law as fixture A row 1, generalized', () => {
    const board = load(FIXTURE_B);
    const N = idsB(board);
    navigateTo(board, N.G1);
    const before = board.currentNodeId;
    const outcome = navigateVariation(board, +1);
    expect(board.currentNodeId).toBe(before);
    expect(outcome).toEqual({ ok: false, reason: 'no-fork' });
  });
});

// ── Group 2: regression locks for the maintainer's verbatim complaints ─────

describe('regression locks — maintainer complaint scenarios (verbatim, from the diagnosis)', () => {
  it('complaint (a): "right takes the right child [B1], then left takes the LEFT child [B0]" — this scenario can no longer occur: right from a self-forking branch head is now a no-op, not a descent', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const right = navigateVariation(board, +1);
    // The complaint's premise (right takes you to a child) is false
    // under the fix: right is a no-op, so there is no child to
    // mistakenly "left" back out of asymmetrically.
    expect(right.ok).toBe(false);
    expect(board.currentNodeId).toBe(N.B);
    expect(board.currentNodeId).not.toBe(N.B1);
  });

  it('complaint (b): a node that is a branch head AND a fork resolves variation-step in the WRONG frame (its own children instead of the ancestor fork\'s siblings) — now resolves in the ancestor frame', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    const outcome = navigateVariation(board, +1);
    // Old behavior: {ok: true}-shaped move to B1 (a CHILD of B — the
    // depth frame). New behavior: a no-op, because B's own children
    // are never consulted by navigateVariation at all anymore.
    expect(outcome).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('complaint (c): left from that same node is a totally silent no-op instead of orienting toward the main line — now succeeds AND, separately, every no-op anywhere is loud (L4)', () => {
    const board = load(FIXTURE_A);
    const N = idsA(board);
    navigateTo(board, N.B);
    // Half 1 of the complaint: left now actually reaches the main line.
    const leftOutcome = navigateVariation(board, -1);
    expect(leftOutcome).toEqual({ ok: true });
    expect(board.currentNodeId).toBe(N.A);
    // Half 2: the loudness contract holds independently — drive a
    // genuine no-op (stepping past the last sibling at the M1 fork)
    // and confirm it names its reason rather than returning bare
    // `undefined`/`void`.
    navigateTo(board, N.B); // B is M1's LAST child (index 1)
    const noOp = navigateVariation(board, +1);
    expect(noOp.ok).toBe(false);
    expect((noOp as { reason: string }).reason).toBe('out-of-range');
  });
});

// ── Group 3: property-based tests over generated trees (L1-L5) ─────────────
//
// `SEEDS` is a small, fixed set of PRNG seeds — deterministic, so a
// failure is reproducible by re-running with the same seed (no
// Math.random anywhere in `nav-tree-generator.ts`, per the dispatch's
// "determinism required" instruction). Each seed generates a fresh
// tree; `TRIES_PER_SEED` random (start-path, direction) samples are
// drawn per tree, filtered to the cases where the precondition
// actually holds (a fork exists / an in-range step exists) — the
// generator makes no fork-existence guarantee (see its docstring), so
// the properties below are stated and asserted only over the subset
// where the relevant `BranchSwitchOutcome` was `ok: true`, matching
// the diagnosis's own property-test shape.

const SEEDS = [1, 7, 42, 1337, 90210, 20260806, 8675309, 271828];
const TRIES_PER_SEED = 12;

function buildBoard(seed: number): { board: BoardState; paths: string[] } {
  const rand = mulberry32(seed);
  const spec = generateTreeSpec(rand, /* maxDepth */ 5, /* maxBranch */ 3);
  const { sgf: sgfText } = renderSgf(spec, rand);
  const board = load(sgfText);
  const paths = allPaths(spec);
  return { board, paths };
}

/** Walks parent pointers from `nodeId` to `ancestorId`; true iff reachable (self counts). */
function isSelfOrDescendant(board: BoardState, nodeId: NodeId, ancestorId: NodeId): boolean {
  let curr: NodeId | null = nodeId;
  while (curr) {
    if (curr === ancestorId) return true;
    curr = board.nodes[curr]?.parent ?? null;
  }
  return false;
}

/** The ancestor of `nodeId` that is a direct child of `forkId` (or null if `nodeId` isn't under `forkId`). */
function branchHeadUnder(board: BoardState, nodeId: NodeId, forkId: NodeId): NodeId | null {
  let curr: GameNode | undefined = board.nodes[nodeId];
  let prev: NodeId | null = null;
  while (curr) {
    if (curr.id === forkId) return prev;
    prev = curr.id;
    curr = curr.parent ? board.nodes[curr.parent] : undefined;
  }
  return null;
}

describe('property: L1 — memory-qualified inverse (clean round trip returns to the exact node)', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: variationStep(dir) immediately followed by variationStep(-dir), with no intervening navigation, returns to the exact start node whenever the first step succeeds`, () => {
      const { paths } = buildBoard(seed);
      const rand = mulberry32(seed * 31 + 1);
      let sampled = 0;
      for (let i = 0; i < TRIES_PER_SEED; i++) {
        // Fresh board per sample: a "clean" round trip requires no
        // OTHER navigation to have touched the departed branch's
        // memory, which a shared board across samples cannot promise.
        const { board } = buildBoard(seed);
        const path = paths[Math.floor(rand() * paths.length)];
        const startId = resolvePath(board, path);
        const dir = rand() < 0.5 ? 1 : -1;

        navigateTo(board, startId);
        const out = navigateVariation(board, dir);
        if (!out.ok) continue; // precondition not met for this sample; skip
        sampled++;
        const back = navigateVariation(board, -dir);
        // Stepping back always succeeds: the fork found is the same
        // fork (nothing moved the cursor to a different subtree in
        // between), and reversing by `-dir` returns to the index we
        // came from, which is trivially in range.
        expect(back).toEqual({ ok: true });
        expect(board.currentNodeId).toBe(startId);
      }
      // Sanity: the property must have actually been exercised at
      // least once across this seed's samples, or the test proves
      // nothing (ADR-0021: a property test that never hits its own
      // precondition is a vacuous pass).
      expect(sampled).toBeGreaterThan(0);
    });
  }
});

describe('property: L2 — closure over branch identity (landing node always belongs to the chosen sibling line)', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: a successful variationStep lands on a node whose ancestor-at-the-fork's-child-level is EXACTLY fork.children[targetIdx], regardless of how deep memory lands the cursor`, () => {
      const { paths } = buildBoard(seed);
      const rand = mulberry32(seed * 31 + 2);
      let sampled = 0;
      for (let i = 0; i < TRIES_PER_SEED; i++) {
        const { board } = buildBoard(seed);
        const path = paths[Math.floor(rand() * paths.length)];
        const startId = resolvePath(board, path);
        const dir = rand() < 0.5 ? 1 : -1;

        navigateTo(board, startId);
        const out = navigateVariation(board, dir);
        if (!out.ok) continue;
        sampled++;

        // Recover the fork the step must have used: the nearest
        // ancestor of the PREVIOUS position with >1 children — same
        // definition `findNearestFork` uses, computed independently
        // here (not by calling the private helper) so the test is a
        // genuine check, not a tautology against the implementation.
        let forkId: NodeId | null = null;
        let walk: NodeId | null = board.nodes[startId].parent;
        while (walk) {
          if (board.nodes[walk].children.length > 1) { forkId = walk; break; }
          walk = board.nodes[walk].parent;
        }
        expect(forkId).not.toBeNull();

        const branchHead = branchHeadUnder(board, board.currentNodeId, forkId as NodeId);
        expect(branchHead).not.toBeNull();
        // The landing node is always within (or equal to) the chosen
        // branch head's subtree — closure over BRANCH IDENTITY.
        expect(isSelfOrDescendant(board, board.currentNodeId, branchHead as NodeId)).toBe(true);
      }
      expect(sampled).toBeGreaterThan(0);
    });
  }
});

describe('property: L3 — orientation (sibling order is the fixed children[] array order; direction is monotonic in index)', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: repeated +1 steps from a fork\'s first child visit branch heads in children[] order, never skipping or reversing`, () => {
      const rand = mulberry32(seed * 31 + 3);
      const { paths } = buildBoard(seed);
      // Find a genuine fork among the generated paths (children.length > 1).
      const { board: probeBoard } = buildBoard(seed);
      const forkPath = paths.find(p => {
        const id = resolvePath(probeBoard, p);
        return probeBoard.nodes[id].children.length > 1;
      });
      if (!forkPath) return; // this seed's tree happened to have no fork; other seeds cover it
      void rand; // path selection below is exhaustive, not random — rand kept for signature symmetry

      const board = probeBoard;
      const forkId = resolvePath(board, forkPath);
      const fork = board.nodes[forkId];
      const firstChild = fork.children[0];

      navigateTo(board, firstChild);
      const visited: NodeId[] = [firstChild];
      for (let i = 1; i < fork.children.length; i++) {
        const outcome = navigateVariation(board, +1);
        expect(outcome).toEqual({ ok: true });
        // The branch head under the fork the cursor is now in must be
        // exactly fork.children[i] — the array's i-th entry, in order.
        const head = branchHeadUnder(board, board.currentNodeId, forkId);
        expect(head).toBe(fork.children[i]);
        visited.push(head as NodeId);
      }
      // One more +1 past the last child must be a loud out-of-range no-op.
      const overrun = navigateVariation(board, +1);
      expect(overrun).toEqual({ ok: false, reason: 'out-of-range' });
      // The visited sequence is exactly fork.children in order — no
      // skip, no reversal.
      expect(visited).toEqual(fork.children);
    });
  }
});

describe('property: L4 — a no-op never mutates the cursor or any board field', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: whenever navigateVariation/navigateToggleMainLine no-ops, currentNodeId, stones, captures, turn, and koPoint are all byte-identical to before the call`, () => {
      const { paths } = buildBoard(seed);
      const rand = mulberry32(seed * 31 + 4);
      let sampled = 0;
      for (let i = 0; i < TRIES_PER_SEED; i++) {
        const { board } = buildBoard(seed);
        const path = paths[Math.floor(rand() * paths.length)];
        const startId = resolvePath(board, path);
        navigateTo(board, startId);

        const beforeSnapshot = JSON.stringify({
          currentNodeId: board.currentNodeId,
          stones: board.stones,
          captures: board.captures,
          turn: board.turn,
          koPoint: board.koPoint,
        });

        const dir = rand() < 0.5 ? 1 : -1;
        const useToggle = rand() < 0.5;
        const outcome: BranchSwitchOutcome = useToggle
          ? navigateToggleMainLine(board, new Map())
          : navigateVariation(board, dir);
        if (outcome.ok) continue; // only asserting the no-op case here
        sampled++;

        const afterSnapshot = JSON.stringify({
          currentNodeId: board.currentNodeId,
          stones: board.stones,
          captures: board.captures,
          turn: board.turn,
          koPoint: board.koPoint,
        });
        expect(afterSnapshot).toBe(beforeSnapshot);
      }
      expect(sampled).toBeGreaterThan(0);
    });
  }
});

describe('property: L5 — memory write-through invariant (every ancestor remembers the exact cursor)', () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: after navigateTo(X), every ancestor of X (root..X inclusive) has lastVisitedDescendant === X`, () => {
      const { paths } = buildBoard(seed);
      const rand = mulberry32(seed * 31 + 5);
      for (let i = 0; i < TRIES_PER_SEED; i++) {
        const { board } = buildBoard(seed);
        const path = paths[Math.floor(rand() * paths.length)];
        const targetId = resolvePath(board, path);
        // `navigateTo` early-returns (no write-through at all) when
        // the target is already the current node (`navigator.ts`'s
        // `if (state.currentNodeId === targetNodeId) return;`) — a
        // fresh board's `currentNodeId` starts at `rootNodeId`, so a
        // sampled root path is a genuine `navigateTo` no-op, not a
        // case this invariant (which is about what a REAL move
        // writes) applies to.
        if (board.currentNodeId === targetId) continue;
        navigateTo(board, targetId);

        let walk: NodeId | null = targetId;
        while (walk) {
          expect(board.nodes[walk].lastVisitedDescendant).toBe(targetId);
          walk = board.nodes[walk].parent;
        }
      }
    });
  }
});
