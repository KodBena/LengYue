/**
 * tests/unit/composables/useMintDialogSignal.test.ts
 *
 * Tier-1 tests for `src/composables/useMintDialogSignal.ts` — the
 * module-scoped "open the mint dialog" request counter that the
 * `card.mint` keybinding uses to reach `App.vue`'s `triggerMint()`
 * (module scope has no component ref to call directly). Pure
 * counter semantics; no DOM, no Vue component instance needed.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { mintDialogRequestCount, requestMintDialog } from '../../../src/composables/useMintDialogSignal';

describe('useMintDialogSignal', () => {
  it('starts at a stable baseline and increments by exactly 1 per request', () => {
    const before = mintDialogRequestCount.value;
    requestMintDialog();
    expect(mintDialogRequestCount.value).toBe(before + 1);
  });

  it('each call produces a distinct value (a watcher can tell requests apart even back-to-back)', () => {
    const first = mintDialogRequestCount.value;
    requestMintDialog();
    const second = mintDialogRequestCount.value;
    requestMintDialog();
    const third = mintDialogRequestCount.value;
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });
});
