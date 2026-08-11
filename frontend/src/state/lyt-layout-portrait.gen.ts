/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_layout_tree.py
 * Source encoding: research/lyt/encodings/lengyue_portrait.lyt (layout `lengyue-portrait`)
 * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — consumed at runtime by LytNode.vue, which realizes each Split as a live CSS Grid container (roadmap S3, 'layout as data, not template').
 * REALIZATION WAVE: the control-panel Exclusive (T) node is now genuinely opened (kind 'exclusive', widget 'controlPanel') for library/cards/settings/other; analysis stays collapsed to a 'blackbox' leaf (CP-analysis) — a disclosed, deliberate scope narrowing (dynamic user-configurable analysis tabs) — see this tool's own module docstring, 'REALIZATION WAVE' and 'SETTINGS OPENED LIVE' sections.
 * Data-shape types (LytProgram, LytTrackShape, etc.) are NOT declared here — see './lyt-layout-types.ts' (hand-written, ADR-0012 one-home-per-fact), re-exported below.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration portrait
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
  LytExclusiveNode,
  LytExclusiveChild,
  LytNodeData,
  LytChild,
  LytProgram,
} from './lyt-layout-types';

export const LYT_PORTRAIT: LytProgram = {
  classId: "portrait",
  root: {
    kind: "split", axis: "v", gapPx: 12,
    children: [
      {
        path: "0",
        presenceDefaultVisible: false,
        track: { kind: "fixed", px: 168 },
        node: { kind: "leaf", widget: "boardRail", domain: "common", facets: ["action", "info"], aspect: null, scrollAxes: [], content: null },
      },
      {
        path: "1",
        presenceDefaultVisible: true,
        track: { kind: "fixed", px: 160 },
        node: { kind: "leaf", widget: "A_app", domain: "common", facets: ["action"], aspect: null, scrollAxes: [], content: null },
      },
      {
        path: "2",
        presenceDefaultVisible: true,
        track: { kind: "board-priority-self-clamp", naturalCrossUnit: "vw", fixedSiblingSumPx: 52 },
        node: {
          kind: "split", axis: "v", gapPx: 0,
          children: [
            {
              path: "2.0",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 0, frWeight: 100 },
              node: { kind: "leaf", widget: "B", domain: "board", facets: [], aspect: 1, scrollAxes: [], content: null },
            },
            {
              path: "2.1",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 24 },
              node: { kind: "leaf", widget: "I_board", domain: "board", facets: ["info"], aspect: null, scrollAxes: [], content: null },
            },
            {
              path: "2.2",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 28 },
              node: { kind: "leaf", widget: "A_board", domain: "board", facets: ["action"], aspect: null, scrollAxes: [], content: null },
            },
          ],
        },
      },
      {
        path: "3",
        presenceDefaultVisible: true,
        track: { kind: "fixed", px: 60 },
        node: { kind: "leaf", widget: "A_engine", domain: "go", facets: ["action", "info"], aspect: null, scrollAxes: [], content: null },
      },
      {
        path: "4",
        presenceDefaultVisible: true,
        track: { kind: "elastic", minPx: 0, frWeight: 1 },
        node: {
          kind: "split", axis: "h", gapPx: 4,
          children: [
            {
              path: "4.0",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 140 },
              node: { kind: "leaf", widget: "tree", domain: "board", facets: ["action", "info"], aspect: null, scrollAxes: [], content: null },
            },
            {
              path: "4.1",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 200, frWeight: 1 },
              node: {
                kind: "exclusive", widget: "controlPanel", tag: "BLACK BOX", defaultTabId: "library",
                children: [
                  {
                    path: "4.1.0",
                    tabId: "library",
                    tabLabelKey: "app.tabs.library",
                    node: { kind: "leaf", widget: "CP-library", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded" },
                  },
                  {
                    path: "4.1.1",
                    tabId: "cards",
                    tabLabelKey: "app.tabs.cards",
                    node: { kind: "leaf", widget: "CP-cards", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded" },
                  },
                  {
                    path: "4.1.2",
                    tabId: "settings",
                    tabLabelKey: "app.tabs.settings",
                    node: {
                      kind: "split", axis: "v", gapPx: 4,
                      children: [
                        {
                          path: "4.1.2.0",
                          presenceDefaultVisible: true,
                          track: { kind: "fixed", px: 60 },
                          node: { kind: "leaf", widget: "settingsSubstrip", domain: "common", facets: [], aspect: null, scrollAxes: [], content: "bounded" },
                        },
                        {
                          path: "4.1.2.1",
                          presenceDefaultVisible: true,
                          track: { kind: "elastic", minPx: 200, frWeight: 1 },
                          node: { kind: "leaf", widget: "settingsPane", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded" },
                        },
                      ],
                    },
                  },
                  {
                    path: "4.1.3",
                    tabId: "analysis",
                    tabLabelKey: "app.tabs.analysis",
                    node: { kind: "blackbox", widget: "CP-analysis", tag: null, childWidgets: ["timelineStrip", "AT_basic_interval", "AT_basic_scoreLead", "AT_basic_mergedDelta", "AT_dist_deltaDist", "AT_dist_mistakeGap", "AT_stab_stability", "AT_stab_crossCorr", "AT_multires"] },
                  },
                  {
                    path: "4.1.4",
                    tabId: "other",
                    tabLabelKey: "app.tabs.other",
                    node: {
                      kind: "split", axis: "v", gapPx: 4,
                      children: [
                        {
                          path: "4.1.4.0",
                          presenceDefaultVisible: true,
                          track: { kind: "fixed", px: 264 },
                          node: { kind: "leaf", widget: "otherColorDebug", domain: "debug", facets: [], aspect: null, scrollAxes: [], content: "designed" },
                        },
                        {
                          path: "4.1.4.1",
                          presenceDefaultVisible: true,
                          track: { kind: "elastic", minPx: 200, frWeight: 1 },
                          node: { kind: "leaf", widget: "otherBand", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              path: "4.2",
              presenceDefaultVisible: false,
              track: { kind: "fixed", px: 96 },
              node: { kind: "leaf", widget: "previewBoard", domain: "common", facets: ["info"], aspect: 1, scrollAxes: [], content: null },
            },
          ],
        },
      },
    ],
  },
};
