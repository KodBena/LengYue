/**
 * tests/integration/TreeWidget.default-layout-overflow.test.ts
 *
 * Regression pin for commissioner wiki finding #2 (2026-08-21): at
 * DEFAULT allocation — no user zoom/expand — the game-tree leaf showed
 * a horizontal scrollbar (see
 * .claude/dispatch-reports/badge-treebar-micro-build.md and the wiki
 * screenshot). jsdom does not run a real layout/paint pipeline (and this
 * project's vitest config runs with `css: false` — no scoped `<style>`
 * ever reaches the DOM under test), so neither a
 * `scrollWidth > clientWidth` assertion nor a `getComputedStyle` read of
 * `scrollbar-gutter` would be honest here — both would read as
 * meaningless zeros/defaults regardless of the fix. See
 * `tests/CLAUDE.md`'s component-test-tier note on this exact gap.
 *
 * The fix itself (`TreeWidget.vue`'s `.tree-widget-outer`) is a CSS-only
 * change: `scrollbar-gutter: stable` stops the vertical scrollbar's
 * gutter from silently eating into the horizontal budget only when it
 * happens to be showing (see that rule's own comment for the mechanism).
 * Threading the tree's own content demand into the LYT allocation
 * solver (`contentDemandPx`, exposed via `defineExpose` below,
 * ultimately feeding `resolveSideColumnLiveLayout`) is EXPLICITLY out of
 * scope — its own header comment names this as a prior dispatch's
 * disclosed narrowing, and rewriting that solver is exactly the
 * "layout-engine rewrite" this fix's own brief rules out.
 *
 * What IS honestly pinnable without a real layout pipeline is
 * `TreeWidget`'s own contract with that solver: `contentDemandPx` (=
 * `svgWidth`, a pure function of tree shape — `cols * CELL + PAD * 2`)
 * stays at the small, documented default ceiling (cols <= 3: a
 * mainline plus the "1-2 side variations" `ensureVisible` auto-reveals
 * with NO user toggle) unless the user genuinely expands further. A
 * drift in that ceiling — CELL/PAD tuning, or `ensureVisible` starting
 * to auto-reveal more than ancestors — is exactly the kind of silent
 * regression that reintroduces this class of bug upstream of the CSS
 * fix, so pinning it here is real regression coverage even though it
 * cannot exercise `scrollbar-gutter` itself.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { i18n } from '../../src/i18n';
import type { BoardState, NodeId } from '../../src/types';
import TreeWidget from '../../src/components/tree/TreeWidget.vue';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';

// Mirrors TreeWidget.vue's own rendering constants (CELL/PAD). Kept
// literal (not imported) deliberately: this test pins the DOCUMENTED
// default-budget contract described in TreeWidget.vue's `contentDemandPx`
// header comment, so a drift in the source constants without a matching
// update here is exactly the silent-failure ADR-0002 wants surfaced as a
// red test, not a passing one that quietly tracks whatever the source
// currently does.
const CELL = 24;
const PAD = 18;
const DEFAULT_BUDGET_COLS = 3; // "single-column main-line walks and 1-2 side variations"
const DEFAULT_BUDGET_PX = DEFAULT_BUDGET_COLS * CELL + PAD * 2;

/** A branching SGF with two INDEPENDENT branch points:
 *    - pd -> {W[dp] mainline, W[dd] variation}, and W[dd] -> B[fc] ->
 *      {W[cf] mainline, W[nc] variation} — nested, both ancestors of
 *      the chosen off-mainline leaf (W[nc]), so `ensureVisible` alone
 *      (no manual toggle) auto-reveals both and reaches cols === 3,
 *      the documented "1-2 side variations" default-budget ceiling.
 *    - W[dp] -> B[pp] -> {W[jj] mainline, W[kk] variation ; B[ll]} —
 *      NOT an ancestor of W[nc], so it stays genuinely collapsed at
 *      default allocation. The second test below toggles it open by
 *      hand to exercise the "user genuinely expands past the budget"
 *      case. `W[kk]` carries one further move (`B[ll]`) so it is NOT
 *      itself a leaf — `findOffMainlineLeaf` below would otherwise
 *      match `W[kk]` (an off-mainline leaf in its own right, and
 *      earlier in SGF/traversal order than `W[nc]`) just as validly as
 *      `W[nc]`, silently picking whichever the id-map happens to
 *      iterate first and landing the test on the WRONG branch point
 *      (found empirically: it auto-expanded B[pp] instead of leaving
 *      it collapsed, inverting the second test's toggle-click intent). */
