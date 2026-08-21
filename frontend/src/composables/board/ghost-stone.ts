/**
 * src/composables/board/ghost-stone.ts
 * Pure decision logic for the ghost-stone hover preview
 * (wiki2-ghost-stone; occupancy amendment, ledger row 1635).
 *
 * The commissioned spec, verbatim: "the simplest and most rudimentary
 * stone placement preview imaginable" — a translucent stone in the
 * side-to-move's color follows the pointer, rendered identically
 * whether the hovered intersection is a legal-but-empty placement or
 * a genuinely illegal-but-empty one (no suicide/ko check — that
 * remains true, unamended), and never previews a capture. This
 * module is the whole of that decision: whether a ghost stone should
 * be shown, and where/what color.
 *
 * **Occupancy amendment (row 1635).** The original commission left
 * "visible whether legal or not" ambiguous as to whether it also
 * meant "visible on top of an existing stone" — the commissioner
 * clarified it did not: a preview painted over an occupied point
 * reads as a phantom stone, not a placement affordance, and is
 * corrected here. `isOccupied` is the narrowest input that can
 * express that correction: a same-shaped **occupancy view**, not a
 * `BoardState`. It answers exactly one question — "is this point
 * covered by an existing stone" — and cannot be asked whether a move
 * there would capture, self-atari, or violate ko, because it carries
 * no board topology, no capture logic, and no move history. That is
 * the same purity discipline the module already held for
 * `hoverPoint`/`turn`: an input is admitted only if it cannot answer
 * a *legality* question, and occupancy-of-a-single-point is a
 * visibility fact, not a legality one — an empty point that is
 * suicide or retakes a ko is still occupancy-`false` and still gets
 * a ghost. The predicate shape (rather than a `Set`/`Record` of
 * occupied keys) lets the caller reuse whatever lookup it already
 * built for rendering real stones, with no re-derivation and no new
 * data structure threaded through.
 *
 * `BoardDisplay.vue` calls this with its own pointer-tracked hover
 * position and an `isOccupied` closure over its `stones` prop (the
 * same `Record<string, StoneColor>` it renders real stones from —
 * see the `stoneList`/`toSVG` computed there); `BoardWidget.vue`
 * supplies `enabled` (the `session.ui.showGhostStone` toggle,
 * registry-only — see that field's doc comment in `store/schema.ts`)
 * and `turn` (`BoardState.turn`, the ghost's color) as plain props.
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
 *   always `null`, regardless of hover state — this is a user
 *   preference gate, not a board-state check.
 * @param turn - side to move; becomes the ghost's color unconditionally.
 * @param hoverPoint - the pointer's current board-relative
 *   intersection (`null` when off-board or the pointer hasn't
 *   entered the grid).
 * @param isOccupied - answers "is there already a stone at this
 *   point?" for the hovered intersection only. This is a visibility
 *   gate (row 1635's amendment), not a legality affordance: it
 *   cannot express suicide, ko, or captures, and an empty point that
 *   would be illegal to play still returns `false` here and still
 *   gets a ghost. Callers pass the same occupancy lookup they use to
 *   render real stones — see `BoardDisplay.vue`'s `props.stones`.
 */
export function computeGhostStone(
  enabled: boolean,
  turn: StoneColor,
  hoverPoint: { x: number; y: number } | null,
  isOccupied: (point: { x: number; y: number }) => boolean,
): GhostStone | null {
  if (!enabled || !hoverPoint) return null;
  if (isOccupied(hoverPoint)) return null;
  return { x: hoverPoint.x, y: hoverPoint.y, color: turn };
}
