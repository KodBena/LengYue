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
  resolveSideColumnLiveLayout,
  type Measured,
  type RegionAllotment,
  type SovereignOverride,
  type SideColumnFixedRegion,
  type SideColumnLiveLayoutInput,
  type Px,
} from '../../../src/state/feasible-layout';
import type { LytDemotion, LytTrackShape } from '../../../src/state/lyt-layout-types';

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

/**
 * resolveSideColumnLiveLayout() — direct unit coverage, dispatch L3
 * REPAIR (`.claude/dispatch-reports/lyt-space-owner-l3-review.md`
 * §1/§Verdict, conditions 1/2). The review's own six named uncovered
 * branches: both ADR-0002 throw guards, the wrapperWidthPx-not-yet-
 * measured pass-through, the unbounded (`maxUsefulPx: null`) widen path,
 * the demote-boundary's exact `>=` inclusivity, and the previewBoard-
 * present reservation arithmetic. Every worked number below is either
 * recovered VERBATIM from the deleted `layout-model.test.ts` suite (git
 * history at `c9a9f1aa`, the L3 commit's own parent) where the old
 * mechanism's arithmetic still applies to the new one, or derived fresh
 * from `resolveSideColumnLiveLayout`'s own documented contract where the
 * mechanism genuinely changed (each such adaptation is named inline,
 * per the review's own "adapt honestly where semantics legitimately
 * changed, naming each adaptation" instruction) — never re-derived from
 * this function's own implementation as a tautology.
 *
 * `GAP_PX = 4` throughout, matching `layout-model.ts`'s own
 * `TREE_CONTROL_WRAPPER_ROW_GAP_PX` the deleted suite's fixtures used.
 */
