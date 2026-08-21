/**
 * src/composables/chrome/useLytOverflowCss.ts
 *
 * REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`,
 * work item lyt-realization-exclusive-overflow, item 3, "overflow derives
 * from the program"). Amendment 5 (`research/lyt/SPEC.md` §13) gave the LYT
 * language a typed `scroll <axis>` declaration; this wave's emitter carries
 * it through to the compiled program (`LytLeafNode.scrollAxes`,
 * `state/lyt-layout-types.ts`). This module is the ONE place that turns a
 * leaf's `scrollAxes` into literal CSS overflow — the Vue-runtime analog of
 * `useLytTrackCss.ts`'s `LytTrackShape` -> CSS mapping, no Vue reactivity,
 * a pure `(node) -> style object` function, unit-testable directly.
 *
 * Scope, honestly: only a LEAF's own `scrollAxes` is consulted — a
 * collapsed `blackbox` subtree (this wave's disclosed scope narrowing,
 * `CP-settings`/`CP-analysis`) carries no scroll declaration of its own
 * (Amendment 5's `scroll` key is a `Slot`-level fact this emitter does not
 * yet carry for a collapsed Exclusive's own wrapping slot), so those two
 * mounts keep their PRE-WAVE overflow CSS unchanged (TabWidget's/
 * AnalysisDashboard's own internal `.tab-body`/`.scrollable-content`) — see
 * `lyt-widget-registry.ts`'s own `CP-settings`/`CP-analysis` entries and
 * this wave's delivery report for the full account.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytNodeData } from '../../state/lyt-layout.gen';

export interface LytOverflowStyle {
  overflowX?: 'auto';
  overflowY?: 'auto';
}

/**
 * Derives a leaf cell's `overflow-x`/`overflow-y` from its own declared
 * `scrollAxes` (Amendment 5) — the ONE authority for whether this leaf's
 * cell scrolls, replacing an ancestor's hand-authored blanket `overflow:
 * auto` for the leaves this wave opens (`CP-library`/`CP-cards`/
 * `otherBand`; `otherColorDebug` declares no scroll axis, so this
 * correctly returns `{}` for it — the fixed, designed-height band per L5c's
 * chart-exclusion). Non-leaf nodes (split/exclusive/blackbox) carry no
 * single scrollAxes fact of their own and return `{}` — see this module's
 * own header, "Scope, honestly".
 */
export function leafOverflowStyle(node: LytNodeData): LytOverflowStyle {
  if (node.kind !== 'leaf') return {};
  const style: LytOverflowStyle = {};
  for (const axis of node.scrollAxes) {
    if (axis === 'v') style.overflowY = 'auto';
    else if (axis === 'h') style.overflowX = 'auto';
  }
  return style;
}
