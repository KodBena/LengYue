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
/** Amendment 5's content-class axis (research/lyt/SPEC.md §13) — `null`
 *  means the leaf carries no declaration (every leaf as of the boundary
 *  re-homing wave, other than the control-panel region's own leaves). */
export type LytContentClass = 'bounded' | 'designed' | 'unbounded' | null;
/** M2 stage F1 port (ledger row 2311 disposition 2), from the
 *  model-iteration loop experiment's LOOP ITERATION 11 / arc 4 round 4 (L15,
 *  ledger row 2241, branch lyt-model-loop-experiment): how often the task
 *  this screen exists for touches a leaf's content. Closed to two members,
 *  deliberately — the question the language needs answered is "may this
 *  band's members leave under pressure", which is binary. */
export type LytActivityLevel = 'sustained' | 'occasional';
/** M2 stage F1 port, same experiment iteration/row as `LytActivityLevel`: a
 *  leaf's declared demotion threshold. `belowPx` is a MEASUREMENT, not a
 *  breakpoint — for `A_app` it is that cluster's own max-content width
 *  (probed live, width-invariant, rounded up), i.e. the width below which
 *  its vocabulary can no longer stand in one row. */
export interface LytDemotion {
  readonly axis: LytAxis;
  readonly belowPx: number;
}

