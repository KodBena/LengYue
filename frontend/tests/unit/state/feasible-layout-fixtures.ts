/**
 * tests/unit/state/feasible-layout-fixtures.ts
 *
 * Shared test-only fixtures for the `feasible-layout` suites — extracted
 * from `feasible-layout-geometry-sweep.test.ts` (dispatch L1/L2b's own
 * numeric track-list solver and dispatch L3's own side-column row-fact
 * extraction) so dispatch L4's purity gate
 * (`feasible-layout-purity.test.ts`, `.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 4, ledger rows 2447/2484) can drive the
 * SAME candidate-generation logic those suites already trust, rather than
 * re-deriving a second copy that could drift (this codebase's own "single
 * home per fact" discipline, spec §2).
 *
 * Deliberately named WITHOUT a `.test.ts` suffix: Vitest only collects
 * `*.test.ts` files as independent suites. A `.test.ts` file imported as a
 * plain module still executes its own top-level `describe()`/`it()` calls
 * at import time, which would register every test in the IMPORTING file's
 * run too — this file holds only the reusable functions/constants, no
 * `describe`/`it` of its own, so it is safe to import from multiple test
 * files without duplicating any suite.
 *
 * The numeric solver's own disclosed scope (candidate derivation is a
 * SIMPLIFICATION of CSS Grid Level 1's own multi-pass algorithm, evaluated
 * against the REAL compiled `LYT_LANDSCAPE`/`LYT_PORTRAIT` programs, not a
 * pixel-exact browser oracle) is unchanged by this extraction — see
 * `feasible-layout-geometry-sweep.test.ts`'s own header for the full
 * disclosure; this file is a verbatim relocation of the code it names, not
 * a rewrite.
 *
 * License: Public Domain (The Unlicense)
 */
import { px, type Px, type RegionAllotment } from '../../../src/state/feasible-layout';
import { LYT_LANDSCAPE } from '../../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../../src/state/lyt-layout-portrait.gen';
import type { LytAxis, LytDemotion, LytNodeData, LytTrackShape } from '../../../src/state/lyt-layout-types';

// ── Dispatch L2b's own runtime overlay fixture (moved verbatim from
//    `feasible-layout-geometry-sweep.test.ts`'s own top-level constants —
//    see that file's header for the review-witnessed provenance of `60`). ──
export const TREE_LIVE_CONTENT_OVERLAY: ReadonlyMap<string, Px | null> = new Map([['tree', px(60)]]);
export const TREE_EFFECTIVE_MAX_USEFUL_LANDSCAPE_PX = 110;
export const TREE_EFFECTIVE_MAX_USEFUL_PORTRAIT_PX = 140;

/** Verbatim relocation of `resolveWidthConditionalPresence`'s own
 *  width-vs-threshold check, with the (always-empty, in this sweep) sibling
 *  reservation parameter dropped — see the geometry-sweep file's own
 *  historical-note comment for why dropping it changes nothing this
 *  derivation computes. */
export function resolveDemotedPresenceForSweep(
  measuredWidthPx: number,
  demote: LytDemotion | null,
  desiredVisible: boolean,
): boolean {
  if (demote === null) return desiredVisible;
  if (measuredWidthPx <= 0) return desiredVisible;
  return measuredWidthPx >= demote.belowPx ? desiredVisible : false;
}

export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

interface RowEntry {
  readonly widget: string;
  readonly track: LytTrackShape;
  readonly visible: boolean;
}

/** Numeric evaluation of `useLytTrackCss.ts`'s own per-kind CSS formulas —
 *  see this file's header disclosure. Returns one resolved px per entry,
 *  in the SAME order as `entries`; invisible entries always resolve to 0
 *  and never consume a gap. */
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

export type CandidateMap = Map<string, { readonly axis: LytAxis; readonly px: number }>;

function setCandidate(map: CandidateMap, widget: string, axis: LytAxis, valuePx: number): void {
  map.set(widget, { axis, px: Math.max(0, valuePx) });
}

export function toAllotmentMap(candidate: CandidateMap): ReadonlyMap<string, RegionAllotment<string>> {
  const out = new Map<string, RegionAllotment<string>>();
  for (const [region, v] of candidate) out.set(region, { region, axis: v.axis, px: px(v.px) });
  return out;
}

/** `LYT_LANDSCAPE`'s own tree shape — see `feasible-layout-geometry-
 *  sweep.test.ts`'s own header for the full per-node shape disclosure.
 *  Specific to today's known landscape encoding shape, not a generic
 *  LytProgram interpreter. */
