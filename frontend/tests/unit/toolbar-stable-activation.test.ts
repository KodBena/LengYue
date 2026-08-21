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
 * left. REWORKED (orchestrator correction): an earlier revision of
 * this guard asserted `.setup-palette` moved out of flow
 * (`position: absolute`) — that shape silently superseded a standing
 * COMMISSIONER ruling (the palette must never cover any board pixel,
 * opaque or not) which no delegate or orchestrator brief may override.
 * The corrected fix keeps `.setup-palette` in flow (`position:
 * static`, as the ruling requires) but makes it ALWAYS mounted, so its
 * box permanently RESERVES the space `.setup-toolkit` needs — a
 * `.palette-closed` class toggles `visibility: hidden` (which
 * suppresses paint without collapsing layout), never `v-if`/`v-show`
 * (both of which collapse the box, which was the actual G6 root
 * cause). `.setup-toolkit`'s height is therefore constant across open/
 * close, without ever leaving the toolbar's own flow.
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

describe('SetupToolPalette.vue — palette space is reserved in flow, never floated over the board (G6)', () => {
  const file = src('src/components/chrome/SetupToolPalette.vue');

  it('.setup-palette stays position: static — the commissioner ruling (never covers the board) is honoured', () => {
    const rule = /(?:^|\n)\.setup-palette\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*static/);
    expect(rule![0]).not.toMatch(/position:\s*absolute/);
  });

  it('.setup-toolkit stacks trigger+palette in a column, in normal flow (the reserved-space container)', () => {
    const rule = /\.setup-toolkit\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex-direction:\s*column/);
  });

  it('the palette div is unconditionally rendered — no v-if on it (v-if was the actual G6 root cause: box collapses to zero on close)', () => {
    const paletteDivOpen = /<div\s+class="setup-palette"/.exec(file);
    expect(paletteDivOpen).not.toBeNull();
    // The v-if/v-show attribute, if present, would appear on the SAME
    // opening tag as class="setup-palette" (or immediately adjacent);
    // scan a window around the match for either directive.
    const windowStart = Math.max(0, paletteDivOpen!.index - 200);
    const tagWindow = file.slice(windowStart, paletteDivOpen!.index + 400);
    // Only the class binding should govern paletteOpen on this element —
    // no v-if="paletteOpen" and no v-show="paletteOpen" anywhere in the
    // tag's own attribute window.
    expect(tagWindow).not.toMatch(/v-if="paletteOpen"/);
    expect(tagWindow).not.toMatch(/v-show="paletteOpen"/);
  });

  it('.palette-closed suppresses paint via visibility: hidden, never display: none (display:none would collapse the reserved box)', () => {
    const rule = /\.setup-palette\.palette-closed\s*\{[^}]*\}/.exec(file);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/visibility:\s*hidden/);
    expect(rule![0]).not.toMatch(/display:\s*none/);
  });

  it('the palette-closed class is driven by !paletteOpen (closes when the trigger is toggled off)', () => {
    expect(file).toMatch(/'palette-closed':\s*!paletteOpen/);
  });
});

// RETIRED, W1 skeleton rework (`.claude/dispatch-reports/lyt-vue-realization-
// roadmap.md`, `.claude/dispatch-reports/lyt-w1-repair-build.md`): the
// `.sidebar-collapse-rail` button + `.top-nav-bar` shape G7 guards against
// no longer exists at all. `boardRail` (the sidebar's LYT identity) is now
// a `presenceDefaultVisible: false` slot in `state/lyt-layout.gen.ts` —
// LytNode.vue does not render it, and there is no toggle affordance this
// wave (roadmap §8 W1: "NO toggles this wave"). `toggleChrome('sidebarExpanded')`
// and `<SidebarWidget` do not appear in App.vue at all post-rework, so
// every assertion below would fail on an absent subject, not a regressed
// one. `describe.skip` (not deletion) per the pre-merge-checklist's test-
// triage discipline: the ORIGINAL G7 finding (activating a control
// teleports it via ancestor reflow) remains valid institutional knowledge,
// it just has no current subject to guard. Expected to return, REWRITTEN
// (not merely re-enabled — the mechanism is now a presence-menu checkbox,
// not an always-rendered rail button), when W2 wires boardRail's presence-
// menu toggle.
describe.skip('App.vue — sidebar-collapse button sits in a stable rail (G7) [RETIRED W1 — see comment above]', () => {
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
