/**
 * tests/integration/TreeWidget-content-demand.test.ts
 *
 * Disease repair (`.claude/dispatch-reports/lyt-second-opus-review.md`
 * N3, ledger row 2511): `TreeWidget.vue`'s own exposed `contentDemandPx`
 * used to be `useContentDemand(outerRef, 'h')` — `outerRef.scrollWidth`,
 * which degenerates to the wrapping box's own rendered width whenever
 * the tree's real content is narrower than its box (see that file's own
 * repair comment for the full mechanism, and
 * `tests/unit/state/feasible-layout.test.ts`'s "presence-toggle
 * idempotence (N3 repair)" block for the pure-function half of this
 * fix). This suite pins the CALLER-facing half: `contentDemandPx` is now
 * `svgWidth` — a pure function of the game tree's own shape
 * (`layout.value.rows/cols * CELL + PAD * 2`), so it is:
 *
 *   1. Exactly the review's own cited figure for a single-column tree
 *      (60px) — corroborating this IS the mechanism the review measured,
 *      not a different number that happens to also be stable.
 *   2. Identical across two mounts at DIFFERENT (jsdom-inert) DOM
 *      geometries — jsdom never computes real layout, so
 *      `scrollWidth`/`getBoundingClientRect` are always 0 regardless;
 *      this test does not stub either, precisely because the fixed
 *      value no longer reads them at all. Structural confirmation is a
 *      source-grep for `useContentDemand`'s absence from the file, since
 *      jsdom cannot exercise the old scrollWidth-contamination live.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../src/engine/sgf-loader';
import { navigateTo } from '../../src/engine/navigator';
import { addBoard, mutateBoard, resetWorkspace, store } from '../../src/store';
import { i18n } from '../../src/i18n';
import type { BoardState } from '../../src/types';
import TreeWidget from '../../src/components/tree/TreeWidget.vue';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';

function loadBoardIntoStore(source: string): BoardState {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return store.boards[store.boards.length - 1];
}

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  installRenderEnvStubs();
  resetWorkspace();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  removeRenderEnvStubs();
});

// Addendum (commissioner shot ~/xs/9440_scrollbar.png, live-witness
// re-repair): `contentDemandPx` is still `svgWidth` — the pure-shape
// figure this suite's own header describes — PLUS `scrollbarGutterPx`,
// a small measured/buffered term `TreeWidget.vue` now folds in so the
// LYT solver's own allocation accounts for `.tree-widget-outer`'s
// `scrollbar-gutter: stable` reservation (see that ref's own header for
// the live rig measurement that forced this). jsdom has no real layout,
// so `outerRef`'s `offsetWidth`/`clientWidth` both read `0` and the
// measured half of that term is always `0` under test — only the fixed
// rounding-buffer half (`JSDOM_GUTTER_BUFFER_PX`) ever contributes here,
// a constant added atop every figure this file pins by exact value.
const JSDOM_GUTTER_BUFFER_PX = 2;

describe('TreeWidget.vue — contentDemandPx is tree-structure-derived, not box-measured (N3 repair)', () => {
  it('a root-only (single-column) tree reports exactly 60px (+ the scrollbar-gutter buffer) — the review\'s own cited figure for this shape', () => {
    const board = loadBoardIntoStore('(;FF[4]GM[1]SZ[19])'); // root only, no moves
    wrapper = mount(TreeWidget, {
      props: { nodes: board.nodes, boardId: board.id },
      global: { plugins: [i18n] },
    });
    expect(wrapper.vm.contentDemandPx).toBe(60 + JSDOM_GUTTER_BUFFER_PX);
  });

  it('is identical across two independently-mounted instances of the SAME tree shape — no dependency on whatever (jsdom-inert) box each happens to sit in', () => {
    const boardA = loadBoardIntoStore('(;FF[4]GM[1]SZ[19])');
    const wrapperA = mount(TreeWidget, { props: { nodes: boardA.nodes, boardId: boardA.id }, global: { plugins: [i18n] } });
    const boardB = loadBoardIntoStore('(;FF[4]GM[1]SZ[19])');
    const wrapperB = mount(TreeWidget, { props: { nodes: boardB.nodes, boardId: boardB.id }, global: { plugins: [i18n] } });

    expect(wrapperA.vm.contentDemandPx).toBe(wrapperB.vm.contentDemandPx);

    wrapperA.unmount();
    wrapperB.unmount();
  });

  it('a tree with an ADDITIONAL EXPANDED branch column reports a correspondingly LARGER value — proving the number tracks the tree\'s laid-out shape, not a constant placeholder', async () => {
    const smallBoard = loadBoardIntoStore('(;FF[4]GM[1]SZ[19])');
    const small = mount(TreeWidget, { props: { nodes: smallBoard.nodes, boardId: smallBoard.id }, global: { plugins: [i18n] } });

    // Default orientation is 'vertical' (svgWidth = cols*CELL + PAD*2) —
    // only the ACTIVE/expanded branch columns are laid out
    // (`useTreeExpansion`'s "current-node-is-always-visible" invariant,
    // this file's own header), so a variation needs to actually become
    // the CURRENT node — the production path (an arrow-key/PV-paste nav
    // via `mutateBoard(id, navigateTo(...))`, exactly what
    // `TreeWidget.render-count.test.ts` drives) — before it widens the
    // tree, not merely being present in the SGF.
    const branchingBoard = loadBoardIntoStore('(;FF[4]GM[1]SZ[19];B[pd](;W[dp])(;W[dd]))');
    const branching = mount(TreeWidget, { props: { nodes: branchingBoard.nodes, boardId: branchingBoard.id }, global: { plugins: [i18n] } });
    const beforeNav = branching.vm.contentDemandPx;

    const pdId = branchingBoard.nodes[branchingBoard.rootNodeId].children[0]!;
    const secondVariationId = branchingBoard.nodes[pdId].children[1]!; // W[dd] — the non-mainline sibling
    mutateBoard(branchingBoard.id, (draft) => navigateTo(draft, secondVariationId));
    await nextTick();

    expect(branching.vm.contentDemandPx).toBeGreaterThan(beforeNav);
    expect(branching.vm.contentDemandPx).toBeGreaterThan(small.vm.contentDemandPx);

    small.unmount();
    branching.unmount();
  });

  it('structural confirmation: TreeWidget.vue\'s <script> block no longer imports useContentDemand — contentDemandPx is not DOM-measured at all', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/tree/TreeWidget.vue'), 'utf-8');
    const scriptBlock = /<script setup lang="ts">([\s\S]*?)<\/script>/.exec(src);
    expect(scriptBlock).not.toBeNull();
    expect(scriptBlock![1]).not.toMatch(/from '\.\.\/\.\.\/composables\/chrome\/useContentDemand'/);
  });
});
