/**
 * src/composables/chrome/useLytTrackCss.ts
 *
 * W1 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W1 item 3, "renderer"). Pure functions compiling a `LytTrackShape`
 * (`state/lyt-layout.gen.ts`) to the literal CSS Grid track value —
 * extracted out of `LytNode.vue` per `frontend/CLAUDE.md`'s ADR-0007
 * (SFC size discipline; "extract a composable for the logic"). No Vue
 * reactivity here at all — every function is a pure `(shape) -> string`
 * mapping, unit-testable directly.
 *
 * Mapping table (mirrors `research/lyt/emit_mockup.py`'s own docstring,
 * read in full — the normative source for this mapping; this module is
 * its Vue-runtime analog, string-for-shape rather than string-for-AST):
 *
 *   fixed              -> "<px>px"
 *   elastic             -> "minmax(<minPx>px, <frWeight>fr)"
 *   elastic-capped      -> "minmax(<minPx>px, <maxPx>px)"
 *   board-priority-clamp -> "clamp(<minPx>px, calc(100% - (100<unit> -
 *                            <fixedSiblingSumPx>px) - <parentGapPx>px),
 *                            <maxPx>px)"
 *     — reproduces `research/lyt/emit_mockup.py`'s `_board_priority_tracks`
 *       CASE A closed-form (that function's own docstring has the full
 *       derivation): the ONE elastic+capped sibling of the recognized
 *       board-composite shape at a program's ROOT split gets this
 *       override instead of the bare elastic-capped mapping, so the CSS
 *       grid's own track-sizing algorithm reproduces the CP-SAT solver's
 *       lexicographic board-maximize priority exactly, not approximately.
 *
 * Formerly-disclosed limitation, GENERALIZED (lyt-w2-presence, W2): the
 * clamp's `fixedSiblingSumPx` accounts only for the board composite's OWN
 * fixed internal siblings (e.g. I_board+A_board) — it never knew about any
 * OTHER root-level sibling's width. Exact so long as `boardRail` (the one
 * other root sibling with a variable width) stayed `presenceDefaultVisible:
 * false` (W1: LytNode.vue never rendered it, so its track was always 0px).
 * Now that the corner presence menu can make boardRail genuinely 168px
 * wide, the side column's clamp formula would over-claim boardRail's own
 * footprint unless told about it — `trackCssValue`'s second parameter,
 * `leadingReservedPx`, is that generalization: LytNode.vue's own trackList
 * computed (the one caller in a position to know a sibling's CURRENT
 * presence-resolved width) passes boardRail's live reserved px (its own
 * fixed px plus one split gap, or 0 when hidden) only for the
 * `board-priority-clamp` track; every other call site passes nothing and
 * gets byte-identical output to before this change (the parameter defaults
 * to 0, a pure additive extension — see LytNode.vue's own header for the
 * generalization's scope and the disclosed judgment call it names).
 *
 * A collapsed track (`presenceDefaultVisible: false` on the owning
 * LytChild, or a runtime presence override saying the same) is handled by
 * the CALLER (LytNode.vue passes `"0px"` instead of calling into this
 * module for that child) — this module only ever compiles a VISIBLE
 * child's own declared shape.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytTrackShape } from '../../state/lyt-layout.gen';

export function trackCssValue(shape: LytTrackShape, leadingReservedPx = 0): string {
  switch (shape.kind) {
    case 'fixed':
      return `${shape.px}px`;
    case 'elastic':
      return `minmax(${shape.minPx}px, ${shape.frWeight}fr)`;
    case 'elastic-capped':
      return `minmax(${shape.minPx}px, ${shape.maxPx}px)`;
    case 'board-priority-clamp': {
      const natural = `calc(100${shape.naturalBoardCrossUnit} - ${shape.fixedSiblingSumPx}px)`;
      // leadingReservedPx (see this file's header) accounts for a
      // PRECEDING root-level sibling (boardRail) whose own width this
      // track's original derivation never modeled — 0 reproduces the
      // pre-W2 formula exactly.
      const leading = leadingReservedPx > 0 ? ` - ${leadingReservedPx}px` : '';
      const available = `calc(100% - (${natural}) - ${shape.parentGapPx}px${leading})`;
      return `clamp(${shape.minPx}px, ${available}, ${shape.maxPx}px)`;
    }
    /* istanbul ignore next -- exhaustiveness guard, ADR-0002 */
    default: {
      const _exhaustive: never = shape;
      throw new Error(`trackCssValue: unhandled LytTrackShape kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** CSS Grid's own `column-gap`/`row-gap` split, per AMENDMENT 3
 * (SPEC-AMENDMENTS.md) — a Split's declared `gapPx` realizes on the axis
 * ITS OWN partition uses (h -> column-gap, v -> row-gap), 0 on the other. */
export function gapCssFor(axis: 'h' | 'v', gapPx: number): { columnGap: string; rowGap: string } {
  return axis === 'h' ? { columnGap: `${gapPx}px`, rowGap: '0px' } : { columnGap: '0px', rowGap: `${gapPx}px` };
}
