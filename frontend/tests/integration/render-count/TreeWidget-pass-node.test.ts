/**
 * tests/integration/render-count/TreeWidget-pass-node.test.ts
 *
 * Pins the pass-node rendering rule from ledger row 759 ("a pass is a
 * game move, not a meta-instruction... it is played by the corresponding
 * color, not 'always black' as it currently shows"):
 *
 * - `nodeFill()` no longer special-cases `move.type === 'pass'` to a
 *   neutral `--border-3` fill; a pass node renders the SAME B/W stone
 *   fill as any other move by that color (`src/components/tree/
 *   TreeWidget.vue`, `nodeFill`).
 * - The "P" glyph stays the pass signal (ADR-0019 appendix C18: no
 *   color-only meaning) and picks a per-stone-color fill
 *   (`passGlyphFill`) so it stays legible on both stone colors.
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

describe('TreeWidget — pass node renders as the passing player\'s stone (ledger row 759)', () => {
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

  it('renders a black pass as the black-stone fill, with a contrasting glyph', async () => {
    const board = loadBoardIntoStore(boardWithPass('B'));
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const circles = wrapper.findAll('circle.node-circle');
    expect(circles.length).toBe(2);
    const passCircle = circles[1]!; // root has no move, pass is the second layout item
    // Black-stone fill (nodeFill's literal '#111' or the dark-theme
    // var() override) — NOT the old neutral '#888888' (--border-3 stub).
    const fill = passCircle.attributes('fill');
    expect(fill).not.toBe('#888888');
    expect(fill === '#111' || fill === 'var(--tree-node-black-fill, #111)').toBe(true);

    const glyph = wrapper.find('text.pass-glyph');
    expect(glyph.exists()).toBe(true);
    expect(glyph.text()).toBe('P');
    // White glyph on the black stone (passGlyphFill).
    expect(glyph.attributes('fill')).toBe('#eee');
  });

  it('renders a white pass as the white-stone fill, with a contrasting glyph', async () => {
    const board = loadBoardIntoStore(boardWithPass('W'));
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const circles = wrapper.findAll('circle.node-circle');
    expect(circles.length).toBe(2);
    const passCircle = circles[1]!;
    expect(passCircle.attributes('fill')).toBe('#eee');
    expect(passCircle.attributes('fill')).not.toBe('#888888'); // not the old neutral fill

    const glyph = wrapper.find('text.pass-glyph');
    expect(glyph.exists()).toBe(true);
    expect(glyph.text()).toBe('P');
    // Dark glyph on the white stone (passGlyphFill).
    expect(glyph.attributes('fill')).toBe('#111');
  });
});
