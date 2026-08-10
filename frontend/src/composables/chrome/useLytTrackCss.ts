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
 * Disclosed limitation (inherited from the emit_mockup.py formula this
 * ports, not introduced here): the clamp's `fixedSiblingSumPx` accounts
 * only for the board composite's OWN fixed internal siblings (e.g.
 * I_board+A_board), not any OTHER root-level sibling's width (boardRail).
 * This is exact for W1 (boardRail's `presenceDefaultVisible` is `false` —
 * LytNode.vue never renders it, so its track is always 0px this wave) but
 * would need generalizing before boardRail becomes toggleable (W2's
 * presence-menu work) — see LYT_WIDGET_REGISTRY's own boardRail note.
 *
 * A collapsed track (`presenceDefaultVisible: false` on the owning
 * LytChild) is handled by the CALLER (LytNode.vue passes `"0px"` instead
 * of calling into this module for that child) — this module only ever
 * compiles a VISIBLE child's own declared shape.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytTrackShape } from '../../state/lyt-layout.gen';

export function trackCssValue(shape: LytTrackShape): string {
  switch (shape.kind) {
    case 'fixed':
      return `${shape.px}px`;
    case 'elastic':
      return `minmax(${shape.minPx}px, ${shape.frWeight}fr)`;
    case 'elastic-capped':
      return `minmax(${shape.minPx}px, ${shape.maxPx}px)`;
    case 'board-priority-clamp': {
      const natural = `calc(100${shape.naturalBoardCrossUnit} - ${shape.fixedSiblingSumPx}px)`;
      const available = `calc(100% - (${natural}) - ${shape.parentGapPx}px)`;
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
