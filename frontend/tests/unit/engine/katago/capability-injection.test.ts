/**
 * tests/unit/engine/katago/capability-injection.test.ts
 *
 * Tier-1 (pure-logic) tests for the per-query capability builder
 * in `src/engine/katago/capability-injection.ts`. The engagement
 * matrix has five binary axes (advertised yes/no, isSnapshotMode
 * yes/no, isRangeBased yes/no, useTransposition yes/no,
 * adaptiveReevaluate.enabled yes/no) and a capability-presence
 * dimension on the advertised side; each branch is a specification
 * of behaviour the analysis-service ACL relies on.
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
    // correct behaviour for legacy proxies — reverted from a brief
    // experiment with always-send semantics.
    expect(
      buildPerQueryCapabilities({
        advertised: null,
        isSnapshotMode: false,
        isRangeBased: true,
        useTransposition: true,
        adaptiveReevaluate: ADAPTIVE_ON,
      }),
    ).toBeUndefined();
  });

  it('always includes delta_analysis when the proxy advertises', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: true,
      isRangeBased: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).toBeDefined();
    expect(caps).toHaveProperty('delta_analysis', {});
  });

  it('engages transposition when toggle is on AND advertised', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, transposition: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: true,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).toHaveProperty('transposition', {});
  });

  it('omits transposition when toggle on but proxy does not advertise', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: true,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).not.toHaveProperty('transposition');
  });

  it('engages adaptive_reevaluate on live range queries when user has opted in AND advertised', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: true,
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
    // gates the wire opt-in. Pinned because the default is OFF —
    // a regression that flipped this on by default would
    // immediately surface the visit-count-bloat bug on review-
    // session grading and similar consumers.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate on snapshot replays even when user has opted in', () => {
    // Review-session card replay. Adaptive's mid-stream follow-ups
    // would diverge from the recorded analysis the card was minted
    // under (and inflate the visit count, breaking visit-ratio
    // grading). Snapshot mode is the structural override.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: true,
      isRangeBased: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
    expect(caps).toEqual({ delta_analysis: {} });
  });

  it('omits adaptive_reevaluate on turn-locked queries (analyzeActiveNode)', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate when proxy does not advertise it', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('forwards user-configured worst_quantile and extra_visits to the wire', () => {
    // Pin: the registry values flow to the wire snake_case fields.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: true,
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
      isSnapshotMode: false,
      isRangeBased: true,
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
    // The user-reported regression: review-session card on
    // 2000-visit query returned packets at 2800 visits (2000 +
    // adaptive's 800 extra_visits). The fix gates adaptive on
    // !isSnapshotMode AND user-opt-in; this test pins both gates
    // by passing isSnapshotMode=true alongside the user having
    // opted in. The wire dict must remain {delta_analysis: {}}.
    const caps = buildPerQueryCapabilities({
      advertised: {
        delta_analysis: {},
        transposition: {},
        adaptive_reevaluate: {},
        selector: {},
      },
      isSnapshotMode: true,
      isRangeBased: true,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_ON,
    });
    expect(caps).toEqual({ delta_analysis: {} });
  });

  it('returns a fresh object per call (no aliasing across queries)', () => {
    const a = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: false,
      useTransposition: false,
      adaptiveReevaluate: ADAPTIVE_OFF,
    });
    const b = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: false,
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
