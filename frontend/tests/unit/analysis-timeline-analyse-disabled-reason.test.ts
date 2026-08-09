/**
 * tests/unit/analysis-timeline-analyse-disabled-reason.test.ts
 *
 * Regression guard for M11 (menus-ui audit row 1291): "the Analyse
 * affordance reflects engine availability honestly (disabled-with-
 * reason or equivalent)." The button was already functionally
 * disabled (`!engineConnected || selectionNodeCount === 0`); the
 * defect was that disabled-ness carried no visible reason (the audit:
 * "Analyse Selection (20) still presents as available" — a disabled
 * button distinguishable from an enabled one only by low-contrast
 * opacity reads as available at a glance). `analyseDisabledTitle` now
 * names the specific blocking condition via the button's `title`.
 *
 * Source-text assertion (Tier 1 — no DOM, no Vue): AnalysisTimelinePanel
 * self-sources its view-model from `injectAnalysisContext()`
 * (useAnalysisTimeline / useAnalysisProjection / useEnrichedData, …),
 * so a full mount needs either a real board run through
 * `provideAnalysisContext` or a hand-built context satisfying that
 * whole `ReturnType<typeof useAnalysisContext>` shape — out of
 * proportion to the two-branch computed this fix adds. Same posture
 * `analysis-palette-select-label.test.ts` (M27) already uses for the
 * sibling file in this same audit pass.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/components/charts/AnalysisTimelinePanel.vue'), 'utf-8');

describe('AnalysisTimelinePanel.vue — Analyse Selection is disabled-with-reason (M11)', () => {
  it('checks engine connectivity before falling back to the no-selection reason', () => {
    const computedMatch = /const analyseDisabledTitle = computed<string \| null>\(\(\) => \{([\s\S]*?)\}\);/.exec(SRC);
    expect(computedMatch).not.toBeNull();
    const body = computedMatch![1];

    const offlineIdx = body.indexOf('engineConnected');
    const noSelectionIdx = body.indexOf('selectionNodeCount');
    expect(offlineIdx).toBeGreaterThanOrEqual(0);
    expect(noSelectionIdx).toBeGreaterThanOrEqual(0);
    expect(offlineIdx).toBeLessThan(noSelectionIdx);
  });

  it('the button disables on the same computed, and surfaces it as a title (not opacity alone)', () => {
    const buttonMatch = /<button\s+class="analyze-btn"[\s\S]*?<\/button>/.exec(SRC);
    expect(buttonMatch).not.toBeNull();
    const button = buttonMatch![0];

    expect(button).toMatch(/:disabled="analyseDisabledTitle !== null"/);
    expect(button).toMatch(/:title="analyseDisabledTitle \? \$t\(analyseDisabledTitle\) : undefined"/);
  });

  it('both reason keys exist in the en locale catalog', () => {
    const en = JSON.parse(readFileSync(resolve(process.cwd(), 'src/locales/en.json'), 'utf-8'));
    expect(typeof en['analysisTimeline.analyseDisabledOffline']).toBe('string');
    expect(typeof en['analysisTimeline.analyseDisabledNoSelection']).toBe('string');
  });
});
