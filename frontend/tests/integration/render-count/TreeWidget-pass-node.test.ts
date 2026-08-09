/**
 * tests/integration/render-count/TreeWidget-pass-node.test.ts
 *
 * Pins the pass-node rendering rule from ledger rows 759 and 948
 * (948 amended after commissioner adjudication — see below):
 *
 * - `nodeFill()` no longer special-cases `move.type === 'pass'` to a
 *   neutral `--border-3` fill; a pass node renders the SAME B/W stone
 *   fill as any other move by that color (`src/components/tree/
 *   TreeWidget.vue`, `nodeFill`; ledger row 759).
 * - Ledger row 948 first ruled the old "P" letter glyph off, and a
 *   follow-up build proposed a square outline in its place (genre
 *   grounding: Sabaki's `GameGraph.js`). The commissioner REJECTED that
 *   proposal, verbatim: "There is supposed to be no pass glyph, at
 *   all." A pass node renders EXACTLY like a normal move node — same
 *   circle, same per-color fill, no shape, glyph, or any other
 *   distinguishing mark.
 *
 * This file therefore witnesses the property the ruling actually
 * states — indistinguishability — not a proxy for it: it renders a
 * board with a pass node and a board with an ordinary placed-stone
 * node of the same color and asserts their `circle.node-circle`
 * markup (tag, fill, stroke, radius — every attribute the template
 * sets) is IDENTICAL modulo position, plus that no square/rect or
 * "P"/pass-glyph artifact exists anywhere in the mount. Asserting only
 * "a circle exists with the right fill" would pass even if some OTHER
 * attribute (a class, a stroke-dasharray, a data- attribute) still
 * leaked a pass-only branch — the direct A/B comparison is what
 * actually rules that out (ADR-0021: the witness observes the
 * property, not a symptom).
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
 * uses) and splices in a single child node of the given color under the
 * root — either a pass (`move.type === 'pass'`) or an ordinary placed
 * stone at (3, 3) (`move.type === 'place'`) — bypassing `applyPass`/
 * legal-play application, since this test only needs a `GameNode` tree
 * shape TreeWidget can lay out. `move.color`/`move.type` mirror exactly
 * what `applyPass` (`src/logic.ts`) mints for a pass
 * (`{ x: 0, y: 0, color, type: 'pass' }`).
 */
function boardWithChildMove(color: 'B' | 'W', kind: 'pass' | 'stone'): BoardState {
  const board = createInitialBoard();
  const childId = asNodeId(kind + '-' + color);
  const move: GameNode['move'] =
    kind === 'pass'
      ? { x: 0, y: 0, color, type: 'pass' }
      : { x: 3, y: 3, color, type: 'place' };
  const childNode: GameNode = {
    id: childId,
    parent: board.rootNodeId,
    children: [],
    activeChildIndex: 0,
    properties: { [color]: [''] },
    move,
  };
  board.nodes[board.rootNodeId]!.children.push(childId);
  board.nodes[childId] = childNode;
  board.currentNodeId = childId;
  board.turn = color === 'B' ? 'W' : 'B';
  return board;
}

function loadBoardIntoStore(board: BoardState): BoardState {
  addBoard(board);
  // addBoard pushes a reactive clone into store.boards; return that
  // proxy so TreeWidget reads off the same object the test holds.
  return store.boards[store.boards.length - 1];
}

async function mountTreeFor(board: BoardState): Promise<VueWrapper<InstanceType<typeof TreeWidget>>> {
  const wrapper = mount(TreeWidget, {
    props: { nodes: board.nodes, boardId: board.id },
    global: { plugins: [i18n] },
  });
  await nextTick();
  return wrapper;
}

describe('TreeWidget — pass node renders identically to a normal move node (ledger row 948, commissioner-amended)', () => {
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

  it.each(['B', 'W'] as const)(
    'a %s pass node\'s node-circle markup is indistinguishable from an ordinary same-color move node\'s',
    async (color) => {
      const passBoard = loadBoardIntoStore(boardWithChildMove(color, 'pass'));
      wrapper = await mountTreeFor(passBoard);

      // No square/rect ever stands in for a node, and no "P" glyph text
      // exists anywhere — the property under test, not a proxy for it.
      expect(wrapper.findAll('rect.node-circle').length).toBe(0);
      expect(wrapper.find('text.pass-glyph').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('P');

      const passCircles = wrapper.findAll('circle.node-circle');
      // Root (no move) plus the pass node — both render as node-circle;
      // the pass is the second layout item.
      expect(passCircles.length).toBe(2);
      const passAttrs = { ...passCircles[1]!.attributes() };
      delete passAttrs.cx;
      delete passAttrs.cy; // position varies with layout; not the property under test

      wrapper.unmount();

      const stoneBoard = loadBoardIntoStore(boardWithChildMove(color, 'stone'));
      wrapper = await mountTreeFor(stoneBoard);
      const stoneCircles = wrapper.findAll('circle.node-circle');
      expect(stoneCircles.length).toBe(2);
      const stoneAttrs = { ...stoneCircles[1]!.attributes() };
      delete stoneAttrs.cx;
      delete stoneAttrs.cy;

      // Every non-positional attribute the template sets on the node
      // circle (tag, r, fill, stroke, stroke-width, class) is identical
      // between the pass and the ordinary move of the same color — the
      // ruling's actual claim, witnessed directly rather than inferred
      // from a same-fill-only check.
      expect(passAttrs).toEqual(stoneAttrs);
    },
  );
});
