/**
 * tests/unit/state/feasible-layout-geometry-sweep.test.ts
 *
 * The dispatch-L1 report-only CI gate (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 1's own "Gate" paragraph; §4's
 * step-1 risk row: "run the gate in report-only (non-blocking) mode for
 * one cycle before flipping to blocking"). For every geometry in the
 * final Opus review's own sweep (`.claude/dispatch-reports/
 * lyt-final-opus-review.md` §2 Class 1's `s12` witness — landscape
 * 1280/1366/1600/1800/1920/2200/2560/2880/3000 at ~1000px height;
 * portrait 420x880/540x960/768x1024/1080x1920/1200x1600), this suite:
 *
 *   1. Builds `demands` via `measuredFromLytProgram` against the REAL
 *      compiled program (`LYT_LANDSCAPE` / `LYT_PORTRAIT`).
 *   2. Builds a `candidate` allotment honestly DERIVED from the SAME
 *      compiled program's own track list, evaluated numerically — see
 *      "Candidate derivation, disclosed" below for exactly what this
 *      does and does not reproduce.
 *   3. Runs `FeasibleLayout.validate(demands, candidate, ...)` and
 *      asserts ONLY the meta-property the gate is scoped to at this step
 *      (`FeasibleLayout | { refused: StarvationDiagnostic[] }`, never
 *      `undefined`/a throw) — never `diagnostics.length === 0`, which
 *      would make this suite BLOCKING rather than report-only.
 *   4. Accumulates every diagnostic into a full per-geometry CENSUS,
 *      logged via `console.info` (visible in CI output) and asserted
 *      to be non-empty overall — "if your census is empty, suspect your
 *      adapter before trusting it" (dispatch brief). The full census is
 *      also reproduced in this build's report
 *      (`.claude/dispatch-reports/lyt-space-owner-l1-build.md`).
 *
 * ── Candidate derivation, disclosed ─────────────────────────────────
 *
 * No per-geometry SOLVED data exists for this sweep. `research/lyt/
 * runner.py`'s own `SCREEN_SIZES` (the source `lyt-solved-layout-
 * landscape.gen.ts` is regenerated from) covers only FOUR points
 * (1920x1080, 2560x1440, 1280x1024, 1080x1920-portrait) — not the
 * review's nine-point landscape sweep nor its five-point portrait one —
 * and, separately, that solved file's own widget set (`A_engine` as one
 * region, `CP-other`) predates the C3 rewrite's widget split
 * (`A_engine_controls`/`A_engine_eval`/`A_engine_health`/
 * `A_engine_queue`; `otherColorDebug`/`otherBand` in place of `CP-other`)
 * — it is STALE against today's compiled program and was NOT used for
 * that reason (a mismatched-region join would be dishonest, not merely
 * approximate). Per the dispatch brief's own instruction ("derive the
 * candidate from the track list the way LytNode.vue would and DISCLOSE
 * the derivation"), this suite derives every geometry's candidate from
 * `LYT_LANDSCAPE`/`LYT_PORTRAIT`'s own track list directly, via:
 *
 *   - `solveRowTracks` — a numeric evaluation of the SAME per-track-kind
 *     formulas `useLytTrackCss.ts`'s `trackCssValue` emits as CSS
 *     strings (fixed / `minmax(min,fr)` / `minmax(min,max)` / the two
 *     board-priority clamp closed forms), since this Vitest suite has no
 *     real browser Grid layout engine to defer a CSS string to. The
 *     `fr`-track distribution and the `elastic-capped` "maximize before
 *     flex" step are a DISCLOSED SIMPLIFICATION of CSS Grid Level 1's
 *     own multi-pass algorithm (one proportional pass per phase, not the
 *     spec's iterative fair-share) — sufic for this gate's own scope
 *     (report evidence, not a pixel-exact oracle).
 *   - Presence for `boardRail`/`A_setup`/`previewBoard` follows the
 *     compiled `presenceDefaultVisible` field directly (no runtime
 *     override, no sovereign drag — a fresh-boot, default-layout
 *     scenario, matching the review's own `s12` "fresh boot at each
 *     width" methodology).
 *   - Presence for `controlPanel`/`A_app` (the two leaves/nodes carrying
 *     a compiled `demote`) — UPDATED by dispatch L3: this sweep used to
 *     reuse `resolveWidthConditionalPresence`/`sumFixedRowSiblingReservationPx`
 *     DIRECTLY from `src/state/layout-model.ts`; both are DELETED by L3
 *     (subsumed by `resolveSideColumnLiveLayout`'s own presence
 *     resolution). `resolveDemotedPresenceForSweep` (this file, below) is
 *     the SAME width-vs-threshold check with the reservation parameter
 *     dropped — every call site here always passed `otherFixedSiblings:
 *     []` (this sweep never modeled a live `previewBoard` reservation),
 *     so the reservation half was always a no-op in THIS derivation;
 *     dropping it changes nothing this suite's own candidates compute.
 *     `previewBoard` defaults absent in both compiled programs, so the
 *     dated addendum the deleted function used to carry for a VISIBLE
 *     `previewBoard` (`lyt-wA-width-demotion-review.md`, "New finding")
 *     did not apply to this default-layout sweep either, before or after
 *     L3 — disclosed, not silently narrowed.
 *   - A resolved-ABSENT region (`RegionPresence.absent`, §1.3) is fed to
 *     `validate()` with its `Measured` entry INCLUDED and its
 *     `candidate` allotment at the literal `0px` a collapsed compiled
 *     track renders (`useLytTrackCss.ts`'s own header: "a collapsed
 *     track... the CALLER passes '0px' instead of calling into this
 *     module") — this is DELIBERATE, not an oversight: the spec's own
 *     §3 step 1 text names this exact mechanism as what makes the gate
 *     checkable BEFORE `maxUseful` exists ("min-only validation already
 *     catches the review's own... starved-control-panel instance[s]").
 *     §1.3's `RegionPresence`-aware demand-OMISSION discipline (this
 *     module's own doc on `RegionPresence`) is a LATER wiring point (the
 *     real render path, not this synthetic gate) — using it here would
 *     suppress exactly the diagnostics step 1 exists to surface. See
 *     this file's "On the missing hoarding-tree pairing" section below
 *     for the one place this choice has a load-bearing consequence.
 *   - CSS Grid never shrinks a track below its own declared minimum (it
 *     overflows the container instead) — `solveRowTracks` mirrors that:
 *     every VISIBLE track resolves to AT LEAST its own `minPx`/`px`,
 *     even when the row's siblings sum to more than the container. A
 *     consequence, disclosed plainly: this derivation's `starved`
 *     diagnostics arise EXCLUSIVELY from the presence/demote 0px
 *     mechanism above, never from genuine sibling overcommitment (which
 *     manifests as container OVERFLOW — the review's own 5px/30px
 *     horizontal-escape findings — a defect class `Measured`/
 *     `FeasibleLayout` as specified does not yet catch, since `validate`
 *     checks each `(region, axis)` pair against its OWN candidate, never
 *     against a container-capacity sum). Named here as an honest limit
 *     of step 1's scope, not folded into the spec's own six open
 *     questions without saying so.
 *
 * ── On the missing hoarding-tree pairing ────────────────────────────
 *
 * The dispatch brief anticipated the review's own canonical
 * starved-control-panel + hoarding-tree PAIR appearing together at
 * 1920x1080. Only the starved half can appear in this derivation, and
 * this is not an adapter bug: `measuredFromLytProgram` synthesizes
 * `maxUseful: null` for EVERY plain-`elastic` leaf (`tree` among them) —
 * this is §3 step 1's own explicit design ("step 1 changes nothing about
 * what the app allows... maxUseful: null... which is most leaves
 * today"), not a derivation choice this suite made. A `hoarding`
 * diagnostic requires a non-null `maxUseful` to be exceeded
 * (`FeasibleLayout.validate`'s own `d.maxUseful !== null && got.px >
 * d.maxUseful` guard) — `tree` cannot produce one until step 2 populates
 * its track as `elastic-capped`. The review's 613px-tree/60px-content
 * finding remains real; it is simply invisible to a `min`-only pass by
 * construction, which is exactly what "step 1 makes the CURRENT
 * permissiveness explicit and checkable" means for the hoarding half.
 * Verified below (`describe('honest limits of the step-1 census')`)
 * rather than left as an unexplained gap.
 *
 * ── Dispatch L2b addendum (§3 step 2, ledger rows 2447/2450/2460) ──────
 *
 * The section above is L1's own account, preserved verbatim — it is now
 * PARTIALLY superseded: `landscapeDemands`/`portraitDemands` below are
 * built with `TREE_LIVE_CONTENT_OVERLAY` wired in (see that constant's
 * own doc), so `tree`'s own `maxUseful` is no longer `null` and the
 * "never produces a hoarding diagnostic for tree" test in the "honest
 * limits" describe below has been RETIRED (its own claim is no longer
 * true — see that describe block's own updated header) — the flagship
 * hoarding-tree diagnostic that section predicted as invisible to a
 * `min`-only pass now appears in the STANDARD census below, at every
 * landscape width wide enough for the numeric solver's own leftover
 * distribution to hand `tree` more than 60px (empirically: every landscape
 * sweep width ≥ 1600, where `controlPanel` no longer competes for the
 * same row's leftover — see the census output for the exact figures).
 *
 * A SEPARATE, additional describe block below
 * (`'dispatch L2b: the flagship starved+hoarding PAIR, review-witnessed
 * candidate at 1920x1080'`) delivers the ONE specific acceptance-evidence
 * row the dispatch brief names: the starved-controlPanel +
 * hoarding-tree PAIR together at 1920x1080. This does NOT reuse
 * `computeLandscapeCandidate`'s own numeric solver for `tree`/
 * `controlPanel` at that one geometry — disclosed, not silently
 * substituted: `computeLandscapeCandidate`'s own `board-priority-clamp`
 * formula SATURATES at its compiled `maxPx: 820` for every height up to
 * ~1140px at width 1920 (checked directly: `availableForTrackPx =
 * 1960 - heightPx`, which stays above 820 for any `heightPx < 1140`), so
 * the numeric solver's own `sideColumnPx` is IDENTICALLY 820px at BOTH
 * 1920x1000 (the s12 sweep's own height) and 1920x1080 — above the
 * compiled 778px demote threshold either way, meaning `controlPanel`
 * NEVER starves at width 1920 in this derivation, at ANY height a real
 * screen plausibly uses. This is the SAME disclosed gap L1's own report
 * already named ("narrower than the review's own live-DOM witness of
 * demotion persisting through 1920 and even 2560") — not a NEW
 * divergence this build introduces. Rather than silently forcing the
 * solver to agree (which would misrepresent what the numeric derivation
 * actually computes), that ONE test uses the review's OWN witnessed
 * live-DOM numbers for `tree`/`controlPanel` specifically (613px /
 * absent — `lyt-final-opus-review.md` §Class 1's own `02-workspace-
 * 1920.png` witness) layered onto `computeLandscapeCandidate`'s own
 * solver output for every OTHER region at that geometry — the REAL
 * adapter (with the REAL overlay) supplies `demands`; only the
 * candidate's two flagship entries are the review's own attested
 * numbers, not solver output. Grounded in real, cited evidence either
 * way; never a fabricated number.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  px,
  measured,
  measuredFromLytProgram,
  FeasibleLayout,
  resolveSideColumnLiveLayout,
  type Px,
  type StarvationDiagnostic,
  type RegionAllotment,
  type SideColumnFixedRegion,
} from '../../../src/state/feasible-layout';

// Dispatch L2b's own runtime overlay (spec §2's "runtime content-
// dependent demand" seam, `useContentDemand.ts`). `tree` is the review's
// own named flagship hoarder; `60` is the review's OWN witnessed content
// width (`lyt-final-opus-review.md` §Class 1: "The tree's own content
// across all of these is a single column of nodes measuring 60 px
// (`treeSvg` width 60 in the same probe)") — a real `useContentDemand`
// reading in the live app, stood in here by this Vitest suite (no DOM
// render of a real `TreeWidget` happens in this Tier-1 file) with the
// SAME witnessed figure a live reading would produce for the review's
// own sparse-tree scenario, cited rather than invented.
//
// The RAW overlay value is 60 — but `measuredFromLytProgram`'s own
// overlay mechanism clamps the EFFECTIVE `maxUseful` up to the region's
// own compiled `min` (`feasible-layout.ts`'s own header: "a live reading
// below the region's own compiled floor does not lower maxUseful below
// that floor"), and `tree`'s own compiled `min` differs by screen class
// (`elastic{minPx:110}` landscape, `elastic{minPx:140}` portrait) — so
// the EFFECTIVE `maxUseful` this overlay produces is 110 in landscape and
// 140 in portrait, never the raw 60, in EITHER class. Asserted directly
// below, not left implicit.
const TREE_LIVE_CONTENT_OVERLAY: ReadonlyMap<string, Px | null> = new Map([['tree', px(60)]]);
const TREE_EFFECTIVE_MAX_USEFUL_LANDSCAPE_PX = 110;
const TREE_EFFECTIVE_MAX_USEFUL_PORTRAIT_PX = 140;
import { LYT_LANDSCAPE } from '../../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../../src/state/lyt-layout-portrait.gen';
import type { LytAxis, LytDemotion, LytNodeData, LytTrackShape } from '../../../src/state/lyt-layout-types';

// HISTORICAL, deleted by dispatch L3 (`.claude/dispatch-reports/
// lyt-space-owner-spec.md` §3 step 3): this suite used to call
// `resolveWidthConditionalPresence`/`sumFixedRowSiblingReservationPx`
// directly from `state/layout-model.ts` — both DELETED, subsumed by
// `resolveSideColumnLiveLayout`'s own presence resolution. Every call
// site here passed `otherFixedSiblings: []` (this file's own numeric
// solver never modeled a live `previewBoard` reservation), so the
// reservation half of the deleted function was always a no-op in this
// derivation — `resolveDemotedPresenceForSweep` below is the exact
// width-vs-threshold check that leaves unchanged, without the unused
// reservation parameter.
function resolveDemotedPresenceForSweep(
  measuredWidthPx: number,
  demote: LytDemotion | null,
  desiredVisible: boolean,
): boolean {
  if (demote === null) return desiredVisible;
  if (measuredWidthPx <= 0) return desiredVisible;
  return measuredWidthPx >= demote.belowPx ? desiredVisible : false;
}

// ── Geometry sweep, per the review's own s12 / mandated-classes census ─

const LANDSCAPE_SWEEP_WIDTHS_PX = [1280, 1366, 1600, 1800, 1920, 2200, 2560, 2880, 3000] as const;
const LANDSCAPE_SWEEP_HEIGHT_PX = 1000; // review's own s12 methodology: "width sweep at height 1000"

const PORTRAIT_SWEEP_SIZES_PX: readonly { readonly wPx: number; readonly hPx: number }[] = [
  { wPx: 420, hPx: 880 },
  { wPx: 540, hPx: 960 },
  { wPx: 768, hPx: 1024 },
  { wPx: 1080, hPx: 1920 },
  { wPx: 1200, hPx: 1600 },
];

// ── Numeric track-list solver (test-only — see file header) ────────────

interface RowEntry {
  readonly widget: string;
  readonly track: LytTrackShape;
  readonly visible: boolean;
}

interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Numeric evaluation of `useLytTrackCss.ts`'s own per-kind CSS formulas
 *  — see file header. Returns one resolved px per entry, in the SAME
 *  order as `entries`; invisible entries always resolve to 0 and never
 *  consume a gap (mirrors `sumFixedRowSiblingReservationPx`'s own
 *  "an ABSENT sibling contributes nothing" convention). */
