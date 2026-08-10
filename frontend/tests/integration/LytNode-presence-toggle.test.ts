/**
 * tests/integration/LytNode-presence-toggle.test.ts
 *
 * Regression guard for the W2 `presenceOverrides` prop
 * (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W2 item
 * 1) — the runtime generalization of `LytNode.vue`'s previously-static
 * `presenceDefaultVisible` gate. Mirrors
 * `LytNode-dom-id-wiring.test.ts`'s own synthetic-two-level-program
 * approach (read in full before authoring this file) so this test is
 * independent of the real encoding's own churn.
 *
 * Verifies:
 *   - an id absent from `presenceOverrides` falls back to the child's
 *     own static `presenceDefaultVisible` (W1 behavior reproduced
 *     exactly when the prop is omitted or doesn't mention an id).
 *   - an override TRUE mounts a `presenceDefaultVisible: false` leaf
 *     (its slot content actually renders — a REAL v-if mount, not a
 *     visibility toggle) and its track claims real space (not "0px").
 *   - an override FALSE unmounts a `presenceDefaultVisible: true` leaf
 *     (its slot content is torn down) and its track collapses to "0px".
 *   - the override map is forwarded verbatim into a nested Split's own
 *     recursive `<LytNode>` instance (same "forward every prop the same
 *     way domIdsByPath already is" contract the file header documents).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LytNode from '../../src/components/chrome/LytNode.vue';
import type { LytSplitNode } from '../../src/state/lyt-layout.gen';

// A two-level H(V(leaf[default-off], leaf[default-on]), leaf[default-on])
// program — 'boardRail' (default-off, per the real registry/encoding) and
// 'tree'/'controlPanel' (default-on) are reused as widget ids so
// `lyt-widget-registry.ts`'s lookups succeed without a second fake
// registry (same convention LytNode-dom-id-wiring.test.ts establishes).
function program(): LytSplitNode {
  return {
    kind: 'split',
    axis: 'h',
    gapPx: 0,
    children: [
      {
        path: '0',
        presenceDefaultVisible: false,
        track: { kind: 'fixed', px: 168 },
        node: { kind: 'leaf', widget: 'boardRail', domain: 'common', facets: [], aspect: null },
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
              node: { kind: 'leaf', widget: 'tree', domain: 'board', facets: [], aspect: null },
            },
            {
              path: '1.1',
              presenceDefaultVisible: true,
              track: { kind: 'fixed', px: 50 },
              node: { kind: 'leaf', widget: 'controlPanel', domain: 'blackbox', facets: [], aspect: null },
            },
          ],
        },
      },
    ],
  };
}

const slots = {
  'leaf-boardRail': '<div class="probe-boardrail">boardRail</div>',
  'leaf-tree': '<div class="probe-tree">tree</div>',
  'leaf-controlPanel': '<div class="probe-cp">controlPanel</div>',
};

describe('LytNode.vue — presenceOverrides (W2 runtime presence)', () => {
  it('reproduces W1 behavior exactly when presenceOverrides is omitted: default-off leaf absent, default-on leaves present', () => {
    const wrapper = mount(LytNode, { props: { node: program() }, slots });
    expect(wrapper.find('.probe-boardrail').exists()).toBe(false);
    expect(wrapper.find('.probe-tree').exists()).toBe(true);
    expect(wrapper.find('.probe-cp').exists()).toBe(true);
    wrapper.unmount();
  });

  it('an id absent from presenceOverrides falls back to the static default (partial override map)', () => {
    const wrapper = mount(LytNode, {
      props: { node: program(), presenceOverrides: { controlPanel: false } },
      slots,
    });
    // boardRail: not mentioned -> falls back to its own default (false).
    expect(wrapper.find('.probe-boardrail').exists()).toBe(false);
    // tree: not mentioned -> falls back to its own default (true).
    expect(wrapper.find('.probe-tree').exists()).toBe(true);
    // controlPanel: explicitly overridden false.
    expect(wrapper.find('.probe-cp').exists()).toBe(false);
    wrapper.unmount();
  });

  it('override TRUE mounts a default-off leaf and claims real track space (not 0px)', () => {
    const wrapper = mount(LytNode, {
      props: { node: program(), presenceOverrides: { boardRail: true } },
      slots,
    });
    expect(wrapper.find('.probe-boardrail').exists()).toBe(true);
    const style = (wrapper.element as HTMLElement).style.gridTemplateColumns;
    expect(style).toContain('168px');
    expect(style).not.toMatch(/^0px/);
    wrapper.unmount();
  });

  it('override FALSE unmounts a default-on leaf and collapses its track to 0px', () => {
    const wrapper = mount(LytNode, {
      props: { node: program(), presenceOverrides: { tree: false } },
      slots,
    });
    expect(wrapper.find('.probe-tree').exists()).toBe(false);
    // The nested V-split (root child '1') is where 'tree'/'controlPanel'
    // live — its own grid-template-rows is the one that should show the
    // collapsed 0px track for 'tree' at position 0.
    const nested = wrapper.element.querySelector('.lyt-node .lyt-node-slot .lyt-node') as HTMLElement;
    expect(nested).not.toBeNull();
    expect(nested.style.gridTemplateRows.split(' ')[0]).toBe('0px');
    wrapper.unmount();
  });

  it('forwards presenceOverrides verbatim into a nested Split recursion', () => {
    const wrapper = mount(LytNode, {
      props: { node: program(), presenceOverrides: { tree: false, controlPanel: false } },
      slots,
    });
    expect(wrapper.find('.probe-tree').exists()).toBe(false);
    expect(wrapper.find('.probe-cp').exists()).toBe(false);
    wrapper.unmount();
  });
});
