/**
 * src/composables/chrome/useLytProgramIndex.ts
 *
 * LYT R1 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`, PART 2 —
 * ADR-0011 Rule 2 trigger, row 2345, "SECOND breakage of App.vue's
 * hand-mirrored path literals"). `App.vue` used to hand-maintain
 * `LYT_DOM_ID_BY_PATH_LANDSCAPE`/`_PORTRAIT` (a literal `path -> DOM id`
 * table) and a literal path ternary inside `lytTrackStyleOverrides` — both
 * addressed the compiled program by its dotted-index PATH, an artifact of
 * encoding structure (child ordering/nesting) that a `.lyt` edit silently
 * renumbers underneath every hand-copied literal (the 2.2->2.3 incident,
 * `lyt-toolbar-reencode-review.md`, and its own regression test,
 * `tests/unit/lyt-path-key-regression.test.ts`, is the first breakage this
 * exact class produced; the M2 stage B2a/B2b `A_setup` insertion produced a
 * SECOND one, row 2345).
 *
 * The fix: derive `widget id -> path` by walking the compiled program ONCE
 * (a leaf/blackbox/exclusive node's own `.widget` field is the STABLE
 * identity `research/lyt/emit_layout_tree.py` never renumbers — only the
 * PATH shifts when a sibling is inserted/removed). Every path-keyed fact
 * `App.vue` needs (the DOM-id map, the resizer-drag override keys) is then
 * derived from this index plus `lytParentPath` (a Split/Exclusive-node's
 * own path, e.g. "the tree/panels ROW", is the PARENT of a leaf it directly
 * contains — a leaf's own path with its last dotted segment removed), never
 * a second hand-typed path string.
 *
 * P2b addendum (LYT presence arc, `.claude/dispatch-reports/lyt-p2b-
 * presence-realization.md`): the walk now also captures
 * `widgetDefaultVisible` — a leaf/blackbox/exclusive widget id's own
 * WRAPPING `LytChild.presenceDefaultVisible` (the fact `LytNode.vue`'s own
 * `isPresent` falls back to when no runtime override is set). Presence
 * consumers OUTSIDE `LytNode.vue` (App.vue's own trigger-visibility
 * gate, `useLytPresenceMenu.ts`'s per-class fallback default) need this
 * SAME class-aware fact without hand-re-deriving it a second time
 * (ADR-0012 P1) — this index is the one home the compiled program's own
 * per-widget default already gets walked into, so a second walk isn't
 * needed. Only a widget wrapped by a SPLIT's own `LytChild` carries this
 * fact (an Exclusive's own children carry no `presenceDefaultVisible` of
 * their own, per `LytExclusiveChild`'s own doc — "only a bare leaf can be
 * named" a release-toggle target does not extend one level deeper into
 * an opened Exclusive's own interior); such a child's widget id has no
 * entry here.
 *
 * Finish-pass wave A addendum (`.claude/dispatch-reports/lyt-wA-width-
 * demotion.md`): the walk now also captures `demoteByWidget` — a
 * blackbox/exclusive widget id's own `@demote` declaration
 * (`LytBlackboxNode.demote`/`LytExclusiveNode.demote`), the same fact
 * `lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts` already carry per P2a
 * but that no consumer read yet (the finish-pass F1/F2-partial gap: the
 * compiled `@demote(h 778px)`/`@demote(h 808px)` on `controlPanel` was
 * data with no runtime evaluator). `App.vue`'s width-conditional
 * demotion reads this the SAME way it already reads `widgetDefaultVisible`
 * off this one index (ADR-0012 P1) rather than a second walk. A leaf's
 * own `demote` (`LytLeafNode.demote`, e.g. `A_app`'s `616px`) is NOT
 * captured here — that field is consumed by a different, already-shipped
 * mechanism (`lyt-capability-registry.ts`'s `LYT_CAPABILITY_REALIZATION.
 * demoted`, not this index) and this wave's scope is the Exclusive/
 * blackbox `controlPanel` case only; widening this index to leaves too is
 * a natural follow-up but not commissioned here.
 *
 * Finish-pass wave A completion pass addendum (2026-08-13 dated section
 * of the same dispatch report): the walk now ALSO captures
 * `trackByWidget` -- a leaf/blackbox/exclusive widget id's own wrapping
 * `LytChild.track` (the SAME per-child field `LytNode.vue`'s own
 * `trackList` already compiles to CSS via `useLytTrackCss.ts`). App.vue's
 * side-column tree clamp (`state/layout-model.ts`'s own
 * `clampTreeWidthForSideColumn`) needs the `controlPanel` Exclusive's own
 * compiled FIXED px and the `tree` leaf's own compiled elastic floor --
 * both already live on the program this index already walks -- rather
 * than re-deriving either from a model-layer estimate (the original
 * wave's own disclosed gap, its report's section 8: it read
 * `CONTROL_PANEL_MIN_WIDTH_PX`, a DIFFERENT, unrelated fact, for this
 * row). Same "only a bare leaf/blackbox/exclusive wrapped by a Split's
 * own `LytChild` carries this" scoping as `widgetDefaultVisible` above --
 * an Exclusive's own children carry no `track` of their own (SPEC.md §2:
 * T children share one rectangle), so such a child's widget id has no
 * entry here either.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytDemotion, LytLeafNode, LytNodeData, LytProgram, LytTrackShape } from '../../state/lyt-layout-types';

export interface LytProgramIndex {
  /** widget id -> the dotted path of the node (leaf, blackbox, or
   *  exclusive) whose own `.widget` equals that id. A Split node carries
   *  no widget id of its own — its path is reached via `lytParentPath` off
   *  one of its DIRECT children's own widget-anchored path instead (see
   *  the module header). */
  readonly widgetPaths: Readonly<Record<string, string>>;
  /** widget id -> the leaf node itself, for `kind: 'leaf'` widgets only —
   *  lets a caller read a leaf-only fact (e.g. `orientation`) without a
   *  second tree walk. A blackbox/exclusive widget id has no entry here. */
  readonly leafNodes: Readonly<Record<string, LytLeafNode>>;
  /** widget id -> that widget's own wrapping `LytChild.presenceDefaultVisible`
   *  (module header, "P2b addendum"). Absent for a widget with no wrapping
   *  Split `LytChild` of its own (an Exclusive child). */
  readonly widgetDefaultVisible: Readonly<Record<string, boolean>>;
  /** widget id -> that blackbox/exclusive widget's own `@demote`
   *  declaration (module header, "Finish-pass wave A addendum"). Absent
   *  for a widget with no `demote` declared, and for leaf widgets (not
   *  walked here — see the header disclosure). */
  readonly demoteByWidget: Readonly<Record<string, LytDemotion>>;
  /** widget id -> that widget's own wrapping `LytChild.track` (module
   *  header, "Finish-pass wave A completion pass addendum"). Absent for a
   *  widget with no wrapping Split `LytChild` of its own (an Exclusive
   *  child) -- same scoping as `widgetDefaultVisible` above. */
  readonly trackByWidget: Readonly<Record<string, LytTrackShape>>;
}

