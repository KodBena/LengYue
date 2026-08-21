/**
 * tests/integration/PreviewBoardPanel-pv.test.ts
 *
 * Regression coverage for item 2 (mandate addendum,
 * `.claude/dispatch-reports/preview-board-followup-build.md`) — the DATA
 * half: `PreviewBoardPanel.vue`'s `boardSnapshot.pv` populated from the
 * SAME analysis source (`useMoveSuggestions`/the analysis ledger) the
 * main board's PV overlay (`MoveSuggestions.vue`) reads. The RENDER half
 * (`MiniBoardSvg` actually drawing PV stones given a snapshot with `pv`
 * set) is covered separately in `MiniBoardSvg-pv.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PreviewBoardPanel from '../../src/components/board/PreviewBoardPanel.vue';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { ledger } from '../../src/state/analysis-ledger';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { i18n } from '../../src/i18n';
import type { RawAnalysis } from '../../src/types';

beforeEach(() => {
  resetWorkspace();
  ledger.purgeAll();
});

// `move`/`pv` entries are GTP coordinates (letter + rank, e.g. "Q16"),
// what `gtpToBoard` (`use-move-suggestions.ts`) actually parses — NOT
// SGF two-letter coordinates. A prior draft of this fixture used SGF
// coords ('pd'/'dp'/'dd') and every entry silently dropped out of
// `suggestions` (`gtpToBoard`'s `parseInt(gtp.slice(1))` on a
// non-numeric second character is `NaN`, so `coords` is null and the
// move is filtered via `flatMap(() => [])`) — caught by a debug probe
// before landing, not by this test itself; the fixture below is the
// corrected shape.
function rawAnalysisWithBestMovePv(): RawAnalysis {
  return {
    id: 'q',
    turnNumber: 0,
    isDuringSearch: false,
    rootInfo: { winrate: 0.5, scoreLead: 0, visits: 400, currentPlayer: 'B' },
    moveInfos: [
      {
        // order 0 = best move, the one PreviewBoardPanel always shows.
        move: 'Q16', visits: 400, winrate: 0.55, scoreLead: 1.2, order: 0,
        pv: ['Q16', 'D4', 'D16'],
      },
      {
        move: 'D4', visits: 120, winrate: 0.48, scoreLead: -0.4, order: 1,
        pv: ['D4', 'Q4'],
      },
    ],
  };
}

describe('PreviewBoardPanel — best-move PV sourced from the analysis ledger (item 2)', () => {
  it('populates and renders a PV, given an analysis packet covering the active node', () => {
    const board = createInitialBoard();
    addBoard(board);
    const { rawKey } = activeAnalysisKeys.value;
    ledger.recordRaw(rawKey, board.currentNodeId, rawAnalysisWithBestMovePv());

    const wrapper = mount(PreviewBoardPanel, { global: { plugins: [i18n] } });

    // The best move's PV (order 0: pd → dp → dd) is three moves long.
    const pvStones = wrapper.findAll('[data-testid="mini-board-pv-stone"]');
    expect(pvStones).toHaveLength(3);
  });

  it('honest empty state: no analysis packet for the active node renders zero PV stones, board still shows', () => {
    const board = createInitialBoard();
    addBoard(board);
    // No `ledger.recordRaw` call — no analysis has ever covered this node.

    const wrapper = mount(PreviewBoardPanel, { global: { plugins: [i18n] } });

    expect(wrapper.find('.preview-board-empty').exists()).toBe(false); // a board IS active
    expect(wrapper.findAll('[data-testid="mini-board-pv-stone"]')).toHaveLength(0);
  });

  it('no active board: the existing empty-panel state is untouched by the PV addition', () => {
    // resetWorkspace() always leaves ONE initial board active
    // (`store/index.ts::resetWorkspace`) — force the genuinely-empty
    // "no board at all" state directly, the same idiom
    // `useKnownPositionNodes.test.ts` / `useUserIORegistry.test.ts` use.
    store.boards = [];
    store.activeBoardIndex = 0;
    const wrapper = mount(PreviewBoardPanel, { global: { plugins: [i18n] } });
    expect(wrapper.find('.preview-board-empty').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="mini-board-pv-stone"]')).toHaveLength(0);
  });
});
