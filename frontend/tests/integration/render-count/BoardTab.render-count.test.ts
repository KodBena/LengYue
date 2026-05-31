/**
 * tests/integration/render-count/BoardTab.render-count.test.ts
 *
 * Render-count regression guard for `BoardTab.vue`, the green-arc's
 * other canonical fix (the analysis-depth rugplot moved from one DOM
 * node per path move onto a `<canvas>` drawn imperatively in a watch).
 *
 * The invariant under test is ADR-0010's read-locality + canvas rules
 * applied to BoardTab: the rugplot's underlying per-node visit data
 * (`rugVisits` → throttled `displayedVisits` → `rugPlot`) is consumed
 * ONLY inside `watch(rugPlot, drawMeter)`, which draws to the canvas
 * imperatively — the template/render reads `isActive`, `reviewState`,
 * `index`, and the label, but NOT the rugplot data. So a rugplot-data
 * update (a new analysis packet bumping the ledger) must re-run the
 * render function ZERO times; only a chrome change (e.g. `isActive`)
 * re-renders.
 *
 * Before the fix this component v-for'd ~one DOM node per path move and
 * read the data array in its template, so every 4 Hz analysis update
 * re-rendered the whole component — it was the single most expensive
 * component render in combined-stress (782 ms). If a future edit moves
 * the rugplot data back into the render path, the ledger-record loop
 * below re-renders and this test fails.
 *
 * The throttle on `displayedVisits` (≈4 Hz) only delays the imperative
 * canvas draw; it never gates the render. The assertion is therefore
 * timer-independent — we record packets, flush microtasks, and assert
 * the render never ran — so no fake timers and no flake.
 *
 * What this catches (verified by injecting the read and watching the
 * test go red): the high-frequency coupling — a template/render read of
 * the un-throttled per-packet `rugVisits` computed — re-renders on every
 * ledger bump and fails this test. (A read of the *throttled*
 * `displayedVisits` would only re-render once the throttle fires, which
 * this timer-free test does not advance; that weaker case is itself a
 * mitigation, and the canvas-vs-DOM fix removed both.)
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../../src/store';
import { ledger } from '../../../src/services/analysis-ledger';
import { activeConfigHash } from '../../../src/services/analysis-config';
import { i18n } from '../../../src/i18n';
import type { BoardState, NodeId } from '../../../src/types';
import type { KataAnalysisResponse } from '../../../src/engine/katago/types';
import BoardTab from '../../../src/components/board/BoardTab.vue';
import { mountWithRenderCount, type RenderCountHarness } from './render-count';
import { installRenderEnvStubs, removeRenderEnvStubs } from './jsdom-stubs';

const FIVE_MOVE_SGF = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd];B[fc])';

function loadBoardIntoStore(source: string): BoardState {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return store.boards[store.boards.length - 1];
}

/** A minimal KataGo analysis packet carrying a given root-visit count. */
function packetWithVisits(nodeId: NodeId, visits: number): KataAnalysisResponse {
  return {
    id: `q-${nodeId}-${visits}`,
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [],
    rootInfo: {
      winrate: 0.5,
      scoreLead: 0,
      visits,
      currentPlayer: 'B',
    },
  } as unknown as KataAnalysisResponse;
}

/** The active variation path node ids for `board` (root → current leaf). */
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

describe('BoardTab — render-count regression guard', () => {
  let harness: RenderCountHarness<typeof BoardTab> | null = null;

  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    harness?.unmount();
    harness = null;
    removeRenderEnvStubs();
  });

  it('does not re-render when rugplot analysis data changes (canvas is drawn off the render path)', async () => {
    const board = loadBoardIntoStore(FIVE_MOVE_SGF);
    const path = activePath(board);
    const hash = activeConfigHash.value;

    harness = mountWithRenderCount(BoardTab, {
      props: { state: board, index: 0, isActive: true },
      global: { plugins: [i18n] },
    });
    await nextTick();
    harness.resetRenderCount();

    // Fire N synthetic analysis packets across the path nodes — exactly
    // the rugplot's data source (`rugVisits` reads ledger.getRaw per path
    // node). The first packet per (hash, node) bumps synchronously; that
    // recomputes `rugVisits` and feeds the throttled snapshot → rugPlot →
    // the imperative canvas draw. None of that is in the render path.
    let deepening = 100;
    for (let round = 0; round < 4; round++) {
      for (const nodeId of path) {
        ledger.record(hash, nodeId, packetWithVisits(nodeId, deepening));
        deepening += 250;
      }
      await nextTick();
    }

    // Sanity: the data the rugplot reads actually changed.
    expect(ledger.getRaw(hash, path[0])?.rootInfo?.visits).toBeGreaterThan(0);

    // The read-locality + canvas invariant: rugplot-data updates touch
    // nothing the render function subscribes to. k = 0 is the meaningful
    // bound — the very coupling (read the data array in the template) the
    // green-arc fix removed.
    expect(harness.renderCount()).toBe(0);
  });

  it('does re-render when chrome state changes (proving the counter is live)', async () => {
    const board = loadBoardIntoStore(FIVE_MOVE_SGF);

    harness = mountWithRenderCount(BoardTab, {
      props: { state: board, index: 0, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();
    harness.resetRenderCount();

    // `isActive` is read in the template (the .active class) — flipping it
    // is exactly what the render SHOULD react to. Proves the zero above is
    // a real read-locality result, not a dead counter.
    await harness.wrapper.setProps({ isActive: true });
    await nextTick();

    expect(harness.renderCount()).toBeGreaterThanOrEqual(1);
  });
});
