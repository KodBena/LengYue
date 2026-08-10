/**
 * src/composables/board/ghost-stone.ts
 * Pure decision logic for the ghost-stone hover preview
 * (wiki2-ghost-stone).
 *
 * The commissioned spec, verbatim: "the simplest and most rudimentary
 * stone placement preview imaginable" — a translucent stone in the
 * side-to-move's color follows the pointer, rendered identically
 * whether the hovered intersection is a legal placement or not (no
 * occupancy check, no suicide/ko check), and never previews a
 * capture. This module is the whole of that decision: whether a
 * ghost stone should be shown, and where/what color. Deliberately it
 * takes no `BoardState` — there is nothing here to gate on legality
 * or occupancy, and that omission IS the "no affordance for board
 * evaluation" requirement, not an oversight.
 *
 * `BoardDisplay.vue` calls this with its own pointer-tracked hover
 * position; `BoardWidget.vue` supplies `enabled` (the
 * `session.ui.showGhostStone` toggle, registry-only — see that
 * field's doc comment in `store/schema.ts`) and `turn`
 * (`BoardState.turn`, the ghost's color) as plain props.
 *
 * License: Public Domain (The Unlicense)
 */
import type { StoneColor } from '../../types';

/** A resolved ghost-stone placement: where, and in what color. */
export interface GhostStone {
  readonly x: number;
  readonly y: number;
  readonly color: StoneColor;
}

/**
 * @param enabled - the `session.ui.showGhostStone` toggle. `false` ⇒
 *   always `null`, regardless of hover state — this is the sole
 *   legality-adjacent gate the feature has, and it's a user
 *   preference, not a board-state check.
 * @param turn - side to move; becomes the ghost's color unconditionally.
 * @param hoverPoint - the pointer's current board-relative
 *   intersection (`null` when off-board or the pointer hasn't
 *   entered the grid).
 */
export function computeGhostStone(
  enabled: boolean,
  turn: StoneColor,
  hoverPoint: { x: number; y: number } | null,
): GhostStone | null {
  if (!enabled || !hoverPoint) return null;
  return { x: hoverPoint.x, y: hoverPoint.y, color: turn };
}
