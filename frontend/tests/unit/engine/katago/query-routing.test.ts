/**
 * tests/unit/engine/katago/query-routing.test.ts
 *
 * Tier-1 tests for `finalizeAnalysisRouting` — the SELECTOR-routing
 * seam (work-status item `analysis-query-routing-brand`; the
 * 2026-06-12 missing-`model` incident). The compile-time half of the
 * guard (un-routed queries are un-subscribable) is pinned in
 * `src/engine/katago/subscribe-narrowing.type-test.ts`; this file pins
 * the factory's runtime behaviour.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  finalizeAnalysisRouting,
  type UnroutedAnalysisQuery,
} from '../../../../src/engine/katago/query-routing';

const baseQuery: UnroutedAnalysisQuery = {
  id: 'q-1',
  moves: [],
  rules: 'tromp-taylor',
  boardXSize: 19,
  boardYSize: 19,
  komi: 6.5,
  maxVisits: 100,
  analyzeTurns: [0],
};

describe('finalizeAnalysisRouting', () => {
  it('injects the model leg when a SELECTOR label is selected', () => {
    const routed = finalizeAnalysisRouting(baseQuery, 'b10c128');
    expect(routed.model).toBe('b10c128');
  });

  it('omits the wire field entirely on the explicit null (LEAF mode) decision', () => {
    const routed = finalizeAnalysisRouting(baseQuery, null);
    // Omitted, not set-to-undefined: a non-SELECTOR proxy should never
    // see the key at all (types.ts SELECTOR docs: "clients should omit it").
    expect('model' in routed).toBe(false);
  });

  it('preserves every assembled leg unchanged', () => {
    const withExtras: UnroutedAnalysisQuery = {
      ...baseQuery,
      overrideSettings: { reportAnalysisWinratesAs: 'WHITE' },
      includeOwnership: true,
    };
    const routed = finalizeAnalysisRouting(withExtras, 'xf');
    const { model: _model, ...rest } = routed;
    expect(rest).toEqual(withExtras);
  });

  it('does not mutate the input query', () => {
    const input: UnroutedAnalysisQuery = { ...baseQuery };
    finalizeAnalysisRouting(input, 'b10c128');
    expect('model' in input).toBe(false);
    expect(input).toEqual(baseQuery);
  });
});
