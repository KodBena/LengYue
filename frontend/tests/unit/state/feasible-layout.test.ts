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
  resolveRootSplitLiveLayout,
  MeasurementRefusalError,
  type Measured,
  type RegionAllotment,
  type SovereignOverride,
  type SideColumnFixedRegion,
  type SideColumnLiveLayoutInput,
  type Px,
} from '../../../src/state/feasible-layout';
import { CONTROL_PANEL_MIN_WIDTH_PX } from '../../../src/state/layout-model';
import type { LytTrackShape } from '../../../src/state/lyt-layout-types';

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
  // Ledger row 2532 (region-owned presence): replaces the retired
  // container-composite `CONTROL_PANEL_DEMOTE` (778px — `tree.min + gap +
  // controlPanel.min`) with the panel's own minimum renderable demand,
  // the REAL `CONTROL_PANEL_MIN_WIDTH_PX` constant (not re-derived here —
  // importing it keeps this suite from drifting against the production
  // constant the way the old hand-typed 778 literal never could drift
  // detectably from the compiled composite it mirrored).
  const CONTROL_PANEL_VIABILITY_FLOOR_PX = CONTROL_PANEL_MIN_WIDTH_PX;

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

    // REMOVED (ledger row 2532, region-owned presence): this test pinned
    // the retired `demote.axis !== 'h'` ADR-0002 guard — `SideColumnFixedRegion`
    // no longer carries an `axis` field at all (`viabilityFloorPx` is a
    // bare `number | null`, the region's own minimum renderable demand,
    // with no axis of its own to validate against). There is no
    // replacement guard: a caller cannot construct an off-axis
    // `viabilityFloorPx` the way the old `LytDemotion` shape allowed, so
    // the class of caller-contract violation this guard existed to catch
    // is now unrepresentable in the type, not merely unchecked at
    // runtime — the stronger of the two outcomes ADR-0002 prefers
    // (a refusal that cannot fire beats one that reliably does).
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
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: false, viabilityFloorPx: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: -1, others }));
      const byId = new Map(result.others.map((o) => [o.widgetId, o]));
      expect(byId.get('controlPanel')).toMatchObject({ present: true, candidatePx: 664 });
      expect(byId.get('previewBoard')).toMatchObject({ present: false, candidatePx: 0 });
    });
  });

  // ── Branch 4: exact demote-boundary inclusivity ─────────────────────
  // MIGRATED per ledger row 2532 (region-owned presence). The compiled
  // 778px threshold (`tree.min 110 + gap 4 + controlPanel.min 664`) was
  // the CONTAINER-composite the RCA diagnosed as the root cause — its
  // panel-floor term (664) was the panel's own compiled FIXED TRACK, not
  // its viability floor. The region-owned threshold uses the SAME tree
  // floor and gap but the panel's own SMALLER minimum renderable demand
  // (`CONTROL_PANEL_VIABILITY_FLOOR_PX`, 300px landscape):
  // `110 + 4 + 300 = 414`. Below it, `tree` is pinned at its own compiled
  // floor (110, non-sovereign — it cannot shrink further without a live
  // content-demand reading, absent in this fixture) and controlPanel's
  // own remaining share falls under its floor; at or above it, the panel
  // fits. The boundary itself moved (414, not 778) — a real behavioral
  // change (the panel now docks at a much narrower container, mandate
  // item 1's own S1-adjacent goal), not a cosmetic rename.
  describe('viability-floor-boundary inclusivity — >= wins, matching the region-owned floor\'s own >= semantics', () => {
    it('exactly AT the region-owned 414px threshold: controlPanel resolves present at exactly its own floor (300), tree at its own compiled floor (110)', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
      ];
      const threshold = 110 + 4 + CONTROL_PANEL_VIABILITY_FLOOR_PX; // 414
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: threshold, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel.present).toBe(true);
      expect(controlPanel.candidatePx).toBe(CONTROL_PANEL_VIABILITY_FLOOR_PX); // 300, not its full 664 — the row-owned floor, not the compiled fixed track
      expect(result.treePx).toBe(110);
    });

    it('one px below the region-owned threshold (413): controlPanel demotes to absent, and tree\'s own un-reserved candidate claims the whole row — 413, not 414', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
      ];
      const threshold = 110 + 4 + CONTROL_PANEL_VIABILITY_FLOOR_PX; // 414
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: threshold - 1, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      expect(controlPanel.present).toBe(false);
      expect(controlPanel.candidatePx).toBe(0);
      expect(result.treePx).toBe(threshold - 1); // no reservation at all once controlPanel demotes
      // The presence-derived diagnostic (ledger row 2532 Remedy 3) now
      // fires for this NON-sovereign demotion too — closing the RCA's own
      // §4 "outer path emits no diagnostic at all" bug, where the old
      // mechanism (sovereign-only diagnosing) left a genuine, desired-but-
      // absent panel completely silent.
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        location: 'controlPanel',
        starved: [{ kind: 'starved', region: 'controlPanel', axis: 'h', demandPx: CONTROL_PANEL_VIABILITY_FLOOR_PX, grantedPx: threshold - 1 - 110 - 4 }],
        message: 'Your geometry modification no longer permits controlPanel to render.',
      });
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
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: false, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: false, viabilityFloorPx: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 614, others }));
      expect(result.treePx).toBe(614);
    });
  });

  // ── Branch 6: previewBoard-present reservation arithmetic ───────────
  describe('previewBoard-present reservation arithmetic', () => {
    it('previewBoard present alone (controlPanel not desired), 614px wrapper: tree clamps to exactly 450 (614 - (160+4)) — byte-identical to the deleted N2 "previewBoard PRESENT" figure, and the row sums to exactly the wrapper width', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: false, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, viabilityFloorPx: null },
      ];
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 614, others }));
      expect(result.treePx).toBe(450);
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 });
      expect(result.treePx + GAP_PX + previewBoard.candidatePx).toBe(614); // no overflow, no slack
    });

    // MIGRATED per ledger row 2532 (region-owned presence). The old
    // 819px repro relied on the RETIRED container-composite threshold
    // (778 + previewBoard's own 164px reservation = 942 > 819). Under
    // the region-owned floor, the combined threshold is smaller —
    // `tree.min (110) + gap (4) + previewBoard's reservation (164) +
    // controlPanel's own floor (300) = 578` — so 819 comfortably clears
    // it (controlPanel resolves PRESENT there now, at 541px, well above
    // its floor: not a case this describe block can use to demonstrate a
    // genuine demotion any more). The SAME shape (previewBoard's own
    // reservation raising what controlPanel needs to stay viable) is
    // reproduced at the NEW, smaller threshold instead — 577, one px
    // below 578, still demotes; 578 itself docks.
    it('previewBoard present RAISES the region-owned viability threshold controlPanel needs to stay docked: 578 = tree.min(110) + gap(4) + previewBoard reservation(164) + controlPanel floor(300) — one px below still demotes, despite desiredVisible: true', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, viabilityFloorPx: null },
      ];
      const threshold = 110 + GAP_PX + 164 + CONTROL_PANEL_VIABILITY_FLOOR_PX; // 578
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: threshold - 1, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      expect(controlPanel).toMatchObject({ present: false, candidatePx: 0 });
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 }); // previewBoard's own reservation is unconditional — never shrunk
      // tree absorbs everything but previewBoard's own reservation once controlPanel demotes.
      expect(result.treePx).toBe(threshold - 1 - 164);
      expect(result.treePx + GAP_PX + previewBoard.candidatePx).toBe(threshold - 1); // exact, no overflow
    });

    it('exactly AT the 578px threshold: controlPanel docks at its own floor (300), previewBoard keeps its full reservation, the row closes exactly', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, viabilityFloorPx: null },
      ];
      const threshold = 110 + GAP_PX + 164 + CONTROL_PANEL_VIABILITY_FLOOR_PX; // 578
      const result = resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: threshold, others }));
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      expect(controlPanel).toMatchObject({ present: true, candidatePx: CONTROL_PANEL_VIABILITY_FLOOR_PX });
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 });
      expect(result.treePx).toBe(110);
      expect(result.treePx + GAP_PX + controlPanel.candidatePx + GAP_PX + previewBoard.candidatePx).toBe(threshold);
    });
  });

  // Disease repair (`.claude/dispatch-reports/lyt-second-opus-review.md`
  // N3, ledger row 2511): the presence-toggle leak. The review measured
  // eight on/off cycles of "Preview Board" walking the tree panel
  // 486→339→...→123px, ~31px per cycle, never recovering short of a
  // reload. Root cause (traced in `src/components/tree/TreeWidget.vue`'s
  // own repair comment): `tree.maxUsefulPx` used to be measured from
  // `outerRef.scrollWidth`, which degenerates to the BOX's own rendered
  // width whenever the tree's real content is narrower than its box (the
  // ordinary case) — feeding a presence-toggle-narrowed box's width back
  // in as the tree's own "content demand" on the NEXT resolve, capping it
  // there even once the toggle reverses and room frees back up. This
  // function itself (`resolveSideColumnLiveLayout`) was always a PURE
  // function of its inputs — the leak lived entirely in what the CALLER
  // fed it as `tree.maxUsefulPx`. This suite pins the caller-facing
  // contract the fix relies on: GIVEN a content demand that is genuinely
  // STABLE across a presence toggle (which `svgWidth` — a pure function
  // of the game tree's own shape — now guarantees, never the box it's
  // rendered into), the round-trip is an exact identity, for as many
  // cycles as the review's own repro ran.
  describe('presence-toggle idempotence (N3 repair): a stable tree.maxUsefulPx makes a desiredVisible round-trip an exact identity', () => {
    const previewBoardOn: SideColumnFixedRegion = {
      widgetId: 'previewBoard',
      track: PREVIEW_BOARD_TRACK,
      desiredVisible: true,
      viabilityFloorPx: null,
    };
    const previewBoardOff: SideColumnFixedRegion = { ...previewBoardOn, desiredVisible: false };
    // A STABLE content demand — the fixed's whole point: this value never
    // changes across the loop below, exactly what `svgWidth` (tree-
    // structure-derived, container-independent) now guarantees in
    // production, where the pre-repair `scrollWidth` reading did not.
    const STABLE_TREE_MAX_USEFUL_PX = px(60);

    it('eight on/off cycles at 1920x1080-equivalent geometry (the review\'s own reproduction count) return the tree panel to its EXACT starting width every single time — no drift, no reload needed', () => {
      const wrapperWidthPx = 820; // the docked 1920x1080 side-column width the review's own evidence cites
      const baselineResult = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: STABLE_TREE_MAX_USEFUL_PX }, others: [previewBoardOff] }),
      );
      const startingTreePx = baselineResult.treePx;

      for (let cycle = 0; cycle < 8; cycle++) {
        const onResult = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: STABLE_TREE_MAX_USEFUL_PX }, others: [previewBoardOn] }),
        );
        // Toggling ON legitimately reserves previewBoard's own fixed
        // demand — the tree's candidate MAY shrink here; that is honest
        // reservation, not the leak.
        expect(onResult.treePx).toBeLessThanOrEqual(startingTreePx);

        const offResult = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: STABLE_TREE_MAX_USEFUL_PX }, others: [previewBoardOff] }),
        );
        // Toggling back OFF must be an IDENTITY on the tree's own
        // candidate — this is the assertion the pre-repair code failed:
        // each cycle it walked ~31px further from startingTreePx instead
        // of landing back on it exactly.
        expect(offResult.treePx).toBe(startingTreePx);
      }
    });

    it('the UNBOUNDED widen path (maxUsefulPx: null — "widen into freed space") also recovers exactly: ON genuinely shrinks the tree (real reservation), OFF returns to the SAME starting value every cycle, not a drifting approximation', () => {
      const wrapperWidthPx = 1400;
      const baselineResult = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: null }, others: [previewBoardOff] }),
      );
      const startingTreePx = baselineResult.treePx; // widens to fill the whole wrapper: 1400
      expect(startingTreePx).toBe(1400);

      for (let cycle = 0; cycle < 8; cycle++) {
        const onResult = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: null }, others: [previewBoardOn] }),
        );
        // ON genuinely reserves previewBoard's own fixed demand (164px) —
        // a REAL, honest shrink, not the leak.
        expect(onResult.treePx).toBe(startingTreePx - 4 - 160);

        const offResult = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: null }, others: [previewBoardOff] }),
        );
        // OFF must widen straight back to the SAME 1400 every cycle —
        // the pre-repair leak instead walked this value down by ~31px
        // per cycle because the freed width never fully returned.
        expect(offResult.treePx).toBe(startingTreePx);
      }
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

    // MIGRATED per ledger row 2532. The old "sibling starvation AND
    // capacity overflow both real at once" scenario is UNREPRESENTABLE
    // now: a floor-bearing sibling (`controlPanel`) can no longer be
    // "starved while present" at all — under the region-owned model,
    // presence itself IS the floor check (§ presence-derived diagnostics
    // above), so a sibling that stays present, by construction, never
    // fell below its own floor. What survives from the old scenario is
    // the OTHER half: a NON-floor-bearing sibling (`previewBoard`, whose
    // reservation is unconditional and never shrinks) can still push the
    // row's own TOTAL claim past `wrapperWidthPx` even once `controlPanel`
    // is safely floored — this is now the ONLY way a sovereign drag with
    // desired siblings present produces a diagnostic, and it is the
    // side-column-capacity diagnostic alone (never merged with a sibling
    // starvation, because none is possible).
    it('a side-column-capacity overflow survives even once the floor guarantee protects every floor-bearing sibling — previewBoard\'s own unconditional reservation is what overflows the row now, not a sibling starvation', () => {
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        { widgetId: 'previewBoard', track: PREVIEW_BOARD_TRACK, desiredVisible: true, viabilityFloorPx: null },
      ];
      // wrapperWidthPx=820 (the review's own 1920x1080 witness figure);
      // treeSovereignPx=1000 is a drag that claims more than the wrapper
      // can afford even after the floor-reservation cap (304px for
      // controlPanel's own floor+gap) brings tree down to 516.
      const result = resolveSideColumnLiveLayout(
        baseInput({ wrapperWidthPx: 820, others, treeSovereignPx: 1000 }),
      );
      const floorReservationPx = CONTROL_PANEL_VIABILITY_FLOOR_PX + GAP_PX; // 304
      expect(result.treePx).toBe(820 - floorReservationPx); // 516 — capped, never the raw 1000
      const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
      const previewBoard = result.others.find((o) => o.widgetId === 'previewBoard')!;
      // controlPanel is FLOORED, not starved — present at exactly its own
      // minimum, never demoted (the ruled demotion remedy).
      expect(controlPanel).toMatchObject({ present: true, candidatePx: CONTROL_PANEL_VIABILITY_FLOOR_PX });
      // previewBoard keeps its own full, unconditional reservation.
      expect(previewBoard).toMatchObject({ present: true, candidatePx: 160 });

      // Row's own total claim: 516 + 4 + 300 + 4 + 160 = 984, past the
      // 820px wrapper — a genuine overflow, ONLY diagnosable via the
      // side-column-capacity mechanism (dispatch L4), since neither
      // sibling itself is starved.
      const totalRowClaimPx = result.treePx + GAP_PX + controlPanel.candidatePx + GAP_PX + previewBoard.candidatePx;
      expect(totalRowClaimPx).toBe(984);
      expect(result.diagnostics).toHaveLength(1);
      const [diagnostic] = result.diagnostics;
      expect(diagnostic.location).toBe('tree');
      expect(diagnostic.starved).toEqual([
        { kind: 'starved', region: 'side-column-capacity', axis: 'h', demandPx: 984, grantedPx: 820 },
      ]);
      expect(diagnostic.message).toBe('Your geometry modification no longer fits within the available space.');
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
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
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
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
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

    // ── Review obligation 2 (`.claude/dispatch-reports/
    //    lyt-cure-repair-review.md`): a live demand of exactly 0 (a
    //    genuinely empty tree) is deliberately NOT treated as "live
    //    truth" the ordinary below-the-floor rule above is — per spec
    //    §1.3's own RegionPresence doctrine, a PRESENT region is always
    //    checked against a genuine, usable `min`; only an ABSENT region
    //    is entitled to 0px. `resolveEffectiveDemand` (`feasible-
    //    layout.ts`) pins BOTH the floor and the ceiling to the compiled
    //    minimum when the live demand is `<= 0`, so an empty-but-present
    //    tree renders at its compiled floor, never at literal 0px. ─────
    describe('demand of 0 (review obligation 2): a present-but-genuinely-empty tree renders at its compiled floor, never at 0px', () => {
      it('non-sovereign: tree renders at the compiled floor (110), not 0 — controlPanel stays PRESENT with its full 664px', () => {
        const others: readonly SideColumnFixedRegion[] = [
          { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        ];
        const result = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx: 1000, others, tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: px(0) } }),
        );
        expect(result.treePx).toBe(110); // the compiled floor — NOT 0
        const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
        expect(controlPanel).toMatchObject({ present: true, candidatePx: 664 });
        expect(result.diagnostics).toEqual([]);
      });

      it('sovereign: an in-progress drag still renders verbatim (sovereignty is unaffected by this rule — it exempts tree from its own floor/ceiling entirely)', () => {
        const others: readonly SideColumnFixedRegion[] = [
          { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: CONTROL_PANEL_VIABILITY_FLOOR_PX },
        ];
        const result = resolveSideColumnLiveLayout(
          baseInput({
            wrapperWidthPx: 1000,
            others,
            treeSovereignPx: 5, // the user's own drag choice, far below the compiled floor
            tree: { track: LANDSCAPE_TREE_TRACK, maxUsefulPx: px(0) },
          }),
        );
        expect(result.treePx).toBe(5); // the drag itself, verbatim — sovereignty is untouched by this rule
        // No diagnostic: the tree demand used for the OTHER-region check is
        // pinned at the compiled floor (110/110), which controlPanel's own
        // 664px reservation comfortably fits alongside (1000 - 5 - 4 = 991
        // >= 664) — the demand-of-0 rule changes what `tree`'s own demand
        // triple IS, not whether sovereignty itself still holds.
        expect(result.diagnostics).toEqual([]);
      });
    });
  });

  // ── Row 2501 defense in depth, NARROWED per the review's own obligation
  //    1 (`.claude/dispatch-reports/lyt-cure-repair-review.md`): the
  //    resolver's catch degrades ONLY a genuine `MeasurementRefusalError`
  //    (a `px()`/`measured()` construction-time self-contradiction) — any
  //    OTHER thrown error (a caller-contract/wiring bug, e.g. a broken
  //    `others` track) must PROPAGATE, never degrade silently into a
  //    "layout could not be computed for the current content" message
  //    that would misdescribe what actually went wrong. ────────────────
  describe('row 2501 defense in depth (narrowed, review obligation 1): only a genuine MeasurementRefusalError degrades; everything else propagates', () => {
    describe('an UNRELATED error (not a measurement refusal) PROPAGATES — the review\'s own adversarial probe, kept as a permanent regression test', () => {
      // The review's own EXACT probe: an `others` entry whose `track` is
      // `undefined` — a wiring/shape bug entirely unrelated to the
      // min/preferred/maxUseful invariant this repair is about. Pre-
      // narrowing, the blanket `catch (err)` absorbed this (surfacing
      // only by accident, via a SECOND uncaught error in the fallback's
      // own construction — see this module's own `resolveSideColumnLive
      // Layout` doc, "Defense in depth"). Post-narrowing, `fixedTrackPx`'s
      // own thrown `Error` (not a `MeasurementRefusalError`) must reach
      // the caller directly.
      const undefinedTrackOthers: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: undefined as unknown as LytTrackShape, desiredVisible: true, viabilityFloorPx: null },
      ];

      it('sovereign', () => {
        expect(() =>
          resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 1000, others: undefinedTrackOthers, treeSovereignPx: 300 })),
        ).toThrow(TypeError);
      });

      it('non-sovereign', () => {
        expect(() =>
          resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 1000, others: undefinedTrackOthers })),
        ).toThrow(TypeError);
      });
    });

    it('a DIFFERENT unrelated error (a well-formed object of the wrong track kind) ALSO propagates — not merely the undefined-shaped probe', () => {
      // A second, distinct unrelated-bug shape: `fixedTrackPx`'s own
      // ADR-0002 guard throws a plain `Error` (never a
      // `MeasurementRefusalError`) for ANY non-'fixed' track, not only
      // `undefined` — this is the exact trigger the pre-narrowing build
      // used and mistakenly treated as "genuinely triggers the catch
      // honestly"; it does not, by design, after this repair.
      const brokenTrack: LytTrackShape = { kind: 'elastic', minPx: 50, frWeight: 1 };
      const brokenOthers: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: brokenTrack, desiredVisible: true, viabilityFloorPx: null },
      ];
      expect(() =>
        resolveSideColumnLiveLayout(baseInput({ wrapperWidthPx: 1000, others: brokenOthers, treeSovereignPx: 300 })),
      ).toThrow(/not "fixed"/);
    });

    describe('a GENUINE MeasurementRefusalError degrades gracefully to compiled defaults, with a diagnostic pushed', () => {
      // Trigger: `treeSovereignPx: Infinity` — a corrupted/overflowed
      // persisted drag value no real UI drag can produce (every real
      // drag's own px comes from a finite mouse-position delta,
      // `useResizablePanel.ts`'s own `computePaneWidthPx`), but a
      // plausible shape for "a future bug reaches this seam with a
      // non-finite pixel value." `Math.round(Infinity)` stays `Infinity`
      // (not `NaN`, unlike a `-Infinity`/`NaN` input would risk), so the
      // eventual `px(treePx)` call inside the guarded region throws
      // `MeasurementRefusalError` (`px()`'s own non-finite guard) — a
      // genuine measurement-shaped refusal, deterministically.
      //
      // MIGRATED per ledger row 2532: `others` here is deliberately
      // NON-floor-bearing (`viabilityFloorPx: null`) rather than
      // `controlPanel`'s usual floor. This is a genuinely NEW disclosure,
      // not a cosmetic rename — `allot()`'s own sovereign floor-reservation
      // cap (`state/feasible-layout.ts`, this ticket's own mechanism) now
      // makes a corrupted `Infinity` override SAFE by construction
      // whenever a FLOOR-BEARING sibling is present (the cap clamps it to
      // a finite `wrapperWidthPx - floorReservationPx` before it ever
      // reaches `px()`) — a genuine, positive side effect of the "drags
      // floor, never demote to absent" ruling. This probe is re-scoped to
      // a sibling with NO floor (previewBoard's own shape) specifically
      // so it still reaches the construction-time refusal this test
      // exists to pin; the floor-bearing case is no longer reachable via
      // this trigger at all, which is the improvement, not a gap.
      const others: readonly SideColumnFixedRegion[] = [
        { widgetId: 'controlPanel', track: CONTROL_PANEL_TRACK, desiredVisible: true, viabilityFloorPx: null },
      ];

      it('sovereign: falls back to the SAME (still-Infinity) drag value, plus a diagnostic naming the refusal', () => {
        const result = resolveSideColumnLiveLayout(
          baseInput({ wrapperWidthPx: 1000, others, treeSovereignPx: Infinity, treeDefaultPx: 250 }),
        );
        // Fallback shape: sovereignty still wins verbatim for treePx (this
        // function's own "not yet measured" convention, reused for the
        // catch's own fallback) — never a crash.
        expect(result.treePx).toBe(Infinity);
        // `others` is entirely well-formed here — the fallback recovers
        // its OWN real compiled px, not degraded to 0 (proving the
        // hardened `o.track?.kind === 'fixed'` fallback still does its
        // job for a well-formed entry, not only for a broken one).
        const controlPanel = result.others.find((o) => o.widgetId === 'controlPanel')!;
        expect(controlPanel).toMatchObject({ present: true, candidatePx: 664 });
        expect(result.diagnostics).toHaveLength(1);
        const [diagnostic] = result.diagnostics;
        expect(diagnostic.location).toBe('tree');
        expect(diagnostic.starved).toEqual([]);
        expect(diagnostic.message).toMatch(/Layout could not be computed for the current content/);
        expect(diagnostic.remediation).toBe('reduce this region\'s width, or use Default Layout to reset');
        expect(diagnostic.nextAction).toBe('open-default-layout-control');
      });
    });
  });
});

