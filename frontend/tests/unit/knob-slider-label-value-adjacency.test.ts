/**
 * tests/unit/knob-slider-label-value-adjacency.test.ts
 *
 * Regression guard for finding G19 (independent geometry consult,
 * `.claude/dispatch-reports/opus-uiux-geometry-consult.md`, rows
 * 1556/1565): the non-compact (Other tab / Knob Registry) knob
 * slider row separated its value readout from its label by ~330px
 * (the label column was `1fr`, stretching to the row's full bounded
 * width) and put the value on the line ABOVE the handle, and the
 * min/max endpoint captions collided with the slider track — the
 * thumb's own 24x24 LAW-fixed hit-box overflows the `<input>`'s
 * rendered edge by 12px at the min/max extreme, and the prior
 * `--space-tight` (4px) track gap didn't clear that overflow.
 *
 * Fixed by:
 *   - `minmax(0, max-content)` / `max-content` label and value grid
 *     columns (replacing the label's `1fr`) so label and value sit
 *     adjacent, with a trailing `1fr` spacer absorbing the row's
 *     leftover width instead of it landing between them.
 *   - Widening `.knob-slider-track`'s gap from `--space-tight` (4px)
 *     to `--space-loose` (20px), clearing the thumb's 12px overflow
 *     with an 8px buffer.
 *
 * Source-text assertions (Tier 1 — no DOM, no Vue; jsdom has no real
 * layout engine, matching this repo's `TabWidget-overflow.test.ts`
 * convention) for the CSS shape, since KnobSlider.vue's structural
 * markup (label/value/track order) is unchanged — only the grid
 * columns and track gap moved.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KNOB_SLIDER_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/knobs/KnobSlider.vue'),
  'utf-8',
);

describe('KnobSlider.vue — label/value adjacency (G19)', () => {
  it('the non-compact row no longer stretches the label column to 1fr (the ~330px-gap cause)', () => {
    const rule = /\.knob-slider-row\s*\{[^}]*\}/.exec(KNOB_SLIDER_SRC);
    expect(rule).not.toBeNull();
    // The label column must not be the sole `1fr` track — that was
    // the mechanism that pushed the value to the row's far edge.
    expect(rule![0]).not.toMatch(/grid-template-columns:\s*1fr\s+auto\s*;/);
    expect(rule![0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*max-content\)\s+max-content\s+1fr\s*;/);
  });

  it('label and value occupy adjacent grid areas on the same row, ahead of an unused spacer column', () => {
    const rule = /\.knob-slider-row\s*\{[^}]*\}/.exec(KNOB_SLIDER_SRC);
    expect(rule![0]).toMatch(/grid-template-areas:\s*"label value \." "slider slider slider"\s*;/);
  });

  it('the label keeps its ellipsis-on-overflow guard (min-width: 0) now that its column can shrink', () => {
    const rule = /\.knob-slider-label-text\s*\{[^}]*\}/.exec(KNOB_SLIDER_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/min-width:\s*0\s*;/);
    expect(rule![0]).toMatch(/text-overflow:\s*ellipsis\s*;/);
  });

  it('the track gap clears the LAW-fixed 24px thumb hit-box overflow (12px) rather than the old 4px tight gap', () => {
    const rule = /\.knob-slider-track\s*\{[^}]*\}/.exec(KNOB_SLIDER_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/gap:\s*var\(--space-loose\)\s*;/);
    expect(rule![0]).not.toMatch(/gap:\s*var\(--space-tight\)\s*;/);
  });

  it('the thumb hit-box itself is untouched (still the LAW-fixed 24x24 total box, 16.8px painted circle)', () => {
    expect(KNOB_SLIDER_SRC).toMatch(/width:\s*16\.8px;/);
    expect(KNOB_SLIDER_SRC).toMatch(/height:\s*16\.8px;/);
    expect(KNOB_SLIDER_SRC).toMatch(/border:\s*3\.6px solid transparent;/);
  });
});
