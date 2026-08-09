/**
 * src/state/layout-model.ts
 *
 * Resolution-roadmap Phases 0+1 (audit findings R1/R2/R6). The type this
 * module mints — `LayoutClass` — is the missing ADR-0000 abstraction the
 * audit's cross-cutting findings all trace back to: panel geometry was
 * scattered as hand-picked pixel literals across `useResizablePanel.ts`
 * and `ForestDirectory.vue`, each independently "derived" from a fact
 * (tab count, content floor) that lived somewhere else entirely, so the
 * literal and its source could silently drift apart — R2's root cause
 * (`CONTROL_PANEL_MIN_WIDTH_PX` hand-written as 220px for "4 tabs" long
 * after a fifth tab shipped).
 *
 * `LayoutClass` is a discriminated projection of measured workspace
 * geometry:
 *
 *   - `axis: 'row' | 'column'` — which way the board/tree/control triad
 *     lays out. `'row'` (today's only shape) puts tree+control beside
 *     the board; `'column'` (Phase 1's new consumer, App.vue) puts them
 *     BELOW it, full width — the Sabaki/OGS shape for a
 *     taller-than-wide window (half-screen tiles, portrait monitors).
 *     Derived from aspect ratio alone (`deriveAxis`), never from a
 *     fixed viewport-width breakpoint — a 900×1400 half-tile and a
 *     2400×3600 portrait monitor both want the same axis despite wildly
 *     different absolute widths.
 *   - `width: 'compact' | 'standard' | 'wide' | 'vast'` — a coarse
 *     absolute-width class, independent of axis, for panel-geometry
 *     policy that genuinely varies with available room rather than with
 *     the row/column question alone.
 *
 * All panel-geometry policy this module's callers used to hand-pick as
 * standalone literals — floors, unset/never-dragged defaults, measure
 * caps — is DECLARED DATA here, keyed by `LayoutClass` via
 * `getPanelGeometryPolicy` / `PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS`, so
 * a consumer reads the model instead of carrying its own pixel
 * constants (ADR-0000: type-driven design; ADR-0012: one home per
 * fact). Today's four width-class entries are byte-identical — no
 * width-class-specific tuning has been commissioned yet — but the
 * table is the single home future tuning lands in, not a lookup that
 * happens to always return the same row.
 *
 * `CONTROL_PANEL_MIN_WIDTH_PX` (R2's own defect) is no longer a literal
 * at all: `computeControlPanelMinWidthPx` projects it from
 * `CONTROL_PANEL_TAB_IDS`'s length, so a sixth tab (or a longer-locale
 * label pushing the per-tab estimate) moves the floor by construction,
 * not by someone remembering to bump a comment. `FOREST_NARROW_THRESHOLD_PX`
 * (ForestDirectory.vue's iter-17 container-query threshold, 479px) is
 * re-derived the same way, from the content facts App.vue's own comment
 * named it against (`FOREST_LEFT_PANEL_NATURAL_WIDTH_PX` +
 * `FOREST_TREE_USABLE_FLOOR_PX`) — those two facts are ForestDirectory's
 * OWN internal Decks/Browse split, not `CONTROL_PANEL_MIN_WIDTH_PX`
 * itself (the two thresholds are only *documentation*-coupled today,
 * per App.vue's pre-existing comment; this module gives the 479
 * threshold its own named, testable derivation instead of a bare
 * literal, closing that half of the drift risk regardless).
 *
 * `useDeferredLayoutClass` is Phase 1's reactive entry point: it derives
 * `LayoutClass` from a workspace root's live width/height (fed by the
 * caller's own already-existing `ResizeObserver` — App.vue reuses
 * `useResizablePanel.ts`'s `#split-workspace` measurement rather than
 * standing up a second observer on the same element, ADR-0010's
 * imperative-escape discipline: one observer per measured element). The
 * axis is a DISCRETE reorganization (`flex-direction: row` has no
 * continuous analog to `column`), so it gets the same treatment
 * `useDeferredContainerBreakpoint.ts` already established for the
 * Cards-tab narrow-stack flip: hysteresis around the aspect-ratio
 * threshold so a ratio sitting right at ~0.9 doesn't flap, and the
 * commit frozen for the whole duration of `isAnyPanelResizing` so an
 * axis flip never fires mid-drag superimposed on a resizer gesture.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, watch, type Ref } from 'vue';

// ── LayoutClass: the discriminated type ──────────────────────────────

export type LayoutAxis = 'row' | 'column';
export type LayoutWidthClass = 'compact' | 'standard' | 'wide' | 'vast';

export interface LayoutClass {
  axis: LayoutAxis;
  width: LayoutWidthClass;
}

// magic-literal, spec-given: "flip to 'column' below ~0.9 width/height"
// (task charter). The board+panels stack vertically once the window is
// noticeably taller than it is wide.
export const AXIS_ASPECT_RATIO_THRESHOLD = 0.9;

// assumption (not spec-given): hysteresis band around the aspect-ratio
// threshold, same role as useDeferredContainerBreakpoint's 24px band
// but in ratio units — small enough to stay visually near ~0.9, large
// enough that a live-resized window sitting within a few px of the
// boundary doesn't flap the axis every other ResizeObserver callback.
export const AXIS_ASPECT_RATIO_HYSTERESIS = 0.08;

/**
 * Pure axis derivation — no hysteresis (that's `useDeferredLayoutClass`'s
 * job, since hysteresis needs the PREVIOUS committed axis as state).
 * Non-finite or non-positive geometry (not yet measured) defaults to
 * `'row'` — today's only shape — rather than guessing.
 */
