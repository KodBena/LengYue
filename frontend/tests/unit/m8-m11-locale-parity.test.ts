/**
 * tests/unit/m8-m11-locale-parity.test.ts
 *
 * Review remedy (ledger row 1335), item 3: the M8(c)/M8(b)/M11 keys
 * added in this pass — app.keybindingCapture.banner,
 * statusBar.setupModeActive, analysisChart.emptyState,
 * analysisTimeline.analyseDisabledOffline,
 * analysisTimeline.analyseDisabledNoSelection — must be translated
 * into ja/ko/zh-CN (their feature areas are otherwise fully
 * translated in those catalogs; the fresh namespace doesn't exempt
 * them). `toolbar.popoverStress.*` is the one exception (genuine
 * dev-only precedent — see that key's own catalog history) and is
 * deliberately NOT checked here.
 *
 * This is a translation-PRESENCE witness, not a translation-quality
 * one (this suite has no way to judge Japanese/Korean/Chinese
 * fluency) — it asserts each key exists, is non-empty, and is not a
 * byte-for-byte copy of the English source (a copy would mean
 * "translated" in name only). `i18n-messages-compile.test.ts`
 * separately proves every key in every catalog compiles under
 * vue-i18n's message format.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import en from '../../src/locales/en.json';
import ja from '../../src/locales/ja.json';
import ko from '../../src/locales/ko.json';
import zhCN from '../../src/locales/zh-CN.json';

const CATALOGS: Record<string, Record<string, unknown>> = { ja, ko, 'zh-CN': zhCN };

const KEYS = [
  'app.keybindingCapture.banner',
  'statusBar.setupModeActive',
  'analysisChart.emptyState',
  'analysisTimeline.analyseDisabledOffline',
  'analysisTimeline.analyseDisabledNoSelection',
  // Disease repair (`.claude/dispatch-reports/lyt-second-opus-review.md`
  // N — the leaked raw `nextAction` token, ledger row 2511):
  // `SystemLogPanel.vue`'s `nextActionLabel()` resolves this key rather
  // than rendering `open-default-layout-control` verbatim — pinned here
  // so a translation regression (or a future token added without a
  // matching catalog entry) fails the same locale-parity net every
  // other M8/M11 key already relies on.
  'systemLog.nextActionToken.open-default-layout-control',
] as const;

describe('M8/M11 locale parity — ja/ko/zh-CN carry real translations', () => {
  for (const key of KEYS) {
    it(`en.${key} exists (sanity: the key this test pins is real)`, () => {
      expect(typeof (en as Record<string, unknown>)[key]).toBe('string');
    });

    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      it(`${locale}.${key} exists, is non-empty, and is not a copy of the English source`, () => {
        const value = catalog[key];
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
        expect(value).not.toBe((en as Record<string, unknown>)[key]);
      });
    }
  }
});
