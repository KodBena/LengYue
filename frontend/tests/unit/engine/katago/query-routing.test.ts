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
 * Also covers the per-query-overrides merge folded into this same
 * factory (wiki wanted-feature 2, ledger rows 510/511) — see
 * `state/per-query-overrides.ts` and this file's header for why the
 * merge lives here rather than at each of the four builder call
 * sites.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  finalizeAnalysisRouting,
  finalizeMatchAnalysisRouting,
  type UnroutedAnalysisQuery,
} from '../../../../src/engine/katago/query-routing';
import {
  setPerQueryOverridesText,
  _resetPerQueryOverridesForTesting,
} from '../../../../src/state/per-query-overrides';
import {
  setMatchPlayerOverridesText,
  _resetMatchPlayerOverridesForTesting,
} from '../../../../src/state/match-player-overrides';

beforeEach(() => {
  _resetPerQueryOverridesForTesting();
  _resetMatchPlayerOverridesForTesting();
});

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

describe('finalizeAnalysisRouting — per-query overrides merge', () => {
  it('leaves the query unchanged when no override is configured (identity / regression lock)', () => {
    const routed = finalizeAnalysisRouting(baseQuery, null);
    expect('overrideSettings' in routed).toBe(false);
  });

  it('merges a configured override (PDA) into overrideSettings on every routed query', () => {
    setPerQueryOverridesText('{"playoutDoublingAdvantage": 1.5}');
    const routed = finalizeAnalysisRouting(baseQuery, 'b10c128');
    expect(routed.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
    // The routing leg still applies independently.
    expect(routed.model).toBe('b10c128');
  });

  it('precedence: the JSON override wins over a value the builder already computed for the same key', () => {
    setPerQueryOverridesText('{"reportAnalysisWinratesAs": "BLACK"}');
    const withComputedOverride: UnroutedAnalysisQuery = {
      ...baseQuery,
      overrideSettings: { reportAnalysisWinratesAs: 'WHITE' },
    };
    const routed = finalizeAnalysisRouting(withComputedOverride, null);
    expect(routed.overrideSettings).toEqual({ reportAnalysisWinratesAs: 'BLACK' });
  });

  it('an invalid override (never applied, per ADR-0002) does not reach the query', () => {
    setPerQueryOverridesText('{not valid json');
    const routed = finalizeAnalysisRouting(baseQuery, null);
    expect('overrideSettings' in routed).toBe(false);
  });
});

describe('finalizeMatchAnalysisRouting — per-match-player overrides merge (ledger rows 593/594)', () => {
  it('leaves the query unchanged when neither global nor per-player overrides are configured', () => {
    const routed = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    expect('overrideSettings' in routed).toBe(false);
  });

  it("ACCEPTANCE CASE: B gets {playoutDoublingAdvantage:1.5}, W gets {} — the two routed queries' overrideSettings differ accordingly", () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{}');

    const blackRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    const whiteRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'W');

    expect(blackRouted.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect('overrideSettings' in whiteRouted).toBe(false);
  });

  it("a B query never carries W's overrides, and vice versa, when both are configured with DIFFERENT sets", () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{"wideRootNoise": 0.05}');

    const blackRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    const whiteRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'W');

    expect(blackRouted.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(whiteRouted.overrideSettings).toEqual({ wideRootNoise: 0.05 });
    // Cross-contamination check, explicit.
    expect(blackRouted.overrideSettings).not.toHaveProperty('wideRootNoise');
    expect(whiteRouted.overrideSettings).not.toHaveProperty('playoutDoublingAdvantage');
  });

  it('the routing (model) leg still applies independently of the per-player overrides merge', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    const routed = finalizeMatchAnalysisRouting(baseQuery, 'strong-net', 'B');
    expect(routed.model).toBe('strong-net');
    expect(routed.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
  });

  it('precedence: per-player overrides shallow-merge OVER the global session overrides for that player\'s query', () => {
    setPerQueryOverridesText('{"reportAnalysisWinratesAs": "WHITE", "wideRootNoise": 0.01}');
    setMatchPlayerOverridesText('B', '{"wideRootNoise": 0.5, "playoutDoublingAdvantage": 1.5}');

    const blackRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    expect(blackRouted.overrideSettings).toEqual({
      reportAnalysisWinratesAs: 'WHITE', // from the global set, not named by B's per-player JSON
      wideRootNoise: 0.5,                // B's per-player value wins over the global 0.01
      playoutDoublingAdvantage: 1.5,     // new key B's per-player JSON introduced
    });

    // W has no per-player overrides configured — the global set still applies alone.
    const whiteRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'W');
    expect(whiteRouted.overrideSettings).toEqual({
      reportAnalysisWinratesAs: 'WHITE',
      wideRootNoise: 0.01,
    });
  });

  it('an invalid per-player override (ADR-0002) is never applied for that player, independent of the other player', () => {
    setMatchPlayerOverridesText('B', '{not valid json');
    setMatchPlayerOverridesText('W', '{"wideRootNoise": 0.05}');

    const blackRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    const whiteRouted = finalizeMatchAnalysisRouting(baseQuery, null, 'W');

    expect('overrideSettings' in blackRouted).toBe(false);
    expect(whiteRouted.overrideSettings).toEqual({ wideRootNoise: 0.05 });
  });

  it('INTERLEAVE: two match queries built back-to-back for opposite players each carry only their own set (no shared "current player" state)', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    setMatchPlayerOverridesText('W', '{"playoutDoublingAdvantage": 0.5}');

    // Build B's query, THEN W's, THEN B's again — simulating the
    // match loop's per-turn alternation with no reset in between.
    // Each call is independently keyed by its own explicit `player`
    // argument, not by any module-scope "whose turn" pointer.
    const black1 = finalizeMatchAnalysisRouting(baseQuery, null, 'B');
    const white1 = finalizeMatchAnalysisRouting(baseQuery, null, 'W');
    const black2 = finalizeMatchAnalysisRouting(baseQuery, null, 'B');

    expect(black1.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
    expect(white1.overrideSettings).toEqual({ playoutDoublingAdvantage: 0.5 });
    expect(black2.overrideSettings).toEqual({ playoutDoublingAdvantage: 1.5 });
  });

  it('does not mutate the input query', () => {
    setMatchPlayerOverridesText('B', '{"playoutDoublingAdvantage": 1.5}');
    const input: UnroutedAnalysisQuery = { ...baseQuery };
    finalizeMatchAnalysisRouting(input, null, 'B');
    expect('overrideSettings' in input).toBe(false);
  });
});
