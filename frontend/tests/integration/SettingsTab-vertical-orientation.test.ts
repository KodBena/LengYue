/**
 * tests/integration/SettingsTab-vertical-orientation.test.ts
 *
 * Commission (ledger rows 1404/1427): the Settings sub-tab strip
 * overflowed by horizontal scrolling; the commissioner wants it a
 * vertical strip beside the pane it controls. TabWidget.vue's own
 * `orientation` prop (tested in TabWidget-overflow.test.ts's
 * "orientation contract" block) carries the mechanism.
 *
 * Ruling update (ledger rows 1505/1509/1515/1516): the vertical strip
 * first shipped hardcoded on (`orientation="vertical"` literal) with
 * the rail on the left. The commissioner's follow-up ruling was two
 * parts: (1) the rail's SIDE moves to the right (TabWidget.vue's own
 * suite covers that half — `.vue-tabs--vertical`'s `row-reverse`);
 * (2) orientation itself becomes a QUIET, user-owned, PERSISTED
 * choice — `session.ui.settingsTabsOrientation` — defaulting to
 * `'horizontal'`, restoring the pre-vtabs strip for everyone who
 * hasn't opted in via the Session (UI) pane's select. This file now
 * asserts:
 *   - SettingsTab's TabWidget usage binds `orientation` DYNAMICALLY
 *     to `store.session.ui.settingsTabsOrientation` — no longer a
 *     hardcoded literal.
 *   - The default (`defaults.ts`'s `defaultSessionUI`) is
 *     `'horizontal'`.
 *   - The round trip actually works: mutating
 *     `store.session.ui.settingsTabsOrientation` on the real store
 *     singleton and re-rendering the same binding shape SettingsTab
 *     uses flows through to TabWidget's vertical modifier class.
 *   - No other TabWidget consumer (App.vue's control-panel strip,
 *     ForestDirectory, AnalysisDashboard) was touched — the ratified
 *     scope's "the other three call sites remain horizontal and
 *     pixel-unchanged" still holds.
 *
 * Source-pinned for the SettingsTab.vue assertions (not a full
 * `mount()`): SettingsTab.vue pulls in the live app store, i18n, and
 * five child editor components — mounting it for real is its own
 * heavier fixture this pass's charter doesn't need to build just to
 * witness a prop binding. Reading the SFC source directly is the same
 * class of assertion the repo already uses for TabWidget's own
 * "never overflow-x: hidden" check (TabWidget-overflow.test.ts) and
 * elsewhere (grep this suite for `readFileSync`) precisely for this
 * reason.
 *
 * The round-trip test below DOES mount — but TabWidget directly (the
 * real component, no stub), with the exact same
 * `:orientation="store.session.ui.settingsTabsOrientation"` binding
 * expression SettingsTab.vue's template carries, against the real
 * store singleton (`../../src/store`). This is the same "don't
 * simulate the wiring, use the real pieces" posture as the rest of
 * this suite, scoped to just the two pieces (store leaf + TabWidget
 * prop) that make the round trip real, without pulling in
 * SettingsTab's five unrelated heavy child editors.
 *
 * UNEXERCISED: real rendered layout (rail beside pane, width budget,
 * wrapped labels) is not witnessed here or by any test in this suite
 * — jsdom does no real layout; that claim is visual and is left to
 * manual/screenshot verification per the build's own disclosure.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { store, resetWorkspace } from '../../src/store';
import { defaultSessionUI } from '../../src/store/defaults';
import TabWidget from '../../src/components/chrome/TabWidget.vue';

const SETTINGS_TAB_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/SettingsTab.vue'),
  'utf-8',
);

// REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
// the control-panel strip's own TabWidget usage moved out of App.vue's
// template — LytNode.vue's own Exclusive case now drives it directly
// (convergence with, not a second implementation of, TabWidget.vue). The
// scope-discipline check below still needs a literal `<TabWidget ...>`
// open tag to scan; LytNode.vue is where that tag now lives, and it binds
// no `orientation` at all (TabWidget's own default, 'horizontal' — the
// SAME "remains horizontal" invariant this test polices, just relocated).
const OTHER_TABWIDGET_CONSUMERS = [
  '../../src/components/chrome/LytNode.vue',
  '../../src/components/tree/ForestDirectory.vue',
  '../../src/components/charts/AnalysisDashboard.vue',
] as const;

const TABS = [{ id: 'session', label: 'Session (UI)' }, { id: 'analysisEnv', label: 'Analysis Environment' }];

describe('SettingsTab — sub-tab strip orientation is a persisted, default-horizontal option (ledger rows 1404/1427, 1505/1509/1515/1516)', () => {
  it("SettingsTab's TabWidget usage binds orientation to store.session.ui.settingsTabsOrientation (no longer a hardcoded \"vertical\" literal)", () => {
    const templateBlock = SETTINGS_TAB_SRC.slice(
      SETTINGS_TAB_SRC.indexOf('<template>'),
      SETTINGS_TAB_SRC.indexOf('</template>'),
    );
    const tabWidgetOpenTag = templateBlock.slice(
      templateBlock.indexOf('<TabWidget'),
      templateBlock.indexOf('>', templateBlock.indexOf('<TabWidget')) + 1,
    );
    expect(tabWidgetOpenTag).not.toMatch(/orientation="vertical"/);
    expect(tabWidgetOpenTag).toMatch(/:orientation="store\.session\.ui\.settingsTabsOrientation"/);
  });

  it('the Session (UI) pane offers a select control for the option, alongside the existing theme selector', () => {
    expect(SETTINGS_TAB_SRC).toMatch(/id="settings-tabs-orientation-select"/);
    expect(SETTINGS_TAB_SRC).toMatch(/settings\.label\.settingsTabsOrientation/);
    expect(SETTINGS_TAB_SRC).toMatch(/settings\.option\.settingsTabsOrientation\.horizontal/);
    expect(SETTINGS_TAB_SRC).toMatch(/settings\.option\.settingsTabsOrientation\.vertical/);
  });

  it("the select's write path uses the store's sanctioned mutation idiom (direct assignment + touchSession bump), not the deltaViewMode setter's missing-bump defect", () => {
    expect(SETTINGS_TAB_SRC).toMatch(
      /function setSettingsTabsOrientation\([^)]*\)[^{]*\{\s*store\.session\.ui\.settingsTabsOrientation = orientation;\s*touchSession\(\);\s*\}/,
    );
  });

  it("defaults.ts seeds settingsTabsOrientation: 'horizontal' (fresh profiles land on the pre-vtabs strip)", () => {
    expect(defaultSessionUI.settingsTabsOrientation).toBe('horizontal');
  });

  it('the other three ratified-unchanged TabWidget call sites never pass orientation="vertical" nor bind settingsTabsOrientation (scope discipline: only SettingsTab opts in)', () => {
    // W3 (lyt-vue-realization-roadmap.md §8 W3): App.vue's own resizer
    // bars carry a legitimate, unrelated `aria-orientation="vertical"`
    // (ARIA's own vocabulary for a `role="separator"` drag handle) —
    // scoped to each file's own `<TabWidget ...>` OPEN TAG, mirroring
    // the SettingsTab assertion above, so this check polices the actual
    // TabWidget prop binding rather than any occurrence of the same
    // literal substring elsewhere in the file for an unrelated reason.
    for (const relPath of OTHER_TABWIDGET_CONSUMERS) {
      const src = fs.readFileSync(path.resolve(__dirname, relPath), 'utf-8');
      expect(src).not.toMatch(/settingsTabsOrientation/);
      const tabWidgetOpenTags = src.match(/<TabWidget\b[^>]*>/g) ?? [];
      expect(tabWidgetOpenTags.length).toBeGreaterThan(0);
      for (const tag of tabWidgetOpenTags) {
        expect(tag).not.toMatch(/orientation="vertical"/);
      }
    }
  });
});

describe('SettingsTab — orientation option round-trips through the real store into TabWidget', () => {
  // A minimal host carrying the EXACT binding expression SettingsTab.vue's
  // template uses, mounted with the real TabWidget (no stub) against the
  // real store singleton — see the file header for why this stands in for
  // a full SettingsTab mount.
  const Host = defineComponent({
    render() {
      return h(TabWidget, {
        tabs: TABS,
        modelValue: 'session',
        orientation: store.session.ui.settingsTabsOrientation,
      });
    },
  });

  afterEach(() => {
    resetWorkspace();
  });

  it('default (fresh store) renders TabWidget horizontal — no vertical modifier class', () => {
    expect(store.session.ui.settingsTabsOrientation).toBe('horizontal');
    const wrapper = mount(Host);
    expect(wrapper.find('.vue-tabs').classes()).not.toContain('vue-tabs--vertical');
    expect(wrapper.find('.tab-header').attributes('aria-orientation')).toBe('horizontal');
  });

  it('setting store.session.ui.settingsTabsOrientation = "vertical" flows through: TabWidget receives orientation="vertical" and renders the right-side rail modifier', () => {
    store.session.ui.settingsTabsOrientation = 'vertical';
    const wrapper = mount(Host);
    expect(wrapper.find('.vue-tabs').classes()).toContain('vue-tabs--vertical');
    expect(wrapper.find('.tab-header').attributes('aria-orientation')).toBe('vertical');
  });
});
