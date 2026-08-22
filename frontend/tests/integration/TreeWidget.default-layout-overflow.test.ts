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
 * Addendum (commissioner shot ~/xs/9440_scrollbar.png, live-witness
 * REQUIRED per the addendum brief): the CSS-only `scrollbar-gutter:
 * stable` fix above closed the INTERMITTENT overflow (the vertical
 * scrollbar's gutter appearing/disappearing as `svgHeight` grew) but two
 * static follow-up attempts still failed a live rig re-witness — because
 * `scrollbar-gutter: stable` reserves its ~15-17px width UNCONDITIONALLY,
 * from first paint, whether or not a vertical scrollbar is ever actually
 * needed, and that reservation was never fed back into `contentDemandPx`
 * (the very thing this test pins). A live probe
 * (`scripts/tree-scrollbar-repro.mjs`, measured against a real Chromium
 * via playwright-core) found a real `scrollWidth(60) > clientWidth(44)`
 * horizontal overflow on a completely fresh, single-node board — the
 * "threading into the solver is out of scope" narrowing this file
 * previously carried is the residual gap that left open. `TreeWidget.vue`
 * now measures that reservation off the real DOM (`outerRef.offsetWidth -
 * outerRef.clientWidth`, present from first paint on a `scrollbar-gutter:
 * stable` box regardless of overflow state) and adds it — plus a small
 * fixed buffer for the CSS Grid solver's own per-track sub-pixel rounding
 * (witnessed: a 1px residual even with the gutter's exact measured width
 * fed through) — to `contentDemandPx`. jsdom performs no real layout, so
 * `outerRef.value.offsetWidth`/`clientWidth` both read `0` there — the
 * measured term is always `0`, leaving only the fixed buffer
 * (`JSDOM_GUTTER_BUFFER_PX` below) as a deterministic, environment-stable
 * addend to the budget this test pins.
 *
 * What IS honestly pinnable without a real layout pipeline is
 * `TreeWidget`'s own contract with that solver: `contentDemandPx` (=
 * `svgWidth` PLUS the gutter-reservation term above) stays at the small,
 * documented default ceiling (cols <= 3: a mainline plus the "1-2 side
 * variations" `ensureVisible` auto-reveals with NO user toggle) unless
 * the user genuinely expands further. A drift in that ceiling —
 * CELL/PAD tuning, or `ensureVisible` starting to auto-reveal more than
 * ancestors — is exactly the kind of silent regression that reintroduces
 * this class of bug upstream of the CSS fix, so pinning it here is real
 * regression coverage even though it cannot exercise `scrollbar-gutter`
 * itself.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
// Mirrors `TreeWidget.vue`'s own `scrollbarGutterPx` fixed buffer (its own
// comment has the full derivation: absorbs the CSS Grid solver's per-track
// sub-pixel rounding). jsdom's `offsetWidth`/`clientWidth` are always `0`
// (no real layout pipeline), so the DOM-measured half of that ref is
// always `0` here — only this fixed term ever contributes under test.
const JSDOM_GUTTER_BUFFER_PX = 2;
const DEFAULT_BUDGET_PX = DEFAULT_BUDGET_COLS * CELL + PAD * 2 + JSDOM_GUTTER_BUFFER_PX;

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

  it('folds the DOM-measured scrollbar-gutter reservation into contentDemandPx (the live-witness fix)', async () => {
    // Pins the actual MEASURED relation the addendum's live rig probe
    // found (`scripts/tree-scrollbar-repro.mjs`): `.tree-widget-outer`'s
    // `scrollbar-gutter: stable` reserves `offsetWidth - clientWidth` of
    // width unconditionally, and `TreeWidget.vue`'s `scrollbarGutterPx`
    // folds exactly that measured gap (plus its own fixed rounding
    // buffer) into `contentDemandPx`. jsdom has no real layout, so the
    // gap is stubbed directly on `HTMLElement.prototype` — the same
    // idiom `useLytFitAssertion.test.ts`'s `elWithBox` helper uses for
    // `scrollWidth`/`clientWidth`.
    const board = loadBoardIntoStore(BRANCHING_SGF);
    board.currentNodeId = findOffMainlineLeaf(board);

    const STUBBED_OFFSET_WIDTH = 74;
    const STUBBED_CLIENT_WIDTH = 59; // a 15px gutter reservation, matching the live probe's own witnessed figure
    const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(STUBBED_OFFSET_WIDTH);
    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(STUBBED_CLIENT_WIDTH);

    const wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    const contentDemandPx = (wrapper.vm as unknown as { contentDemandPx: number }).contentDemandPx;

    // DEFAULT_BUDGET_PX already carries the jsdom-only fixed buffer term
    // (offsetWidth/clientWidth both read 0 without this stub, so the
    // measured half of `scrollbarGutterPx` is 0 there). The fixed buffer
    // is a constant addend present in BOTH cases, so it cancels out of
    // the delta: swapping in the stubbed 15px gap raises the demand by
    // exactly that measured gap over the unstubbed baseline.
    const measuredGutterPx = STUBBED_OFFSET_WIDTH - STUBBED_CLIENT_WIDTH;
    expect(contentDemandPx).toBe(DEFAULT_BUDGET_PX + measuredGutterPx);

    wrapper.unmount();
    offsetWidthSpy.mockRestore();
    clientWidthSpy.mockRestore();
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
