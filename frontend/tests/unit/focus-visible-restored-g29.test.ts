/**
 * tests/unit/focus-visible-restored-g29.test.ts
 *
 * Regression guard for finding G29 (independent geometry consult,
 * `.claude/dispatch-reports/opus-uiux-geometry-consult.md`, rows
 * 1556/1565): three tab-order stops rendered with `outline-style:
 * none` at the moment of focus — `.uri-display` (a `role="button"
 * tabindex="0"` <span> in the toolbar, `ToolbarEngineUri.vue`),
 * `.rules-select` and `.komi-input` (both in the status bar,
 * `StatusBar.vue`) — because each one's `:focus`/`:focus-visible`
 * rule set `outline: none` unconditionally (or, for `.uri-display`,
 * inside the SAME selector as `:focus-visible`, so keyboard focus
 * silently disappeared three times per tab traversal.
 *
 * Fixed by adding a `:focus-visible` rule to each site using the
 * app's existing focus idiom — `TabWidget.vue`'s
 * `.tab-header li:focus-visible { outline: 2px solid
 * var(--accent-primary); outline-offset: ...; }` — layered ON TOP of
 * (not replacing) each site's existing hover/focus colour change.
 * Visibility only: no tabindex or tab-order change (that half of
 * G28/G29 is explicitly filed for the commissioner, not this pass).
 *
 * Source-text assertions (Tier 1 — no DOM; jsdom's synthetic
 * `:focus-visible` support is unreliable and this repo's own
 * `TabWidget-overflow.test.ts` convention favours asserting the
 * shipped CSS text directly for this class of finding).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOOLBAR_ENGINE_URI_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/chrome/ToolbarEngineUri.vue'),
  'utf-8',
);
const STATUS_BAR_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/board/StatusBar.vue'),
  'utf-8',
);
const TAB_WIDGET_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/chrome/TabWidget.vue'),
  'utf-8',
);

/** The app's existing focus-visible idiom, read live from TabWidget.vue
 *  rather than hardcoded here, so a future palette change can't make
 *  this test lie about what "the idiom" currently is. */
const ACCENT_OUTLINE_COLOR_RULE = /outline:\s*2px solid var\(--accent-primary\)/;

describe('focus-visible restored at the three G29 sites', () => {
  it('sanity: TabWidget.vue actually carries the accent :focus-visible idiom this fix reuses', () => {
    const rule = /\.tab-header li:focus-visible\s*\{[^}]*\}/.exec(TAB_WIDGET_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(ACCENT_OUTLINE_COLOR_RULE);
  });

  it('ToolbarEngineUri.vue: .uri-display no longer nulls its own :focus-visible outline', () => {
    // The old defect: `.uri-display:hover, .uri-display:focus-visible { ... outline: none; }`
    expect(TOOLBAR_ENGINE_URI_SRC).not.toMatch(/\.uri-display:hover,\s*\.uri-display:focus-visible\s*\{[^}]*outline:\s*none/);
    const rule = /\.uri-display:focus-visible\s*\{[^}]*\}/.exec(TOOLBAR_ENGINE_URI_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(ACCENT_OUTLINE_COLOR_RULE);
  });

  it('ToolbarEngineUri.vue: the tab stop itself is untouched (still role=button tabindex=0, no new/removed targets)', () => {
    expect(TOOLBAR_ENGINE_URI_SRC).toMatch(/class="uri-display"[\s\S]*?role="button"[\s\S]*?tabindex="0"/);
  });

  it('StatusBar.vue: .rules-select gets a :focus-visible accent outline', () => {
    const rule = /\.rules-select:focus-visible\s*\{[^}]*\}/.exec(STATUS_BAR_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(ACCENT_OUTLINE_COLOR_RULE);
  });

  it('StatusBar.vue: .komi-input gets a :focus-visible accent outline', () => {
    const rule = /\.komi-input:focus-visible\s*\{[^}]*\}/.exec(STATUS_BAR_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(ACCENT_OUTLINE_COLOR_RULE);
  });

  it('StatusBar.vue: neither select nor input dropped its base outline:none (unconditional-focus hiding is still gone only via the new :focus-visible rule layered on top)', () => {
    expect(STATUS_BAR_SRC).toMatch(/\.rules-select\s*\{[^}]*outline:\s*none;[^}]*\}/);
    expect(STATUS_BAR_SRC).toMatch(/\.komi-input\s*\{[^}]*outline:\s*none;[^}]*\}/);
  });
});
