/**
 * tests/integration/LytNode-exclusive-rendering.test.ts
 *
 * Regression suite for LytNode.vue's Exclusive-case rendering
 * (`.claude/dispatch-reports/lyt-realization-wave.md`, work item
 * lyt-realization-exclusive-overflow, items 1/3/5). Mirrors
 * `LytNode-dom-id-wiring.test.ts`/`LytNode-presence-toggle.test.ts`'s own
 * synthetic-two/three-level-program approach (read both in full before
 * authoring this file) so this suite is independent of the real encoding's
 * own churn, reusing real registered widget ids (`CP-library`, `CP-cards`,
 * `otherColorDebug`, `otherBand`) so `lyt-widget-registry.ts`'s lookups
 * succeed without a second fake registry.
 *
 * Verifies:
 *   - an Exclusive node renders through a REAL `TabWidget` instance (a
 *     `role="tablist"` + `role="tab"` structure a second, hand-rolled tab
 *     strip would also produce — the single-tab-implementation proof is
 *     the SOURCE-scan assertion at the bottom of this file, which confirms
 *     LytNode.vue imports and drives TabWidget.vue rather than
 *     re-authoring its own strip markup).
 *   - only the active tab's slot content is mounted (lazy default,
 *     TabWidget's own `keepMounted: false` behavior, unchanged).
 *   - switching tabs invokes `onExclusiveActiveChange` with the Exclusive
 *     node's own path and the newly-selected tabId — and the SAME
 *     callback is honored by `exclusiveActiveByPath` on re-render (the
 *     controlled-component round trip, since TabWidget itself holds no
 *     tab-selection state of its own).
 *   - a leaf child's own `scrollAxes` derives real `overflow-x`/
 *     `overflow-y` CSS on its cell (item 3) — a `content: 'designed'`
 *     leaf with no scroll axis gets none.
 *   - a Split child (the "Other tab" shape) recurses through a nested
 *     `<LytNode>` rather than a leaf-slot mount.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'fs';
import path from 'path';
import LytNode from '../../src/components/chrome/LytNode.vue';
import type { LytSplitNode } from '../../src/state/lyt-layout.gen';

// A one-level H(exclusive) program: a single Exclusive node ('cp', mirroring
// the real 'controlPanel' representative id) with three children — two
// leaves (one scroll-declared, one not) and a Split (the Other-tab shape).
function program(): LytSplitNode {
  return {
    kind: 'split',
    axis: 'h',
    gapPx: 0,
    children: [
      {
        path: '0',
        presenceDefaultVisible: true,
        track: { kind: 'elastic', minPx: 160, frWeight: 1 },
        node: {
          kind: 'exclusive',
          widget: 'controlPanel',
          tag: 'TEST',
          defaultTabId: 'library',
          demote: null,
          children: [
            {
              path: '0.0',
              tabId: 'library',
              tabLabelKey: 'app.tabs.library',
              node: {
                kind: 'leaf', widget: 'CP-library', domain: 'common', facets: [], aspect: null,
                scrollAxes: ['v'], content: 'unbounded',
              },
            },
            {
              path: '0.1',
              tabId: 'colordebug',
              tabLabelKey: 'app.tabs.colordebug',
              node: {
                kind: 'leaf', widget: 'otherColorDebug', domain: 'debug', facets: [], aspect: null,
                scrollAxes: [], content: 'designed',
              },
            },
            {
              path: '0.2',
              tabId: 'other',
              tabLabelKey: 'app.tabs.other',
              node: {
                kind: 'split',
                axis: 'v',
                gapPx: 0,
                children: [
                  {
                    path: '0.2.0',
                    presenceDefaultVisible: true,
                    track: { kind: 'fixed', px: 40 },
                    node: {
                      kind: 'leaf', widget: 'otherColorDebug', domain: 'debug', facets: [], aspect: null,
                      scrollAxes: [], content: 'designed',
                    },
                  },
                  {
                    path: '0.2.1',
                    presenceDefaultVisible: true,
                    track: { kind: 'elastic', minPx: 160, frWeight: 1 },
                    node: {
                      kind: 'leaf', widget: 'otherBand', domain: 'common', facets: [], aspect: null,
                      scrollAxes: ['v'], content: 'unbounded',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };
}

describe('LytNode.vue — Exclusive-case rendering (REALIZATION WAVE)', () => {
  it('renders a real TabWidget instance with one tab per Exclusive child, labels resolved through translateLabel', () => {
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        translateLabel: (key: string) => `[${key}]`,
      },
      slots: {
        'leaf-CP-library': '<div id="library-content">library</div>',
        'leaf-otherColorDebug': '<div id="colordebug-content">colordebug</div>',
        'leaf-otherBand': '<div id="other-band-content">other band</div>',
      },
    });
    const tablist = wrapper.find('[role="tablist"]');
    expect(tablist.exists()).toBe(true);
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual(['[app.tabs.library]', '[app.tabs.colordebug]', '[app.tabs.other]']);
  });

  it('mounts only the default/active tab\'s content (lazy, TabWidget\'s own unchanged default)', () => {
    const wrapper = mount(LytNode, {
      props: { node: program() },
      slots: {
        'leaf-CP-library': '<div id="library-content">library</div>',
        'leaf-otherColorDebug': '<div id="colordebug-content">colordebug</div>',
        'leaf-otherBand': '<div id="other-band-content">other band</div>',
      },
    });
    expect(wrapper.find('#library-content').exists()).toBe(true);
    expect(wrapper.find('#colordebug-content').exists()).toBe(false);
  });

  it('a tab click invokes onExclusiveActiveChange with the Exclusive node\'s own path and the newly-selected tabId', async () => {
    const calls: Array<[string, string]> = [];
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        onExclusiveActiveChange: (p: string, tabId: string) => { calls.push([p, tabId]); },
      },
      slots: {
        'leaf-CP-library': '<div id="library-content"></div>',
        'leaf-otherColorDebug': '<div id="colordebug-content"></div>',
        'leaf-otherBand': '<div id="other-band-content"></div>',
      },
    });
    const tabs = wrapper.findAll('[role="tab"]');
    await tabs[1].trigger('click');
    expect(calls).toEqual([['0', 'colordebug']]);
  });

  it('exclusiveActiveByPath drives which tab is active (the controlled-component round trip)', () => {
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        exclusiveActiveByPath: { '0': 'colordebug' },
      },
      slots: {
        'leaf-CP-library': '<div id="library-content"></div>',
        'leaf-otherColorDebug': '<div id="colordebug-content"></div>',
        'leaf-otherBand': '<div id="other-band-content"></div>',
      },
    });
    expect(wrapper.find('#library-content').exists()).toBe(false);
    expect(wrapper.find('#colordebug-content').exists()).toBe(true);
  });

  it('derives overflow-y:auto on a scroll-declared leaf\'s cell, and none on a no-scroll leaf', () => {
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        exclusiveActiveByPath: { '0': 'colordebug' },
      },
      slots: {
        'leaf-CP-library': '<div id="library-content"></div>',
        'leaf-otherColorDebug': '<div id="colordebug-content"></div>',
        'leaf-otherBand': '<div id="other-band-content"></div>',
      },
    });
    // The active tab is 'colordebug' here (content: 'designed', no
    // scrollAxes) — its own leaf cell must carry no forced overflow.
    const cell = wrapper.find('#colordebug-content').element.parentElement as HTMLElement;
    expect(cell.style.overflowY).toBe('');
    expect(cell.style.overflowX).toBe('');
  });

  it('mounts the "library" tab\'s scroll-declared leaf cell with overflow-y:auto', () => {
    const wrapper = mount(LytNode, {
      props: { node: program() }, // defaultTabId 'library'
      slots: {
        'leaf-CP-library': '<div id="library-content"></div>',
        'leaf-otherColorDebug': '<div id="colordebug-content"></div>',
        'leaf-otherBand': '<div id="other-band-content"></div>',
      },
    });
    const cell = wrapper.find('#library-content').element.parentElement as HTMLElement;
    expect(cell.style.overflowY).toBe('auto');
  });

  it('a Split child (the Other-tab shape) recurses through a nested <LytNode>, with its own leaves\' overflow independently derived', () => {
    const wrapper = mount(LytNode, {
      props: {
        node: program(),
        exclusiveActiveByPath: { '0': 'other' },
      },
      slots: {
        'leaf-CP-library': '<div id="library-content"></div>',
        'leaf-otherColorDebug': '<div id="colordebug-content"></div>',
        'leaf-otherBand': '<div id="other-band-content"></div>',
      },
    });
    // Both nested leaves mount (the Split recursion, not a single leaf slot).
    expect(wrapper.find('#colordebug-content').exists()).toBe(true);
    expect(wrapper.find('#other-band-content').exists()).toBe(true);
    const fixedCell = wrapper.find('#colordebug-content').element.parentElement as HTMLElement;
    const scrollCell = wrapper.find('#other-band-content').element.parentElement as HTMLElement;
    expect(fixedCell.style.overflowY).toBe('');
    expect(scrollCell.style.overflowY).toBe('auto');
  });
});

// Presence arc P2b (`.claude/dispatch-reports/lyt-p2b-presence-
// realization.md` item 2/3): same one-level program as `program()` above,
// parameterised on the wrapping child's own `presenceDefaultVisible` so
// each test below can exercise the absent/present split directly.
function programWithPresence(defaultVisible: boolean): LytSplitNode {
  const p = program();
  (p.children[0] as { presenceDefaultVisible: boolean }).presenceDefaultVisible = defaultVisible;
  return p;
}

describe('LytNode.vue — Exclusive presence (P2b item 2: an Exclusive is now a real toggle target)', () => {
  it('an absent Exclusive (presenceDefaultVisible: false, no override) renders no tab strip at all', () => {
    const wrapper = mount(LytNode, {
      props: { node: programWithPresence(false) },
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
  });

  it('presenceOverrides can name the Exclusive\'s own widget id absent even when the compiled default is present', () => {
    const wrapper = mount(LytNode, {
      props: { node: programWithPresence(true), presenceOverrides: { controlPanel: false } },
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
  });

  it('presenceOverrides can name the Exclusive\'s own widget id present even when the compiled default is absent', () => {
    const wrapper = mount(LytNode, {
      props: { node: programWithPresence(false), presenceOverrides: { controlPanel: true } },
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
  });
});

describe('LytNode.vue — Exclusive popover summon (P2b item 3)', () => {
  function popoverTarget(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  }

  it('absent + not summoned: renders nothing, not even into the popover target', () => {
    const target = popoverTarget();
    const wrapper = mount(LytNode, {
      props: {
        node: programWithPresence(false),
        exclusivePopoverTarget: target,
        exclusivePopoverOpen: {},
      },
      attachTo: document.body,
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(target.querySelector('[role="tablist"]')).toBeNull();
    wrapper.unmount();
    target.remove();
  });

  it('absent + summoned (exclusivePopoverOpen[widget] = true): relocates the tab strip into exclusivePopoverTarget', () => {
    const target = popoverTarget();
    const wrapper = mount(LytNode, {
      props: {
        node: programWithPresence(false),
        exclusivePopoverTarget: target,
        exclusivePopoverOpen: { controlPanel: true },
      },
      attachTo: document.body,
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    // Not rendered in LytNode's own natural (wrapper) subtree...
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    // ...but present, live, inside the popover target.
    expect(target.querySelector('[role="tablist"]')).not.toBeNull();
    expect(target.querySelector('#library-content')).not.toBeNull();
    wrapper.unmount();
    target.remove();
  });

  it('present (in-grid): renders in its natural position regardless of exclusivePopoverOpen — Teleport stays disabled', () => {
    const target = popoverTarget();
    const wrapper = mount(LytNode, {
      props: {
        node: programWithPresence(true),
        exclusivePopoverTarget: target,
        exclusivePopoverOpen: { controlPanel: true }, // even if "summoned", present wins
      },
      attachTo: document.body,
      slots: { 'leaf-CP-library': '<div id="library-content"></div>' },
    });
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    expect(target.querySelector('[role="tablist"]')).toBeNull();
    wrapper.unmount();
    target.remove();
  });
});

describe('LytNode.vue — single-tab-implementation proof (ADR-0012 cancer B/E)', () => {
  it('drives TabWidget.vue directly rather than re-authoring a second strip/body implementation', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../src/components/chrome/LytNode.vue'),
      'utf-8',
    );
    expect(src).toMatch(/import TabWidget from '\.\/TabWidget\.vue';/);
    expect(src).toMatch(/<TabWidget/);
    // No second hand-rolled tablist/tab markup anywhere in this file — the
    // ONLY `role="tab` occurrence should be the one inside TabWidget.vue
    // itself, never duplicated here.
    expect(src).not.toMatch(/role="tab/);
  });
});