function solveRowTracks(entries: readonly RowEntry[], containerSizePx: number, gapPx: number, viewport: Viewport): number[] {
  const resolved: number[] = new Array(entries.length).fill(0);
  const visibleIdx = entries.map((_, i) => i).filter((i) => entries[i].visible);
  const totalGapPx = gapPx * Math.max(0, visibleIdx.length - 1);
  const availablePx = Math.max(0, containerSizePx - totalGapPx);

  const cappedIdx: number[] = [];
  const elasticIdx: number[] = [];
  for (const i of visibleIdx) {
    const t = entries[i].track;
    switch (t.kind) {
      case 'fixed':
        resolved[i] = t.px;
        break;
      case 'board-priority-clamp': {
        const naturalCrossPx = (t.naturalBoardCrossUnit === 'vh' ? viewport.heightPx : viewport.widthPx) - t.fixedSiblingSumPx;
        const availableForTrackPx = containerSizePx - naturalCrossPx - t.parentGapPx;
        resolved[i] = Math.min(t.maxPx, Math.max(t.minPx, availableForTrackPx));
        break;
      }
      case 'board-priority-self-clamp': {
        const naturalCrossPx = (t.naturalCrossUnit === 'vh' ? viewport.heightPx : viewport.widthPx) + t.fixedSiblingSumPx;
        resolved[i] = Math.max(0, naturalCrossPx);
        break;
      }
      case 'elastic-capped':
        resolved[i] = t.minPx;
        cappedIdx.push(i);
        break;
      case 'elastic':
        resolved[i] = t.minPx;
        elasticIdx.push(i);
        break;
      /* istanbul ignore next -- exhaustiveness guard, ADR-0002 */
      default: {
        const _exhaustive: never = t;
        throw new Error(`solveRowTracks: unhandled LytTrackShape kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  const consumedPx = visibleIdx.reduce((sum, i) => sum + resolved[i], 0);
  let leftoverPx = Math.max(0, availablePx - consumedPx);

  // "Maximize Tracks" before "Expand Flexible Tracks" (CSS Grid Level 1's
  // own step ordering) — elastic-capped tracks grow toward their own max
  // FIRST, proportional to remaining capacity, one pass (disclosed
  // simplification, file header).
  if (leftoverPx > 0 && cappedIdx.length > 0) {
    const capacities = cappedIdx.map((i) => {
      const t = entries[i].track as Extract<LytTrackShape, { kind: 'elastic-capped' }>;
      return t.maxPx - t.minPx;
    });
    const totalCapacity = capacities.reduce((a, b) => a + b, 0);
    if (totalCapacity > 0) {
      const grantablePx = Math.min(leftoverPx, totalCapacity);
      cappedIdx.forEach((i, k) => {
        resolved[i] += grantablePx * (capacities[k] / totalCapacity);
      });
      leftoverPx -= grantablePx;
    }
  }

  if (leftoverPx > 0 && elasticIdx.length > 0) {
    const totalWeight = elasticIdx.reduce(
      (sum, i) => sum + (entries[i].track as Extract<LytTrackShape, { kind: 'elastic' }>).frWeight,
      0,
    );
    if (totalWeight > 0) {
      for (const i of elasticIdx) {
        const w = (entries[i].track as Extract<LytTrackShape, { kind: 'elastic' }>).frWeight;
        resolved[i] += leftoverPx * (w / totalWeight);
      }
    }
  }

  return resolved;
}

type CandidateMap = Map<string, { readonly axis: LytAxis; readonly px: number }>;

function setCandidate(map: CandidateMap, widget: string, axis: LytAxis, valuePx: number): void {
  map.set(widget, { axis, px: Math.max(0, valuePx) });
}

/** `LYT_LANDSCAPE`'s own tree shape, per this file's header: root (h) ->
 *  [boardRail(fixed168,off), board-v-split(elastic — aspect-excluded from
 *  `demands` but still a real space consumer), path2(board-priority-clamp
 *  side column)] -> path2's own v-split [engine-row(fixed80,h-split),
 *  A_app(fixed28,demote h616), A_setup(fixed92,off),
 *  tree-row(elastic,h-split: tree/controlPanel(fixed664,demote
 *  h778)/previewBoard(fixed160,off,aspect-excluded))]. Specific to
 *  today's known landscape encoding shape, not a generic LytProgram
 *  interpreter — disclosed per this file's header. */
function computeLandscapeCandidate(viewport: Viewport): CandidateMap {
  const candidate: CandidateMap = new Map();
  const root = LYT_LANDSCAPE.root; // axis 'h', gapPx 12
  const [boardRailChild, boardAreaChild, sideColumnChild] = root.children;

  const rootRow: RowEntry[] = [
    { widget: 'boardRail', track: boardRailChild.track, visible: boardRailChild.presenceDefaultVisible },
    { widget: 'boardArea', track: boardAreaChild.track, visible: true }, // aspect-excluded from demands, still consumes space
    { widget: 'sideColumn', track: sideColumnChild.track, visible: true },
  ];
  const [, , sideColumnPx] = solveRowTracks(rootRow, viewport.widthPx, root.gapPx, viewport);

  if (boardRailChild.presenceDefaultVisible) setCandidate(candidate, 'boardRail', 'h', boardRailChild.track.kind === 'fixed' ? boardRailChild.track.px : 0);
  else setCandidate(candidate, 'boardRail', 'h', 0);

  // sideColumn's own nested v-split: [engineRow(80), A_app(28, demote h616),
  // A_setup(92, off), treeRow(elastic)]
  if (sideColumnChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: sideColumn node is not a split — encoding shape changed, this derivation needs updating.');
  const sideColumnSplit = sideColumnChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [engineRowChild, appChild, setupChild, treeRowChild] = sideColumnSplit.children;

  const appVisible = resolveDemotedPresenceForSweep(sideColumnPx, appChild.node.kind === 'leaf' ? appChild.node.demote : null, appChild.presenceDefaultVisible);
  // A_app/A_setup are children of sideColumnSplit (axis 'v') — their own
  // Measured axis (measuredFromLytProgram) is the PARENT split's axis, so
  // the candidate axis here must match 'v', not the 'h' the tree/
  // controlPanel row below uses (a mismatched axis makes validate() skip
  // the region as "not modeled this axis" instead of checking it — this
  // was caught by an unexpectedly-thin first census and fixed).
  setCandidate(candidate, 'A_app', 'v', appVisible && appChild.track.kind === 'fixed' ? appChild.track.px : 0);
  setCandidate(candidate, 'A_setup', 'v', 0); // presenceDefaultVisible: false, unconditional in this sweep

  const sideColumnRow: RowEntry[] = [
    { widget: 'engineRow', track: engineRowChild.track, visible: true },
    { widget: 'A_app', track: appChild.track, visible: appVisible },
    { widget: 'A_setup', track: setupChild.track, visible: false },
    { widget: 'treeRow', track: treeRowChild.track, visible: true },
  ];
  solveRowTracks(sideColumnRow, sideColumnPx, sideColumnSplit.gapPx, viewport); // heights, unused further

  // engineRow's own h-split: [A_engine_controls(elastic185), A_engine_eval(fixed139), A_engine_health(fixed139), A_engine_queue(elastic0)]
  if (engineRowChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: engineRow node is not a split — encoding shape changed.');
  const engineRowSplit = engineRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const engineRow: RowEntry[] = engineRowSplit.children.map((c) => ({
    widget: c.node.kind === 'leaf' ? c.node.widget : c.path,
    track: c.track,
    visible: c.presenceDefaultVisible,
  }));
  const engineResolved = solveRowTracks(engineRow, sideColumnPx, engineRowSplit.gapPx, viewport);
  engineRow.forEach((e, i) => setCandidate(candidate, e.widget, 'h', engineResolved[i]));

  // treeRow's own h-split: [tree(elastic110), controlPanel(fixed664, demote h778), previewBoard(fixed160, off, aspect-excluded)]
  if (treeRowChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: treeRow node is not a split — encoding shape changed.');
  const treeRowSplit = treeRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [treeChild, controlPanelChild, previewBoardChild] = treeRowSplit.children;
  const controlPanelDemote = controlPanelChild.node.kind === 'exclusive' ? controlPanelChild.node.demote : null;
  const controlPanelVisible = resolveDemotedPresenceForSweep(sideColumnPx, controlPanelDemote, controlPanelChild.presenceDefaultVisible);
  const treeRow: RowEntry[] = [
    { widget: 'tree', track: treeChild.track, visible: true },
    { widget: 'controlPanel', track: controlPanelChild.track, visible: controlPanelVisible },
    { widget: 'previewBoard', track: previewBoardChild.track, visible: false }, // presenceDefaultVisible: false, unconditional
  ];
  const treeResolved = solveRowTracks(treeRow, sideColumnPx, treeRowSplit.gapPx, viewport);
  setCandidate(candidate, 'tree', 'h', treeResolved[0]);
  setCandidate(candidate, 'controlPanel', 'h', treeResolved[1]);
  // previewBoard aspect-excluded from `demands` — no candidate entry needed.

  return candidate;
}

/** `LYT_PORTRAIT`'s own tree shape: root (v) -> [boardRail(off),
 *  A_app(fixed56,demote h616 vs the FULL viewport width — no side-column
 *  concept in portrait), A_setup(off), board-composite(self-clamp,
 *  aspect-excluded), engineRow(fixed80,h-split), treeRow(elastic,
 *  h-split: tree/controlPanel(fixed664, off by DEFAULT + demote
 *  h808)/previewBoard(fixed96,off,aspect-excluded))]. */
function computePortraitCandidate(viewport: Viewport): CandidateMap {
  const candidate: CandidateMap = new Map();
  const root = LYT_PORTRAIT.root; // axis 'v', gapPx 12
  const [boardRailChild, appChild, setupChild, boardChild, engineRowChild, treeRowChild] = root.children;

  const appDemote = appChild.node.kind === 'leaf' ? appChild.node.demote : null;
  const appVisible = resolveDemotedPresenceForSweep(viewport.widthPx, appDemote, appChild.presenceDefaultVisible);

  const rootColumn: RowEntry[] = [
    { widget: 'boardRail', track: boardRailChild.track, visible: boardRailChild.presenceDefaultVisible },
    { widget: 'A_app', track: appChild.track, visible: appVisible },
    { widget: 'A_setup', track: setupChild.track, visible: false },
    { widget: 'boardComposite', track: boardChild.track, visible: true }, // aspect-excluded from demands, still consumes space
    { widget: 'engineRow', track: engineRowChild.track, visible: true },
    { widget: 'treeRow', track: treeRowChild.track, visible: true },
  ];
  solveRowTracks(rootColumn, viewport.heightPx, root.gapPx, viewport); // heights, unused further beyond presence booleans above

  setCandidate(candidate, 'boardRail', 'v', 0); // presenceDefaultVisible: false, unconditional
  // A_app/A_setup are children of root (axis 'v') — same axis-matching
  // requirement as the landscape function's own note above.
  setCandidate(candidate, 'A_app', 'v', appVisible && appChild.track.kind === 'fixed' ? appChild.track.px : 0);
  setCandidate(candidate, 'A_setup', 'v', 0);

  if (engineRowChild.node.kind !== 'split') throw new Error('computePortraitCandidate: engineRow node is not a split — encoding shape changed.');
  const engineRowSplit = engineRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const engineRow: RowEntry[] = engineRowSplit.children.map((c) => ({
    widget: c.node.kind === 'leaf' ? c.node.widget : c.path,
    track: c.track,
    visible: c.presenceDefaultVisible,
  }));
  const engineResolved = solveRowTracks(engineRow, viewport.widthPx, engineRowSplit.gapPx, viewport);
  engineRow.forEach((e, i) => setCandidate(candidate, e.widget, 'h', engineResolved[i]));

  if (treeRowChild.node.kind !== 'split') throw new Error('computePortraitCandidate: treeRow node is not a split — encoding shape changed.');
  const treeRowSplit = treeRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [treeChild, controlPanelChild, previewBoardChild] = treeRowSplit.children;
  const controlPanelDemote = controlPanelChild.node.kind === 'exclusive' ? controlPanelChild.node.demote : null;
  // presenceDefaultVisible is FALSE for portrait's controlPanel (path 5.1) —
  // desiredVisible=false means resolveWidthConditionalPresence returns
  // false regardless of width, matching the spec's own open question 4
  // witness ("demotes it by DEFAULT, not only under width pressure").
  const controlPanelVisible = resolveDemotedPresenceForSweep(viewport.widthPx, controlPanelDemote, controlPanelChild.presenceDefaultVisible);
  const treeRow: RowEntry[] = [
    { widget: 'tree', track: treeChild.track, visible: true },
    { widget: 'controlPanel', track: controlPanelChild.track, visible: controlPanelVisible },
    { widget: 'previewBoard', track: previewBoardChild.track, visible: false },
  ];
  const treeResolved = solveRowTracks(treeRow, viewport.widthPx, treeRowSplit.gapPx, viewport);
  setCandidate(candidate, 'tree', 'h', treeResolved[0]);
  setCandidate(candidate, 'controlPanel', 'h', treeResolved[1]);

  return candidate;
}

// ── The gate itself ─────────────────────────────────────────────────

interface CensusEntry {
  readonly label: string;
  readonly screenClassId: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly diagnostics: readonly StarvationDiagnostic[];
}

const CENSUS: CensusEntry[] = [];

function toAllotmentMap(candidate: CandidateMap): ReadonlyMap<string, RegionAllotment<string>> {
  const out = new Map<string, RegionAllotment<string>>();
  for (const [region, v] of candidate) out.set(region, { region, axis: v.axis, px: px(v.px) });
  return out;
}

describe('step-1/L2b CI gate (report-only): every mounted geometry produces a FeasibleLayout or a non-empty refused, never undefined/throw', () => {
  // Dispatch L2b: the runtime overlay is wired into the STANDARD sweep's
  // own demands (this file's header, "Dispatch L2b addendum") — every
  // row below now reflects `tree`'s own live content demand, not step 1's
  // synthesized `null`.
  const landscapeDemands = measuredFromLytProgram(LYT_LANDSCAPE, TREE_LIVE_CONTENT_OVERLAY);
  const portraitDemands = measuredFromLytProgram(LYT_PORTRAIT, TREE_LIVE_CONTENT_OVERLAY);

  for (const widthPx of LANDSCAPE_SWEEP_WIDTHS_PX) {
    const heightPx = LANDSCAPE_SWEEP_HEIGHT_PX;
    const label = `landscape ${widthPx}x${heightPx}`;
    it(label, () => {
      const candidate = computeLandscapeCandidate({ widthPx, heightPx });
      const result = FeasibleLayout.validate(landscapeDemands, toAllotmentMap(candidate), 'landscape', {
        widthPx: px(widthPx),
        heightPx: px(heightPx),
      });
      // The meta-property, and ONLY the meta-property (report-only mode,
      // spec §4's step-1 risk row) — never `diagnostics.length === 0`.
      expect(result === undefined).toBe(false);
      const diagnostics = 'refused' in result ? result.refused : [];
      CENSUS.push({ label, screenClassId: 'landscape', widthPx, heightPx, diagnostics });
    });
  }

  for (const { wPx, hPx } of PORTRAIT_SWEEP_SIZES_PX) {
    const label = `portrait ${wPx}x${hPx}`;
    it(label, () => {
      const candidate = computePortraitCandidate({ widthPx: wPx, heightPx: hPx });
      const result = FeasibleLayout.validate(portraitDemands, toAllotmentMap(candidate), 'portrait', {
        widthPx: px(wPx),
        heightPx: px(hPx),
      });
      expect(result === undefined).toBe(false);
      const diagnostics = 'refused' in result ? result.refused : [];
      CENSUS.push({ label, screenClassId: 'portrait', widthPx: wPx, heightPx: hPx, diagnostics });
    });
  }

  it('emits the full diagnostic census — the evidence base for step 3\'s triage', () => {
    // Runs last within this describe (Vitest preserves declaration order
    // for `it` within one file/describe by default) so every sweep
    // geometry above has already populated CENSUS.
    expect(CENSUS.length).toBe(LANDSCAPE_SWEEP_WIDTHS_PX.length + PORTRAIT_SWEEP_SIZES_PX.length);
    const totalDiagnostics = CENSUS.reduce((sum, e) => sum + e.diagnostics.length, 0);
    // eslint-disable-next-line no-console -- deliberate: this IS the report-only gate's evidence output, per this file's header.
    console.info(
      '\n=== FeasibleLayout step-1 diagnostic census ===\n' +
        CENSUS.map((e) => {
          if (e.diagnostics.length === 0) return `${e.label}: (no diagnostics)`;
          const lines = e.diagnostics.map(
            (d) => `    ${d.kind.toUpperCase().padEnd(8)} ${d.region} (${d.axis}): demand=${d.demandPx}px granted=${d.grantedPx}px`,
          );
          return `${e.label}:\n${lines.join('\n')}`;
        }).join('\n') +
        `\n=== ${totalDiagnostics} diagnostics across ${CENSUS.length} geometries ===\n`,
    );
    // "if your census is empty, suspect your adapter before trusting it"
    // (dispatch brief) — this is the assertion that census is honest.
    expect(totalDiagnostics).toBeGreaterThan(0);
  });
});

describe('honest limits of the step-1 census (disclosed, not silently absent) — RETIRED claim, dispatch L2b', () => {
  it('WITHOUT the overlay, still produces no hoarding diagnostic for `tree` — step 1\'s own byte-identical baseline preserved', () => {
    // The claim this describe used to make ("tree can never hoard") is no
    // longer true of the STANDARD sweep above (which now wires
    // `TREE_LIVE_CONTENT_OVERLAY`) — this test instead pins the byte-
    // identical PRESERVATION half of `measuredFromLytProgram`'s own
    // contract (this file's header, "adapter-overlay tests ... absent
    // overlay preserves L1 behavior byte-identically"): called with NO
    // overlay argument (the default empty map), the adapter's output is
    // unchanged from step 1's own design.
    const landscapeDemandsNoOverlay = measuredFromLytProgram(LYT_LANDSCAPE);
    const treeDemand = landscapeDemandsNoOverlay.find((d) => d.region === 'tree');
    expect(treeDemand?.maxUseful).toBeNull();

    for (const widthPx of LANDSCAPE_SWEEP_WIDTHS_PX) {
      const candidate = computeLandscapeCandidate({ widthPx, heightPx: LANDSCAPE_SWEEP_HEIGHT_PX });
      const result = FeasibleLayout.validate(landscapeDemandsNoOverlay, toAllotmentMap(candidate), 'landscape', {
        widthPx: px(widthPx),
        heightPx: px(LANDSCAPE_SWEEP_HEIGHT_PX),
      });
      const diagnostics = 'refused' in result ? result.refused : [];
      expect(diagnostics.some((d) => d.region === 'tree' && d.kind === 'hoarding')).toBe(false);
    }
  });

  it('dispatch L2b: WITH the overlay wired, `tree` DOES now produce a hoarding diagnostic at wide landscape widths', () => {
    // The direct counterpart of the retired claim above — proves the
    // overlay mechanism is genuinely load-bearing in the STANDARD sweep's
    // own demands (`landscapeDemands`, built with the overlay at this
    // file's top-level `describe` above), not merely constructible in
    // isolation. `tree`'s numeric candidate under `computeLandscapeCandidate`
    // grows well past 60px once `controlPanel` stops competing for the
    // same row's leftover (>= 1600px landscape, this file's own census) —
    // every one of those widths must show `tree` hoarding against its own
    // live 60px content demand.
    const landscapeDemandsWithOverlay = measuredFromLytProgram(LYT_LANDSCAPE, TREE_LIVE_CONTENT_OVERLAY);
    const treeDemand = landscapeDemandsWithOverlay.find((d) => d.region === 'tree');
    expect(treeDemand?.maxUseful).toBe(TREE_EFFECTIVE_MAX_USEFUL_LANDSCAPE_PX);

    let hoardingCount = 0;
    for (const widthPx of LANDSCAPE_SWEEP_WIDTHS_PX) {
      const candidate = computeLandscapeCandidate({ widthPx, heightPx: LANDSCAPE_SWEEP_HEIGHT_PX });
      const result = FeasibleLayout.validate(landscapeDemandsWithOverlay, toAllotmentMap(candidate), 'landscape', {
        widthPx: px(widthPx),
        heightPx: px(LANDSCAPE_SWEEP_HEIGHT_PX),
      });
      const diagnostics = 'refused' in result ? result.refused : [];
      if (diagnostics.some((d) => d.region === 'tree' && d.kind === 'hoarding')) hoardingCount += 1;
    }
    expect(hoardingCount).toBeGreaterThan(0);
  });

  it('produces a starved-controlPanel diagnostic at a narrow landscape width, honoring the compiled demote threshold', () => {
    // 1280px is well under the compiled 778px side-column demote threshold
    // (`clampTreeWidthForSideColumn`'s own header: 664+110+4=778) at the
    // review's own s12 height (1000px) — controlPanel resolves absent,
    // fed to validate() at its literal 0px candidate (this file's header).
    const landscapeDemands = measuredFromLytProgram(LYT_LANDSCAPE);
    const candidate = computeLandscapeCandidate({ widthPx: 1280, heightPx: LANDSCAPE_SWEEP_HEIGHT_PX });
    expect(candidate.get('controlPanel')?.px).toBe(0);
    const result = FeasibleLayout.validate(landscapeDemands, toAllotmentMap(candidate), 'landscape', {
      widthPx: px(1280),
      heightPx: px(LANDSCAPE_SWEEP_HEIGHT_PX),
    });
    expect('refused' in result).toBe(true);
    if ('refused' in result) {
      expect(result.refused.some((d) => d.region === 'controlPanel' && d.kind === 'starved')).toBe(true);
    }
  });

  it('portrait\'s controlPanel starves at every sweep size — presenceDefaultVisible: false is unconditional, not merely width-gated', () => {
    const portraitDemands = measuredFromLytProgram(LYT_PORTRAIT);
    for (const { wPx, hPx } of PORTRAIT_SWEEP_SIZES_PX) {
      const candidate = computePortraitCandidate({ widthPx: wPx, heightPx: hPx });
      expect(candidate.get('controlPanel')?.px).toBe(0);
      const result = FeasibleLayout.validate(portraitDemands, toAllotmentMap(candidate), 'portrait', {
        widthPx: px(wPx),
        heightPx: px(hPx),
      });
      expect('refused' in result).toBe(true);
    }
  });
});

describe('dispatch L2b: the flagship starved+hoarding PAIR, review-witnessed candidate at 1920x1080', () => {
  it('the review\'s own canonical instance, reproduced via the REAL adapter + overlay at the review\'s own witnessed geometry', () => {
    // This file's own header ("Dispatch L2b addendum") discloses WHY this
    // one test does not reuse `computeLandscapeCandidate`'s own numeric
    // solver for `tree`/`controlPanel`: that solver's own `board-priority-
    // clamp` formula saturates at its compiled `maxPx` (820) for every
    // height up to ~1140px at width 1920, so `controlPanel` never demotes
    // in THIS derivation at width 1920 — a disclosed gap L1's own report
    // already named. `demands` below IS the real adapter's own output
    // (`measuredFromLytProgram` + the real overlay mechanism, §3 step 2's
    // own deliverable); only `tree`'s and `controlPanel`'s own CANDIDATE
    // entries are the review's own witnessed live-DOM numbers
    // (`lyt-final-opus-review.md` §Class 1: "at 1920 [the tree panel is]
    // 613 px and [the control panel is] absent") — every OTHER region's
    // candidate still comes from the numeric solver, unmodified.
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, TREE_LIVE_CONTENT_OVERLAY);
    const solverCandidate = computeLandscapeCandidate({ widthPx: 1920, heightPx: 1080 });
    const candidate = new Map(solverCandidate);
    candidate.set('tree', { axis: 'h', px: 613 }); // review-witnessed
    candidate.set('controlPanel', { axis: 'h', px: 0 }); // review-witnessed (absent)

    const result = FeasibleLayout.validate(demands, toAllotmentMap(candidate), 'landscape', {
      widthPx: px(1920),
      heightPx: px(1080),
    });
    expect('refused' in result).toBe(true);
    if (!('refused' in result)) return;
    const byRegion = new Map(result.refused.map((d) => [d.region, d]));
    expect(byRegion.get('tree')).toMatchObject({ kind: 'hoarding', demandPx: TREE_EFFECTIVE_MAX_USEFUL_LANDSCAPE_PX, grantedPx: 613 });
    expect(byRegion.get('controlPanel')).toMatchObject({ kind: 'starved', demandPx: 664, grantedPx: 0 });

    // Acceptance-evidence census line, printed alongside the standard
    // sweep's own census (this file's "emits the full diagnostic census"
    // test, above) — not folded into that SAME array (a hand-fed
    // candidate for two of its regions is a materially different
    // methodology, disclosed by keeping it a visibly separate block
    // rather than silently merged into the solver-derived rows).
    // eslint-disable-next-line no-console -- deliberate: acceptance-evidence output, dispatch L2b.
    console.info(
      '\n=== dispatch L2b flagship pair (review-witnessed candidate) ===\n' +
        'landscape 1920x1080 (review-witnessed tree/controlPanel candidate):\n' +
        result.refused
          .map((d) => `    ${d.kind.toUpperCase().padEnd(8)} ${d.region} (${d.axis}): demand=${d.demandPx}px granted=${d.grantedPx}px`)
          .join('\n') +
        '\n',
    );
  });
});