describe('resolveSideColumnLiveLayout()', () => {
  const GAP_PX = 4;
  const LANDSCAPE_TREE_TRACK: LytTrackShape = { kind: 'elastic', minPx: 110, frWeight: 1 };
  const PORTRAIT_TREE_TRACK: LytTrackShape = { kind: 'elastic', minPx: 140, frWeight: 1 };
  const CONTROL_PANEL_TRACK: LytTrackShape = { kind: 'fixed', px: 664 };
  const PREVIEW_BOARD_TRACK: LytTrackShape = { kind: 'fixed', px: 160 };
  const CONTROL_PANEL_DEMOTE: LytDemotion = { axis: 'h', belowPx: 778 };

  function baseInput(overrides: Partial<SideColumnLiveLayoutInput> = {}): SideColumnLiveLayoutInput {
    return {
      wrapperWidthPx: 1000,
      gapPx: GAP_PX,
      tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: null },
      treeSovereignPx: undefined,
      treeDefaultPx: 0,
      others: [],
      screenClassId: 'landscape',
      ...overrides,
    };
  }

  // ── Branch 1/2: the two ADR-0002 throw guards ─────────────────────
  describe('ADR-0002 throw guards', () => {
    it('a non-"elastic" tree track throws loudly, naming the offending kind — mirrors the deleted clampTreeWidthForSideColumn\'s own guard, adapted to this function\'s own message shape', () => {
      const wrongShape: LytTrackShape = { kind: 'fixed', px: 140 };
      expect(() =>
        resolveSideColumnLiveLayout(baseInput({ tree: { track: wrongShape, maxUsefulPx: null } })),
      ).toThrow(/tree's own compiled track is "fixed"/);
    });

    it('a demote axis other than "h" on an `others` entry throws loudly — the SAME guard the deleted resolveWidthConditionalPresence carried, now folded into this function\'s own presence loop', () => {
      const verticalDemote: LytDemotion = { axis: 'v', belowPx: 500 };
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: verticalDemote },
      ];
      expect(() =>
        resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 900, others })),
      ).toThrow(/unsupported demote axis/);
    });
  });

  // ── Branch 3: the "not yet measured" pass-through ──────────────────
  describe('wrapperWidthPx not-yet-measured pass-through (<=0 or non-finite)', () => {
    it('tree passes through treeDefaultPx verbatim when un-sovereign, at each of 0/-10/NaN — the SAME "not yet measured" convention every deleted clamp function shared', () => {
      for (const notYetMeasured of [0, -10, NaN]) {
        const result = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx: notYetMeasured, treeDefaultPx: 230, treeSovereignPx: undefined }),
        );
        expect(result.treePx).toBe(230);
        expect(result.diagnostics).toEqual([]);
      }
    });

    it('a sovereign treeSovereignPx wins over treeDefaultPx even before the wrapper is measured — a genuinely NEW branch this function carries (sovereignty did not exist in the deleted mechanism, so this precedence is not a recovered old assertion, disclosed as such)', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 0, treeDefaultPx: 230, treeSovereignPx: 1200 }),
      );
      expect(result.treePx).toBe(1200);
    });

    it('every `others` entry passes through per its own desiredVisible — present grants its full compiled px, absent grants 0, no demote/reservation math runs at all', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: false, demote: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: -1, others }));
      const byId = new Map(result.others.map((o) => [o.widgetId, o]));
      expect(byId.get('controlPanel')).toMatchObject({ present: true, candidatePx: 664 });
      expect(byId.get('previewBoard')).toMatchObject({ present: false, candidatePx: 0 });
    });
  });

  // ── Branch 4: exact demote-boundary inclusivity ─────────────────────
  describe('demote-boundary inclusivity — >= wins, matching the compiled program\'s own >= semantics', () => {
    it('exactly AT the compiled 778px threshold: controlPanel resolves present, and tree\'s own candidate lands at exactly its compiled floor (110) — the SAME 778/110 pair the deleted clampTreeWidthForSideColumn pinned at its own "right at the compiled demote boundary" case', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 778, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel.present).toBe(true);
      expect(controlPanel.candidatePx).toBe(664);
      expect(result.treePx).toBe(110); // 778 - (664 + 4) = 110, exactly the tree's own compiled minPx
    });

    it('one px below (777): controlPanel demotes to absent, and tree\'s own un-reserved candidate claims the whole (unmeasured-against) row — 777, not 778', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 777, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel.present).toBe(false);
      expect(controlPanel.candidatePx).toBe(0);
      expect(result.treePx).toBe(777); // no reservation at all once controlPanel demotes
    });
  });

  // ── Branch 5: the unbounded (maxUsefulPx: null) widen path ──────────
  describe('unbounded widen path (maxUsefulPx: null) — the deleted wave-B1/N2 "widen into freed space" behavior, now driven by ceilingPx ?? Infinity', () => {
    it('portrait, both siblings absent, 420px wrapper: tree widens all the way to 420 — byte-identical to the deleted resolveTreeRowWidthPx\'s own "F4, un-dragged default" 420px figure', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 420, tree: { track: PORTRAIT_TREE_TRACK, maxUsefulPx: null }, others: [] }),
      );
      expect(result.treePx).toBe(420);
    });

    it('portrait, 768px wrapper: widens to 768 — the same suite\'s own "representative width" figure', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 768, tree: { track: PORTRAIT_TREE_TRACK, maxUsefulPx: null }, others: [] }),
      );
      expect(result.treePx).toBe(768);
    });

    it('landscape, both fixed siblings absent, 614px wrapper: widens to 614 — byte-identical to the deleted N2 landscape "widens all the way to the measured 614px side column" figure (the finding\'s own reported 1920x1080 measurement)', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: false, demote: CONTROL_PANEL_DEMOTE },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: false, demote: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 614, others }));
      expect(result.treePx).toBe(614);
    });
  });

  // ── Branch 6: previewBoard-present reservation arithmetic ───────────
  describe('previewBoard-present reservation arithmetic', () => {
    it('previewBoard present alone (controlPanel not desired), 614px wrapper: tree clamps to exactly 450 (614 - (160+4)) — byte-identical to the deleted N2 "previewBoard PRESENT" figure, and the row sums to exactly the wrapper width', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: false, demote: CONTROL_PANEL_DEMOTE },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, demote: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 614, others }));
      expect(result.treePx).toBe(450);
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 });
      expect(result.treePx + GAP_PX + previewBoard.candidatePx).toBe(614); // no overflow, no slack
    });

    it('previewBoard present RAISES the effective demote threshold past what a full 819px column can hold (778+164=942 > 819): controlPanel is forced absent even though it is DESIRED, and its own former 664px reservation is freed to the tree — 819/164/942/655, recovered from the deleted "generalized reservation... end-to-end composition at 2560x1440" scenario, whose own clampedTreeWidthPx (never asserted as a literal number there, only via the row-sum identity) is the same 655 derived here directly', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, demote: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 819, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      // controlPanel: 778 + previewBoard's own 164px reservation = 942,
      // which 819 does not clear — demoted absent despite desiredVisible: true.
      expect(controlPanel).toMatchObject({ present: false, candidatePx: 0 });
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 });
      // tree absorbs everything but previewBoard's own reservation: 819 - 164 = 655.
      expect(result.treePx).toBe(655);
      expect(result.treePx + GAP_PX + previewBoard.candidatePx).toBe(819); // exact, no overflow
    });
  });

  // ── Branch 7: dispatch L4 (`.claude/dispatch-reports/
  //    lyt-space-owner-spec.md` §3 step 4, ledger rows 2447/2484/2498) —
  //    the parked "no sibling to diagnose against" fork the L3 build
  //    report named as a STOP-and-report item (`.claude/dispatch-reports/
  //    lyt-space-owner-l3-build.md` §7 finding 2, §8): a sovereign `tree`
  //    that overflows the side column's own physical capacity now
  //    produces a 'starved' StarvationDiagnostic against the region name
  //    'side-column-capacity' — no new type, `StarvationDiagnostic.region`
  //    is already `string`. Named 'side-column-capacity', not 'wrapper',
  //    to avoid colliding with `useResizablePanel.ts`'s own pre-existing
  //    (L3-vintage) use of the literal 'wrapper' for a DIFFERENT region
  //    (the sovereign, rendered control pane itself — the drag target,
  //    not the row's own container capacity) — L4 review §2's "a
  //    coincidental prior-art wrinkle." ──
  describe('dispatch L4: side-column-capacity starvation (the parked "no sibling to diagnose against" fork)', () => {
    it('no sibling AT ALL (others: []) — the EXACT repro from the L3 build report\'s own §7 finding 2 (a landscape-dragged wide treePanelWidthPx replayed against a narrow wrapper)', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 480, others: [], treeSovereignPx: 820 }),
      );
      expect(result.treePx).toBe(820); // verbatim — sovereignty, never resisted
      expect(result.others).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.location).toBe('tree');
      expect(diagnostic.starved).toEqual([
        { kind: 'starved', region: 'side-column-capacity', axis: 'h', demandPx: 820, grantedPx: 480 },
      ]);
      expect(diagnostic.message).toBe('Your geometry modification no longer fits within the available space.');
      expect(diagnostic.remediation).toBe('reduce this region\'s width, or use Default Layout to reset');
      expect(diagnostic.nextAction).toBe('open-default-layout-control');
    });

    it('a sibling starvation AND a side-column-capacity overflow are BOTH real at once — merged into the SAME location:\'tree\' diagnostic\'s own starved array, never two competing diagnostics', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      // wrapperWidthPx=820 (the review's own 1920x1080 witness figure, per
      // the sovereignty describe block above); treeSovereignPx=1000 is a
      // drag that claims MORE than the entire wrapper — controlPanel's own
      // remainingPx-floored candidate is genuinely starved (0 < its own
      // 664 min) AND the row's own total claim genuinely overflows 820.
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 820, others, treeSovereignPx: 1000 }),
      );
      expect(result.treePx).toBe(1000);
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: 0 });

      expect(result.diagnostics).toHaveLength(1); // ONE diagnostic, not two
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.location).toBe('tree');
      expect(diagnostic.starved).toEqual([
        { kind: 'starved', region: 'controlPanel', axis: 'h', demandPx: 664, grantedPx: 0 },
        { kind: 'starved', region: 'side-column-capacity', axis: 'h', demandPx: 1004, grantedPx: 820 },
      ]);
      expect(diagnostic.message).toBe(
        'Your geometry modification no longer permits controlPanel to render, and no longer fits within the available space.',
      );
    });

    it('no side-column-capacity diagnostic when the sovereign claim genuinely fits, even with NO sibling to check against — no spurious noise', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 480, others: [], treeSovereignPx: 100 }),
      );
      expect(result.treePx).toBe(100);
      expect(result.diagnostics).toEqual([]);
    });
  });

  // ── Row 2501 repair (`.claude/dispatch-reports/lyt-cure-repair-
  //    build.md`, `.claude/dispatch-reports/lyt-cure-live-witness.md`
  //    FAILs 1/2): the live-witness rig's own repro — a live content
  //    demand 1px BELOW the compiled floor (109 vs. tree's own compiled
  //    110 minPx) self-contradicted at `measured()`'s own construction
  //    (`preferred (110) exceeds maxUseful (109)`), uncaught, crashing
  //    the reactive `computed` that reads this function in the real app —
  //    a silently-1px control panel at fresh boot (FAIL 1) and an inert
  //    interactive drag (FAIL 2). Both repro shapes below now resolve
  //    cleanly. ──────────────────────────────────────────────────────
  describe('row 2501: a live content demand below the compiled floor (the live-witness 109-vs-110 repro)', () => {
    it('non-sovereign (fresh boot, FAIL 1\'s own shape): tree caps at the live 109px demand itself — not artificially floored to 110 — and controlPanel is PRESENT, not demoted', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 1000, others, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: px(109) } }),
      );
      expect(result.treePx).toBe(109);
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: 664 });
      expect(result.diagnostics).toEqual([]);
    });

    it('sovereign (an interactive drag in progress, FAIL 2\'s own shape): the SAME 109-vs-110 gap no longer throws — the drag renders verbatim, controlPanel stays comfortably satisfied', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      const result = resolveSideColumnLiveLayout(
        baseInput({
          wrapperWidthPx: 1000,
          others,
          treeSovereignPx: 300,
          tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: px(109) },
        }),
      );
      expect(result.treePx).toBe(300); // the drag itself, verbatim — never resisted
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: 664 });
      expect(result.diagnostics).toEqual([]);
    });

    it('exactly AT the floor (maxUsefulPx === minPx) still behaves exactly as before — the floor only lowers when the live demand genuinely undercuts it', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 1000, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: px(110) } }),
      );
      expect(result.treePx).toBe(110);
    });
  });

  // ── Row 2501 defense in depth: a thrown measurement refusal degrades
  //    to compiled defaults rather than propagating out of this function
  //    (this repair's own item 1b — see `resolveSideColumnLiveLayout`'s
  //    own doc comment, "Defense in depth"). ─────────────────────────
  describe('row 2501 defense in depth: an artificially-thrown construction refusal degrades to compiled defaults, never propagates', () => {
    // Trigger: an `others` entry whose OWN compiled track is not `'fixed'`
    // — no real caller can produce this today (every real `others` entry
    // in the live app carries a genuinely fixed compiled track,
    // `controlPanel`/`previewBoard`), but `fixedTrackPx`'s own ADR-0002
    // guard throws loudly on it regardless of which branch reaches it
    // (both the non-sovereign reservation sum and the sovereign "others'
    // own candidates" loop call it unconditionally) — this simulates a
    // hypothetical FUTURE bug reaching this seam (a mis-declared track
    // kind), exactly the class of thing this defense-in-depth catch
    // exists for.
    const brokenTrack: LytTrackShape = { kind: 'elastic', minPx: 50, frWeight: 1 };
    const brokenOthers: readonly SideColumnFixedRegion[] = [
      { widgetId: 'controlPanel', track: brokenTrack, desiredVisible: true, demote: null },
    ];

    it('sovereign: falls back to the drag value verbatim plus a diagnostic naming the refusal', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 1000, others: brokenOthers, treeSovereignPx: 300, treeDefaultPx: 250 }),
      );
      // Fallback shape: sovereignty still wins verbatim for treePx (this
      // function's own "not yet measured" convention, reused for the
      // catch's own fallback) — never a crash, never a silent zero.
      expect(result.treePx).toBe(300);
      // The BROKEN entry itself degrades to 0/absent-shaped (the fallback
      // cannot honor a track it cannot read either — see this function's
      // own doc, "this fallback must never itself throw"); a well-formed
      // sibling would instead fall back to its own real compiled px (the
      // 109-vs-110 tests above cover that shape with a VALID `others` set).
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: 0 });
      expect(result.diagnostics).toHaveLength(1);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.location).toBe('tree');
      expect(diagnostic.starved).toEqual([]);
      expect(diagnostic.message).toMatch(/Layout could not be computed for the current content/);
      expect(diagnostic.remediation).toBe('reduce this region\'s width, or use Default Layout to reset');
      expect(diagnostic.nextAction).toBe('open-default-layout-control');
    });

    it('non-sovereign: falls back to treeDefaultPx (the compiled-defaults convention) plus the same diagnostic shape, never propagates', () => {
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 1000, others: brokenOthers, treeDefaultPx: 250, treeSovereignPx: undefined }),
      );
      expect(result.treePx).toBe(250);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].location).toBe('tree');
    });

    it('a well-formed `others` set (only the tree-side construction is broken) falls back with its OWN real compiled px, not degraded to 0', () => {
      // A DIFFERENT trigger from the shared `brokenOthers` above: `others`
      // is entirely valid here; the throw is forced via a `Px` value that
      // bypasses `px()`'s own non-negative guard (no real caller can
      // produce this — every real `Px` is minted through `px()`), reaching
      // the sovereign branch's own `measured()` construction instead.
      const brokenMaxUsefulPx = -5 as unknown as Px;
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, demote: CONTROL_PANEL_DEMOTE },
      ];
      const result = resolveSideColumnLiveLayout(
        baseInput({
          wrapperWidthPx: 1000,
          others,
          treeSovereignPx: 300,
          tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: brokenMaxUsefulPx },
        }),
      );
      expect(result.treePx).toBe(300);
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: 664 });
      expect(result.diagnostics).toHaveLength(1);
    });
  });
});
