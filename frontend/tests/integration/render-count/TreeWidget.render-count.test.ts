/**
 * tests/integration/render-count/TreeWidget.render-count.test.ts
 *
 * Render-count regression guard for `TreeWidget.vue`, seeding the P4
 * harness with the component the 2026-05-31 green-arc fixed last (the
 * render-decouple of the active-node ring).
 *
 * The invariant under test is ADR-0010's read-locality rule applied to
 * TreeWidget: the active-node ring is set imperatively (`activeRingEl`
 * ref + `watch(activeRingPos, …)`), and the template `<circle>` carries
 * no nav-reactive binding. So the render function reads tree *structure*
 * (`props.nodes`, the layout, the expansion set) but NOT the move cursor
 * — and a navigation step *within already-visible territory* must
 * therefore re-run the render function ZERO times.
 *
 * The one subtlety the test controls for: `watch(currentNodeId, …)` calls
 * `expansion.ensureVisible`, which unions a newly-reached node's
 * ancestors into the expanded set the *first* time they are visited.
 * That is a legitimate structure-visibility change and re-renders by
 * design (the expansion-set guard in useTreeExpansion already makes it
 * no-op once an ancestor is present). To isolate cursor-coupling from
 * expansion growth, the test first walks to the leaf (warming the whole
 * mainline into the expanded set), resets the counter, and only then
 * navigates back and forth — so any re-render observed would be a true
 * cursor read in the render path, which is the bug.
 *
 * This is the exact regression the postmortem
 * (`postmortem-render-coupling-at-composition-nodes-2026-05-29.md`) and
 * the audit (P1/P4) name: before the fix, `activeRingPos →
 * currentNodeId` was read in the template, so every nav re-ran the whole
 * 762 ms render while `v-memo` spared only the patch. If a future edit
 * re-introduces a nav-reactive read into the template, the navigation
 * loop below re-renders and this test fails — the bug becomes
 * CI-catchable instead of profile-only.
 *
 * Driving path is the production one: `mutateBoard(id, navigateNext)`
 * mutates `currentNodeId` in place on the store's reactive board, which
 * is exactly what an arrow-key press does (see useNavigation.ts).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../../src/engine/sgf-loader';
import { navigateNext, navigatePrev } from '../../../src/engine/navigator';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../../src/store';
import { i18n } from '../../../src/i18n';
import type { BoardState, NodeId } from '../../../src/types';
import TreeWidget from '../../../src/components/tree/TreeWidget.vue';
import { mountWithRenderCount, type RenderCountHarness } from './render-count';
import { installRenderEnvStubs, removeRenderEnvStubs } from './jsdom-stubs';

/** A 10-move mainline — enough nodes to navigate across. */
const TEN_MOVE_SGF =
  '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp];W[dd];B[fc];W[cf];B[jp];W[qf];B[qh];W[qc])';

function loadBoardIntoStore(source: string): BoardState {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  // addBoard pushes a reactive clone into store.boards; return that
  // proxy so in-place mutations drive the same object TreeWidget reads
  // off `boardsById`.
  return store.boards[store.boards.length - 1];
}

/** Walk the active mainline from root, returning node ids in order. */
function mainlineFrom(board: BoardState): NodeId[] {
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

describe('TreeWidget — render-count regression guard', () => {
  let harness: RenderCountHarness<typeof TreeWidget> | null = null;

  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    harness?.unmount();
    harness = null;
    removeRenderEnvStubs();
  });

  it('does not re-render on navigation within already-visible territory', async () => {
    const board = loadBoardIntoStore(TEN_MOVE_SGF);
    const line = mainlineFrom(board);
    expect(line.length).toBeGreaterThanOrEqual(6); // 10 moves + root

    harness = mountWithRenderCount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();

    // Warm the expansion set: walk to the leaf so every mainline ancestor
    // is already in `expandedNodes`. After this, ensureVisible no-ops on
    // further mainline nav (see useTreeExpansion's guard), so any
    // subsequent re-render is cursor-coupling, not expansion growth.
    while (board.nodes[board.currentNodeId]?.children.length) {
      mutateBoard(board.id, draft => navigateNext(draft));
      await nextTick();
    }
    expect(board.currentNodeId).toBe(line[line.length - 1]);

    // Baseline: discard the warm-up renders. We now measure renders
    // caused by pure cursor movement across the already-visible tree.
    harness.resetRenderCount();

    // Fire N synthetic navigation steps via the production cursor path:
    // `mutateBoard(id, navigatePrev/Next)` is exactly what an arrow-key
    // press runs (see useNavigation.ts). Walk back to root, then forward.
    let moved = 0;
    while (board.currentNodeId !== line[0]) {
      mutateBoard(board.id, draft => navigatePrev(draft));
      await nextTick();
      moved++;
    }
    for (let i = 0; i < line.length - 1; i++) {
      mutateBoard(board.id, draft => navigateNext(draft));
      await nextTick();
      moved++;
    }
    // Sanity: the cursor actually moved many times (the loop did real work).
    expect(moved).toBeGreaterThanOrEqual(line.length);

    // The render-locality invariant: navigation across already-visible
    // territory reads nothing the render function subscribes to, so the
    // render must not have re-run once. k = 0 is the meaningful bound —
    // this asserts read-locality, not a loose "small number".
    expect(harness.renderCount()).toBe(0);
  });

  it('does re-render when the tree structure changes (proving the counter is live)', async () => {
    const board = loadBoardIntoStore(TEN_MOVE_SGF);

    harness = mountWithRenderCount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();
    harness.resetRenderCount();

    // Replace the `nodes` prop with a structurally-different tree (a
    // longer mainline). A tree-structure change is exactly what the
    // render function SHOULD react to — this proves the zero above is a
    // real read-locality result, not a dead counter that never moves.
    const longer = loadSgf(
      sgf.parse(TEN_MOVE_SGF.replace(/\)$/, ';B[od];W[oc];B[nc])')),
    );
    await harness.wrapper.setProps({ nodes: longer.nodes });
    await nextTick();

    expect(harness.renderCount()).toBeGreaterThanOrEqual(1);
  });
});
