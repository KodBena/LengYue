/**
 * tests/unit/composables/workspace-identity-key.test.ts
 *
 * Tier-1 (pure) tests for the control-panel remount key
 * (`workspace-identity-key.ts`). The key drives the App.vue
 * control-panel `:key`; its invariant is what closes the tenancy
 * leak of component-instance fetched data on identity flip:
 *   - distinct identities ⇒ distinct keys ⇒ Vue remounts ⇒ A's
 *     fetched data is dropped and re-fetched for B.
 *   - STABLE across the late `/auth/me` userId-verify step, so login
 *     doesn't cause a spurious second remount (the reason it keys on
 *     username, not userId).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { workspaceIdentityKey } from '../../../src/composables/auth-app/workspace-identity-key';
import type { AuthState } from '../../../src/types';

describe('workspaceIdentityKey', () => {
  it('distinct usernames → distinct keys (identity flip remounts)', () => {
    const a: AuthState = { kind: 'authenticated', username: 'alice' };
    const b: AuthState = { kind: 'authenticated', username: 'bob' };
    expect(workspaceIdentityKey(a)).not.toBe(workspaceIdentityKey(b));
  });

  it('is stable across the late userId-verify step (no spurious remount)', () => {
    const preVerify: AuthState = { kind: 'authenticated', username: 'alice' };
    const postVerify: AuthState = { kind: 'authenticated', username: 'alice', userId: 7 };
    expect(workspaceIdentityKey(preVerify)).toBe(workspaceIdentityKey(postVerify));
  });

  it('separates authenticated from every non-authenticated state', () => {
    const authed: AuthState = { kind: 'authenticated', username: 'alice' };
    const others: AuthState[] = [
      { kind: 'unknown' },
      { kind: 'unauthenticated' },
      { kind: 'authenticating' },
      { kind: 'error', message: 'x' },
    ];
    for (const s of others) {
      expect(workspaceIdentityKey(s)).not.toBe(workspaceIdentityKey(authed));
    }
  });
});