function visit(
  node: LytNodeData,
  path: string,
  widgetPaths: Record<string, string>,
  leafNodes: Record<string, LytLeafNode>,
  widgetDefaultVisible: Record<string, boolean>,
  demoteByWidget: Record<string, LytDemotion>,
  trackByWidget: Record<string, LytTrackShape>,
  presenceDefaultVisible: boolean | undefined,
  track: LytTrackShape | undefined,
): void {
  switch (node.kind) {
    case 'leaf':
      widgetPaths[node.widget] = path;
      leafNodes[node.widget] = node;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      if (track !== undefined) trackByWidget[node.widget] = track;
      return;
    case 'blackbox':
      widgetPaths[node.widget] = path;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      if (node.demote !== null) demoteByWidget[node.widget] = node.demote;
      if (track !== undefined) trackByWidget[node.widget] = track;
      return;
    case 'split':
      for (const child of node.children) {
        visit(
          child.node,
          child.path,
          widgetPaths,
          leafNodes,
          widgetDefaultVisible,
          demoteByWidget,
          trackByWidget,
          child.presenceDefaultVisible,
          child.track,
        );
      }
      return;
    case 'exclusive':
      widgetPaths[node.widget] = path;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      if (node.demote !== null) demoteByWidget[node.widget] = node.demote;
      if (track !== undefined) trackByWidget[node.widget] = track;
      // An Exclusive's own children (`LytExclusiveChild`) carry no
      // `presenceDefaultVisible`/`track` of their own — see this module's
      // header.
      for (const child of node.children) {
        visit(
          child.node,
          child.path,
          widgetPaths,
          leafNodes,
          widgetDefaultVisible,
          demoteByWidget,
          trackByWidget,
          undefined,
          undefined,
        );
      }
      return;
  }
}