export function deriveAxis(widthPx: number, heightPx: number): LayoutAxis {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    return 'row';
  }
  return widthPx / heightPx < AXIS_ASPECT_RATIO_THRESHOLD ? 'column' : 'row';
}

// assumption (not spec-given): absolute-width class breakpoints. The
// charter names the four class labels but not their boundaries; these
// mirror the common compact/standard/wide/vast bands (phone-ish,
// laptop-ish, desktop-ish, ultra-wide-or-multi-monitor-ish) with no
// per-class panel-geometry tuning commissioned yet — see
// `PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS`'s own doc.
export const WIDTH_CLASS_MAX_PX: Record<'compact' | 'standard' | 'wide', number> = {
  compact: 768,
  standard: 1280,
  wide: 1920,
};

export function deriveWidthClass(widthPx: number): LayoutWidthClass {
  if (!Number.isFinite(widthPx) || widthPx <= WIDTH_CLASS_MAX_PX.compact) return 'compact';
  if (widthPx <= WIDTH_CLASS_MAX_PX.standard) return 'standard';
  if (widthPx <= WIDTH_CLASS_MAX_PX.wide) return 'wide';
  return 'vast';
}

export function deriveLayoutClass(widthPx: number, heightPx: number): LayoutClass {
  return { axis: deriveAxis(widthPx, heightPx), width: deriveWidthClass(widthPx) };
}

// ── Control-panel tab registry → floor projection (audit finding R2) ──

/**
 * The control panel's tab strip (App.vue `controlTabs`) — SINGLE HOME
 * for the id list. App.vue builds its labelled `Tab[]` by mapping this
 * array through i18n; `computeControlPanelMinWidthPx` below projects
 * the SAME array's length into the floor, so the two can never drift
 * apart the way the hand-written 220px literal (audit finding R2) did
 * against a tab strip that had already grown to five.
 */
export const CONTROL_PANEL_TAB_IDS = ['library', 'cards', 'settings', 'analysis', 'other'] as const;
export type ControlPanelTabId = (typeof CONTROL_PANEL_TAB_IDS)[number];

// assumption (not spec-given): per-tab natural width + strip gap
// allowance, reverse-derived from the PRE-existing 220px literal's own
// comment ("4 tabs × ~50px each + gaps"): 4 × 50 + 20 = 220. Kept as
// the two declared facts that literal was already claiming to be made
// of, rather than inventing new numbers — a tab strip of any other
// count now projects consistently through the same formula.
export const TAB_STRIP_PER_TAB_WIDTH_PX = 50;
export const TAB_STRIP_GAP_PX = 20;

export function computeControlPanelMinWidthPx(tabCount: number): number {
  return tabCount * TAB_STRIP_PER_TAB_WIDTH_PX + TAB_STRIP_GAP_PX;
}

// ── Panel geometry policy: declared data keyed by LayoutClass ─────────

