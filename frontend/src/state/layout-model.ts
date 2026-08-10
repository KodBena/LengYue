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

// G10 (opus-uiux-geometry-consult.md, rows 1556/1563): the 50px/tab
// literal above (superseded by this fix) was itself reverse-derived
// from an OLDER hand literal's own comment, not from the tab strip's
// actual rendered content — "wrong currency" per ADR-0000 (a pixel
// guess standing in for a text-content fact). WITNESSED via an
// in-page geometry probe (playwright, `.claude/dispatch-reports/
// geo-d-overflow-build.md`) against the five REAL `CONTROL_PANEL_TAB_IDS`
// labels at their default (English) i18n strings: natural per-tab
// widths (border-box, incl. padding/border) were Library 53.7px,
// Cards 49.0px, Settings 60.4px, Analysis 61.7px, Other 47.0px — sum
// 271.8px, against the OLD floor's 270px (5×50+20). That ~2px deficit
// is exactly what G10 witnessed: the strip's own `overflow-x: auto`
// (TabWidget.vue, audit finding R2) never gets a chance to engage
// before the last tab's trailing pixels are already clipped, because
// the floor sits fractionally BELOW the content it's meant to protect
// rather than above it with any margin.
//
// TAB_STRIP_PER_TAB_WIDTH_PX is the WITNESSED total natural content need
// (271.8px, all five tabs summed) divided back across the tab count and
// rounded up (54.36 -> 56px/tab) — a per-tab AVERAGE, not a per-tab
// dedicated worst-case slot: tabs pack sequentially in one strip, so
// what has to fit is the STRIP's total width, not each tab individually
// out-sizing its own equal share. A uniform per-tab estimate also stays
// consistent with this module's existing `tabCount`-only signature and
// `computeControlPanelMinWidthPx`'s existing monotonic-per-tab-count
// contract (a 6th tab moves the floor by exactly one more slot).
// TAB_STRIP_GAP_PX is unchanged (20px) — it was already a reasonable
// header border/padding allowance, not implicated in G10's ~2px
// deficit. Together the new floor (5x56+20 = 300px) clears the
// witnessed 271.8px need with ~28px of margin: enough for normal font-
// rendering/sub-pixel variance without reopening G10, while staying
// small enough that `WRAPPER_MIN_WIDTH_PX` (below) still leaves
// `MIN_BOARD_PX` its own floor at every viewport width this module's
// own test sweep exercises (768px and up) — a uniform per-tab MAXIMUM
// (e.g. the witnessed 61.7px "Analysis" tab) was tried first and
// rejected: it pushed the floor to 344px, which left less than
// `MIN_BOARD_PX` for the board at a 768px compact viewport once the
// tree panel and both resizers were also accounted for — a real
// conflict between two floors, not a rounding artifact, and the wrong
// one to let win.
export const TAB_STRIP_PER_TAB_WIDTH_PX = 56;
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
// Mirrors App.vue's `.panel-resizer { width: 2px }` (commissioner
// ruling 2026-08-10, narrowed from 4px alongside the max-contrast
// recolor) — the layout model's budget math must count the same
// pixels the CSS actually occupies.
const RESIZER_WIDTH_PX = 2;
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

// ── Wizard prose reading measure (Phase 4, audit finding R7) ──────────

/**
 * Reading-measure cap for the setup wizard's explanation/prose
 * paragraphs (`WizardStep*.vue`'s `.step-description` and sibling
 * hint/settings text) — same vocabulary and rationale as
 * `PANEL_CONTENT_READING_MEASURE_CH` above (a text column stays
 * readable regardless of how wide its container is), declared as its
 * own constant rather than reusing that one because the wizard card
 * is a fixed 640px dialog, not a resizable panel, so its measure was
 * audited and tuned separately (R7: prose was running ~101-107ch/line
 * against the card's full content width). assumption (not
 * spec-given): 68ch — the R7 charter names "~68ch", the conventional
 * reading-measure range's (45-75ch) narrower half, picked to read
 * comfortably inside the 640px card without wasting its width.
 */