describe('measuredFromLytProgram — adapter-level assertions the census depends on', () => {
  it('excludes board aspect-coupled leaves (B, previewBoard) from both compiled programs', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      const demands = measuredFromLytProgram(program);
      expect(demands.some((d) => d.region === 'B')).toBe(false);
      expect(demands.some((d) => d.region === 'previewBoard')).toBe(false);
    }
  });

  it('excludes untracked Exclusive-tab leaves/blackboxes (CP-library, CP-cards, CP-analysis)', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      const demands = measuredFromLytProgram(program);
      expect(demands.some((d) => d.region === 'CP-library')).toBe(false);
      expect(demands.some((d) => d.region === 'CP-cards')).toBe(false);
      expect(demands.some((d) => d.region === 'CP-analysis')).toBe(false);
    }
  });

  it('DOES reach nested-split leaves reached through an Exclusive tab (settingsSubstrip, SP_session, otherColorDebug, otherBand)', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      const demands = measuredFromLytProgram(program);
      const regions = new Set(demands.map((d) => d.region));
      expect(regions.has('settingsSubstrip')).toBe(true);
      expect(regions.has('SP_session')).toBe(true);
      expect(regions.has('otherColorDebug')).toBe(true);
      expect(regions.has('otherBand')).toBe(true);
    }
  });

  it('synthesizes preferred = min for every entry (ratified fork default, ledger row 2447)', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      for (const d of measuredFromLytProgram(program)) {
        expect(d.preferred).toBe(d.min);
      }
    }
  });

  it('gives controlPanel a fixed min=preferred=maxUseful=664 in both classes', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      const controlPanel = measuredFromLytProgram(program).find((d) => d.region === 'controlPanel');
      expect(controlPanel).toBeDefined();
      expect(controlPanel).toMatchObject({ min: 664, preferred: 664, maxUseful: 664 });
    }
  });

  it('every Measured entry is internally well-formed (constructible via measured(), by construction)', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      for (const d of measuredFromLytProgram(program)) {
        expect(() => measured(d)).not.toThrow();
      }
    }
  });
});

