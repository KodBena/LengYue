/**
 * tests/integration/LytNode-dom-id-wiring.test.ts
 *
 * Regression guard for W1 REPAIR review finding B
 * (`.claude/dispatch-reports/lyt-w1-skeleton-review.md` §3): the rejected
 * prior attempt's `LytNode.vue` read `:id="domId('')"` unconditionally at
 * every recursion depth, because no `path` prop threaded the current
 * node's own position down through the recursive `<LytNode>` calls — every
 * nested grid `<div>` looked up the SAME empty-string key in the (correctly
 * forwarded) `domIdsByPath` map, so DOM ids never resolved past the
 * program root and duplicate ids piled up (invalid HTML, and
 * `document.getElementById` return `null`/first-match instead of the
 * intended element).
 *
 * This mounts a small SYNTHETIC two-level LYT program (not the real
 * `lyt-layout.gen.ts`, so this test is independent of the real
 * encoding's own churn) through the real `LytNode.vue` component, with a
 * `domIdsByPath` map naming a DIFFERENT id at each of the root, a nested
 * split, and two leaves — the exact shape the rejected attempt got wrong.
 * Real registered widget ids (`B`, `I_board`, `tree`, `controlPanel`) are
 * reused as the synthetic tree's leaves so `lyt-widget-registry.ts`'s
 * lookups (which throw loudly on an unregistered id, per ADR-0002)
 * succeed without needing a second fake registry.
 *
 * Verify the guard is live: revert `LytNode.vue`'s recursive call to omit
 * `:path="group.rep.path"` (or the template's root `:id="domId('')"` back
 * to a literal `''`) and this test goes red — the fourth `id="root"`
 * assertion at minimum, since every nested instance would resolve to the
 * root's id again.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LytNode from '../../src/components/chrome/LytNode.vue';
import type { LytSplitNode } from '../../src/state/lyt-layout.gen';

// A two-level H(V(leaf, leaf), leaf) program, deliberately shaped like the
// real program's root->side-column->tree/controlPanel nesting (a Split
// inside a Split, both carrying named leaves) so the recursion under test
// actually recurses at least once.
const SYNTHETIC_PROGRAM: LytSplitNode = {
  kind: 'split',
  axis: 'h',
  gapPx: 0,
  children: [
    {
      path: '0',
      presenceDefaultVisible: true,
      track: { kind: 'fixed', px: 100 },
      node: { kind: 'leaf', widget: 'B', domain: 'board', facets: [], aspect: null, scrollAxes: [], content: null },
    },
    {
      path: '1',
      presenceDefaultVisible: true,
      track: { kind: 'elastic', minPx: 0, frWeight: 1 },
      node: {
        kind: 'split',
        axis: 'v',
        gapPx: 0,
        children: [
          {
            path: '1.0',
            presenceDefaultVisible: true,
            track: { kind: 'fixed', px: 50 },
            node: { kind: 'leaf', widget: 'tree', domain: 'board', facets: [], aspect: null, scrollAxes: [], content: null },
          },
          {
            path: '1.1',
            presenceDefaultVisible: true,
            track: { kind: 'fixed', px: 50 },
            node: { kind: 'leaf', widget: 'controlPanel', domain: 'blackbox', facets: [], aspect: null, scrollAxes: [], content: null },
          },
        ],
      },
    },
  ],
};

const DOM_IDS_BY_PATH: Record<string, string> = {
  '': 'root',
  '0': 'leaf-b',
  '1': 'nested-split',
  '1.0': 'leaf-tree',
  '1.1': 'leaf-controlpanel',
};

describe('LytNode.vue — DOM-id wiring (repair pass, review finding B)', () => {
  it('resolves a DISTINCT id at every path level (root, nested split, both leaves) — no two elements share an id', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM, domIdsByPath: DOM_IDS_BY_PATH },
      slots: {
        'leaf-B': '<div class="probe-b">B</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
        'leaf-controlPanel': '<div class="probe-cp">controlPanel</div>',
      },
    });

    // `wrapper.element` IS the component's root <div id="root">
    // (@vue/test-utils exposes the root node itself, which
    // `querySelectorAll` does not match against itself) — included
    // explicitly alongside its descendants so the root's own id is part
    // of the uniqueness/presence check, not silently exempted from it.
    const elementsWithId = [wrapper.element, ...Array.from(wrapper.element.querySelectorAll('[id]'))];
    const ids = elementsWithId.filter((el) => el.id).map((el) => el.id);

    // Presence: every named id in the map actually landed on SOME element
    // (the rejected attempt's #board-area/#tree-control-wrapper never
    // resolved to anything — `document.getElementById` returned null).
    for (const expectedId of Object.values(DOM_IDS_BY_PATH)) {
      expect(ids).toContain(expectedId);
    }

    // Uniqueness: no id repeats (the rejected attempt's duplicate
    // id="split-workspace" on four separate grid <div>s).
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // Exactly one element per expected id (stronger than "contains" above
    // combined with uniqueness, but spelled out per-id for a legible
    // failure message naming which id broke). `ids` already accounts for
    // wrapper.element itself (see above), so counting within it — rather
    // than re-querying only descendants — correctly includes the root id.
    for (const expectedId of Object.values(DOM_IDS_BY_PATH)) {
      expect(ids.filter((id) => id === expectedId).length).toBe(1);
    }

    wrapper.unmount();
  });

  it('the root id and the nested-split id are on DIFFERENT elements (the specific bug: both resolved to the root id)', () => {
    const wrapper = mount(LytNode, {
      props: { node: SYNTHETIC_PROGRAM, domIdsByPath: DOM_IDS_BY_PATH },
      slots: {
        'leaf-B': '<div class="probe-b">B</div>',
        'leaf-tree': '<div class="probe-tree">tree</div>',
        'leaf-controlPanel': '<div class="probe-cp">controlPanel</div>',
      },
    });

    // wrapper.element IS the root <div id="root"> (see the note in the
    // prior test) — queried directly rather than via querySelector,
    // which does not match the queried element against itself.
    const rootEl = wrapper.element.id === 'root' ? wrapper.element : wrapper.element.querySelector('#root');
    const nestedEl = wrapper.element.querySelector('#nested-split');
    expect(rootEl).not.toBeNull();
    expect(nestedEl).not.toBeNull();
    expect(rootEl).not.toBe(nestedEl);
    // The nested split's own DOM element must be a DESCENDANT of the root
    // (not a sibling accidentally re-rooted) — confirms the recursion
    // actually nested rather than flattening.
    expect(rootEl!.contains(nestedEl)).toBe(true);

    wrapper.unmount();
  });
});
