/**
 * tests/unit/toolbar-stable-activation.test.ts
 *
 * Regression guard for the stable-activation commission (rows
 * 1556/1559), findings G6 and G7 of the independent geometry consult
 * (`.claude/dispatch-reports/opus-uiux-geometry-consult.md`): the
 * class "activating a control displaces that control (or its
 * neighbors)".
 *
 * G6 — clicking `.setup-trigger` used to grow `.top-nav-bar` 32→93px,
 * push `#split-workspace` down 30px, and move the trigger itself 81px
 * left. The fix takes `.setup-palette` out of document flow
 * (`position: absolute`, anchored under the trigger) so opening it
 * cannot add height or width to `.toolbar`'s own layout — the same
 * idiom this codebase already uses for `ToolbarSliderPopover.vue`'s
 * `.sliders-popover` and `LocalePicker.vue`'s `.locale-menu`.
 *
 * G7 — clicking the sidebar-collapse button used to teleport it 168px
 * left (`{x:176}` → `{x:8}`) because it lived inside `.top-nav-bar`,
 * AFTER the collapsible `SidebarWidget` in `#main-area`'s flex row —
 * hiding the sidebar's width slid everything after it left, including
 * the button's own ancestor. The fix moves the button to its own
 * always-rendered `.sidebar-collapse-rail`, BEFORE `SidebarWidget` in
 * source order, so it is the first flex child of `#main-area` in both
 * the expanded and collapsed sidebar states.
 *
 * Source-text assertions (Tier 1), matching this repo's stated
 * jsdom-layout-is-unreliable convention (see
 * `pointer-target-minimum-size.test.ts` / `TabWidget-overflow.test.ts`):
 * real pixel geometry needs a live layout engine this suite's jsdom
 * environment doesn't provide (`vitest.config.ts` sets `css: false`),
 * so the property under test — "this element cannot participate in
 * flex reflow" / "this element precedes the collapsible region in
 * source order" — is asserted directly against the CSS rule and the
 * template markup instead of a measured rect.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

describe('SetupToolPalette.vue — palette is out of flow (G6)', () => {
  const file = src('src/components/chrome/SetupToolPalette.vue');

  it('.setup-palette is position: absolute, not static/in-flow', () => {
    const rule = /\.setup-palette\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*absolute/);
    expect(rule![0]).not.toMatch(/position:\s*static/);
  });

  it('.setup-palette anchors under the trigger (top: 100%) like the app\'s other toolbar popovers', () => {
    const rule = /\.setup-palette\s*\{[^}]*\}/.exec(file)![0];
    expect(rule).toMatch(/top:\s*100%/);
  });

  it('.setup-palette stays opaque (no transparent-overlay regression)', () => {
    const rule = /\.setup-palette\s*\{[^}]*\}/.exec(file)![0];
    expect(rule).toMatch(/background:\s*var\(--surface-0\)/);
  });

  it('.setup-toolkit no longer stacks trigger+palette in a column (the growth mechanism G6 witnessed)', () => {
    const rule = /\.setup-toolkit\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/flex-direction:\s*column/);
  });
});

describe('App.vue — sidebar-collapse button sits in a stable rail (G7)', () => {
  const file = src('src/App.vue');

  it('.sidebar-collapse-rail is a non-shrinking flex child (immune to sibling width changes)', () => {
    const rule = /\.sidebar-collapse-rail\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex-shrink:\s*0/);
  });

  it('the sidebar-collapse button markup precedes <SidebarWidget in source order', () => {
    const railButtonIdx = file.indexOf(`toggleChrome('sidebarExpanded')`);
    const sidebarWidgetIdx = file.indexOf('<SidebarWidget');
    expect(railButtonIdx).toBeGreaterThan(-1);
    expect(sidebarWidgetIdx).toBeGreaterThan(-1);
    expect(railButtonIdx).toBeLessThan(sidebarWidgetIdx);
  });

  it('the sidebar-collapse button renders before .top-nav-bar in source order (that ancestor is what shifted)', () => {
    // The rail sits in #main-area, before SidebarWidget and before
    // #main-workspace (which nests .top-nav-bar) — so its call site
    // must appear earlier in the template than the top-nav-bar div.
    const railButtonIdx = file.indexOf(`toggleChrome('sidebarExpanded')`);
    const topNavBarIdx = file.indexOf('class="top-nav-bar"');
    expect(railButtonIdx).toBeGreaterThan(-1);
    expect(topNavBarIdx).toBeGreaterThan(-1);
    expect(railButtonIdx).toBeLessThan(topNavBarIdx);
  });

  it('only one call site toggles sidebarExpanded (no duplicate button left behind)', () => {
    const matches = file.match(/toggleChrome\('sidebarExpanded'\)/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