describe('measuredFromLytProgram — dispatch L2b, the runtime overlay', () => {
  it('an absent overlay argument preserves L1\'s own output byte-identically (the default parameter value)', () => {
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      expect(measuredFromLytProgram(program)).toEqual(measuredFromLytProgram(program, new Map()));
    }
  });

  it('an overlay entry for a region NOT present in the program is simply never consulted (no crash, no phantom entry)', () => {
    const overlay = new Map<string, Px | null>([['not-a-real-widget-id', px(999)]]);
    expect(() => measuredFromLytProgram(LYT_LANDSCAPE, overlay)).not.toThrow();
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, overlay);
    expect(demands.some((d) => d.region === 'not-a-real-widget-id')).toBe(false);
  });

  it('supersedes a synthesized-null maxUseful with the overlay\'s own live reading', () => {
    // A reading ABOVE tree's own compiled min (110), so this test isolates
    // plain supersession from the separate "clamped up to min" behavior
    // (its own dedicated test below).
    const overlay = new Map<string, Px | null>([['tree', px(300)]]);
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, overlay);
    const tree = demands.find((d) => d.region === 'tree');
    expect(tree?.maxUseful).toBe(300);
  });

  it('never supersedes a REAL compiled ceiling — a fixed-track region\'s maxUseful is untouched even when overlaid', () => {
    // controlPanel is `{ kind: 'fixed', px: 664 }` — its adapter-synthesized
    // maxUseful is ALREADY 664 (non-null), so "runtime demands supersede
    // build-time NULLS" (this module's own header) must not apply here.
    const overlay = new Map<string, Px | null>([['controlPanel', px(50)]]);
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, overlay);
    const controlPanel = demands.find((d) => d.region === 'controlPanel');
    expect(controlPanel?.maxUseful).toBe(664); // untouched — the overlay's 50 is discarded
  });

  it('a null overlay entry for a region also leaves the synthesized null exactly as step 1 produced it', () => {
    const overlay = new Map<string, Px | null>([['tree', null]]); // "not yet measured" — a legitimate overlay state
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, overlay);
    const tree = demands.find((d) => d.region === 'tree');
    expect(tree?.maxUseful).toBeNull();
  });

  it('clamps a live reading BELOW the region\'s own compiled floor up to that floor — maxUseful never drops below min', () => {
    // tree's own compiled floor is minPx: 110 (elastic{minPx:110}) — a live
    // content reading of 40px must not produce maxUseful=40 (which would
    // violate measured()'s own min<=maxUseful invariant); this module's
    // own header explains why max(min, overlayPx) is the correct
    // engineering choice, not an arbitrary clamp.
    const overlay = new Map<string, Px | null>([['tree', px(40)]]);
    const demands = measuredFromLytProgram(LYT_LANDSCAPE, overlay);
    const tree = demands.find((d) => d.region === 'tree');
    expect(tree?.min).toBe(110);
    expect(tree?.maxUseful).toBe(110); // clamped up to min, not the raw 40
    expect(() => measured(tree!)).not.toThrow(); // the invariant holds
  });

  it('applies identically in the portrait program (both classes, per the dispatch\'s own "both classes" scope)', () => {
    const demands = measuredFromLytProgram(LYT_PORTRAIT, TREE_LIVE_CONTENT_OVERLAY);
    const tree = demands.find((d) => d.region === 'tree');
    // Portrait's own compiled tree min is 140 (vs landscape's 110) — the
    // raw 60px overlay reading clamps up to THAT floor here, per the
    // TREE_LIVE_CONTENT_OVERLAY constant's own doc above.
    expect(tree?.maxUseful).toBe(TREE_EFFECTIVE_MAX_USEFUL_PORTRAIT_PX);
  });

  it('every overlaid entry remains internally well-formed (constructible via measured())', () => {
    const overlay = new Map<string, Px | null>([
      ['tree', px(60)],
      ['A_engine_queue', px(9999)], // an elastic, currently-null-maxUseful region — also eligible
    ]);
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      for (const d of measuredFromLytProgram(program, overlay)) {
        expect(() => measured(d)).not.toThrow();
      }
    }
  });
});

