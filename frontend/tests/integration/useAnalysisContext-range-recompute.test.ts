/**
 * tests/integration/useAnalysisContext-range-recompute.test.ts
 *
 * Tier-3 (composable integration) regression test for the KDE-recompute-
 * on-range-change defect: `deltaKdeSeries` (and the sibling
 * `mistakeGapHistogramSeries`) previously never read
 * `projection.selectionRange` at all, so the analysis move-range picker
 * had zero effect on either panel — not a stale cache, a missing
 * reactive read (see `.claude/dispatch-reports/kde-recompute-diagnosis.md`).
 *
 * The witness this file is shaped to produce is the reactive-subscription
 * property itself, not slicing arithmetic in isolation: each test drives
 * the real `setSelectionRange` mutation (the same path the range-slider UI
 * uses, store-backed at `BoardState.analysisRange`) and asserts the
 * computed series' `.value` tracks it. Pre-fix, both ranges below produce
 * the identical whole-game series (the computed never subscribed to the
 * range at all), so this suite is red against the pre-fix code and green
 * against the fix.
 *
 * Mapping anchor under test: `EnrichedSeries.data` entries (and
 * `MistakeMarker.colorLocalIdx`) are colour-local move indices, not
 * PlyIndex and not array position. The fix (and this fixture) locates
 * each colour-local index's PlyIndex via `colorMoveToPly` — the
 * codebase's sole (ColorMoveIndex, StoneColor) -> PlyIndex authority
 * (also used by MergedDeltaPanel / useChartNavigation for this exact
 * series shape) — never via an inline `2*i+parity` guess.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Same service-mocking shape as useAnalysisProjection.test.ts: keep
// resetWorkspace's resource-ownership cleanup off the network, and stub
// the thumbnail cache that useAnalysisContext's dependency chain may warm
// on path changes.
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    warmPath: vi.fn(),
  }),
}));

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { useAnalysisContext } from '../../src/composables/analysis/useAnalysisContext';
import { colorMoveToPly } from '../../src/composables/analysis/useTriangularHeatmap';
import { withSetup } from './with-setup';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';
import type { BoardId, BoardState, ColorMoveIndex, NodeId, PlyIndex } from '../../src/types';
import type { KataAnalysisResponse } from '../../src/engine/katago/types';

// jsdom does not load `src/assets/css/theme.css`, so `themeColor(…)`
// (read by both series computeds for the per-colour swatch) throws loudly
// per ADR-0002 on an empty CSS custom property. Stub the two this suite's
// subject reads directly — mirrors `render-count/jsdom-stubs.ts`'s
// established pattern for the (disjoint) set of vars its subjects read.
const THEME_VARS: Record<string, string> = {
  '--player-black': '#101010',
  '--player-white': '#f0f0f0',
};

beforeEach(() => {
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  for (const [name, value] of Object.entries(THEME_VARS)) {
    document.documentElement.style.setProperty(name, value);
  }
});

function setup(source: string): { boardId: BoardId; board: BoardState } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return { boardId: board.id, board };
}

/** The active variation path node ids for `board` (root → active leaf). */
function activePath(board: BoardState): NodeId[] {
  const ids: NodeId[] = [];
  let curr = board.nodes[board.rootNodeId];
  while (curr) {
    ids.push(curr.id);
    const next = curr.children[curr.activeChildIndex] ?? curr.children[0];
    if (next === undefined) break;
    curr = board.nodes[next];
  }
  return ids;
}

/**
 * Records black/white per-colour-local-index delta maps on a single path
 * node (the enriched-accumulator's per-mIdx arbitration takes the
 * highest-path-index contributor, so a single contributing node is
 * sufficient and keeps the fixture simple). Also records the raw half —
 * `getCombined` treats it as the existence anchor an enrichment-only
 * record would never surface.
 */
function recordDeltas(nodeId: NodeId, black: Record<string, number>, white: Record<string, number>): void {
  const { rawKey, enrichedKey } = activeAnalysisKeys.value;
  const raw: KataAnalysisResponse = {
    id: `q-${nodeId}`,
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [],
    rootInfo: { winrate: 0.5, scoreLead: 0, visits: 1, currentPlayer: 'B' },
  };
  ledger.recordRaw(rawKey, nodeId, raw);
  ledger.recordEnrichment(enrichedKey, nodeId, { black: { deltas: black }, white: { deltas: white } });
}

// 10-move mainline, 5 Black / 5 White, strictly alternating — no handicap
// setup, so colour-local index k for colour C sits at PlyIndex
// colorMoveToPly(k, C) by construction; the fixture's expected ranges are
// derived from that function rather than an inline parity guess, matching
// the fix's own anchor.
const TEN_MOVE_SGF =
  '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd];B[fc];W[cq];B[jj];W[qc];B[nc];W[qq])';

