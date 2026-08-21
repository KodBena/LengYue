/**
 * tests/unit/state/overlay-contract.test.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5). Pins `overlayContract()`'s own three
 * construction-time refusals — pure logic, no DOM, Tier 1.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { overlayContract, type OverlayContract } from '../../../src/state/overlay-contract';

function base(overrides: Partial<OverlayContract> = {}): OverlayContract {
  return {
    kind: 'popover',
    open: false,
    dismissal: { escape: true, outsideClick: true, explicitCloseControl: true },
    focusTrap: false,
    restoreFocusTo: () => null,
    ...overrides,
  };
}

describe('overlayContract()', () => {
  it('accepts a well-formed popover (focusTrap: false, at least one dismissal channel)', () => {
    const c = overlayContract(base());
    expect(c.kind).toBe('popover');
    expect(c.focusTrap).toBe(false);
  });

  it('accepts a well-formed modal (focusTrap: true)', () => {
    const c = overlayContract(base({ kind: 'modal', focusTrap: true }));
    expect(c.kind).toBe('modal');
    expect(c.focusTrap).toBe(true);
  });

  it('refuses an overlay with every dismissal channel false', () => {
    expect(() =>
      overlayContract(base({ dismissal: { escape: false, outsideClick: false, explicitCloseControl: false } })),
    ).toThrow(/no dismissal channel at all/);
  });

  it('accepts an overlay with exactly one dismissal channel true (escape only, e.g. a hover popover)', () => {
    const c = overlayContract(
      base({ dismissal: { escape: true, outsideClick: false, explicitCloseControl: false } }),
    );
    expect(c.dismissal.escape).toBe(true);
  });

  it('refuses a modal with focusTrap: false', () => {
    expect(() => overlayContract(base({ kind: 'modal', focusTrap: false }))).toThrow(/modal without a focus trap/);
  });

  it('refuses a popover with focusTrap: true', () => {
    expect(() => overlayContract(base({ kind: 'popover', focusTrap: true }))).toThrow(/popover with a focus trap/);
  });

  it('returns a fresh dismissal object, not the caller\'s own reference (defensive copy)', () => {
    const dismissal = { escape: true, outsideClick: true, explicitCloseControl: true };
    const c = overlayContract(base({ dismissal }));
    expect(c.dismissal).not.toBe(dismissal);
    expect(c.dismissal).toEqual(dismissal);
  });
});
