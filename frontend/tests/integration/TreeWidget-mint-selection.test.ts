/**
 * tests/integration/TreeWidget-mint-selection.test.ts
 *
 * Component-level coverage for the batch card-minting affordance's
 * selection surface in `TreeWidget.vue` (commissioner-designed, ledger
 * rows 926/957/1008): ctrl+click toggles a node's membership in
 * `mint-selection.ts`'s per-board selection WITHOUT navigating; a
 * plain click still navigates exactly as today (emits `select-node`,
 * no selection change); a selected node renders the dashed
 * `mint-selection-ring`.
 *
 * Reuses the render-count harness's mount infrastructure (jsdom
 * theme-var stubs, `ResizeObserver` stub, i18n plugin) — same pattern
 * as `TreeWidget-pass-node.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

import { addBoard, resetWorkspace, store } from '../../src/store';
import { createInitialBoard, asNodeId } from '../../src/store/board-factory';
import { i18n } from '../../src/i18n';
import { addToSelection, getSelectedNodeIds, removeFromSelectionOne, removeSelectionSlot } from '../../src/composables/cards/mint-selection';
import type { BoardState, GameNode, BoardId } from '../../src/types';
import TreeWidget from '../../src/components/tree/TreeWidget.vue';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';

/** A board with one child node under root — enough for a second `node-circle` to click. */
function boardWithChildMove(): BoardState {
  const board = createInitialBoard();
  const childId = asNodeId('child-1');
  const childNode: GameNode = {
    id: childId,
    parent: board.rootNodeId,
    children: [],
    activeChildIndex: 0,
    properties: { B: [''] },
    move: { x: 3, y: 3, color: 'B', type: 'place' },
  };
  board.nodes[board.rootNodeId]!.children.push(childId);
  board.nodes[childId] = childNode;
  return board;
}

function loadBoardIntoStore(board: BoardState): BoardState {
  addBoard(board);
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

describe('TreeWidget — ctrl+click batch-mint selection (ledger rows 926/957/1008)', () => {
  let wrapper: VueWrapper<InstanceType<typeof TreeWidget>> | null = null;
  let boardId: BoardId;

  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    if (boardId) removeSelectionSlot(boardId);
    removeRenderEnvStubs();
  });

  it('ctrl+click toggles selection membership and does NOT emit select-node (no navigation)', async () => {
    const board = loadBoardIntoStore(boardWithChildMove());
    boardId = board.id;
    wrapper = await mountTreeFor(board);

    const circles = wrapper.findAll('circle.node-circle');
    expect(circles.length).toBe(2); // root + child
    const childCircle = circles[1]!;
    const childNodeId = board.nodes[board.rootNodeId].children[0];

    expect(getSelectedNodeIds(boardId).has(childNodeId)).toBe(false);

    await childCircle.trigger('click', { ctrlKey: true });

    expect(getSelectedNodeIds(boardId).has(childNodeId)).toBe(true);
    expect(wrapper.emitted('select-node')).toBeUndefined();

    // A second ctrl+click toggles it back off.
    await childCircle.trigger('click', { ctrlKey: true });
    expect(getSelectedNodeIds(boardId).has(childNodeId)).toBe(false);
    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('meta+click (macOS) also toggles selection', async () => {
    const board = loadBoardIntoStore(boardWithChildMove());
    boardId = board.id;
    wrapper = await mountTreeFor(board);

    const childCircle = wrapper.findAll('circle.node-circle')[1]!;
    const childNodeId = board.nodes[board.rootNodeId].children[0];

    await childCircle.trigger('click', { metaKey: true });
    expect(getSelectedNodeIds(boardId).has(childNodeId)).toBe(true);
    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('a plain click still navigates (emits select-node) and leaves selection untouched', async () => {
    const board = loadBoardIntoStore(boardWithChildMove());
    boardId = board.id;
    wrapper = await mountTreeFor(board);

    const childCircle = wrapper.findAll('circle.node-circle')[1]!;
    const childNodeId = board.nodes[board.rootNodeId].children[0];

    await childCircle.trigger('click');

    expect(wrapper.emitted('select-node')).toBeTruthy();
    expect(wrapper.emitted('select-node')![0]).toEqual([childNodeId]);
    expect(getSelectedNodeIds(boardId).has(childNodeId)).toBe(false);
  });

  it('a selected node renders the dashed mint-selection-ring; an unselected node does not', async () => {
    // The ring is driven by the `selectedForMintIds` PROP (App.vue's own
    // composition-layer pattern for gameHeadIds/knownPositionNodeIds —
    // TreeWidget never reads `mint-selection.ts` directly for rendering,
    // only ctrl+click WRITES to it). Pass the module's own reactive Set
    // for this board directly — the same object App.vue's
    // `activeBoardSelectedNodeIds` computed would resolve to — so a
    // `toggleNodeSelection` write is observed reactively here exactly as
    // it would be in the real app.
    const board = loadBoardIntoStore(boardWithChildMove());
    boardId = board.id;
    // Force-create the module's persistent reactive Set for this board
    // BEFORE mounting (add-then-remove a throwaway id) — a prop passed
    // to `mount()` is a one-time value, not a reactive parent binding,
    // so it only observes FUTURE mutations of the exact Set object it
    // was given, not a later replacement of `getSelectedNodeIds`'s
    // return reference (which only happens once, on the board's FIRST
    // ever selection write).
    const sentinelNodeId = asNodeId('sentinel-force-create');
    addToSelection(boardId, sentinelNodeId);
    removeFromSelectionOne(boardId, sentinelNodeId);
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id, selectedForMintIds: getSelectedNodeIds(boardId) },
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(wrapper.find('circle.mint-selection-ring').exists()).toBe(false);

    const childCircle = wrapper.findAll('circle.node-circle')[1]!;
    await childCircle.trigger('click', { ctrlKey: true });
    await nextTick();

    expect(wrapper.find('circle.mint-selection-ring').exists()).toBe(true);
  });
});