// ── Dispatch L3 addendum (§3 step 3, ledger rows 2447/2450/2460/2461):
//    resolveSideColumnLiveLayout — the live-solve regression oracle ─────
//
// The dispatch's own gate 4: "for the review's own witnessed geometries,
// the new trackList-derived allotments must (a) never starve a region
// the old path didn't, and (b) fix the flagship: at 1920x1080 fresh, the
// control panel must be PRESENT (not demoted) with the tree capped at
// its content demand." This describe block runs `resolveSideColumnLiveLayout`
// (`state/feasible-layout.ts`, dispatch L3) at every geometry the
// standard sweep above already exercises, side by side with THIS file's
// own pre-existing `computeLandscapeCandidate` numeric solver (the "old
// path" — the same numeric evaluation of `useLytTrackCss.ts`'s own
// formulas the standard census above already uses as its oracle), and
// prints the per-geometry allotment table the build report's own
// centerpiece reproduces.
//
// `sideColumnWidthPx` is re-derived via the SAME root-row solve
// `computeLandscapeCandidate` already performs internally (that function
// does not expose it) — a disclosed, minimal duplication of three lines
// of already-proven math, not a second derivation of a DIFFERENT fact.
// Scoped to LANDSCAPE only: portrait has no side-column concept (this
// file's own header, "no side column concept in portrait") — its tree/
// controlPanel/previewBoard row's own container is `viewport.widthPx`
// directly, and portrait's `controlPanel` resolves absent by DEFAULT
// (`presenceDefaultVisible: false`, not merely width-gated — the "honest
// limits" describe block above already pins this), so the sovereignty
// completion this dispatch ships has no live scenario to exercise there.
function computeLandscapeSideColumnWidthPx(viewport: Viewport): number {
  const root = LYT_LANDSCAPE.root;
  const [boardRailChild, boardAreaChild, sideColumnChild] = root.children;
  const rootRow: RowEntry[] = [
    { widget: 'boardRail', track: boardRailChild.track, visible: boardRailChild.presenceDefaultVisible },
    { widget: 'boardArea', track: boardAreaChild.track, visible: true },
    { widget: 'sideColumn', track: sideColumnChild.track, visible: true },
  ];
  const [, , sideColumnPx] = solveRowTracks(rootRow, viewport.widthPx, root.gapPx, viewport);
  return sideColumnPx;
}

