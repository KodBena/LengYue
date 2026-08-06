/**
 * src/utils/contrast-ratio.ts
 *
 * Pure WCAG 2.1 contrast-ratio arithmetic. Exists so the
 * high-contrast-text token choices in `src/assets/css/theme.css`
 * (the `[data-theme="cluster"][data-contrast-text="on"]` block) are
 * machine-checked rather than hand-computed-and-trusted — the ratios
 * cited in that block's comments are asserted against this module in
 * `tests/unit/contrast-ratio.test.ts`, not merely stated.
 *
 * No DOM, no Vue reactivity: a `#rrggbb` string in, a number out.
 * Band 1 (truly domain-agnostic, ADR-0003) — this is generic color
 * math, no Go or LengYue-specific coupling.
 *
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * and https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio.
 *
 * License: Public Domain (The Unlicense)
 */

/** An sRGB hex color string, `#rrggbb` (lowercase or uppercase, 6 digits). */
export type HexColor = `#${string}`;

function hexToRgb(hex: HexColor): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) {
    // ADR-0002: a malformed literal here is an authoring error in a
    // token table, not a runtime user input — fail loudly rather than
    // silently treating it as black.
    throw new Error(`contrast-ratio: not a #rrggbb hex color: ${hex}`);
  }
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

// WCAG's sRGB → linear-light channel transform.
function linearizeChannel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance, in [0, 1]. `L = 0.2126 R + 0.7152 G + 0.0722 B`
 * over linear-light channels.
 */
export function relativeLuminance(hex: HexColor): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * WCAG contrast ratio between two opaque sRGB colors, in [1, 21].
 * `(L_lighter + 0.05) / (L_darker + 0.05)`; order of the two
 * arguments doesn't matter (the lighter of the pair is resolved
 * internally).
 */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA floor for normal-size text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

/** WCAG 2.1 AA floor for large text (≥ 18.66px @700 or ≥ 24px) and graphical/UI glyphs. */
export const WCAG_AA_LARGE_TEXT_OR_GLYPH = 3.0;