const BRANCHING_SGF =
  '(;FF[4]GM[1]SZ[19]' +
  ';B[pd](;W[dp];B[pp](;W[jj])(;W[kk];B[ll]))(;W[dd];B[fc](;W[cf])(;W[nc])))';

function loadBoardIntoStore(source: string): BoardState {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return store.boards[store.boards.length - 1];
}

/** Find a leaf node that sits off the mainline (a non-first-child
 *  descendant), so navigating the cursor there forces ensureVisible to
 *  reveal the sibling tracks along the way. */
function findOffMainlineLeaf(board: BoardState): NodeId {
  for (const node of Object.values(board.nodes)) {
    if (node.children.length === 0 && node.parent) {
      const parent = board.nodes[node.parent];
      if (parent && parent.children.length > 1 && parent.children[0] !== node.id) {
        return node.id;
      }
    }
  }
  throw new Error('fixture has no off-mainline leaf — test fixture is wrong');
}

describe('TreeWidget — default-allocation content-demand budget (no false-positive horizontal overflow)', () => {
  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    removeRenderEnvStubs();
  });

  it('keeps contentDemandPx at the documented default budget (auto-revealed, un-toggled)', async () => {
    const board = loadBoardIntoStore(BRANCHING_SGF);
    // Land the cursor on an off-mainline leaf BEFORE mount — the SPA-reload
    // case ensureVisible's `immediate: true` watch handles — so the
    // ancestor-reveal is the automatic, non-zoom kind this test targets.
    board.currentNodeId = findOffMainlineLeaf(board);

    const wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick(); // ensureVisible's watch + the layout recompute it triggers

    // `contentDemandPx` (defineExpose) is the tree's own content-demand
    // measurement — a pure function of tree shape, not of the DOM box it
    // renders into (see its own header comment: this is precisely what
    // replaced the old `outerRef.scrollWidth` measurement that degenerated
    // under jsdom-shaped "box narrower than content" conditions).
    const contentDemandPx = (wrapper.vm as unknown as { contentDemandPx: number }).contentDemandPx;

    expect(contentDemandPx).toBe(DEFAULT_BUDGET_PX);

    wrapper.unmount();
  });

  it('lets contentDemandPx genuinely exceed the default budget once the user expands further', async () => {
    const board = loadBoardIntoStore(BRANCHING_SGF);
    board.currentNodeId = findOffMainlineLeaf(board);

    const wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    // Three branch points are structurally toggle-eligible here (pd,
    // B[fc], and B[pp] — see the fixture comment); TreeWidget renders a
    // `.toggle-group` for each regardless of its current expanded state
    // (isBranching is structural, not expansion-state-gated — see the
    // template). At default (collapsed) allocation `B[pp]`'s own
    // variation (`W[kk]`) is pruned out of the laid-out node set
    // entirely (`filterToExpandedSubtree`), so DFS `assign()` order over
    // what's ACTUALLY visible is: root, pd, W[dp], B[pp], W[jj] (mainline
    // only), W[dd], B[fc], W[cf], W[nc] — putting B[pp]'s own toggle (on
    // W[jj], its mainline child) second in document order. Index 0
    // (pd's toggle) and index 2 (B[fc]'s toggle) are both already
    // expanded (ensureVisible's ancestor reveal); clicking either would
    // COLLAPSE and shrink cols, the opposite of what this test
    // exercises.
    const toggleGroups = wrapper.findAll('.toggle-group');
    expect(toggleGroups.length).toBe(3);
    await toggleGroups[1].trigger('click'); // B[pp]'s toggle — genuinely collapsed by default
    await nextTick();
    await nextTick();

    const contentDemandPx = (wrapper.vm as unknown as { contentDemandPx: number }).contentDemandPx;

    // Expanding B[pp]'s variation adds a fourth track on top of the two
    // ensureVisible already auto-revealed — genuinely past the documented
    // default budget. This is the case where a horizontal scrollbar is
    // the CORRECT, expected affordance — `overflow-x: auto` (never
    // `hidden`) on `.tree-widget-outer` stays load-bearing.
    expect(contentDemandPx).toBeGreaterThan(DEFAULT_BUDGET_PX);

    wrapper.unmount();
  });
});
