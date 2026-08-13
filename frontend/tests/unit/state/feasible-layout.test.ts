/**
 * tests/unit/state/feasible-layout.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/state/feasible-layout.ts` — the
 * space-owner cure's dispatch-L1 additive validation layer (ledger rows
 * 2446/2447). No DOM, no store, no Vue reactivity: `px`/`measured`/
 * `FeasibleLayout.validate`/`resolveSovereignOverrides` are all pure
 * functions over plain values.
 *
 * Coverage, per the dispatch brief's item 4: `measured()`'s refusals,
 * `validate()`'s starved+hoarding pair from ONE call, presence-as-zero
 * semantics (an absent region omitted from `demands` produces no
 * starvation diagnostic even at a genuinely zero candidate), the
 * sovereign-override exemption + its diagnostic (overridden region
 * unchecked; casualties named; message shape), and `px()`'s refusals.
 * `measuredFromLytProgram` (the adapter) is exercised separately in
 * `tests/unit/state/feasible-layout-geometry-sweep.test.ts`, alongside
 * the report-only CI gate it feeds.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  px,
  measured,
  FeasibleLayout,
  resolveSovereignOverrides,
  type Measured,
  type RegionAllotment,
  type SovereignOverride,
} from '../../../src/state/feasible-layout';

describe('px()', () => {
  it('mints a Px for a finite, non-negative number', () => {
    expect(px(0)).toBe(0);
    expect(px(139)).toBe(139);
    expect(px(0.5)).toBe(0.5);
  });

  it('refuses a negative number', () => {
    expect(() => px(-1)).toThrow(/not a finite, non-negative pixel measure/);
  });

  it('refuses NaN', () => {
    expect(() => px(NaN)).toThrow(/not a finite, non-negative pixel measure/);
  });

  it('refuses Infinity', () => {
    expect(() => px(Infinity)).toThrow(/not a finite, non-negative pixel measure/);
    expect(() => px(-Infinity)).toThrow(/not a finite, non-negative pixel measure/);
  });
});

describe('measured()', () => {
  it('constructs a well-formed triple', () => {
    const m = measured({ region: 'tree', axis: 'h', min: px(110), preferred: px(110), maxUseful: null });
    expect(m).toEqual({ region: 'tree', axis: 'h', min: 110, preferred: 110, maxUseful: null });
  });

  it('accepts a bounded triple where min < preferred < maxUseful', () => {
    const m = measured({ region: 'eval', axis: 'h', min: px(100), preferred: px(139), maxUseful: px(200) });
    expect(m.min).toBe(100);
    expect(m.preferred).toBe(139);
    expect(m.maxUseful).toBe(200);
  });

  it('refuses min exceeding preferred, naming both offending numbers', () => {
    expect(() =>
      measured({ region: 'engineEval', axis: 'h', min: px(534), preferred: px(139), maxUseful: null }),
    ).toThrow(/min \(534\) exceeds preferred \(139\)/);
  });

  it('refuses preferred exceeding maxUseful, naming both offending numbers', () => {
    expect(() =>
      measured({ region: 'engineEval', axis: 'h', min: px(50), preferred: px(534), maxUseful: px(139) }),
    ).toThrow(/preferred \(534\) exceeds maxUseful \(139\)/);
  });

  it('allows min === preferred === maxUseful (a fixed-track region)', () => {
    const m = measured({ region: 'controlPanel', axis: 'h', min: px(664), preferred: px(664), maxUseful: px(664) });
    expect(m.min).toBe(m.preferred);
    expect(m.preferred).toBe(m.maxUseful);
  });
});

function allotmentMap<R extends string>(entries: readonly RegionAllotment<R>[]): ReadonlyMap<R, RegionAllotment<R>> {
  return new Map(entries.map((e) => [e.region, e]));
}

describe('FeasibleLayout.validate()', () => {
  it('returns a constructed FeasibleLayout when every region sits within its own bounds', () => {
    const demands: Measured<'tree' | 'controlPanel'>[] = [
      measured({ region: 'tree', axis: 'h', min: px(110), preferred: px(110), maxUseful: null }),
      measured({ region: 'controlPanel', axis: 'h', min: px(664), preferred: px(664), maxUseful: px(664) }),
    ];
    const candidate = allotmentMap<'tree' | 'controlPanel'>([
      { region: 'tree', axis: 'h', px: px(150) },
      { region: 'controlPanel', axis: 'h', px: px(664) },
    ]);
    const result = FeasibleLayout.validate(demands, candidate, 'landscape', { widthPx: px(1920), heightPx: px(1080) });
    expect('refused' in result).toBe(false);
    if (!('refused' in result)) {
      expect(result.allotments.get('tree')?.px).toBe(150);
      expect(result.screenClassId).toBe('landscape');
    }
  });

  it('produces a starved+hoarding pair from ONE call — the review\'s own canonical instance', () => {
    // The review's flagship 1920x1080 finding: the tree panel hoards 613px
    // of its own 60px content while the control panel starves at 0.
    const demands: Measured<'tree' | 'controlPanel'>[] = [
      measured({ region: 'tree', axis: 'h', min: px(60), preferred: px(60), maxUseful: px(60) }),
      measured({ region: 'controlPanel', axis: 'h', min: px(664), preferred: px(664), maxUseful: px(664) }),
    ];
    const candidate = allotmentMap<'tree' | 'controlPanel'>([
      { region: 'tree', axis: 'h', px: px(613) },
      { region: 'controlPanel', axis: 'h', px: px(0) },
    ]);
    const result = FeasibleLayout.validate(demands, candidate, 'landscape', { widthPx: px(1920), heightPx: px(1080) });
    expect('refused' in result).toBe(true);
    if ('refused' in result) {
      expect(result.refused).toHaveLength(2);
      const byRegion = new Map(result.refused.map((d) => [d.region, d]));
      expect(byRegion.get('tree')).toMatchObject({ kind: 'hoarding', demandPx: 60, grantedPx: 613 });
      expect(byRegion.get('controlPanel')).toMatchObject({ kind: 'starved', demandPx: 664, grantedPx: 0 });
    }
  });

  it('skips a region present in demands but absent from candidate — "not modeled this class," not a diagnostic', () => {
    const demands: Measured<'controlPanel'>[] = [
      measured({ region: 'controlPanel', axis: 'h', min: px(664), preferred: px(664), maxUseful: px(664) }),
    ];
    const candidate = allotmentMap<'controlPanel'>([]); // no candidate at all for this region this class
    const result = FeasibleLayout.validate(demands, candidate, 'portrait', { widthPx: px(1080), heightPx: px(1920) });
    expect('refused' in result).toBe(false);
  });

  it('presence-as-zero: an absent region omitted from demands produces no starvation, even though its own real candidate is 0px', () => {
    // RegionPresence.absent (§1.3): the CALLER omits the region's Measured
    // entry from `demands` for this pass — a demoted boardRail (0px,
    // presenceDefaultVisible: false) must not be indistinguishable from a
    // genuine zero-width bug.
    const boardRailMeasured = measured({ region: 'boardRail', axis: 'h', min: px(168), preferred: px(168), maxUseful: px(168) });
    const demandsWithBoardRailOmitted: Measured<'boardRail' | 'tree'>[] = [
      measured({ region: 'tree', axis: 'h', min: px(110), preferred: px(110), maxUseful: null }),
      // boardRailMeasured deliberately NOT included — it resolved absent.
    ];
    const candidate = allotmentMap<'boardRail' | 'tree'>([
      { region: 'boardRail', axis: 'h', px: px(0) }, // the literal collapsed-track candidate, still 0
      { region: 'tree', axis: 'h', px: px(300) },
    ]);
    const result = FeasibleLayout.validate(demandsWithBoardRailOmitted, candidate, 'landscape', {
      widthPx: px(1920),
      heightPx: px(1080),
    });
    expect('refused' in result).toBe(false);
    // Sanity: had boardRailMeasured been included, THIS SAME candidate would starve it —
    // proving the omission, not the candidate value, is what suppresses the diagnostic.
    const resultIfIncluded = FeasibleLayout.validate(
      [...demandsWithBoardRailOmitted, boardRailMeasured],
      candidate,
      'landscape',
      { widthPx: px(1920), heightPx: px(1080) },
    );
    expect('refused' in resultIfIncluded).toBe(true);
  });

  it('flags a starvation with an axis mismatch treated as "not modeled," not silently matched cross-axis', () => {
    const demands: Measured<'A_app'>[] = [
      measured({ region: 'A_app', axis: 'h', min: px(616), preferred: px(616), maxUseful: null }),
    ];
    // Candidate happens to carry the SAME region key on the OTHER axis —
    // validate() must not treat this as satisfying the h-axis demand.
    const candidate = allotmentMap<'A_app'>([{ region: 'A_app', axis: 'v', px: px(56) }]);
    const result = FeasibleLayout.validate(demands, candidate, 'portrait', { widthPx: px(420), heightPx: px(880) });
    expect('refused' in result).toBe(false); // skipped as "not modeled this axis," not flagged
  });
});

describe('resolveSovereignOverrides()', () => {
  const demands: Measured<'tree' | 'controlPanel'>[] = [
    measured({ region: 'tree', axis: 'h', min: px(110), preferred: px(110), maxUseful: null }),
    measured({ region: 'controlPanel', axis: 'h', min: px(664), preferred: px(664), maxUseful: px(664) }),
  ];
  const solved = allotmentMap<'tree' | 'controlPanel'>([
    { region: 'tree', axis: 'h', px: px(300) },
    { region: 'controlPanel', axis: 'h', px: px(664) },
  ]);

  it('exempts the overridden region from its own min/maxUseful bounds', () => {
    // A drag that pulls the tree panel to 1200px — far past any sane
    // "maxUseful" a future step might populate, but sovereignty means the
    // tree's own floor/ceiling no longer bind it at all.
    const overrides: SovereignOverride<'tree' | 'controlPanel'>[] = [
      { region: 'tree', axis: 'h', px: px(1200), source: 'user-drag' },
    ];
    const { candidate, diagnostics } = resolveSovereignOverrides(demands, solved, overrides, 'landscape', {
      widthPx: px(1920),
      heightPx: px(1080),
    });
    expect(candidate.get('tree')?.px).toBe(1200);
    // controlPanel (664 == 664, exactly its own fixed bound) is untouched
    // and satisfied — no casualty at this override size.
    expect(diagnostics).toHaveLength(0);
  });

  it('produces a named, located diagnostic when the override starves ANOTHER region — never a silent clamp, never a silent drop', () => {
    // A drag that leaves controlPanel's own candidate BELOW its 664px min
    // (simulating "the tree's own drag ate into the panel's fixed track").
    const solvedWithSqueezedPanel = allotmentMap<'tree' | 'controlPanel'>([
      { region: 'tree', axis: 'h', px: px(300) },
      { region: 'controlPanel', axis: 'h', px: px(400) }, // already below its own 664 min
    ]);
    const overrides: SovereignOverride<'tree' | 'controlPanel'>[] = [
      { region: 'tree', axis: 'h', px: px(1600), source: 'user-drag' },
    ];
    const { candidate, diagnostics } = resolveSovereignOverrides(
      demands,
      solvedWithSqueezedPanel,
      overrides,
      'landscape',
      { widthPx: px(1920), heightPx: px(1080) },
    );
    expect(candidate.get('tree')?.px).toBe(1600); // the override itself, verbatim — never resisted
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic.location).toBe('tree'); // the region the user actually dragged
    expect(diagnostic.starved).toHaveLength(1);
    expect(diagnostic.starved[0]).toMatchObject({ kind: 'starved', region: 'controlPanel', demandPx: 664, grantedPx: 400 });
    expect(diagnostic.message).toBe('Your geometry modification no longer permits controlPanel to render.');
    expect(diagnostic.remediation).toBe('reduce this region\'s width, or use Default Layout to reset');
    expect(diagnostic.nextAction).toBe('open-default-layout-control');
  });

  it('never checks the overridden region against its own bounds even when the override itself is starved/hoarding-shaped', () => {
    // A drag to 0px — would be "starved" against tree's own min(110) if
    // checked; sovereignty means it is never checked at all.
    const overrides: SovereignOverride<'tree' | 'controlPanel'>[] = [
      { region: 'tree', axis: 'h', px: px(0), source: 'user-drag' },
    ];
    const { diagnostics } = resolveSovereignOverrides(demands, solved, overrides, 'landscape', {
      widthPx: px(1920),
      heightPx: px(1080),
    });
    // controlPanel is untouched by this override and still satisfied — the
    // only way a diagnostic could appear is if `tree` were (wrongly)
    // checked against its own demand, which it must not be.
    expect(diagnostics).toHaveLength(0);
  });

  it('produces an empty diagnostics array (never omits the field) when nothing starves', () => {
    const overrides: SovereignOverride<'tree' | 'controlPanel'>[] = [
      { region: 'tree', axis: 'h', px: px(400), source: 'user-drag' },
    ];
    const { diagnostics } = resolveSovereignOverrides(demands, solved, overrides, 'landscape', {
      widthPx: px(1920),
      heightPx: px(1080),
    });
    expect(diagnostics).toEqual([]);
  });
});
