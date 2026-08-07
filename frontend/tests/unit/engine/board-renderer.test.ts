/**
 * tests/unit/engine/board-renderer.test.ts
 *
 * Tier-1 (pure-logic) tests for `renderBoardToSvg`
 * (`src/engine/board-renderer.ts`) — specifically the last-move marker
 * ring's discrimination on `Move.type`.
 *
 * Regression coverage for the diagnosed cosmetic defect
 * (`.claude/dispatch-reports/sgf-pass-diagnosis.md`): a pass move's `Move`
 * shape still carries a placeholder `x:0,y:0` (per `sgfToMove`'s pass
 * branch), which used to satisfy the renderer's old `Point`-typed
 * `lastMove` parameter by duck-typing and draw a spurious "last move" ring
 * at board coordinate (0,0) — even attaching to an unrelated stone that
 * happens to occupy that point. The fix types `lastMove` as the
 * discriminated `Move` union and guards on `.type === 'place'` inside the
 * renderer, so the marker is representable only for an actual placement.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { renderBoardToSvg } from '../../../src/engine/board-renderer';
import type { Move } from '../../../src/types';

// The marker ring is the only SVG element this renderer emits with
// opacity="0.8" — stones and labels don't carry it — so asserting on that
// attribute anchors the test on the marker's own behavioral output rather
// than an incidental string.
const MARKER_NEEDLE = 'opacity="0.8"';

describe('renderBoardToSvg — last-move marker vs. Move.type', () => {
  it('draws no marker for a pass move, even when a stone occupies the placeholder (0,0) point', () => {
    const passMove: Move = { type: 'pass', color: 'W', x: 0, y: 0 };
    const svg = renderBoardToSvg({
      size: 19,
      stones: { '0,0': 'B' },
      lastMove: passMove,
      showMarker: true,
      uid: 'pass-witness',
    });

    expect(svg).not.toContain(MARKER_NEEDLE);
  });

  it('draws the marker for a genuine place move', () => {
    const placeMove: Move = { type: 'place', color: 'B', x: 5, y: 5 };
    const svg = renderBoardToSvg({
      size: 19,
      stones: { '5,5': 'B' },
      lastMove: placeMove,
      showMarker: true,
      uid: 'place-witness',
    });

    expect(svg).toContain(MARKER_NEEDLE);
  });

  it('draws no marker when lastMove is null', () => {
    const svg = renderBoardToSvg({
      size: 19,
      stones: {},
      lastMove: null,
      showMarker: true,
      uid: 'null-witness',
    });

    expect(svg).not.toContain(MARKER_NEEDLE);
  });
});
