/**
 * tests/unit/shared-chrome-css.test.ts
 *
 * Pins ADR-0019 audit S13: `.toolbar-btn-sm` (src/assets/css/shared-
 * chrome.css) declared no `background`, so in the dark theme it fell
 * through to Chromium's native `ButtonFace` (a near-white slab — the
 * audit measured SAVE/PURGE contrast ratios of 2.02:1 / 3.16:1 against
 * it, both below the 4.5:1 / 3:1 WCAG floors). The fix is one
 * declaration: `background: var(--surface-0)`, the project's blessed
 * control-background token.
 *
 * This is a source-text assertion (Tier 1 — no DOM, no Vue) rather than
 * a rendered-contrast check: jsdom has no layout/paint engine to resolve
 * `var(--surface-0)` against a real background, so the artifact-level
 * fact this test can honestly pin is "the rule declares a themed
 * background at all" — the same posture C19's own audit note takes for
 * a CI gate that can't do real compositing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// process.cwd() is the `frontend/` package root under Vitest's default
// config (matches every other test file's `../../src/...`-relative
// import style) — `import.meta.url`-based resolution isn't reliably a
// `file:` URL inside Vitest's transform pipeline in this environment.
const SHARED_CHROME_CSS = readFileSync(
  resolve(process.cwd(), 'src/assets/css/shared-chrome.css'),
  'utf-8',
);

describe('.toolbar-btn-sm — themed background (ADR-0019 audit S13)', () => {
  it('declares a background from the sanctioned token set, not the platform default', () => {
    // Anchored to a line starting with the bare selector (not preceded by
    // a combinator) so the match is the actual `.toolbar-btn-sm { ... }`
    // rule, not the unrelated `.settings-section > summary >
    // .toolbar-btn-sm { margin-left: ... }` descendant-selector rule
    // earlier in the same file.
    const rule = SHARED_CHROME_CSS.match(/^\.toolbar-btn-sm\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/background:\s*var\(--surface-0\)/);
  });
});