// ── resolveRootSplitLiveLayout() — GAP A (`.claude/dispatch-reports/
//    lyt-cure-final-repair.md`, ledger rows 2502/2503) ──────────────────
//
// Fixed facts below are the REAL compiled values, cited so a reader can
// cross-check against the source without re-deriving them: root child "2"
// (the side column)'s own `board-priority-clamp` track in
// `src/state/lyt-layout.gen.ts` — `{ minPx: 345, maxPx: 820,
// fixedSiblingSumPx: 52, parentGapPx: 12 }`; `MIN_BOARD_PX = 300`
// (`src/state/layout-model.ts`); the side column's own live content
// demand at default content is `tree.minPx (110) + gap (4) +
// controlPanel (664) = 778`, which happens to equal `controlPanel`'s own
// compiled `@demote(h, 778)` threshold (`lyt-layout.gen.ts`) — the two
// facts corroborate each other, not a coincidence this suite invents.
describe('resolveRootSplitLiveLayout() — GAP A: the root split (board vs. side column) under FeasibleLayout', () => {
  const BOARD = { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vh' as const };
  const SIDE_COLUMN = { minPx: 345, maxPx: 820 };
  const BOARD_FLOOR_PX = 300;
  const ROOT_GAP_PX = 12;

  function baseInput(overrides: Partial<Parameters<typeof resolveRootSplitLiveLayout>[0]> = {}) {
    return {
      rowWidthPx: 1920,
      rowHeightPx: 1080,
      gapPx: ROOT_GAP_PX,
      boardRailReservedPx: 0,
      board: BOARD,
      sideColumn: SIDE_COLUMN,
      boardFloorPx: BOARD_FLOOR_PX,
      sovereignWrapperPx: undefined,
      ...overrides,
    };
  }

  // Ledger row 2511 pragmatic repair (UI shoddiness audit S1/S2/S3/S10,
  // `.claude/dispatch-reports/lyt-allocation-repair-build.md`): the
  // compiled `sideColumn.maxPx` (820) no longer clamps the side
  // column's own NATURAL yield — that static ceiling was the audit's
  // own root cause for turning genuine leftover width into dead space
  // (S2's `.engine-controls`/S3's Cards content column both traced back
  // to this same 820px cap). The side column now gets its full natural
  // yield (whatever the board's own square doesn't need), bounded only
  // by the board's hard floor.
  it('1920x1080 (default content): board useful width is 1028 (1080-52); side column gets its full natural yield, 880 — no longer clamped at the compiled 820 ceiling', () => {
    const result = resolveRootSplitLiveLayout(baseInput());
    expect(result.boardUsefulPx).toBe(1028);
    expect(result.sideColumnPx).toBe(880);
    expect(result.sideColumnPx).toBeGreaterThanOrEqual(778); // panel min (664) + tree cap (110) + gap (4)
  });

  it('1366x768: board useful width is 716 (768-52); side column gets exactly its NATURAL yield, 638 — BELOW the 778px docking demand, so demotion remains honest (not forced)', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 1366, rowHeightPx: 768 }));
    expect(result.boardUsefulPx).toBe(716);
    expect(result.sideColumnPx).toBe(638);
    expect(result.sideColumnPx).toBeLessThan(778);
  });

  it('2560x1080: side column again gets its full natural yield, 1520 — genuine extra width at a wider monitor is no longer converted to void past the old 820 cap (S10)', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 2560, rowHeightPx: 1080 }));
    expect(result.boardUsefulPx).toBe(1028);
    expect(result.sideColumnPx).toBe(1520);
  });

  it("never demand-forces past the board's own natural yield: the 1366x768 result equals the hand-computed natural-yield formula exactly, proving it is not an artifact of some accidental demand-flooring", () => {
    const rowWidthPx = 1366;
    const rowHeightPx = 768;
    const boardUsefulPx = Math.max(0, rowHeightPx - BOARD.fixedSiblingSumPx);
    const naturalSideColumnPx = rowWidthPx - ROOT_GAP_PX - boardUsefulPx;
    const result = resolveRootSplitLiveLayout(baseInput({ rowWidthPx, rowHeightPx }));
    expect(result.sideColumnPx).toBe(Math.round(naturalSideColumnPx));
  });

  it('sovereign (dragged): the stored value wins VERBATIM, as long as it stays within the board-floor-reserving ceiling at the CURRENT geometry', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 500, rowWidthPx: 1366, rowHeightPx: 768 }));
    expect(result.sideColumnPx).toBe(500);
    // boardUsefulPx is still reported (informational) even on the
    // sovereign path — it does not gate the sovereign branch's own
    // verbatim return.
    expect(result.boardUsefulPx).toBe(716);
  });

  it('sovereign: a negative stored value floors at 0, never negative CSS', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: -40 }));
    expect(result.sideColumnPx).toBe(0);
  });

  // Disease repair (`.claude/dispatch-reports/lyt-second-opus-review.md`
  // N2/CATASTROPHIC-1, ledger row 2511): a sovereign override taken at a
  // WIDE geometry (e.g. a 1200px drag on a 2560px-wide monitor) must
  // never be replayed byte-verbatim at a NARROWER geometry to the point
  // of starving the board to 0 — the exact "cold boot at 1366x768 renders
  // no board" finding. Pinned directly against the review's own numbers:
  // a 1200px override at 1366x768 (the review's own reproduction
  // geometry) used to yield `sideColumnPx: 1200`, leaving `1366 - 12 -
  // 1200 = 154px` for the board's OWN grid track before boardRail/gap —
  // in the review's live rig, less than that once boardRail's own
  // reservation is subtracted, landing on exactly 0. It now clamps to
  // this geometry's own `maxRegionWidthPx` (the SAME ceiling the
  // non-sovereign branch already reserves `boardFloorPx` against), so
  // the row always has at least `boardFloorPx` left for the board.
  describe('sovereign clamp: a stored override can never starve the board below boardFloorPx (CATASTROPHIC-1 repair)', () => {
    it('a 1200px override carried into 1366x768 clamps to this geometry\'s own ceiling, not 1200 verbatim', () => {
      const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 1200, rowWidthPx: 1366, rowHeightPx: 768 }));
      const availableForSplitPx = 1366 - ROOT_GAP_PX;
      // Row 2511 allocation repair: the compiled `sideColumn.maxPx` no
      // longer participates in this ceiling — only the board's own
      // floor does (see the describe block's own header above).
      const maxRegionWidthPx = availableForSplitPx - BOARD_FLOOR_PX;
      expect(result.sideColumnPx).toBe(maxRegionWidthPx);
      expect(result.sideColumnPx).toBeLessThan(1200);
      // The board's own remaining share of the row is at least its floor —
      // never 0, never negative.
      expect(availableForSplitPx - result.sideColumnPx).toBeGreaterThanOrEqual(BOARD_FLOOR_PX);
      // N4 repair: the clamp names the RAW value it clamped FROM, so a
      // caller can diagnose the refusal rather than leave it silent.
      expect(result.sovereignClampedFromPx).toBe(1200);
    });

    it('the SAME 1200px override, replayed across every narrower geometry the review swept, always leaves at least boardFloorPx for the board', () => {
      for (const [rowWidthPx, rowHeightPx] of [
        [2560, 1440],
        [1920, 1080],
        [1366, 768],
        [1024, 768],
        [900, 600],
      ] as const) {
        const result = resolveRootSplitLiveLayout(
          baseInput({ sovereignWrapperPx: 1200, rowWidthPx, rowHeightPx, boardRailReservedPx: 180 }),
        );
        const availableForSplitPx = rowWidthPx - 180 - ROOT_GAP_PX;
        const boardRemainingPx = availableForSplitPx - result.sideColumnPx;
        expect(boardRemainingPx).toBeGreaterThanOrEqual(BOARD_FLOOR_PX);
        expect(result.sideColumnPx).toBeGreaterThan(0); // never the degenerate 0px side column either
      }
    });

    it('a clamped override still stays within the side column\'s own compiled [minPx, maxPx] envelope', () => {
      const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 1200, rowWidthPx: 900, rowHeightPx: 600 }));
      expect(result.sideColumnPx).toBeLessThanOrEqual(SIDE_COLUMN.maxPx);
      expect(result.sideColumnPx).toBeGreaterThanOrEqual(0);
    });

    // Ledger row 2511 review condition 1 (`.claude/dispatch-reports/
    // lyt-disease-repair-review.md`, defect 1): a DIRECT regression test
    // against `resolveRootSplitLiveLayout` itself — the function that
    // actually drives the landscape render path — for "Default layout
    // reset ≡ fresh boot." The review traced that the pre-existing
    // evidentiary citation for this claim
    // (`tests/integration/resizer-restore-clamp.test.ts`'s "GREEN
    // (sovereignty)" case) exercises `effectiveTreeControlRegionWidthPx`
    // — a composable computed App.vue no longer reads for this path (see
    // that test's own updated comment) — so the claim, though probably
    // still true by construction (`resolveRootSplitLiveLayout` is pure;
    // `resetLayoutOverrides()` clears exactly the field it reads as
    // `sovereignWrapperPx`), was never actually asserted anywhere. This
    // closes that gap: a call with a CLAMPED sovereign override
    // (simulating the state immediately before a "Default Layout" reset)
    // is compared against a from-scratch call with `sovereignWrapperPx:
    // undefined` (simulating the state immediately after) at the SAME
    // geometry — the two must be byte-identical, since `resetLayout-
    // Overrides()`'s only effect on this function's own inputs is exactly
    // that field going from a number to `undefined`.
    it('reset ≡ fresh boot: resolveRootSplitLiveLayout with sovereignWrapperPx cleared to undefined, right after a clamped override, equals a from-scratch call at the same geometry', () => {
      const geometry = { rowWidthPx: 1366, rowHeightPx: 768 } as const;

      // "Before reset": a stored override so large it gets clamped
      // (mirrors the CATASTROPHIC-1 repro geometry/override pairing used
      // throughout this describe block).
      const beforeReset = resolveRootSplitLiveLayout(baseInput({ ...geometry, sovereignWrapperPx: 1200 }));
      expect(beforeReset.sovereignClampedFromPx).not.toBeNull(); // sanity: the clamp is genuinely exercised, not vacuous

      // "After reset": `resetLayoutOverrides()` (`useResizablePanel.ts`)
      // sets `store.session.ui.treeControlRegionWidthPx = undefined` —
      // the ONLY input this function threads that field into is
      // `sovereignWrapperPx`, so this is the exact post-reset call.
      const afterReset = resolveRootSplitLiveLayout(baseInput({ ...geometry, sovereignWrapperPx: undefined }));

      // "Fresh boot": a from-scratch call at the same geometry, never
      // having carried any sovereign override at all.
      const freshBoot = resolveRootSplitLiveLayout(baseInput(geometry));

      expect(afterReset).toEqual(freshBoot);
      // And the reset genuinely changed something observable — not a
      // vacuous equality where beforeReset already equalled freshBoot.
      expect(beforeReset).not.toEqual(freshBoot);
    });
  });

  // Disease repair N4 (`.claude/dispatch-reports/lyt-second-opus-review.md`,
  // ledger row 2511): the divider's own "no visible change, no message"
  // symptom. `sovereignClampedFromPx` is the mechanism a caller
  // (App.vue's own diagnostic watcher) uses to turn that silent refusal
  // into the SAME graceful diagnostic a starved sibling already gets —
  // pinned here at the pure-function layer, independent of any live-DOM
  // reproduction of the original drag sequence.
  describe('sovereignClampedFromPx: names the refusal so a drag that overshoots the region never goes silent (N4 repair)', () => {
    it('is null when the sovereign value is already within bounds — no refusal, no diagnostic', () => {
      const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 500, rowWidthPx: 1366, rowHeightPx: 768 }));
      expect(result.sovereignClampedFromPx).toBeNull();
    });

    it('is null on the non-sovereign path — clamping is only ever a REFUSAL of a user\'s own explicit override', () => {
      const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: undefined }));
      expect(result.sovereignClampedFromPx).toBeNull();
    });

    it('fires whenever an override overshoots the board-floor-reserving ceiling, even far from the board\'s own literal floor — the "stuck, no message" gap outerRowSovereignDiagnostic (board-starvation-only) doesn\'t cover', () => {
      // Row 2511 allocation repair: `sideColumn.maxPx` (820) no longer
      // binds here — the ceiling at 1920x1080 is now
      // 1920-12-300=1608. An override past THAT is what this diagnostic
      // exists to name.
      const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 1700, rowWidthPx: 1920, rowHeightPx: 1080 }));
      const availableForSplitPx = 1920 - ROOT_GAP_PX;
      expect(result.sideColumnPx).toBe(availableForSplitPx - BOARD_FLOOR_PX);
      expect(result.sovereignClampedFromPx).toBe(1700);
    });

    it('a SECOND, smaller override that is still within bounds clears the refusal signal (dividing back within range un-sticks it)', () => {
      const stuck = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 1200, rowWidthPx: 1366, rowHeightPx: 768 }));
      expect(stuck.sovereignClampedFromPx).not.toBeNull();
      const recovered = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 500, rowWidthPx: 1366, rowHeightPx: 768 }));
      expect(recovered.sovereignClampedFromPx).toBeNull();
      expect(recovered.sideColumnPx).toBe(500);
    });
  });

  it("not yet measured (rowWidthPx <= 0): degrades to the side column's own compiled floor", () => {
    const result = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 0, rowHeightPx: 0 }));
    expect(result.sideColumnPx).toBe(SIDE_COLUMN.minPx);
    expect(result.boardUsefulPx).toBe(0);
  });

  it('not yet measured + sovereign override: clamps to the side column\'s own compiled ceiling rather than shipping the raw override unclamped for the pre-measurement tick', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ sovereignWrapperPx: 1200, rowWidthPx: 0, rowHeightPx: 0 }));
    expect(result.sideColumnPx).toBe(SIDE_COLUMN.maxPx);
    expect(result.boardUsefulPx).toBe(0);
  });

  it('board-floor protection: at a pathologically narrow/tall viewport, the side column never claims so much that the board falls below boardFloorPx', () => {
    const result = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 900, rowHeightPx: 1200 }));
    // Board useful (1200-52=1148) vastly exceeds available width — the
    // side column's OWN compiled ceiling (820) would normally bind, but
    // the board-floor reservation (900-12-300=588) binds FIRST here,
    // protecting MIN_BOARD_PX.
    const availableForSplitPx = 900 - ROOT_GAP_PX;
    expect(result.sideColumnPx).toBeLessThanOrEqual(availableForSplitPx - BOARD_FLOOR_PX);
  });

  it('boardRailReservedPx is subtracted from the available split before the board-priority-clamp math runs', () => {
    // rowWidthPx chosen so BOTH the with-rail and without-rail candidates
    // land strictly inside [minPx, maxPx] — neither clamp masks the
    // subtraction (unlike a too-narrow or too-wide width, where one or
    // both sides would hit the same floor/ceiling regardless of the
    // rail's own reservation).
    const withoutRail = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 1378, rowHeightPx: 768, boardRailReservedPx: 0 }));
    const withRail = resolveRootSplitLiveLayout(baseInput({ rowWidthPx: 1378, rowHeightPx: 768, boardRailReservedPx: 180 })); // 168px fixed + 12px gap
    expect(withoutRail.sideColumnPx).toBe(650);
    expect(withRail.sideColumnPx).toBe(withoutRail.sideColumnPx - 180);
  });

  // Review repair, condition C1 (`.claude/dispatch-reports/
  // lyt-cure-final-repair-review.md` §5): `naturalBoardCrossUnit` must be
  // asserted, not silently substituted past — this resolver's own closed
  // form only mirrors the height-based CASE A branch
  // (`useLytTrackCss.ts`'s `board-priority-clamp` case, the `'vh'` half);
  // a `'vw'` track needs a DIFFERENT formula (width-based), which this
  // function does not implement.
  describe('condition C1: naturalBoardCrossUnit is asserted before any arithmetic runs', () => {
    it('refuses loudly (MeasurementRefusalError, naming the offending unit) when the compiled track declares "vw" instead of "vh"', () => {
      expect(() =>
        resolveRootSplitLiveLayout(baseInput({ board: { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vw' } })),
      ).toThrow(MeasurementRefusalError);
      expect(() =>
        resolveRootSplitLiveLayout(baseInput({ board: { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vw' } })),
      ).toThrow(/naturalBoardCrossUnit is "vw", not "vh"/);
    });

    it('the refusal fires BEFORE any arithmetic — even a geometry that would otherwise dock cleanly still refuses, not merely "wrong number, no throw"', () => {
      // Same 1920x1080 default-content input the acceptance table's own
      // docking case uses — proves the guard is unconditional, not only
      // reachable at some contrived degenerate geometry.
      expect(() =>
        resolveRootSplitLiveLayout(
          baseInput({ rowWidthPx: 1920, rowHeightPx: 1080, board: { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vw' } }),
        ),
      ).toThrow(MeasurementRefusalError);
    });

    it('the refusal fires even on the SOVEREIGN (dragged) path — the unit check is not skipped by an early sovereign return', () => {
      expect(() =>
        resolveRootSplitLiveLayout(
          baseInput({ sovereignWrapperPx: 500, board: { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vw' } }),
        ),
      ).toThrow(MeasurementRefusalError);
    });

    it('passes through cleanly for the expected "vh" unit — the guard is a refusal, not a silent behavior change for the normal case', () => {
      const result = resolveRootSplitLiveLayout(baseInput({ board: { fixedSiblingSumPx: 52, naturalBoardCrossUnit: 'vh' } }));
      // Row 2511 allocation repair: 880 is the 1920x1080 natural yield
      // (see this file's own updated acceptance table above) — no
      // `sideColumnDesiredMinPx` is passed by `baseInput()`, so no floor
      // raise applies here either.
      expect(result.sideColumnPx).toBe(880);
      expect(result.boardUsefulPx).toBe(1028);
    });
  });
});
