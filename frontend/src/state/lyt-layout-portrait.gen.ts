/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_layout_tree.py
 * Source encoding: research/lyt/encodings/lengyue_portrait.lyt (layout `lengyue-portrait`)
 * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — consumed at runtime by LytNode.vue, which realizes each Split as a live CSS Grid container (roadmap S3, 'layout as data, not template').
 * REALIZATION WAVE: the control-panel Exclusive (T) node is now genuinely opened (kind 'exclusive', widget 'controlPanel') for library/cards/settings/other; analysis stays collapsed to a 'blackbox' leaf (CP-analysis) — a disclosed, deliberate scope narrowing (dynamic user-configurable analysis tabs) — see this tool's own module docstring, 'REALIZATION WAVE' and 'SETTINGS OPENED LIVE' sections.
 * M2 STAGE F1 PORT: leaf nodes now carry eight additional realization-layer metadata fields (elasticAxes/ceilingAxes/floorAxes/edgeAxes/orientation/activity/demote/envelopeStates), ported from the model-iteration loop experiment as inert data — no current consumer reads them yet; see this tool's own module docstring, 'M2 STAGE F1 PORT' section, for the disclosed narrowing (unitAxes/wrapPolicy and two track-shape algorithm changes are NOT ported this stage).
 * LYT presence arc P2a: `presenceDefaultVisible` (on every Split child) is now DERIVED per class from `runner.valuation_for_class`'s own resolved presence valuation, not a hand-maintained path table — a class's own portrait/landscape default is a single fact this file mechanically reflects. `demote` is also now carried on 'blackbox'/'exclusive' nodes (previously leaf-only) — see this tool's own module docstring, 'LYT presence arc P2a' section.
 * P2d: the `tree` leaf's `orientation` field is now the GENUINELY DERIVED value (Amendment 9, SPEC.md §17; `orientation.compute_derived_orientations`), not the load-time placeholder default — every OTHER leaf (including the two other residual leaves, `B`/`otherBand`) still reads its own load-time default, a disclosed scope narrowing; see this tool's own module docstring, 'P2d — emit the DERIVED orientation' section, for the full derivation and the disclosed `otherBand` disagreement finding this stage does NOT resolve.
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
        node: { kind: "leaf", widget: "boardRail", domain: "common", facets: ["action", "info"], aspect: null, scrollAxes: [], content: null, elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: "occasional", demote: null, envelopeStates: null },
      },
      {
        path: "1",
        presenceDefaultVisible: true,
        track: { kind: "fixed", px: 56 },
        node: { kind: "leaf", widget: "A_app", domain: "common", facets: ["action"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: "occasional", demote: { axis: "h", belowPx: 616 }, envelopeStates: null },
      },
      {
        path: "2",
        presenceDefaultVisible: false,
        track: { kind: "fixed", px: 92 },
        node: { kind: "leaf", widget: "A_setup", domain: "common", facets: ["action"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: "occasional", demote: null, envelopeStates: null },
      },
      {
        path: "3",
        presenceDefaultVisible: true,
        track: { kind: "board-priority-self-clamp", naturalCrossUnit: "vw", fixedSiblingSumPx: 52 },
        node: {
          kind: "split", axis: "v", gapPx: 0,
          children: [
            {
              path: "3.0",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 0, frWeight: 100 },
              node: { kind: "leaf", widget: "B", domain: "board", facets: [], aspect: 1, scrollAxes: [], content: null, elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
            {
              path: "3.1",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 24 },
              node: { kind: "leaf", widget: "I_board", domain: "board", facets: ["info"], aspect: null, scrollAxes: [], content: null, elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
            {
              path: "3.2",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 28 },
              node: { kind: "leaf", widget: "A_board", domain: "board", facets: ["action"], aspect: null, scrollAxes: [], content: null, elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
          ],
        },
      },
      {
        path: "4",
        presenceDefaultVisible: true,
        track: { kind: "fixed", px: 80 },
        node: {
          kind: "split", axis: "h", gapPx: 4,
          children: [
            {
              path: "4.0",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 185, frWeight: 1 },
              node: { kind: "leaf", widget: "A_engine_controls", domain: "go", facets: ["action"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
            {
              path: "4.1",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 139 },
              node: { kind: "leaf", widget: "A_engine_eval", domain: "go", facets: ["info"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: ["connected-1digit", "connected-2digit", "connected-3digit", "connected-4digit", "connected-5digit", "connected-real"] },
            },
            {
              path: "4.2",
              presenceDefaultVisible: true,
              track: { kind: "fixed", px: 139 },
              node: { kind: "leaf", widget: "A_engine_health", domain: "go", facets: ["info"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: ["connected-1digit", "connected-2digit", "connected-3digit", "connected-4digit", "connected-5digit", "connected-real"] },
            },
            {
              path: "4.3",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 0, frWeight: 1 },
              node: { kind: "leaf", widget: "A_engine_queue", domain: "go", facets: ["info"], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
          ],
        },
      },
      {
        path: "5",
        presenceDefaultVisible: true,
        track: { kind: "elastic", minPx: 140, frWeight: 1 },
        node: {
          kind: "split", axis: "h", gapPx: 4,
          children: [
            {
              path: "5.0",
              presenceDefaultVisible: true,
              track: { kind: "elastic", minPx: 140, frWeight: 1 },
              node: { kind: "leaf", widget: "tree", domain: "board", facets: ["action", "info"], aspect: null, scrollAxes: ["v"], content: "unbounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [{ axis: "v", disposition: "item" }], orientation: "h", activity: null, demote: null, envelopeStates: null },
            },
            {
              path: "5.1",
              presenceDefaultVisible: false,
              track: { kind: "fixed", px: 664 },
              node: {
                kind: "exclusive", widget: "controlPanel", tag: "BLACK BOX", defaultTabId: "library", demote: { axis: "h", belowPx: 808 },
                children: [
                  {
                    path: "5.1.0",
                    tabId: "library",
                    tabLabelKey: "app.tabs.library",
                    content: "unbounded",
                    scrollAxes: ["v"],
                    node: { kind: "leaf", widget: "CP-library", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded", elasticAxes: ["h"], ceilingAxes: [], floorAxes: [{ axis: "v", px: 200 }], edgeAxes: [{ axis: "v", disposition: "unit" }], orientation: "v", activity: null, demote: null, envelopeStates: null },
                  },
                  {
                    path: "5.1.1",
                    tabId: "cards",
                    tabLabelKey: "app.tabs.cards",
                    content: "unbounded",
                    scrollAxes: ["v"],
                    node: { kind: "leaf", widget: "CP-cards", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded", elasticAxes: ["h"], ceilingAxes: [], floorAxes: [{ axis: "v", px: 200 }], edgeAxes: [{ axis: "v", disposition: "unit" }], orientation: "v", activity: null, demote: null, envelopeStates: null },
                  },
                  {
                    path: "5.1.2",
                    tabId: "settings",
                    tabLabelKey: "app.tabs.settings",
                    content: null,
                    scrollAxes: [],
                    node: {
                      kind: "split", axis: "v", gapPx: 4,
                      children: [
                        {
                          path: "5.1.2.0",
                          presenceDefaultVisible: true,
                          track: { kind: "fixed", px: 77 },
                          node: { kind: "leaf", widget: "settingsSubstrip", domain: "common", facets: [], aspect: null, scrollAxes: [], content: "bounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
                        },
                        {
                          path: "5.1.2.1",
                          presenceDefaultVisible: true,
                          track: { kind: "elastic", minPx: 200, frWeight: 1 },
                          node: { kind: "blackbox", widget: "SP_session", tag: null, childWidgets: ["SP_session", "SP_analysisEnv", "SP_cardSets", "SP_advancedRegistry", "SP_analysis", "SP_keybindings"], demote: null, content: "unbounded", scrollAxes: [] },
                        },
                      ],
                    },
                  },
                  {
                    path: "5.1.3",
                    tabId: "analysis",
                    tabLabelKey: "app.tabs.analysis",
                    content: "unbounded",
                    scrollAxes: [],
                    node: { kind: "blackbox", widget: "CP-analysis", tag: null, childWidgets: ["timelineStrip", "AT_basic_interval", "AT_basic_scoreLead", "AT_basic_mergedDelta", "AT_dist_deltaDist", "AT_dist_mistakeGap", "AT_stab_stability", "AT_stab_crossCorr", "AT_multires"], demote: null, content: "unbounded", scrollAxes: [] },
                  },
                  {
                    path: "5.1.4",
                    tabId: "other",
                    tabLabelKey: "app.tabs.other",
                    content: "unbounded",
                    scrollAxes: [],
                    node: {
                      kind: "split", axis: "v", gapPx: 4,
                      children: [
                        {
                          path: "5.1.4.0",
                          presenceDefaultVisible: true,
                          track: { kind: "fixed", px: 264 },
                          node: { kind: "leaf", widget: "otherColorDebug", domain: "debug", facets: [], aspect: null, scrollAxes: [], content: "designed", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
                        },
                        {
                          path: "5.1.4.1",
                          presenceDefaultVisible: true,
                          track: { kind: "elastic", minPx: 200, frWeight: 1 },
                          node: { kind: "leaf", widget: "otherBand", domain: "common", facets: [], aspect: null, scrollAxes: ["v"], content: "unbounded", elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [{ axis: "v", disposition: "continuous" }], orientation: "v", activity: null, demote: null, envelopeStates: null },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              path: "5.2",
              presenceDefaultVisible: false,
              track: { kind: "fixed", px: 96 },
              node: { kind: "leaf", widget: "previewBoard", domain: "common", facets: ["info"], aspect: 1, scrollAxes: [], content: null, elasticAxes: [], ceilingAxes: [], floorAxes: [], edgeAxes: [], orientation: "v", activity: null, demote: null, envelopeStates: null },
            },
          ],
        },
      },
    ],
  },
};
