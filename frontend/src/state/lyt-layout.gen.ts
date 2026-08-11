/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_layout_tree.py
 * Source encoding: research/lyt/encodings/lengyue_landscape.lyt (layout `lengyue-landscape`)
 * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — consumed at runtime by LytNode.vue, which realizes each Split as a live CSS Grid container (roadmap S3, 'layout as data, not template').
 * Disclosed simplification (both classes): the Exclusive (T) control-panel node is collapsed to a single 'blackbox' leaf (widget id 'controlPanel') rather than expanded into its five CP-* grid children — see this tool's own module docstring.
 * Data-shape types (LytProgram, LytTrackShape, etc.) are NOT declared here — see './lyt-layout-types.ts' (hand-written, ADR-0012 one-home-per-fact), re-exported below.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration landscape
 *
 * Public Domain (The Unlicense), matching research/lyt/__init__.py's
 * license line and the umbrella's ADR-0006 per-file convention.
 */

import type { LytProgram } from './lyt-layout-types';

export type {
  LytAxis,
  LytDomain,
  LytFacet,
  LytLeafNode,
  LytBlackboxNode,
  LytTrackShape,
  LytSplitNode,
  LytNodeData,
  LytChild,
  LytProgram,
} from './lyt-layout-types';

export const LYT_LANDSCAPE: LytProgram = {
  classId: "landscape",
  root: {
    kind: "split", axis: "h", gapPx: 12,
    children: [
      {
        path: "0",
        presenceDefaultVisible: false,
        track: { kind: "fixed", px: 168 },
        node: { kind: "leaf", widget: "boardRail", domain: "common", facets: ["action", "info"], aspect: null },
      },
      {
        path: "1",
        presenceDefaultVisible: true,
        track: { kind: "elastic", minPx: 0, frWeight: 1 },
        node: {
          kind: "split", axis: "v", gapPx: 0,
          children: [
            {
              path: "1.0",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 0, frWeight: 1 },
              node: { kind: "leaf", widget: "B", domain: "board", facets: [], aspect: 1 },
            },
            {
              path: "1.1",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 24 },
              node: { kind: "leaf", widget: "I_board", domain: "board", facets: ["info"], aspect: null },
            },
            {
              path: "1.2",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 28 },
              node: { kind: "leaf", widget: "A_board", domain: "board", facets: ["action"], aspect: null },
            },
          ],
        },
      },
      {
        path: "2",
        presenceDefaultVisible: true,
        track: { kind: "board-priority-clamp", minPx: 480, maxPx: 820, naturalBoardCrossUnit: "vh", fixedSiblingSumPx: 52, parentGapPx: 12 },
        node: {
          kind: "split", axis: "v", gapPx: 4,
          children: [
            {
              path: "2.0",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 128 },
              node: { kind: "leaf", widget: "A_go", domain: "go", facets: ["action"], aspect: null },
            },
            {
              path: "2.1",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 128 },
              node: { kind: "leaf", widget: "I_engine", domain: "common", facets: ["info"], aspect: null },
            },
            {
              path: "2.2",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 128 },
              node: { kind: "leaf", widget: "A_common", domain: "common", facets: ["action"], aspect: null },
            },
            {
              path: "2.3",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 0, frWeight: 1 },
              node: {
                kind: "split", axis: "h", gapPx: 4,
                children: [
                  {
                    path: "2.3.0",
                    presenceDefaultVisible: true,
                    track: { kind: "fixed", px: 140 },
                    node: { kind: "leaf", widget: "tree", domain: "board", facets: ["action", "info"], aspect: null },
                  },
                  {
                    path: "2.3.1",
                    presenceDefaultVisible: true,
                    track: { kind: "elastic", minPx: 300, frWeight: 1 },
                    node: { kind: "blackbox", widget: "controlPanel", tag: "BLACK BOX", childWidgets: ["CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other"] },
                  },
                  {
                    path: "2.3.2",
                    presenceDefaultVisible: false,
                    track: { kind: "fixed", px: 160 },
                    node: { kind: "leaf", widget: "previewBoard", domain: "common", facets: ["info"], aspect: 1 },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
};
