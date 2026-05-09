/**
 * tests/unit/engine/katago/capability-injection.test.ts
 *
 * Tier-1 (pure-logic) tests for the per-query capability builder
 * in `src/engine/katago/capability-injection.ts`. The engagement
 * matrix has four binary axes (advertised yes/no, isSnapshotMode
 * yes/no, isRangeBased yes/no, useTransposition yes/no) and a
 * capability-presence dimension on the advertised side; each branch
 * is a specification of behaviour the analysis-service ACL relies
 * on, so each gets its own test case.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  buildPerQueryCapabilities,
  shouldWarnTranspositionUnmet,
} from '../../../../src/engine/katago/capability-injection';

describe('buildPerQueryCapabilities', () => {
  it('returns undefined on legacy auto-engage path (advertised null)', () => {
    // Pre-v1.0.14 proxy: omit the wire field entirely so the proxy's
    // wired-extensions default fires (the contract Q1 sign-off).
    expect(
      buildPerQueryCapabilities({
        advertised: null,
        isSnapshotMode: false,
        isRangeBased: true,
        useTransposition: true,
      }),
    ).toBeUndefined();
  });

  it('always includes delta_analysis when the proxy advertises capabilities', () => {
    // Even an empty advertisement (no wired Transformers at all)
    // gets the request — the SPA's universal requirement is
    // structurally enforced at probe time, so by the time this
    // helper runs the requirement is known met.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: true,
      isRangeBased: false,
      useTransposition: false,
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
    });
    expect(caps).toHaveProperty('transposition', {});
  });

  it('omits transposition when the toggle is off', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, transposition: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: false,
    });
    expect(caps).not.toHaveProperty('transposition');
  });

  it('omits transposition when toggle on but proxy does not advertise', () => {
    // The asymmetric case the dispatch's §4 describes — silently
    // skip the wire opt-in here; the warning is a probe-time
    // surfacing, not a per-query one.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: true,
    });
    expect(caps).not.toHaveProperty('transposition');
  });

  it('engages adaptive_reevaluate on live range-based queries when advertised', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: false,
    });
    expect(caps).toHaveProperty('adaptive_reevaluate', {});
  });

  it('omits adaptive_reevaluate on snapshot replays even when range-based', () => {
    // Review-session card replay: the middleware's mid-stream
    // follow-ups would diverge from the recorded analysis. Omit
    // unconditionally.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: true,
      isRangeBased: true,
      useTransposition: false,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate on turn-locked queries (analyzeActiveNode)', () => {
    // Single-turn queries don't benefit from a worst-quantile window.
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {}, adaptive_reevaluate: {} },
      isSnapshotMode: false,
      isRangeBased: false,
      useTransposition: false,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
  });

  it('omits adaptive_reevaluate when proxy does not advertise it', () => {
    const caps = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: true,
      useTransposition: false,
    });
    expect(caps).not.toHaveProperty('adaptive_reevaluate');
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
    });
    expect(caps).toEqual({
      delta_analysis: {},
      transposition: {},
      adaptive_reevaluate: {},
    });
  });

  it('produces a minimal review-session opt-in dict (delta_analysis only)', () => {
    // Per the dispatch's worked review-session example: turn-locked,
    // snapshot-mode, transposition off (or absent). Only
    // delta_analysis engages.
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
    });
    expect(caps).toEqual({ delta_analysis: {} });
  });

  it('returns a fresh object per call (no aliasing across queries)', () => {
    const a = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: false,
      useTransposition: false,
    });
    const b = buildPerQueryCapabilities({
      advertised: { delta_analysis: {} },
      isSnapshotMode: false,
      isRangeBased: false,
      useTransposition: false,
    });
    expect(a).not.toBe(b);
  });
});

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
