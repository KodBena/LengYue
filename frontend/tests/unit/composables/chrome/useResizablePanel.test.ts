/**
 * tests/unit/composables/chrome/useResizablePanel.test.ts
 *
 * Tier-1 (pure-logic) tests for the resizer drag math in
 * `src/composables/chrome/useResizablePanel.ts` (ui-fix-56, Defect
 * 5: "the resizer freezes at the board's aspect-ratio
 * height-saturation point"). No DOM, no store, no Vue reactivity —
 * `computeBoardTargetPx` and `computeControlPanelWidthPx` are pure
 * functions of their inputs, exported from the composable module
 * specifically so this drag math is testable without mounting
 * anything.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  computeBoardTargetPx,
  computeControlPanelWidthPx,
  CONTROL_PANEL_MIN_WIDTH_PX,
} from '../../../../src/composables/chrome/useResizablePanel';

describe('computeBoardTargetPx', () => {
  it('adds the delta to the drag origin', () => {
    expect(computeBoardTargetPx(600, 100)).toBe(700);
    expect(computeBoardTargetPx(600, -100)).toBe(500);
  });

  it('clamps to MIN_BOARD (300) at the low end', () => {
    expect(computeBoardTargetPx(400, -1000)).toBe(300);
  });

  it('clamps to MAX_BOARD (4096) at the high end', () => {
    expect(computeBoardTargetPx(2000, 100000)).toBe(4096);
  });
});

describe('computeControlPanelWidthPx — Defect 5 red leg (pre-fix behavior, preserved below saturation)', () => {
  it('returns undefined when the target has not reached the saturation point', () => {
    // A 4k-ish scenario: board saturates at 2128 (column height), row
    // is 3672 wide, "other fixed width" (tree panel + resizer) is
    // 144, control panel's natural width is therefore
    // 3672 - 144 - 2128 = 1400 (mirrors the report's live-witnessed
    // numbers for Defect 5/6).
    expect(computeControlPanelWidthPx(1800, 2128, 3672, 144)).toBeUndefined();
  });

  it('returns undefined exactly at the saturation point (boundary, still "below")', () => {
    expect(computeControlPanelWidthPx(2128, 2128, 3672, 144)).toBeUndefined();
  });

  it('returns undefined when drag-start geometry could not be measured (sentinel: rowWidthAtDragStartPx === 0)', () => {
    expect(computeControlPanelWidthPx(3800, 2128, 0, 0)).toBeUndefined();
  });
});

describe('computeControlPanelWidthPx — Defect 5 green leg (post-saturation shrink)', () => {
  it('shrinks the control panel by the overshoot once the target passes saturation', () => {
    // Natural control-panel width at saturation: 3672 - 144 - 2128 = 1400.
    // Dragging 200px past saturation should claim 200px from the panel.
    const width = computeControlPanelWidthPx(2128 + 200, 2128, 3672, 144);
    expect(width).toBe(1200);
  });

  it('produces an observable width change on every further px of drag past saturation (the reported symptom: previously frozen)', () => {
    const w1 = computeControlPanelWidthPx(2128 + 100, 2128, 3672, 144);
    const w2 = computeControlPanelWidthPx(2128 + 300, 2128, 3672, 144);
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    expect(w2 as number).toBeLessThan(w1 as number);
  });

  it('floors at CONTROL_PANEL_MIN_WIDTH_PX and does not go below it even at MAX_BOARD overshoot', () => {
    const width = computeControlPanelWidthPx(4096, 2128, 3672, 144);
    expect(width).toBe(CONTROL_PANEL_MIN_WIDTH_PX);
  });

  it('reverts to undefined (default flex fill) when the drag returns below saturation', () => {
    // Drag past saturation, then back below it in the same gesture.
    expect(computeControlPanelWidthPx(2128 + 200, 2128, 3672, 144)).toBe(1200);
    expect(computeControlPanelWidthPx(2000, 2128, 3672, 144)).toBeUndefined();
  });
});
