/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_layout_tree.py
 * Source encoding: research/lyt/encodings/lengyue_landscape.lyt (layout `lengyue-landscape`)
 * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — consumed at runtime by LytNode.vue, which realizes each Split as a live CSS Grid container (roadmap S3, 'layout as data, not template').
 * W1 scope (disclosed): landscape class only (portrait is W3); the Exclusive (T) control-panel node is collapsed to a single 'blackbox' leaf (widget id 'controlPanel') rather than expanded into its five CP-* grid children — see this tool's own module docstring.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py
 *
 * Public Domain (The Unlicense), matching research/lyt/__init__.py's
 * license line and the umbrella's ADR-0006 per-file convention.
 */

export type LytAxis = 'h' | 'v';
export type LytDomain = 'go' | 'common' | 'debug' | 'board' | 'chrome' | 'blackbox';
export type LytFacet = 'action' | 'info';

export interface LytLeafNode {
  readonly kind: 'leaf';
  readonly widget: string;
  readonly domain: LytDomain;
  readonly facets: readonly LytFacet[];
  readonly aspect: number | null;
}

/** Collapsed Exclusive (T) node — see file header, 'Exclusive (T) node collapse'. */
export interface LytBlackboxNode {
  readonly kind: 'blackbox';
  readonly widget: string;
  readonly tag: string | null;
  readonly childWidgets: readonly string[];
}

export type LytTrackShape =
  | { readonly kind: 'fixed'; readonly px: number }
  | { readonly kind: 'elastic'; readonly minPx: number; readonly frWeight: number }
  | { readonly kind: 'elastic-capped'; readonly minPx: number; readonly maxPx: number }
  | {
      readonly kind: 'board-priority-clamp';
      readonly minPx: number;
      readonly maxPx: number;
      readonly naturalBoardCrossUnit: 'vh' | 'vw';
      readonly fixedSiblingSumPx: number;
      readonly parentGapPx: number;
    };

export interface LytSplitNode {
  readonly kind: 'split';
  readonly axis: LytAxis;
  readonly gapPx: number;
  readonly children: readonly LytChild[];
}

export type LytNodeData = LytLeafNode | LytBlackboxNode | LytSplitNode;

export interface LytChild {
  /** Dotted child-index path from the program root, e.g. '1.3.2'. */
  readonly path: string;
  /** W1 scope: the only presence fact consumed (no toggle UI this wave). */
  readonly presenceDefaultVisible: boolean;
  readonly track: LytTrackShape;
  readonly node: LytNodeData;
}

export interface LytProgram {
  readonly classId: string;
  readonly root: LytSplitNode;
}

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