export function computeLandscapeCandidate(viewport: Viewport): CandidateMap {
  const candidate: CandidateMap = new Map();
  const root = LYT_LANDSCAPE.root; // axis 'h', gapPx 12
  const [boardRailChild, boardAreaChild, sideColumnChild] = root.children;

  const rootRow: RowEntry[] = [
    { widget: 'boardRail', track: boardRailChild.track, visible: boardRailChild.presenceDefaultVisible },
    { widget: 'boardArea', track: boardAreaChild.track, visible: true },
    { widget: 'sideColumn', track: sideColumnChild.track, visible: true },
  ];
  const [, , sideColumnPx] = solveRowTracks(rootRow, viewport.widthPx, root.gapPx, viewport);

  if (boardRailChild.presenceDefaultVisible) setCandidate(candidate, 'boardRail', 'h', boardRailChild.track.kind === 'fixed' ? boardRailChild.track.px : 0);
  else setCandidate(candidate, 'boardRail', 'h', 0);

  if (sideColumnChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: sideColumn node is not a split — encoding shape changed, this derivation needs updating.');
  const sideColumnSplit = sideColumnChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [engineRowChild, appChild, setupChild, treeRowChild] = sideColumnSplit.children;

  const appVisible = resolveDemotedPresenceForSweep(sideColumnPx, appChild.node.kind === 'leaf' ? appChild.node.demote : null, appChild.presenceDefaultVisible);
  setCandidate(candidate, 'A_app', 'v', appVisible && appChild.track.kind === 'fixed' ? appChild.track.px : 0);
  setCandidate(candidate, 'A_setup', 'v', 0);

  const sideColumnRow: RowEntry[] = [
    { widget: 'engineRow', track: engineRowChild.track, visible: true },
    { widget: 'A_app', track: appChild.track, visible: appVisible },
    { widget: 'A_setup', track: setupChild.track, visible: false },
    { widget: 'treeRow', track: treeRowChild.track, visible: true },
  ];
  solveRowTracks(sideColumnRow, sideColumnPx, sideColumnSplit.gapPx, viewport);

  if (engineRowChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: engineRow node is not a split — encoding shape changed.');
  const engineRowSplit = engineRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const engineRow: RowEntry[] = engineRowSplit.children.map((c) => ({
    widget: c.node.kind === 'leaf' ? c.node.widget : c.path,
    track: c.track,
    visible: c.presenceDefaultVisible,
  }));
  const engineResolved = solveRowTracks(engineRow, sideColumnPx, engineRowSplit.gapPx, viewport);
  engineRow.forEach((e, i) => setCandidate(candidate, e.widget, 'h', engineResolved[i]));

  if (treeRowChild.node.kind !== 'split') throw new Error('computeLandscapeCandidate: treeRow node is not a split — encoding shape changed.');
  const treeRowSplit = treeRowChild.node as Extract<LytNodeData, { kind: 'split' }>;
  const [treeChild, controlPanelChild, previewBoardChild] = treeRowSplit.children;
  const controlPanelDemote = controlPanelChild.node.kind === 'exclusive' ? controlPanelChild.node.demote : null;
  const controlPanelVisible = resolveDemotedPresenceForSweep(sideColumnPx, controlPanelDemote, controlPanelChild.presenceDefaultVisible);
  const treeRow: RowEntry[] = [
    { widget: 'tree', track: treeChild.track, visible: true },
    { widget: 'controlPanel', track: controlPanelChild.track, visible: controlPanelVisible },
    { widget: 'previewBoard', track: previewBoardChild.track, visible: false },
  ];
  const treeResolved = solveRowTracks(treeRow, sideColumnPx, treeRowSplit.gapPx, viewport);
  setCandidate(candidate, 'tree', 'h', treeResolved[0]);
  setCandidate(candidate, 'controlPanel', 'h', treeResolved[1]);

  return candidate;
}

/** `LYT_PORTRAIT`'s own tree shape — see `feasible-layout-geometry-
 *  sweep.test.ts`'s own header for the full per-node shape disclosure. */
export function computePortraitCandidate(viewport: Viewport): CandidateMap {
  const candidate: CandidateMap = new Map();
  const root = LYT_PORTRAIT.root; // axis 'v', gapPx 12
  const [boardRailChild, appChild, setupChild, boardChild, engineRowChild, treeRowChild] = root.children;

  const appDemote = appChild.node.kind === 'leaf' ? appChild.node.demote : null;
  const appVisible = resolveDemotedPresenceForSweep(viewport.widthPx, appDemote, appChild.presenceDefaultVisible);

  const rootColumn: RowEntry[] = [
    { widget: 'boardRail', track: boardRailChild.track, visible: boardRailChild.presenceDefaultVisible },
    { widget: 'A_app', track: appChild.track, visible: appVisible },
    { widget: 'A_setup', track: setupChild.track, visible: false },
    { widget: 'boardComposite', track: boardChild.track, visible: true },
    { widget: 'engineRow', track: engineRowChild.track, visible: true },
    { widget: 'treeRow', track: treeRowChild.track, visible: true },
  ];
  solveRowTracks(rootColumn, viewport.heightPx, root.gapPx, viewport);

  setCandidate(candidate, 'boardRail', 'v', 0);
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

export interface SideColumnRowFacts {
  readonly treeTrack: LytTrackShape;
  readonly controlPanelTrack: LytTrackShape;
  readonly controlPanelDemote: LytDemotion | null;
  readonly previewBoardTrack: LytTrackShape;
  readonly gapPx: number;
}

/** Re-derives `sideColumn`'s own live width via the SAME root-row solve
 *  `computeLandscapeCandidate` performs internally (that function does not
 *  expose it) — a disclosed, minimal duplication of three lines of
 *  already-proven math, not a second derivation of a DIFFERENT fact.
 *  Scoped to LANDSCAPE only — portrait has no side-column concept (see
 *  `feasible-layout-geometry-sweep.test.ts`'s own header). */
export function computeLandscapeSideColumnWidthPx(viewport: Viewport): number {
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

/** Navigates to the SAME `treeRow` h-split `computeLandscapeCandidate`
 *  already navigates to internally — extracted so `resolveSideColumnLive
 *  Layout` callers don't re-derive a full candidate, only the STATIC
 *  track/demote facts that function itself needs. */
export function extractLandscapeSideColumnRowFacts(): SideColumnRowFacts {
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