interface SideColumnRowFacts {
  readonly treeTrack: LytTrackShape;
  readonly controlPanelTrack: LytTrackShape;
  readonly controlPanelDemote: LytDemotion | null;
  readonly previewBoardTrack: LytTrackShape;
  readonly gapPx: number;
}

/** Navigates to the SAME `treeRow` h-split `computeLandscapeCandidate`
 *  already navigates to internally (its own doc comment names the shape:
 *  `[tree(elastic), controlPanel(fixed664, demote), previewBoard(fixed160,
 *  off)]`) — extracted here so the L3 live-solve tests below don't
 *  re-derive a candidate at all, only the STATIC track/demote facts
 *  `resolveSideColumnLiveLayout` itself needs. */
function extractLandscapeSideColumnRowFacts(): SideColumnRowFacts {
  const root = LYT_LANDSCAPE.root;
  const sideColumnChild = root.children[2];
  if (sideColumnChild.node.kind !== 'split') throw new Error('extractLandscapeSideColumnRowFacts: sideColumn is not a split.');
  const sideColumnSplit = sideColumnChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const treeRowChild = sideColumnSplit.children[3];
  if (treeRowChild.node.kind !== 'split') throw new Error('extractLandscapeSideColumnRowFacts: treeRow is not a split.');
  const treeRowSplit = treeRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [treeChild, controlPanelChild, previewBoardChild] = treeRowSplit.children;
  const controlPanelDemote = controlPanelChild.node.kind === 'exclusive' ? controlPanelChild.node.demote : null;
  return {
    treeTrack: treeChild.track,
    controlPanelTrack: controlPanelChild.track,
    controlPanelDemote,
    previewBoardTrack: previewBoardChild.track,
    gapPx: treeRowSplit.gapPx,
  };
}