export interface PanelGeometryPolicy {
  /** `useResizablePanel.ts`'s `MIN_BOARD_PX` — the board's own floor. */
  minBoardPx: number;
  /** `TREE_PANEL_MIN_WIDTH_PX` — the tree panel's drag-floor. */
  treePanelMinWidthPx: number;
  /** `#vue-tree-panel`'s natural (never-dragged) default width. */
  treePanelDefaultWidthPx: number;
  /** `CONTROL_PANEL_MIN_WIDTH_PX` — projected from the tab registry. */
  controlPanelMinWidthPx: number;
  /** Each resizer bar's own rendered width (`.panel-resizer`). */
  resizerWidthPx: number;
  /** `WRAPPER_MIN_WIDTH_PX` — derived, not independently chosen: tree
   *  floor + one resizer + control floor. */
  wrapperMinWidthPx: number;
}

const MIN_BOARD_PX = 300;
const TREE_PANEL_MIN_WIDTH_PX = 140;
const TREE_PANEL_DEFAULT_WIDTH_PX = 140;
const RESIZER_WIDTH_PX = 4;
const CONTROL_PANEL_MIN_WIDTH_PX = computeControlPanelMinWidthPx(CONTROL_PANEL_TAB_IDS.length);
const WRAPPER_MIN_WIDTH_PX = TREE_PANEL_MIN_WIDTH_PX + RESIZER_WIDTH_PX + CONTROL_PANEL_MIN_WIDTH_PX;

// Single row-axis policy object — see this module's header for why all
// four width-class entries below currently point at the same object
// rather than four independently-tuned ones.
const ROW_AXIS_PANEL_GEOMETRY_POLICY: PanelGeometryPolicy = {
  minBoardPx: MIN_BOARD_PX,
  treePanelMinWidthPx: TREE_PANEL_MIN_WIDTH_PX,
  treePanelDefaultWidthPx: TREE_PANEL_DEFAULT_WIDTH_PX,
  controlPanelMinWidthPx: CONTROL_PANEL_MIN_WIDTH_PX,
  resizerWidthPx: RESIZER_WIDTH_PX,
  wrapperMinWidthPx: WRAPPER_MIN_WIDTH_PX,
};

export const PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS: Record<LayoutWidthClass, PanelGeometryPolicy> = {
  compact: ROW_AXIS_PANEL_GEOMETRY_POLICY,
  standard: ROW_AXIS_PANEL_GEOMETRY_POLICY,
  wide: ROW_AXIS_PANEL_GEOMETRY_POLICY,
  vast: ROW_AXIS_PANEL_GEOMETRY_POLICY,
};

export function getPanelGeometryPolicy(layoutClass: LayoutClass): PanelGeometryPolicy {
  return PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS[layoutClass.width];
}

// Individual-fact re-exports for callers that only need one floor
// (`useResizablePanel.ts`'s drag math, App.vue's `:style` bindings) —
// same values `getPanelGeometryPolicy(...)` returns, named directly so
// existing call sites don't have to thread a `LayoutClass` through pure
// drag-math functions that have no other use for it.
export {
  MIN_BOARD_PX,
  TREE_PANEL_MIN_WIDTH_PX,
  TREE_PANEL_DEFAULT_WIDTH_PX,
  CONTROL_PANEL_MIN_WIDTH_PX,
  RESIZER_WIDTH_PX,
  WRAPPER_MIN_WIDTH_PX,
};

// ── Panel-content reading measure (Phase 3, audit finding R3) ─────────

/**
 * Genre-convention reading measure (task charter: "~60ch reading
 * measure") — a panel's TEXT content (Library table, Cards forest
 * navigator/metadata) is capped at this width regardless of how much
 * room the panel itself has, so a 4K control panel doesn't stretch a
 * single column of text across 1400px (audit finding R3: "1.7%
 * content"). assumption (not spec-given): the exact multiplier — the
 * charter names the target measure, not a boundary table; 60ch is the
 * conventional prose reading-measure (45-75ch) picked at its middle.
 */
export const PANEL_CONTENT_READING_MEASURE_CH = 60;

export interface PanelContentPolicy {
  /** Max-width cap (in `ch`) applied to a single column of panel text content. */
  readingMeasureCh: number;
  /** Whether panels with a natural two-region layout (Library's
   *  list+preview, Cards' tree+metadata) reflow those regions
   *  side-by-side (true) vs. the narrower stacked/single-column
   *  default (false). */
  twoColumnReflow: boolean;
}

