/**
 * tests/integration/MiniBoardSvg-pv.test.ts
 *
 * Regression coverage for item 2 (mandate addendum,
 * `.claude/dispatch-reports/preview-board-followup-build.md`) — the
 * best-move principal variation on the `MiniBoard` thumbnail family.
 * The prior build found `BoardSnapshot` had no PV field at all; this
 * pins the RENDER half of the fix (the DATA half — `PreviewBoardPanel`
 * populating `snapshot.pv` from the same analysis source the main
 * board's PV overlay reads — is covered separately in
 * `PreviewBoardPanel-pv.test.ts`).
 *
 * Deliberately component-level (normally deferred per `tests/CLAUDE.md`)
 * for the same reason `MiniBoardSvg.parity.test.ts` is: the assertion is
 * about SVG structure a pure-logic test cannot express.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MiniBoardSvg from '../../src/components/board/MiniBoardSvg.vue';
import type { BoardSnapshot } from '../../src/engine/board-geometry';

describe('MiniBoardSvg — best-move principal variation (item 2)', () => {
  it('renders one PV stone per pv entry, given data', () => {
    const snapshot: BoardSnapshot = {
      size: 19,
      stones: { '3,3': 'B' },
      pv: [
        { x: 15, y: 15, color: 'W', moveNumber: 1 },
        { x: 3, y: 15, color: 'B', moveNumber: 2 },
        { x: 15, y: 3, color: 'W', moveNumber: 3 },
      ],
    };
    const wrapper = mount(MiniBoardSvg, { props: { snapshot } });
    const pvStones = wrapper.findAll('[data-testid="mini-board-pv-stone"]');
    expect(pvStones).toHaveLength(3);
    // Move-number labels render as the PV stones' own text content —
    // the same per-move numbering the main board's PV overlay shows.
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('3');
  });

  it('honest empty state: no `pv` on the snapshot renders zero PV stones (never a fabricated placeholder)', () => {
    const snapshot: BoardSnapshot = { size: 19, stones: { '3,3': 'B' } };
    const wrapper = mount(MiniBoardSvg, { props: { snapshot } });
    expect(wrapper.findAll('[data-testid="mini-board-pv-stone"]')).toHaveLength(0);
  });

  it('an explicitly empty pv array ALSO renders zero PV stones (both "no data yet" shapes degrade the same way visually)', () => {
    const snapshot: BoardSnapshot = { size: 19, stones: { '3,3': 'B' }, pv: [] };
    const wrapper = mount(MiniBoardSvg, { props: { snapshot } });
    expect(wrapper.findAll('[data-testid="mini-board-pv-stone"]')).toHaveLength(0);
  });

  it('a real stone at a PV coordinate is unaffected — PV rendering is additive, never a replacement', () => {
    const snapshot: BoardSnapshot = {
      size: 19,
      stones: { '3,3': 'B' },
      pv: [{ x: 3, y: 3, color: 'W', moveNumber: 1 }],
    };
    const wrapper = mount(MiniBoardSvg, { props: { snapshot } });
    // The real stone's own circle (from `stoneList`, no data-testid) is
    // still present — two circles rendered at (3,3) in different layers.
    expect(wrapper.findAll('[data-testid="mini-board-pv-stone"]')).toHaveLength(1);
    const circles = wrapper.findAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });
});
