/**
 * tests/integration/SettingsTab-vertical-orientation.test.ts
 *
 * Commission (ledger rows 1404/1427): the Settings sub-tab strip
 * overflowed by horizontal scrolling; the commissioner wants it a
 * vertical strip beside the pane it controls. TabWidget.vue's own
 * `orientation` prop (default 'horizontal', tested in
 * TabWidget-overflow.test.ts's "orientation contract" block) carries
 * the mechanism; this file asserts the ONE ratified call site —
 * SettingsTab.vue — actually opts in, and that no other TabWidget
 * consumer (App.vue's control-panel strip, ForestDirectory,
 * AnalysisDashboard) was touched, per the ratified scope's explicit
 * "the other three call sites remain horizontal and pixel-unchanged."
 *
 * Source-pinned (not a full `mount()`): SettingsTab.vue pulls in the
 * live app store, i18n, and five child editor components — mounting
 * it for real is its own heavier fixture this pass's charter doesn't
 * need to build just to witness a single prop value on its TabWidget
 * usage. Reading the SFC source directly is the same class of
 * assertion the repo already uses for TabWidget's own
 * "never overflow-x: hidden" check (TabWidget-overflow.test.ts) and
 * elsewhere (grep this suite for `readFileSync`) precisely for this
 * reason. UNEXERCISED: real rendered layout (rail beside pane, width
 * budget, wrapped labels) is not witnessed here or by any test in
 * this suite — jsdom does no real layout; that claim is visual and is
 * left to manual/screenshot verification per the build's own
 * disclosure.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_TAB_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/SettingsTab.vue'),
  'utf-8',
);

const OTHER_TABWIDGET_CONSUMERS = [
  '../../src/App.vue',
  '../../src/components/tree/ForestDirectory.vue',
  '../../src/components/charts/AnalysisDashboard.vue',
] as const;

describe('SettingsTab — vertical sub-tab strip (ledger rows 1404/1427)', () => {
  it("SettingsTab's TabWidget usage passes orientation=\"vertical\"", () => {
    const templateBlock = SETTINGS_TAB_SRC.slice(
      SETTINGS_TAB_SRC.indexOf('<template>'),
      SETTINGS_TAB_SRC.indexOf('</template>'),
    );
    const tabWidgetOpenTag = templateBlock.slice(
      templateBlock.indexOf('<TabWidget'),
      templateBlock.indexOf('>', templateBlock.indexOf('<TabWidget')) + 1,
    );
    expect(tabWidgetOpenTag).toMatch(/orientation="vertical"/);
  });

  it('the other three ratified-unchanged TabWidget call sites never pass orientation="vertical" (scope discipline: only SettingsTab opts in)', () => {
    for (const relPath of OTHER_TABWIDGET_CONSUMERS) {
      const src = fs.readFileSync(path.resolve(__dirname, relPath), 'utf-8');
      expect(src).not.toMatch(/orientation="vertical"/);
    }
  });
});
