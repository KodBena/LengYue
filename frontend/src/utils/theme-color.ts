/**
 * src/utils/theme-color.ts
 *
 * Runtime accessor for chrome-substrate CSS variables, for the
 * minority of consumers that need a string-shaped color value at
 * render time (ECharts adapter configs, SVG presentation attributes
 * that don't evaluate var()).
 *
 * The CSS substrate at src/assets/css/theme.css owns the values; this
 * helper reads them from `:root` via getComputedStyle. CSS-property
 * consumers (every <style> block in src/) read directly via
 * `var(--name)`; this helper exists because ECharts options and SVG
 * presentation attributes don't.
 *
 * Per ADR-0002, throws on missing variable rather than returning
 * empty string — a missing chrome anchor is a real error, not a
 * silent fallback.
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * Resolve a CSS variable to its current string value.
 *
 * @param name The variable name including leading `--` (e.g. `--accent-primary`).
 * @returns The trimmed value (e.g. `#4aaef0`).
 * @throws Error if the variable is not defined on the document root.
 *
 * @example
 *   themeColor('--accent-primary') // '#4aaef0'
 */
export function themeColor(name: string): string {
  if (typeof document === 'undefined') {
    throw new Error(
      `themeColor("${name}") called outside browser context — ` +
      `chrome anchors are read from document.documentElement.`,
    );
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name);
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      `themeColor: CSS variable "${name}" is undefined or empty. ` +
      `Check src/assets/css/theme.css and confirm the import is wired ` +
      `before the calling component renders.`,
    );
  }
  return trimmed;
}