export interface LytLeafNode {
  readonly kind: 'leaf';
  readonly widget: string;
  readonly domain: LytDomain;
  readonly facets: readonly LytFacet[];
  readonly aspect: number | null;
  /** REALIZATION WAVE (item 3, overflow derivation): the Slot's own
   *  Amendment-5 `scroll <axis>` declaration(s), carried through so a
   *  live-rendered leaf's overflow CSS derives from the program instead of
   *  being hand-authored per component — see
   *  `composables/chrome/useLytOverflowCss.ts`. Empty means "no scroll
   *  declared here", byte-identical to every leaf outside the realized
   *  control-panel region. */
  readonly scrollAxes: readonly LytAxis[];
  /** Amendment 5's content-class declaration (research/lyt/SPEC.md §13) —
   *  see `LytContentClass`'s own doc. */
  readonly content: LytContentClass;
  /** M2 stage F1 port (ledger row 2311 disposition 2), from the experiment's
   *  LOOP ITERATION 9 / arc 4 round 2 (L13, ledger rows
   *  2037/2066/2107/2157/2209/2216): the axes along which this leaf's
   *  OCCUPANT claims whatever extent the reservation is granted (`elastic
   *  h`, law L13 surplus attribution — `research/lyt/loader.py`'s
   *  `_load_elastic_axes` and `research/lyt/wellformed.py`'s
   *  `find_l13_violations`, both already live on mainline's own
   *  `lyt_ast.py`/`loader.py` — this port only exposes the already-loaded
   *  fact to the emitted program, no new parsing). Empty (the default)
   *  means the leaf declares none. */
  readonly elasticAxes: readonly LytAxis[];
  /** M2 stage F1 port, same disposition, from the experiment's LOOP
   *  ITERATION 10 / arc 4 round 3 (L14, ledger rows
   *  2037/2066/2107/2157/2229/2233): the axes along which this leaf's
   *  declared extent is an upper BOUND and its occupancy is its content's
   *  own current demand (`ceiling across`, law L14 demand attribution —
   *  `research/lyt/loader.py`'s `_load_ceiling_axes`). The PER-AXIS form of
   *  the whole-leaf `Sizing.ceiling`/L9 flag — DISCLOSED NARROWING: this
   *  port carries the metadata field only; it does NOT wire a `demand`
   *  track-shape kind into `_track_shape_for_child` (mainline's `.lyt`
   *  encodings never declare the whole-leaf `ceiling` flag today, so that
   *  wiring is out of this port's scope — see the emitter's own module
   *  docstring, 'M2 stage F1 port' section). Empty (the default) means the
   *  leaf declares none. */
  readonly ceilingAxes: readonly LytAxis[];
  /** M2 stage F1 port, same disposition, from the experiment's LOOP
   *  ITERATION 12 / arc 4 round 5 (L16, ledger rows
   *  2037/2066/2107/2157/2268-2275): the leaf's own SMALLEST USABLE extent
   *  per axis (`floor v 257px`, law L16 deficit attribution —
   *  `research/lyt/loader.py`'s `_load_floor_axes`). Empty (the default)
   *  means the leaf declares none. */
  readonly floorAxes: readonly { readonly axis: LytAxis; readonly px: number }[];
  /** M2 stage F1 port, same disposition, from the experiment's LOOP
   *  ITERATION 13 / arc 4 round 6 (L17, ledger rows
   *  2037/2066/2107/2157/2286): what this leaf's own scroll BOUNDARY on an
   *  axis falls on (`edge v item`, law L17 edge attribution —
   *  `research/lyt/loader.py`'s `_load_edge_axes`). Empty (the default)
   *  means the leaf declares none. */
  readonly edgeAxes: readonly {
    readonly axis: LytAxis;
    readonly disposition: 'unit' | 'item' | 'continuous';
  }[];
  /** M2 stage F1 port, from the experiment's METAMODEL WAVE item 1 (ledger
   *  row 2157/2158): the leaf's declared MOUNT ORIENTATION (`orient h|v`,
   *  `research/lyt/loader.py`'s `_load_orientation`). A declared fact of
   *  the encoding, not a CSS accident or a component-local default — a
   *  widget whose realization can lay itself out along either axis (see
   *  `TreeWidget.vue`'s own `orientation` prop) reads which axis to use
   *  from the compiled program. `'v'` is the default (undeclared),
   *  byte-identical to every pre-port leaf and to `TreeWidget`'s own prop
   *  default. Consumption (a widget actually reading this field instead of
   *  its own hardcoded default) is explicitly OUT OF SCOPE for this port —
   *  the field is carried, inert, same as every other field here. */
  readonly orientation: LytAxis;
  /** M2 stage F1 port, from the experiment's LOOP ITERATION 11 / arc 4
   *  round 4 (L15, ledger rows 2037/2066/2107/2157/2241): how often the
   *  task this screen exists for touches this leaf's content (`activity
   *  sustained|occasional`, `research/lyt/loader.py`'s `_load_activity`).
   *  `null` means the encoding has ranked nothing here — read as "no claim
   *  made", never as an implicit `'sustained'`. Mainline's own `.lyt`
   *  encodings already declare this on `A_app` and `A_setup` (both
   *  `activity occasional`) — this port only exposes the already-loaded
   *  fact, which is why it is not uniformly `null`. Verified: `I_metrics`
   *  is NOT a mainline widget (it belongs to the experiment's own separate
   *  four-band toolbar split, out of scope — see `lyt-widget-registry.ts`'s
   *  own header); mainline's engine cluster is `A_engine`, a composite
   *  Split of four leaves with no leaf-level `activity` of its own. */
  readonly activity: LytActivityLevel | null;
  /** M2 stage F1 port, same disposition (L15, same rows): the leaf's
   *  declared DEMOTION — while the band hosting this slot is granted less
   *  than `belowPx` along `axis`, the slot is absent and its content is
   *  re-hosted in the overlay stratum. `null` for every leaf that declares
   *  none. Mainline's own `A_app` leaf already declares `@demote(h
   *  616px)` — this port exposes the already-loaded fact. */
  readonly demote: LytDemotion | null;
  /** M2 stage F1 port, from the experiment's METAMODEL WAVE item 2c (ledger
   *  row 2157/2180/2181): the slot's own declared `envelope` state NAMES
   *  (`research/lyt/lyt_ast.py`'s `Sizing.envelope_states`), sorted. `null`
   *  for a `basis == 'reserved'` leaf (no envelope declared at all).
   *  Consumed by `useLytActivityInvariance.ts`'s L6 checker (ported the
   *  same stage), which compares this set against the widget registry's
   *  own declared `activityStates` column. Verified: mainline's ONE
   *  `envelope: {disconnected, connected}` declaration wraps the `A_engine`
   *  composite's own containing `H(...)` slot, not a bare leaf, so this
   *  leaf-only field reads `null` for every current mainline leaf — the
   *  fact is real (per the widget registry's own L6 doc) but not yet
   *  reachable through a LEAF's own `envelopeStates`, since this port
   *  carries leaf metadata only (no split-node envelope field was named in
   *  the commission's scope). */
  readonly envelopeStates: readonly string[] | null;
}