describe('useAnalysisContext.deltaKdeSeries — recomputes on selection-range change', () => {
  it('tracks setSelectionRange: distinct ranges over the same enriched data yield distinct KDE samples', () => {
    const { boardId, board } = setup(TEN_MOVE_SGF);
    const path = activePath(board);
    const leaf = path[path.length - 1];

    // Black colour-local indices 0,1,2 -> plies 1,3,5 (low cluster, 0).
    // Black colour-local indices 3,4   -> plies 7,9   (high cluster, 1000).
    recordDeltas(
      leaf,
      { '0': 0, '1': 0, '2': 0, '3': 1000, '4': 1000 },
      { '0': 0, '1': 0, '2': 0, '3': 1000, '4': 1000 },
    );

    const ctx = withSetup(() => useAnalysisContext(boardId));

    // Sanity: the fixture's plies land where colorMoveToPly says they do.
    expect(colorMoveToPly(2 as ColorMoveIndex, 'B')).toBe(5);
    expect(colorMoveToPly(3 as ColorMoveIndex, 'B')).toBe(7);

    // Range A: plies [0,5] — covers Black's low cluster only.
    ctx.setSelectionRange([0, 5] as [PlyIndex, PlyIndex]);
    const black = ctx.deltaKdeSeries.value.find(s => s.name === 'Black')!;
    expect(black.samples.sort((a, b) => a - b)).toEqual([0, 0, 0]);

    // Range B: plies [6,10] — covers Black's high cluster only. Driving the
    // SAME computed's `.value` a second time after a real store mutation is
    // the reactive-subscription assertion: if the range read were removed
    // (the pre-fix defect), this second read would return the identical
    // samples as range A instead of tracking the mutation.
    ctx.setSelectionRange([6, 10] as [PlyIndex, PlyIndex]);
    const blackAfter = ctx.deltaKdeSeries.value.find(s => s.name === 'Black')!;
    expect(blackAfter.samples.sort((a, b) => a - b)).toEqual([1000, 1000]);

    // White mirrors Black's fixture, but White's plies are shifted by one
    // (colorMoveToPly(k, 'W') = 2k+2, vs 2k+1 for Black), so range B
    // [6,10] additionally catches White's colour-local index 2 (ply 6,
    // value 0) that Black's odd-ply index 2 (ply 5) did not. Asserting the
    // colour-specific set (not just "high cluster only") is itself part of
    // the mapping-soundness witness: a same-array-position slice (the
    // unsound `i ∈ [start,end)` shape the diagnosis's correction rules
    // out) would get Black and White identically wrong here.
    const white = ctx.deltaKdeSeries.value.find(s => s.name === 'White')!;
    expect(white.samples.sort((a, b) => a - b)).toEqual([0, 1000, 1000]);
  });

  it('covers a pass-containing game: a pass still consumes its turn slot, so colorMoveToPly holds unchanged', () => {
    // White's first move (colour-local index 0) is a pass ("W[]"). A pass
    // is still a turn — GameNode.move is `{ type: 'pass', color: 'W' }` —
    // so it still occupies its PlyIndex slot and every later colour-local
    // index keeps the same colorMoveToPly mapping as the no-pass fixture
    // above. This is the case the diagnosis's parity warning names
    // explicitly: the fix must not special-case passes away, it must fall
    // out of the real per-node path data.
    const PASS_SGF = '(;FF[4]GM[1]SZ[19];B[pd];W[];B[pp];W[dd];B[fc];W[cq];B[jj];W[qc];B[nc];W[qq])';
    const { boardId, board } = setup(PASS_SGF);
    const path = activePath(board);
    const leaf = path[path.length - 1];

    expect(path).toHaveLength(11); // root + 10 turns, pass included
    expect(board.nodes[path[2]].move).toEqual({ x: expect.any(Number), y: expect.any(Number), color: 'W', type: 'pass' });

    recordDeltas(
      leaf,
      { '0': 0, '1': 0, '2': 0, '3': 1000, '4': 1000 },
      { '0': 0, '1': 0, '2': 0, '3': 1000, '4': 1000 },
    );

    const ctx = withSetup(() => useAnalysisContext(boardId));

    ctx.setSelectionRange([0, 5] as [PlyIndex, PlyIndex]);
    const low = ctx.deltaKdeSeries.value.find(s => s.name === 'Black')!;
    expect(low.samples.sort((a, b) => a - b)).toEqual([0, 0, 0]);

    ctx.setSelectionRange([6, 10] as [PlyIndex, PlyIndex]);
    const high = ctx.deltaKdeSeries.value.find(s => s.name === 'Black')!;
    expect(high.samples.sort((a, b) => a - b)).toEqual([1000, 1000]);
  });
});

describe('useAnalysisContext.mistakeGapHistogramSeries — recomputes on selection-range change', () => {
  it('tracks setSelectionRange: the same defect class closes over the mistake-gap histogram too', () => {
    const { boardId, board } = setup(TEN_MOVE_SGF);
    const path = activePath(board);
    const leaf = path[path.length - 1];

    // quantile = 1 makes every finite delta a "mistake" (useMistakeFinder's
    // thresholdIdx floors to 0 at quantile=1), so this test isolates the
    // range-filter under test from the quantile-threshold logic — every
    // recorded colour-local index becomes a MistakeMarker with that same
    // colorLocalIdx, deterministically.
    store.profile.settings.appearance.mistakeFinderThresholdQuantile = 1;

    recordDeltas(
      leaf,
      { '0': -1, '1': -2, '2': -3, '3': -4, '4': -5 },
      {},
    );

    const ctx = withSetup(() => useAnalysisContext(boardId));

    // Range A: plies [0,5] -> Black colour-local {0,1,2} -> gaps [1,1].
    ctx.setSelectionRange([0, 5] as [PlyIndex, PlyIndex]);
    const gapsA = ctx.mistakeGapHistogramSeries.value.find(s => s.name === 'Black')!.samples;
    expect(gapsA).toEqual([1, 1]);

    // Range B: plies [6,10] -> Black colour-local {3,4} -> gaps [1].
    // Different sample-vector LENGTH, not just different values — the
    // clearest possible witness that the range mutation is actually read.
    ctx.setSelectionRange([6, 10] as [PlyIndex, PlyIndex]);
    const gapsB = ctx.mistakeGapHistogramSeries.value.find(s => s.name === 'Black')!.samples;
    expect(gapsB).toEqual([1]);
  });
});