/**
 * Walks a compiled `LytProgram` once, building the `widget id -> path` /
 * `widget id -> leaf node` / `widget id -> default-visible` /
 * `widget id -> demote` / `widget id -> track` index every path-keyed
 * App.vue fact derives from. Pure — no Vue reactivity here; a caller
 * wraps it in a `computed` keyed on the active program (see App.vue's
 * `activeLytProgramIndex`).
 */
export function buildLytProgramIndex(program: LytProgram): LytProgramIndex {
  const widgetPaths: Record<string, string> = {};
  const leafNodes: Record<string, LytLeafNode> = {};
  const widgetDefaultVisible: Record<string, boolean> = {};
  const demoteByWidget: Record<string, LytDemotion> = {};
  const trackByWidget: Record<string, LytTrackShape> = {};
  // The root itself is always a Split (`LytProgram.root: LytSplitNode`) and
  // is addressed as '' — the same convention `LYT_DOM_ID_BY_PATH_*`/
  // `LytNode.vue`'s own `path` prop default already use. The root has no
  // wrapping `LytChild` of its own, hence `undefined` for its own
  // `presenceDefaultVisible`/`track` (irrelevant anyway — the root is
  // always a Split, which never populates `widgetDefaultVisible`/
  // `trackByWidget` for itself).
  visit(program.root, '', widgetPaths, leafNodes, widgetDefaultVisible, demoteByWidget, trackByWidget, undefined, undefined);
  return { widgetPaths, leafNodes, widgetDefaultVisible, demoteByWidget, trackByWidget };
}

/**
 * A Split or Exclusive node's own path, derived from any ONE of its direct
 * children's own dotted path (e.g. the tree/panels ROW's path from the
 * `tree` leaf's own path "2.3.0" -> "2.3"). The root's own path ('') has no
 * parent; per `LYT_DOM_ID_BY_PATH_*`'s own prior convention this never
 * needed addressing (no consumer derives the root's parent), so this
 * returns '' unchanged rather than inventing a sentinel for an
 * unaddressed case.
 */
export function lytParentPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '' : path.slice(0, lastDot);
}

/**
 * LYT R1 PART 1 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`):
 * maps a compiled leaf's own physical `LytAxis` ('h'|'v', `research/lyt`'s
 * own concrete-syntax spelling — SPEC.md §16.1) to `TreeWidget.vue`'s own
 * `orientation` prop vocabulary ('horizontal'|'vertical'). A tiny, pure,
 * exported function rather than an inline ternary in App.vue's `<script
 * setup>` so the mapping is unit-testable directly (frontend/CLAUDE.md:
 * "no logic in components").
 */
export function lytOrientationToProp(axis: LytLeafNode['orientation']): 'vertical' | 'horizontal' {
  return axis === 'h' ? 'horizontal' : 'vertical';
}
