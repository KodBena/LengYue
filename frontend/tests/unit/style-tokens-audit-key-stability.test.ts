/**
 * tests/unit/style-tokens-audit-key-stability.test.ts
 *
 * ADR-0019 CI-gate build (commission per
 * `.claude/dispatch-reports/lyt-final-opus-review.md` §3 Rule 2(b)).
 * Mechanized proof that `scripts/style-tokens-audit.mjs`'s finding
 * identities are CONTENT-derived, not position-derived: inserting an
 * unrelated line, hex literal, or control earlier in the same file
 * must not change an existing finding's key. Same discipline as
 * `layout-audit-key-stability.test.ts`, applied to the C22 static
 * scanner instead of the DOM audit.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { stableHexIdentity, stableControlIdentity } from '../../scripts/style-tokens-audit.mjs';

describe('stableHexIdentity — content-derived, not line-number-derived', () => {
  it('is unchanged when unrelated CSS is inserted before the declaration', () => {
    const before = `.foo { color: #ff00aa; }\n.bar { background: #123456; }\n`;
    const idx = before.indexOf('#123456');
    const keyBefore = stableHexIdentity(before, idx, '#123456');

    const after = `.new-unrelated-rule { color: #000000; padding: 4px; }\n\n\n${before}`;
    const idx2 = after.indexOf('#123456');
    const keyAfter = stableHexIdentity(after, idx2, '#123456');

    expect(keyAfter).toBe(keyBefore);
  });

  it('distinguishes the same hex value under two different selectors', () => {
    const text = `.a { color: #ffffff; }\n.b { color: #ffffff; }\n`;
    const idxA = text.indexOf('#ffffff');
    const idxB = text.lastIndexOf('#ffffff');
    const keyA = stableHexIdentity(text, idxA, '#ffffff');
    const keyB = stableHexIdentity(text, idxB, '#ffffff');
    expect(keyA).not.toBe(keyB);
  });
});

describe('stableControlIdentity — content-derived, not line-number-derived', () => {
  it('is unchanged when an unrelated control is inserted earlier in the template', () => {
    const before = `<template><div><button id="connect-btn">Go</button></div></template>`;
    const idx = before.indexOf('<button');
    const keyBefore = stableControlIdentity(before, idx, 'button');

    const after = `<template><div><input class="unrelated-inserted-input" /><div><button id="connect-btn">Go</button></div></div></template>`;
    const idx2 = after.indexOf('<button id="connect-btn"');
    const keyAfter = stableControlIdentity(after, idx2, 'button');

    expect(keyAfter).toBe(keyBefore);
  });

  it('prefers id over class over v-model over name', () => {
    const withId = `<select id="palette-select" class="scalar-input" />`;
    expect(stableControlIdentity(withId, 0, 'select')).toBe('select#palette-select');
  });

  it('falls back to sorted class list when there is no id', () => {
    const el = `<button class="toolbar-btn highlight-btn" />`;
    expect(stableControlIdentity(el, 0, 'button')).toBe('button.highlight-btn.toolbar-btn');
  });

  it('two anonymous controls with identical markup collapse onto one key (documented, intentional)', () => {
    const a = `<input type="text" />`;
    const b = `<input type="text" />`;
    expect(stableControlIdentity(a, 0, 'input')).toBe(stableControlIdentity(b, 0, 'input'));
  });
});