export const WIZARD_PROSE_MEASURE_CH = 68;

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

// ── Tree+control WRAPPER unset default (init-vs-drag divergence fix,
//    ledger rows 1505/1510) ─────────────────────────────────────────

// assumption (not spec-given): the combined tree+control wrapper's
// UNSET (never-dragged) default width, as a fraction of the row's own
// live width — same shape as TREE_PANEL_DEFAULT_WIDTH_FRACTION above,
// picked generously enough that a compact/standard workspace clamps to
// its content floor (WRAPPER_MIN_WIDTH_PX, below) while a vast 4K
// workspace (3840 * 0.32 ≈ 1229px) gets a comfortably-sized, still
// content-appropriate, region rather than the bare tab-strip floor.
// Each panel's own TEXT content independently caps itself at
// `PANEL_CONTENT_READING_MEASURE_CH` (LibraryTab.vue, ForestDirectory.vue,
// KnobSlider.vue, RegistryEditor.vue, KnobRegistryEditor.vue all read
// that constant directly for their own inner max-width), so a wrapper
// wider than one reading measure does not stretch a lone text column —
// this default is free to hand the wrapper a comfortable box without
// re-deriving that ch-based cap into an assumed px conversion.
export const TREE_CONTROL_REGION_DEFAULT_WIDTH_FRACTION = 0.32;

/**
 * The tree+control wrapper's UNSET (never-dragged, nothing restored)
 * default width — the ROOT FIX for the init-vs-drag divergence (ledger
 * rows 1505/1510: a wide band of unused space sat to the right of the
 * control panel on first start, and dragging `#resizer-outer` snapped
 * the layout to a correct full-width fit). Diagnosis: the never-dragged
 * branch used to leave `session.ui.treeControlRegionWidthPx`'s
 * projection (`effectiveTreeControlRegionWidthPx`, useResizablePanel.ts)
 * `undefined`, which routed App.vue's `#tree-control-wrapper` into a
 * flex-fill CSS branch capped by `unsetWrapperMaxWidthCss` (content
 * need) WHILE `#board-area` was independently capped by
 * `boardAreaMaxWidthPx` (its own height-bound square) — two
 * INDEPENDENTLY-COMPUTED caps on the row's only two flex-grow parties,
 * each one written assuming the OTHER stays unbounded and absorbs its
 * surplus. When BOTH caps saturate below the row's actual width (any
 * viewport wider than boardHeightCap + wrapperContentCap + one
 * resizer — the common case on a typical wide/short monitor), CSS has
 * no third party to hand the remainder to, and it renders as dead
 * space. Only a DRAG produced the correct fit, because
 * `onMouseMoveOuter` writes an EXPLICIT `treeControlRegionWidthPx`,
 * which (a) takes the wrapper out of the capped flex-fill branch
 * entirely and (b) disables `boardAreaMaxWidthPx` by construction
 * (its own guard: `effectiveTreeControlRegionWidthPx.value !==
 * undefined -> undefined`) — leaving `#board-area` fully uncapped to
 * absorb literally everything the wrapper didn't claim.
 *
 * The fix gives the UNSET case an EXPLICIT width too — this function —
 * so mount, resize, and drag all resolve through the SAME explicit-
 * width branch (`effectiveTreeControlRegionWidthPx !== undefined`) by
 * construction, instead of the mount-only flex-fill/dual-cap branch.
 * `#board-area`'s own cap self-disables the moment this default
 * exists (same guard already in place for the dragged/restored case),
 * so board absorbs the true remainder every time, matching exactly
 * what a settled drag already produced — one home for the fit, not
 * two. See `useResizablePanel.ts`'s `effectiveTreeControlRegionWidthPx`
 * for the call site (only consulted once `raw` is undefined AND the
 * row has been measured; `sanitizeTreeControlRegionWidthPx` — the
 * STORED-value reconciliation — is tried first and wins whenever a
 * stored value exists, per the stored-drag-precedence rule this
 * mirrors from `computeTreePanelBoundWidth`).
 *
 * Clamped the same way `sanitizeTreeControlRegionWidthPx` already
 * clamps a restored value: never below `WRAPPER_MIN_WIDTH_PX` (the
 * wrapper's own content floor) and never above
 * `rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX` (always leaves the
 * board its floor). Non-finite/non-positive input (not yet measured)
 * degrades to `WRAPPER_MIN_WIDTH_PX`, same convention as this module's
 * other derive*() / compute*() functions.
 */
