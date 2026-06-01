/**
 * tests/integration/MiniBoardSvg.parity.test.ts
 *
 * Carry-over regression guard for the MiniBoard SVG→canvas split. Validates that
 * the split-out `MiniBoardSvg` renders identically (modulo the random per-
 * instance gradient/pattern id suffix) to the PRE-SPLIT implementation, across a
 * spread of path-dependent board positions. The previous implementation is
 * frozen at `__refs__/MiniBoardSvgReference.vue` (an exact `git show main:` copy
 * of the pre-split `MiniBoard.vue`); if `MiniBoardSvg` ever drifts from it, this
 * fails. A deliberate component-level test (normally deferred per tests/CLAUDE.md)
 * because the maintainer wants proof the split changed nothing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MiniBoardSvg from '../../src/components/board/MiniBoardSvg.vue';
import MiniBoardReference from './__refs__/MiniBoardSvgReference.vue';
import type { BoardSnapshot } from '../../src/engine/board-geometry';

// Each instance picks a random 4-char suffix for its gradient/pattern ids (so
// multiple boards on screen don't collide). Strip it so two instances compare on
// structure, not on the random uid.
const norm = (html: string): string =>
  html
    .replace(/(wd|gb|gw)-[a-z0-9]{4}\b/g, '$1-UID') // per-instance random gradient/pattern uid
    .replace(/ data-v-[a-f0-9]+=""/g, '');          // Vue scoped-CSS hash (differs per SFC file, not render)

// A dense worst-case board (the most stones → the most SVG nodes).
const dense: Record<string, 'B' | 'W'> = {};
for (let i = 0; i < 19; i++) for (let j = 0; j < 19; j += 2) dense[`${i},${j}`] = (i + j) % 4 === 0 ? 'B' : 'W';

// Path-dependent positions exercising every render branch.
const SNAPSHOTS: Record<string, BoardSnapshot> = {
  'empty 9x9': { size: 9, stones: {} },
  'opening 19x19': { size: 19, stones: { '3,3': 'B', '15,15': 'W', '3,15': 'B', '15,3': 'W' } },
  'last-move (place → ring)': { size: 19, stones: { '3,3': 'B', '4,3': 'W' }, lastMove: { x: 4, y: 3, color: 'W', type: 'place' } },
  'last-move on black stone (white ring)': { size: 9, stones: { '4,4': 'B' }, lastMove: { x: 4, y: 4, color: 'B', type: 'place' } },
  'pass last-move (no ring)': { size: 9, stones: { '4,4': 'B' }, lastMove: { x: 0, y: 0, color: 'W', type: 'pass' } },
  'variation labels': { size: 9, stones: { '4,4': 'B' }, markerLabels: { '2,2': 'A', '6,6': 'B' } },
  'dense 19x19': { size: 19, stones: dense },
};

describe('MiniBoardSvg — exact carry-over of the pre-split SVG render', () => {
  for (const [name, snapshot] of Object.entries(SNAPSHOTS)) {
    for (const showMarker of [true, false]) {
      it(`${name} (showMarker=${showMarker}) matches the previous implementation`, () => {
        const next = mount(MiniBoardSvg, { props: { snapshot, showMarker } });
        const prev = mount(MiniBoardReference, { props: { snapshot, showMarker } });
        expect(norm(next.html())).toBe(norm(prev.html()));
      });
    }
  }
});
