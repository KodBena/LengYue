/**
 * tests/unit/analysis-palette-select-label.test.ts
 *
 * Regression guard for menus-ui-audit finding M27 (report.md, ledger
 * row 1251): a DOM probe found the Analysis palette <select> — a
 * control governing move-quality display app-wide — with no id, no
 * aria-label, and no associated <label> (matched only by the class
 * `dark-select`). Source-text assertion rather than a full mount:
 * AnalysisControls.vue pulls in useAnalysisPersistence /
 * useAnalysisLedger / the profile-owner mutation seam, none of which
 * this fix touches, so a source-level for=/id= match is the more
 * honest test for exactly what changed (same posture
 * TabWidget-overflow.test.ts explains for jsdom-unreliable layout —
 * here it's "don't drag in an unrelated composable graph to check two
 * attribute strings match").
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/components/editors/AnalysisControls.vue'), 'utf-8');

describe('AnalysisControls.vue — palette <select> has a programmatically associated label (M27)', () => {
  it('the <select id="..."> and <label for="..."> use the same id', () => {
    const labelMatch = /<label for="([^"]+)">\{\{\s*\$t\('analysis.paletteLabel'\)/.exec(SRC);
    const selectMatch = /<select id="([^"]+)" v-model="activePaletteId"/.exec(SRC);
    expect(labelMatch).not.toBeNull();
    expect(selectMatch).not.toBeNull();
    expect(labelMatch![1]).toBe(selectMatch![1]);
  });
});
