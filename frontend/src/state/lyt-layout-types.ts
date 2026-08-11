/**
 * src/state/lyt-layout-types.ts
 *
 * HAND-WRITTEN — not generated, unlike its two siblings
 * (`lyt-layout.gen.ts`, `lyt-layout-portrait.gen.ts`). Those two files
 * used to each declare this exact same block of `LytProgram` types
 * inline (byte-for-byte identical, since both are emitted by the same
 * `research/lyt/emit_layout_tree.py`); this file is the ADR-0012
 * one-home-per-fact extraction (portrait W3 build) — the shared LYT
 * program data shape now has exactly one declaration, and both
 * generated files `export type * from './lyt-layout-types'` to
 * re-publish it under their own existing import path (`import type {
 * LytTrackShape } from '../../state/lyt-layout.gen'` keeps working
 * unchanged for every existing consumer — LytNode.vue,
 * useLytTrackCss.ts, useLytPresenceMenu.ts, lyt-widget-registry.ts,
 * store/defaults.ts, App.vue — none of them needed a single import-path
 * edit for this refactor).
 *
 * Consumed at runtime by `LytNode.vue`, which realizes each `split`
 * node as a live CSS Grid container (roadmap S3, "layout as data, not
 * template"). See `research/lyt/emit_layout_tree.py`'s own module
 * docstring for the full LYT -> CSS Grid mapping this type vocabulary
 * mirrors, and `frontend/src/composables/chrome/useLytTrackCss.ts` for
 * the `LytTrackShape` -> literal-CSS compiler.
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

/** Collapsed Exclusive (T) node — see emit_layout_tree.py's module
 * docstring, 'Exclusive (T) node collapse'. */
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
      /** CASE A (root split axis != board-composite axis, e.g. landscape's
       * H-root / V-composite): caps the ONE non-board elastic+capped
       * sibling of the recognized board-composite shape, so it structurally
       * yields whatever the board's own aspect-locked natural size needs
       * before growing toward its own declared max. See
       * `research/lyt/emit_mockup.py`'s `_board_priority_tracks` docstring
       * (the normative derivation) for the CASE A/B split. */
      readonly kind: 'board-priority-clamp';
      readonly minPx: number;
      readonly maxPx: number;
      readonly naturalBoardCrossUnit: 'vh' | 'vw';
      readonly fixedSiblingSumPx: number;
      readonly parentGapPx: number;
    }
  | {
      /** CASE B (root split axis == board-composite axis, e.g. portrait's
       * V-root / V-composite): caps the board COMPOSITE's OWN track — not
       * a sibling's — at its natural ceiling instead. Unlike CASE A this
       * has no independent min/max: the track is a bare `minmax(0px,
       * natural)`, where `natural = calc(100<naturalCrossUnit> +
       * fixedSiblingSumPx)` (PLUS the fixed-sibling sum, not minus — CASE
       * B's composite is bounded by the FULL cross-viewport extent grown
       * by its own fixed internal siblings, the opposite direction from
       * CASE A's "100% minus the board's claim" sibling clamp). See
       * `_board_priority_tracks`'s CASE B branch for the exact
       * derivation this mirrors. */
      readonly kind: 'board-priority-self-clamp';
      readonly naturalCrossUnit: 'vh' | 'vw';
      readonly fixedSiblingSumPx: number;
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
