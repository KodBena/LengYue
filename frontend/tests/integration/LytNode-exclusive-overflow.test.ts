/**
 * tests/integration/LytNode-exclusive-overflow.test.ts
 *
 * Row 2501 repair, item 2 (`.claude/dispatch-reports/
 * lyt-cure-repair-build.md`; live-witness finding
 * `.claude/dispatch-reports/lyt-cure-live-witness.md`, item 5a-ii): the
 * DOCKED control-panel Exclusive's own wrapper div in `LytNode.vue` had
 * no overflow style at all — every leaf/blackbox cell gets one from
 * `leafOverflowStyle`, but the Exclusive branch predates that mechanism.
 * The live rig found 0 of 7 Settings/Advanced-Registry controls
 * reachable at a fresh 2560px docked boot (the summon-POPOVER path
 * already worked, via App.vue's own bounded `.control-panel-popover`
 * CSS — this file only exercises the DOCKED, in-grid path `LytNode.vue`
 * itself owns).
 *
 * This test does not attempt to reproduce the full App.vue/TabWidget
 * stack — it mounts `LytNode` directly against a synthetic one-level
 * program carrying a single Exclusive child (mirroring
 * `LytNode-presence-toggle.test.ts`'s own synthetic-program approach,
 * read in full before authoring this file), and asserts the DOCKED
 * wrapper div's own inline style carries a real vertical scroll port
 * (`overflow-y: auto`) — the mechanism a "content taller than its own
 * cell is still reachable by scroll" claim needs; a real browser's
 * actual scroll behavior itself is out of jsdom's reach (no layout
 * engine), matching every other overflow-style-only test in this tree
 * (`TabWidget-overflow.test.ts`'s own header names the same limit).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LytNode from '../../src/components/chrome/LytNode.vue';
import type { LytSplitNode } from '../../src/state/lyt-layout.gen';

// A one-level H(leaf[tree], exclusive[controlPanel]) program — 'tree' and
// 'controlPanel' reused as real widget ids (`lyt-widget-registry.ts`'s
// lookups succeed without a second fake registry, same convention
// `LytNode-presence-toggle.test.ts` establishes).
function program(): LytSplitNode {
  return {
    kind: 'split',
    axis: 'h',
    gapPx: 4,
    children: [
      {
        path: '0',
        presenceDefaultVisible: true,
        track: { kind: 'elastic', minPx: 110, frWeight: 1 },
        node: { kind: 'leaf', widget: 'tree', domain: 'board', facets: [], aspect: null, scrollAxes: [], content: null },
      },
      {
        path: '1',
        presenceDefaultVisible: true,
        track: { kind: 'fixed', px: 664 },
        node: {
          kind: 'exclusive',
          widget: 'controlPanel',
          tag: null,
          defaultTabId: 'library',
          demote: null,
          children: [
            {
              path: '1.0',
              tabId: 'library',
              tabLabelKey: 'app.tabs.library',
              content: null,
              scrollAxes: [],
              // 'CP-library' (not 'CP-settings'): a genuinely REGISTERED
              // 'mounted' widget id in `lyt-widget-registry.ts` — the
              // Exclusive branch's own per-tab slot gate
              // (`registryStatus(child.node.widget) !== 'absent'`) would
              // silently suppress the slot for an unregistered id, which
              // would make this test pass for the wrong reason (no content
              // rendered at all) rather than genuinely exercising the
              // wrapper's own overflow style.
              node: { kind: 'blackbox', widget: 'CP-library', tag: null, domain: 'blackbox', facets: [], demote: null },
            },
          ],
        },
      },
    ],
  };
}

const slots = {
  'leaf-tree': '<div class="probe-tree">tree</div>',
  'leaf-CP-library': '<div class="probe-settings">settings content</div>',
};

// The Exclusive wrapper's own `:id="domId(path)"` binds to `undefined`
// (an empty attribute is DROPPED by Vue, not rendered as `id=""`) unless
// a real entry is supplied — matching `LytNode-dom-id-wiring.test.ts`'s
// own convention of feeding `domIdsByPath` explicitly so a synthetic
// program's wrapper elements are addressable by id in a test.
const domIdsByPath = { '1': 'test-exclusive-wrapper' };

describe('LytNode.vue — Exclusive docked overflow (row 2501 repair, item 2)', () => {
  it('the DOCKED (present, in-grid) Exclusive wrapper carries a real vertical scroll port', () => {
    const wrapper = mount(LytNode, { props: { node: program(), domIdsByPath }, slots });
    expect(wrapper.find('.probe-settings').exists()).toBe(true);
    const exclusiveWrapper = wrapper.find('#test-exclusive-wrapper').element as HTMLElement | undefined;
    expect(exclusiveWrapper).not.toBeNull();
    expect(exclusiveWrapper?.style.overflowY).toBe('auto');
    expect(exclusiveWrapper?.style.overflowX).toBe('hidden');
    wrapper.unmount();
  });

  it('an ABSENT (demoted) Exclusive renders nothing at all when not summoned — no wrapper to assert an overflow style on', () => {
    const wrapper = mount(LytNode, {
      props: { node: program(), domIdsByPath, presenceOverrides: { controlPanel: false } },
      slots,
    });
    expect(wrapper.find('.probe-settings').exists()).toBe(false);
    wrapper.unmount();
  });

  it('an ABSENT-but-SUMMONED (teleported to a popover target) Exclusive does NOT get the docked overflow style — the popover\'s own CSS already owns the scroll port', () => {
    const popoverTarget = document.createElement('div');
    document.body.appendChild(popoverTarget);
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        domIdsByPath,
        presenceOverrides: { controlPanel: false },
        exclusivePopoverOpen: { controlPanel: true },
        exclusivePopoverTarget: popoverTarget,
      },
      slots,
      attachTo: document.body,
    });
    const teleported = popoverTarget.querySelector('.probe-settings');
    expect(teleported).not.toBeNull();
    const exclusiveWrapper = wrapper.find('#test-exclusive-wrapper').element as HTMLElement | undefined;
    expect(exclusiveWrapper).not.toBeNull();
    // Row 2501 repair's own scope: `exclusiveOverflowStyle` returns `{}`
    // when NOT docked (`isPresent` false) — the popover's own bounded box
    // (App.vue's `.control-panel-popover` CSS) already provides the
    // scroll port, so this wrapper must not ALSO claim one.
    expect(exclusiveWrapper?.style.overflowY).toBe('');
    wrapper.unmount();
    popoverTarget.remove();
  });
});
