/**
 * tests/unit/contrast-text-attribute.test.ts
 *
 * Tier-1 test for `src/composables/auth-app/contrast-text-attribute.ts`.
 * Pins the OFF-state-unchanged property the BUILD task's acceptance
 * criteria named explicitly: the flag's absence must produce NO
 * attribute (not `data-contrast-text="off"`) and therefore no override
 * application, since `theme.css`'s
 * `[data-theme="cluster"][data-contrast-text="on"]` selector cannot
 * match an element with the attribute absent.
 *
 * Uses a bare DOM element (jsdom, no Vue) rather than mounting
 * `useAppBootstrap` — the function under test is a pure DOM mutation
 * with no reactive or service dependencies, so a full composable
 * mount would add jsdom-stub / auth-fake machinery for zero additional
 * signal (`tests/CLAUDE.md`'s Tier 1 vs Tier 3 split).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { applyContrastTextAttribute } from '../../src/composables/auth-app/contrast-text-attribute';

describe('applyContrastTextAttribute', () => {
  it('sets data-contrast-text="on" when the flag is true', () => {
    const el = document.createElement('html');
    applyContrastTextAttribute(el, true);
    expect(el.getAttribute('data-contrast-text')).toBe('on');
  });

  it('OFF state: leaves no attribute at all on a fresh element (structural, not "off")', () => {
    const el = document.createElement('html');
    applyContrastTextAttribute(el, false);
    expect(el.hasAttribute('data-contrast-text')).toBe(false);
    expect(el.getAttribute('data-contrast-text')).toBeNull();
  });

  it('OFF state: REMOVES a previously-set attribute rather than writing "off"', () => {
    const el = document.createElement('html');
    applyContrastTextAttribute(el, true);
    expect(el.hasAttribute('data-contrast-text')).toBe(true);

    applyContrastTextAttribute(el, false);
    expect(el.hasAttribute('data-contrast-text')).toBe(false);
  });

  it('is idempotent across repeated calls with the same value', () => {
    const el = document.createElement('html');
    applyContrastTextAttribute(el, true);
    applyContrastTextAttribute(el, true);
    expect(el.getAttribute('data-contrast-text')).toBe('on');

    applyContrastTextAttribute(el, false);
    applyContrastTextAttribute(el, false);
    expect(el.hasAttribute('data-contrast-text')).toBe(false);
  });
});
