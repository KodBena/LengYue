/**
 * tests/integration/render-count/TreeWidget-pass-node.test.ts
 *
 * Pins the pass-node rendering rule from ledger rows 759 and 948:
 *
 * - `nodeFill()` no longer special-cases `move.type === 'pass'` to a
 *   neutral `--border-3` fill; a pass node renders the SAME B/W stone
 *   fill as any other move by that color (`src/components/tree/
 *   TreeWidget.vue`, `nodeFill`; ledger row 759).
 * - The "P" letter glyph is RETIRED (ledger row 948: a pass is a game
 *   move played by a color, not a meta-instruction annotated with
 *   text). Its replacement is a SQUARE outline instead of the ordinary
 *   stone circle — the genre convention this build grounds against
 *   Sabaki's game-tree pane (`GameGraph.js`: `type: 'square' // Pass
 *   node` vs `'circle' // Normal node`, same per-color fill both
 *   shapes) — per ADR-0019 appendix C18 (no color-only meaning): the
 *   shape, not the fill, is what still marks a pass apart from a
 *   placed stone.
 *
 * Reuses the render-count harness's mount infrastructure (jsdom theme-var
 * stubs, `ResizeObserver` stub, i18n plugin) — this file asserts on
 * rendered DOM attributes, not render frequency, so it uses plain
 * `mount` from `@vue/test-utils` rather than `mountWithRenderCount`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

import { addBoard, resetWorkspace, store } from '../../../src/store';
import { createInitialBoard, asNodeId } from '../../../src/store/board-factory';
import { i18n } from '../../../src/i18n';
import type { BoardState, GameNode } from '../../../src/types';
import TreeWidget from '../../../src/components/tree/TreeWidget.vue';
import { installRenderEnvStubs, removeRenderEnvStubs } from './jsdom-stubs';

/**
 * Builds a fresh board (`createInitialBoard`, the same factory the store
 * uses) and splices in a single pass-move child of the given color under
 * the root — bypassing `applyPass`/SGF loading, since this test only
 * needs a `GameNode` tree shape TreeWidget can lay out, not a legal-play
 * history. `move.color`/`move.type` mirror exactly what `applyPass`
 * (`src/logic.ts`) mints (`{ x: 0, y: 0, color, type: 'pass' }`).
 */
function boardWithPass(color: 'B' | 'W'): BoardState {
  const board = createInitialBoard();
  const passId = asNodeId('pass-' + color);
  const passNode: GameNode = {
    id: passId,
    parent: board.rootNodeId,
    children: [],
    activeChildIndex: 0,
    properties: { [color]: [''] },
    move: { x: 0, y: 0, color, type: 'pass' },
  };
  board.nodes[board.rootNodeId]!.children.push(passId);
  board.nodes[passId] = passNode;
  board.currentNodeId = passId;
  board.turn = color === 'B' ? 'W' : 'B';
  return board;
}

function loadBoardIntoStore(board: BoardState): BoardState {
  addBoard(board);
  // addBoard pushes a reactive clone into store.boards; return that
  // proxy so TreeWidget reads off the same object the test holds.
  return store.boards[store.boards.length - 1];
}

describe('TreeWidget — pass node renders as a square in the passing player\'s stone color (ledger rows 759, 948)', () => {
  let wrapper: VueWrapper<InstanceType<typeof TreeWidget>> | null = null;

  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    removeRenderEnvStubs();
  });

  it('renders a black pass as a square with the black-stone fill, and no "P" glyph', async () => {
    const board = loadBoardIntoStore(boardWithPass('B'));
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();

    // Only the root node keeps the ordinary stone circle; the pass node
    // renders as a square (`rect.node-circle`) instead.
    const circles = wrapper.findAll('circle.node-circle');
    expect(circles.length).toBe(1);
    const squares = wrapper.findAll('rect.node-circle');
    expect(squares.length).toBe(1);
    const passSquare = squares[0]!;
    // Black-stone fill (nodeFill's literal '#111' or the dark-theme
    // var() override) — NOT the old neutral '#888888' (--border-3 stub).
    const fill = passSquare.attributes('fill');
    expect(fill).not.toBe('#888888');
    expect(fill === '#111' || fill === 'var(--tree-node-black-fill, #111)').toBe(true);

    // The retired "P" glyph never appears (ledger row 948).
    expect(wrapper.find('text.pass-glyph').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('P');
  });

  it('renders a white pass as a square with the white-stone fill, and no "P" glyph', async () => {
    const board = loadBoardIntoStore(boardWithPass('W'));
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const circles = wrapper.findAll('circle.node-circle');
    expect(circles.length).toBe(1);
    const squares = wrapper.findAll('rect.node-circle');
    expect(squares.length).toBe(1);
    const passSquare = squares[0]!;
    expect(passSquare.attributes('fill')).toBe('#eee');
    expect(passSquare.attributes('fill')).not.toBe('#888888'); // not the old neutral fill

    expect(wrapper.find('text.pass-glyph').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('P');
  });
});