export function computeTreeControlRegionDefaultWidthPx(rowWidthPx: number): number {
  if (!Number.isFinite(rowWidthPx) || rowWidthPx <= 0) return WRAPPER_MIN_WIDTH_PX;
  const naturalWidthPx = Math.round(rowWidthPx * TREE_CONTROL_REGION_DEFAULT_WIDTH_FRACTION);
  const maxRegionWidthPx = Math.max(WRAPPER_MIN_WIDTH_PX, Math.round(rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX));
  return Math.min(Math.max(naturalWidthPx, WRAPPER_MIN_WIDTH_PX), maxRegionWidthPx);
}

/** `computeTreePanelBoundWidth`'s result — a discriminated union rather
 *  than an `undefined`-width sentinel, so a caller can't forget to
 *  branch on `mode` (ADR-0000: type-driven design). `'full'` is the
 *  column-axis case, where `#vue-tree-panel` takes no explicit width
 *  at all (the CSS `.axis-column` rule owns sizing); `'fixed'` always
 *  carries a concrete `widthPx`. */
export type TreePanelBoundWidth = { mode: 'full' } | { mode: 'fixed'; widthPx: number };

/**
 * The tree panel's `:style` WIDTH DECISION, extracted from App.vue's
 * template ternary into a pure function so the stored-drag-precedence
 * property — a user-dragged `treePanelWidthPx` wins VERBATIM over the
 * fraction default, for ANY workspace width, and axis flips never
 * touch it — is witnessable directly rather than only by inspection of
 * the template (review finding, ledger rows 929/926: the property held
 * by construction but had no test). Precedence, in order:
 *
 *   1. `axisColumn` -> `{ mode: 'full' }` — column axis stacks
 *      tree+control full-width below the board (Phase 1); no explicit
 *      width applies regardless of `storedWidthPx`. The stored value
 *      itself is untouched by this branch — it is simply not READ
 *      here, so flipping back to row axis re-reads it unchanged.
 *   2. `storedWidthPx !== undefined` -> `{ mode: 'fixed', widthPx:
 *      storedWidthPx }` — the user's own drag (`session.ui.
 *      treePanelWidthPx`, `useResizablePanel.ts`'s INNER bar, the
 *      pane's ONLY write channel) wins verbatim, byte-for-byte,
 *      independent of `workspaceWidthPx` — a resize event never
 *      recomputes it.
 *   3. Otherwise -> `{ mode: 'fixed', widthPx:
 *      computeTreePanelDefaultWidthPx(workspaceWidthPx) }` — the R5
 *      fraction default.
 */
export function computeTreePanelBoundWidth(input: {
  axisColumn: boolean;
  storedWidthPx: number | undefined;
  workspaceWidthPx: number;
}): TreePanelBoundWidth {
  if (input.axisColumn) return { mode: 'full' };
  if (input.storedWidthPx !== undefined) return { mode: 'fixed', widthPx: input.storedWidthPx };
  return { mode: 'fixed', widthPx: computeTreePanelDefaultWidthPx(input.workspaceWidthPx) };
}

/**
 * `#tree-control-wrapper`'s max-width in its flex-fill (never-dragged
 * OUTER bar) branch — the mechanism that sends R3's surplus back to
 * `#board-area` instead of leaving it as dead space inside an
 * oversized control panel. Mirrors `computeBoardAreaMaxWidthPx`
 * (`useResizablePanel.ts`): freeze the flex-grow item at its actual
 * content need, and let the OTHER flex-grow party in the row
 * (`#board-area`, `flex: 1 1 auto`) absorb what's left — no
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