// assumption (not spec-given): the wide/vast cutover for two-column
// reflow reuses the SAME LayoutWidthClass boundary already declared
// above (WIDTH_CLASS_MAX_PX.standard, 1280px) rather than a new,
// independent threshold — one width-classification scheme for the
// whole module (ADR-0012 one-home-per-fact), not two.
const SINGLE_COLUMN_PANEL_CONTENT_POLICY: PanelContentPolicy = {
  readingMeasureCh: PANEL_CONTENT_READING_MEASURE_CH,
  twoColumnReflow: false,
};
const TWO_COLUMN_PANEL_CONTENT_POLICY: PanelContentPolicy = {
  readingMeasureCh: PANEL_CONTENT_READING_MEASURE_CH,
  twoColumnReflow: true,
};

export const PANEL_CONTENT_POLICY_BY_WIDTH_CLASS: Record<LayoutWidthClass, PanelContentPolicy> = {
  compact: SINGLE_COLUMN_PANEL_CONTENT_POLICY,
  standard: SINGLE_COLUMN_PANEL_CONTENT_POLICY,
  wide: TWO_COLUMN_PANEL_CONTENT_POLICY,
  vast: TWO_COLUMN_PANEL_CONTENT_POLICY,
};

export function getPanelContentPolicy(layoutClass: LayoutClass): PanelContentPolicy {
  return PANEL_CONTENT_POLICY_BY_WIDTH_CLASS[layoutClass.width];
}

// ── Tree panel UNSET default (Phase 3, audit finding R5) ───────────────

// assumption (not spec-given): the fraction itself — the charter names
// "a declared fraction of workspace width", not a value. 0.12 keeps a
// compact/standard workspace at its floor (768 * 0.12 ≈ 92px < 140px
// floor) while letting a vast 4K workspace (3840 * 0.12 ≈ 461px) grow
// well past the old fixed 140px (audit finding R5: "stuck at 140px on
// any screen").
export const TREE_PANEL_DEFAULT_WIDTH_FRACTION = 0.12;

/**
 * The tree panel's UNSET (never-dragged) default width — a fraction of
 * the workspace's own live width, floored at `TREE_PANEL_MIN_WIDTH_PX`
 * (the existing drag floor, unchanged). Non-finite/non-positive input
 * (not yet measured) degrades to the floor rather than guessing, same
 * convention as this module's other derive* functions. This is a
 * DEFAULT only — `session.ui.treePanelWidthPx`, once the user drags
 * the INNER bar even once, is the single write channel and this
 * function is never consulted again for that session (ledger row 414's
 * "never grows on content change" rule is untouched: this varies with
 * the WINDOW, once, at render time, not with content).
 */
export function computeTreePanelDefaultWidthPx(workspaceWidthPx: number): number {
  if (!Number.isFinite(workspaceWidthPx) || workspaceWidthPx <= 0) return TREE_PANEL_MIN_WIDTH_PX;
  return Math.max(TREE_PANEL_MIN_WIDTH_PX, Math.round(workspaceWidthPx * TREE_PANEL_DEFAULT_WIDTH_FRACTION));
}

/**
 * `#tree-control-wrapper`'s max-width in its flex-fill (never-dragged
 * OUTER bar) branch — the mechanism that sends R3's surplus back to
 * `#board-column` instead of leaving it as dead space inside an
 * oversized control panel. Mirrors `computeBoardColumnMaxWidthPx`
 * (`useResizablePanel.ts`): freeze the flex-grow item at its actual
 * content need, and let the OTHER flex-grow party in the row
 * (`#board-column`, `flex: 1 1 auto`) absorb what's left — no
 * JS-computed complement, native flexbox redistribution past a frozen
 * item. The cap is expressed as a CSS `calc()` string mixing `px`
 * (the tree default + resizer, both already pixel facts) and `ch` (the
 * reading measure, which only the browser can resolve against the
 * control panel's actual font) — deliberately NOT pre-converted to a
 * single px number in JS, which would need an assumed px-per-ch
 * constant this module has no basis for.
 */
