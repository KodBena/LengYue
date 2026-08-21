/**
 * tests/unit/settings-registry-geometry.test.ts
 *
 * Regression guard for menus-ui-audit findings M3 and M6
 * (report.md, `.claude/dispatch-reports/menus-ui-audit/report.md`,
 * ledger row 1290):
 *
 *   M3 — the Advanced Registry scroller was clamped at
 *   `max-height: clamp(400px, 60vh, 800px)` regardless of its own
 *   tab-pane's real height (measured 646/1444 client/scroll inside a
 *   1029px pane, ~380px of the pane sitting empty below the clamp,
 *   with only a horizontal scrollbar painted at rest). Fixed by
 *   removing the clamp and flex-filling the pane instead
 *   (`shared-chrome.css`'s `.registry-container`,
 *   `SettingsPane.vue`'s new `.settings-fill-pane` wrapper on the
 *   Session and Advanced Registry sub-tabs).
 *
 *   M6 — the leaf label (x≈63) and its value column (x≈937) were
 *   separated by a 700-900px empty gutter, `RegistryEditor.vue`'s
 *   `.registry-leaf.scalar` `justify-content: space-between`
 *   stretching across the full unbounded pane. Fixed by capping the
 *   root editor's own width at the app's existing phase-3 reading
 *   measure (`PANEL_CONTENT_READING_MEASURE_CH`,
 *   `state/layout-model.ts` — same constant LibraryTab.vue and
 *   ForestDirectory.vue already cap on; ADR-0012 one-home-per-fact).
 *
 * Source-text assertions (Tier 1 — no DOM, no Vue) for the CSS/markup
 * shape, matching this repo's own stated convention
 * (TabWidget-overflow.test.ts: "Computed style assertion isn't
 * reliable under jsdom, no real layout engine") — the fix is asserted
 * against the actual shipped CSS/template text, not a simulated
 * layout. A cheap mount test at the bottom exercises RegistryEditor's
 * root-vs-nested measure-cap application directly.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import RegistryEditor from '../../src/components/editors/RegistryEditor.vue';
import { i18n } from '../../src/i18n';

const SHARED_CHROME_CSS = readFileSync(resolve(process.cwd(), 'src/assets/css/shared-chrome.css'), 'utf-8');
// SettingsTab.vue was retired (work item `lyt-settings-live-opening`,
// ledger rows 2007/2009/2001) — the panes this file pins moved verbatim
// to SettingsPane.vue.
const SETTINGS_PANE_SRC = readFileSync(resolve(process.cwd(), 'src/components/chrome/SettingsPane.vue'), 'utf-8');
const REGISTRY_EDITOR_SRC = readFileSync(resolve(process.cwd(), 'src/components/editors/RegistryEditor.vue'), 'utf-8');
const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.css'), 'utf-8');
const LAYOUT_MODEL_SRC = readFileSync(resolve(process.cwd(), 'src/state/layout-model.ts'), 'utf-8');

function definedTokens(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}
function referencedTokens(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)) names.add(m[1]);
  return names;
}

describe('shared-chrome.css / SettingsPane.vue / RegistryEditor.vue — no ghost custom properties', () => {
  const defined = definedTokens(THEME_CSS);
  for (const [path, source] of [
    ['src/assets/css/shared-chrome.css', SHARED_CHROME_CSS],
    ['src/components/chrome/SettingsPane.vue', SETTINGS_PANE_SRC],
    ['src/components/editors/RegistryEditor.vue', REGISTRY_EDITOR_SRC],
  ] as const) {
    it(`${path}: every var(--x) reference is defined in theme.css`, () => {
      const ghosts = [...referencedTokens(source)].filter((name) => !defined.has(name));
      expect(ghosts).toEqual([]);
    });
  }
});

describe('shared-chrome.css — .registry-container clamp is gone (M3)', () => {
  it('.registry-container no longer sets a max-height clamp', () => {
    const rule = /\.registry-container\s*\{[^}]*\}/.exec(SHARED_CHROME_CSS);
    expect(rule).not.toBeNull();
    expect(rule![0]).not.toMatch(/max-height/);
  });

  it('.registry-container flex-fills its ancestor instead (flex: 1 1 auto, min-height: 0)', () => {
    const rule = /\.registry-container\s*\{[^}]*\}/.exec(SHARED_CHROME_CSS);
    expect(rule![0]).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(rule![0]).toMatch(/min-height:\s*0/);
  });

  it('vertical overflow still scrolls; horizontal overflow is eliminated, not painted as a second scrollbar (M3)', () => {
    const rule = /\.registry-container\s*\{[^}]*\}/.exec(SHARED_CHROME_CSS);
    expect(rule![0]).toMatch(/overflow-y:\s*auto/);
    expect(rule![0]).toMatch(/overflow-x:\s*hidden/);
  });
});

describe('SettingsPane.vue — Session and Advanced Registry own the full pane height (M3)', () => {
  it('the Advanced Registry sub-tab wraps its registry-container in the fill-pane class', () => {
    const advancedBlock = /<template #advancedRegistry>[\s\S]*?<\/template>/.exec(SETTINGS_PANE_SRC);
    expect(advancedBlock).not.toBeNull();
    expect(advancedBlock![0]).toMatch(/class="tab-padding settings-fill-pane"/);
  });

  it('the Session sub-tab wraps its registry-container in the fill-pane class too (same clamp, same fix)', () => {
    const sessionBlock = /<template #session>[\s\S]*?<\/template>/.exec(SETTINGS_PANE_SRC);
    expect(sessionBlock).not.toBeNull();
    expect(sessionBlock![0]).toMatch(/class="tab-padding settings-fill-pane"/);
  });

  it('.settings-fill-pane is itself a flex column that grows to fill its own flex-column ancestor', () => {
    const rule = /\.settings-fill-pane\s*\{[^}]*\}/.exec(SETTINGS_PANE_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/display:\s*flex/);
    expect(rule![0]).toMatch(/flex-direction:\s*column/);
    expect(rule![0]).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(rule![0]).toMatch(/min-height:\s*0/);
  });

  it('Card Sets keeps its own inline clamp override untouched (not this pass\'s named finding)', () => {
    const cardSetsBlock = /<template #cardSets>[\s\S]*?<\/template>/.exec(SETTINGS_PANE_SRC);
    expect(cardSetsBlock).not.toBeNull();
    expect(cardSetsBlock![0]).toMatch(/max-height:\s*clamp\(500px,\s*70vh,\s*900px\)/);
  });
});

describe('RegistryEditor.vue — bounded reading measure, root only (M6)', () => {
  it('imports the app\'s existing phase-3 reading-measure constant rather than a second hand-typed literal', () => {
    expect(REGISTRY_EDITOR_SRC).toMatch(/PANEL_CONTENT_READING_MEASURE_CH/);
    expect(LAYOUT_MODEL_SRC).toMatch(/export const PANEL_CONTENT_READING_MEASURE_CH/);
  });

  it('.registry-editor.registry-root carries a max-width bound; the base .registry-editor (recursive branches) does not get a second, independent cap', () => {
    const rootRule = /\.registry-editor\.registry-root\s*\{[^}]*\}/.exec(REGISTRY_EDITOR_SRC);
    expect(rootRule).not.toBeNull();
    expect(rootRule![0]).toMatch(/max-width:\s*v-bind/);

    const baseRule = /\.registry-editor\s*\{[^}]*\}/.exec(REGISTRY_EDITOR_SRC);
    expect(baseRule![0]).not.toMatch(/max-width/);
  });
});

describe('RegistryEditor.vue — mount: root instance carries registry-root, nested branch does not (M6)', () => {
  it('a root-mounted editor (no path prop) gets the registry-root class', () => {
    const wrapper = mount(RegistryEditor, {
      props: { registry: { leafA: 1, branch: { leafB: 2 } } },
      // S9 (component-shoddiness audit, 2026-08-21): leaf/branch labels
      // now resolve through `$t(labelKey(key))` (RegistryEditor.vue) —
      // real i18n plugin needed for the mount to render at all, same
      // `global: { plugins: [i18n] }` shape other component mounts in
      // this tree already use (e.g. CardSetEditor-name-and-destructive-
      // style.test.ts).
      global: { plugins: [i18n], stubs: { RegistryEditor: false } },
    });
    const root = wrapper.find('.registry-editor');
    expect(root.classes()).toContain('registry-root');
  });

  it('a nested editor (path prop set, as RegistryEditor recurses into its own branches) does not', () => {
    const wrapper = mount(RegistryEditor, {
      props: { registry: { leafA: 1 }, path: ['branch'] },
      global: { plugins: [i18n] },
    });
    const root = wrapper.find('.registry-editor');
    expect(root.classes()).not.toContain('registry-root');
  });
});