interface LiveAllotmentRow {
  readonly label: string;
  readonly wrapperWidthPx: number;
  readonly treePx: number;
  readonly controlPanelPresent: boolean;
  readonly controlPanelPx: number;
  readonly oldTreePx: number;
  readonly oldControlPanelPx: number;
}

const LIVE_ALLOTMENT_TABLE: LiveAllotmentRow[] = [];

describe('dispatch L3: resolveSideColumnLiveLayout — live-solve regression oracle', () => {
  const facts = extractLandscapeSideColumnRowFacts();
  const others: readonly SideColumnFixedRegion[] = [
    { widgetId: 'controlPanel', track: facts.controlPanelTrack, desiredVisible: true, demote: facts.controlPanelDemote },
    { widgetId: 'previewBoard', track: facts.previewBoardTrack, desiredVisible: false, demote: null },
  ];
  // The review's own witnessed content-demand reading (this file's own
  // `TREE_LIVE_CONTENT_OVERLAY`, `px(60)`), floored at tree's own
  // compiled min — the SAME clamp `measuredFromLytProgram`'s overlay
  // mechanism applies (this file's header, "Dispatch L2b addendum").
  const treeMaxUsefulPx = px(Math.max(facts.treeTrack.kind === 'elastic' ? facts.treeTrack.minPx : 0, 60));

  for (const widthPx of LANDSCAPE_SWEEP_WIDTHS_PX) {
    const heightPx = LANDSCAPE_SWEEP_HEIGHT_PX;
    const label = `landscape ${widthPx}x${heightPx}`;
    it(`${label}: never starves a region the old (numeric-solver) path granted`, () => {
      const wrapperWidthPx = computeLandscapeSideColumnWidthPx({ widthPx, heightPx });
      const oldCandidate = computeLandscapeCandidate({ widthPx, heightPx });
      const oldTreePx = oldCandidate.get('tree')?.px ?? 0;
      const oldControlPanelPx = oldCandidate.get('controlPanel')?.px ?? 0;

      const live = resolveSideColumnLiveLayout({
        wrapperWidthPx,
        gapPx: facts.gapPx,
        tree: { track: facts.treeTrack, maxUsefulPx: treeMaxUsefulPx },
        treeSovereignPx: undefined, // fresh-boot, un-dragged — matches this file's own s12 methodology
        treeDefaultPx: 0, // unused: wrapperWidthPx > 0 at every real sweep geometry
        others,
        screenClassId: 'landscape',
      });
      const controlPanelOutcome = live.others.find((o) => o.widgetId === 'controlPanel')!;

      LIVE_ALLOTMENT_TABLE.push({
        label,
        wrapperWidthPx,
        treePx: live.treePx,
        controlPanelPresent: controlPanelOutcome.present,
        controlPanelPx: controlPanelOutcome.candidatePx,
        oldTreePx,
        oldControlPanelPx,
      });

      // Gate (a): never starve a region the old path didn't. The old
      // path's own `controlPanel` candidate is either its full 664px
      // (present) or 0 (demoted-absent) — the live solve's own
      // `controlPanel` never grants LESS than the old path did, in this
      // UN-DRAGGED (non-sovereign) scenario (sovereignty's "shrink below
      // floor" behavior applies ONLY to a sovereign drag — see the
      // dedicated sovereignty describe block below).
      expect(controlPanelOutcome.candidatePx).toBeGreaterThanOrEqual(oldControlPanelPx);
      // The old path never granted `tree` less than its own compiled
      // floor either — same non-regression bound.
      expect(live.treePx).toBeGreaterThanOrEqual(facts.treeTrack.kind === 'elastic' ? facts.treeTrack.minPx : 0);
    });
  }

  it('flagship (b): at 1920x1080 fresh, controlPanel is PRESENT and tree is capped at its own content demand', () => {
    const wrapperWidthPx = computeLandscapeSideColumnWidthPx({ widthPx: 1920, heightPx: 1080 });
    const live = resolveSideColumnLiveLayout({
      wrapperWidthPx,
      gapPx: facts.gapPx,
      tree: { track: facts.treeTrack, maxUsefulPx: treeMaxUsefulPx },
      treeSovereignPx: undefined,
      treeDefaultPx: 0,
      others,
      screenClassId: 'landscape',
    });
    const controlPanelOutcome = live.others.find((o) => o.widgetId === 'controlPanel')!;
    expect(controlPanelOutcome.present).toBe(true);
    expect(controlPanelOutcome.candidatePx).toBe(664);
    // Capped at content demand (110, tree's own compiled floor — the
    // 60px raw reading floors up to it, per treeMaxUsefulPx's own
    // derivation above), never the "claim the whole freed row" hoarding
    // the review's own 613px witness recorded.
    expect(live.treePx).toBe(treeMaxUsefulPx);
    expect(live.treePx).toBeLessThan(613);
  });

  it('prints the per-geometry allotment table (build-report centerpiece)', () => {
    expect(LIVE_ALLOTMENT_TABLE.length).toBe(LANDSCAPE_SWEEP_WIDTHS_PX.length);
    // eslint-disable-next-line no-console -- deliberate: this IS the build report's own allotment-table evidence.
    console.info(
      '\n=== dispatch L3 per-geometry allotment table (landscape, un-dragged) ===\n' +
        'geometry            wrapperPx  tree(new/old)      controlPanel(new/old)\n' +
        LIVE_ALLOTMENT_TABLE.map(
          (r) =>
            `${r.label.padEnd(20)} ${String(r.wrapperWidthPx).padStart(9)}  ` +
            `${String(r.treePx).padStart(4)}/${String(r.oldTreePx).padStart(4)}          ` +
            `${(r.controlPanelPresent ? 'present' : 'absent').padEnd(7)} ${String(r.controlPanelPx).padStart(4)}/${String(r.oldControlPanelPx).padStart(4)}`,
        ).join('\n') +
        '\n',
    );
  });
});