export function computeUnsetWrapperMaxWidthCss(
  treePanelDefaultWidthPx: number,
  resizerWidthPx: number,
  readingMeasureCh: number,
): string {
  return `calc(${treePanelDefaultWidthPx}px + ${resizerWidthPx}px + ${readingMeasureCh}ch)`;
}

// ── ForestDirectory narrow-stack threshold (iter-17, 479px) ───────────

// assumption (not spec-given): reverse-derived from ForestDirectory.vue's
// own pre-existing style comment ("left-panel natural width 280 +
// tree-panel min-width ≈200 = 480") — the two content facts that
// literal was already claiming to be made of.
export const FOREST_LEFT_PANEL_NATURAL_WIDTH_PX = 280;
export const FOREST_TREE_USABLE_FLOOR_PX = 200;

/**
 * `leftPanelWidthPx + treeUsableFloorPx` is the width AT which the
 * side-by-side layout stops fitting; the reorg fires strictly below
 * that sum, hence `- 1`.
 */
export function computeForestNarrowThresholdPx(leftPanelWidthPx: number, treeUsableFloorPx: number): number {
  return leftPanelWidthPx + treeUsableFloorPx - 1;
}

export const FOREST_NARROW_THRESHOLD_PX = computeForestNarrowThresholdPx(
  FOREST_LEFT_PANEL_NATURAL_WIDTH_PX,
  FOREST_TREE_USABLE_FLOOR_PX,
);

// ── Reactive entry point (Phase 1 consumer: App.vue) ───────────────────

/**
 * Derives a hysteresis-and-drag-deferred `LayoutClass` from live
 * width/height refs — App.vue feeds this `useResizablePanel.ts`'s own
 * `#split-workspace` measurement (`rowWidthPx`/`rowHeightPx`) rather
 * than standing up a second `ResizeObserver` on the same element.
 *
 * Mirrors `useDeferredContainerBreakpoint.ts`'s mechanism (see that
 * file's header for the full continuity argument this reuses): the
 * LIVE reading keeps evaluating on every width/height change (with its
 * own hysteresis so it doesn't flap AT the boundary), but the EXPOSED
 * `LayoutClass` is frozen at whatever it was when `isDragging` went
 * true, and commits once, immediately, the instant `isDragging` goes
 * false — so an axis flip (a genuinely discrete CSS reorganization,
 * `flex-direction: row` has no continuous path to `column`) never
 * fires superimposed on an in-flight resizer drag.
 *
 * `isDragging` is optional — a caller with no drag-in-flight concept
 * (e.g. a unit test, or a future non-drag consumer) gets the live
 * reading committed unconditionally.
 */
export function useDeferredLayoutClass(
  widthPx: Ref<number>,
  heightPx: Ref<number>,
  isDragging?: Ref<boolean>,
): Ref<LayoutClass> {
  const committed = ref<LayoutClass>(deriveLayoutClass(widthPx.value, heightPx.value)) as Ref<LayoutClass>;
  let liveAxis: LayoutAxis = committed.value.axis;

  function evaluateAxis(w: number, h: number): LayoutAxis {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'row';
    const ratio = w / h;
    const enterColumnBelow = AXIS_ASPECT_RATIO_THRESHOLD - AXIS_ASPECT_RATIO_HYSTERESIS / 2;
    const exitColumnAbove = AXIS_ASPECT_RATIO_THRESHOLD + AXIS_ASPECT_RATIO_HYSTERESIS / 2;
    const wasColumn = liveAxis === 'column';
    return (wasColumn ? ratio < exitColumnAbove : ratio < enterColumnBelow) ? 'column' : 'row';
  }

  function commitIfIdle() {
    if (isDragging?.value) return; // mid-drag: freeze, per this fn's own header
    committed.value = { axis: liveAxis, width: deriveWidthClass(widthPx.value) };
  }

  watch(
    [widthPx, heightPx],
    ([w, h]) => {
      liveAxis = evaluateAxis(w, h);
      commitIfIdle();
    },
    { immediate: true },
  );

  if (isDragging) {
    // Commits exactly once, immediately, on drag release — the final
    // live reading is never lost, only delayed (mirrors
    // useDeferredContainerBreakpoint's identical watcher).
    watch(isDragging, (dragging) => {
      if (!dragging) commitIfIdle();
    });
  }

  return committed;
}
