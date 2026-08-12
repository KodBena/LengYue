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
 * License: Public Domain (The Unlicense)
 */
import type { LytLeafNode, LytNodeData, LytProgram } from '../../state/lyt-layout-types';

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
}

function visit(
  node: LytNodeData,
  path: string,
  widgetPaths: Record<string, string>,
  leafNodes: Record<string, LytLeafNode>,
  widgetDefaultVisible: Record<string, boolean>,
  presenceDefaultVisible: boolean | undefined,
): void {
  switch (node.kind) {
    case 'leaf':
      widgetPaths[node.widget] = path;
      leafNodes[node.widget] = node;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      return;
    case 'blackbox':
      widgetPaths[node.widget] = path;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      return;
    case 'split':
      for (const child of node.children) {
        visit(child.node, child.path, widgetPaths, leafNodes, widgetDefaultVisible, child.presenceDefaultVisible);
      }
      return;
    case 'exclusive':
      widgetPaths[node.widget] = path;
      if (presenceDefaultVisible !== undefined) widgetDefaultVisible[node.widget] = presenceDefaultVisible;
      // An Exclusive's own children (`LytExclusiveChild`) carry no
      // `presenceDefaultVisible` of their own — see this module's header.
      for (const child of node.children) {
        visit(child.node, child.path, widgetPaths, leafNodes, widgetDefaultVisible, undefined);
      }
      return;
  }
}

/**
 * Walks a compiled `LytProgram` once, building the `widget id -> path` /
 * `widget id -> leaf node` / `widget id -> default-visible` index every
 * path-keyed App.vue fact derives from. Pure — no Vue reactivity here; a
 * caller wraps it in a `computed` keyed on the active program (see
 * App.vue's `activeLytProgramIndex`).
 */
export function buildLytProgramIndex(program: LytProgram): LytProgramIndex {
  const widgetPaths: Record<string, string> = {};
  const leafNodes: Record<string, LytLeafNode> = {};
  const widgetDefaultVisible: Record<string, boolean> = {};
  // The root itself is always a Split (`LytProgram.root: LytSplitNode`) and
  // is addressed as '' — the same convention `LYT_DOM_ID_BY_PATH_*`/
  // `LytNode.vue`'s own `path` prop default already use. The root has no
  // wrapping `LytChild` of its own, hence `undefined` for its own
  // `presenceDefaultVisible` (irrelevant anyway — the root is always a
  // Split, which never populates `widgetDefaultVisible` for itself).
  visit(program.root, '', widgetPaths, leafNodes, widgetDefaultVisible, undefined);
  return { widgetPaths, leafNodes, widgetDefaultVisible };
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
