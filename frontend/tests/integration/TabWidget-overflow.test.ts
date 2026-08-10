/**
 * tests/integration/TabWidget-overflow.test.ts
 *
 * Resolution roadmap Phase 2 (ledger row 928, audit finding R2): both
 * the top-level control-panel strip and the Settings sub-tab strip
 * render through `TabWidget.vue` (App.vue's `controlTabs`,
 * SettingsTab.vue's `subTabs`), so this is the single surface that
 * needs the fix. R2's finding was two-part — a squeezed strip
 * silently truncated labels with no scrollbar, AND the `<li>` items
 * carried no `role`/`tabindex`, so keyboard traversal could not reach
 * an off-screen tab either. Both are asserted here directly against
 * the DOM (no ResizeObserver needed — this is a static CSS/markup
 * fix, not a measured-fit decision).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TabWidget from '../../src/components/chrome/TabWidget.vue';

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'cards', label: 'Cards' },
  { id: 'settings', label: 'Settings' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'other', label: 'Other' },
];

function mountWidget(modelValue = 'library') {
  return mount(TabWidget, {
    props: { tabs: TABS, modelValue },
    slots: {
      library: '<div>Library content</div>',
      cards: '<div>Cards content</div>',
      settings: '<div>Settings content</div>',
      analysis: '<div>Analysis content</div>',
      other: '<div>Other content</div>',
    },
  });
}

describe('TabWidget — overflow affordance (audit R2)', () => {
  it('the strip itself carries a scrollable overflow-x, not a silent clip', () => {
    const wrapper = mountWidget();
    const header = wrapper.find('.tab-header');
    expect(header.exists()).toBe(true);
    expect(header.attributes('style') ?? '').not.toMatch(/overflow-x:\s*hidden/);
    // Computed style assertion isn't reliable under jsdom (no real
    // layout engine); the scoped stylesheet rule itself is asserted
    // directly against the component's own CSS text in the sibling
    // "never overflow-x: hidden" test below.
  });

  it('every tab, including ones that would overflow a narrow strip, is present in the DOM (nothing amputated)', () => {
    const wrapper = mountWidget();
    const items = wrapper.findAll('.tab-header li');
    expect(items.length).toBe(TABS.length);
    for (const tab of TABS) {
      expect(wrapper.text()).toContain(tab.label);
    }
  });
});

describe('TabWidget — keyboard reachability (audit R2)', () => {
  it('every tab is keyboard-focusable (tabindex=0), not tabindex=-1', () => {
    const wrapper = mountWidget();
    for (const item of wrapper.findAll('.tab-header li')) {
      expect(item.attributes('tabindex')).toBe('0');
    }
  });

  it('every tab carries role="tab" and the strip carries role="tablist" (a screen reader / keyboard user can discover the whole set)', () => {
    const wrapper = mountWidget();
    expect(wrapper.find('.tab-header').attributes('role')).toBe('tablist');
    for (const item of wrapper.findAll('.tab-header li')) {
      expect(item.attributes('role')).toBe('tab');
    }
  });

  it('Enter on a non-active tab activates it (emits update:modelValue)', async () => {
    const wrapper = mountWidget('library');
    const items = wrapper.findAll('.tab-header li');
    await items[3]!.trigger('keydown.enter'); // "Analysis"
    expect(wrapper.emitted('update:modelValue')).toEqual([['analysis']]);
  });

  it('Space on a non-active tab activates it (emits update:modelValue)', async () => {
    const wrapper = mountWidget('library');
    const items = wrapper.findAll('.tab-header li');
    await items[4]!.trigger('keydown.space'); // "Other"
    expect(wrapper.emitted('update:modelValue')).toEqual([['other']]);
  });

  it('aria-selected reflects the active tab', () => {
    const wrapper = mountWidget('settings');
    const items = wrapper.findAll('.tab-header li');
    expect(items[2]!.attributes('aria-selected')).toBe('true');
    expect(items[0]!.attributes('aria-selected')).toBe('false');
  });
});

describe('TabWidget — never overflow-x: hidden (audit R1/R2 shared proscription)', () => {
  it("the component's own scoped stylesheet never sets overflow-x: hidden on the strip", async () => {
    // Read the raw SFC source rather than a computed style (jsdom does
    // no real layout, so getComputedStyle can't tell "auto" from
    // "hidden" reliably) — this is the same class of assertion as
    // grepping for the forbidden literal, but scoped to the one file
    // this arc's fix landed in.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/chrome/TabWidget.vue'),
      'utf-8',
    );
    const styleBlock = src.slice(src.indexOf('<style'), src.indexOf('</style>'));
    expect(styleBlock).not.toMatch(/overflow-x:\s*hidden/);
    expect(styleBlock).toMatch(/overflow-x:\s*auto/);
  });
});

describe('TabWidget — orientation contract (ledger rows 1404/1427: Settings sub-tab strip goes vertical)', () => {
  it('default (no orientation prop) renders exactly the pre-existing horizontal structure: no vertical modifier class, aria-orientation="horizontal"', () => {
    const wrapper = mountWidget();
    const root = wrapper.find('.vue-tabs');
    expect(root.classes()).not.toContain('vue-tabs--vertical');
    expect(wrapper.find('.tab-header').attributes('aria-orientation')).toBe('horizontal');
  });

  it('orientation="horizontal" explicit is identical to the default (no vertical modifier class)', () => {
    const wrapper = mount(TabWidget, {
      props: { tabs: TABS, modelValue: 'library', orientation: 'horizontal' },
      slots: { library: '<div>Library content</div>' },
    });
    expect(wrapper.find('.vue-tabs').classes()).not.toContain('vue-tabs--vertical');
    expect(wrapper.find('.tab-header').attributes('aria-orientation')).toBe('horizontal');
  });

  it('orientation="vertical" adds the vertical modifier class and aria-orientation="vertical" on the tablist', () => {
    const wrapper = mount(TabWidget, {
      props: { tabs: TABS, modelValue: 'library', orientation: 'vertical' },
      slots: {
        library: '<div>Library content</div>',
        cards: '<div>Cards content</div>',
        settings: '<div>Settings content</div>',
        analysis: '<div>Analysis content</div>',
        other: '<div>Other content</div>',
      },
    });
    expect(wrapper.find('.vue-tabs').classes()).toContain('vue-tabs--vertical');
    expect(wrapper.find('.tab-header').attributes('aria-orientation')).toBe('vertical');
  });

  it('vertical orientation preserves every tab (role=tab, tabindex=0, activation) — the contract R2 fixed is not lost by the new axis', async () => {
    const wrapper = mount(TabWidget, {
      props: { tabs: TABS, modelValue: 'library', orientation: 'vertical' },
      slots: {
        library: '<div>Library content</div>',
        cards: '<div>Cards content</div>',
        settings: '<div>Settings content</div>',
        analysis: '<div>Analysis content</div>',
        other: '<div>Other content</div>',
      },
    });
    const items = wrapper.findAll('.tab-header li');
    expect(items.length).toBe(TABS.length);
    for (const item of items) {
      expect(item.attributes('role')).toBe('tab');
      expect(item.attributes('tabindex')).toBe('0');
    }
    await items[3]!.trigger('keydown.enter'); // "Analysis"
    expect(wrapper.emitted('update:modelValue')).toEqual([['analysis']]);
  });

  it('the vertical modifier stylesheet lays the strip out as a column beside the body (row root, column header) — source-pinned: jsdom does no real layout, so this reads the scoped CSS text rather than a computed/measured box (UNEXERCISED: real visual side-by-side placement is not witnessed by this suite)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/chrome/TabWidget.vue'),
      'utf-8',
    );
    const styleBlock = src.slice(src.indexOf('<style'), src.indexOf('</style>'));
    expect(styleBlock).toMatch(/\.vue-tabs--vertical\s*{[^}]*flex-direction:\s*row/);
    expect(styleBlock).toMatch(/\.vue-tabs--vertical \.tab-header\s*{[^}]*flex-direction:\s*column/);
    // The vertical rail still never clips its own overflow axis — it
    // rotates to overflow-y instead of the horizontal strip's
    // overflow-x, but the "the strip scrolls itself, nothing is
    // amputated" discipline the R2 tests above assert still holds.
    expect(styleBlock).toMatch(/\.vue-tabs--vertical \.tab-header\s*{[^}]*overflow-y:\s*auto/);
  });
});
