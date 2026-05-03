/**
 * src/utils/theme-color.ts
 *
 * Runtime accessor for chrome-substrate **color** CSS variables,
 * for the minority of consumers that need a string-shaped color
 * value at render time (ECharts adapter configs, SVG presentation
 * attributes that don't evaluate var()).
 *
 * The CSS substrate at src/assets/css/theme.css owns the values;
 * this helper reads them from `:root` via getComputedStyle.
 * CSS-property consumers (every <style> block in src/) read
 * directly via `var(--name)`; this helper exists because ECharts
 * options and SVG presentation attributes don't.
 *
 * ## Scope: color anchors only
 *
 * `ChromeAnchor` mirrors the **color** anchors declared in
 * theme.css's `:root` — base color anchors, chart-derived color
 * helpers, and color role aliases. theme.css also declares
 * non-color anchors (the z-index ladder added 2026-05-03 as the
 * magic-literals-audit Pass 2 Tier-1 #1 substrate); those are
 * CSS-only and intentionally outside this union's scope. A
 * runtime accessor for z-index would be useful only if a TS-side
 * consumer needed numeric layering decisions, which the codebase
 * doesn't currently have. If that need arises, add a
 * `themeNumber()` (or similar) accessor with its own anchor
 * union; don't muddle this color-typed contract.
 *
 * ## SSOT discipline (ADR-0005 Rule 1, applied)
 *
 * The `ChromeAnchor` union below is the type-system view of the
 * substrate's color-anchor names. The single source of truth is
 * src/assets/css/theme.css; this union is a hand-derived mirror.
 * When the color subset of the substrate grows or shrinks, BOTH
 * files must be edited:
 *
 *   - **Add a color anchor.** Declare it in theme.css's `:root`,
 *     add the literal to `ChromeAnchor`. Until the second edit
 *     lands, callers can't reference the new anchor — TypeScript
 *     will reject the unknown literal.
 *   - **Rename a color anchor.** Rename in theme.css, rename in
 *     `ChromeAnchor`. TypeScript surfaces every callsite using
 *     the old name as a compile error — refactor signal.
 *   - **Remove a color anchor.** Delete from theme.css, delete
 *     from `ChromeAnchor`. TypeScript surfaces every stale caller.
 *
 * Non-color anchors (z-index, future timing tokens) don't go into
 * `ChromeAnchor` and don't need the lockstep edit; they are
 * CSS-only and have no compile-time mirror.
 *
 * Codegen from theme.css → ChromeAnchor would eliminate the
 * lockstep concern but is overkill at ~25 color anchors with a low
 * change rate. If the substrate's color-side churn rises (or the
 * union crosses ~50 anchors), revisit and follow the OpenAPI
 * pipeline shape (`npm run gen:api` / `openapi-typescript`).
 *
 * Per ADR-0002, throws on missing variable rather than returning
 * empty string — a missing chrome anchor is a real error, not a
 * silent fallback. The runtime check stays even with the typed
 * signature: it covers the case where theme.css is editable
 * out-of-band (e.g. a future `html.theme-X { ... }` variant
 * forgets to override an anchor).
 *
 * License: Public Domain (The Unlicense)
 */

/**
 * The vocabulary of **color** anchors declared in theme.css.
 * Mirrors the color subset of `:root` rules in
 * `src/assets/css/theme.css` — 16 base anchors (4 surface + 3
 * border + 3 text + 2 accent + 4 semantic state) plus 6
 * chart-derived helpers plus 5 role aliases (decouple-via-alias
 * for implicit handles).
 *
 * Non-color anchors in theme.css (the z-index ladder) are
 * intentionally excluded — they're CSS-only, no runtime accessor
 * is needed, and including them here would muddle this type's
 * color-specific contract.
 *
 * Update both files in lockstep when the color subset changes —
 * see the SSOT discipline note in the file header.
 */
export type ChromeAnchor =
  // Surface (4)
  | '--surface-0' | '--surface-1' | '--surface-2' | '--surface-3'
  // Border (3)
  | '--border-1' | '--border-2' | '--border-3'
  // Text (3)
  | '--text-0' | '--text-1' | '--text-2'
  // Accent (2)
  | '--accent-primary' | '--accent-secondary'
  // Semantic state (4)
  | '--state-success' | '--state-warning' | '--state-error' | '--state-attention'
  // Chart-derived helpers (aliases of the anchors above; named
  // separately so TS-side chart adapters can read them as the
  // chart-side vocabulary rather than reaching into the role
  // anchors).
  | '--heatmap-low' | '--heatmap-mid' | '--heatmap-high'
  | '--chart-grid' | '--chart-axis' | '--chart-marker'
  // Role aliases (decouple-via-alias). Named for the implicit
  // handle the consumer needs ("player W identifier", "review
  // session active state"); aliased to whichever chrome anchor
  // currently shares the value. Future tuning can break the
  // aliasing without disturbing chrome.
  | '--player-black' | '--player-white'
  | '--review-active' | '--review-intermission' | '--review-complete';

/**
 * Resolve a chrome-substrate CSS variable to its current string value.
 *
 * @param name A `ChromeAnchor` — the variable name including the
 *             leading `--`. Constrained at compile time to the union
 *             of anchors declared in theme.css.
 * @returns The trimmed value (e.g. `#4aaef0`).
 * @throws Error if the variable is undefined on the document root,
 *               or if called outside a browser context.
 *
 * @example
 *   themeColor('--accent-primary') // '#4aaef0'
 */
export function themeColor(name: ChromeAnchor): string {
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