/** Collapsed Exclusive (T) node — see emit_layout_tree.py's module
 * docstring, 'Exclusive (T) node collapse'. */
export interface LytBlackboxNode {
  readonly kind: 'blackbox';
  readonly widget: string;
  readonly tag: string | null;
  readonly childWidgets: readonly string[];
  /** LYT presence arc P2a (`.claude/dispatch-reports/lyt-p2a-presence-
   *  contract.md`): the collapsed Exclusive's OWN wrapping slot may declare
   *  `@demote(<axis> <belowPx>)` the same way a leaf can (`LytLeafNode.
   *  demote`'s own doc) — e.g. the control-panel `T(...)[BLACK BOX]`'s
   *  `@demote(h 778px)`/`@demote(h 808px)`. Previously silently dropped by
   *  the emitter (a reviewer-confirmed gap); `null` for a blackbox whose
   *  own slot declares no demotion. */
  readonly demote: LytDemotion | null;
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

/** REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
 *  a genuinely-opened Exclusive (T) node — the constructor-total sibling of
 *  `LytBlackboxNode` (a collapsed Exclusive). Every child receives the
 *  IDENTICAL rectangle (SPEC.md §2's T semantics) and exactly one is ever
 *  mounted at a time — `LytNode.vue`'s Exclusive case realizes this as a
 *  tab strip + active body, reusing `TabWidget.vue` (convergence, not a
 *  second tab implementation — ADR-0012 cancer B/E). */
export interface LytExclusiveNode {
  readonly kind: 'exclusive';
  /** Representative widget id, for DOM-id anchoring
   *  (`domIdsByPath`/`LYT_DOM_ID_BY_PATH`) and the widget registry — NOT a
   *  mountable leaf itself (an Exclusive node has no single leaf content of
   *  its own). */
  readonly widget: string;
  readonly tag: string | null;
  /** The tab id (`LytExclusiveChild.tabId`) active when no runtime/persisted
   *  state overrides it. */
  readonly defaultTabId: string;
  readonly children: readonly LytExclusiveChild[];
  /** LYT presence arc P2a: same fact as `LytBlackboxNode.demote` — this
   *  node's OWN wrapping slot's `@demote` declaration, carried through for
   *  a genuinely-opened Exclusive the same way a collapsed one now gets
   *  it. `null` when the slot declares no demotion. */
  readonly demote: LytDemotion | null;
}

/** One tab of an opened Exclusive node. Unlike `LytChild` (a Split child),
 *  an Exclusive child carries no `track`/`presenceDefaultVisible` — every
 *  child shares the SAME rectangle (SPEC.md §2) and tab switching is a
 *  presence concept the encoding doesn't model (SPEC.md §11: "only a bare
 *  leaf can be named" a release-toggle target). */
export interface LytExclusiveChild {
  /** Dotted child-index path from the program root — kept for parity with
   *  `LytChild.path` even though nothing indexes an Exclusive child's own
   *  DOM id by it today (each child's own `node` carries whatever DOM-id
   *  wiring its OWN kind needs). */
  readonly path: string;
  /** Stable tab identity — TabWidget's own `v-model`/slot-name key. Matches
   *  `frontend/src/state/layout-model.ts`'s `CONTROL_PANEL_TAB_IDS` for the
   *  control-panel Exclusive (the one Exclusive this wave opens). */
  readonly tabId: string;
  /** i18n key resolving this tab's label — always `app.tabs.<tabId>` for
   *  the control-panel Exclusive today, carried as an explicit field
   *  (rather than derived client-side from `tabId`) so a future Exclusive
   *  with a different label-key convention needs no LytNode.vue change. */
  readonly tabLabelKey: string;
  readonly node: LytNodeData;
}

export type LytNodeData = LytLeafNode | LytBlackboxNode | LytSplitNode | LytExclusiveNode;

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
