/**
 * tests/unit/labels-text0-named-surfaces.test.ts
 *
 * Regression guard for the app-wide readable-text sweep to `--text-0`
 * (ledger rows 1478/1479/1481, commissioner's standing design rule:
 * "*TEXT* should be read with maximal contrast ALWAYS. Any text that
 * is intended for reading is max contrast (text-0) or it's not even
 * rendered."). Pins the surfaces the commission named explicitly, so
 * a future edit that reintroduces `--text-1`/`--text-2` on these
 * exact rules turns this red instead of silently regressing contrast:
 *
 *   - KnobSlider.vue: the knob label and the slider's min/max
 *     endpoint labels (`.knob-slider-label-text`, `.knob-slider-endpoint`).
 *   - SettingsTab.vue: the setting-name labels (`.theme-row label`).
 *
 * Source-text assertion (Tier 1 — no DOM, no Vue), matching this
 * repo's `TabWidget-overflow.test.ts` / `knob-slider-measure.test.ts`
 * convention: reads the scoped `<style>` block's raw source rather
 * than a jsdom computed style, since jsdom performs no layout/paint
 * and scoped-CSS `data-v-*` attribute selectors aren't resolved by
 * `getComputedStyle` there anyway.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function styleBlock(source: string): string {
  const start = source.indexOf('<style');
  const bodyStart = source.indexOf('>', start) + 1;
  const end = source.indexOf('</style>', bodyStart);
  return source.slice(bodyStart, end);
}

describe('named readable-text surfaces use --text-0 (rows 1478/1479/1481)', () => {
  it('KnobSlider.vue: the knob label text is --text-0', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/knobs/KnobSlider.vue'),
      'utf-8',
    );
    const style = styleBlock(src);
    const m = /\.knob-slider-label-text\s*{([^}]*)}/.exec(style);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--text-0\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-1\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-2\)/);
  });

  it('KnobSlider.vue: the slider min/max endpoint labels are --text-0', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/knobs/KnobSlider.vue'),
      'utf-8',
    );
    const style = styleBlock(src);
    const m = /\.knob-slider-endpoint\s*{([^}]*)}/.exec(style);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--text-0\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-1\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-2\)/);
  });

  it('SettingsTab.vue: the theme-row setting-name label is --text-0', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/SettingsTab.vue'),
      'utf-8',
    );
    const style = styleBlock(src);
    const m = /\.theme-row label\s*{([^}]*)}/.exec(style);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--text-0\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-1\)/);
    expect(m![1]).not.toMatch(/color:\s*var\(--text-2\)/);
  });
});