describe('dispatch L3: sovereignty — WITNESSED trace (drag override -> unclamped track -> diagnostic)', () => {
  const facts = extractLandscapeSideColumnRowFacts();
  const others: readonly SideColumnFixedRegion[] = [
    { widgetId: 'controlPanel', track: facts.controlPanelTrack, desiredVisible: true, demote: facts.controlPanelDemote },
    { widgetId: 'previewBoard', track: facts.previewBoardTrack, desiredVisible: false, demote: null },
  ];

  it('the commissioner\'s ~640px control-panel drag floor is GONE: a sovereign drag shrinks controlPanel below its 664px floor, diagnosed not resisted', () => {
    const wrapperWidthPx = computeLandscapeSideColumnWidthPx({ widthPx: 1920, heightPx: 1080 });
    // WITNESSED trace, step 1: the drag event. `startResizeInner`'s own
    // sovereignty fix (`useResizablePanel.ts`) removes the
    // CONTROL_PANEL_MIN_WIDTH_PX reservation from the drag's own ceiling
    // — the user CAN drag the tree panel to claim (nearly) the whole
    // wrapper. Simulated here as the resulting stored fact,
    // `session.ui.treePanelWidthPx`, a drag would produce.
    const draggedTreePx = wrapperWidthPx - facts.gapPx - 40; // leaves controlPanel only 40px — starved

    // WITNESSED trace, step 2: the override. `treeSovereignPx` below is
    // exactly `store.session.ui.treePanelWidthPx` post-drag.
    const live = resolveSideColumnLiveLayout({
      wrapperWidthPx,
      gapPx: facts.gapPx,
      tree: { track: facts.treeTrack, maxUsefulPx: px(110) },
      treeSovereignPx: draggedTreePx,
      treeDefaultPx: 0,
      others,
      screenClassId: 'landscape',
    });

    // WITNESSED trace, step 3: the unclamped track. `tree` renders the
    // dragged value VERBATIM — no resistance, even though it is far past
    // `tree`'s own compiled floor/ceiling (sovereignty, §1.6).
    expect(live.treePx).toBe(draggedTreePx);
    const controlPanelOutcome = live.others.find((o) => o.widgetId === 'controlPanel')!;
    expect(controlPanelOutcome.present).toBe(true); // never demoted to absent by a drag
    expect(controlPanelOutcome.candidatePx).toBe(40); // genuinely shrunk BELOW its 664px floor
    expect(controlPanelOutcome.candidatePx).toBeLessThan(664);

    // WITNESSED trace, step 4: the diagnostic. Never a silent clamp,
    // never a silent starvation — `useSideColumnLiveLayout.ts`'s own
    // watcher pushes this THROUGH `pushSystemMessage` in the live app;
    // this test pins the diagnostic's own shape, the fact the push watch
    // reads.
    expect(live.diagnostics).toHaveLength(1);
    const [diagnostic] = live.diagnostics;
    expect(diagnostic.location).toBe('tree');
    expect(diagnostic.starved).toHaveLength(1);
    expect(diagnostic.starved[0]).toMatchObject({ kind: 'starved', region: 'controlPanel', demandPx: 664, grantedPx: 40 });
    expect(diagnostic.message).toBe('Your geometry modification no longer permits controlPanel to render.');
  });

  it('a sovereign drag that leaves every sibling satisfied produces NO diagnostic (the common case)', () => {
    const wrapperWidthPx = computeLandscapeSideColumnWidthPx({ widthPx: 1920, heightPx: 1080 });
    // wrapperWidthPx at 1920x1080 is 820 (this file's own header note,
    // "Dispatch L2b addendum") — a modest drag leaves controlPanel its
    // full 664px + gap comfortably (820 - 100 - 4 = 716 >= 664).
    const draggedTreePx = 100;
    const live = resolveSideColumnLiveLayout({
      wrapperWidthPx,
      gapPx: facts.gapPx,
      tree: { track: facts.treeTrack, maxUsefulPx: px(110) },
      treeSovereignPx: draggedTreePx,
      treeDefaultPx: 0,
      others,
      screenClassId: 'landscape',
    });
    expect(live.treePx).toBe(draggedTreePx);
    expect(live.diagnostics).toEqual([]);
  });
});
