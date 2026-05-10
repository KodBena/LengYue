/**
 * tests/unit/engine/katago/capability-injection.test.ts
 *
 * Tier-1 (pure-logic) tests for the per-query capability builder
 * in `src/engine/katago/capability-injection.ts`. The engagement
 * matrix has five binary axes (advertised yes/no, isRangeBased
 * yes/no, forReview yes/no, useTransposition yes/no,
 * adaptiveReevaluate.enabled yes/no) and a capability-presence
 * dimension on the advertised side; each branch is a specification
 * of behaviour the analysis-service ACL relies on.
 *
 * The gate for adaptive_reevaluate omission is the explicit
 * `forReview` flag — independent of `isRealtime` (which controls
 * only `reportDuringSearchEvery` over in analysis-service). The
 * two were once collapsed under a misnamed `isSnapshotMode` local
 * that derived from `configOverride !== undefined`; legacy cards
 * (configOverride undefined → that derived flag was false) being
 * review sessions exposed the conflation, and the two dimensions
 * are now separately first-class caller intents.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  buildPerQueryCapabilities,
  shouldWarnTranspositionUnmet,
  type AdaptiveReevaluateInput,
} from '../../../../src/engine/katago/capability-injection';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADAPTIVE_OFF: AdaptiveReevaluateInput = {
  enabled: false,
  worstQuantile: 0.05,
  extraVisits: 800,
};

const ADAPTIVE_ON: AdaptiveReevaluateInput = {
  enabled: true,
  worstQuantile: 0.05,
  extraVisits: 800,
};

// ── buildPerQueryCapabilities ────────────────────────────────────────────────

describe('buildPerQueryCapabilities', () => {
  it('returns undefined on legacy auto-engage path (advertised null)', () => {
    // Pre-v1.0.14 proxy or PROXY_ADVERTISE_CAPABILITIES=false: omit
    // the wire field entirely so the proxy's wired-extensions
    // default fires (the dispatch's Q1 sign-off). This is the
    // correct behaviour for legacy proxies.
    expect(
      buildPerQueryCapabilities({
        advertised: null,
        isRangeBased: true,
        forReview: false,
        useTransposition: true,
        adaptiveReevaluate: ADAPTIVE_ON,
      }),
    ).toBeUndefined();
  });

  it('always includes delta_analysis when the proxy advertises', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isRangeBased: false,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).toBeDefined();
    expect(caps).toHaveProperty('delta_analysis', {});
  });

  it('engages transposition when toggle is on AND advertised', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, transposition: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: true,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).toHaveProperty('transposition', {});
  });

  it('omits transposition when toggle on but proxy does not advertise', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: true,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).not.toHaveProperty('transposition');
  });

  it('engages adaptive_reevaluate on live range queries when user has opted in AND advertised', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).toHaveProperty('adaptive_reevaluate', {
      worst_quantile: 0.05,
      extra_visits: 800,
    });
  });

  it('omits adaptive_reevaluate when user has not opted in (the default)', () => {
    // Even with all other conditions met, the user's enabled flag
    // gates the wire opt-in. Pinned because the default is OFF.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate when forReview is true even when user has opted in', () => {
    // The user-reported regression: review-session card on
    // 2000-visit query returned packets at 2800 visits (2000 +
    // adaptive's 800 extra_visits). The first attempted fix gated
    // on a derived flag that conflated "caller passed a
    // configOverride" with "caller wants final-only packets", which
    // was FALSE on legacy cards (no recorded analysis_config), so
    // adaptive still engaged on review sessions of legacy cards.
    // The correct gate is the explicit `forReview` flag set by
    // useReviewSession.processUserMove regardless of whether the
    // card carries a recorded analysis_config.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isRangeBased: true,
      forReview: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
    expect(caps).toEqual({ delta_analysis: {} });
  });

  it('omits adaptive_reevaluate on turn-locked queries (analyzeActiveNode)', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isRangeBased: false,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate when proxy does not advertise it', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('forwards user-configured worst_quantile and extra_visits to the wire', () => {
    // Pin: the registry values flow to the wire snake_case fields.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isRangeBased: true,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: { enabled: true, worstQuantile: 0.1, extraVisits: 1600 },
    });
    expect(caps?.adaptive_reevaluate).toEqual({
      worst_quantile: 0.1,
      extra_visits: 1600,
    });
  });

  it('produces the full live-range opt-in dict when everything is on', () => {
    const caps = buildPerQueryCapabilities({
      advertised: {
        delta_analysis: {},
        transposition: {},
        adaptive_reevaluate: {},
      },
      isRangeBased: true,
      forReview: false,
      useTransposition: true,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).toEqual({
      delta_analysis: {},
      transposition: {},
      adaptive_reevaluate: { worst_quantile: 0.05, extra_visits: 800 },
    });
  });

  it('produces a minimal review-session opt-in dict (delta_analysis only) regardless of user adaptive opt-in', () => {
    // Regression pin for the visit-count-bloat bug: review session
    // on a legacy card (configOverride undefined; forReview=true
    // from processUserMove) must produce a wire dict without
    // adaptive_reevaluate even when the user has opted in.
    const caps = buildPerQueryCapabilities({
      advertised: {
        delta_analysis: {},
        transposition: {},
        adaptive_reevaluate: {},
        selector: {},
      },
      isRangeBased: true,
      forReview: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).toEqual({ delta_analysis: {} });
  });

  it('returns a fresh object per call (no aliasing across queries)', () => {
    const a = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isRangeBased: false,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    const b = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isRangeBased: false,
      forReview: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(a).not.toBe(b);
  });
});

// ── shouldWarnTranspositionUnmet ─────────────────────────────────────────────

describe('shouldWarnTranspositionUnmet', () => {
  it('returns false when the proxy is on the legacy path (advertised null)', () => {
    expect(shouldWarnTranspositionUnmet(null, true)).toBe(false);
    expect(shouldWarnTranspositionUnmet(null, false)).toBe(false);
  });

  it('returns false when the user toggle is off, regardless of advertisement', () => {
    expect(shouldWarnTranspositionUnmet({}, false)).toBe(false);
    expect(shouldWarnTranspositionUnmet({ transposition: {} }, false)).toBe(false);
  });

  it('returns false when toggle on AND transposition is advertised', () => {
    expect(
      shouldWarnTranspositionUnmet({ transposition: {} }, true),
    ).toBe(false);
    expect(
      shouldWarnTranspositionUnmet({
        delta_analysis: {},
        transposition: {},
      }, true),
    ).toBe(false);
  });

  it('returns true only when toggle on AND advertised dict missing transposition', () => {
    expect(shouldWarnTranspositionUnmet({}, true)).toBe(true);
    expect(
      shouldWarnTranspositionUnmet({ delta_analysis: {} }, true),
    ).toBe(true);
    expect(
      shouldWarnTranspositionUnmet({
        delta_analysis: {},
        adaptive_reevaluate: {},
        selector: {},
      }, true),
    ).toBe(true);
  });
});
