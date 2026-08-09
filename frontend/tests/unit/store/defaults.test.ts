/**
 * tests/unit/store/defaults.test.ts
 *
 * Tier-1 (pure-logic) pin for the median-summary symbol addition
 * (ledger rows 1204/1213/1229, commissioner-defined). `defaults.ts` is
 * the fresh-profile seed; a regression here silently drifts what a
 * brand-new user's `analysis_env` looks like without any migration or
 * hydrate path catching it (defaults are read directly, not migrated).
 *
 * Scope: the three literal facts the commission named —
 *   1. `median_summary` exists with the exact curated-stdlib body.
 *   2. The `quality` palette's `summary_fn` is `median_summary`.
 *   3. `activePaletteId` defaults to `score` (fresh profiles only —
 *      existing users are untouched by the sibling migration, see
 *      `tests/unit/store/migrations.test.ts`'s `70 → 71` block).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../../../src/store/defaults';

describe('defaults.ts — median-summary symbol (ledger rows 1204/1213/1229)', () => {
  const analysisEnv = (defaultSettings as any).engine.katago.analysis_env;

  it('defines median_summary with the exact curated-stdlib body', () => {
    expect(analysisEnv.symbols.median_summary).toBe('float(median(x))');
  });

  it("the 'quality' palette's summary_fn is median_summary", () => {
    const quality = analysisEnv.palettes.find((p: any) => p.id === 'quality');
    expect(quality).toBeDefined();
    expect(quality.summary_fn).toBe('median_summary');
  });

  it('activePaletteId defaults to score (fresh-profile wizard binding)', () => {
    expect(analysisEnv.activePaletteId).toBe('score');
  });
});
